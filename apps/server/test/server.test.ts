import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import {
  fromEnu,
  type ClientMessageInput,
  type SampleInput,
  type ServerMessage,
} from '@rtk/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

type App = Awaited<ReturnType<typeof buildApp>>['app'];

/** Test client that buffers server messages so none are lost between awaits. */
class Client {
  private queue: ServerMessage[] = [];
  private waiters: ((m: ServerMessage) => void)[] = [];
  readonly deviceId = randomUUID();

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      const w = this.waiters.shift();
      if (w) w(msg);
      else this.queue.push(msg);
    });
  }

  send(msg: ClientMessageInput) {
    this.ws.send(JSON.stringify(msg));
  }

  next(): Promise<ServerMessage> {
    const m = this.queue.shift();
    return m ? Promise.resolve(m) : new Promise((r) => this.waiters.push(r));
  }

  async expect<T extends ServerMessage['type']>(type: T) {
    for (;;) {
      const m = await this.next();
      if (m.type === type) return m as Extract<ServerMessage, { type: T }>;
    }
  }
}

const ORIGIN = { lat: 21.0285, lon: 105.8048 };
const sample = (seq: number, t: number, east = 0): SampleInput => ({
  seq,
  tDevice: t,
  tServer: t,
  ...fromEnu({ east, north: 0 }, ORIGIN),
  alt: 10,
  accuracy: 4,
  altAccuracy: 3,
  speed: null,
  heading: null,
  source: 'gnss-inferred',
});

let app: App;
const connect = async () => new Client(await app.injectWS('/ws'));

async function createRoom(name = 'Máy A') {
  const a = await connect();
  a.send({ type: 'room.create', deviceId: a.deviceId, name });
  const state = await a.expect('room.state');
  await a.expect('sample.history');
  return { a, code: state.room.code };
}

beforeEach(async () => {
  ({ app } = await buildApp({
    ...loadConfig({}),
    databasePath: ':memory:',
    webDistPath: '/nonexistent',
  }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('rooms', () => {
  it('creates a room with a readable 4-character code', async () => {
    const { code } = await createRoom();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });

  it('lets a second device join and shows both as online', async () => {
    const { a, code } = await createRoom();
    const b = await connect();
    b.send({ type: 'room.join', code: code.toLowerCase(), deviceId: b.deviceId, name: 'Máy B' });
    const state = await b.expect('room.state');
    expect(state.room.devices.map((d) => [d.name, d.online])).toEqual([
      ['Máy A', true],
      ['Máy B', true],
    ]);
    const seenByA = await a.expect('room.state');
    expect(seenByA.room.devices).toHaveLength(2);
  });

  it('refuses a third device but lets a known device rejoin', async () => {
    const { code } = await createRoom();
    const b = await connect();
    b.send({ type: 'room.join', code, deviceId: b.deviceId, name: 'Máy B' });
    await b.expect('sample.history');

    const c = await connect();
    c.send({ type: 'room.join', code, deviceId: c.deviceId, name: 'Máy C' });
    expect((await c.expect('error')).code).toBe('room-full');

    const b2 = await connect();
    b2.send({ type: 'room.join', code, deviceId: b.deviceId, name: 'Máy B' });
    expect((await b2.expect('room.state')).room.devices).toHaveLength(2);
  });

  it('reports unknown rooms', async () => {
    const c = await connect();
    c.send({ type: 'room.join', code: 'ZZZZ', deviceId: c.deviceId, name: 'X' });
    expect((await c.expect('error')).code).toBe('room-not-found');
  });

  it('rejects malformed messages', async () => {
    const c = await connect();
    c.ws.send('{"type":"sample.batch"}');
    expect((await c.expect('error')).code).toBe('bad-message');
  });
});

describe('clock', () => {
  it('echoes t0 with server time', async () => {
    const c = await connect();
    const before = Date.now();
    c.send({ type: 'clock.ping', t0: 123 });
    const pong = await c.expect('clock.pong');
    expect(pong.t0).toBe(123);
    expect(pong.ts).toBeGreaterThanOrEqual(before);
  });
});

describe('samples', () => {
  it('acks, stores once, and broadcasts only new samples to the other device', async () => {
    const { a, code } = await createRoom();
    const b = await connect();
    b.send({ type: 'room.join', code, deviceId: b.deviceId, name: 'Máy B' });
    await b.expect('sample.history');

    const t = Date.now();
    a.send({ type: 'sample.batch', samples: [sample(0, t), sample(1, t + 1000)] });
    expect((await a.expect('sample.ack')).maxSeq).toBe(1);
    expect((await b.expect('sample.broadcast')).samples).toHaveLength(2);

    // Resend after a reconnect: one duplicate, one new.
    a.send({ type: 'sample.batch', samples: [sample(1, t + 1000), sample(2, t + 2000)] });
    expect((await a.expect('sample.ack')).maxSeq).toBe(2);
    const second = await b.expect('sample.broadcast');
    expect(second.samples.map((s) => s.seq)).toEqual([2]);

    const late = await connect();
    late.send({ type: 'room.join', code, deviceId: a.deviceId, name: 'Máy A' });
    expect((await late.expect('sample.history')).samples).toHaveLength(3);
  });
});

describe('static sessions and CSV', () => {
  it('tags samples with the session window and exports pairs against the tape distance', async () => {
    const { a, code } = await createRoom();
    const b = await connect();
    b.send({ type: 'room.join', code, deviceId: b.deviceId, name: 'Máy B' });
    await b.expect('sample.history');

    a.send({ type: 'session.truth', trueDistanceM: 20 });
    a.send({ type: 'session.start', durationS: 60 });
    let state = await b.expect('room.state');
    while (!state.room.sessions.length) state = await b.expect('room.state');
    const session = state.room.sessions[0]!;
    expect(session.trueDistanceM).toBe(20);
    expect(session.endedAt).toBeNull();

    const t = session.startedAt + 1000;
    a.send({ type: 'sample.batch', samples: [0, 1, 2].map((i) => sample(i, t + i * 1000)) });
    b.send({
      type: 'sample.batch',
      samples: [0, 1, 2].map((i) => sample(i, t + i * 1000 + 200, 21)),
    });
    await a.expect('sample.ack');
    await b.expect('sample.ack');

    a.send({ type: 'session.stop' });
    state = await a.expect('room.state');
    while (state.room.sessions[0]?.endedAt === null) state = await a.expect('room.state');

    const res = await app.inject(`/api/rooms/${code}/export.csv?kind=pairs&session=${session.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const [header, ...rows] = res.body.trim().split('\n');
    expect(header).toContain('distance_m');
    expect(rows).toHaveLength(3);
    const cols = header!.split(',');
    const row = rows[0]!.split(',');
    expect(Number(row[cols.indexOf('distance_m')])).toBeCloseTo(21, 3);
    expect(Number(row[cols.indexOf('error_m')])).toBeCloseTo(1, 3);

    const samples = await app.inject(`/api/rooms/${code}/export.csv?kind=samples`);
    const lines = samples.body.trim().split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[1]).toContain(session.id);
    expect(lines[1]).toContain('Máy A');
  });

  it('refuses a second concurrent session', async () => {
    const { a } = await createRoom();
    a.send({ type: 'session.start', durationS: 60 });
    a.send({ type: 'session.start', durationS: 60 });
    expect((await a.expect('error')).code).toBe('session-active');
  });

  it('returns 404 for unknown rooms', async () => {
    expect((await app.inject('/api/rooms/ZZZZ/export.csv')).statusCode).toBe(404);
  });
});

describe('viewers and leaving', () => {
  it('frees the slot when a device leaves, keeping its samples for export', async () => {
    const { a, code } = await createRoom('Máy tính');
    a.send({ type: 'sample.batch', samples: [sample(0, Date.now())] });
    await a.expect('sample.ack');
    const b = await connect();
    b.send({ type: 'room.join', code, deviceId: b.deviceId, name: 'Máy B' });
    await b.expect('sample.history');

    a.send({ type: 'room.leave' });
    let state = await b.expect('room.state');
    while (state.room.devices.length !== 1) state = await b.expect('room.state');
    expect(state.room.devices[0]!.name).toBe('Máy B');

    const c = await connect();
    c.send({ type: 'room.join', code, deviceId: c.deviceId, name: 'Máy C' });
    const joined = await c.expect('room.state');
    expect(joined.room.devices.map((d) => d.name)).toEqual(['Máy B', 'Máy C']);

    const csv = await app.inject(`/api/rooms/${code}/export.csv?kind=samples`);
    expect(csv.body).toContain('Máy tính');
  });

  it('gives the slot back when a former device rejoins as a viewer', async () => {
    const { a, code } = await createRoom('Máy tính');
    const viewer = await connect();
    viewer.send({
      type: 'room.join',
      code,
      deviceId: a.deviceId,
      name: 'Máy tính',
      role: 'viewer',
    });
    const state = await viewer.expect('room.state');
    expect(state.room.devices).toHaveLength(0);
    expect(state.room.viewerCount).toBe(1);
  });
});

describe('kick', () => {
  async function viewerRoomWithPhones() {
    const laptop = await connect();
    laptop.send({
      type: 'room.create',
      deviceId: laptop.deviceId,
      name: 'Máy tính',
      role: 'viewer',
    });
    const code = (await laptop.expect('room.state')).room.code;
    const phones = [await connect(), await connect()];
    for (const p of phones) {
      p.send({ type: 'room.join', code, deviceId: p.deviceId, name: 'Máy' });
      await p.expect('sample.history');
    }
    return { laptop, phones: phones as [Client, Client], code };
  }

  it('lets a viewer kick a device at once, freeing its slot', async () => {
    const { laptop, phones, code } = await viewerRoomWithPhones();
    const closed = new Promise<number>((r) => phones[1].ws.on('close', (c) => r(c)));
    laptop.send({ type: 'device.kick', deviceId: phones[1].deviceId });

    await phones[1].expect('room.kicked');
    expect(await closed).toBe(4001);
    let state = await laptop.expect('room.state');
    while (state.room.devices.length !== 1) state = await laptop.expect('room.state');
    expect(state.room.devices[0]!.id).toBe(phones[0].deviceId);

    const c = await connect();
    c.send({ type: 'room.join', code, deviceId: c.deviceId, name: 'Máy C' });
    expect((await c.expect('room.state')).room.devices).toHaveLength(2);
  });

  it('stops a kicked device from silently reconnecting, but allows a manual rejoin', async () => {
    const { laptop, phones, code } = await viewerRoomWithPhones();
    laptop.send({ type: 'device.kick', deviceId: phones[1].deviceId });
    await phones[1].expect('room.kicked');

    const auto = await connect();
    auto.send({ type: 'room.join', code, deviceId: phones[1].deviceId, name: 'Máy', resume: true });
    expect((await auto.expect('error')).code).toBe('kicked');

    const manual = await connect();
    manual.send({ type: 'room.join', code, deviceId: phones[1].deviceId, name: 'Máy' });
    expect((await manual.expect('room.state')).room.devices).toHaveLength(2);
  });

  it('refuses kicks from measuring devices', async () => {
    const { phones } = await viewerRoomWithPhones();
    phones[0].send({ type: 'device.kick', deviceId: phones[1].deviceId });
    expect((await phones[0].expect('error')).code).toBe('viewer-required');
  });
});

describe('room deletion', () => {
  it('notifies members and removes data', async () => {
    const { a, code } = await createRoom();
    a.send({ type: 'room.delete' });
    await a.expect('room.deleted');
    expect((await app.inject(`/api/rooms/${code}/export.csv`)).statusCode).toBe(404);
  });
});
