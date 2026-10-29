import {
  BDT_OFFSET_S,
  EPHEMERIS_MSG_TYPES,
  MSM_HEADER_BITS,
  RANGE_MS_M,
  STATION_MSG_TYPES,
  decodeEphemeris,
  decodeStationArp,
  getbits,
  getbitu,
  msmCellLayout,
  msmInfo,
  resolveTimeOfWeek,
  type Ephemeris,
  type GnssSystem,
  type StationArp,
} from '@rtk/shared';
import type { RtcmFrame } from './rtcm3-framer';

/** One satellite × signal observation from an MSM message. */
export interface MsmCell {
  sys: GnssSystem;
  prn: number;
  /** 1-based signal-mask id (2 = GPS L1 C/A, Galileo E1 C, BeiDou B1I). */
  signalId: number;
  prM: number | null;
  /** Carrier phase expressed as a range, metres. */
  phaseM: number | null;
  cnr: number | null;
  lock: number;
}

export interface MsmMessage {
  sys: GnssSystem;
  level: number;
  stationId: number;
  /** Epoch as absolute GPS seconds (BeiDou epochs are moved from BDT). */
  gps: number;
  /** Multiple-message bit: more MSMs follow for this epoch. */
  more: boolean;
  cells: MsmCell[];
}

export interface StationDescriptors {
  stationId: number;
  antenna: string;
  antennaSerial: string;
  receiver: string;
  firmware: string;
  receiverSerial: string;
}

export interface MsmEpoch {
  gps: number;
  cells: MsmCell[];
}

export type DecodedEvent =
  | { kind: 'station'; arp: StationArp }
  | { kind: 'descriptors'; descriptors: StationDescriptors }
  | { kind: 'ephemeris'; eph: Ephemeris }
  | { kind: 'epoch'; epoch: MsmEpoch };

/** Decodes MSM4–7; returns null for MSM1–3, which carry no full pseudorange. */
export function decodeMsm(payload: Uint8Array, refGps: number): MsmMessage | null {
  const info = msmInfo(getbitu(payload, 0, 12));
  if (!info || info.level < 4) return null;
  const layout = msmCellLayout(info.level);
  const stationId = getbitu(payload, 12, 12);
  const towS = getbitu(payload, 24, 30) / 1000;
  const more = getbitu(payload, 54, 1) === 1;

  let pos = MSM_HEADER_BITS;
  const prns: number[] = [];
  for (let k = 1; k <= 64; k++) if (getbitu(payload, pos++, 1)) prns.push(k);
  const sigs: number[] = [];
  for (let k = 1; k <= 32; k++) if (getbitu(payload, pos++, 1)) sigs.push(k);
  if (prns.length * sigs.length > 64) throw new RangeError('MSM cell mask longer than 64 bits');

  const cellIdx: { sat: number; sig: number }[] = [];
  for (let s = 0; s < prns.length; s++) {
    for (let g = 0; g < sigs.length; g++)
      if (getbitu(payload, pos++, 1)) cellIdx.push({ sat: s, sig: g });
  }

  const read = (bits: number, signed = false) => {
    const v = (signed ? getbits : getbitu)(payload, pos, bits);
    pos += bits;
    return v;
  };
  const nSat = prns.length;
  const nCell = cellIdx.length;
  const roughInt = Array.from({ length: nSat }, () => read(8));
  if (layout.satExtra) for (let k = 0; k < nSat; k++) read(4);
  const roughFrac = Array.from({ length: nSat }, () => read(10));
  if (layout.satExtra) for (let k = 0; k < nSat; k++) read(14, true);
  const rough = roughInt.map((v, k) => (v === 255 ? null : v + roughFrac[k]! / 1024));

  const invalid = (bits: number) => -(2 ** (bits - 1));
  const pr = Array.from({ length: nCell }, () => read(layout.prBits, true));
  const cp = Array.from({ length: nCell }, () => read(layout.cpBits, true));
  const lock = Array.from({ length: nCell }, () => read(layout.lockBits));
  for (let k = 0; k < nCell; k++) read(1);
  const cnr = Array.from({ length: nCell }, () => read(layout.cnrBits));

  const offset = info.sys === 'C' ? BDT_OFFSET_S : 0;
  const gps = resolveTimeOfWeek(towS, refGps - offset) + offset;
  const cells = cellIdx.map(({ sat, sig }, k): MsmCell => {
    const r = rough[sat] ?? null;
    const range = (fine: number, bits: number, scale: number) =>
      r === null || fine === invalid(bits) ? null : (r + fine * scale) * RANGE_MS_M;
    return {
      sys: info.sys,
      prn: prns[sat]!,
      signalId: sigs[sig]!,
      prM: range(pr[k]!, layout.prBits, layout.prScale),
      phaseM: range(cp[k]!, layout.cpBits, layout.cpScale),
      cnr: cnr[k] ? cnr[k]! * layout.cnrScale : null,
      lock: lock[k]!,
    };
  });
  return { sys: info.sys, level: info.level, stationId, gps, more, cells };
}

/** 1033: antenna and receiver descriptors (no coordinates). */
export function decodeDescriptors(payload: Uint8Array): StationDescriptors {
  let pos = 12;
  const stationId = getbitu(payload, pos, 12);
  pos += 12;
  const str = () => {
    const n = getbitu(payload, pos, 8);
    pos += 8;
    let out = '';
    for (let k = 0; k < n; k++, pos += 8) out += String.fromCharCode(getbitu(payload, pos, 8));
    return out.trim();
  };
  const antenna = str();
  pos += 8; // antenna setup id
  const antennaSerial = str();
  const receiver = str();
  const firmware = str();
  const receiverSerial = str();
  return { stationId, antenna, antennaSerial, receiver, firmware, receiverSerial };
}

/**
 * Turns frames into decoded events and assembles MSMs of all systems into one
 * epoch. Receivers differ in whether the multiple-message bit spans systems, so
 * an epoch is closed when the bit is clear and every system seen so far has
 * reported, or when a newer epoch starts.
 */
export class Rtcm3Decoder {
  private pending: { gps: number; cells: MsmCell[]; systems: Set<GnssSystem> } | null = null;
  private knownSystems = new Set<GnssSystem>();

  /** `now` returns the current GPS time, used to resolve week numbers. */
  constructor(private now: () => number) {}

  decode(frame: RtcmFrame): DecodedEvent[] {
    const { type, payload } = frame;
    if ((STATION_MSG_TYPES as readonly number[]).includes(type)) {
      return [{ kind: 'station', arp: decodeStationArp(payload) }];
    }
    if (type === 1033) return [{ kind: 'descriptors', descriptors: decodeDescriptors(payload) }];
    if (EPHEMERIS_MSG_TYPES[type])
      return [{ kind: 'ephemeris', eph: decodeEphemeris(payload, this.now()) }];
    const msm = msmInfo(type) ? decodeMsm(payload, this.now()) : null;
    if (!msm) return [];

    const out: DecodedEvent[] = [];
    if (this.pending && this.pending.gps !== msm.gps) out.push(...this.flush());
    this.pending ??= { gps: msm.gps, cells: [], systems: new Set() };
    this.pending.cells.push(...msm.cells);
    this.pending.systems.add(msm.sys);
    this.knownSystems.add(msm.sys);
    const complete = [...this.knownSystems].every((s) => this.pending!.systems.has(s));
    if (!msm.more && complete) out.push(...this.flush());
    return out;
  }

  flush(): DecodedEvent[] {
    const p = this.pending;
    this.pending = null;
    return p ? [{ kind: 'epoch', epoch: { gps: p.gps, cells: p.cells } }] : [];
  }
}
