'use strict';

// Percentile helpers for the metrics panel. Given a list of latency samples
// (milliseconds), return the value at the requested percentile using nearest-
// rank. Used by the dashboard to surface p95/p99 alongside the request totals.

function percentile(samples, p) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return 0;
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

function summarize(samples) {
  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
  };
}

module.exports = { percentile, summarize };
