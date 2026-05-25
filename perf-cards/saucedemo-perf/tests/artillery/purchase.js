const { testPurchase } = require('../commands/purchase');
// const {purchase} = require('./command/purchase');

async function artilleryScript(page) {
    await testPurchase(page);
    
};
module.exports = {
    artilleryScript
};