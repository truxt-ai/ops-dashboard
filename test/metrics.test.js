'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const _ = require('lodash');
const { buildMetrics } = require('../src/lib/metrics');

test('TC-01: successful metrics build records its completion time and totals', () => {
  const timestamp = '2026-10-22T08:20:00.000Z';
  const metrics = buildMetrics(() => new Date(timestamp));
  assert.equal(metrics.lastSuccessfulRefreshAt, timestamp);
  assert.equal(metrics.totalRequests, 32232);
  assert.equal(metrics.totalErrors, 1100);
  assert.equal(metrics.errorRate, 3.413);
  assert.equal(metrics.services.length, 3);
});

test('refresh clock is read after calculation, and never after failed calculation', (t) => {
  const round = _.round;
  let calculated = false;
  t.mock.method(_, 'round', (...args) => {
    calculated = true;
    return round(...args);
  });
  let clockReads = 0;
  const clock = () => {
    assert.ok(calculated);
    clockReads++;
    return new Date('2026-10-22T08:20:00.000Z');
  };
  buildMetrics(clock);
  assert.equal(clockReads, 1);
  t.mock.method(_, 'sumBy', () => { throw new Error('calculation failed'); });
  assert.throws(() => buildMetrics(clock), /calculation failed/);
  assert.equal(clockReads, 1);
});

test('TC-04: shipped metrics show all states and retain consistent aggregates', () => {
  const metrics = buildMetrics();
  assert.deepEqual(metrics.services.map(({ name, requests, errors, status }) => ({ name, requests, errors, status })), [
    { name: 'api-gateway', requests: 18420, errors: 1000, status: 'failing' },
    { name: 'auth-service', requests: 9310, errors: 100, status: 'degraded' },
    { name: 'billing', requests: 4502, errors: 0, status: 'healthy' },
  ]);
  assert.equal(metrics.totalRequests, 32232);
  assert.equal(metrics.totalErrors, 1100);
  assert.equal(metrics.totalRequests, metrics.services.reduce((sum, s) => sum + s.requests, 0));
  assert.equal(metrics.totalErrors, metrics.services.reduce((sum, s) => sum + s.errors, 0));
  assert.equal(metrics.errorRate, 3.413);
});
