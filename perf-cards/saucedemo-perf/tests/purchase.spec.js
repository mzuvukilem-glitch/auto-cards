// tests/purchase.spec.js
const { test } = require('@playwright/test');
import { testPurchase } from './commands/purchase';

const users = [
  { username: 'standard_user', password: 'secret_sauce' },
  { username: 'performance_glitch_user', password: 'secret_sauce' }
];

users.forEach(({ username, password }) => {
  test(`purchase flow for ${username}`, async ({ page }) => {
    await testPurchase(page, username, password);
  });
});
