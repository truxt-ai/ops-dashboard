'use strict';

const path = require('path');
const express = require('express');
const axios = require('axios');
const _ = require('lodash');
const minimist = require('minimist');
const {
  buildServiceHealthSummary,
  getServiceHealthLabel,
} = require('./lib/service-health-summary');

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
  ];
  const serviceHealth = [
    { id: 'api-gateway', name: 'api-gateway', status: 'healthy' },
    { id: 'auth-service', name: 'auth-service', status: 'degraded' },
    { id: 'billing', name: 'billing', status: 'offline' },
  ];
  const totalRequests = _.sumBy(services, 'requests');
  const totalErrors = _.sumBy(services, 'errors');
  const errorRate = _.round((totalErrors / totalRequests) * 100, 3);
  const serviceHealthSummary = buildServiceHealthSummary(serviceHealth);
  const serviceHealthByName = new Map(serviceHealth.map((service) => [service.name, service]));
  const serviceRows = services.map((service) => {
    const health = serviceHealthByName.get(service.name) || {};

    return {
      ...service,
      id: health.id || service.name,
      status: health.status || null,
      statusLabel: getServiceHealthLabel(health.status),
    };
  });

  return {
    services,
    serviceRows,
    serviceHealth,
    serviceHealthSummary,
    totalRequests,
    totalErrors,
    errorRate,
  };
}

app.get('/', (req, res) => {
  res.render('dashboard', { metrics: buildMetrics() });
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

module.exports = { app, buildMetrics };
