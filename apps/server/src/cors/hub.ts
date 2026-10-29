import {
  EPHEMERIS_MAX_AGE_S,
  ecefToGeodetic,
  unixMsToGps,
  type CorsDiagnosis,
  type CorsEpoch,
  type CorsError,
  type CorsState,
  type CorsStation,
  type Ephemeris,
} from '@rtk/shared';
import type { CorsConfig } from '../config';
import { mockFeed } from './mock-feed';
import {
  fetchSourcetable,
  mountsWithEphemeris,
  ntripFeed,
  type Feed,
  type SourcetableEntry,
} from './ntrip';
import { computeResiduals, ephemerisKey } from './residual';
import { Rtcm3Decoder, type DecodedEvent, type StationDescriptors } from './rtcm3-decode';
import { Rtcm3Framer, type RtcmFrame } from './rtcm3-framer';

/** Reconnect delays; RTK2go bans clients that reconnect aggressively. */
export const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000];
const STATE_MIN_INTERVAL_MS = 1000;
const STATE_REFRESH_MS = 5000;
/** A connected stream without MSM for this long is reported as `no-msm`. */
const NO_MSM_AFTER_MS = 10_000;
const SOURCETABLE_REFRESH_MS = 60 * 60 * 1000;
const SUGGESTED_MOUNTS = 20;

export interface CorsHubDeps {
  feed: Feed;
  sourcetable?: () => Promise<SourcetableEntry[]>;
  now?: () => number;
}

/**
 * Owns the single connection to the reference station, shared by every
 * viewer: decodes the stream, keeps the latest station data and a ring of
 * computed epochs, and reconnects with backoff.
 */
export class CorsHub {
  private status: CorsState['status'] = 'connecting';
  private error: CorsError | undefined;
  private station: CorsStation | undefined;
  private descriptors: StationDescriptors | undefined;
  private ephemerides = new Map<string, Ephemeris>();
  private observed = new Map<number, { count: number; firstAt: number; lastAt: number }>();
  private epochs: CorsEpoch[] = [];
  private diagnosis: CorsDiagnosis[] = [];
  private sourcetable: CorsState['sourcetable'];
  private connectedAt = 0;
  private lastMsmAt = 0;
  private attempt = 0;
  private session: { stop(): void } | null = null;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stateTimer: NodeJS.Timeout | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private sourcetableTimer: NodeJS.Timeout | undefined;
  private lastStateAt = 0;
  private lastStateJson = '';
  private stopped = true;
  private stateListeners: ((s: CorsState) => void)[] = [];
  private epochListeners: ((e: CorsEpoch) => void)[] = [];
  private now: () => number;

  constructor(
    private config: CorsConfig,
    private deps: CorsHubDeps,
  ) {
    this.now = deps.now ?? Date.now;
  }

  onState(listener: (s: CorsState) => void) {
    this.stateListeners.push(listener);
  }

  onEpoch(listener: (e: CorsEpoch) => void) {
    this.epochListeners.push(listener);
  }

  get history(): CorsEpoch[] {
    return this.epochs;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.refreshTimer = setInterval(() => this.publishState(), STATE_REFRESH_MS);
    if (this.deps.sourcetable) {
      void this.refreshSourcetable();
      this.sourcetableTimer = setInterval(
        () => void this.refreshSourcetable(),
        SOURCETABLE_REFRESH_MS,
      );
    }
  }

  shutdown() {
    this.stopped = true;
    for (const t of [this.reconnectTimer, this.stateTimer]) clearTimeout(t);
    for (const t of [this.refreshTimer, this.sourcetableTimer]) clearInterval(t);
    this.session?.stop();
    this.session = null;
  }

  get state(): CorsState {
    const nowGps = unixMsToGps(this.now());
    const ephemerisCount: CorsState['ephemerisCount'] = {};
    for (const eph of this.ephemerides.values()) {
      if (Math.abs(nowGps - eph.toe) <= EPHEMERIS_MAX_AGE_S[eph.sys]) {
        ephemerisCount[eph.sys] = (ephemerisCount[eph.sys] ?? 0) + 1;
      }
    }
    const diagnosis = [...this.diagnosis];
    const silentSince = this.lastMsmAt || this.connectedAt;
    if (this.status === 'connected' && this.now() - silentSince > NO_MSM_AFTER_MS)
      diagnosis.push('no-msm');
    return {
      status: this.status,
      mock: this.config.mock !== false,
      host: this.config.host,
      port: this.config.port,
      mountpoint: this.config.mountpoint,
      station: this.station,
      observedMsgTypes: [...this.observed]
        .map(([msgType, o]) => ({ msgType, ...o }))
        .sort((a, b) => a.msgType - b.msgType),
      ephemerisCount,
      sourcetable: this.sourcetable,
      diagnosis,
      error: this.error,
    };
  }

  private connect() {
    const framer = new Rtcm3Framer();
    const decoder = new Rtcm3Decoder(() => unixMsToGps(this.now()));
    this.status = this.attempt === 0 ? 'connecting' : 'reconnecting';
    this.publishState();
    this.session = this.deps.feed.start({
      onConnected: () => {
        this.status = 'connected';
        this.error = undefined;
        this.connectedAt = this.now();
        this.lastMsmAt = 0;
        this.publishState();
      },
      onData: (chunk) => {
        const frames = framer.push(chunk);
        if (frames.length) this.attempt = 0;
        for (const f of frames) this.handleFrame(f, decoder);
        this.publishState();
      },
      onError: (error) => {
        this.error = error;
      },
      onClose: () => {
        this.session = null;
        for (const ev of decoder.flush()) this.handleEvent(ev);
        if (this.stopped) return;
        const fatal = this.error === 'auth-failed' || this.error === 'mountpoint-not-found';
        this.status = fatal ? 'error' : 'reconnecting';
        const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
        this.attempt++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
        this.publishState();
      },
    });
  }

  private handleFrame(frame: RtcmFrame, decoder: Rtcm3Decoder) {
    const at = this.now();
    const o = this.observed.get(frame.type);
    if (o) {
      o.count++;
      o.lastAt = at;
    } else {
      this.observed.set(frame.type, { count: 1, firstAt: at, lastAt: at });
    }
    let events: DecodedEvent[];
    try {
      events = decoder.decode(frame);
    } catch {
      // A malformed message is dropped; the stream keeps going.
      return;
    }
    for (const ev of events) this.handleEvent(ev);
  }

  private handleEvent(ev: DecodedEvent) {
    switch (ev.kind) {
      case 'station': {
        // 1032 is the physical station of a network; 1005/1006 wins when both arrive.
        if (ev.arp.msgType === 1032 && this.station && this.station.msgType !== 1032) return;
        this.station = {
          ecef: ev.arp.ecef,
          ...ecefToGeodetic(ev.arp.ecef),
          antennaHeightM: ev.arp.antennaHeightM,
          msgType: ev.arp.msgType,
          stationId: ev.arp.stationId,
          ...this.descriptorFields(),
          at: this.now(),
        };
        break;
      }
      case 'descriptors':
        this.descriptors = ev.descriptors;
        if (this.station) this.station = { ...this.station, ...this.descriptorFields() };
        break;
      case 'ephemeris': {
        const key = ephemerisKey(ev.eph.sys, ev.eph.prn);
        const prev = this.ephemerides.get(key);
        if (!prev || ev.eph.toe >= prev.toe) this.ephemerides.set(key, ev.eph);
        break;
      }
      case 'epoch': {
        this.lastMsmAt = this.now();
        const result = computeResiduals(
          ev.epoch,
          this.station?.ecef ?? null,
          this.ephemerides,
          this.config.minElevationDeg,
        );
        this.diagnosis = result.diagnosis;
        if (!result.epoch) break;
        this.epochs.push(result.epoch);
        if (this.epochs.length > this.config.historyEpochs) {
          this.epochs.splice(0, this.epochs.length - this.config.historyEpochs);
        }
        for (const l of this.epochListeners) l(result.epoch);
        break;
      }
    }
  }

  private descriptorFields() {
    const d = this.descriptors;
    return d ? { antenna: d.antenna, receiver: d.receiver, firmware: d.firmware } : {};
  }

  private async refreshSourcetable() {
    try {
      const entries = await this.deps.sourcetable!();
      const own = entries.find((e) => e.mountpoint === this.config.mountpoint);
      const near = this.station ?? (own && Number.isFinite(own.lat) ? own : undefined);
      this.sourcetable = {
        advertised: own?.formatDetails ?? null,
        withEphemeris: mountsWithEphemeris(entries, near).slice(0, SUGGESTED_MOUNTS),
      };
      this.publishState();
    } catch {
      // Keep the previous table; the next refresh retries.
    }
  }

  /** Sends the state when it changed, at most once per second. */
  private publishState() {
    if (this.stopped || this.stateTimer) return;
    const wait = this.lastStateAt + STATE_MIN_INTERVAL_MS - this.now();
    if (wait > 0) {
      this.stateTimer = setTimeout(() => {
        this.stateTimer = undefined;
        this.publishState();
      }, wait);
      return;
    }
    const state = this.state;
    const json = JSON.stringify(state);
    if (json === this.lastStateJson) return;
    this.lastStateJson = json;
    this.lastStateAt = this.now();
    for (const l of this.stateListeners) l(state);
  }
}

export function createCorsHub(config: CorsConfig) {
  if (config.mock) {
    return new CorsHub(config, {
      feed: mockFeed({
        ephemeris: config.mock !== 'no-ephemeris',
        station: config.mock !== 'no-station',
      }),
    });
  }
  const ntrip = {
    host: config.host,
    port: config.port,
    mountpoint: config.mountpoint,
    user: config.user,
    pass: config.pass,
    v2: config.ntripV2,
  };
  return new CorsHub(config, {
    feed: ntripFeed(ntrip),
    sourcetable: () => fetchSourcetable(ntrip),
  });
}
