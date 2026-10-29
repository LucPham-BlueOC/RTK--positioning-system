import {
  RTCM3_CRC_BYTES,
  RTCM3_HEADER_BYTES,
  RTCM3_PREAMBLE,
  crc24q,
  getbitu,
  messageType,
} from '@rtk/shared';

export interface RtcmFrame {
  type: number;
  payload: Uint8Array;
}

/**
 * Splits a TCP byte stream into CRC-checked RTCM3 frames. A bad CRC means the
 * preamble was a data byte, so the search resumes one byte later.
 */
export class Rtcm3Framer {
  private buf = new Uint8Array(0);
  crcErrors = 0;

  push(chunk: Uint8Array): RtcmFrame[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);

    const frames: RtcmFrame[] = [];
    let i = 0;
    for (;;) {
      while (i < merged.length && merged[i] !== RTCM3_PREAMBLE) i++;
      if (merged.length - i < RTCM3_HEADER_BYTES) break;
      const len = getbitu(merged, (i + 1) * 8 + 6, 10);
      const end = i + RTCM3_HEADER_BYTES + len + RTCM3_CRC_BYTES;
      if (end > merged.length) break;
      const crc = getbitu(merged, (end - RTCM3_CRC_BYTES) * 8, 24);
      if (len > 0 && crc24q(merged, i, end - RTCM3_CRC_BYTES) === crc) {
        const payload = merged.slice(i + RTCM3_HEADER_BYTES, end - RTCM3_CRC_BYTES);
        frames.push({ type: messageType(payload), payload });
        i = end;
      } else {
        this.crcErrors++;
        i++;
      }
    }
    this.buf = merged.slice(i);
    return frames;
  }
}
