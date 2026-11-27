import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createAuth, requireAppHeader } from './auth.ts';
import type { ServerConfig } from './config.ts';
import { apiRoutes } from './routes.ts';
import { createBackups } from './snapshot.ts';
import { createStores } from './stores.ts';
import { HttpError } from './validate.ts';

/** Where "npm run build" puts the web app. */
export const DEFAULT_WEB_DIST = resolve(import.meta.dirname, '../../web/dist');

/** Where "npm run backup" puts its files, and where the current data is saved before a restore. */
export const DEFAULT_BACKUP_DIR = resolve(import.meta.dirname, '../backups');

/** Builds the whole server: security headers, sign-in, the API, the built web app and the error handler. */
export function createApp(cfg: ServerConfig, db: DatabaseSync, webDist: string = DEFAULT_WEB_DIST, backupDir: string = DEFAULT_BACKUP_DIR) {
  const stores = createStores(db);
  const auth = createAuth(cfg);

  const app = express();
  app.disable('x-powered-by');
  // "Upgrade insecure requests" and HSTS tell browsers to use HTTPS for everything. Over plain HTTP on a
  // network address that makes the page fail to load, so they are only sent when the app is served over
  // HTTPS (COOKIE_SECURE=true). Every other protection stays on.
  app.use(
    helmet({
      hsts: cfg.cookieSecure,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { upgradeInsecureRequests: cfg.cookieSecure ? [] : null },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(requireAppHeader);
  api.post('/auth/login', auth.login);
  api.post('/auth/logout', auth.logout);
  api.get('/auth/me', auth.me);
  api.use(auth.requireSession);
  api.use(apiRoutes(stores, createBackups(db, backupDir)));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use('/api', api);

  // Serve the built web app (npm run build) from the same origin. The folder is checked on every request,
  // not once at start-up, so building after the server is already running works without a restart.
  const indexFile = join(webDist, 'index.html');
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) {
      next();
      return;
    }
    if (existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res
        .status(503)
        .type('text/plain')
        .send('The web app has not been built yet. Run "npm run build" and refresh this page, or use "npm run dev" and open http://localhost:5173.');
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const status = (err as { status?: number; type?: string }).status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: status === 413 ? 'Upload is too large' : 'Malformed request' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });
  return app;
}
