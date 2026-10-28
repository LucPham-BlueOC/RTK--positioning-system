/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Enu {
  east: number;
  north: number;
}

/** Great-circle distance in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Combined 1-sigma-ish uncertainty of a distance from two independent accuracy radii. */
export function distanceUncertainty(accA: number, accB: number): number {
  return Math.hypot(accA, accB);
}

/** Local flat-earth east/north offsets in metres from `origin`; accurate below ~1 km. */
export function toEnu(p: LatLon, origin: LatLon): Enu {
  return {
    east: EARTH_RADIUS_M * toRad(p.lon - origin.lon) * Math.cos(toRad(origin.lat)),
    north: EARTH_RADIUS_M * toRad(p.lat - origin.lat),
  };
}

export function fromEnu(p: Enu, origin: LatLon): LatLon {
  return {
    lat: origin.lat + toDeg(p.north / EARTH_RADIUS_M),
    lon: origin.lon + toDeg(p.east / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)))),
  };
}

/**
 * The Geolocation API does not expose the provider. A fix with altitude and a
 * tight accuracy radius is almost always GNSS; anything else may be Wi-Fi/cell.
 */
export const GNSS_ACCURACY_THRESHOLD_M = 20;

export function inferSource(alt: number | null, accuracy: number) {
  return alt !== null && accuracy <= GNSS_ACCURACY_THRESHOLD_M
    ? 'gnss-inferred'
    : 'network-inferred';
}
