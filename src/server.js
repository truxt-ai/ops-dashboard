'use strict';

const path = require('path');
const express = require('express');
const axios = require('axios');
const _ = require('lodash');
const minimist = require('minimist');
const { applyPromoCode, getActivePromoCodes } = require('./lib/promo-codes');

const args = minimist(process.argv.slice(2));
const PORT = args.port || process.env.PORT || 3000;

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Compute a few fake metrics for the dashboard. Kept deterministic so the demo
// renders the same numbers every time.
function buildMetrics() {
  const services = [
    { name: 'api-gateway', requests: 18420, errors: 12 },
    { name: 'auth-service', requests: 9310, errors: 3 },
    { name: 'billing', requests: 4502, errors: 0 },
  ].map((service) => ({
    ...service,
    status: service.errors === 0 ? 'healthy' : service.errors <= 5 ? 'watch' : 'degraded',
  }));
  const totalRequests = _.sumBy(services, 'requests');
  const totalErrors = _.sumBy(services, 'errors');
  const errorRate = _.round((totalErrors / totalRequests) * 100, 3);
  const statusCounts = _.countBy(services, 'status');
  const statusRank = { healthy: 0, watch: 1, degraded: 2 };
  const highestPriorityArea = _.maxBy(
    services,
    (service) => statusRank[service.status] * 1000000 + service.errors,
  );

  return {
    services,
    totalRequests,
    totalErrors,
    errorRate,
    statusCounts,
    overallHealth: highestPriorityArea.status,
    highestPriorityArea,
  };
}

app.get('/', (req, res) => {
  res.render('dashboard', { metrics: buildMetrics() });
});

// List the promo codes the billing page may offer (active codes only).
app.get('/api/promo-codes', (req, res) => {
  res.json(getActivePromoCodes());
});

// Proxy a health probe through axios so the dependency is genuinely exercised.
app.get('/health/upstream', async (req, res) => {
  try {
    const r = await axios.get('https://example.com', { timeout: 2000 });
    res.json({ upstream: 'ok', status: r.status });
  } catch (err) {
    res.status(502).json({ upstream: 'unreachable', error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`axiom-demo-dashboard listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, buildMetrics, applyPromoCode, getActivePromoCodes };
