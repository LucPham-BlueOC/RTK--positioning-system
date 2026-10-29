import { corsMockFeed, unixMsToGps, type CorsMockOptions } from '@rtk/shared';
import type { Feed } from './ntrip';

/** Plays the synthetic station as if it were a caster stream, one epoch per second. */
export function mockFeed(opts: CorsMockOptions, now: () => number = Date.now): Feed {
  return {
    start(h) {
      const mock = corsMockFeed(opts);
      const tick = () => {
        const frames = mock.frames(Math.floor(unixMsToGps(now())));
        const chunk = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
        let at = 0;
        for (const f of frames) {
          chunk.set(f, at);
          at += f.length;
        }
        h.onData(chunk);
      };
      const connect = setTimeout(() => {
        h.onConnected();
        tick();
      }, 0);
      const timer = setInterval(tick, 1000);
      return {
        stop() {
          clearTimeout(connect);
          clearInterval(timer);
          h.onClose();
        },
      };
    },
  };
}
