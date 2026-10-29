import { GNSS_SYSTEMS, type Ecef, type GnssSystem } from './cors';
import { elevationAzimuth, geodeticToEcef } from './ecef';
import {
  BDT_OFFSET_S,
  C_LIGHT,
  SECONDS_PER_WEEK,
  SYSTEM_CONSTANTS,
  earthRotate,
  keplerSatPos,
  satClockBias,
  type Ephemeris,
} from './orbit';
import {
  BitWriter,
  MSM_BASE,
  PRIMARY_SIGNAL_IDS,
  RANGE_MS_M,
  decodeEphemeris,
  decodeStationArp,
  encodeEphemeris,
  encodeFrame,
  encodeStationArp,
  msmCellLayout,
} from './rtcm3';

/**
 * Synthetic reference station: a valid RTCM3 stream whose pseudoranges carry a
 * known per-satellite error, so the residual engine can be checked end to end.
 * Orbits are synthetic but follow the real constellations' shape.
 */
export const MOCK_STATION = { lat: 10.7662, lon: 106.6844, alt: 10 };
export const MOCK_STATION_ID = 2001;
export const MOCK_ANTENNA_HEIGHT_M = 1.5;
export const MOCK_DESCRIPTORS = { antenna: 'MOCK-ANT', receiver: 'MOCK-RX', firmware: '1.0' };
/** Receiver clock of each system as seen in its pseudoranges, metres. */
export const MOCK_CLOCK_BIAS_M: Record<GnssSystem, number> = { G: 25.3, E: 27.1, C: 22.8 };
/** Every satellite stays above this elevation for the whole hour its ephemeris covers. */
const MOCK_MIN_ELEVATION_DEG = 15;
const MAX_SATS: Record<GnssSystem, number> = { G: 8, E: 6, C: 8 };
const STATION_EVERY_S = 10;
const EPHEMERIS_EVERY_S = 30;
const EPHEMERIS_BLOCK_S = 3600;

/** The error the mock adds to each pseudorange: a slow sine plus a fixed offset per satellite. */
export function mockInjectedErrorM(sys: GnssSystem, prn: number, gps: number) {
  const phase = prn * 0.7 + GNSS_SYSTEMS.indexOf(sys) * 2.1;
  return 3 * Math.sin((2 * Math.PI * gps) / 300 + phase) + (prn % 5) * 0.4 - 0.8;
}

export interface CorsMockOptions {
  /** false: the station broadcasts no ephemeris, like most RTK2go bases. */
  ephemeris?: boolean;
  /** false: no 1005/1006 antenna position. */
  station?: boolean;
  systems?: GnssSystem[];
  msmLevel?: 4 | 7;
}

const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const deg = (d: number) => (d * Math.PI) / 180;

/** Longitudes of BeiDou C01–C05. */
const BDS_GEO_LON = [140, 80, 110.5, 160, 58.75];

interface Plane {
  sqrtA: number;
  i0: number;
  planes: number;
  perPlane: number;
  firstPrn: number;
}

const MEO: Record<GnssSystem, Plane> = {
  G: { sqrtA: 5153.6, i0: deg(55), planes: 6, perPlane: 5, firstPrn: 1 },
  E: { sqrtA: 5440.6, i0: deg(56), planes: 3, perPlane: 10, firstPrn: 1 },
  C: { sqrtA: 5282.6, i0: deg(55), planes: 3, perPlane: 9, firstPrn: 19 },
};

function candidates(sys: GnssSystem, toe: number, toes: number, iode: number): Ephemeris[] {
  const common = {
    sys,
    toe,
    toc: toe,
    toes,
    iode,
    health: 0,
    deltaN: 4.5e-9,
    iDot: 3e-10,
    omegaDot: -8e-9,
    cuc: 2e-6,
    cus: 5e-6,
    crc: 210,
    crs: 40,
    cic: 5e-8,
    cis: -3e-8,
    af1: 1e-12,
    af2: 0,
  };
  const out: Ephemeris[] = [];
  if (sys === 'C') {
    BDS_GEO_LON.forEach((lon, k) =>
      out.push({
        ...common,
        prn: k + 1,
        sqrtA: 6493.4,
        e: 4e-4,
        i0: 0.076,
        omega0: 0,
        omega: 0,
        m0: wrapPi(deg(lon) + SYSTEM_CONSTANTS.C.omegaE * toes),
        af0: (k - 2) * 2e-5,
        tgd: 3e-9,
      }),
    );
  }
  const p = MEO[sys];
  for (let plane = 0; plane < p.planes; plane++) {
    for (let slot = 0; slot < p.perPlane; slot++) {
      const prn = p.firstPrn + plane * p.perPlane + slot;
      out.push({
        ...common,
        prn,
        sqrtA: p.sqrtA,
        e: 0.005,
        i0: p.i0,
        omega0: wrapPi((2 * Math.PI * plane) / p.planes),
        omega: 0.3,
        m0: wrapPi((2 * Math.PI * slot) / p.perPlane + (Math.PI * plane) / 12),
        af0: ((prn % 7) - 3) * 1.5e-5,
        tgd: -4e-9,
      });
    }
  }
  return out;
}

/** Ephemerides pass through the RTCM encoding so the mock uses exactly what a decoder sees. */
const quantise = (eph: Ephemeris) => decodeEphemeris(encodeEphemeris(eph), eph.toe);

/** Antenna position after the 0.1 mm quantisation of message 1006. */
export const mockStationEcef = (): Ecef =>
  decodeStationArp(
    encodeStationArp({
      msgType: 1006,
      stationId: MOCK_STATION_ID,
      ecef: geodeticToEcef(MOCK_STATION),
      antennaHeightM: MOCK_ANTENNA_HEIGHT_M,
    }),
  ).ecef;

/** Geometric range with the Earth's rotation during transit, and the transmit time. */
export function signalRange(eph: Ephemeris, station: Ecef, tRx: number) {
  let tau = 0.075;
  let range = 0;
  for (let i = 0; i < 4; i++) {
    const sat = earthRotate(keplerSatPos(eph, tRx - tau), tau, eph.sys);
    range = Math.hypot(sat.x - station.x, sat.y - station.y, sat.z - station.z);
    tau = range / C_LIGHT;
  }
  return { range, tTx: tRx - tau };
}

function encodeDescriptors(stationId: number) {
  const w = new BitWriter().put(1033, 12).put(stationId, 12);
  const str = (v: string) => {
    w.put(v.length, 8);
    for (const ch of v) w.put(ch.charCodeAt(0), 8);
  };
  str(MOCK_DESCRIPTORS.antenna);
  w.put(0, 8);
  str('');
  str(MOCK_DESCRIPTORS.receiver);
  str(MOCK_DESCRIPTORS.firmware);
  str('');
  return w.finish();
}

interface MsmCell {
  prn: number;
  prM: number;
  cnr: number;
}

/** One MSM4 or MSM7 message with one signal per satellite. */
export function encodeMsm(
  sys: GnssSystem,
  level: 4 | 7,
  towMs: number,
  cells: MsmCell[],
  moreFollow: boolean,
) {
  const layout = msmCellLayout(level);
  const sigId = PRIMARY_SIGNAL_IDS[sys][0]!;
  const sorted = [...cells].sort((a, b) => a.prn - b.prn);
  const w = new BitWriter()
    .put(MSM_BASE[sys] + level, 12)
    .put(MOCK_STATION_ID, 12)
    .put(towMs, 30)
    .put(moreFollow ? 1 : 0, 1)
    .put(0, 3 + 7 + 2 + 2 + 1 + 3);
  const prns = new Set(sorted.map((c) => c.prn));
  for (let k = 1; k <= 64; k++) w.put(prns.has(k) ? 1 : 0, 1);
  for (let k = 1; k <= 32; k++) w.put(k === sigId ? 1 : 0, 1);
  for (let k = 0; k < sorted.length; k++) w.put(1, 1);

  const rough = sorted.map((c) => Math.round((c.prM / RANGE_MS_M) * 1024));
  for (const r of rough) w.put(Math.floor(r / 1024), 8);
  if (layout.satExtra) for (let k = 0; k < sorted.length; k++) w.put(0, 4);
  for (const r of rough) w.put(r % 1024, 10);
  if (layout.satExtra) for (let k = 0; k < sorted.length; k++) w.put(0, 14);

  const fine = sorted.map((c, k) => c.prM / RANGE_MS_M - rough[k]! / 1024);
  for (const f of fine) w.put(Math.round(f / layout.prScale), layout.prBits);
  for (const f of fine) w.put(Math.round(f / layout.cpScale), layout.cpBits);
  for (let k = 0; k < sorted.length; k++) w.put(level >= 6 ? 500 : 12, layout.lockBits);
  for (let k = 0; k < sorted.length; k++) w.put(0, 1);
  for (const c of sorted) w.put(Math.round(c.cnr / layout.cnrScale), layout.cnrBits);
  if (layout.cellRate) for (let k = 0; k < sorted.length; k++) w.put(0, 15);
  return w.finish();
}

const systemOffset = (sys: GnssSystem) => (sys === 'C' ? BDT_OFFSET_S : 0);

export interface CorsMock {
  station: Ecef;
  /** Ephemerides in force at GPS time `gps`, after RTCM quantisation. */
  ephemerides(gps: number): Ephemeris[];
  /** Pseudorange of one satellite at receive time `gps`, as the mock encodes it. */
  pseudorangeM(eph: Ephemeris, gps: number): number;
  /** All frames for the whole-second epoch `gps`. */
  frames(gps: number): Uint8Array[];
}

export function corsMockFeed(opts: CorsMockOptions = {}): CorsMock {
  const systems = opts.systems ?? [...GNSS_SYSTEMS];
  const level = opts.msmLevel ?? 7;
  const station = mockStationEcef();
  const blocks = new Map<string, Ephemeris[]>();
  let first = true;

  function ephemerides(gps: number) {
    return systems.flatMap((sys) => {
      const offset = systemOffset(sys);
      const start = Math.floor((gps - offset) / EPHEMERIS_BLOCK_S) * EPHEMERIS_BLOCK_S;
      const key = `${sys}${start}`;
      let block = blocks.get(key);
      if (!block) {
        const toes = start % SECONDS_PER_WEEK;
        const iode = (start / EPHEMERIS_BLOCK_S) % 32;
        const visible = (e: Ephemeris, t: number) =>
          elevationAzimuth(keplerSatPos(e, t), station).elevationDeg > MOCK_MIN_ELEVATION_DEG;
        block = candidates(sys, start + offset, toes, iode)
          .map(quantise)
          .filter((e) => visible(e, e.toe) && visible(e, e.toe + EPHEMERIS_BLOCK_S))
          .slice(0, MAX_SATS[sys]);
        blocks.set(key, block);
      }
      return block;
    });
  }

  function pseudorangeM(eph: Ephemeris, gps: number) {
    const { range, tTx } = signalRange(eph, station, gps);
    return (
      range -
      C_LIGHT * satClockBias(eph, tTx) +
      MOCK_CLOCK_BIAS_M[eph.sys] +
      mockInjectedErrorM(eph.sys, eph.prn, gps)
    );
  }

  function frames(gps: number) {
    const out: Uint8Array[] = [];
    const ephs = ephemerides(gps);
    if (opts.station !== false && (first || gps % STATION_EVERY_S === 0)) {
      out.push(
        encodeFrame(
          encodeStationArp({
            msgType: 1006,
            stationId: MOCK_STATION_ID,
            ecef: station,
            antennaHeightM: MOCK_ANTENNA_HEIGHT_M,
          }),
        ),
        encodeFrame(encodeDescriptors(MOCK_STATION_ID)),
      );
    }
    if (opts.ephemeris !== false && (first || gps % EPHEMERIS_EVERY_S === 0)) {
      for (const eph of ephs) out.push(encodeFrame(encodeEphemeris(eph)));
    }
    first = false;
    systems.forEach((sys, k) => {
      const cells = ephs
        .filter((e) => e.sys === sys)
        .map((e) => ({ prn: e.prn, prM: pseudorangeM(e, gps), cnr: 45 }));
      const tow = ((gps - systemOffset(sys)) % SECONDS_PER_WEEK) * 1000;
      out.push(encodeFrame(encodeMsm(sys, level, tow, cells, k < systems.length - 1)));
    });
    return out;
  }

  return { station, ephemerides, pseudorangeM, frames };
}
