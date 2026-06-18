'use strict';

// Security regression tests for ATL-186 vulnerability remediation.
// Each test MUST be RED (failing assertion) on the vulnerable installed versions
// and GREEN (passing) after the dependency upgrades in hod/atl-186-impl.
//
// Covered advisories:
//   GHSA-jf85-cpcp-j695  lodash < 4.17.21  Prototype Pollution via _.merge
//   GHSA-xvch-5gv4-984h  minimist < 1.2.6  Prototype Pollution via --__proto__
//   GHSA-phwq-j96m-2c2q  ejs < 3.1.7       Template injection via unsanitized localsName option

const { test } = require('node:test');
const assert = require('node:assert');

// GHSA-jf85-cpcp-j695 — Prototype Pollution in lodash < 4.17.21
// Attack: crafted __proto__ key in object passed to _.merge pollutes Object.prototype.
// RED on 4.17.4: _.merge writes to Object.prototype and the assertion fails.
// GREEN on 4.17.21+: _.merge ignores __proto__ keys; Object.prototype is untouched.
test('lodash >=4.17.21: _.merge does not pollute Object.prototype via __proto__ key (GHSA-jf85-cpcp-j695)', () => {
  const _ = require('lodash');
  const sentinel = '__atl186_lodash_proto_vuln';
  const payload = JSON.parse('{"__proto__": {"' + sentinel + '": true}}');
  try {
    _.merge({}, payload);
    assert.strictEqual(
      Object.prototype[sentinel],
      undefined,
      'lodash.merge wrote to Object.prototype — upgrade lodash to >=4.17.21 (GHSA-jf85-cpcp-j695); ' +
        'installed: ' + require('lodash/package.json').version
    );
  } finally {
    delete Object.prototype[sentinel];
  }
});

// GHSA-xvch-5gv4-984h — Prototype Pollution in minimist < 1.2.6
// Attack: --__proto__.prop arg causes minimist to assign to Object.prototype.
// RED on 1.2.0: --__proto__.<sentinel> sets Object.prototype[sentinel]; assertion fails.
// GREEN on 1.2.6+: __proto__ key is blocked; Object.prototype is untouched.
test('minimist >=1.2.6: --__proto__ flag does not pollute Object.prototype (GHSA-xvch-5gv4-984h)', () => {
  const minimist = require('minimist');
  const sentinel = '__atl186_minimist_proto_vuln';
  try {
    minimist(['--__proto__.' + sentinel, 'pwned']);
    assert.strictEqual(
      Object.prototype[sentinel],
      undefined,
      'minimist wrote to Object.prototype via --__proto__ — upgrade minimist to >=1.2.6 (GHSA-xvch-5gv4-984h); ' +
        'installed: ' + require('minimist/package.json').version
    );
  } finally {
    delete Object.prototype[sentinel];
  }
});

// GHSA-phwq-j96m-2c2q — EJS template injection, ejs < 3.1.7
// Attack: the localsName option is interpolated unsanitized into both the function
// parameter list (new Function(localsName + ', escapeFn, ...', body)) and the
// template body ('with (' + localsName + ' || {})').
// A crafted localsName injects a default-parameter expression that executes on call.
// RED on 2.5.7: the marker is set to true; assertion fails.
// GREEN on 3.1.7+: localsName is validated as a plain identifier; ejs throws (caught).
test('ejs >=3.1.7: localsName option does not allow code injection via default parameter (GHSA-phwq-j96m-2c2q)', () => {
  const ejs = require('ejs');
  const marker = '__atl186_ejs_inject_vuln';
  global[marker] = false;
  try {
    // The first arg (data) is provided; the second default param runs because no
    // second argument is passed to the compiled fn, executing the marker assignment.
    ejs.render('hello', {}, {
      localsName: "data, b=(global['" + marker + "']=true,{})",
    });
  } catch (_e) {
    // Fixed ejs throws: localsName must be a valid JS identifier.
  }
  try {
    assert.strictEqual(
      global[marker],
      false,
      'ejs executed injected code via localsName — upgrade ejs to >=3.1.7 (GHSA-phwq-j96m-2c2q); ' +
        'installed: ' + require('ejs/package.json').version
    );
  } finally {
    delete global[marker];
  }
});
