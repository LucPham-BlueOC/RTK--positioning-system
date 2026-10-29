import { describe, expect, it } from 'vitest';
import {
  EPHEMERIS_MAX_AGE_S,
  gpsToUnixMs,
  isBdsGeo,
  keplerSatPos,
  resolveTimeOfWeek,
  resolveWeek,
  satClockBias,
  unixMsToGps,
  type Ephemeris,
} from './orbit';

/**
 * Broadcast ephemerides from the IGS merged navigation file
 * BRDC00WRD_S_20262980000_01D_MN.rnx (BKG), with satellite position and clock
 * 900 s after toe computed independently by cssrlib `eph2pos` (RTKLIB algorithm).
 * The reference clock excludes the group delay.
 */
type Ref = Omit<Ephemeris, 'tgd' | 'health'> & {
  t: number;
  pos: [number, number, number];
  dts: number;
};

// prettier-ignore
const REFERENCE: Ref[] = [
  {
    sys: 'G', prn: 4, toe: 1476928800, toc: 1476928800, toes: 7200,
    sqrtA: 5153.642004013, e: 0.004046165966429, i0: 0.9730457935259, omega0: 0.9375825892554,
    omega: -2.905948629888, m0: 2.128334431226, deltaN: 4.630907181586e-9, iDot: 3.889447725395e-10,
    omegaDot: -8.169268854267e-9, cuc: 2.164393663406e-6, cus: 5.604699254036e-6, crc: 279.53125,
    crs: 41.28125, cic: -5.40167093277e-8, cis: 1.490116119385e-8, af0: 6.507523357868e-5,
    af1: -1.136868377216e-13, af2: 0, iode: 42,
    t: 1476929700, pos: [23127895.842594307, -1156556.772813171, -13147124.289255077], dts: 6.506799754731842e-5,
  },
  {
    sys: 'E', prn: 11, toe: 1476921000, toc: 1476921000, toes: 604200,
    sqrtA: 5440.611223221, e: 0.0001091154990718, i0: 0.9936765299074, omega0: -0.84060840644,
    omega: 0.6401753009337, m0: -1.469573268117, deltaN: 2.615108929784e-9, iDot: -6.789568527068e-10,
    omegaDot: -5.554874239952e-9, cuc: -9.909272193909e-6, cus: 7.893890142441e-6, crc: 188.21875,
    crs: -210.6875, cic: 6.146728992462e-8, cis: 5.587935447693e-9, af0: 0.005867698695511,
    af1: 1.774935753929e-11, af2: -3.469446951954e-18, iode: 118,
    t: 1476921900, pos: [3521571.932262499, -24441865.05185797, -16319990.38655713], dts: 0.005867714924928618,
  },
  {
    sys: 'C', prn: 35, toe: 1476921614, toc: 1476921614, toes: 0,
    sqrtA: 5282.6127491, e: 0.0007731129880995, i0: 0.9415526812085, omega0: -1.70975586496,
    omega: 0.7382730077598, m0: -0.2800292595884, deltaN: 4.808057417748e-9, iDot: -2.296524230881e-10,
    omegaDot: -7.751751462992e-9, cuc: -1.554377377033e-6, cus: -7.138587534428e-7, crc: 362.4375,
    crs: -31.515625, cic: -4.377216100693e-8, cis: 6.519258022308e-9, af0: -0.0006127840606496,
    af1: -1.652278314168e-11, af2: 0, iode: 1,
    t: 1476922514, pos: [4065452.467538459, -24666697.75267571, 12352678.36637735], dts: -0.0006127986451982549,
  },
  {
    sys: 'C', prn: 4, toe: 1476921614, toc: 1476921614, toes: 0,
    sqrtA: 6493.470285416, e: 0.0004321498563513, i0: 0.07612943322218, omega0: 2.572848033448,
    omega: -0.9244539601095, m0: 1.142034384853, deltaN: 3.739084319299e-9, iDot: -5.668093241692e-10,
    omegaDot: -2.85904766224e-9, cuc: -1.594983041286e-5, cus: 2.148328348994e-5, crc: -650.84375,
    crs: -485.984375, cic: -4.842877388e-8, cis: -2.840533852577e-8, af0: -8.913921192288e-7,
    af1: 2.30926389122e-14, af2: 0, iode: 1,
    t: 1476922514, pos: [-39584582.52097485, 14374427.027551837, 1929658.838241908], dts: -8.925369341979504e-7,
  },
];

describe('keplerSatPos and satClockBias against cssrlib', () => {
  for (const ref of REFERENCE) {
    it(`${ref.sys}${String(ref.prn).padStart(2, '0')}${ref.sys === 'C' && isBdsGeo(ref.prn) ? ' (GEO)' : ''} within 1 m and 1 ns`, () => {
      const eph: Ephemeris = { ...ref, tgd: 0, health: 0 };
      const p = keplerSatPos(eph, ref.t);
      expect(Math.hypot(p.x - ref.pos[0], p.y - ref.pos[1], p.z - ref.pos[2])).toBeLessThan(1);
      expect(Math.abs(satClockBias(eph, ref.t) - ref.dts)).toBeLessThan(1e-9);
    });
  }

  it('subtracts the group delay', () => {
    const eph: Ephemeris = { ...REFERENCE[0]!, tgd: 5e-9, health: 0 };
    expect(satClockBias(eph, REFERENCE[0]!.t)).toBeCloseTo(REFERENCE[0]!.dts - 5e-9, 13);
  });

  it('keeps BeiDou ephemerides shorter-lived', () => {
    expect(EPHEMERIS_MAX_AGE_S.C).toBeLessThan(EPHEMERIS_MAX_AGE_S.G);
  });
});

describe('time helpers', () => {
  it('converts GPS seconds to Unix time with the leap seconds', () => {
    // 2026-10-25 02:00:00 GPST = 2026-10-25 01:59:42 UTC.
    expect(new Date(gpsToUnixMs(1476928800)).toISOString()).toBe('2026-10-25T01:59:42.000Z');
    expect(unixMsToGps(gpsToUnixMs(1476928800.5))).toBeCloseTo(1476928800.5, 6);
  });

  it('places a time of week in the nearest week', () => {
    const ref = 2442 * 604800 + 10;
    expect(resolveTimeOfWeek(5, ref)).toBe(2442 * 604800 + 5);
    expect(resolveTimeOfWeek(604795, ref)).toBe(2441 * 604800 + 604795);
    expect(resolveTimeOfWeek(20, 2442 * 604800 - 30)).toBe(2443 * 604800 - 604800 + 20);
  });

  it('resolves truncated week counters', () => {
    expect(resolveWeek(2442 % 1024, 1024, 0, 2442)).toBe(2442);
    expect(resolveWeek(1086, 8192, 1356, 2442)).toBe(2442);
    expect(resolveWeek(1418, 4096, 1024, 2442)).toBe(2442);
  });
});
