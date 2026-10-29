import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChunkDecoder,
  advertisesEphemeris,
  fetchSourcetable,
  mountsWithEphemeris,
  ntripFeed,
  parseSourcetable,
  type FeedHandlers,
} from './ntrip';

const SOURCETABLE = [
  'SOURCETABLE 200 OK',
  'Content-Type: text/plain',
  '',
  'CAS;rtk2go.com;2101;RTK2go;SNIP;0;USA;0.00;0.00;0.0.0.0;0;http://rtk2go.com',
  'STR;FAR;Far;RTCM 3.2;1005(10),1077(1);2;GPS;SNIP;USA;40.00;-75.00;1;0;sNTRIP;none;B;N;0;',
  'STR;NEAR;Near;RTCM 3.2;1006(10),1077(1),1097(1),1019(30),1046(30);2;GPS+GAL;SNIP;VNM;10.80;106.70;1;0;sNTRIP;none;B;N;0;',
  'STR;FAREPH;Far eph;RTCM 3.3;1005(5),1127(1),1042(60);2;BDS;SNIP;DEU;50.10;8.60;1;0;sNTRIP;none;B;N;0;',
  'ENDSOURCETABLE',
  '',
].join('\r\n');

let server: net.Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

/** Fake caster: records the request and answers with `reply`. */
function caster(reply: (req: string, socket: net.Socket) => void) {
  const requests: string[] = [];
  server = net.createServer((socket) => {
    let req = '';
    socket.on('data', (d) => {
      req += d.toString('latin1');
      if (req.includes('\r\n\r\n')) {
        requests.push(req);
        reply(req, socket);
      }
    });
  });
  return new Promise<{ port: number; requests: string[] }>((resolve) =>
    server!.listen(0, '127.0.0.1', () =>
      resolve({ port: (server!.address() as AddressInfo).port, requests }),
    ),
  );
}

function run(port: number, v2 = false) {
  const events: string[] = [];
  const data: Buffer[] = [];
  return new Promise<{ events: string[]; data: Buffer }>((resolve) => {
    const h: FeedHandlers = {
      onConnected: () => events.push('connected'),
      onData: (c) => data.push(Buffer.from(c)),
      onError: (e) => events.push(e),
      onClose: () => resolve({ events, data: Buffer.concat(data) }),
    };
    ntripFeed({
      host: '127.0.0.1',
      port,
      mountpoint: 'NEAR',
      user: 'me@example.com',
      pass: 'none',
      v2,
    }).start(h);
  });
}

describe('ntripFeed', () => {
  it('sends an NTRIP v1 request with Basic auth and streams the body', async () => {
    const { port, requests } = await caster((_, s) => {
      s.write('ICY 200 OK\r\n');
      s.end(Buffer.from([0xd3, 0x00, 0x01]));
    });
    const { events, data } = await run(port);
    expect(requests[0]).toMatch(/^GET \/NEAR HTTP\/1\.0\r\n/);
    expect(requests[0]).toContain(
      `Authorization: Basic ${Buffer.from('me@example.com:none').toString('base64')}`,
    );
    expect(requests[0]).toContain('User-Agent: NTRIP ');
    expect(events).toEqual(['connected']);
    expect([...data]).toEqual([0xd3, 0x00, 0x01]);
  });

  it('reports wrong credentials', async () => {
    const { port } = await caster((_, s) => s.end('HTTP/1.0 401 Unauthorized\r\n\r\n'));
    expect((await run(port)).events).toEqual(['auth-failed']);
  });

  it('reports a missing mountpoint when the caster answers with its sourcetable', async () => {
    const { port } = await caster((_, s) => s.end(SOURCETABLE));
    expect((await run(port)).events).toEqual(['mountpoint-not-found']);
  });

  it('un-chunks an NTRIP v2 stream', async () => {
    const { port, requests } = await caster((_, s) => {
      s.write(
        'HTTP/1.1 200 OK\r\nContent-Type: gnss/data\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc',
      );
      setTimeout(() => s.end('\r\n2\r\nde\r\n0\r\n\r\n'), 20);
    });
    const { events, data } = await run(port, true);
    expect(requests[0]).toMatch(/^GET \/NEAR HTTP\/1\.1\r\n/);
    expect(requests[0]).toContain('Ntrip-Version: Ntrip/2.0');
    expect(events).toEqual(['connected']);
    expect(data.toString()).toBe('abcde');
  });

  it('reports a refused connection', async () => {
    const { port } = await caster(() => undefined);
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
    expect((await run(port)).events).toEqual(['connect-failed']);
  });
});

describe('ChunkDecoder', () => {
  it('handles chunk headers split across reads', () => {
    const d = new ChunkDecoder();
    const out = ['1', '0\r\n0123456789abcdef', '\r', '\n0\r\n\r\n'].map((s) =>
      d.push(Buffer.from(s)).toString(),
    );
    expect(out.join('')).toBe('0123456789abcdef');
  });
});

describe('sourcetable', () => {
  it('parses STR lines and keeps mountpoints that broadcast ephemeris, nearest first', () => {
    const entries = parseSourcetable(SOURCETABLE);
    expect(entries.map((e) => e.mountpoint)).toEqual(['FAR', 'NEAR', 'FAREPH']);
    expect(advertisesEphemeris(entries[0]!.formatDetails)).toBe(false);
    const list = mountsWithEphemeris(entries, { lat: 10.77, lon: 106.68 });
    expect(list.map((m) => m.mountpoint)).toEqual(['NEAR', 'FAREPH']);
    expect(list[0]).toMatchObject({ lat: 10.8, lon: 106.7 });
  });

  it('downloads the table with GET /', async () => {
    const { port, requests } = await caster((_, s) => s.end(SOURCETABLE));
    const entries = await fetchSourcetable({ host: '127.0.0.1', port, v2: false });
    expect(requests[0]).toMatch(/^GET \/ HTTP\/1\.0/);
    expect(entries).toHaveLength(3);
  });
});
