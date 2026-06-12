'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function loadFormatRiskSummary() {
  try {
    const subject = require('../src/lib/risk-summary');
    if (typeof subject.formatRiskSummary === 'function') {
      return subject.formatRiskSummary;
    }
  } catch (err) {
    const isMissingSubject =
      err &&
      err.code === 'MODULE_NOT_FOUND' &&
      String(err.message).includes('../src/lib/risk-summary');
    if (!isMissingSubject) {
      throw err;
    }
  }

  return function missingFormatRiskSummaryStub() {
    return undefined;
  };
}

const formatRiskSummary = loadFormatRiskSummary();

describe('formatRiskSummary', () => {
  const cases = [
    {
      name: 'formats the full severity set in critical, high, moderate, low order',
      counts: { critical: 3, high: 4, moderate: 1, low: 3 },
      want: '3 critical, 4 high, 1 moderate, 3 low',
    },
    {
      name: 'omits zero and missing severities while preserving a singular count',
      counts: { high: 1 },
      want: '1 high',
    },
    {
      name: 'falls back for an empty input object',
      counts: {},
      want: '0 vulnerabilities',
    },
    {
      name: 'falls back when every known severity is zero',
      counts: { critical: 0, high: 0, moderate: 0, low: 0 },
      want: '0 vulnerabilities',
    },
    {
      name: 'treats a missing counts argument as all zeroes',
      counts: undefined,
      want: '0 vulnerabilities',
    },
    {
      name: 'treats a null counts argument as all zeroes',
      counts: null,
      want: '0 vulnerabilities',
    },
    {
      name: 'treats null, undefined, negative, and NaN severity values as zero',
      counts: { critical: null, high: undefined, moderate: -2, low: Number.NaN },
      want: '0 vulnerabilities',
    },
    {
      name: 'treats non-numeric severity values as zero without coercion',
      counts: { critical: '3', high: false, moderate: {}, low: [] },
      want: '0 vulnerabilities',
    },
    {
      name: 'ignores unknown keys and orders severities independently of input key order',
      counts: { low: 3, unknown: 99, high: 4, critical: 1, moderate: 2 },
      want: '1 critical, 4 high, 2 moderate, 3 low',
    },
    {
      name: 'uses singular and plural count grammar for included severities',
      counts: { critical: 1, high: 2, moderate: 1, low: 2 },
      want: '1 critical, 2 high, 1 moderate, 2 low',
    },
  ];

  for (const { name, counts, want } of cases) {
    it(name, () => {
      assert.strictEqual(formatRiskSummary(counts), want);
    });
  }
});
