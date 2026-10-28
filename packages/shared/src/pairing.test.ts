import { describe, expect, it } from 'vitest';
import { fromEnu } from './geo';
import { pairSamples } from './pairing';

const ORIGIN = { lat: 21.0285, lon: 105.8048 };
const at = (t: number, east = 0, accuracy = 4) => ({
  tServer: t,
  ...fromEnu({ east, north: 0 }, ORIGIN),
  accuracy,
});

describe('pairSamples', () => {
  it('pairs 1 Hz streams with a constant clock offset', () => {
    const a = [0, 1000, 2000, 3000].map((t) => at(t));
    const b = [0, 1000, 2000, 3000].map((t) => at(t + 300, 20, 3));
    const pairs = pairSamples(a, b);
    expect(pairs).toHaveLength(4);
    expect(pairs.every((p) => p.dtMs === 300)).toBe(true);
    expect(pairs[0]!.distanceM).toBeCloseTo(20, 3);
    expect(pairs[0]!.sigmaM).toBe(5);
  });

  it('drops pairs at or beyond the window', () => {
    expect(pairSamples([at(0)], [at(1000)])).toHaveLength(0);
    expect(pairSamples([at(0)], [at(999)])).toHaveLength(1);
    expect(pairSamples([at(0)], [at(500)], 400)).toHaveLength(0);
  });

  it('uses each sample at most once', () => {
    const pairs = pairSamples([at(0), at(100), at(200)], [at(110)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.a.tServer).toBe(100);
  });

  it('skips gaps in either stream', () => {
    const a = [0, 1000, 2000, 6000, 7000].map((t) => at(t));
    const b = [50, 1050, 5050, 6050, 7050].map((t) => at(t));
    const pairs = pairSamples(a, b);
    expect(pairs.map((p) => p.a.tServer)).toEqual([0, 1000, 6000, 7000]);
  });

  it('does not require sorted input', () => {
    const pairs = pairSamples([at(2000), at(0), at(1000)], [at(1010), at(10), at(2010)]);
    expect(pairs.map((p) => p.a.tServer)).toEqual([0, 1000, 2000]);
  });

  it('returns nothing when a stream is empty', () => {
    expect(pairSamples([], [at(0)])).toEqual([]);
    expect(pairSamples([at(0)], [])).toEqual([]);
  });
});
