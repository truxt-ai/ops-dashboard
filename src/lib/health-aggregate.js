'use strict';

function summarizeChecks(checks = []) {
  const summary = {
    total: checks.length,
    up: 0,
    down: 0,
    degraded: 0,
    healthy: true,
  };

  for (const check of checks) {
    if (check.status === 'up') summary.up += 1;
    if (check.status === 'down') summary.down += 1;
    if (check.status === 'degraded') summary.degraded += 1;
  }

  summary.healthy = summary.down === 0 && summary.degraded === 0;
  return summary;
}

function worstStatus(checks = []) {
  if (checks.some((check) => check.status === 'down')) return 'down';
  if (checks.some((check) => check.status === 'degraded')) return 'degraded';
  return 'up';
}

module.exports = { summarizeChecks, worstStatus };
