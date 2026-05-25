// commands/purchase.js
const { expect } = require('@playwright/test');

async function testPurchase({ page }) {
  // Navigate and login
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  // Wait until inventory page loads
  await page.waitForURL('**/inventory.html');

  // Add item to cart
  await page.click('#add-to-cart-sauce-labs-bike-light');
  await page.click('.shopping_cart_container');
  await expect(page.locator('#checkout')).toBeVisible();

  // Checkout
  await page.click('#checkout');
  await page.fill('#first-name', 'Mzu');
  await page.fill('#last-name', 'Mqa');
  await page.fill('#postal-code', '0001');
  await page.click('#continue');
  await expect(page.locator('#finish')).toBeVisible();

  // Finish purchase
  await page.click('#finish');
  await expect(page.locator('#back-to-products')).toBeVisible();
}

module.exports = { testPurchase };
