import { corsMockFeed } from '@rtk/shared';
import { describe, expect, it } from 'vitest';
import { Rtcm3Framer } from './rtcm3-framer';

const T0 = 2442 * 604800 + 7200;
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('Rtcm3Framer', () => {
  const frames = corsMockFeed().frames(T0);
  const types = frames.map((f) => ((f[3]! << 4) | (f[4]! >> 4)) & 0xfff);

  it('splits a stream into CRC-checked frames', () => {
    const out = new Rtcm3Framer().push(concat(frames));
    expect(out.map((f) => f.type)).toEqual(types);
  });

  it('resynchronises after garbage, including a fake preamble', () => {
    const garbage = Uint8Array.from([0x00, 0xd3, 0x00, 0x05, 0x11, 0x22, 0xd3, 0xff, 0x13]);
    const framer = new Rtcm3Framer();
    const out = framer.push(concat([garbage, frames[0]!, garbage, ...frames.slice(1)]));
    expect(out.map((f) => f.type)).toEqual(types);
    expect(framer.crcErrors).toBeGreaterThan(0);
  });

  it('joins a frame split across TCP chunks', () => {
    const stream = concat(frames);
    const framer = new Rtcm3Framer();
    const out = [];
    for (let i = 0; i < stream.length; i += 7) out.push(...framer.push(stream.subarray(i, i + 7)));
    expect(out.map((f) => f.type)).toEqual(types);
  });

  it('drops a frame with a corrupted byte and keeps the next one', () => {
    const bad = frames[0]!.slice();
    bad[10]! ^= 0x40;
    const out = new Rtcm3Framer().push(concat([bad, frames[1]!]));
    expect(out.map((f) => f.type)).toEqual([types[1]]);
  });
});
