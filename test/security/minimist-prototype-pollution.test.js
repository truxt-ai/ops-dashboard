'use strict';

// Security regression test — ATL-211
// Advisory: GHSA-vh95-rmgr-6w4m (CVE-2020-7598) — Prototype Pollution in minimist
// Vulnerable: minimist 1.2.0 (installed). Fixed: minimist >= 1.2.3 (audit fix: 1.2.8).
//
// The advisory: minimist sets nested keys from argv (e.g. `--a.b.c x`) without
// guarding `__proto__`, so `--__proto__.<key> <val>` writes through to
// Object.prototype, polluting every object in the process. Fixed versions refuse
// to assign through `__proto__`.
//
// Proof obligation (dependency boundary): parse the malicious argv, then read the
// polluted property off a brand-new plain object. RED on 1.2.0 (fresh object
// inherits the attacker value); GREEN on the patched version (untouched).

const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const parseArgs = require('minimist');

afterEach(() => {
  delete Object.prototype.__atl211_minimist_polluted;
});

test('minimist does not pollute Object.prototype via --__proto__ (GHSA-vh95-rmgr-6w4m)', () => {
  parseArgs(['--__proto__.__atl211_minimist_polluted', 'yes']);

  const victim = {};
  assert.strictEqual(
    victim.__atl211_minimist_polluted,
    undefined,
    'minimist wrote attacker data onto Object.prototype (prototype pollution)',
  );
});
