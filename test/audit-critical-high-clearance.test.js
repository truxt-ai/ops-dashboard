'use strict';

const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('RAU-316 audit gate reports zero high and critical vulnerabilities after dependency remediation', () => {
  const audit = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1'
    },
    timeout: 30000
  });

  assert.notStrictEqual(audit.error && audit.error.code, 'ETIMEDOUT', 'npm audit must finish within 30s');
  assert.ok(audit.stdout, `npm audit must emit JSON on stdout; stderr: ${audit.stderr}`);

  const report = JSON.parse(audit.stdout);
  const vulnerabilities = report.metadata && report.metadata.vulnerabilities;
  const highAndCritical = {
    critical: vulnerabilities && vulnerabilities.critical,
    high: vulnerabilities && vulnerabilities.high
  };

  assert.ok(vulnerabilities, 'npm audit JSON must include vulnerability counts');
  assert.deepStrictEqual(
    highAndCritical,
    { critical: 0, high: 0 },
    'npm audit must report 0 critical and 0 high vulnerabilities'
  );
});
