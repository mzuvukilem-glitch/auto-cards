// commands/artilleryScript.js
const { testPurchase } = require('./commands/purchase');

async function artilleryScript({ page, context }) {
  await testPurchase({ page, context });
}

module.exports = { artilleryScript };
