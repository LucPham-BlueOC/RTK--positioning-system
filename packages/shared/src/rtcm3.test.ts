import { describe, expect, it } from 'vitest';
import type { Ephemeris } from './orbit';
import {
  BitWriter,
  crc24q,
  decodeEphemeris,
  decodeStationArp,
  encodeEphemeris,
  encodeFrame,
  encodeStationArp,
  getbits,
  getbitu,
  messageType,
  msmInfo,
} from './rtcm3';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

/** The 1005 example from RTCM 10403, also parsed by pyrtcm as station 2003. */
const SAMPLE_1005 = hex('D300133ED7D30202980EDEEF34B4BD62AC0941986F33360B98');

describe('transport', () => {
  it('matches the CRC-24Q of the standard 1005 example', () => {
    const crc = crc24q(SAMPLE_1005, 0, SAMPLE_1005.length - 3);
    expect(crc).toBe(0x360b98);
    expect(crc24q(SAMPLE_1005)).toBe(0);
  });

  it('rebuilds the same frame from its payload', () => {
    expect(encodeFrame(SAMPLE_1005.slice(3, -3))).toEqual(SAMPLE_1005);
  });
});

describe('bit fields', () => {
  it('reads signed and unsigned fields wider than 32 bits', () => {
    const w = new BitWriter()
      .put(-1, 38)
      .put(2 ** 37 - 1, 38)
      .put(5, 3);
    const buf = w.finish();
    expect(getbits(buf, 0, 38)).toBe(-1);
    expect(getbitu(buf, 38, 38)).toBe(2 ** 37 - 1);
    expect(getbitu(buf, 76, 3)).toBe(5);
  });

  it('refuses values that do not fit', () => {
    expect(() => new BitWriter().put(16, 4)).toThrow(RangeError);
    expect(() => new BitWriter().put(-9, 4)).toThrow(RangeError);
  });
});

describe('station position', () => {
  it('decodes the standard 1005 example', () => {
    const arp = decodeStationArp(SAMPLE_1005.slice(3, -3));
    expect(arp).toMatchObject({ msgType: 1005, stationId: 2003, antennaHeightM: null });
    expect(arp.ecef.x).toBeCloseTo(1114104.5999, 4);
    expect(arp.ecef.y).toBeCloseTo(-4850729.7108, 4);
    expect(arp.ecef.z).toBeCloseTo(3975521.4643, 4);
  });

  it('round-trips 1006 with antenna height and 1032', () => {
    for (const msgType of [1006, 1032] as const) {
      const arp = {
        msgType,
        stationId: 77,
        ecef: { x: -1918634.1234, y: 5921239.5678, z: 1184004.9012 },
        antennaHeightM: msgType === 1006 ? 1.5432 : null,
      };
      const payload = encodeStationArp(arp);
      expect(payload.length).toBe(msgType === 1006 ? 21 : 20);
      const back = decodeStationArp(payload);
      expect(back.msgType).toBe(msgType);
      expect(back.antennaHeightM ?? 0).toBeCloseTo(arp.antennaHeightM ?? 0, 4);
      expect(back.ecef.x).toBeCloseTo(arp.ecef.x, 4);
      expect(back.ecef.z).toBeCloseTo(arp.ecef.z, 4);
    }
  });
});

const EPH: Omit<Ephemeris, 'sys' | 'prn'> = {
  toe: 2442 * 604800 + 7200,
  toc: 2442 * 604800 + 7200,
  toes: 7200,
  sqrtA: 5153.642004013,
  e: 0.004046165966429,
  i0: 0.9730457935259,
  omega0: 0.9375825892554,
  omega: -2.905948629888,
  m0: 2.128334431226,
  deltaN: 4.630907181586e-9,
  iDot: 3.889447725395e-10,
  omegaDot: -8.169268854267e-9,
  cuc: 2.164393663406e-6,
  cus: 5.604699254036e-6,
  crc: 279.53125,
  crs: 41.28125,
  cic: -5.40167093277e-8,
  cis: 1.490116119385e-8,
  af0: 6.507523357868e-5,
  af1: -1.136868377216e-13,
  af2: 0,
  tgd: -1.1641532182693e-8,
  iode: 42,
  health: 0,
};

describe('ephemeris messages', () => {
  const cases: [Ephemeris, number, number][] = [
    [{ ...EPH, sys: 'G', prn: 4 }, 1019, 61],
    [{ ...EPH, sys: 'E', prn: 11, toes: 7200, health: 1 }, 1046, 63],
    // BeiDou toe is a BDT time of week: 7200 s BDT is GPST + 14 s.
    [
      { ...EPH, sys: 'C', prn: 4, toe: EPH.toe + 14, toc: EPH.toc + 14, iode: 17, health: 1 },
      1042,
      64,
    ],
  ];

  for (const [eph, type, bytes] of cases) {
    it(`round-trips ${type} (${bytes} bytes)`, () => {
      const payload = encodeEphemeris(eph);
      expect(messageType(payload)).toBe(type);
      expect(payload.length).toBe(bytes);
      const back = decodeEphemeris(payload, eph.toe + 3000);
      expect(back).toMatchObject({
        sys: eph.sys,
        prn: eph.prn,
        toe: eph.toe,
        toc: eph.toc,
        iode: eph.iode,
        health: eph.health,
      });
      for (const k of ['sqrtA', 'e', 'i0', 'omega0', 'omega', 'm0', 'crc', 'crs'] as const) {
        expect(Math.abs(back[k] - eph[k])).toBeLessThan(Math.abs(eph[k]) * 1e-6 + 1e-6);
      }
      expect(back.af0).toBeCloseTo(eph.af0, 9);
      expect(back.tgd).toBeCloseTo(eph.tgd, 9);
    });
  }

  it('resolves the 10-bit GPS week from the current time', () => {
    const back = decodeEphemeris(encodeEphemeris({ ...EPH, sys: 'G', prn: 4 }), EPH.toe - 86400);
    expect(back.toe).toBe(EPH.toe);
  });
});

describe('msmInfo', () => {
  it('recognises MSM numbers of the three systems only', () => {
    expect(msmInfo(1077)).toEqual({ sys: 'G', level: 7 });
    expect(msmInfo(1094)).toEqual({ sys: 'E', level: 4 });
    expect(msmInfo(1124)).toEqual({ sys: 'C', level: 4 });
    expect(msmInfo(1087)).toBeNull();
    expect(msmInfo(1005)).toBeNull();
  });
});
