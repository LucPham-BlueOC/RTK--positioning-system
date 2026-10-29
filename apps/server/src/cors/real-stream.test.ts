import { readFileSync } from 'node:fs';
import { keplerSatPos, satClockBias, type Ephemeris, type GnssSystem } from '@rtk/shared';
import { describe, expect, it } from 'vitest';
import { computeResiduals, ephemerisKey } from './residual';
import { Rtcm3Decoder, decodeMsm, type DecodedEvent, type MsmEpoch } from './rtcm3-decode';
import { Rtcm3Framer } from './rtcm3-framer';

/**
 * Two minutes recorded from a real base (see test/fixtures/README.md), with
 * expected values produced by pyrtcm (decoding) and cssrlib (orbits).
 */
const FIXTURE = new URL('../../test/fixtures/1CEN.rtcm3', import.meta.url);
const stream = new Uint8Array(readFileSync(FIXTURE));
const expected = JSON.parse(
  readFileSync(new URL('../../test/fixtures/1CEN.expected.json', import.meta.url), 'utf8'),
) as {
  recordedGps: number;
  station: { msgType: number; stationId: number; x: number; y: number; z: number };
  ephemerides: {
    sys: GnssSystem;
    prn: number;
    toe: number;
    iode: number;
    sqrtA: number;
    e: number;
    m0: number;
    af0: number;
    t: number;
    pos: [number, number, number];
    dts: number;
  }[];
  msm: {
    msgType: number;
    sys: GnssSystem;
    towMs: number;
    cells: { prn: number; sig: string; prM: number | null }[];
  }[];
};

function decodeStream() {
  const framer = new Rtcm3Framer();
  const decoder = new Rtcm3Decoder(() => expected.recordedGps);
  const frames = framer.push(stream);
  const events: DecodedEvent[] = frames.flatMap((f) => decoder.decode(f));
  events.push(...decoder.flush());
  return { frames, events, crcErrors: framer.crcErrors };
}

const { frames, events, crcErrors } = decodeStream();
const ephemerides = new Map<string, Ephemeris>();
for (const e of events)
  if (e.kind === 'ephemeris') ephemerides.set(ephemerisKey(e.eph.sys, e.eph.prn), e.eph);
const epochs = events.flatMap((e): MsmEpoch[] => (e.kind === 'epoch' ? [e.epoch] : []));

describe('recorded stream against pyrtcm', () => {
  it('frames every message without CRC errors', () => {
    expect(crcErrors).toBe(0);
    expect(frames.length).toBeGreaterThan(300);
  });

  it('decodes the antenna position to the 0.1 mm', () => {
    const st = events.find((e) => e.kind === 'station');
    expect(st?.kind === 'station' && st.arp.msgType).toBe(expected.station.msgType);
    if (st?.kind !== 'station') return;
    expect(st.arp.stationId).toBe(expected.station.stationId);
    expect(Math.abs(st.arp.ecef.x - expected.station.x)).toBeLessThan(1e-4);
    expect(Math.abs(st.arp.ecef.y - expected.station.y)).toBeLessThan(1e-4);
    expect(Math.abs(st.arp.ecef.z - expected.station.z)).toBeLessThan(1e-4);
  });

  it('decodes every ephemeris field the same way', () => {
    expect(ephemerides.size).toBe(expected.ephemerides.length);
    for (const x of expected.ephemerides) {
      const eph = ephemerides.get(ephemerisKey(x.sys, x.prn))!;
      expect(eph, `${x.sys}${x.prn}`).toBeDefined();
      expect(eph.toe).toBe(x.toe);
      expect(eph.iode).toBe(x.iode);
      expect(eph.sqrtA).toBeCloseTo(x.sqrtA, 9);
      expect(eph.e).toBeCloseTo(x.e, 12);
      expect(eph.m0).toBeCloseTo(x.m0, 12);
      expect(eph.af0).toBeCloseTo(x.af0, 15);
    }
  });

  it('puts every satellite within 1 m and 1 ns of cssrlib', () => {
    for (const x of expected.ephemerides) {
      const eph = { ...ephemerides.get(ephemerisKey(x.sys, x.prn))!, tgd: 0 };
      const p = keplerSatPos(eph, x.t);
      expect(
        Math.hypot(p.x - x.pos[0], p.y - x.pos[1], p.z - x.pos[2]),
        `${x.sys}${x.prn}`,
      ).toBeLessThan(1);
      expect(Math.abs(satClockBias(eph, x.t) - x.dts)).toBeLessThan(1e-9);
    }
  });

  it('decodes MSM pseudoranges to the millimetre', () => {
    const msms = frames
      .filter((f) => [1077, 1097, 1127].includes(f.type))
      .slice(0, expected.msm.length);
    expect(msms.map((f) => f.type)).toEqual(expected.msm.map((m) => m.msgType));
    msms.forEach((f, k) => {
      const exp = expected.msm[k]!;
      const msg = decodeMsm(f.payload, expected.recordedGps)!;
      expect(msg.cells).toHaveLength(exp.cells.length);
      exp.cells.forEach((c, i) => {
        const got = msg.cells[i]!;
        expect(got.prn).toBe(c.prn);
        if (c.prM === null) expect(got.prM).toBeNull();
        else expect(Math.abs(got.prM! - c.prM)).toBeLessThan(1e-3);
      });
    });
  });
});

describe('residual engine on the recorded stream', () => {
  it('gives plausible errors for every usable satellite in every epoch', () => {
    const st = events.find((e) => e.kind === 'station');
    const station = st?.kind === 'station' ? st.arp.ecef : null;
    // Start once ephemerides of all three systems have arrived.
    const results = epochs.slice(-60).map((e) => computeResiduals(e, station, ephemerides, 10));
    for (const r of results) {
      expect(r.epoch).not.toBeNull();
      expect(r.epoch!.sats.length).toBeGreaterThan(12);
      for (const s of r.epoch!.sats)
        expect(Math.abs(s.residualM), `${s.sys}${s.prn}`).toBeLessThan(30);
      expect(r.epoch!.rmsM).toBeLessThan(10);
    }
    const systems = new Set(results.flatMap((r) => r.epoch!.sats.map((s) => s.sys)));
    expect([...systems].sort()).toEqual(['C', 'E', 'G']);
  });
});
