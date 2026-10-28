import { distanceUncertainty, haversine } from './geo';

export const DEFAULT_PAIRING_WINDOW_MS = 1000;

export interface PairableSample {
  tServer: number;
  lat: number;
  lon: number;
  accuracy: number;
}

export interface SamplePair<T extends PairableSample> {
  a: T;
  b: T;
  /** Midpoint of the two server times. */
  t: number;
  dtMs: number;
  distanceM: number;
  sigmaM: number;
}

/**
 * Match samples of two devices by nearest server time. Each sample is used at
 * most once and only pairs closer than `windowMs` are kept. Inputs need not be sorted.
 */
export function pairSamples<T extends PairableSample>(
  samplesA: readonly T[],
  samplesB: readonly T[],
  windowMs = DEFAULT_PAIRING_WINDOW_MS,
): SamplePair<T>[] {
  const a = [...samplesA].sort((x, y) => x.tServer - y.tServer);
  const b = [...samplesB].sort((x, y) => x.tServer - y.tServer);
  const pairs: SamplePair<T>[] = [];
  let j = 0;

  for (let i = 0; i < a.length && j < b.length; i++) {
    const sa = a[i]!;
    // Advance j while the next B sample is at least as close to sa.
    while (
      j + 1 < b.length &&
      Math.abs(b[j + 1]!.tServer - sa.tServer) <= Math.abs(b[j]!.tServer - sa.tServer)
    ) {
      j++;
    }
    const sb = b[j]!;
    const dt = sb.tServer - sa.tServer;
    if (Math.abs(dt) >= windowMs) continue;

    // If the next A sample is strictly closer to this B sample, let it take the match.
    const next = a[i + 1];
    if (next && Math.abs(sb.tServer - next.tServer) < Math.abs(dt)) continue;

    pairs.push({
      a: sa,
      b: sb,
      t: Math.round((sa.tServer + sb.tServer) / 2),
      dtMs: dt,
      distanceM: haversine(sa, sb),
      sigmaM: distanceUncertainty(sa.accuracy, sb.accuracy),
    });
    j++;
  }
  return pairs;
}
