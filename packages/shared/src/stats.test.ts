import { describe, expect, it } from 'vitest';
import { fromEnu, haversine } from './geo';
import { pairSamples } from './pairing';
import {
  DEFAULT_STATIC_FILTER,
  errorStats,
  filterForStatic,
  mean,
  median,
  pointCloudStats,
  staticResult,
  std,
} from './stats';

const ORIGIN = { lat: 10.7769, lon: 106.7009 };

describe('basic statistics', () => {
  it('computes mean, sample std and median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('returns NaN for too little data', () => {
    expect(mean([])).toBeNaN();
    expect(std([1])).toBeNaN();
  });
});

describe('errorStats', () => {
  it('reports bias, spread and worst case against the tape distance', () => {
    // Distances 19, 21, 22 m against a 20 m tape: errors -1, +1, +2.
    const a = [0, 1000, 2000].map((t) => ({ tServer: t, ...ORIGIN, accuracy: 1 }));
    const b = [19, 21, 22].map((east, i) => ({
      tServer: i * 1000,
      ...fromEnu({ east, north: 0 }, ORIGIN),
      accuracy: 1,
    }));
    const s = errorStats(pairSamples(a, b), 20);
    expect(s.n).toBe(3);
    expect(s.bias).toBeCloseTo(2 / 3, 3);
    expect(s.mae).toBeCloseTo(4 / 3, 3);
    expect(s.rmse).toBeCloseTo(Math.sqrt(6 / 3), 3);
    expect(s.maxAbs).toBeCloseTo(2, 3);
    expect(s.std).toBeCloseTo(std([-1, 1, 2]), 3);
    // sigma = sqrt(2) ≈ 1.41, so |e| of 1, 1 fit and 2 does not.
    expect(s.withinSigma).toBeCloseTo(2 / 3, 5);
  });
});

describe('static averaging', () => {
  const ring = (centreEast: number) =>
    [0, 90, 180, 270].map((deg) =>
      fromEnu(
        {
          east: centreEast + 2 * Math.cos((deg * Math.PI) / 180),
          north: 2 * Math.sin((deg * Math.PI) / 180),
        },
        ORIGIN,
      ),
    );

  it('averages each point cloud to its centre', () => {
    const r = staticResult(ring(0), ring(20))!;
    expect(r.distanceM).toBeCloseTo(20, 3);
    expect(haversine(r.a.mean, ORIGIN)).toBeLessThan(0.001);
    expect(r.a.cep50).toBeCloseTo(2, 3);
  });

  it('reports per-axis spread', () => {
    const s = pointCloudStats(ring(0), ORIGIN)!;
    expect(s.stdEast).toBeCloseTo(std([2, 0, -2, 0]), 3);
    expect(s.stdNorth).toBeCloseTo(std([0, 2, 0, -2]), 3);
  });

  it('defaults to warm-up 3 s, 30 m ceiling and a 20 s window', () => {
    expect(DEFAULT_STATIC_FILTER).toEqual({ warmupS: 3, maxAccuracyM: 30, timeoutS: 20 });
  });

  it('keeps in-window samples that fit the accuracy ceiling', () => {
    const samples = [
      { tServer: 1000, lat: 0, lon: 0, accuracy: 3 },
      { tServer: 4000, lat: 0, lon: 0, accuracy: 3 },
      { tServer: 4000, lat: 0, lon: 0, accuracy: 45 },
    ];
    const r = filterForStatic(samples, 0);
    expect(r.samples.map((s) => s.tServer)).toEqual([4000]);
    expect(r.fellBack).toBe(false);
  });

  it('falls back to the best seen fix when the window has none within accuracy', () => {
    const samples = [
      { tServer: 4000, lat: 0, lon: 0, accuracy: 45 },
      { tServer: 15000, lat: 0, lon: 0, accuracy: 40 },
      { tServer: 30000, lat: 0, lon: 0, accuracy: 30 },
    ];
    const r = filterForStatic(samples, 0);
    expect(r.samples.map((s) => [s.tServer, s.accuracy])).toEqual([[15000, 40]]);
    expect(r.fellBack).toBe(true);
  });

  it('returns an empty set only when nothing was seen by the timeout', () => {
    const r = filterForStatic(
      [{ tServer: 21000, lat: 0, lon: 0, accuracy: 30 }],
      0,
    );
    expect(r.samples).toEqual([]);
    expect(r.fellBack).toBe(true);
  });

  it('returns null without data on both devices', () => {
    expect(staticResult([], ring(0))).toBeNull();
    expect(staticResult([], [])).toBeNull();
  });
});
