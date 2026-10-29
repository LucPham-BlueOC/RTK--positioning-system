import { afterEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import type { ServerMessage } from '@rtk/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { CorsHub } from '../src/cors/hub';
import { mockFeed } from '../src/cors/mock-feed';

type App = Awaited<ReturnType<typeof buildApp>>['app'];

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function collect(ws: WebSocket) {
  const msgs: ServerMessage[] = [];
  ws.on('message', (raw) => msgs.push(JSON.parse(raw.toString()) as ServerMessage));
  return msgs;
}

async function start(env: Record<string, string>) {
  const config = { ...loadConfig(env), databasePath: ':memory:', webDistPath: '/nonexistent' };
  const built = await buildApp(config);
  app = built.app;
  await app.ready();
  return built;
}

describe('CORS over /ws', () => {
  it('sends state and history to a socket that never joins a room, then live epochs', async () => {
    const config = {
      ...loadConfig({ CORS_MOCK: '1' }),
      databasePath: ':memory:',
      webDistPath: '/nonexistent',
    };
    const corsHub = new CorsHub(config.cors, { feed: mockFeed({}) });
    ({ app } = await buildApp(config, { corsHub }));
    await app.ready();
    corsHub.start();
    await vi.waitFor(() => expect(corsHub.history.length).toBeGreaterThan(0), { timeout: 3000 });

    // Listen before the upgrade completes: state and history are sent on open.
    let msgs: ServerMessage[] = [];
    const ws = await app.injectWS('/ws', {}, { onInit: (s) => (msgs = collect(s)) });
    await vi.waitFor(() => expect(msgs.some((m) => m.type === 'cors.epoch')).toBe(true), {
      timeout: 3000,
    });

    expect(msgs[0]).toMatchObject({
      type: 'cors.state',
      cors: { status: 'connected', mock: true },
    });
    expect(msgs[1]?.type).toBe('cors.history');
    expect(msgs[1]?.type === 'cors.history' && msgs[1].epochs.length).toBeGreaterThan(0);
    const epoch = msgs.find((m) => m.type === 'cors.epoch');
    expect(epoch?.type === 'cors.epoch' && epoch.epoch.sats.length).toBeGreaterThan(10);
    ws.terminate();
  });

  it('sends nothing CORS-related when the module is off', async () => {
    const { cors } = await start({});
    expect(cors).toBeNull();
    const ws = await app!.injectWS('/ws');
    const msgs = collect(ws);
    ws.send(JSON.stringify({ type: 'clock.ping', t0: 1 }));
    await vi.waitFor(() => expect(msgs).toHaveLength(1));
    expect(msgs.map((m) => m.type)).toEqual(['clock.pong']);
    ws.terminate();
  });
});
