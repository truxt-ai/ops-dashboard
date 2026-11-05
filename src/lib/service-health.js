'use strict';

const { round } = require('lodash');

const severity = { failing: 0, degraded: 1, healthy: 2 };
const labels = { failing: 'Failing', degraded: 'Degraded', healthy: 'Healthy' };
const names = new Intl.Collator('en', { sensitivity: 'base' });

function classifyServiceHealth({ requests, errors }) {
  if (requests === 0) return 'healthy';
  const rate = errors / requests;
  if (rate >= 0.05) return 'failing';
  if (rate >= 0.01) return 'degraded';
  return 'healthy';
}

function presentServices(services) {
  return services.map(service => {
    const status = classifyServiceHealth(service);
    const errorRate = service.requests === 0 ? 0 : round(service.errors / service.requests * 100, 3);
    return { ...service, status, statusLabel: labels[status], errorRate };
  }).sort((a, b) => severity[a.status] - severity[b.status]
    || names.compare(a.name, b.name)
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

module.exports = { classifyServiceHealth, presentServices };
