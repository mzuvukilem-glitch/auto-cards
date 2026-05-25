const { expect } = require('@playwright/test');

// Note: Ensure NO curly braces wrap 'page'
async function testPurchase(page, context) {
  // Simple check to confirm page object exists before running heavy steps
  if (!page || typeof page.goto !== 'function') {
    throw new Error("Artillery did not pass a valid Playwright page instance!");
  }

  await page.goto('https://saucedemo.com');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  await page.waitForURL('**/inventory.html');

  await page.click('#add-to-cart-sauce-labs-bike-light');
  await page.click('.shopping_cart_container');
  await expect(page.locator('#checkout')).toBeVisible();

  await page.click('#checkout');
  await page.fill('#first-name', 'Mzu');
  await page.fill('#last-name', 'Mqa');
  await page.fill('#postal-code', '0001');
  await page.click('#continue');
  await expect(page.locator('#finish')).toBeVisible();

  await page.click('#finish');
  await expect(page.locator('#back-to-products')).toBeVisible();
};

module.exports = { testPurchase };
