'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

function loadFormatRiskSummary() {
  const { formatRiskSummary } = require('../src/lib/risk-summary');

  assert.strictEqual(
    typeof formatRiskSummary,
    'function',
    'src/lib/risk-summary must export formatRiskSummary(counts)'
  );

  return formatRiskSummary;
}

test('formatRiskSummary returns stable ordered summaries for dependency audit counts', () => {
  const formatRiskSummary = loadFormatRiskSummary();

  assert.strictEqual(
    formatRiskSummary({ critical: 3, high: 4, moderate: 1, low: 3 }),
    '3 critical, 4 high, 1 moderate, 3 low'
  );
  assert.strictEqual(formatRiskSummary({ high: 1 }), '1 high');
  assert.strictEqual(formatRiskSummary({ low: 2, critical: 1, high: 1 }), '1 critical, 1 high, 2 low');
});

test('formatRiskSummary treats absent and zero counts as no vulnerabilities', () => {
  const formatRiskSummary = loadFormatRiskSummary();

  assert.strictEqual(formatRiskSummary({}), '0 vulnerabilities');
  assert.strictEqual(
    formatRiskSummary({ critical: 0, high: 0, moderate: 0, low: 0 }),
    '0 vulnerabilities'
  );
});

test('formatRiskSummary ignores unknown keys and coerces invalid severity values to zero', () => {
  const formatRiskSummary = loadFormatRiskSummary();

  assert.strictEqual(formatRiskSummary({ critical: null, high: undefined, moderate: -2, low: NaN }), '0 vulnerabilities');
  assert.strictEqual(formatRiskSummary({ critical: '3', high: {}, moderate: [], low: true }), '0 vulnerabilities');
  assert.strictEqual(formatRiskSummary({ high: 2, urgent: 9, informational: 4 }), '2 high');
});
