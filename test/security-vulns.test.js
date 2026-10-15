'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

// Security regression tests for ATL-604 critical vulnerabilities
// These tests MUST be RED on the vulnerable (pre-fix) code, and GREEN after patches are applied.
// Each test reproduces the actual exploit from the corresponding CVE/advisory.

test('CVE/GHSA-fvqr-27wr-82fm: lodash 4.17.4 prototype pollution via _.merge()', () => {
  // Reproduce GHSA-fvqr-27wr-82fm: lodash <=4.17.23 allows __proto__ to pollute Object.prototype
  // Vulnerable lodash 4.17.4 permits this merge
  const _ = require('lodash');
  
  // Clean state: __proto__.isAdmin should not exist
  delete Object.prototype.isAdmin;
  delete Object.prototype.polluted;
  
  // Exploit: merge a payload with __proto__ key
  const payload = JSON.parse('{"__proto__": {"polluted": "yes", "isAdmin": true}}');
  _.merge({}, payload);
  
  // Assertion: prototype MUST NOT be polluted after the fix
  // On vulnerable code this will fail (Object.prototype IS polluted)
  // On patched code this will pass (prototype is NOT polluted)
  assert.strictEqual(
    ({}).polluted,
    undefined,
    'Object.prototype must not be polluted by lodash.merge()'
  );
  assert.strictEqual(
    ({}).isAdmin,
    undefined,
    'Object.prototype.isAdmin must not be polluted by lodash.merge()'
  );
  
  // Cleanup for next test
  delete Object.prototype.polluted;
  delete Object.prototype.isAdmin;
});

test('CVE/GHSA-vh95-rmgr-6w4m: minimist 1.2.0 prototype pollution via CLI parsing', () => {
  // Reproduce GHSA-vh95-rmgr-6w4m: minimist <=1.2.5 allows __proto__ in argument names
  // Vulnerable minimist 1.2.0 permits this
  
  // Clean state first
  delete Object.prototype.isAdmin;
  delete Object.prototype.polluted;
  
  const minimist = require('minimist');
  
  // Exploit: parse arguments with __proto__ in the key
  minimist(['--__proto__.isAdmin=true', '--__proto__.polluted=yes']);
  
  // Assertion: prototype MUST NOT be polluted after the fix
  // On vulnerable code this will fail (Object.prototype IS polluted)
  // On patched code this will pass (prototype is NOT polluted)
  assert.strictEqual(
    ({}).isAdmin,
    undefined,
    'Object.prototype must not be polluted by minimist argument parsing'
  );
  assert.strictEqual(
    ({}).polluted,
    undefined,
    'Object.prototype must not be polluted by minimist argument parsing'
  );
  
  // Cleanup
  delete Object.prototype.isAdmin;
  delete Object.prototype.polluted;
});

test('CVE/GHSA-phwq-j96m-2c2q: ejs rejects injected outputFunctionName', () => {
  // The advisory concerns an option interpolated into generated JavaScript,
  // not EJS executing JavaScript in a template supplied by the application.
  const ejs = require('ejs');
  assert.throws(
    () => ejs.compile('<p>safe</p>', { outputFunctionName: 'x;global.__ejsInjectionTest=true;x' }),
    /outputFunctionName is not a valid JS identifier/
  );
});
