import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  /** Built web client served from the same origin; skipped when missing. */
  webDistPath: string;
  roomTtlHours: number;
  dataRetentionDays: number;
  pairingWindowMs: number;
  /** When set, WebSocket upgrades from any other Origin are refused. */
  publicOrigin: string | null;
}

const num = (v: string | undefined, fallback: number) => (v ? Number(v) : fallback);

export function loadConfig(env = process.env): Config {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: num(env.PORT, 8787),
    databasePath: env.DATABASE_PATH ?? path.join(root, 'data/app.db'),
    webDistPath: env.WEB_DIST_PATH ?? path.join(root, 'apps/web/dist'),
    roomTtlHours: num(env.ROOM_TTL_HOURS, 24),
    dataRetentionDays: num(env.DATA_RETENTION_DAYS, 7),
    pairingWindowMs: num(env.PAIRING_WINDOW_MS, 1000),
    publicOrigin: env.PUBLIC_ORIGIN || null,
  };
}
