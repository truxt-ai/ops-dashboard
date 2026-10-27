'use strict';

const { getActivePromoCodes } = require('../lib/promo-codes');

function registerPromoCodes(app) {
  // List the promo codes the billing page may offer (active codes only).
  app.get('/api/promo-codes', (req, res) => {
    res.json(getActivePromoCodes());
  });
}

module.exports = { registerPromoCodes };
