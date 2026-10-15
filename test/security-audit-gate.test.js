'use strict';

// Audit gate for ATL-126 — covers every advisory NOT given a dedicated exploit
// test (axios, body-parser, express, path-to-regexp, qs, cookie, send,
// serve-static). Per the security-regression-test scope cap, those are guarded
// by asserting `npm audit` reports zero critical and zero high after the bumps,
// rather than one bespoke exploit each.
//
// RED today: the vulnerable pins report 3 critical / 4 high.
// GREEN after the dependency bumps land on the impl branch.

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function runAudit() {
  const cwd = path.join(__dirname, '..');
  try {
    const out = execFileSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    // npm audit exits non-zero when advisories are found; the JSON report is on stdout.
    if (e.stdout) {
      return JSON.parse(e.stdout.toString());
    }
    throw new Error('npm audit produced no parseable report: ' + e.message);
  }
}

test('npm audit reports zero critical and zero high vulnerabilities [ATL-126 audit gate]', () => {
  const report = runAudit();
  const v = (report.metadata && report.metadata.vulnerabilities) || {};
  assert.strictEqual(v.critical || 0, 0, 'critical-severity advisories remain: ' + (v.critical || 0));
  assert.strictEqual(v.high || 0, 0, 'high-severity advisories remain: ' + (v.high || 0));
});
