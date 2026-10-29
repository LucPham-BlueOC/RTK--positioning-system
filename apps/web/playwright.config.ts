import { defineConfig } from '@playwright/test';

const PORT = 8790;
/** Extra servers playing the synthetic CORS station: a full stream and one without ephemeris. */
export const CORS_MOCK_PORT = 8791;
export const CORS_NO_EPHEMERIS_PORT = 8792;
const server = (port: number, env = '') => ({
  command: `PORT=${port} DATABASE_PATH=:memory: ${env} pnpm --filter @rtk/server start`,
  url: `http://localhost:${port}/healthz`,
  cwd: '../..',
  timeout: 120_000,
  reuseExistingServer: false,
});

/** Runs the production build behind the real server, as on the laptop. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  // Servers start in order, so the build finishes before the CORS servers serve it.
  webServer: [
    {
      ...server(PORT),
      command: `pnpm --filter @rtk/web build && PORT=${PORT} DATABASE_PATH=:memory: pnpm --filter @rtk/server start`,
    },
    server(CORS_MOCK_PORT, 'CORS_MOCK=1'),
    server(CORS_NO_EPHEMERIS_PORT, 'CORS_MOCK=no-ephemeris'),
  ],
});
