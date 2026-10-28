import { defineConfig } from '@playwright/test';

const PORT = 8790;

/** Runs the production build behind the real server, as on the laptop. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `pnpm --filter @rtk/web build && PORT=${PORT} DATABASE_PATH=:memory: pnpm --filter @rtk/server start`,
    url: `http://localhost:${PORT}/healthz`,
    cwd: '../..',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
