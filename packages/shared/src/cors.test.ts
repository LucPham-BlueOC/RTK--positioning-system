import { describe, expect, it } from 'vitest';
import { serverMessageSchema } from './schema';

describe('CORS server messages', () => {
  it('accepts state, epoch and history', () => {
    const epoch = {
      at: 1_793_000_000_000,
      sats: [{ sys: 'G', prn: 5, residualM: 1.2, elevationDeg: 40, cn0: 45 }],
      clockBiasM: { G: 25.3 },
      rmsM: 1.2,
      maxAbsM: 1.2,
      skipped: [{ sys: 'C', prn: 7, reason: 'low-elevation' }],
    };
    const state = {
      status: 'connected',
      mock: true,
      host: 'mock',
      port: 0,
      mountpoint: 'MOCK',
      observedMsgTypes: [{ msgType: 1077, count: 3, firstAt: 1, lastAt: 3 }],
      ephemerisCount: { G: 8 },
      diagnosis: [],
    };
    for (const msg of [
      { type: 'cors.state', cors: state },
      { type: 'cors.epoch', epoch },
      { type: 'cors.history', epochs: [epoch] },
    ]) {
      expect(serverMessageSchema.safeParse(msg).success).toBe(true);
    }
  });

  it('rejects GLONASS, which is not handled yet', () => {
    const msg = {
      type: 'cors.epoch',
      epoch: {
        at: 1,
        sats: [{ sys: 'R', prn: 1, residualM: 0, elevationDeg: 0, cn0: null }],
        clockBiasM: {},
        rmsM: 0,
        maxAbsM: 0,
        skipped: [],
      },
    };
    expect(serverMessageSchema.safeParse(msg).success).toBe(false);
  });
});
