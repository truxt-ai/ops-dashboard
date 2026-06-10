'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildMetrics } = require('../src/server');

test('buildMetrics totals add up across services', () => {
  const m = buildMetrics();
  assert.strictEqual(m.totalRequests, 18420 + 9310 + 4502);
  assert.strictEqual(m.totalErrors, 12 + 3 + 0);
  assert.ok(m.errorRate >= 0, 'error rate is non-negative');
  assert.strictEqual(m.services.length, 3);
});
