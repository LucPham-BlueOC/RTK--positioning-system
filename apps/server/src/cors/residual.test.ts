import {
  MOCK_CLOCK_BIAS_M,
  corsMockFeed,
  gpsToUnixMs,
  isBdsGeo,
  mockInjectedErrorM,
  type Ephemeris,
  type GnssSystem,
} from '@rtk/shared';
import { describe, expect, it } from 'vitest';
import { computeResiduals, ephemerisKey } from './residual';
import { Rtcm3Decoder, type MsmEpoch } from './rtcm3-decode';
import { Rtcm3Framer } from './rtcm3-framer';

const T0 = 2442 * 604800 + 7200;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Runs the mock stream through framer and decoder, as the hub does. */
function decodeMock(gps: number, opts: Parameters<typeof corsMockFeed>[0] = {}) {
  const mock = corsMockFeed(opts);
  const framer = new Rtcm3Framer();
  const decoder = new Rtcm3Decoder(() => gps);
  const ephs = new Map<string, Ephemeris>();
  let epoch: MsmEpoch | undefined;
  for (const f of mock.frames(gps)) {
    for (const fr of framer.push(f)) {
      for (const ev of decoder.decode(fr)) {
        if (ev.kind === 'ephemeris') ephs.set(ephemerisKey(ev.eph.sys, ev.eph.prn), ev.eph);
        if (ev.kind === 'epoch') epoch = ev.epoch;
      }
    }
  }
  return { mock, ephs, epoch: epoch! };
}

describe('computeResiduals', () => {
  for (const gps of [T0 + 17, T0 + 1811, T0 + 3 * 3600 + 905]) {
    it(`recovers the injected error within 1 cm at t0+${gps - T0}s, BeiDou GEO included`, () => {
      const { mock, ephs, epoch } = decodeMock(gps);
      const { epoch: out, diagnosis } = computeResiduals(epoch, mock.station, ephs, 10);
      expect(diagnosis).toEqual([]);
      expect(out!.at).toBe(gpsToUnixMs(gps));
      expect(out!.skipped).toEqual([]);
      const truth = mock.ephemerides(gps);
      expect(out!.sats).toHaveLength(truth.length);
      expect(out!.sats.some((s) => s.sys === 'C' && isBdsGeo(s.prn))).toBe(true);

      for (const sys of ['G', 'E', 'C'] as GnssSystem[]) {
        const inj = truth
          .filter((e) => e.sys === sys)
          .map((e) => mockInjectedErrorM(sys, e.prn, gps));
        const med = median(inj);
        expect(Math.abs(out!.clockBiasM[sys]! - (MOCK_CLOCK_BIAS_M[sys] + med))).toBeLessThan(0.01);
        for (const s of out!.sats.filter((x) => x.sys === sys)) {
          const expected = mockInjectedErrorM(sys, s.prn, gps) - med;
          expect(Math.abs(s.residualM - expected)).toBeLessThan(0.01);
          expect(s.elevationDeg).toBeGreaterThan(15);
          expect(s.cn0).toBe(45);
        }
      }
      expect(out!.rmsM).toBeGreaterThan(0);
      expect(out!.maxAbsM).toBeGreaterThanOrEqual(out!.rmsM);
    });
  }

  it('also works on MSM4 within its 1.8 cm pseudorange resolution', () => {
    const { mock, ephs, epoch } = decodeMock(T0 + 30, { msmLevel: 4 });
    const { epoch: out } = computeResiduals(epoch, mock.station, ephs, 10);
    const truth = mock.ephemerides(T0 + 30);
    for (const sys of ['G', 'E', 'C'] as GnssSystem[]) {
      const med = median(
        truth.filter((e) => e.sys === sys).map((e) => mockInjectedErrorM(sys, e.prn, T0 + 30)),
      );
      for (const s of out!.sats.filter((x) => x.sys === sys)) {
        expect(
          Math.abs(s.residualM - (mockInjectedErrorM(sys, s.prn, T0 + 30) - med)),
        ).toBeLessThan(0.025);
      }
    }
  });

  it('needs the station position', () => {
    const { ephs, epoch } = decodeMock(T0 + 1);
    expect(computeResiduals(epoch, null, ephs, 10)).toEqual({
      epoch: null,
      diagnosis: ['no-station-position'],
    });
  });

  it('needs at least one ephemeris', () => {
    const { mock, epoch } = decodeMock(T0 + 1, { ephemeris: false });
    expect(computeResiduals(epoch, mock.station, new Map(), 10)).toEqual({
      epoch: null,
      diagnosis: ['no-ephemeris'],
    });
  });

  it('ignores stale ephemerides', () => {
    const { mock, ephs } = decodeMock(T0 + 1);
    const later = decodeMock(T0 + 5 * 3600);
    const out = computeResiduals(later.epoch, mock.station, ephs, 10);
    expect(out.diagnosis).toEqual(['no-ephemeris']);
  });

  it('skips a system with fewer than four satellites and low or unhealthy satellites', () => {
    const { mock, ephs, epoch } = decodeMock(T0 + 1);
    const gal = [...ephs.values()].filter((e) => e.sys === 'E');
    for (const e of gal.slice(0, gal.length - 3)) ephs.delete(ephemerisKey('E', e.prn));
    const gps = [...ephs.values()].find((e) => e.sys === 'G')!;
    ephs.set(ephemerisKey('G', gps.prn), { ...gps, health: 1 });
    const { epoch: out, diagnosis } = computeResiduals(epoch, mock.station, ephs, 80);
    expect(diagnosis).toContain('too-few-sats');
    expect(out!.clockBiasM.E).toBeUndefined();
    expect(out!.skipped).toContainEqual({ sys: 'G', prn: gps.prn, reason: 'unhealthy' });
    expect(out!.skipped.some((s) => s.reason === 'low-elevation')).toBe(true);
    expect(out!.sats.every((s) => s.sys !== 'E')).toBe(true);
  });
});
