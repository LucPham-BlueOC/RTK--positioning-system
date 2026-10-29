import type { Ecef, GnssSystem } from './cors';
import { BDT_OFFSET_S, SECONDS_PER_WEEK, resolveWeek, type Ephemeris } from './orbit';

/**
 * RTCM 10403.x transport and the fixed-layout messages. The standard is paid;
 * layouts follow RTKLIB `rtcm3.c` and pyrtcm, cross-checked against both.
 */
export const RTCM3_PREAMBLE = 0xd3;
/** Preamble, 6 reserved bits, 10-bit payload length. */
export const RTCM3_HEADER_BYTES = 3;
export const RTCM3_CRC_BYTES = 3;
export const RTCM3_MAX_PAYLOAD = 1023;

const CRC24Q_TABLE = Array.from({ length: 256 }, (_, i) => {
  let crc = i << 16;
  for (let b = 0; b < 8; b++) {
    crc <<= 1;
    if (crc & 0x1000000) crc ^= 0x1864cfb;
  }
  return crc & 0xffffff;
});

export function crc24q(buf: Uint8Array, start = 0, end = buf.length) {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc = ((crc << 8) & 0xffffff) ^ CRC24Q_TABLE[(crc >>> 16) ^ buf[i]!]!;
  }
  return crc;
}

/** Unsigned big-endian bit field. Arithmetic, not 32-bit bitwise ops, so 38-bit fields stay exact. */
export function getbitu(buf: Uint8Array, pos: number, len: number) {
  let v = 0;
  for (let i = pos; i < pos + len; i++) v = v * 2 + ((buf[i >> 3]! >> (7 - (i & 7))) & 1);
  return v;
}

/** Two's-complement signed bit field. */
export function getbits(buf: Uint8Array, pos: number, len: number) {
  const v = getbitu(buf, pos, len);
  return v >= 2 ** (len - 1) ? v - 2 ** len : v;
}

export class BitWriter {
  private bytes = new Uint8Array(64);
  private pos = 0;

  /** Appends `value` as a `len`-bit field; negative values are written as two's complement. */
  put(value: number, len: number) {
    let v = value < 0 ? value + 2 ** len : value;
    if (!Number.isInteger(v) || v < 0 || v >= 2 ** len || value < -(2 ** (len - 1))) {
      throw new RangeError(`${value} does not fit in ${len} bits`);
    }
    const end = this.pos + len;
    if (end > this.bytes.length * 8) {
      const grown = new Uint8Array(Math.max(this.bytes.length * 2, Math.ceil(end / 8)));
      grown.set(this.bytes);
      this.bytes = grown;
    }
    for (let i = end - 1; i >= this.pos; i--) {
      if (v % 2) this.bytes[i >> 3]! |= 1 << (7 - (i & 7));
      v = Math.floor(v / 2);
    }
    this.pos = end;
    return this;
  }

  /** Payload padded with zero bits to whole bytes. */
  finish() {
    return this.bytes.slice(0, Math.ceil(this.pos / 8));
  }
}

/** Wraps a payload in a transport frame with its CRC-24Q. */
export function encodeFrame(payload: Uint8Array) {
  if (payload.length > RTCM3_MAX_PAYLOAD) throw new RangeError('RTCM3 payload too long');
  const frame = new Uint8Array(RTCM3_HEADER_BYTES + payload.length + RTCM3_CRC_BYTES);
  frame[0] = RTCM3_PREAMBLE;
  frame[1] = (payload.length >> 8) & 0x03;
  frame[2] = payload.length & 0xff;
  frame.set(payload, RTCM3_HEADER_BYTES);
  const crc = crc24q(frame, 0, RTCM3_HEADER_BYTES + payload.length);
  frame[frame.length - 3] = (crc >> 16) & 0xff;
  frame[frame.length - 2] = (crc >> 8) & 0xff;
  frame[frame.length - 1] = crc & 0xff;
  return frame;
}

export const messageType = (payload: Uint8Array) => getbitu(payload, 0, 12);

/** One data field: name (null = reserved or ignored), width, signedness, scale. */
type Field = readonly [name: string | null, bits: number, signed: boolean, scale: number];

/** Semicircles as IS-GPS-200 defines π for broadcast angles. */
const SC = 3.1415926535898;
const P2 = (n: number) => 2 ** n;

const u = (name: string | null, bits: number, scale = 1): Field => [name, bits, false, scale];
const s = (name: string | null, bits: number, scale = 1): Field => [name, bits, true, scale];

/** Fields after the 12-bit message number. */
// prettier-ignore
const LAYOUTS: Record<number, readonly Field[]> = {
  1005: [u('stationId', 12), u(null, 6), u(null, 4), s('x', 38, 1e-4), u(null, 2), s('y', 38, 1e-4), u(null, 2), s('z', 38, 1e-4)],
  1006: [u('stationId', 12), u(null, 6), u(null, 4), s('x', 38, 1e-4), u(null, 2), s('y', 38, 1e-4), u(null, 2), s('z', 38, 1e-4), u('antennaHeight', 16, 1e-4)],
  1032: [u('stationId', 12), u('physicalStationId', 12), u(null, 6), s('x', 38, 1e-4), s('y', 38, 1e-4), s('z', 38, 1e-4)],
  1019: [
    u('prn', 6), u('week', 10), u(null, 4), u(null, 2), s('iDot', 14, P2(-43) * SC), u('iode', 8),
    u('toc', 16, 16), s('af2', 8, P2(-55)), s('af1', 16, P2(-43)), s('af0', 22, P2(-31)), u(null, 10),
    s('crs', 16, P2(-5)), s('deltaN', 16, P2(-43) * SC), s('m0', 32, P2(-31) * SC), s('cuc', 16, P2(-29)),
    u('e', 32, P2(-33)), s('cus', 16, P2(-29)), u('sqrtA', 32, P2(-19)), u('toes', 16, 16),
    s('cic', 16, P2(-29)), s('omega0', 32, P2(-31) * SC), s('cis', 16, P2(-29)), s('i0', 32, P2(-31) * SC),
    s('crc', 16, P2(-5)), s('omega', 32, P2(-31) * SC), s('omegaDot', 24, P2(-43) * SC), s('tgd', 8, P2(-31)),
    u('health', 6), u(null, 1), u(null, 1),
  ],
  1046: [
    u('prn', 6), u('week', 12), u('iode', 10), u(null, 8), s('iDot', 14, P2(-43) * SC), u('toc', 14, 60),
    s('af2', 6, P2(-59)), s('af1', 21, P2(-46)), s('af0', 31, P2(-34)), s('crs', 16, P2(-5)),
    s('deltaN', 16, P2(-43) * SC), s('m0', 32, P2(-31) * SC), s('cuc', 16, P2(-29)), u('e', 32, P2(-33)),
    s('cus', 16, P2(-29)), u('sqrtA', 32, P2(-19)), u('toes', 14, 60), s('cic', 16, P2(-29)),
    s('omega0', 32, P2(-31) * SC), s('cis', 16, P2(-29)), s('i0', 32, P2(-31) * SC), s('crc', 16, P2(-5)),
    s('omega', 32, P2(-31) * SC), s('omegaDot', 24, P2(-43) * SC), s(null, 10), s('tgd', 10, P2(-32)),
    u(null, 2), u(null, 1), u('health', 2), u('healthDvs', 1), u(null, 2),
  ],
  1042: [
    u('prn', 6), u('week', 13), u(null, 4), s('iDot', 14, P2(-43) * SC), u('iode', 5), u('toc', 17, 8),
    s('af2', 11, P2(-66)), s('af1', 22, P2(-50)), s('af0', 24, P2(-33)), u(null, 5), s('crs', 18, P2(-6)),
    s('deltaN', 16, P2(-43) * SC), s('m0', 32, P2(-31) * SC), s('cuc', 18, P2(-31)), u('e', 32, P2(-33)),
    s('cus', 18, P2(-31)), u('sqrtA', 32, P2(-19)), u('toes', 17, 8), s('cic', 18, P2(-31)),
    s('omega0', 32, P2(-31) * SC), s('cis', 18, P2(-31)), s('i0', 32, P2(-31) * SC), s('crc', 18, P2(-6)),
    s('omega', 32, P2(-31) * SC), s('omegaDot', 24, P2(-43) * SC), s('tgd', 10, 1e-10), s(null, 10),
    u('health', 1), u(null, 1),
  ],
};

export const STATION_MSG_TYPES = [1005, 1006, 1032] as const;
export const EPHEMERIS_MSG_TYPES: Record<number, GnssSystem> = { 1019: 'G', 1046: 'E', 1042: 'C' };

function readLayout(payload: Uint8Array, layout: readonly Field[]) {
  const out: Record<string, number> = {};
  let pos = 12;
  for (const [name, bits, signed, scale] of layout) {
    if (name) out[name] = (signed ? getbits : getbitu)(payload, pos, bits) * scale;
    pos += bits;
  }
  return out;
}

function writeLayout(type: number, layout: readonly Field[], values: Record<string, unknown>) {
  const w = new BitWriter().put(type, 12);
  for (const [name, bits, , scale] of layout) {
    w.put(name ? Math.round(Number(values[name] ?? 0) / scale) : 0, bits);
  }
  return w.finish();
}

const layoutOf = (type: number) => {
  const layout = LAYOUTS[type];
  if (!layout) throw new RangeError(`No fixed layout for message ${type}`);
  return layout;
};

export interface StationArp {
  msgType: 1005 | 1006 | 1032;
  stationId: number;
  ecef: Ecef;
  antennaHeightM: number | null;
}

export function decodeStationArp(payload: Uint8Array): StationArp {
  const type = messageType(payload) as StationArp['msgType'];
  const f = readLayout(payload, layoutOf(type));
  return {
    msgType: type,
    stationId: f.stationId!,
    ecef: { x: f.x!, y: f.y!, z: f.z! },
    antennaHeightM: type === 1006 ? f.antennaHeight! : null,
  };
}

export function encodeStationArp(arp: StationArp) {
  return writeLayout(arp.msgType, layoutOf(arp.msgType), {
    stationId: arp.stationId,
    ...arp.ecef,
    antennaHeight: arp.antennaHeightM ?? 0,
  });
}

/** Week counter width and its offset to the GPS week, per message. */
const WEEK_RULES: Record<GnssSystem, { modulus: number; offset: number; timeOffset: number }> = {
  G: { modulus: 1024, offset: 0, timeOffset: 0 },
  // Galileo week 0 is GPS week 1024.
  E: { modulus: 4096, offset: 1024, timeOffset: 0 },
  // BeiDou week 0 is GPS week 1356, and BDT runs 14 s behind GPST.
  C: { modulus: 8192, offset: 1356, timeOffset: BDT_OFFSET_S },
};

/** Decodes 1019/1046/1042, resolving the truncated week against `refGps` (current GPS time). */
export function decodeEphemeris(payload: Uint8Array, refGps: number): Ephemeris {
  const type = messageType(payload);
  const sys = EPHEMERIS_MSG_TYPES[type];
  if (!sys) throw new RangeError(`Message ${type} is not an ephemeris`);
  const f = readLayout(payload, layoutOf(type)) as Record<string, number>;
  const rule = WEEK_RULES[sys];
  const refWeek = Math.floor((refGps - rule.timeOffset) / SECONDS_PER_WEEK);
  const week = resolveWeek(f.week!, rule.modulus, rule.offset, refWeek);
  const toe = week * SECONDS_PER_WEEK + f.toes! + rule.timeOffset;
  let toc = week * SECONDS_PER_WEEK + f.toc! + rule.timeOffset;
  if (toc - toe > SECONDS_PER_WEEK / 2) toc -= SECONDS_PER_WEEK;
  else if (toe - toc > SECONDS_PER_WEEK / 2) toc += SECONDS_PER_WEEK;
  return {
    sys,
    prn: f.prn!,
    toe,
    toc,
    toes: f.toes!,
    sqrtA: f.sqrtA!,
    e: f.e!,
    i0: f.i0!,
    omega0: f.omega0!,
    omega: f.omega!,
    m0: f.m0!,
    deltaN: f.deltaN!,
    iDot: f.iDot!,
    omegaDot: f.omegaDot!,
    cuc: f.cuc!,
    cus: f.cus!,
    crc: f.crc!,
    crs: f.crs!,
    cic: f.cic!,
    cis: f.cis!,
    af0: f.af0!,
    af1: f.af1!,
    af2: f.af2!,
    tgd: f.tgd!,
    iode: f.iode!,
    health: sys === 'E' ? f.health! * 2 + f.healthDvs! : f.health!,
  };
}

const EPHEMERIS_TYPE: Record<GnssSystem, number> = { G: 1019, E: 1046, C: 1042 };

export function encodeEphemeris(eph: Ephemeris) {
  const rule = WEEK_RULES[eph.sys];
  const week = Math.floor((eph.toe - rule.timeOffset) / SECONDS_PER_WEEK);
  const tocSow = eph.toc - rule.timeOffset - week * SECONDS_PER_WEEK;
  return writeLayout(EPHEMERIS_TYPE[eph.sys], layoutOf(EPHEMERIS_TYPE[eph.sys]), {
    ...eph,
    week: (week - rule.offset) % rule.modulus,
    toc: ((tocSow % SECONDS_PER_WEEK) + SECONDS_PER_WEEK) % SECONDS_PER_WEEK,
    health: eph.sys === 'E' ? eph.health >> 1 : eph.health,
    healthDvs: eph.sys === 'E' ? eph.health & 1 : 0,
  });
}

/** Base message number of each system's MSM family (MSMn = base + n). */
export const MSM_BASE: Record<GnssSystem, number> = { G: 1070, E: 1090, C: 1120 };

/** System and level (1–7) of an MSM message number, or null for other messages. */
export function msmInfo(type: number): { sys: GnssSystem; level: number } | null {
  const level = type % 10;
  const sys = (Object.keys(MSM_BASE) as GnssSystem[]).find((k) => MSM_BASE[k] === type - level);
  return sys && level >= 1 && level <= 7 ? { sys, level } : null;
}

/** Light-milliseconds: MSM ranges are counted in them. */
export const RANGE_MS_M = 299_792.458;
/** Fields before the satellite mask: type, station, epoch, flags. */
export const MSM_HEADER_BITS = 12 + 12 + 30 + 1 + 3 + 7 + 2 + 2 + 1 + 3;

/** Per-cell field widths of MSM4–7 (MSM1–3 carry no pseudorange worth using here). */
export function msmCellLayout(level: number) {
  const extended = level >= 6;
  return {
    satExtra: level === 5 || level === 7,
    prBits: extended ? 20 : 15,
    prScale: extended ? 2 ** -29 : 2 ** -24,
    cpBits: extended ? 24 : 22,
    cpScale: extended ? 2 ** -31 : 2 ** -29,
    lockBits: extended ? 10 : 4,
    cnrBits: extended ? 10 : 6,
    cnrScale: extended ? 2 ** -4 : 1,
    cellRate: level === 5 || level === 7,
  };
}

/**
 * MSM signal-mask ids (1-based) of the single-frequency signal used per
 * system, in order of preference: GPS L1 C/A, Galileo E1 C or B+C, BeiDou B1I.
 */
export const PRIMARY_SIGNAL_IDS: Record<GnssSystem, readonly number[]> = {
  G: [2],
  E: [2, 5],
  C: [2],
};
