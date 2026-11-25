// Reading and validating the server's settings.
import assert from 'node:assert/strict';
import { isAbsolute, resolve } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { dbPath, loadServerConfig } from '../src/config.ts';

const KEYS = ['DB_PATH', 'APP_PASSWORD', 'SESSION_SECRET', 'PORT', 'HOST', 'COOKIE_SECURE'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const good = () => {
  process.env.APP_PASSWORD = 'a-long-enough-password';
  process.env.SESSION_SECRET = 'x'.repeat(32);
};

describe('dbPath', () => {
  const serverDir = resolve(import.meta.dirname, '..');

  test('defaults to server/data/planner.db whatever folder the command was started from', () => {
    assert.equal(dbPath(), resolve(serverDir, 'data/planner.db'));
  });

  test('a relative path starts in the server folder', () => {
    process.env.DB_PATH = './elsewhere/my.db';
    assert.equal(dbPath(), resolve(serverDir, 'elsewhere/my.db'));
  });

  test('an absolute path is used as given', () => {
    const abs = resolve('/var/lib/planner.db');
    process.env.DB_PATH = abs;
    assert.ok(isAbsolute(abs));
    assert.equal(dbPath(), abs);
  });

  test('":memory:" is passed through untouched', () => {
    process.env.DB_PATH = ':memory:';
    assert.equal(dbPath(), ':memory:');
  });
});

describe('loadServerConfig', () => {
  test('reads the settings, with local-only defaults', () => {
    good();
    assert.deepEqual(loadServerConfig(), {
      port: 4000,
      host: '127.0.0.1',
      password: 'a-long-enough-password',
      sessionSecret: 'x'.repeat(32),
      cookieSecure: false,
    });
  });

  test('PORT, HOST and COOKIE_SECURE are honoured; only the exact word "true" turns secure cookies on', () => {
    good();
    process.env.PORT = '8080';
    process.env.HOST = '0.0.0.0';
    process.env.COOKIE_SECURE = 'true';
    assert.deepEqual([loadServerConfig().port, loadServerConfig().host, loadServerConfig().cookieSecure], [8080, '0.0.0.0', true]);
    process.env.COOKIE_SECURE = 'yes';
    assert.equal(loadServerConfig().cookieSecure, false);
  });

  test('it refuses to start without a strong password and secret, and says which', () => {
    assert.throws(loadServerConfig, (e: Error) => /APP_PASSWORD must be set and at least 12 characters/.test(e.message) && /SESSION_SECRET must be set and at least 32/.test(e.message));
    process.env.APP_PASSWORD = '12345678901'; // 11 characters
    process.env.SESSION_SECRET = 'x'.repeat(32);
    assert.throws(loadServerConfig, (e: Error) => /APP_PASSWORD/.test(e.message) && !/SESSION_SECRET/.test(e.message));
    process.env.APP_PASSWORD = '123456789012'; // 12 is enough
    process.env.SESSION_SECRET = 'x'.repeat(31);
    assert.throws(loadServerConfig, (e: Error) => /SESSION_SECRET/.test(e.message) && !/APP_PASSWORD/.test(e.message));
  });

  test('a PORT that is not a whole number from 1 to 65535 is refused', () => {
    good();
    for (const bad of ['abc', '0', '65536', '40.5', '-1']) {
      process.env.PORT = bad;
      assert.throws(loadServerConfig, /PORT must be a whole number between 1 and 65535/, `PORT=${bad}`);
    }
    process.env.PORT = '65535';
    assert.equal(loadServerConfig().port, 65535);
  });
});
