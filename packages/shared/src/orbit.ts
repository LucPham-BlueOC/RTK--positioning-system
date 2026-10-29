import type { Ecef, GnssSystem } from './cors';

export const C_LIGHT = 299_792_458;
export const SECONDS_PER_WEEK = 604_800;
/** BeiDou time lags GPS time by a fixed 14 s. Galileo time equals GPS time. */
export const BDT_OFFSET_S = 14;
/** GPS − UTC. No leap second has been announced since 2017. */
export const GPS_LEAP_SECONDS = 18;
const GPS_EPOCH_UNIX_MS = Date.UTC(1980, 0, 6);

/** Earth gravitational constant and rotation rate each system's ICD fixes for its users. */
export const SYSTEM_CONSTANTS: Record<GnssSystem, { gm: number; omegaE: number }> = {
  G: { gm: 3.986005e14, omegaE: 7.2921151467e-5 },
  E: { gm: 3.986004418e14, omegaE: 7.2921151467e-5 },
  C: { gm: 3.986004418e14, omegaE: 7.292115e-5 },
};

/** Clock relativity uses −2√μ/c² of the system's own μ. */
const relativityF = (gm: number) => (-2 * Math.sqrt(gm)) / (C_LIGHT * C_LIGHT);

/** GPS time as seconds since 1980-01-06; Galileo and BeiDou ephemerides are converted to it. */
export const gpsToUnixMs = (gps: number) => (gps - GPS_LEAP_SECONDS) * 1000 + GPS_EPOCH_UNIX_MS;
export const unixMsToGps = (ms: number) => (ms - GPS_EPOCH_UNIX_MS) / 1000 + GPS_LEAP_SECONDS;

/** Time of week becomes absolute GPS time in the week nearest to `refGps`. */
export function resolveTimeOfWeek(sow: number, refGps: number) {
  const week = Math.floor(refGps / SECONDS_PER_WEEK);
  let t = week * SECONDS_PER_WEEK + sow;
  if (t - refGps > SECONDS_PER_WEEK / 2) t -= SECONDS_PER_WEEK;
  else if (refGps - t > SECONDS_PER_WEEK / 2) t += SECONDS_PER_WEEK;
  return t;
}

/** A truncated week counter becomes the full GPS week nearest to `refWeek`. */
export function resolveWeek(raw: number, modulus: number, offset: number, refWeek: number) {
  const base = raw + offset;
  return base + Math.round((refWeek - base) / modulus) * modulus;
}

/** BeiDou geostationary satellites use a different broadcast orbit frame. */
export const isBdsGeo = (prn: number) => prn <= 5 || prn >= 59;

/** Broadcast Keplerian ephemeris; angles in radians, times as absolute GPS seconds. */
export interface Ephemeris {
  sys: GnssSystem;
  prn: number;
  toe: number;
  toc: number;
  /** toe as seconds of week in the system's own time scale (BDT for BeiDou). */
  toes: number;
  sqrtA: number;
  e: number;
  i0: number;
  omega0: number;
  omega: number;
  m0: number;
  deltaN: number;
  iDot: number;
  omegaDot: number;
  cuc: number;
  cus: number;
  crc: number;
  crs: number;
  cic: number;
  cis: number;
  af0: number;
  af1: number;
  af2: number;
  /** Group delay of the single-frequency signal used: GPS TGD, Galileo BGD E5b/E1, BeiDou TGD1. */
  tgd: number;
  iode: number;
  health: number;
}

function eccentricAnomaly(eph: Ephemeris, tk: number) {
  const { gm } = SYSTEM_CONSTANTS[eph.sys];
  const a = eph.sqrtA * eph.sqrtA;
  const m = eph.m0 + (Math.sqrt(gm / (a * a * a)) + eph.deltaN) * tk;
  let e = m;
  for (let i = 0; i < 30; i++) {
    const step = (e - eph.e * Math.sin(e) - m) / (1 - eph.e * Math.cos(e));
    e -= step;
    if (Math.abs(step) < 1e-14) break;
  }
  return e;
}

const COS_5 = Math.cos((-5 * Math.PI) / 180);
const SIN_5 = Math.sin((-5 * Math.PI) / 180);

/** Satellite antenna phase centre in the Earth-fixed frame at GPS time `t` (IS-GPS-200 §20.3.3.4.3). */
export function keplerSatPos(eph: Ephemeris, t: number): Ecef {
  const { omegaE } = SYSTEM_CONSTANTS[eph.sys];
  const tk = t - eph.toe;
  const ecc = eccentricAnomaly(eph, tk);
  const a = eph.sqrtA * eph.sqrtA;
  const phi =
    Math.atan2(Math.sqrt(1 - eph.e * eph.e) * Math.sin(ecc), Math.cos(ecc) - eph.e) + eph.omega;
  const sin2 = Math.sin(2 * phi);
  const cos2 = Math.cos(2 * phi);
  const u = phi + eph.cus * sin2 + eph.cuc * cos2;
  const r = a * (1 - eph.e * Math.cos(ecc)) + eph.crs * sin2 + eph.crc * cos2;
  const inc = eph.i0 + eph.iDot * tk + eph.cis * sin2 + eph.cic * cos2;
  const xo = r * Math.cos(u);
  const yo = r * Math.sin(u);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  if (eph.sys === 'C' && isBdsGeo(eph.prn)) {
    // GEO elements are given in a frame tilted −5° about X and not co-rotating (BDS-SIS-ICD 5.2.4.12).
    const node = eph.omega0 + eph.omegaDot * tk - omegaE * eph.toes;
    const xg = xo * Math.cos(node) - yo * cosI * Math.sin(node);
    const yg = xo * Math.sin(node) + yo * cosI * Math.cos(node);
    const zg = yo * sinI;
    const so = Math.sin(omegaE * tk);
    const co = Math.cos(omegaE * tk);
    return {
      x: xg * co + yg * so * COS_5 + zg * so * SIN_5,
      y: -xg * so + yg * co * COS_5 + zg * co * SIN_5,
      z: -yg * SIN_5 + zg * COS_5,
    };
  }

  const node = eph.omega0 + (eph.omegaDot - omegaE) * tk - omegaE * eph.toes;
  return {
    x: xo * Math.cos(node) - yo * cosI * Math.sin(node),
    y: xo * Math.sin(node) + yo * cosI * Math.cos(node),
    z: yo * sinI,
  };
}

/** Satellite clock offset in seconds at GPS time `t`: polynomial, relativity and group delay. */
export function satClockBias(eph: Ephemeris, t: number) {
  const dt = t - eph.toc;
  const ecc = eccentricAnomaly(eph, t - eph.toe);
  const relativity = relativityF(SYSTEM_CONSTANTS[eph.sys].gm) * eph.e * eph.sqrtA * Math.sin(ecc);
  return eph.af0 + eph.af1 * dt + eph.af2 * dt * dt + relativity - eph.tgd;
}

/** Longest |t − toe| for which a broadcast ephemeris is still trusted. */
export const EPHEMERIS_MAX_AGE_S: Record<GnssSystem, number> = {
  G: 4 * 3600,
  E: 4 * 3600,
  C: 3600,
};

/** Rotates a position about Z by the Earth's rotation during the signal transit time. */
export function earthRotate(p: Ecef, seconds: number, sys: GnssSystem): Ecef {
  const angle = SYSTEM_CONSTANTS[sys].omegaE * seconds;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * p.x + s * p.y, y: -s * p.x + c * p.y, z: p.z };
}
