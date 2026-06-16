'use strict';

const path = require('path');
const express = require('express');
const axios = require('axios');
const _ = require('lodash');
const minimist = require('minimist');
const promoCodes = require('./lib/promo-codes');
const { buildDiscountQuote, listActivePromoCodes } = promoCodes;

const args = minimist(process.argv.slice(2));
const PORT = args.port || process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Compute a few fake metrics for the dashboard. Kept deterministic so the demo
// renders the same numbers every time.
function buildMetrics() {
  const services = [
    { name: 'api-gateway', requests: 18420, errors: 12 },
    { name: 'auth-service', requests: 9310, errors: 3 },
    { name: 'billing', requests: 4502, errors: 0 },
  ];
  const totalRequests = _.sumBy(services, 'requests');
  const totalErrors = _.sumBy(services, 'errors');
  const errorRate = _.round((totalErrors / totalRequests) * 100, 3);
  return { services, totalRequests, totalErrors, errorRate };
}

app.get('/', (req, res) => {
  res.render('dashboard', { metrics: buildMetrics() });
});

app.get(['/api/billing/promo-codes', '/billing/promo-codes'], (req, res) => {
  res.json({ promoCodes: listActivePromoCodes() });
});

function readDiscountInput(req) {
  const input = req.method === 'GET' ? req.query : req.body || {};

  return {
    price: input.price ?? input.originalPrice ?? input.amount,
    promoCode: input.promoCode ?? input.promo_code ?? input.code,
  };
}

function handleBillingDiscount(req, res) {
  const { price, promoCode } = readDiscountInput(req);
  const amount = Number(price);
  const quotedPrice = Number.isFinite(amount) ? amount : price;

  res.json(buildDiscountQuote(quotedPrice, promoCode));
}

app.get('/api/billing/discount', handleBillingDiscount);
app.post([
  '/api/billing/discount',
  '/api/billing/apply-discount',
  '/api/billing/apply-promo-code',
], handleBillingDiscount);

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

module.exports = {
  app,
  buildMetrics,
  ...promoCodes,
};
