import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ServerConfig } from './config.ts';

const COOKIE = 'fp_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

/**
 * Single shared-password sign-in with an HMAC-signed, HttpOnly, SameSite=Strict session cookie.
 * Sessions are stateless: signing out clears the cookie, and rotating SESSION_SECRET ends all sessions.
 */
export function createAuth(cfg: ServerConfig) {
  const passwordDigest = createHash('sha256').update(cfg.password).digest();
  const failures = new Map<string, { count: number; first: number }>();

  const sign = (payload: string) => createHmac('sha256', cfg.sessionSecret).update(payload).digest('base64url');

  function readCookie(req: Request): string | undefined {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === COOKIE) return rest.join('=');
    }
    return undefined;
  }

  function hasValidSession(req: Request): boolean {
    const [payload, signature] = (readCookie(req) ?? '').split('.');
    if (!payload || !signature) return false;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    try {
      const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
      return typeof exp === 'number' && exp > Date.now();
    } catch {
      return false;
    }
  }

  function pruneFailures(now: number) {
    if (failures.size < 1000) return;
    for (const [ip, f] of failures) if (now - f.first >= FAIL_WINDOW_MS) failures.delete(ip);
  }

  return {
    login(req: Request, res: Response) {
      const ip = req.ip ?? 'unknown';
      const now = Date.now();
      pruneFailures(now);
      const record = failures.get(ip);
      if (record && now - record.first < FAIL_WINDOW_MS && record.count >= MAX_FAILURES) {
        res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
        return;
      }

      const body = req.body as { password?: unknown } | undefined;
      const attempt = typeof body?.password === 'string' ? body.password : '';
      const ok = timingSafeEqual(createHash('sha256').update(attempt).digest(), passwordDigest);

      if (!ok) {
        if (!record || now - record.first >= FAIL_WINDOW_MS) failures.set(ip, { count: 1, first: now });
        else record.count += 1;
        res.status(401).json({ error: 'Incorrect password' });
        return;
      }

      failures.delete(ip);
      const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_MS })).toString('base64url');
      res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
        httpOnly: true,
        sameSite: 'strict',
        secure: cfg.cookieSecure,
        maxAge: SESSION_TTL_MS,
        path: '/',
      });
      res.json({ ok: true });
    },

    logout(_req: Request, res: Response) {
      res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: cfg.cookieSecure, path: '/' });
      res.json({ ok: true });
    },

    me(req: Request, res: Response) {
      res.json({ authenticated: hasValidSession(req) });
    },

    requireSession(req: Request, res: Response, next: NextFunction) {
      if (!hasValidSession(req)) {
        res.status(401).json({ error: 'Sign in required' });
        return;
      }
      next();
    },
  };
}

/**
 * CSRF defence in depth (on top of SameSite=Strict): state-changing requests must carry a custom
 * header, which a cross-site form or image cannot set.
 */
export function requireAppHeader(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-requested-with') !== 'felice') {
    res.status(403).json({ error: 'Missing request header' });
    return;
  }
  next();
}
