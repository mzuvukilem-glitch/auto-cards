// Creates server/.env with a random session secret and a random sign-in password.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Usage: npm run setup                    (creates server/.env)
//        npm run setup -- "<file>"        (creates the settings file somewhere else)
const custom = process.argv[2];
const envPath = custom ? resolve(custom) : resolve(import.meta.dirname, '../.env');
const label = custom ? envPath : 'server/.env';

if (existsSync(envPath)) {
  console.log(`${label} already exists. Edit it to change the password or secret.`);
  process.exit(0);
}

const password = randomBytes(12).toString('base64url');
const secret = randomBytes(48).toString('base64url');

writeFileSync(
  envPath,
  [
    '# Alur & Felice Planner settings. Keep this file private.',
    'PORT=4000',
    'HOST=127.0.0.1',
    `APP_PASSWORD=${password}`,
    `SESSION_SECRET=${secret}`,
    'DB_PATH=./data/planner.db',
    'COOKIE_SECURE=false',
    '',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(`Created ${label}`);
console.log(`Sign-in password: ${password}`);
console.log('Change APP_PASSWORD in server/.env if you want your own (12+ characters).');
