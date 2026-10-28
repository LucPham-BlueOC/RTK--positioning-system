import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, distanceUncertainty, fromEnu, haversine, inferSource, toEnu } from './geo';

const HANOI = { lat: 21.028511, lon: 105.804817 };
const HCMC = { lat: 10.776889, lon: 106.700806 };

/** Point exactly `metres` north/east of `p` along the sphere. */
const north = (p: { lat: number; lon: number }, m: number) => ({
  lat: p.lat + (m / EARTH_RADIUS_M) * (180 / Math.PI),
  lon: p.lon,
});

describe('haversine', () => {
  it('is zero for the same point', () => {
    expect(haversine(HANOI, HANOI)).toBe(0);
  });

  it('measures 20.00 m due north to sub-millimetre precision', () => {
    for (const p of [HANOI, HCMC]) {
      expect(haversine(p, north(p, 20))).toBeCloseTo(20, 4);
    }
  });

  it('measures 20.00 m due east via the ENU inverse', () => {
    for (const p of [HANOI, HCMC]) {
      const east = fromEnu({ east: 20, north: 0 }, p);
      expect(haversine(p, east)).toBeCloseTo(20, 3);
    }
  });

  it('measures one degree of meridian as R·π/180', () => {
    const d = haversine({ lat: 10, lon: 106 }, { lat: 11, lon: 106 });
    expect(d).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 180, 3);
  });
});

describe('ENU', () => {
  it('round-trips through fromEnu', () => {
    const p = { lat: 21.0291, lon: 105.8051 };
    const back = fromEnu(toEnu(p, HANOI), HANOI);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lon).toBeCloseTo(p.lon, 9);
  });

  it('agrees with haversine at short range', () => {
    const p = fromEnu({ east: 30, north: -40 }, HCMC);
    const e = toEnu(p, HCMC);
    expect(Math.hypot(e.east, e.north)).toBeCloseTo(haversine(HCMC, p), 3);
  });
});

describe('distanceUncertainty', () => {
  it('combines 4 m and 3 m into 5 m', () => {
    expect(distanceUncertainty(4, 3)).toBe(5);
  });
});

describe('inferSource', () => {
  it('treats altitude with a tight radius as GNSS', () => {
    expect(inferSource(12, 5)).toBe('gnss-inferred');
  });
  it('treats missing altitude or a wide radius as network', () => {
    expect(inferSource(null, 5)).toBe('network-inferred');
    expect(inferSource(12, 65)).toBe('network-inferred');
  });
});
