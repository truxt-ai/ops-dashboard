'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  renderDependencyRiskSummary,
} = require('../src/lib/dependency-risk-summary');

function visibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('renderDependencyRiskSummary renders formatter-ordered non-zero severities with styling hooks', () => {
  const html = renderDependencyRiskSummary({
    low: 3,
    unknown: 8,
    critical: 1,
    medium: 0,
    info: 5,
    high: 2,
  });
  const text = visibleText(html);

  assert.match(
    text,
    /1 critical vulnerability, 2 high vulnerabilities, 3 low vulnerabilities/,
    'component should display formatter-compatible text in critical, high, medium, low order while omitting zeros',
  );
  assert.ok(
    text.indexOf('critical') < text.indexOf('high') && text.indexOf('high') < text.indexOf('low'),
    'rendered summary text keeps formatter severity ordering',
  );
  assert.doesNotMatch(text, /\bmedium\b/i, 'zero-count medium severity is omitted');
  assert.doesNotMatch(text, /\binfo\b/i, 'unsupported info severity is omitted');
  assert.doesNotMatch(text, /\bunknown\b/i, 'unsupported unknown severity is omitted');

  for (const severity of ['critical', 'high', 'low']) {
    assert.match(
      html,
      new RegExp(`data-severity=["']${severity}["']`),
      `${severity} severity has a stable data-severity styling hook`,
    );
    assert.match(
      html,
      new RegExp(`dependency-risk-summary__severity--${severity}`),
      `${severity} severity has a severity-specific class`,
    );
  }
  assert.doesNotMatch(html, /data-severity=["']medium["']/, 'zero-count severities do not render styling hooks');
});

test('renderDependencyRiskSummary renders formatter-compatible all-clear text without severity styling', () => {
  const html = renderDependencyRiskSummary({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 7,
    unknown: 4,
  });

  assert.strictEqual(visibleText(html), 'No known dependency vulnerabilities.');
  assert.doesNotMatch(
    html,
    /dependency-risk-summary__severity--(critical|high|medium|low)/,
    'all-clear output does not render severity-specific styling',
  );
});
