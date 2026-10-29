'use strict';

const { app } = require('./app');
const { resolvePort } = require('./lib/cli-options');
const { buildMetrics } = require('./lib/metrics');
const { applyPromoCode, getActivePromoCodes } = require('./lib/promo-codes');

const PORT = resolvePort(process.argv.slice(2));

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`axiom-demo-dashboard listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, buildMetrics, applyPromoCode, getActivePromoCodes };
