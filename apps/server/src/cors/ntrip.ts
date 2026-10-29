import net from 'node:net';
import { haversine, type CorsError, type SourcetableMount } from '@rtk/shared';

/** A caster that sends nothing for this long is treated as dead. */
const STREAM_TIMEOUT_MS = 30_000;
const SOURCETABLE_TIMEOUT_MS = 15_000;
const MAX_HEADER_BYTES = 16 * 1024;
const USER_AGENT = 'NTRIP rtk-cors/1.0';
/** Ephemeris messages that let the station error be computed from the stream alone. */
const EPHEMERIS_TYPES = ['1019', '1042', '1046'];

export interface NtripOptions {
  host: string;
  port: number;
  mountpoint: string;
  user: string;
  pass: string;
  v2: boolean;
}

/** Callbacks shared by the NTRIP client and the mock feed. */
export interface FeedHandlers {
  onConnected(): void;
  onData(chunk: Uint8Array): void;
  onError(error: CorsError): void;
  /** Always called exactly once when the source ends, after any onError. */
  onClose(): void;
}

export interface Feed {
  start(handlers: FeedHandlers): { stop(): void };
}

function request(opts: Pick<NtripOptions, 'host' | 'v2'>, path: string, auth?: string) {
  const lines = opts.v2
    ? [`GET ${path} HTTP/1.1`, `Host: ${opts.host}`, 'Ntrip-Version: Ntrip/2.0']
    : [`GET ${path} HTTP/1.0`];
  lines.push(`User-Agent: ${USER_AGENT}`);
  if (auth) lines.push(`Authorization: Basic ${auth}`);
  if (opts.v2) lines.push('Connection: close');
  return `${lines.join('\r\n')}\r\n\r\n`;
}

/** Status line outcome: stream, or the error the hub reports. */
export function classifyResponse(statusLine: string): 'stream' | CorsError {
  if (/^ICY 200/.test(statusLine) || /^HTTP\/1\.[01] 200/.test(statusLine)) return 'stream';
  if (/^SOURCETABLE 200/.test(statusLine)) return 'mountpoint-not-found';
  if (/^HTTP\/1\.[01] 401/.test(statusLine)) return 'auth-failed';
  if (/^HTTP\/1\.[01] 404/.test(statusLine)) return 'mountpoint-not-found';
  return 'connect-failed';
}

/** Removes HTTP/1.1 chunked transfer framing from an NTRIP v2 stream. */
export class ChunkDecoder {
  private buf = Buffer.alloc(0);
  private remaining = 0;
  private needCrlf = false;

  push(chunk: Buffer): Buffer {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: Buffer[] = [];
    for (;;) {
      if (this.remaining > 0) {
        if (this.buf.length === 0) break;
        const n = Math.min(this.remaining, this.buf.length);
        out.push(this.buf.subarray(0, n));
        this.buf = this.buf.subarray(n);
        this.remaining -= n;
        if (this.remaining === 0) this.needCrlf = true;
        continue;
      }
      if (this.needCrlf) {
        if (this.buf.length < 2) break;
        this.buf = this.buf.subarray(2);
        this.needCrlf = false;
      }
      const eol = this.buf.indexOf('\r\n');
      if (eol < 0) break;
      this.remaining =
        parseInt(this.buf.subarray(0, eol).toString('latin1').split(';')[0]!, 16) || 0;
      this.buf = this.buf.subarray(eol + 2);
      if (this.remaining === 0) this.needCrlf = true;
    }
    return Buffer.concat(out);
  }
}

/** Opens one NTRIP connection to a mountpoint and streams its bytes. */
export function ntripFeed(opts: NtripOptions): Feed {
  return {
    start(h) {
      const socket = net.connect({ host: opts.host, port: opts.port });
      const auth = Buffer.from(`${opts.user}:${opts.pass}`).toString('base64');
      let header: Buffer | null = Buffer.alloc(0);
      let chunks: ChunkDecoder | null = null;
      let failed = false;
      const fail = (error: CorsError) => {
        if (failed) return;
        failed = true;
        h.onError(error);
        socket.destroy();
      };

      socket.setTimeout(STREAM_TIMEOUT_MS, () => fail('stream-timeout'));
      socket.on('connect', () => socket.write(request(opts, `/${opts.mountpoint}`, auth)));
      socket.on('error', () => fail('connect-failed'));
      socket.on('close', () => h.onClose());
      socket.on('data', (data: Buffer) => {
        if (header === null) {
          h.onData(chunks ? chunks.push(data) : data);
          return;
        }
        header = Buffer.concat([header, data]);
        const firstEol = header.indexOf('\r\n');
        if (firstEol < 0) {
          if (header.length > MAX_HEADER_BYTES) fail('connect-failed');
          return;
        }
        const status = header.subarray(0, firstEol).toString('latin1');
        const outcome = classifyResponse(status);
        if (outcome !== 'stream') return fail(outcome);
        // v1 casters send a bare "ICY 200 OK" line; v2 sends HTTP headers.
        let bodyStart = firstEol + 2;
        if (status.startsWith('HTTP/')) {
          const end = header.indexOf('\r\n\r\n');
          if (end < 0) {
            if (header.length > MAX_HEADER_BYTES) fail('connect-failed');
            return;
          }
          const headers = header.subarray(0, end).toString('latin1');
          if (/^content-type:\s*gnss\/sourcetable/im.test(headers))
            return fail('mountpoint-not-found');
          if (/^transfer-encoding:\s*chunked/im.test(headers)) chunks = new ChunkDecoder();
          bodyStart = end + 4;
        }
        const rest = header.subarray(bodyStart);
        header = null;
        h.onConnected();
        if (rest.length) h.onData(chunks ? chunks.push(rest) : rest);
      });

      return { stop: () => socket.destroy() };
    },
  };
}

export interface SourcetableEntry {
  mountpoint: string;
  identifier: string;
  format: string;
  formatDetails: string;
  lat: number;
  lon: number;
}

/** STR;mountpoint;identifier;format;format-details;carrier;nav-system;network;country;lat;lon;… */
export function parseSourcetable(text: string): SourcetableEntry[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('STR;'))
    .map((line) => {
      const f = line.split(';');
      return {
        mountpoint: f[1] ?? '',
        identifier: f[2] ?? '',
        format: f[3] ?? '',
        formatDetails: f[4] ?? '',
        lat: Number(f[9]),
        lon: Number(f[10]),
      };
    })
    .filter((e) => e.mountpoint !== '');
}

export const advertisesEphemeris = (formatDetails: string) =>
  (formatDetails.match(/\d{4}/g) ?? []).some((t) => EPHEMERIS_TYPES.includes(t));

/** Mountpoints that advertise ephemeris, nearest to `near` first when it is known. */
export function mountsWithEphemeris(
  entries: SourcetableEntry[],
  near?: { lat: number; lon: number },
): SourcetableMount[] {
  const valid = (e: SourcetableEntry) => Number.isFinite(e.lat) && Number.isFinite(e.lon);
  const list = entries
    .filter((e) => advertisesEphemeris(e.formatDetails) && valid(e))
    .map(({ mountpoint, lat, lon, formatDetails }) => ({ mountpoint, lat, lon, formatDetails }));
  if (near) list.sort((a, b) => haversine(near, a) - haversine(near, b));
  return list;
}

/** Downloads the caster's sourcetable (GET /). */
export function fetchSourcetable(opts: Pick<NtripOptions, 'host' | 'port' | 'v2'>) {
  return new Promise<SourcetableEntry[]>((resolve, reject) => {
    const socket = net.connect({ host: opts.host, port: opts.port });
    const parts: Buffer[] = [];
    let size = 0;
    let tail = Buffer.alloc(0);
    const done = () => {
      socket.destroy();
      resolve(parseSourcetable(Buffer.concat(parts).toString('latin1')));
    };
    socket.setTimeout(SOURCETABLE_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error('sourcetable timeout'));
    });
    socket.on('connect', () => socket.write(request(opts, '/')));
    socket.on('error', reject);
    socket.on('data', (d: Buffer) => {
      parts.push(d);
      size += d.length;
      // The end marker may straddle two chunks.
      const joined = Buffer.concat([tail, d]);
      tail = joined.subarray(-64);
      if (joined.includes('ENDSOURCETABLE') || size > 8 * 1024 * 1024) done();
    });
    socket.on('end', done);
  });
}
