import type { Ecef } from './cors';

/** WGS84 ellipsoid. */
export const WGS84_A = 6_378_137;
export const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Degrees and metres above the ellipsoid. */
export interface Geodetic {
  lat: number;
  lon: number;
  alt: number;
}

export interface EnuVector {
  east: number;
  north: number;
  up: number;
}

export function geodeticToEcef({ lat, lon, alt }: Geodetic): Ecef {
  const sinLat = Math.sin(toRad(lat));
  const cosLat = Math.cos(toRad(lat));
  const v = WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
  return {
    x: (v + alt) * cosLat * Math.cos(toRad(lon)),
    y: (v + alt) * cosLat * Math.sin(toRad(lon)),
    z: (v * (1 - E2) + alt) * sinLat,
  };
}

/** Iterates on the prime-vertical radius until the height term settles below 0.1 mm. */
export function ecefToGeodetic({ x, y, z }: Ecef): Geodetic {
  const r2 = x * x + y * y;
  let zk = 0;
  let zi = z;
  let v = WGS84_A;
  for (let i = 0; i < 10 && Math.abs(zi - zk) >= 1e-4; i++) {
    zk = zi;
    const sinLat = zi / Math.sqrt(r2 + zi * zi);
    v = WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
    zi = z + v * E2 * sinLat;
  }
  const polar = r2 <= 1e-12;
  return {
    lat: polar ? (z > 0 ? 90 : -90) : toDeg(Math.atan(zi / Math.sqrt(r2))),
    lon: polar ? 0 : toDeg(Math.atan2(y, x)),
    alt: Math.sqrt(r2 + zi * zi) - v,
  };
}

/** East/north/up of `target` seen from `origin`; exact at any distance, unlike the flat `toEnu`. */
export function ecefToEnu(target: Ecef, origin: Ecef): EnuVector {
  const { lat, lon } = ecefToGeodetic(origin);
  const sinLat = Math.sin(toRad(lat));
  const cosLat = Math.cos(toRad(lat));
  const sinLon = Math.sin(toRad(lon));
  const cosLon = Math.cos(toRad(lon));
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  return {
    east: -sinLon * dx + cosLon * dy,
    north: -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
    up: cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz,
  };
}

/** Elevation and azimuth (clockwise from north) of a satellite, degrees. */
export function elevationAzimuth(sat: Ecef, station: Ecef) {
  const { east, north, up } = ecefToEnu(sat, station);
  const azimuth = toDeg(Math.atan2(east, north));
  return {
    elevationDeg: toDeg(Math.atan2(up, Math.hypot(east, north))),
    azimuthDeg: azimuth < 0 ? azimuth + 360 : azimuth,
  };
}
