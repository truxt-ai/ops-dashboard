'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

function loadFormatRiskSummary() {
  const { formatRiskSummary } = require('../src/lib/risk-summary');
  assert.equal(typeof formatRiskSummary, 'function');
  return formatRiskSummary;
}

test('formatRiskSummary is importable from the public lib path used by app code', () => {
  const formatRiskSummary = loadFormatRiskSummary();

  assert.equal(
    formatRiskSummary({ critical: 3, high: 4, moderate: 1, low: 3 }),
    '3 critical, 4 high, 1 moderate, 3 low'
  );
});

test('formatRiskSummary preserves severity order and omits zero severities', () => {
  const formatRiskSummary = loadFormatRiskSummary();

  assert.equal(formatRiskSummary({ low: 2, high: 1, critical: 0 }), '1 high, 2 low');
  assert.equal(formatRiskSummary({ high: 1 }), '1 high');
});

test('formatRiskSummary ignores unknown and effectively zero count values', () => {
  const formatRiskSummary = loadFormatRiskSummary();

  assert.equal(
    formatRiskSummary({
      critical: null,
      high: undefined,
      moderate: Number.NaN,
      low: -3,
      informational: 99,
    }),
    '0 vulnerabilities'
  );
  assert.equal(formatRiskSummary({}), '0 vulnerabilities');
});
