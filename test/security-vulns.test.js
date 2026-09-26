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
  const argv = minimist(['--__proto__.isAdmin=true', '--__proto__.polluted=yes']);
  
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

test('CVE/GHSA-phwq-j96m-2c2q: ejs 2.5.7 template injection via untrusted template rendering', () => {
  // Reproduce GHSA-phwq-j96m-2c2q: ejs <=3.1.9 allows arbitrary code execution
  // when rendering untrusted templates (user input passed as template source).
  // The vulnerability occurs when a user-provided string is treated as a template.
  
  const ejs = require('ejs');
  
  // Mark that code execution occurred
  global.__ejsInjectionTest = false;
  
  // Exploit: untrusted user input passed as template
  // In vulnerable ejs, template code (<%- ... %>) is executed without sandboxing
  const userSuppliedTemplate = '<%- (function(){ global.__ejsInjectionTest = true; return "pwned" })() %>';
  
  // Vulnerable ejs 2.5.7 will execute the JS in template tags
  // Patched ejs will either sandbox it or reject the dangerous code
  const result = ejs.render(userSuppliedTemplate);
  
  // After the fix, the template code should NOT execute arbitrary JS
  // (On vulnerable ejs, global.__ejsInjectionTest will be true)
  assert.strictEqual(
    global.__ejsInjectionTest,
    false,
    'ejs must not execute arbitrary code from untrusted template input'
  );
  
  // Cleanup
  delete global.__ejsInjectionTest;
});
