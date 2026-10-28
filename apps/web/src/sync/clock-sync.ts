const KEEP = 10;

export interface ClockEstimate {
  /** Add to a local timestamp to get server time. */
  offsetMs: number;
  rttMs: number;
}

/**
 * NTP-style offset: the server stamped `ts` somewhere between t0 and t3, so
 * assume the midpoint. Trust the sample with the lowest round trip among the
 * last few, since it had the least room for asymmetric delay.
 */
export class ClockSync {
  private samples: ClockEstimate[] = [];

  add(t0: number, ts: number, t3: number): ClockEstimate {
    const rttMs = t3 - t0;
    this.samples.push({ offsetMs: ts - (t0 + t3) / 2, rttMs });
    if (this.samples.length > KEEP) this.samples.shift();
    return this.best()!;
  }

  best(): ClockEstimate | null {
    return this.samples.reduce<ClockEstimate | null>(
      (b, s) => (!b || s.rttMs < b.rttMs ? s : b),
      null,
    );
  }
}
