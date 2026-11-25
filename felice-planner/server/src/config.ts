import { resolve } from 'node:path';

/**
 * The database file. A relative DB_PATH is resolved against the server/ folder (as documented), not
 * against the folder the command was started from, so every way of launching the app uses the same file.
 * Absolute paths (C:\data\planner.db, /var/lib/planner.db) and ":memory:" are used as given.
 */
export function dbPath(): string {
  const configured = process.env.DB_PATH || './data/planner.db';
  if (configured === ':memory:') return configured;
  return resolve(import.meta.dirname, '..', configured);
}

export interface ServerConfig {
  port: number;
  host: string;
  password: string;
  sessionSecret: string;
  cookieSecure: boolean;
}

/** Reads and validates server settings. Refuses to start with weak or missing secrets. */
export function loadServerConfig(): ServerConfig {
  const errors: string[] = [];
  const password = process.env.APP_PASSWORD ?? '';
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  const port = Number(process.env.PORT || 4000);

  if (password.length < 12) errors.push('APP_PASSWORD must be set and at least 12 characters long');
  if (sessionSecret.length < 32) errors.push('SESSION_SECRET must be set and at least 32 characters long');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be a whole number between 1 and 65535');

  if (errors.length > 0) {
    throw new Error(`Invalid configuration (run "npm run setup" to create server/.env):\n  - ${errors.join('\n  - ')}`);
  }

  return {
    port,
    // Local-only by default. Set HOST=0.0.0.0 to expose on the network (put HTTPS in front first).
    host: process.env.HOST || '127.0.0.1',
    password,
    sessionSecret,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  };
}
