import {
  C_LIGHT,
  EPHEMERIS_MAX_AGE_S,
  GNSS_SYSTEMS,
  PRIMARY_SIGNAL_IDS,
  earthRotate,
  elevationAzimuth,
  gpsToUnixMs,
  keplerSatPos,
  satClockBias,
  type CorsDiagnosis,
  type CorsEpoch,
  type CorsSatResidual,
  type CorsSkipReason,
  type Ecef,
  type Ephemeris,
  type GnssSystem,
} from '@rtk/shared';
import type { MsmCell, MsmEpoch } from './rtcm3-decode';

/** The receiver clock of a system is the median of at least this many satellites. */
export const MIN_SATS_PER_SYSTEM = 4;

export const ephemerisKey = (sys: GnssSystem, prn: number) => `${sys}${prn}`;

export interface ResidualResult {
  /** Null when nothing could be computed; `diagnosis` says why. */
  epoch: CorsEpoch | null;
  diagnosis: CorsDiagnosis[];
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** First available signal in the system's preference order. */
function primaryCell(cells: MsmCell[]) {
  const ids = PRIMARY_SIGNAL_IDS[cells[0]!.sys];
  for (const id of ids) {
    const c = cells.find((x) => x.signalId === id && x.prM !== null);
    if (c) return c;
  }
  return null;
}

/**
 * Total station error per satellite: pseudorange minus the geometric range
 * from the known antenna position, plus the satellite clock, minus the
 * receiver clock estimated per system as the median. Atmosphere stays in.
 */
export function computeResiduals(
  epoch: MsmEpoch,
  station: Ecef | null,
  ephemerides: ReadonlyMap<string, Ephemeris>,
  minElevationDeg: number,
): ResidualResult {
  if (!station) return { epoch: null, diagnosis: ['no-station-position'] };

  const bySat = new Map<string, MsmCell[]>();
  for (const c of epoch.cells) {
    if (!GNSS_SYSTEMS.includes(c.sys)) continue;
    const key = ephemerisKey(c.sys, c.prn);
    bySat.set(key, [...(bySat.get(key) ?? []), c]);
  }

  const t = epoch.gps;
  const skipped: CorsEpoch['skipped'] = [];
  const raw: (Omit<CorsSatResidual, 'residualM'> & { r: number })[] = [];
  let withEphemeris = 0;
  for (const [key, cells] of bySat) {
    const { sys, prn } = cells[0]!;
    const skip = (reason: CorsSkipReason) => skipped.push({ sys, prn, reason });
    const cell = primaryCell(cells);
    if (!cell) {
      skip('no-signal');
      continue;
    }
    const eph = ephemerides.get(key);
    if (!eph || Math.abs(t - eph.toe) > EPHEMERIS_MAX_AGE_S[sys]) {
      skip('no-ephemeris');
      continue;
    }
    withEphemeris++;
    if (eph.health !== 0) {
      skip('unhealthy');
      continue;
    }
    const pr = cell.prM!;
    let tTx = t - pr / C_LIGHT;
    let dts = 0;
    for (let i = 0; i < 2; i++) {
      dts = satClockBias(eph, tTx);
      tTx = t - pr / C_LIGHT - dts;
    }
    const sat = earthRotate(keplerSatPos(eph, tTx), t - tTx, sys);
    const { elevationDeg } = elevationAzimuth(sat, station);
    if (elevationDeg < minElevationDeg) {
      skip('low-elevation');
      continue;
    }
    const range = Math.hypot(sat.x - station.x, sat.y - station.y, sat.z - station.z);
    raw.push({ sys, prn, elevationDeg, cn0: cell.cnr, r: pr - range + C_LIGHT * dts });
  }

  if (withEphemeris === 0) return { epoch: null, diagnosis: ['no-ephemeris'] };

  const diagnosis: CorsDiagnosis[] = [];
  const clockBiasM: CorsEpoch['clockBiasM'] = {};
  const sats: CorsSatResidual[] = [];
  for (const sys of GNSS_SYSTEMS) {
    const group = raw.filter((x) => x.sys === sys);
    if (group.length === 0) continue;
    if (group.length < MIN_SATS_PER_SYSTEM) {
      for (const g of group) skipped.push({ sys, prn: g.prn, reason: 'too-few-sats' });
      if (!diagnosis.includes('too-few-sats')) diagnosis.push('too-few-sats');
      continue;
    }
    const bias = median(group.map((g) => g.r));
    clockBiasM[sys] = bias;
    for (const { r, ...sat } of group) sats.push({ ...sat, residualM: r - bias });
  }

  const sq = sats.reduce((sum, s) => sum + s.residualM * s.residualM, 0);
  return {
    epoch: {
      at: gpsToUnixMs(t),
      sats,
      clockBiasM,
      rmsM: sats.length ? Math.sqrt(sq / sats.length) : 0,
      maxAbsM: sats.reduce((m, s) => Math.max(m, Math.abs(s.residualM)), 0),
      skipped,
    },
    diagnosis,
  };
}
