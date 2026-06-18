'use strict';

/**
 * Security regression tests for ATL-146 (ops-dashboard dependency vulnerabilities).
 *
 * Each test must be RED on the vulnerable version and GREEN after the fix.
 * Advisory IDs are noted per test. Tests operate at the dependency boundary —
 * no network, no filesystem I/O, no external calls.
 */

const { test } = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// CVE/advisory: GHSA-phwq-j96m-2c2q
// ejs < 3.1.7 — template injection via `outputFunctionName` option (CWE-74)
// Vulnerable: ejs 2.5.7 (installed) → Fix: ejs >= 3.1.7 (6.0.1 recommended)
//
// Note: the `outputFunctionName` attack surface exists only in ejs 3.x. On 2.5.7
// the version assertion is the RED signal; the behavioral guard catches any
// regression to a 3.x pre-patch build.
// ---------------------------------------------------------------------------
test('ejs GHSA-phwq-j96m-2c2q: installed version must be >= 3.1.7', () => {
  const ejsPkg = require('../node_modules/ejs/package.json');
  const v = ejsPkg.version.split('.').map(Number);
  // Vulnerable range: < 3.1.7  (covers all of 2.x and 3.x < 3.1.7)
  const vulnerable = v[0] < 3 || (v[0] === 3 && v[1] < 1) || (v[0] === 3 && v[1] === 1 && v[2] < 7);
  assert.ok(
    !vulnerable,
    `ejs ${ejsPkg.version} is in the vulnerable range (< 3.1.7) for GHSA-phwq-j96m-2c2q ` +
    '— template injection via outputFunctionName allows RCE; upgrade to >= 3.1.7 (6.0.1 recommended)'
  );
});

test('ejs GHSA-phwq-j96m-2c2q: outputFunctionName must not execute injected code', () => {
  const ejs = require('../node_modules/ejs');
  delete global.__ejsSecProbe;

  // On ejs 3.x pre-3.1.7, this payload is interpolated verbatim into the
  // compiled function body:  var x; global.__ejsSecProbe = 'rce'; x = __append;
  // Fixed versions (>= 3.1.7) validate/sanitize outputFunctionName.
  const payload = "x; global.__ejsSecProbe = 'rce'; x";
  try {
    ejs.render('<p>test</p>', {}, { outputFunctionName: payload });
  } catch {
    // A throw means the option was rejected — that is safe behaviour.
  }

  const injected = global.__ejsSecProbe;
  delete global.__ejsSecProbe;

  assert.strictEqual(
    injected,
    undefined,
    `ejs RCE via outputFunctionName (GHSA-phwq-j96m-2c2q): global.__ejsSecProbe was set ` +
    `to "${injected}" — arbitrary code executed through the outputFunctionName option`
  );
});

// ---------------------------------------------------------------------------
// CVE/advisory: GHSA-jf85-cpcp-j695
// lodash < 4.17.21 — Prototype Pollution via _.zipObjectDeep (CWE-1321)
// Vulnerable: lodash 4.17.4 (installed) → Fix: lodash >= 4.17.21
//
// _.zipObjectDeep(['__proto__.polluted'], [value]) writes to Object.prototype,
// poisoning every plain object in the process for the lifetime of the process.
// ---------------------------------------------------------------------------
test('lodash GHSA-jf85-cpcp-j695: _.zipObjectDeep must not pollute Object.prototype', () => {
  const _ = require('../node_modules/lodash');

  // Ensure the property is absent before the test
  delete Object.prototype.lodashPolluted;

  _.zipObjectDeep(['__proto__.lodashPolluted'], [true]);

  const leaked = ({}).lodashPolluted;

  // Always clean up regardless of assertion outcome
  delete Object.prototype.lodashPolluted;

  assert.strictEqual(
    leaked,
    undefined,
    `lodash prototype pollution (GHSA-jf85-cpcp-j695): ({}).lodashPolluted === ${JSON.stringify(leaked)} ` +
    'after _.zipObjectDeep(["__proto__.lodashPolluted"], [true]) — Object.prototype was mutated'
  );
});

// ---------------------------------------------------------------------------
// CVE/advisory: GHSA-xvch-5gv4-984h
// minimist < 1.2.6 — Prototype Pollution via --__proto__ flag (CWE-1321)
// Vulnerable: minimist 1.2.0 (installed) → Fix: minimist >= 1.2.6 (1.2.8 recommended)
//
// Parsing ['--__proto__.minimistPolluted', 'value'] writes to Object.prototype,
// allowing an attacker-controlled CLI argument to poison shared object state.
// ---------------------------------------------------------------------------
test('minimist GHSA-xvch-5gv4-984h: --__proto__ flag must not pollute Object.prototype', () => {
  const minimist = require('../node_modules/minimist');

  // Ensure clean state before parsing
  delete Object.prototype.minimistPolluted;

  minimist(['--__proto__.minimistPolluted', 'pwned']);

  const leaked = ({}).minimistPolluted;

  // Always clean up
  delete Object.prototype.minimistPolluted;

  assert.strictEqual(
    leaked,
    undefined,
    `minimist prototype pollution (GHSA-xvch-5gv4-984h): ({}).minimistPolluted === ${JSON.stringify(leaked)} ` +
    'after minimist(["--__proto__.minimistPolluted", "pwned"]) — Object.prototype was mutated'
  );
});
