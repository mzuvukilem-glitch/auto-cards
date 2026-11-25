// The assembled server: headers, sign-in over HTTP, the guard on /api, the built web app, and the error handler.
import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';
import { start, fakeWebDist, PASSWORD, type Running } from './support.ts';

const HTML = { accept: 'text/html' };
let app: Running;
before(async () => {
  app = await start();
});
after(() => app.close());

describe('security headers', () => {
  test('the server does not announce itself, and sets the usual protections', async () => {
    const res = await app.bare('GET', '/api/auth/me');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy')!, /script-src 'self'/);
  });

  test('over plain HTTP there is no HSTS and no "upgrade insecure requests"', async () => {
    const res = await app.bare('GET', '/api/auth/me');
    assert.equal(res.headers.get('strict-transport-security'), null);
    assert.doesNotMatch(res.headers.get('content-security-policy')!, /upgrade-insecure-requests/);
  });

  test('with COOKIE_SECURE=true both are sent, because the app is served over HTTPS', async () => {
    const https = await start({ cfg: { cookieSecure: true } });
    try {
      const res = await https.bare('GET', '/api/auth/me');
      assert.match(res.headers.get('strict-transport-security')!, /max-age=/);
      assert.match(res.headers.get('content-security-policy')!, /upgrade-insecure-requests/);
    } finally {
      await https.close();
    }
  });
});

describe('signing in over HTTP', () => {
  const json = { 'content-type': 'application/json', 'x-requested-with': 'felice' };

  test('the right password gives a cookie, which then opens the API; /auth/me and sign-out agree', async () => {
    const wrong = await app.bare('POST', '/api/auth/login', { headers: json, body: JSON.stringify({ password: 'nope' }) });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get('set-cookie'), null);

    const ok = await app.bare('POST', '/api/auth/login', { headers: json, body: JSON.stringify({ password: PASSWORD }) });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.get('set-cookie')!;
    assert.match(setCookie, /^fp_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.doesNotMatch(setCookie, /Secure/i);
    const cookie = setCookie.split(';')[0]!;

    const me = await app.bare('GET', '/api/auth/me', { headers: { cookie } });
    assert.deepEqual(me.body, { authenticated: true });
    const orgs = await app.bare('GET', '/api/orgs', { headers: { cookie } });
    assert.deepEqual(orgs.body.map((o: { slug: string }) => o.slug), ['felice', 'alur']);

    const out = await app.bare('POST', '/api/auth/logout', { headers: { ...json, cookie } });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie')!, /fp_session=;/);
  });

  test('with COOKIE_SECURE=true the cookie carries the Secure flag', async () => {
    const https = await start({ cfg: { cookieSecure: true } });
    try {
      const ok = await https.bare('POST', '/api/auth/login', { headers: json, body: JSON.stringify({ password: PASSWORD }) });
      assert.match(ok.headers.get('set-cookie')!, /Secure/i);
    } finally {
      await https.close();
    }
  });

  test('a sign-in without the request header is a CSRF refusal, and a signed-out visitor is not signed in', async () => {
    const res = await app.bare('POST', '/api/auth/login', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
    assert.equal(res.status, 403);
    assert.deepEqual((await app.bare('GET', '/api/auth/me')).body, { authenticated: false });
  });
});

describe('the guard on /api', () => {
  test('without a session every API call is 401, and without the header every write is 403', async () => {
    assert.equal((await app.bare('GET', '/api/orgs')).status, 401);
    assert.equal((await app.bare('GET', '/api/master/summary')).status, 401);
    assert.equal((await app.bare('POST', '/api/orgs/felice/weeks', { headers: { 'x-requested-with': 'felice' } })).status, 401);
    assert.equal((await app.bare('POST', '/api/orgs/felice/weeks')).status, 403, 'the header check comes first');
    assert.equal((await app.bare('DELETE', '/api/orgs/felice/weeks/1')).status, 403);
  });

  test('a forged cookie is not a session', async () => {
    const res = await app.bare('GET', '/api/orgs', { headers: { cookie: 'fp_session=eyJleHAiOjk5OTk5OTk5OTk5OTl9.forged' } });
    assert.equal(res.status, 401);
  });

  test('an unknown API path answers a JSON 404 once signed in', async () => {
    await app.login();
    const res = await app.call('GET', '/nothing-here');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });
});

describe('the built web app', () => {
  test('files are served as they are, and the browser may keep them for an hour', async () => {
    const res = await app.bare('GET', '/assets/app.js');
    assert.equal(res.status, 200);
    assert.equal(res.buffer.toString(), 'console.log(1)');
    assert.match(res.headers.get('cache-control')!, /max-age=3600/);
  });

  test('the front page and any page route (for the browser\'s own routing) get index.html', async () => {
    for (const path of ['/', '/o/felice/planner/3', '/master']) {
      const res = await app.bare('GET', path, { headers: HTML });
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type')!, /text\/html/);
      assert.match(res.buffer.toString(), /<title>Planner<\/title>/);
    }
  });

  test('only a browser asking for a page gets index.html: other methods and other kinds of request fall through to a 404', async () => {
    assert.equal((await app.bare('POST', '/anything', { headers: HTML })).status, 404);
    assert.equal((await app.bare('GET', '/missing.json', { headers: { accept: 'application/json' } })).status, 404);
  });

  test('before "npm run build" the page says so (503), and building later needs no restart', async () => {
    const dist = fakeWebDist(false);
    const early = await start({ webDist: dist });
    try {
      const res = await early.bare('GET', '/', { headers: HTML });
      assert.equal(res.status, 503);
      assert.match(res.buffer.toString(), /web app has not been built yet/);
      const { writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      writeFileSync(join(dist, 'index.html'), '<title>Built later</title>');
      const after = await early.bare('GET', '/', { headers: HTML });
      assert.equal(after.status, 200);
      assert.match(after.buffer.toString(), /Built later/);
    } finally {
      await early.close();
    }
  });
});

describe('the error handler', () => {
  test('an HttpError becomes its status and message', async () => {
    await app.login();
    const res = await app.call('GET', '/orgs/nobody/weeks');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Organisation not found' });
  });

  test('a body that is not valid JSON is a 400 "Malformed request"', async () => {
    const bad = await app.bare('POST', '/api/orgs/felice/weeks', {
      headers: { 'content-type': 'application/json', 'x-requested-with': 'felice', cookie: (await cookieOf(app)) },
      body: '{"year": ',
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body, { error: 'Malformed request' });
  });

  test('a JSON body over 100 kB is a 413 "Upload is too large"', async () => {
    const big = await app.bare('POST', '/api/orgs/felice/weeks', {
      headers: { 'content-type': 'application/json', 'x-requested-with': 'felice', cookie: await cookieOf(app) },
      body: JSON.stringify({ notes: 'x'.repeat(150_000) }),
    });
    assert.equal(big.status, 413);
    assert.deepEqual(big.body, { error: 'Upload is too large' });
  });

  test('anything unexpected is a 500 with a safe message, and the detail goes to the log only', async () => {
    const broken = await start();
    const log = mock.method(console, 'error', () => {});
    try {
      await broken.login();
      broken.db.close(); // every query now fails
      const res = await broken.call('GET', '/orgs/felice/weeks');
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Something went wrong on the server' });
      assert.doesNotMatch(JSON.stringify(res.body), /database|sqlite/i);
      assert.equal(log.mock.callCount(), 1);
    } finally {
      log.mock.restore();
      await broken.close();
    }
  });
});

/** The session cookie of a signed-in client, for tests that must control every header themselves. */
async function cookieOf(running: Running): Promise<string> {
  const res = await running.bare('POST', '/api/auth/login', {
    headers: { 'content-type': 'application/json', 'x-requested-with': 'felice' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
