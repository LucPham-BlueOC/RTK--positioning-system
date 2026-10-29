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
  cors: CorsConfig;
}

/** NTRIP source of the CORS reference station; off unless a host or the mock is configured. */
export interface CorsConfig {
  enabled: boolean;
  /** Synthetic stream instead of a caster; the variants reproduce the two failure diagnoses. */
  mock: false | 'full' | 'no-ephemeris' | 'no-station';
  host: string;
  port: number;
  mountpoint: string;
  user: string;
  pass: string;
  ntripV2: boolean;
  minElevationDeg: number;
  historyEpochs: number;
}

function corsMock(v: string | undefined): CorsConfig['mock'] {
  if (v === '1') return 'full';
  if (v === 'no-ephemeris' || v === 'no-station') return v;
  return false;
}

const num = (v: string | undefined, fallback: number) => (v ? Number(v) : fallback);

export function loadConfig(env = process.env): Config {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: num(env.PORT, 8787),
    databasePath: path.resolve(root, env.DATABASE_PATH ?? 'data/app.db'),
    webDistPath: path.resolve(root, env.WEB_DIST_PATH ?? 'apps/web/dist'),
    roomTtlHours: num(env.ROOM_TTL_HOURS, 24),
    dataRetentionDays: num(env.DATA_RETENTION_DAYS, 7),
    pairingWindowMs: num(env.PAIRING_WINDOW_MS, 1000),
    publicOrigin: env.PUBLIC_ORIGIN || null,
    cors: loadCorsConfig(env),
  };
}

export function loadCorsConfig(env = process.env): CorsConfig {
  const mock = corsMock(env.CORS_MOCK);
  const host = env.CORS_NTRIP_HOST ?? '';
  return {
    enabled: mock !== false || host !== '',
    mock,
    host: mock ? 'mock' : host,
    port: mock ? 0 : num(env.CORS_NTRIP_PORT, 2101),
    mountpoint: mock ? 'MOCK' : (env.CORS_NTRIP_MOUNTPOINT ?? ''),
    user: env.CORS_NTRIP_USER ?? '',
    pass: env.CORS_NTRIP_PASS ?? 'none',
    ntripV2: env.CORS_NTRIP_V2 === '1',
    minElevationDeg: num(env.CORS_MIN_ELEVATION_DEG, 10),
    historyEpochs: num(env.CORS_HISTORY_EPOCHS, 600),
  };
}
