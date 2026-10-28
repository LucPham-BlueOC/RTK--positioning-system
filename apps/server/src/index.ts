import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildApp(config, { logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.host, port: config.port });
