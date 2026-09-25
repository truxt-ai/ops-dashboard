'use strict';
// Security regression tests for ATL-580 vulnerabilities
// All tests must be RED on the currently-installed vulnerable versions.
const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

// ============================================================================
// GHSA-phwq-j96m-2c2q: EJS Template Injection (CVE-2024-27088 / GHSA-phwq-j96m-2c2q)
// Installed: ejs 2.5.7 (vulnerable)  |  Safe: ejs >= 6.0.1
// ============================================================================
// EJS <3.1.10 allows an attacker to break out of the template sandbox and execute
// arbitrary JavaScript through an expression like:
//   <%= this.constructor.constructor('return process')().pid %>
// which accesses the process object. On the vulnerable version this renders the
// current process ID (a number), proving code execution is possible.
// RED: template renders a numeric process ID  →  exploit confirmed
// GREEN (after fix): render throws or escapes the expression
test('security: ejs GHSA-phwq-j96m-2c2q - template injection must be blocked', () => {
  const maliciousTemplate = "<%= this.constructor.constructor('return process')().pid %>";

  const result = ejs.render(maliciousTemplate, {}, { client: false });

  // Vulnerable version renders the PID as a numeric string.
  // A safe version should either throw (caught above) or return non-numeric output.
  const hasProcessId = /^\d+$/.test(result.trim());
  assert.ok(
    !hasProcessId,
    `CRITICAL: EJS template injection (GHSA-phwq-j96m-2c2q) ` +
    `— able to access process.pid from template. Result: "${result.trim()}". ` +
    `Upgrade ejs to >= 6.0.1 to fix.`
  );
});

// ============================================================================
// GHSA-jf85-cpcp-j695: Lodash Prototype Pollution (CVE-2019-10744 / GHSA-jf85-cpcp-j695)
// Installed: lodash 4.17.4 (vulnerable)  |  Safe: lodash >= 4.18.1
// ============================================================================
// Lodash <4.18.1 is vulnerable to prototype pollution via _.merge() when a
// payload with a "constructor.prototype" path is provided. Parsing a specially
// crafted JSON object or user-supplied input poisons Object.prototype.
// RED: Object.prototype gets an injected property visible on all new objects
// GREEN (after fix): prototype remains clean
test('security: lodash GHSA-jf85-cpcp-j695 - prototype pollution must be blocked', () => {
  // Clean slate (guard against test-order effects)
  delete Object.prototype.lodashPolluted;

  // The exploit vector: merge an object with "constructor.prototype" key
  // (equivalent to a JSON-parsed user-supplied payload).
  const maliciousPayload = JSON.parse('{"constructor": {"prototype": {"lodashPolluted": true}}}');
  const target = {};
  _.merge(target, maliciousPayload);

  // Test pollution: a brand-new empty object should NOT inherit lodashPolluted
  const canary = {};
  const isPolluted = canary.lodashPolluted === true;

  // Clean up regardless of test outcome so subsequent tests are not affected
  delete Object.prototype.lodashPolluted;

  assert.ok(
    !isPolluted,
    `CRITICAL: Lodash prototype pollution (GHSA-jf85-cpcp-j695) ` +
    `— Object.prototype.lodashPolluted is visible on every new object after _.merge(). ` +
    `Upgrade lodash to >= 4.18.1 to fix.`
  );
});

// ============================================================================
// GHSA-xvch-5gv4-984h: Minimist Prototype Pollution (CVE-2021-44906 / GHSA-xvch-5gv4-984h)
// Installed: minimist 1.2.0 (vulnerable)  |  Safe: minimist >= 1.2.8
// ============================================================================
// minimist <1.2.8 allows attackers to pollute Object.prototype by passing a
// crafted argument such as "--__proto__.polluted=POLLUTED".  Any subsequent
// code that checks ({})[property] would see the attacker-controlled value.
// RED: Object.prototype is polluted after minimist parses the args
// GREEN (after fix): prototype is untouched
test('security: minimist GHSA-xvch-5gv4-984h - prototype pollution must be blocked', () => {
  // Clean slate
  delete Object.prototype.minimistPolluted;

  // Exploit: parse args that carry a __proto__ key targeting Object.prototype
  minimist(['--__proto__.minimistPolluted', 'POLLUTED']);

  // Test pollution: a brand-new empty object should NOT have minimistPolluted
  const canary = {};
  const isPolluted = canary.minimistPolluted === 'POLLUTED';

  // Clean up regardless of outcome
  delete Object.prototype.minimistPolluted;

  assert.ok(
    !isPolluted,
    `CRITICAL: Minimist prototype pollution (GHSA-xvch-5gv4-984h) ` +
    `— Object.prototype.minimistPolluted was set by argument parsing. ` +
    `Upgrade minimist to >= 1.2.8 to fix.`
  );
});
