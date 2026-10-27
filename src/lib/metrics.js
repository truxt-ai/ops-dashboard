'use strict';

const _ = require('lodash');
const { presentServices } = require('./service-health');

// Compute a few fake metrics for the dashboard. Kept deterministic so the demo
// renders the same numbers every time.
function buildMetrics(now = () => new Date()) {
  const services = presentServices([
    { name: 'api-gateway', requests: 18420, errors: 1000 },
    { name: 'auth-service', requests: 9310, errors: 100 },
    { name: 'billing', requests: 4502, errors: 0 },
  ]);
  const totalRequests = _.sumBy(services, 'requests');
  const totalErrors = _.sumBy(services, 'errors');
  const errorRate = _.round((totalErrors / totalRequests) * 100, 3);
  const lastSuccessfulRefreshAt = now().toISOString();
  return { services, totalRequests, totalErrors, errorRate, lastSuccessfulRefreshAt };
}

module.exports = { buildMetrics };
