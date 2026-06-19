'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ZERO_SUMMARY = {
  total: 0,
  bySeverity: { critical: 0, high: 0, moderate: 0, low: 0 },
  top: [],
};

function loadSummarizer() {
  let mod;
  try {
    mod = require('../src/lib/dependency-risk-summary');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && err.message.includes('dependency-risk-summary')) {
      assert.fail('expected ../src/lib/dependency-risk-summary to export summarizeNpmAuditRisk');
    }
    throw err;
  }

  assert.equal(
    typeof mod.summarizeNpmAuditRisk,
    'function',
    'expected summarizeNpmAuditRisk to be exported as a function',
  );
  return mod.summarizeNpmAuditRisk;
}

test('summarizeNpmAuditRisk summarizes a representative npm audit fixture', () => {
  const summarizeNpmAuditRisk = loadSummarizer();

  const audit = {
    vulnerabilities: {
      lodash: {
        name: 'lodash',
        severity: 'high',
        via: [
          { name: 'lodash', severity: 'high', title: 'Prototype pollution in lodash' },
          { severity: 'critical', title: 'Arbitrary code path in lodash plugin' },
        ],
      },
      minimist: {
        name: 'minimist',
        severity: 'critical',
        via: [
          { name: 'minimist', severity: 'critical', title: 'Prototype pollution in minimist' },
        ],
      },
      axios: {
        name: 'axios',
        severity: 'moderate',
        via: [
          'follow-redirects',
          { name: 'axios', severity: 'moderate', title: 'SSRF in axios' },
        ],
      },
      ejs: {
        name: 'ejs',
        severity: 'low',
        via: [
          { severity: 'low', title: 'Template escaping issue in ejs' },
        ],
      },
      express: {
        name: 'express',
        severity: 'high',
        via: [
          { severity: 'high', title: 'Open redirect in express' },
        ],
      },
    },
  };

  assert.deepEqual(summarizeNpmAuditRisk(audit), {
    total: 5,
    bySeverity: { critical: 1, high: 2, moderate: 1, low: 1 },
    top: [
      { package: 'lodash', severity: 'critical', title: 'Arbitrary code path in lodash plugin' },
      { package: 'minimist', severity: 'critical', title: 'Prototype pollution in minimist' },
      { package: 'lodash', severity: 'high', title: 'Prototype pollution in lodash' },
    ],
  });
});

test('summarizeNpmAuditRisk returns an all-zero summary for empty and no-vulnerability input', () => {
  const summarizeNpmAuditRisk = loadSummarizer();

  const cases = [
    { name: 'null input', input: null },
    { name: 'undefined input', input: undefined },
    { name: 'empty object', input: {} },
    { name: 'missing vulnerabilities object', input: { metadata: { totalDependencies: 12 } } },
    { name: 'empty vulnerabilities object', input: { vulnerabilities: {} } },
  ];

  for (const { name, input } of cases) {
    assert.deepEqual(summarizeNpmAuditRisk(input), ZERO_SUMMARY, name);
  }
});

test('summarizeNpmAuditRisk ignores malformed entries and advisories without throwing', () => {
  const summarizeNpmAuditRisk = loadSummarizer();

  const audit = {
    vulnerabilities: {
      '': {
        severity: 'critical',
        via: [
          { severity: 'critical', title: 'Empty package key should be ignored' },
        ],
      },
      missingSeverity: {
        name: 'missing-severity',
        via: [
          { severity: 'high', title: 'Advisory on an invalid vulnerability should be ignored' },
        ],
      },
      unknownSeverity: {
        name: 'unknown-severity',
        severity: 'medium',
        via: [
          { severity: 'high', title: 'Unknown severity should be ignored' },
        ],
      },
      nullEntry: null,
      stringEntry: 'not an audit vulnerability entry',
      validLow: {
        severity: 'low',
        via: [
          null,
          'transitive-package',
          { severity: 'medium', title: 'Unknown advisory severity' },
          { severity: 'low' },
          { title: 'Missing advisory severity' },
          { severity: 'low', title: 'Low severity advisory without package name' },
        ],
      },
      validModerateWithoutVia: {
        name: 'valid-moderate-without-via',
        severity: 'moderate',
      },
      validHighWithMalformedVia: {
        name: 'valid-high-with-malformed-via',
        severity: 'high',
        via: [
          null,
          'nested-transitive',
          { severity: 'critical' },
          { title: 'Missing severity' },
        ],
      },
    },
  };

  assert.doesNotThrow(() => summarizeNpmAuditRisk(audit));
  assert.deepEqual(summarizeNpmAuditRisk(audit), {
    total: 3,
    bySeverity: { critical: 0, high: 1, moderate: 1, low: 1 },
    top: [
      { package: 'validLow', severity: 'low', title: 'Low severity advisory without package name' },
    ],
  });
});
