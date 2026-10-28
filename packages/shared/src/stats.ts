import { fromEnu, haversine, toEnu, type Enu, type LatLon } from './geo';
import type { PairableSample, SamplePair } from './pairing';

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function std(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface ErrorStats {
  n: number;
  /** mean(e): positive means the phones read longer than the tape. */
  bias: number;
  mae: number;
  std: number;
  rmse: number;
  maxAbs: number;
  /** Share of pairs whose |error| fits inside the OS-reported sigma. */
  withinSigma: number;
}

export function errorStats<T extends PairableSample>(
  pairs: readonly SamplePair<T>[],
  trueDistanceM: number,
): ErrorStats {
  const errors = pairs.map((p) => p.distanceM - trueDistanceM);
  const abs = errors.map(Math.abs);
  return {
    n: errors.length,
    bias: mean(errors),
    mae: mean(abs),
    std: std(errors),
    rmse: Math.sqrt(mean(errors.map((e) => e * e))),
    maxAbs: abs.length ? Math.max(...abs) : NaN,
    withinSigma: pairs.length
      ? pairs.filter((p, i) => abs[i]! <= p.sigmaM).length / pairs.length
      : NaN,
  };
}

export interface StaticFilter {
  /** Samples worse than this are dropped from the average. */
  maxAccuracyM: number;
  /** Samples in the first seconds of a session are dropped while the fix settles. */
  warmupS: number;
}

export const DEFAULT_STATIC_FILTER: StaticFilter = { maxAccuracyM: 30, warmupS: 5 };

export function filterForStatic<T extends PairableSample>(
  samples: readonly T[],
  sessionStart: number,
  filter: StaticFilter = DEFAULT_STATIC_FILTER,
): T[] {
  const from = sessionStart + filter.warmupS * 1000;
  return samples.filter((s) => s.tServer >= from && s.accuracy <= filter.maxAccuracyM);
}

export interface PointCloudStats {
  n: number;
  mean: LatLon;
  stdEast: number;
  stdNorth: number;
  /** Radius around the mean containing half the points. */
  cep50: number;
}

/** Average a static point cloud in local metres (never in raw degrees). */
export function pointCloudStats(points: readonly LatLon[], origin: LatLon): PointCloudStats | null {
  if (!points.length) return null;
  const enu = points.map((p) => toEnu(p, origin));
  const c: Enu = { east: mean(enu.map((p) => p.east)), north: mean(enu.map((p) => p.north)) };
  return {
    n: points.length,
    mean: fromEnu(c, origin),
    stdEast: std(enu.map((p) => p.east)),
    stdNorth: std(enu.map((p) => p.north)),
    cep50: median(enu.map((p) => Math.hypot(p.east - c.east, p.north - c.north))),
  };
}

export interface StaticResult {
  a: PointCloudStats;
  b: PointCloudStats;
  distanceM: number;
}

export function staticResult(
  pointsA: readonly LatLon[],
  pointsB: readonly LatLon[],
): StaticResult | null {
  const origin = pointsA[0] ?? pointsB[0];
  if (!origin) return null;
  const a = pointCloudStats(pointsA, origin);
  const b = pointCloudStats(pointsB, origin);
  if (!a || !b) return null;
  return { a, b, distanceM: haversine(a.mean, b.mean) };
}
