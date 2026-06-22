'use strict';

// Security regression tests for ATL-193 vulnerability remediation.
// Each test MUST be RED (failing assertion) on the vulnerable installed versions
// and GREEN (passing) after the dependency upgrades in hod/atl-193-impl.
//
// Covered advisories:
//   GHSA-r5fr-rjxr-66jc  lodash < 4.18.1   Code Injection via _.template variable option
//   GHSA-phwq-j96m-2c2q  ejs < 3.1.7       Template injection via unsanitized localsName option
//   GHSA-vh95-rmgr-6w4m  minimist < 1.2.8  Prototype Pollution via --__proto__

const { test } = require('node:test');
const assert = require('node:assert');

// GHSA-r5fr-rjxr-66jc — Code Injection in lodash _.template < 4.18.1
// Attack: the `variable` option is inserted verbatim as the parameter list of the
// compiled function — `new Function(variable + ', ...)`. A crafted value that injects
// a default-parameter expression executes the expression when the template fn is called
// without a second argument.
// Payload: "a, b=(global[marker]=true, {})" → function(a, b=(global[marker]=true, {})){}
//   b's default is evaluated on call because no second arg is supplied.
// RED on 4.17.4: the default parameter fires; marker becomes true; assertion fails.
// GREEN on 4.18.1+: variable is validated as a plain identifier; _.template throws (caught).
test('lodash >=4.18.1: _.template does not allow code injection via variable option (GHSA-r5fr-rjxr-66jc)', () => {
  const _ = require('lodash');
  const marker = '__atl193_lodash_template_inject';
  global[marker] = false;
  try {
    const payload = "a, b=(global['" + marker + "']=true, {})";
    const compiled = _.template('hello', { variable: payload });
    compiled({});
  } catch (_e) {
    // Fixed lodash throws: variable must be a valid JS identifier.
  }
  try {
    assert.strictEqual(
      global[marker],
      false,
      'lodash _.template executed injected code via variable option — ' +
        'upgrade lodash to >=4.18.1 (GHSA-r5fr-rjxr-66jc); ' +
        'installed: ' + require('lodash/package.json').version
    );
  } finally {
    delete global[marker];
  }
});

// GHSA-phwq-j96m-2c2q — EJS template injection via localsName option, ejs < 3.1.7
// Attack: `localsName` is interpolated unsanitized into the compiled function parameter
// list and the `with` statement. A crafted value injects a default-parameter expression
// that executes on render (no second arg is passed to the compiled fn).
// Payload: "data, b=(global[marker]=true, {})"
// RED on 2.5.7: the default parameter fires; marker becomes true; assertion fails.
// GREEN on 3.1.7+: localsName is validated as a plain identifier; ejs throws (caught).
test('ejs >=3.1.7: localsName option does not allow code injection via default parameter (GHSA-phwq-j96m-2c2q)', () => {
  const ejs = require('ejs');
  const marker = '__atl193_ejs_localsname_inject';
  global[marker] = false;
  try {
    ejs.render('hello', {}, {
      localsName: "data, b=(global['" + marker + "']=true, {})",
    });
  } catch (_e) {
    // Fixed ejs throws: localsName must be a valid JS identifier.
  }
  try {
    assert.strictEqual(
      global[marker],
      false,
      'ejs executed injected code via localsName — ' +
        'upgrade ejs to >=3.1.7 (GHSA-phwq-j96m-2c2q); ' +
        'installed: ' + require('ejs/package.json').version
    );
  } finally {
    delete global[marker];
  }
});

// GHSA-vh95-rmgr-6w4m — Prototype Pollution in minimist < 1.2.8
// Attack: --__proto__.prop=value assigns directly to Object.prototype.
// RED on 1.2.0: --__proto__.<sentinel> sets Object.prototype[sentinel]; assertion fails.
// GREEN on 1.2.8+: __proto__ key is blocked; Object.prototype is untouched.
test('minimist >=1.2.8: --__proto__ flag does not pollute Object.prototype (GHSA-vh95-rmgr-6w4m)', () => {
  const minimist = require('minimist');
  const sentinel = '__atl193_minimist_proto_vuln';
  try {
    minimist(['--__proto__.' + sentinel, 'pwned']);
    assert.strictEqual(
      Object.prototype[sentinel],
      undefined,
      'minimist wrote to Object.prototype via --__proto__ — ' +
        'upgrade minimist to >=1.2.8 (GHSA-vh95-rmgr-6w4m); ' +
        'installed: ' + require('minimist/package.json').version
    );
  } finally {
    delete Object.prototype[sentinel];
  }
});
