'use strict';

// Security regression test — ATL-211
// Advisory: GHSA-fvqr-27wr-82fm (CVE-2018-16487) — Prototype Pollution in lodash
// Vulnerable: lodash 4.17.4 (installed). Fixed: lodash >= 4.17.11 (audit fix: 4.18.1).
//
// The advisory: lodash `merge` (and mergeWith/defaultsDeep) walks attacker keys
// without guarding `__proto__`, so a crafted source object writes through to
// Object.prototype, polluting EVERY object in the process. Fixed versions skip
// the `__proto__` key.
//
// Proof obligation (dependency boundary): merge a `__proto__` payload, then read
// the polluted property off a brand-new plain object. RED on 4.17.4 (the fresh
// object inherits the attacker value); GREEN on the patched version (untouched).

const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const _ = require('lodash');

afterEach(() => {
  // Never let pollution leak to other tests, regardless of RED/GREEN.
  delete Object.prototype.__atl211_polluted;
});

test('lodash.merge does not pollute Object.prototype via __proto__ (GHSA-fvqr-27wr-82fm)', () => {
  // JSON.parse so `__proto__` is a real own enumerable key, not the prototype setter.
  const payload = JSON.parse('{ "__proto__": { "__atl211_polluted": "yes" } }');

  _.merge({}, payload);

  const victim = {};
  assert.strictEqual(
    victim.__atl211_polluted,
    undefined,
    'lodash.merge wrote attacker data onto Object.prototype (prototype pollution)',
  );
});
