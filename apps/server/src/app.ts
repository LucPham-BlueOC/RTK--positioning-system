import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { clientMessageSchema, type ServerMessage } from '@rtk/shared';
import Fastify from 'fastify';
import type { Config } from './config';
import { CorsHub, createCorsHub } from './cors/hub';
import { registerExport } from './export';
import { RoomHub } from './rooms';
import { Store } from './store';

const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_MESSAGES_PER_SECOND = 20;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Behind Cloudflare Tunnel every request arrives from localhost, so the real
 * client address comes from the header the tunnel sets. The server binds to
 * loopback by default, so only the tunnel can set that header.
 */
function clientIp(
  headers: Record<string, string | string[] | undefined>,
  socket: { remoteAddress?: string } | undefined,
) {
  const cf = headers['cf-connecting-ip'];
  return (typeof cf === 'string' && cf) || socket?.remoteAddress || 'unknown';
}

export async function buildApp(config: Config, opts: { logger?: boolean; corsHub?: CorsHub } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  const store = new Store(config.databasePath);
  const hub = new RoomHub(store, config);
  const cors = opts.corsHub ?? (config.cors.enabled ? createCorsHub(config.cors) : null);

  /** CORS data goes to every open socket, whether or not it joined a room. */
  const sockets = new Set<{ send(data: string): void; readyState: number; OPEN: number }>();
  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const s of sockets) if (s.readyState === s.OPEN) s.send(data);
  };
  cors?.onState((state) => broadcast({ type: 'cors.state', cors: state }));
  cors?.onEpoch((epoch) => broadcast({ type: 'cors.epoch', epoch }));

  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  app.get('/healthz', async () => ({ ok: true }));

  app.get('/ws', { websocket: true }, (socket, req) => {
    if (config.publicOrigin && req.headers.origin !== config.publicOrigin) {
      socket.close(1008, 'origin');
      return;
    }
    const conn = hub.connect(
      {
        send: (msg: ServerMessage) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
        },
        close: (code, reason) => socket.close(code, reason),
      },
      clientIp(req.headers, req.socket),
      req.headers['user-agent'] ?? null,
    );
    if (cors) {
      sockets.add(socket);
      conn.peer.send({ type: 'cors.state', cors: cors.state });
      conn.peer.send({ type: 'cors.history', epochs: cors.history });
    }

    let windowStart = Date.now();
    let count = 0;
    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MESSAGES_PER_SECOND) {
        conn.peer.send({ type: 'error', code: 'rate-limited', message: 'Gửi quá nhanh' });
        return;
      }
      let parsed;
      try {
        parsed = clientMessageSchema.safeParse(JSON.parse(raw.toString()));
      } catch {
        parsed = null;
      }
      if (!parsed?.success) {
        conn.peer.send({ type: 'error', code: 'bad-message', message: 'Message không hợp lệ' });
        return;
      }
      try {
        hub.handle(conn, parsed.data);
      } catch (err) {
        req.log.error(err);
        conn.peer.send({ type: 'error', code: 'bad-message', message: 'Lỗi xử lý message' });
      }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      hub.disconnect(conn);
    });
  });

  registerExport(app, store, config);

  if (existsSync(config.webDistPath)) {
    await app.register(fastifyStatic, { root: config.webDistPath, wildcard: false });
    // Client-side routes such as /r/A7K2 fall back to the app shell.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not-found' });
    });
  }

  const purgeTimer = setInterval(() => hub.purge(), PURGE_INTERVAL_MS);
  hub.purge();

  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    cors?.shutdown();
    hub.shutdown();
    store.close();
  });

  return { app, store, hub, cors };
}
