'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Registry integration coverage, explicitly requiring npm registry availability.
// This aggregate gate covers the other ATL-712 findings without pretending to
// reproduce each advisory. Only the lodash and proxy-addr tests prove exploits.
test('ATL-712 registry integration: the resolved lockfile has no critical or high npm audit findings', { timeout: 45000 }, () => {
  const result = spawnSync('npm', [
    'audit', '--json', '--package-lock-only', '--audit-level=high', '--fetch-retries=0', '--fetch-timeout=20000'
  ], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'npm audit must finish normally');
  const report = JSON.parse(result.stdout);
  assert.equal(report.error, undefined, 'registry errors are infrastructure failures, not vulnerability evidence');
  assert.ok(report.metadata && report.metadata.vulnerabilities, 'npm audit must return vulnerability counts');
  const { critical, high } = report.metadata.vulnerabilities;
  assert.deepEqual({ critical, high }, { critical: 0, high: 0 },
    'remediation must clear ALL critical/high lockfile findings, including axios and Express transitives');
});
