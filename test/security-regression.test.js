'use strict';

// Security regression tests for ATL-126 (parent dependency audit).
//
// Each test reproduces the EXACT unsafe behavior the advisory describes at the
// dependency boundary, then asserts the SAFE post-fix behavior. They are RED on
// the currently-pinned vulnerable versions (exploit reproduced) and GREEN once
// the dependency is bumped to the patched version. A version pin alone is not
// closure proof, so every test exercises the vulnerable code path directly.
//
// Vulnerable pins under test (package.json): ejs 2.5.7, lodash 4.17.4,
// minimist 1.2.0. Patched targets: ejs >= 6.0.1, lodash >= 4.17.12,
// minimist >= 1.2.6.

const { test } = require('node:test');
const assert = require('node:assert');

const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

// ---------------------------------------------------------------------------
// 1. ejs template injection — GHSA-phwq-j96m-2c2q (CVE-2022-29078)
//
// ejs interpolates the `localsName` option straight into the compiled function
// source with no identifier validation. With `_with:false` the option lands in
// the generated parameter list, where a destructuring default value executes at
// render time => arbitrary code execution from an attacker-controlled option.
// The fix (ejs >= 3.1.7, target 6.0.1) validates option names against
// /^[a-zA-Z_$][0-9a-zA-Z_$]*$/ and throws "localsName is not a valid JS
// identifier" before any code is generated.
// ---------------------------------------------------------------------------
test('ejs: attacker-controlled localsName cannot execute injected code [GHSA-phwq-j96m-2c2q]', () => {
  const FLAG = '__atl126_ejs_rce__';
  // Payload: a destructuring-default param whose default value runs code.
  // No `require` is used (new Function has no module scope) — we touch a global
  // so the side effect is observable and needs no filesystem.
  const payload = '{ x = (globalThis.' + FLAG + ' = true) }';

  delete globalThis[FLAG];
  try {
    try {
      ejs.render('dashboard', {}, { localsName: payload, _with: false });
    } catch (e) {
      // Patched ejs rejects the option before compiling. That is the safe path.
    }
    assert.strictEqual(
      globalThis[FLAG],
      undefined,
      'ejs executed code injected via the localsName option (template injection reproduced)'
    );
  } finally {
    delete globalThis[FLAG];
  }
});

// ---------------------------------------------------------------------------
// 2. lodash prototype pollution — GHSA-fvqr-27wr-82fm (CVE-2019-10744)
//
// `_.defaultsDeep` walks a `constructor.prototype` path in the source object and
// writes onto Object.prototype, polluting every object in the process. Fixed in
// lodash >= 4.17.12 (audit target 4.18.1), which blocks the __proto__/constructor
// path. We assert a freshly-created object did NOT inherit the injected key.
// ---------------------------------------------------------------------------
test('lodash: defaultsDeep must not pollute Object.prototype [GHSA-fvqr-27wr-82fm]', () => {
  const KEY = '__atl126_lodash_pp__';
  const malicious = JSON.parse('{"constructor":{"prototype":{"' + KEY + '":"polluted"}}}');

  delete Object.prototype[KEY];
  try {
    _.defaultsDeep({}, malicious);
    assert.strictEqual(
      {}[KEY],
      undefined,
      'lodash defaultsDeep polluted Object.prototype (prototype pollution reproduced)'
    );
  } finally {
    delete Object.prototype[KEY];
  }
});

// ---------------------------------------------------------------------------
// 3. minimist prototype pollution — GHSA-vh95-rmgr-6w4m (CVE-2021-44906)
//
// minimist resolves dotted arg names like `--__proto__.x` by walking into
// Object.prototype and assigning there, polluting every object. Fixed in
// minimist >= 1.2.6 (audit target 1.2.8), which guards __proto__/constructor.
// We assert a freshly-created object did NOT inherit the injected key.
// ---------------------------------------------------------------------------
test('minimist: dotted __proto__ arg must not pollute Object.prototype [GHSA-vh95-rmgr-6w4m]', () => {
  const KEY = '__atl126_minimist_pp__';

  delete Object.prototype[KEY];
  try {
    minimist(['--__proto__.' + KEY, 'polluted']);
    assert.strictEqual(
      {}[KEY],
      undefined,
      'minimist polluted Object.prototype via a dotted __proto__ argument (prototype pollution reproduced)'
    );
  } finally {
    delete Object.prototype[KEY];
  }
});
