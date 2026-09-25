'use strict';
// Security regression tests for ATL-598 dependency audit.
// Per the security-regression-test skill: dependency-boundary RED->GREEN tests.
// Tests MUST fail (RED) against pre-fix versions, PASS (GREEN) after bumps.
//
// Advisory coverage:
//   GHSA-phwq-j96m-2c2q - ejs 2.5.7 -> 6.0.1: options-injection via outputFunctionName
//   GHSA-jf85-cpcp-j695 - lodash 4.17.4 -> 4.18.1: Prototype Pollution via _.set
//   GHSA-xvch-5gv4-984h - minimist 1.2.0 -> 1.2.8: Prototype Pollution via __proto__
//   npm audit fallback  - all remaining critical/high advisories cleared

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execSync } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// GHSA-jf85-cpcp-j695 — lodash 4.17.4 -> 4.18.1
// Prototype Pollution: lodash 4.17.4 allows _.set({}, '__proto__.x', val) to
// walk __proto__ and pollute Object.prototype. Fixed versions (>= 4.17.21) block
// __proto__ traversal. RED on 4.17.4 (pollutes), GREEN on >= 4.17.21 (safe).
// ─────────────────────────────────────────────────────────────────────────────
test('GHSA-jf85-cpcp-j695: lodash _.set does not pollute Object.prototype', () => {
  const _ = require('lodash');
  // Exercise the vulnerability path directly at the dependency boundary.
  _.set({}, '__proto__.polluted_jf85', 'vulnerable');
  const polluted = ({}).polluted_jf85 === 'vulnerable';
  // Clean up regardless so subsequent tests are isolated.
  try { delete Object.prototype.polluted_jf85; } catch (_) { /* ok */ }
  // On lodash 4.17.4: polluted === true -> RED (exploit active)
  // On lodash >= 4.17.21: polluted === false -> GREEN (fixed)
  assert.strictEqual(
    polluted,
    false,
    'lodash GHSA-jf85-cpcp-j695: _.set() polluted Object.prototype via __proto__ key — EXPLOIT ACTIVE on this version'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GHSA-xvch-5gv4-984h — minimist 1.2.0 -> 1.2.8
// Prototype Pollution: minimist 1.2.0 parses --__proto__.key val arguments and
// writes them to Object.prototype. Fixed version (>= 1.2.6) strips __proto__
// and constructor keys. RED on 1.2.0 (pollutes), GREEN on >= 1.2.6 (safe).
// ─────────────────────────────────────────────────────────────────────────────
test('GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype via __proto__', () => {
  const minimist = require('minimist');
  // Exercise the vulnerability path directly at the dependency boundary.
  minimist(['--__proto__.polluted_xvch', 'vulnerable']);
  const polluted = ({}).polluted_xvch === 'vulnerable';
  // Clean up regardless so subsequent tests are isolated.
  try { delete Object.prototype.polluted_xvch; } catch (_) { /* ok */ }
  // On minimist 1.2.0: polluted === true -> RED (exploit active)
  // On minimist >= 1.2.6: polluted === false -> GREEN (fixed)
  assert.strictEqual(
    polluted,
    false,
    'minimist GHSA-xvch-5gv4-984h: parsing --__proto__ argument polluted Object.prototype — EXPLOIT ACTIVE on this version'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GHSA-phwq-j96m-2c2q — ejs 2.5.7 -> 6.0.1
// Template injection: ejs 2.5.7 passes attacker-controlled outputFunctionName
// option unsanitised into new Function(...), enabling arbitrary code execution.
// Fixed version (>= 2.7.4) validates the option as a safe JavaScript identifier.
//
// EJS is a trusted-template engine, not a sandbox, so template content is always
// evaluated. The vuln is specifically in OPTIONS passed to render(), not template
// content. On vulnerable versions a non-identifier string with semicolons in
// outputFunctionName option will cause an error that leaks the injected string
// in the error message — on fixed versions the option is validated before use.
//
// We test at the dependency boundary: assert that a malicious identifier with
// semicolons throws a validation error (rejected) on the patched version.
// On vulnerable 2.5.7: the option is used directly without validation, the
// compiled function may execute. On patched >= 2.7.4: throws an error about
// invalid identifier.
// ─────────────────────────────────────────────────────────────────────────────
test('GHSA-phwq-j96m-2c2q: ejs rejects malicious outputFunctionName option', () => {
  const ejs = require('ejs');
  const pkgPath = path.join(path.dirname(require.resolve('ejs')), '../package.json');
  const ejsVersion = require(pkgPath).version;
  // A malicious outputFunctionName with semicolons (would allow code injection)
  const maliciousName = 'a; process.exit(1); //';
  let threw = false;
  let thrownMsg = '';
  try {
    ejs.render('<%= msg %>', { msg: 'hello' }, { outputFunctionName: maliciousName });
  } catch (e) {
    threw = true;
    thrownMsg = e.message || '';
  }
  // On ejs 2.5.7 (vulnerable): render() does not throw; the malicious string is
  // used directly. On ejs >= 2.7.4 (patched): throws a validation error.
  // We assert threw === true (patched behavior) and threw === false is RED.
  assert.strictEqual(
    threw,
    true,
    `ejs ${ejsVersion}: GHSA-phwq-j96m-2c2q — render() accepted malicious outputFunctionName without error — EXPLOIT SURFACE ACTIVE`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// npm audit fallback — all remaining critical/high advisories cleared
// Per security-regression-test skill: assert npm audit exits 0 after bumps.
// RED on pre-fix (npm audit exits non-zero: critical: 3, high: 6 found).
// GREEN on post-fix (npm audit exits 0: zero critical/high).
// ─────────────────────────────────────────────────────────────────────────────
test('npm audit: zero critical and high severity advisories after dependency bumps', () => {
  const repoRoot = path.join(__dirname, '..');
  try {
    execSync('npm audit --audit-level=high', {
      cwd: repoRoot,
      timeout: 30000,
      stdio: 'pipe',
    });
    // Exit 0 -> no critical/high vulns -> GREEN
    assert.ok(true, 'npm audit: zero critical/high vulnerabilities found');
  } catch (err) {
    // Exit non-zero -> vulnerabilities found -> RED
    assert.fail(
      'npm audit: critical/high vulnerabilities still present — bump ejs>=6.0.1, ' +
      'lodash>=4.17.21, minimist>=1.2.8, axios>=0.21.4, express>=4.22.3 in package.json'
    );
  }
});
