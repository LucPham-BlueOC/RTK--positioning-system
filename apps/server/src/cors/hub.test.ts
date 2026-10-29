import { corsMockFeed, gpsToUnixMs, type CorsEpoch, type CorsState } from '@rtk/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCorsConfig, type CorsConfig } from '../config';
import { BACKOFF_MS, CorsHub } from './hub';
import { mockFeed } from './mock-feed';
import type { Feed, FeedHandlers } from './ntrip';

const T0 = 2442 * 604800 + 7200;
const config = (over: Partial<CorsConfig> = {}): CorsConfig => ({
  ...loadCorsConfig({ CORS_NTRIP_HOST: 'caster.test', CORS_NTRIP_MOUNTPOINT: 'MP' }),
  ...over,
});

/** A feed the test drives by hand. */
function manualFeed() {
  const sessions: FeedHandlers[] = [];
  const feed: Feed = {
    start(h) {
      sessions.push(h);
      return { stop: () => h.onClose() };
    },
  };
  return { feed, sessions, last: () => sessions[sessions.length - 1]! };
}

function watch(hub: CorsHub) {
  const states: CorsState[] = [];
  const epochs: CorsEpoch[] = [];
  hub.onState((s) => states.push(s));
  hub.onEpoch((e) => epochs.push(e));
  return { states, epochs };
}

beforeEach(() => {
  vi.useFakeTimers({ now: gpsToUnixMs(T0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('CorsHub', () => {
  it('connects, computes epochs, and reconnects with growing backoff', async () => {
    const m = manualFeed();
    const hub = new CorsHub(config(), { feed: m.feed });
    const { states, epochs } = watch(hub);
    hub.start();
    expect(hub.state.status).toBe('connecting');

    const mock = corsMockFeed();
    m.last().onConnected();
    for (let k = 0; k < 3; k++) {
      for (const f of mock.frames(T0 + k)) m.last().onData(f);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(hub.state.status).toBe('connected');
    expect(epochs.length).toBeGreaterThanOrEqual(2);
    expect(hub.state.station?.stationId).toBe(2001);
    expect(hub.state.ephemerisCount.G).toBeGreaterThanOrEqual(5);
    expect(hub.state.observedMsgTypes.map((o) => o.msgType)).toContain(1077);
    expect(hub.state.diagnosis).toEqual([]);
    expect(states.at(-1)?.status).toBe('connected');

    // Stream dies twice in a row: 5 s, then 10 s.
    m.last().onError('stream-timeout');
    m.last().onClose();
    expect(hub.state).toMatchObject({ status: 'reconnecting', error: 'stream-timeout' });
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]! - 1);
    expect(m.sessions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(m.sessions).toHaveLength(2);
    m.last().onError('connect-failed');
    m.last().onClose();
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[1]! - 1);
    expect(m.sessions).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(m.sessions).toHaveLength(3);

    // A valid frame resets the backoff.
    m.last().onConnected();
    for (const f of mock.frames(T0 + 30)) m.last().onData(f);
    expect(hub.state.status).toBe('connected');
    expect(hub.state.error).toBeUndefined();
    m.last().onClose();
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]!);
    expect(m.sessions).toHaveLength(4);
    hub.shutdown();
  });

  it('caps the delay at 5 minutes and marks credential errors', async () => {
    const m = manualFeed();
    const hub = new CorsHub(config(), { feed: m.feed });
    hub.start();
    for (let k = 0; k < BACKOFF_MS.length + 2; k++) {
      m.last().onError('auth-failed');
      m.last().onClose();
      expect(hub.state.status).toBe('error');
      await vi.advanceTimersByTimeAsync(BACKOFF_MS[Math.min(k, BACKOFF_MS.length - 1)]!);
      expect(m.sessions).toHaveLength(k + 2);
    }
    expect(BACKOFF_MS.at(-1)).toBe(300_000);
    hub.shutdown();
  });

  it('keeps only the configured number of epochs', async () => {
    const hub = new CorsHub(config({ historyEpochs: 3 }), { feed: mockFeed({}) });
    hub.start();
    await vi.advanceTimersByTimeAsync(6000);
    expect(hub.history).toHaveLength(3);
    expect(hub.history[2]!.at - hub.history[0]!.at).toBe(2000);
    hub.shutdown();
  });

  it('reports a station without ephemeris, and one without position', async () => {
    for (const [opts, diag] of [
      [{ ephemeris: false }, 'no-ephemeris'],
      [{ station: false }, 'no-station-position'],
    ] as const) {
      const hub = new CorsHub(config(), { feed: mockFeed(opts) });
      const { epochs } = watch(hub);
      hub.start();
      await vi.advanceTimersByTimeAsync(3000);
      expect(hub.state.diagnosis).toEqual([diag]);
      expect(epochs).toEqual([]);
      hub.shutdown();
    }
  });

  it('reports a connected stream without MSM', async () => {
    const m = manualFeed();
    const hub = new CorsHub(config(), { feed: m.feed });
    hub.start();
    m.last().onConnected();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(hub.state.diagnosis).toEqual(['no-msm']);
    hub.shutdown();
  });

  it('suggests mountpoints with ephemeris from the sourcetable', async () => {
    const m = manualFeed();
    const hub = new CorsHub(config(), {
      feed: m.feed,
      sourcetable: async () => [
        {
          mountpoint: 'MP',
          identifier: '',
          format: 'RTCM 3.2',
          formatDetails: '1005(10),1077(1)',
          lat: 10.7,
          lon: 106.6,
        },
        {
          mountpoint: 'EPH',
          identifier: '',
          format: 'RTCM 3.2',
          formatDetails: '1006(10),1019(30)',
          lat: 10.8,
          lon: 106.7,
        },
      ],
    });
    hub.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hub.state.sourcetable).toEqual({
      advertised: '1005(10),1077(1)',
      withEphemeris: [
        { mountpoint: 'EPH', lat: 10.8, lon: 106.7, formatDetails: '1006(10),1019(30)' },
      ],
    });
    hub.shutdown();
  });

  it('never exposes the password', () => {
    const hub = new CorsHub(config({ pass: 'secret-pass' }), { feed: manualFeed().feed });
    expect(JSON.stringify(hub.state)).not.toContain('secret-pass');
  });
});
