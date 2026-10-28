import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock-sync';

describe('ClockSync', () => {
  it('assumes the server stamped at the midpoint of the round trip', () => {
    const c = new ClockSync();
    // Server clock is 5 s ahead; 100 ms symmetric round trip.
    expect(c.add(1000, 6050, 1100)).toEqual({ offsetMs: 5000, rttMs: 100 });
  });

  it('prefers the lowest round trip', () => {
    const c = new ClockSync();
    c.add(0, 5400, 600); // slow, skewed: offset 5100
    const best = c.add(1000, 6020, 1040); // fast: offset 5000
    c.add(2000, 7300, 2400); // slow again
    expect(c.best()).toEqual(best);
  });

  it('forgets old samples', () => {
    const c = new ClockSync();
    c.add(0, 10, 10); // very fast, will age out
    for (let i = 1; i <= 10; i++) c.add(i * 1000, i * 1000 + 100, i * 1000 + 100);
    expect(c.best()!.rttMs).toBe(100);
  });
});
