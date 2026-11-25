// Sign-in, the signed session cookie, the sign-in rate limit and the CSRF header. These run on fake
// requests and responses, so every branch (expired sessions, forged cookies, the 1000-address clean-up) can be reached.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, mock, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createAuth, requireAppHeader } from '../src/auth.ts';
import { config, PASSWORD, SECRET } from './support.ts';

interface Sent {
  status: number;
  json: unknown;
  cookie?: { name: string; value: string; options: Record<string, unknown> };
  cleared?: { name: string; options: Record<string, unknown> };
}
function fakeRes() {
  const sent: Sent = { status: 200, json: undefined };
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.json = body;
      return res;
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      sent.cookie = { name, value, options };
      return res;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      sent.cleared = { name, options };
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}
const req = (over: Record<string, unknown> = {}) => ({ headers: {}, ip: '10.0.0.1', method: 'POST', body: { password: PASSWORD }, get: () => undefined, ...over }) as unknown as Request;
const NO_ADDRESS = Symbol('no address');
const attempt = (auth: ReturnType<typeof createAuth>, password: unknown, ip: string | typeof NO_ADDRESS = '10.0.0.1') => {
  const { res, sent } = fakeRes();
  auth.login(req({ ip: ip === NO_ADDRESS ? undefined : ip, body: { password } }), res);
  return sent;
};
/** A session cookie signed with the test secret, for any payload text. */
const signed = (payload: string, secret = SECRET) => `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
const payloadOf = (exp: unknown) => Buffer.from(JSON.stringify({ exp })).toString('base64url');
const withCookie = (value: string) => req({ headers: { cookie: value } });

afterEach(() => mock.timers.reset());

describe('signing in', () => {
  test('the right password sets an HttpOnly, SameSite=Strict cookie that lasts 12 hours', () => {
    const auth = createAuth(config());
    const sent = attempt(auth, PASSWORD);
    assert.deepEqual(sent.json, { ok: true });
    assert.equal(sent.cookie?.name, 'fp_session');
    assert.deepEqual(sent.cookie?.options, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 12 * 3600 * 1000, path: '/' });
  });

  test('the cookie is Secure when COOKIE_SECURE is on', () => {
    const sent = attempt(createAuth(config({ cookieSecure: true })), PASSWORD);
    assert.equal(sent.cookie?.options.secure, true);
  });

  test('a wrong, missing or non-text password is refused', () => {
    const auth = createAuth(config());
    for (const [i, bad] of ['nope', '', undefined, 12345, null].entries()) {
      const sent = attempt(auth, bad, `10.1.0.${i}`); // a different address each time, so the limit is not reached
      assert.equal(sent.status, 401);
      assert.deepEqual(sent.json, { error: 'Incorrect password' });
      assert.equal(sent.cookie, undefined);
    }
    const { res, sent } = fakeRes(); // no body at all
    auth.login(req({ body: undefined, ip: '10.1.0.99' }), res);
    assert.equal(sent.status, 401);
  });

  test('after 5 wrong passwords from one address the 6th attempt is refused, even with the right password', () => {
    const auth = createAuth(config());
    for (let i = 0; i < 5; i++) assert.equal(attempt(auth, 'wrong').status, 401);
    const blocked = attempt(auth, PASSWORD);
    assert.equal(blocked.status, 429);
    assert.match((blocked.json as { error: string }).error, /Too many sign-in attempts/);
    assert.equal(attempt(auth, PASSWORD, '10.0.0.2').status, 200, 'another address is not affected');
  });

  test('the block ends after 15 minutes, and a new failure then starts a fresh count', () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const auth = createAuth(config());
    for (let i = 0; i < 5; i++) attempt(auth, 'wrong');
    assert.equal(attempt(auth, PASSWORD).status, 429);
    mock.timers.setTime(1_000_000 + 15 * 60 * 1000);
    assert.equal(attempt(auth, 'wrong').status, 401, 'the old record expired, so this is failure 1 of a new window');
    for (let i = 0; i < 3; i++) attempt(auth, 'wrong'); // 2, 3, 4 of the new window
    assert.equal(attempt(auth, PASSWORD).status, 200, 'still under 5');
  });

  test('a good sign-in clears the address\'s failures', () => {
    const auth = createAuth(config());
    for (let i = 0; i < 4; i++) attempt(auth, 'wrong');
    assert.equal(attempt(auth, PASSWORD).status, 200);
    for (let i = 0; i < 4; i++) assert.equal(attempt(auth, 'wrong').status, 401);
    assert.equal(attempt(auth, PASSWORD).status, 200, 'four new failures only: never blocked');
  });

  test('a request with no address is counted as "unknown"', () => {
    const auth = createAuth(config());
    for (let i = 0; i < 5; i++) attempt(auth, 'wrong', NO_ADDRESS);
    assert.equal(attempt(auth, PASSWORD, NO_ADDRESS).status, 429);
  });

  test('with 1000 addresses on record, expired ones are forgotten and current ones kept', () => {
    mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
    const auth = createAuth(config());
    for (let i = 0; i < 5; i++) attempt(auth, 'wrong', 'blocked-ip');
    for (let i = 0; i < 1000; i++) attempt(auth, 'wrong', `old-${i}`);
    mock.timers.setTime(5_000_000 + 10 * 60 * 1000);
    for (let i = 0; i < 5; i++) attempt(auth, 'wrong', 'later-ip'); // now blocked, and recent
    mock.timers.setTime(5_000_000 + 16 * 60 * 1000); // 'blocked-ip' and the old-n addresses are 16 minutes old, 'later-ip' is 6
    assert.equal(attempt(auth, PASSWORD, 'new-ip').status, 200); // this call prunes
    assert.equal(attempt(auth, PASSWORD, 'later-ip').status, 429, 'a recent record survives the clean-up');
    assert.equal(attempt(auth, PASSWORD, 'blocked-ip').status, 200, 'an expired record is gone');
  });
});

describe('the session cookie', () => {
  const auth = createAuth(config());
  const loginCookie = () => {
    const sent = attempt(auth, PASSWORD);
    return `fp_session=${sent.cookie!.value}`;
  };
  const authenticated = (r: Request) => {
    const { res, sent } = fakeRes();
    auth.me(r, res);
    return (sent.json as { authenticated: boolean }).authenticated;
  };

  test('a cookie from sign-in is accepted, wherever it sits among other cookies', () => {
    const cookie = loginCookie();
    assert.equal(authenticated(withCookie(cookie)), true);
    assert.equal(authenticated(withCookie(`theme=dark; ${cookie}; other=1`)), true);
  });

  test('no cookie, another cookie, or an empty one is not signed in', () => {
    assert.equal(authenticated(req()), false);
    assert.equal(authenticated(withCookie('theme=dark')), false);
    assert.equal(authenticated(withCookie('fp_session=')), false);
    assert.equal(authenticated(withCookie('fp_session=abc')), false, 'no signature');
    assert.equal(authenticated(withCookie('fp_session=.sig')), false, 'no payload');
  });

  test('a forged or changed cookie is refused', () => {
    const goodPayload = payloadOf(Date.now() + 60_000);
    assert.equal(authenticated(withCookie(`fp_session=${signed(goodPayload)}`)), true, 'control: our own signature works');
    assert.equal(authenticated(withCookie(`fp_session=${signed(goodPayload, 'a-different-secret-of-some-length')}`)), false, 'signed with another secret');
    assert.equal(authenticated(withCookie(`fp_session=${goodPayload}.AAAA`)), false, 'wrong signature length');
    const tampered = signed(goodPayload).replace(goodPayload, payloadOf(Date.now() + 999_999_999));
    assert.equal(authenticated(withCookie(`fp_session=${tampered}`)), false, 'payload changed after signing');
    const sameLength = `${goodPayload}.${'A'.repeat(signed(goodPayload).split('.')[1]!.length)}`;
    assert.equal(authenticated(withCookie(`fp_session=${sameLength}`)), false, 'right length, wrong signature');
  });

  test('a signed cookie is still refused when it has expired or its payload is not an expiry', () => {
    assert.equal(authenticated(withCookie(`fp_session=${signed(payloadOf(Date.now() - 1))}`)), false, 'expired');
    assert.equal(authenticated(withCookie(`fp_session=${signed(payloadOf('tomorrow'))}`)), false, 'exp is not a number');
    assert.equal(authenticated(withCookie(`fp_session=${signed(payloadOf(undefined))}`)), false, 'no exp');
    assert.equal(authenticated(withCookie(`fp_session=${signed(Buffer.from('not json').toString('base64url'))}`)), false, 'payload is not JSON');
  });

  test('a session lasts until its expiry time, and no longer', () => {
    mock.timers.enable({ apis: ['Date'], now: 2_000_000 });
    const cookie = loginCookie();
    mock.timers.setTime(2_000_000 + 12 * 3600 * 1000 - 1);
    assert.equal(authenticated(withCookie(cookie)), true);
    mock.timers.setTime(2_000_000 + 12 * 3600 * 1000);
    assert.equal(authenticated(withCookie(cookie)), false);
  });

  test('a cookie value may itself contain "="', () => {
    const cookie = loginCookie();
    assert.equal(authenticated(withCookie(`${cookie}==`)), false, 'extra "=" changes the signature, so it is refused, not a crash');
  });
});

describe('signing out and guarding routes', () => {
  test('sign-out clears the cookie with the same flags', () => {
    const { res, sent } = fakeRes();
    createAuth(config({ cookieSecure: true })).logout(req(), res);
    assert.deepEqual(sent.json, { ok: true });
    assert.deepEqual(sent.cleared, { name: 'fp_session', options: { httpOnly: true, sameSite: 'strict', secure: true, path: '/' } });
  });

  test('requireSession lets a signed-in request through and answers 401 to the rest', () => {
    const auth = createAuth(config());
    const cookie = `fp_session=${attempt(auth, PASSWORD).cookie!.value}`;
    let called = 0;
    const next: NextFunction = () => void called++;
    const ok = fakeRes();
    auth.requireSession(withCookie(cookie), ok.res, next);
    assert.equal(called, 1);
    const denied = fakeRes();
    auth.requireSession(req(), denied.res, next);
    assert.equal(called, 1, 'next was not called');
    assert.equal(denied.sent.status, 401);
    assert.deepEqual(denied.sent.json, { error: 'Sign in required' });
  });
});

describe('requireAppHeader (CSRF defence)', () => {
  const run = (method: string, header?: string) => {
    const { res, sent } = fakeRes();
    let called = false;
    requireAppHeader(req({ method, get: (n: string) => (n.toLowerCase() === 'x-requested-with' ? header : undefined) }), res, () => (called = true));
    return { called, sent };
  };

  test('reading (GET and HEAD) needs no header', () => {
    assert.equal(run('GET').called, true);
    assert.equal(run('HEAD').called, true);
  });

  test('every other method needs "X-Requested-With: felice"', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const denied = run(method);
      assert.equal(denied.called, false, method);
      assert.equal(denied.sent.status, 403);
      assert.deepEqual(denied.sent.json, { error: 'Missing request header' });
      assert.equal(run(method, 'something-else').called, false, `${method} with the wrong value`);
      assert.equal(run(method, 'felice').called, true, `${method} with the header`);
    }
  });
});
