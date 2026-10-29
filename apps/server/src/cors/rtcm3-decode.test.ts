import {
  BDT_OFFSET_S,
  MOCK_ANTENNA_HEIGHT_M,
  MOCK_DESCRIPTORS,
  MOCK_STATION_ID,
  corsMockFeed,
  encodeFrame,
  encodeMsm,
} from '@rtk/shared';
import { describe, expect, it } from 'vitest';
import { Rtcm3Decoder, decodeMsm, type DecodedEvent } from './rtcm3-decode';
import { Rtcm3Framer } from './rtcm3-framer';

const T0 = 2442 * 604800 + 7200;

function decodeAll(gps: number, opts: Parameters<typeof corsMockFeed>[0] = {}) {
  const mock = corsMockFeed(opts);
  const framer = new Rtcm3Framer();
  const decoder = new Rtcm3Decoder(() => gps + 0.4);
  const events: DecodedEvent[] = [];
  for (const f of mock.frames(gps))
    for (const fr of framer.push(f)) events.push(...decoder.decode(fr));
  return { mock, events };
}

describe('Rtcm3Decoder on the mock stream', () => {
  it('decodes station position, height and descriptors', () => {
    const { mock, events } = decodeAll(T0);
    const st = events.find((e) => e.kind === 'station');
    expect(st?.kind === 'station' && st.arp).toMatchObject({
      msgType: 1006,
      stationId: MOCK_STATION_ID,
      ecef: mock.station,
    });
    expect(st?.kind === 'station' && st.arp.antennaHeightM).toBeCloseTo(MOCK_ANTENNA_HEIGHT_M, 4);
    const d = events.find((e) => e.kind === 'descriptors');
    expect(d?.kind === 'descriptors' && d.descriptors).toMatchObject(MOCK_DESCRIPTORS);
  });

  it('decodes every ephemeris to the values the mock used', () => {
    const { mock, events } = decodeAll(T0);
    const ephs = events.flatMap((e) => (e.kind === 'ephemeris' ? [e.eph] : []));
    expect(ephs).toEqual(mock.ephemerides(T0));
  });

  for (const msmLevel of [4, 7] as const) {
    it(`assembles one epoch from MSM${msmLevel} of the three systems`, () => {
      const { mock, events } = decodeAll(T0 + 5, { msmLevel });
      const epochs = events.flatMap((e) => (e.kind === 'epoch' ? [e.epoch] : []));
      expect(epochs).toHaveLength(1);
      const epoch = epochs[0]!;
      expect(epoch.gps).toBe(T0 + 5);
      const ephs = mock.ephemerides(T0 + 5);
      expect(epoch.cells).toHaveLength(ephs.length);
      const tol = msmLevel === 7 ? 0.001 : 0.01;
      for (const eph of ephs) {
        const cell = epoch.cells.find((c) => c.sys === eph.sys && c.prn === eph.prn)!;
        expect(cell.signalId).toBe(2);
        expect(cell.cnr).toBe(45);
        expect(Math.abs(cell.prM! - mock.pseudorangeM(eph, T0 + 5))).toBeLessThan(tol);
      }
    });
  }
});

describe('decodeMsm', () => {
  it('moves BeiDou epochs from BDT to GPS time', () => {
    const tow = ((T0 - BDT_OFFSET_S) % 604800) * 1000;
    const msg = decodeMsm(encodeMsm('C', 4, tow, [{ prn: 3, prM: 3.7e7, cnr: 40 }], false), T0);
    expect(msg?.gps).toBe(T0);
    expect(msg?.sys).toBe('C');
  });

  it('places a time of week from the previous week correctly', () => {
    const msg = decodeMsm(
      encodeMsm('G', 7, 604799000, [{ prn: 1, prM: 2.1e7, cnr: 40 }], false),
      T0 - 7200 + 2,
    );
    expect(msg?.gps).toBe(T0 - 7200 - 1);
  });

  it('closes an epoch when the next one starts even without the final flag', () => {
    const decoder = new Rtcm3Decoder(() => T0);
    const frame = (gps: number) => {
      const payload = encodeMsm(
        'G',
        4,
        (gps % 604800) * 1000,
        [{ prn: 1, prM: 2.1e7, cnr: 40 }],
        true,
      );
      return { type: 1074, payload: encodeFrame(payload).subarray(3, -3) };
    };
    expect(decoder.decode(frame(T0))).toEqual([]);
    const out = decoder.decode(frame(T0 + 1));
    expect(out).toHaveLength(1);
    expect(out[0]?.kind === 'epoch' && out[0].epoch.gps).toBe(T0);
  });

  it('waits for every known system when each sets the final flag on its own', () => {
    const decoder = new Rtcm3Decoder(() => T0);
    const msm = (sys: 'G' | 'E', gps: number) => ({
      type: sys === 'G' ? 1074 : 1094,
      payload: encodeMsm(sys, 4, (gps % 604800) * 1000, [{ prn: 1, prM: 2.1e7, cnr: 40 }], false),
    });
    decoder.decode(msm('G', T0));
    decoder.decode(msm('E', T0));
    // From now on both systems are known, so G alone does not close the epoch.
    expect(decoder.decode(msm('G', T0 + 1))).toEqual([
      { kind: 'epoch', epoch: expect.objectContaining({ gps: T0 }) },
    ]);
    const out = decoder.decode(msm('E', T0 + 1));
    expect(out[0]?.kind === 'epoch' && out[0].epoch.cells.map((c) => c.sys)).toEqual(['G', 'E']);
  });
});
