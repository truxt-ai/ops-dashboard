'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const zeroCounts = {
  critical: 0,
  high: 0,
  moderate: 0,
  low: 0,
  info: 0,
};

function normalizeDependencyAudit(input) {
  const moduleUnderTest = require('../src/features/dependency-health/dependencyHealth');
  assert.equal(
    typeof moduleUnderTest.normalizeDependencyAudit,
    'function',
    'dependency health module must export normalizeDependencyAudit(input)'
  );
  return moduleUnderTest.normalizeDependencyAudit(input);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertSummaryContract(summary) {
  for (const key of [
    'status',
    'isClean',
    'total',
    'counts',
    'highestSeverity',
    'dependencies',
    'generatedAt',
    'sourceLabel',
  ]) {
    assert.ok(hasOwn(summary, key), `summary exposes ${key}`);
  }
  assert.equal(typeof summary.counts.critical, 'number');
  assert.equal(typeof summary.counts.high, 'number');
  assert.equal(typeof summary.counts.moderate, 'number');
  assert.equal(typeof summary.counts.low, 'number');
  assert.equal(typeof summary.counts.info, 'number');
  assert.ok(Array.isArray(summary.dependencies), 'dependencies is an array');
}

function dependencySubset(dependency) {
  return {
    packageName: dependency.packageName,
    severity: dependency.severity,
    title: dependency.title,
    currentVersion: dependency.currentVersion,
    fixedVersion: dependency.fixedVersion,
    url: dependency.url,
    source: dependency.source,
  };
}

test('clean audit data returns a clean dashboard-safe summary', () => {
  const summary = normalizeDependencyAudit({
    sourceLabel: 'Stored npm audit fixture',
    generatedAt: '2026-06-13T12:00:00.000Z',
    metadata: {
      vulnerabilities: {
        ...zeroCounts,
        total: 0,
      },
    },
    vulnerabilities: {},
  });

  assertSummaryContract(summary);
  assert.equal(summary.status, 'clean');
  assert.equal(summary.isClean, true);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.counts, zeroCounts);
  assert.deepEqual(summary.dependencies, []);
  assert.equal(summary.generatedAt, '2026-06-13T12:00:00.000Z');
  assert.equal(summary.sourceLabel, 'Stored npm audit fixture');
});

test('critical and high audit risks return risk status and priority counts', () => {
  const summary = normalizeDependencyAudit({
    sourceLabel: 'Stored npm audit fixture',
    generatedAt: '2026-06-13T12:00:00.000Z',
    metadata: {
      vulnerabilities: {
        critical: 1,
        high: 1,
        moderate: 0,
        low: 0,
        info: 0,
        total: 2,
      },
    },
    vulnerabilities: {
      'critical-package': {
        name: 'critical-package',
        severity: 'critical',
        currentVersion: '1.0.0',
        via: [
          {
            title: 'Critical dependency execution advisory',
            url: 'https://advisories.example/critical-package',
            source: 'GHSA-critical-package',
          },
        ],
        fixAvailable: { version: '1.0.1' },
      },
      'high-package': {
        name: 'high-package',
        severity: 'high',
        currentVersion: '2.3.0',
        via: [
          {
            title: 'High dependency exposure advisory',
            url: 'https://advisories.example/high-package',
            source: 'GHSA-high-package',
          },
        ],
        fixAvailable: { version: '2.3.4' },
      },
    },
  });

  assertSummaryContract(summary);
  assert.equal(summary.status, 'risk');
  assert.equal(summary.isClean, false);
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.counts, {
    critical: 1,
    high: 1,
    moderate: 0,
    low: 0,
    info: 0,
  });
  assert.equal(summary.highestSeverity, 'critical');
});

test('mixed severities are counted and dependency rows are sorted by risk priority', () => {
  const summary = normalizeDependencyAudit({
    sourceLabel: 'Stored npm audit fixture',
    generatedAt: '2026-06-13T12:00:00.000Z',
    metadata: {
      vulnerabilities: {
        critical: 1,
        high: 1,
        moderate: 1,
        low: 1,
        info: 1,
        total: 5,
      },
    },
    vulnerabilities: {
      'low-package': {
        name: 'low-package',
        severity: 'low',
        currentVersion: '4.0.0',
        via: [
          {
            title: 'Low dependency advisory',
            url: 'https://advisories.example/low-package',
            source: 'GHSA-low-package',
          },
        ],
        fixAvailable: { version: '4.0.2' },
      },
      'critical-package': {
        name: 'critical-package',
        severity: 'critical',
        currentVersion: '1.0.0',
        via: [
          {
            title: 'Critical dependency execution advisory',
            url: 'https://advisories.example/critical-package',
            source: 'GHSA-critical-package',
          },
        ],
        fixAvailable: { version: '1.0.1' },
      },
      'info-package': {
        name: 'info-package',
        severity: 'info',
        currentVersion: '5.0.0',
        via: [
          {
            title: 'Informational dependency notice',
            url: 'https://advisories.example/info-package',
            source: 'INFO-info-package',
          },
        ],
        fixAvailable: { version: '5.0.1' },
      },
      'high-package': {
        name: 'high-package',
        severity: 'high',
        currentVersion: '2.3.0',
        via: [
          {
            title: 'High dependency exposure advisory',
            url: 'https://advisories.example/high-package',
            source: 'GHSA-high-package',
          },
        ],
        fixAvailable: { version: '2.3.4' },
      },
      'moderate-package': {
        name: 'moderate-package',
        severity: 'moderate',
        currentVersion: '3.1.0',
        via: [
          {
            title: 'Moderate dependency advisory',
            url: 'https://advisories.example/moderate-package',
            source: 'GHSA-moderate-package',
          },
        ],
        fixAvailable: { version: '3.1.5' },
      },
    },
  });

  assertSummaryContract(summary);
  assert.equal(summary.status, 'risk');
  assert.equal(summary.isClean, false);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.counts, {
    critical: 1,
    high: 1,
    moderate: 1,
    low: 1,
    info: 1,
  });
  assert.equal(summary.highestSeverity, 'critical');
  assert.deepEqual(
    summary.dependencies.map(dependencySubset),
    [
      {
        packageName: 'critical-package',
        severity: 'critical',
        title: 'Critical dependency execution advisory',
        currentVersion: '1.0.0',
        fixedVersion: '1.0.1',
        url: 'https://advisories.example/critical-package',
        source: 'GHSA-critical-package',
      },
      {
        packageName: 'high-package',
        severity: 'high',
        title: 'High dependency exposure advisory',
        currentVersion: '2.3.0',
        fixedVersion: '2.3.4',
        url: 'https://advisories.example/high-package',
        source: 'GHSA-high-package',
      },
      {
        packageName: 'moderate-package',
        severity: 'moderate',
        title: 'Moderate dependency advisory',
        currentVersion: '3.1.0',
        fixedVersion: '3.1.5',
        url: 'https://advisories.example/moderate-package',
        source: 'GHSA-moderate-package',
      },
      {
        packageName: 'low-package',
        severity: 'low',
        title: 'Low dependency advisory',
        currentVersion: '4.0.0',
        fixedVersion: '4.0.2',
        url: 'https://advisories.example/low-package',
        source: 'GHSA-low-package',
      },
      {
        packageName: 'info-package',
        severity: 'info',
        title: 'Informational dependency notice',
        currentVersion: '5.0.0',
        fixedVersion: '5.0.1',
        url: 'https://advisories.example/info-package',
        source: 'INFO-info-package',
      },
    ]
  );
});

test('missing optional advisory fields produce display-safe dependency values', () => {
  const summary = normalizeDependencyAudit({
    sourceLabel: 'Partial stored audit fixture',
    generatedAt: '2026-06-13T12:00:00.000Z',
    vulnerabilities: {
      'partial-package': {
        severity: 'moderate',
        via: [{ source: 'PARTIAL-ADVISORY' }],
        fixAvailable: false,
      },
    },
  });

  assertSummaryContract(summary);
  assert.equal(summary.status, 'risk');
  assert.equal(summary.isClean, false);
  assert.equal(summary.total, 1);
  assert.deepEqual(summary.counts, {
    critical: 0,
    high: 0,
    moderate: 1,
    low: 0,
    info: 0,
  });

  const dependency = summary.dependencies[0];
  assert.equal(dependency.packageName, 'partial-package');
  assert.equal(dependency.severity, 'moderate');
  for (const field of ['title', 'currentVersion', 'fixedVersion', 'source']) {
    assert.equal(typeof dependency[field], 'string', `${field} is display text`);
    assert.ok(dependency[field].trim().length > 0, `${field} is not blank`);
    assert.notEqual(dependency[field], 'undefined');
    assert.notEqual(dependency[field], 'null');
  }
  assert.notEqual(dependency.url, undefined);
  assert.notEqual(dependency.url, null);
});

test('empty or unknown audit input normalizes to a safe clean state', () => {
  for (const input of [
    undefined,
    null,
    {},
    { sourceLabel: 'Unknown stored audit fixture' },
    { metadata: { vulnerabilities: null }, vulnerabilities: null },
  ]) {
    const summary = normalizeDependencyAudit(input);
    assertSummaryContract(summary);
    assert.equal(summary.status, 'clean');
    assert.equal(summary.isClean, true);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.counts, zeroCounts);
    assert.deepEqual(summary.dependencies, []);
    assert.equal(typeof summary.sourceLabel, 'string');
    assert.ok(summary.sourceLabel.trim().length > 0);
  }
});

test('raw audit text is not surfaced as the user-facing result', () => {
  const summary = normalizeDependencyAudit({
    sourceLabel: 'Stored npm audit fixture',
    generatedAt: '2026-06-13T12:00:00.000Z',
    rawAuditText: 'RAW_AUDIT_SENTINEL npm audit --json output should stay internal',
    metadata: {
      vulnerabilities: {
        ...zeroCounts,
        total: 0,
      },
    },
    vulnerabilities: {},
  });

  assertSummaryContract(summary);
  assert.equal(summary.status, 'clean');
  assert.equal(hasOwn(summary, 'rawAuditText'), false);
  assert.equal(hasOwn(summary, 'raw'), false);
  assert.doesNotMatch(JSON.stringify(summary), /RAW_AUDIT_SENTINEL|npm audit --json/);
});
