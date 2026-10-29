import { describe, expect, it } from 'vitest';
import { ecefToEnu, ecefToGeodetic, elevationAzimuth, geodeticToEcef, WGS84_A } from './ecef';

const HANOI = { lat: 21.028511, lon: 105.804817, alt: 12.3 };
const HCMC = { lat: 10.776889, lon: 106.700806, alt: 4.1 };

describe('geodetic ↔ ECEF', () => {
  it('round-trips Hanoi and Ho Chi Minh City below 1e-9° and 1 mm', () => {
    for (const p of [HANOI, HCMC, { lat: -45.5, lon: -170.25, alt: 2500 }]) {
      const back = ecefToGeodetic(geodeticToEcef(p));
      expect(Math.abs(back.lat - p.lat)).toBeLessThan(1e-9);
      expect(Math.abs(back.lon - p.lon)).toBeLessThan(1e-9);
      expect(Math.abs(back.alt - p.alt)).toBeLessThan(1e-3);
    }
  });

  it('maps (0°, 0°, 0 m) to (a, 0, 0)', () => {
    const p = geodeticToEcef({ lat: 0, lon: 0, alt: 0 });
    expect(p.x).toBeCloseTo(WGS84_A, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
    const g = ecefToGeodetic({ x: WGS84_A, y: 0, z: 0 });
    expect(g.lat).toBeCloseTo(0, 12);
    expect(g.lon).toBeCloseTo(0, 12);
    expect(g.alt).toBeCloseTo(0, 6);
  });

  it('handles the poles', () => {
    const north = ecefToGeodetic(geodeticToEcef({ lat: 90, lon: 0, alt: 100 }));
    expect(north.lat).toBeCloseTo(90, 9);
    expect(north.alt).toBeCloseTo(100, 3);
  });

  it('matches cssrlib ecef2pos for the RTCM 1005 sample position', () => {
    const g = ecefToGeodetic({ x: 1114104.5999, y: -4850729.7108, z: 3975521.4643 });
    expect(g.lat).toBeCloseTo(38.80475943042486, 10);
    expect(g.lon).toBeCloseTo(-77.06477359980347, 10);
    expect(g.alt).toBeCloseTo(114.56113815493882, 4);
  });
});

describe('ecefToEnu', () => {
  it('measures 100 m up as up', () => {
    const o = geodeticToEcef(HCMC);
    const enu = ecefToEnu(geodeticToEcef({ ...HCMC, alt: HCMC.alt + 100 }), o);
    expect(enu.up).toBeCloseTo(100, 6);
    expect(Math.hypot(enu.east, enu.north)).toBeLessThan(1e-6);
  });

  it('keeps length over long baselines', () => {
    const a = geodeticToEcef(HANOI);
    const b = geodeticToEcef(HCMC);
    const enu = ecefToEnu(b, a);
    expect(Math.hypot(enu.east, enu.north, enu.up)).toBeCloseTo(
      Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
      6,
    );
    expect(enu.north).toBeLessThan(0);
  });
});

describe('elevationAzimuth', () => {
  it('sees a point straight overhead at 90°', () => {
    const st = geodeticToEcef(HCMC);
    const sat = geodeticToEcef({ ...HCMC, alt: 20_000_000 });
    expect(elevationAzimuth(sat, st).elevationDeg).toBeCloseTo(90, 6);
  });

  it('puts a point due east at azimuth 90°', () => {
    const st = geodeticToEcef({ lat: 0, lon: 0, alt: 0 });
    const { azimuthDeg, elevationDeg } = elevationAzimuth(
      geodeticToEcef({ lat: 0, lon: 0.01, alt: 0 }),
      st,
    );
    expect(azimuthDeg).toBeCloseTo(90, 6);
    expect(elevationDeg).toBeLessThan(0);
  });
});
