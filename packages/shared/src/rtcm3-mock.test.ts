import { describe, expect, it } from 'vitest';
import { ecefToGeodetic, elevationAzimuth } from './ecef';
import { isBdsGeo, keplerSatPos } from './orbit';
import { crc24q, messageType } from './rtcm3';
import { MOCK_STATION, corsMockFeed } from './rtcm3-mock';

const T0 = 2442 * 604800 + 7200;

describe('corsMockFeed', () => {
  it('emits only frames that pass CRC-24Q', () => {
    const mock = corsMockFeed();
    for (let t = T0; t < T0 + 40; t++) {
      for (const f of mock.frames(t)) {
        expect(f[0]).toBe(0xd3);
        expect(crc24q(f)).toBe(0);
      }
    }
  });

  it('sends station, descriptors and ephemerides first, then MSM every second', () => {
    const mock = corsMockFeed();
    const types = (t: number) => mock.frames(t).map((f) => messageType(f.subarray(3)));
    const first = types(T0 + 1);
    expect(first).toEqual(expect.arrayContaining([1006, 1033, 1019, 1046, 1042, 1077, 1097, 1127]));
    expect(types(T0 + 2)).toEqual([1077, 1097, 1127]);
  });

  it('places the station where configured', () => {
    const g = ecefToGeodetic(corsMockFeed().station);
    expect(g.lat).toBeCloseTo(MOCK_STATION.lat, 6);
    expect(g.lon).toBeCloseTo(MOCK_STATION.lon, 6);
  });

  it('keeps enough satellites in view in every hour, including a BeiDou GEO', () => {
    const mock = corsMockFeed();
    for (let hour = 0; hour < 24; hour++) {
      const t = T0 + hour * 3600 + 100;
      const ephs = mock.ephemerides(t);
      for (const sys of ['G', 'E', 'C'] as const) {
        expect(ephs.filter((e) => e.sys === sys).length).toBeGreaterThanOrEqual(5);
      }
      expect(ephs.some((e) => e.sys === 'C' && isBdsGeo(e.prn))).toBe(true);
      for (const e of ephs) {
        expect(elevationAzimuth(keplerSatPos(e, t), mock.station).elevationDeg).toBeGreaterThan(15);
      }
    }
  });

  it('honours the diagnostic variants', () => {
    const noEph = corsMockFeed({ ephemeris: false })
      .frames(T0)
      .map((f) => messageType(f.subarray(3)));
    expect(noEph).not.toContain(1019);
    const noStation = corsMockFeed({ station: false })
      .frames(T0)
      .map((f) => messageType(f.subarray(3)));
    expect(noStation).not.toContain(1006);
    const gpsOnly = corsMockFeed({ systems: ['G'], msmLevel: 4 }).frames(T0 + 1);
    expect(gpsOnly.map((f) => messageType(f.subarray(3)))).toContain(1074);
  });
});
