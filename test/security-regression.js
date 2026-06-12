'use strict';

// Security regression tests for RAU-84
// Each test FAILS (RED) on the current vulnerable deps and PASSES (GREEN) after the fix.
//
// Vulnerabilities covered:
//   GHSA-fvqr-27wr-82fm  lodash prototype pollution (_.merge / _.zipObjectDeep)
//   GHSA-phwq-j96m-2c2q  ejs template injection
//   GHSA-vh95-rmgr-6w4m  minimist prototype pollution (--__proto__ / --constructor)
//   npm audit             critical CVEs must be absent in installed deps

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// GHSA-fvqr-27wr-82fm: Lodash prototype pollution
// Affected: lodash <= 4.17.20; Fixed: >= 4.17.21
// ---------------------------------------------------------------------------

test('GHSA-fvqr-27wr-82fm [1/2]: lodash _.merge does not pollute Object.prototype', () => {
  const _ = require('lodash');
  try {
    // PoC: attacker-controlled JSON payload merged into a plain object
    // In lodash < 4.17.21, __proto__ key walks up the prototype chain and
    // sets properties directly on Object.prototype.
    _.merge({}, JSON.parse('{"__proto__":{"lodashMergePoison":true}}'));

    const probe = {};
    // On vulnerable lodash 4.17.4 this is true → assertion FAILS (RED).
    // On patched lodash >= 4.17.21 this is undefined → assertion PASSES (GREEN).
    assert.strictEqual(
      probe.lodashMergePoison,
      undefined,
      'GHSA-fvqr-27wr-82fm: lodash _.merge polluted Object.prototype ' +
        '("lodashMergePoison" property visible on fresh object). ' +
        'Upgrade lodash to >= 4.17.21.'
    );
  } finally {
    delete Object.prototype.lodashMergePoison;
  }
});

test('GHSA-fvqr-27wr-82fm [2/2]: lodash _.zipObjectDeep does not pollute Object.prototype', () => {
  const _ = require('lodash');
  try {
    // PoC: path-based key assignment via __proto__ segment
    // This is the canonical vector for GHSA-fvqr-27wr-82fm.
    _.zipObjectDeep(['__proto__.lodashZipPoison'], [true]);

    const probe = {};
    assert.strictEqual(
      probe.lodashZipPoison,
      undefined,
      'GHSA-fvqr-27wr-82fm: lodash _.zipObjectDeep polluted Object.prototype ' +
        '("lodashZipPoison" property visible on fresh object). ' +
        'Upgrade lodash to >= 4.17.21.'
    );
  } finally {
    delete Object.prototype.lodashZipPoison;
  }
});

// ---------------------------------------------------------------------------
// GHSA-phwq-j96m-2c2q: EJS template injection
// Affected: ejs <= 3.1.9; Fixed: ejs >= 3.1.10 (or 6.x)
// npm audit shows: "ejs template injection vulnerability" for ejs <= 3.1.9
// ---------------------------------------------------------------------------

test('GHSA-phwq-j96m-2c2q: ejs version is not vulnerable (must be > 3.1.9)', () => {
  const ejs = require('ejs');
  const version = require('ejs/package.json').version;
  const [major, minor, patch] = version.split('.').map(Number);

  // Demonstrate exploit on current version before asserting the version guard:
  // In EJS 2.x / 3.x <= 3.1.9, opts.escape is read from the options object without
  // hasOwnProperty protection. After prototype pollution (e.g., via lodash _.merge),
  // a malicious escape function on Object.prototype is invoked during rendering,
  // allowing arbitrary code execution on the server.
  //
  // The chain: attacker poisons Object.prototype.escape (via lodash _.merge or similar),
  // then any ejs.render() call without an explicit escape option picks it up:
  //   options.escapeFunction = opts.escape || utils.escapeXML;  ← EJS 2.5.7 line 459
  let exploitProof = false;
  Object.prototype.escape = function (s) {
    exploitProof = true;
    return String(s);
  };
  try {
    // No opts passed → EJS reads opts.escape from prototype chain → malicious fn executes.
    ejs.render('<%= x %>', { x: 'safe' });
  } catch (_err) {
    // render may throw on broken opts; proof captured if set before the throw
  } finally {
    delete Object.prototype.escape;
  }

  // Primary assertion: version must be patched.
  // npm audit confirms ejs <= 3.1.9 vulnerable; fixed in > 3.1.9.
  const isPatched =
    major > 3 ||
    (major === 3 && minor > 1) ||
    (major === 3 && minor === 1 && patch > 9);

  assert.ok(
    isPatched,
    `GHSA-phwq-j96m-2c2q: ejs@${version} is vulnerable to template injection ` +
      `(prototype-polluted escape executed: ${exploitProof}). ` +
      'Upgrade ejs to > 3.1.9 (e.g., 6.0.1).'
  );
});

// ---------------------------------------------------------------------------
// GHSA-vh95-rmgr-6w4m: minimist prototype pollution
// Affected: minimist 0.x – 1.2.5; Fixed: >= 1.2.6
// ---------------------------------------------------------------------------

test('GHSA-vh95-rmgr-6w4m [1/2]: minimist --__proto__ does not pollute Object.prototype', () => {
  const minimist = require('minimist');
  try {
    // PoC: passing --__proto__.minimistProto=pwned on the CLI (or via argv array)
    // minimist 1.2.0 walks the __proto__ path and sets Object.prototype.minimistProto.
    minimist(['--__proto__.minimistProto', 'pwned']);

    const probe = {};
    assert.strictEqual(
      probe.minimistProto,
      undefined,
      'GHSA-vh95-rmgr-6w4m: minimist --__proto__ polluted Object.prototype ' +
        '("minimistProto" visible on fresh object). ' +
        'Upgrade minimist to >= 1.2.6.'
    );
  } finally {
    delete Object.prototype.minimistProto;
  }
});

test('GHSA-vh95-rmgr-6w4m [2/2]: minimist --constructor does not pollute Object.prototype', () => {
  const minimist = require('minimist');
  try {
    // Secondary vector: --constructor.prototype.minimistCtorProto also works in 1.2.0-1.2.5
    minimist(['--constructor.prototype.minimistCtorProto', 'pwned']);

    const probe = {};
    assert.strictEqual(
      probe.minimistCtorProto,
      undefined,
      'GHSA-vh95-rmgr-6w4m: minimist --constructor.prototype polluted Object.prototype ' +
        '("minimistCtorProto" visible on fresh object). ' +
        'Upgrade minimist to >= 1.2.6.'
    );
  } finally {
    delete Object.prototype.minimistCtorProto;
  }
});

// ---------------------------------------------------------------------------
// npm audit: no critical vulnerabilities in installed dependencies
// This test asserts the audit is clean; it will be RED on current deps
// (3 critical CVEs: lodash, ejs, minimist) and GREEN once deps are fixed.
// ---------------------------------------------------------------------------

test('npm audit: zero critical vulnerabilities in installed dependencies', () => {
  const repoRoot = path.join(__dirname, '..');
  let exitCode = 0;
  let auditOutput = '';
  try {
    execSync('npm audit --audit-level=critical', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    exitCode = err.status || 1;
    auditOutput = (err.stdout || Buffer.alloc(0)).toString().slice(0, 800);
  }
  assert.strictEqual(
    exitCode,
    0,
    `npm audit --audit-level=critical exited ${exitCode}: ` +
      'critical vulnerabilities found. Fix lodash/ejs/minimist deps.\n' +
      auditOutput
  );
});
