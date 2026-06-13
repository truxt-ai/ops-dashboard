'use strict';

const PUBLIC_BUCKETS = ['healthy', 'degraded', 'offline'];

const STATUS_BUCKETS = {
  healthy: 'healthy',
  ok: 'healthy',
  operational: 'healthy',
  online: 'healthy',
  up: 'healthy',
  passing: 'healthy',
  green: 'healthy',
  degraded: 'degraded',
  warning: 'degraded',
  warn: 'degraded',
  partial: 'degraded',
  impaired: 'degraded',
  unstable: 'degraded',
  yellow: 'degraded',
  offline: 'offline',
  down: 'offline',
  outage: 'offline',
  critical: 'offline',
  unavailable: 'offline',
  failed: 'offline',
  red: 'offline',
};

function normalizeServiceStatus(service) {
  if (!service || typeof service !== 'object') {
    return 'offline';
  }

  const rawStatus = service.status || service.health || service.state;
  const normalized = String(rawStatus || '').trim().toLowerCase();
  if (STATUS_BUCKETS[normalized]) {
    return STATUS_BUCKETS[normalized];
  }

  return Number(service.errors) > 0 ? 'degraded' : 'healthy';
}

function summarizeServiceHealth(services) {
  const counts = {
    healthy: 0,
    degraded: 0,
    offline: 0,
  };

  (Array.isArray(services) ? services : []).forEach((service) => {
    counts[normalizeServiceStatus(service)] += 1;
  });

  const summary = {
    healthy: counts.healthy,
    degraded: counts.degraded,
    offline: counts.offline,
    counts,
    total: PUBLIC_BUCKETS.reduce((sum, bucket) => sum + counts[bucket], 0),
    allClear: counts.degraded === 0 && counts.offline === 0,
  };

  summary.items = PUBLIC_BUCKETS.map((bucket) => ({
    bucket,
    count: counts[bucket],
    label: bucket.charAt(0).toUpperCase() + bucket.slice(1),
  }));

  return summary;
}

function ServiceHealthSummary(services) {
  return summarizeServiceHealth(services);
}

module.exports = {
  PUBLIC_BUCKETS,
  normalizeServiceStatus,
  summarizeServiceHealth,
  ServiceHealthSummary,
};
