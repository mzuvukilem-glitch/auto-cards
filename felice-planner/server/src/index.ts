import { createApp } from './app.ts';
import { dbPath, loadServerConfig, type ServerConfig } from './config.ts';
import { openDb } from './db.ts';

function readConfig(): ServerConfig {
  try {
    return loadServerConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

const cfg = readConfig();
const db = openDb(dbPath());
const server = createApp(cfg, db).listen(cfg.port, cfg.host, () => {
  console.log(`Alur & Felice Planner API listening on http://${cfg.host}:${cfg.port}`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
