'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

function loadFormatter() {
  let mod;
  try {
    mod = require('../src/lib/dependency-risk-summary');
  } catch (err) {
    assert.fail(
      `Expected dependency risk summary formatter module at src/lib/dependency-risk-summary.js: ${err.message}`,
    );
  }

  assert.strictEqual(
    typeof mod.formatDependencyRiskSummary,
    'function',
    'expected formatDependencyRiskSummary to be exported',
  );

  return mod.formatDependencyRiskSummary;
}

[
  {
    name: 'singular critical count',
    counts: { critical: 1 },
    want: '1 critical vulnerability.',
  },
  {
    name: 'plural high count',
    counts: { high: 2 },
    want: '2 high vulnerabilities.',
  },
].forEach(({ name, counts, want }) => {
  test(`formatDependencyRiskSummary formats ${name}`, () => {
    const formatDependencyRiskSummary = loadFormatter();

    assert.strictEqual(formatDependencyRiskSummary(counts), want);
  });
});

test('formatDependencyRiskSummary omits zero-count severities from mixed output', () => {
  const formatDependencyRiskSummary = loadFormatter();

  assert.strictEqual(
    formatDependencyRiskSummary({
      critical: 0,
      high: 2,
      medium: 0,
      low: 1,
    }),
    '2 high vulnerabilities, 1 low vulnerability.',
  );
});

test('formatDependencyRiskSummary orders supported severities critical, high, medium, low', () => {
  const formatDependencyRiskSummary = loadFormatter();

  assert.strictEqual(
    formatDependencyRiskSummary({
      low: 4,
      medium: 3,
      critical: 1,
      high: 2,
    }),
    '1 critical vulnerability, 2 high vulnerabilities, 3 medium vulnerabilities, 4 low vulnerabilities.',
  );
});

test('formatDependencyRiskSummary returns exact all-clear output when no supported counts are positive', () => {
  const formatDependencyRiskSummary = loadFormatter();

  assert.strictEqual(
    formatDependencyRiskSummary({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 12,
      unknown: 5,
    }),
    'No known dependency vulnerabilities.',
  );
});

test('formatDependencyRiskSummary ignores unsupported info and unknown severities', () => {
  const formatDependencyRiskSummary = loadFormatter();

  assert.strictEqual(
    formatDependencyRiskSummary({
      info: 8,
      critical: 1,
      unknown: 3,
      medium: 2,
    }),
    '1 critical vulnerability, 2 medium vulnerabilities.',
  );
});
