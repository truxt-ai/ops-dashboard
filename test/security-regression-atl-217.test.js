'use strict';

/**
 * Security regression tests for ATL-217 dependency vulnerabilities.
 *
 * RED on pre-fix (vulnerable) deps, GREEN after bumps.
 *
 * Covered:
 *   GHSA-jf85-cpcp-j695 — Prototype Pollution in lodash < 4.18.1
 *   GHSA-xvch-5gv4-984h — Prototype Pollution in minimist < 1.2.8
 *   GHSA-phwq-j96m-2c2q — Template injection in ejs < 3.1.7 (version assertion only — see note)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// GHSA-jf85-cpcp-j695 — Prototype Pollution in lodash
// lodash 4.17.4 allows __proto__ as a path in _.set(), polluting Object.prototype.
// Fixed in lodash >= 4.18.1 (rejects __proto__ as a path segment).
// ---------------------------------------------------------------------------
describe('GHSA-jf85-cpcp-j695 — lodash prototype pollution', () => {
  it('lodash version must be >= 4.18.1 (patched)', () => {
    const pkg = require('lodash/package.json');
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    const isPatched = major > 4 || (major === 4 && (minor > 18 || (minor === 18 && patch >= 1)));
    assert.ok(isPatched, `lodash ${pkg.version} is still vulnerable (need >= 4.18.1)`);
  });

  it('_.set() with __proto__ path must NOT pollute Object.prototype', () => {
    const _ = require('lodash');
    // Reset any pre-existing pollution before the test
    delete Object.prototype.polluted;

    const baseline = {};
    // On lodash 4.17.4 this line pollutes Object.prototype; on 4.18.1+ it is a no-op.
    _.set({}, '__proto__.polluted', 'EXPLOITED');

    assert.strictEqual(
      baseline.polluted,
      undefined,
      'Object.prototype was polluted — lodash is still vulnerable (GHSA-jf85-cpcp-j695)'
    );
  });
});

// ---------------------------------------------------------------------------
// GHSA-xvch-5gv4-984h — Prototype Pollution in minimist
// minimist 1.2.0 treats --__proto__.key=val as a prototype-chain write.
// Fixed in minimist >= 1.2.8 (strips __proto__ keys).
// ---------------------------------------------------------------------------
describe('GHSA-xvch-5gv4-984h — minimist prototype pollution', () => {
  it('minimist version must be >= 1.2.8 (patched)', () => {
    const pkg = require('minimist/package.json');
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    const isPatched = major > 1 || (major === 1 && (minor > 2 || (minor === 2 && patch >= 8)));
    assert.ok(isPatched, `minimist ${pkg.version} is still vulnerable (need >= 1.2.8)`);
  });

  it('minimist --__proto__ args must NOT pollute Object.prototype', () => {
    const minimist = require('minimist');
    delete Object.prototype.minimistPolluted;

    const baseline = {};
    // On minimist 1.2.0 this writes to Object.prototype; on 1.2.8+ the key is dropped.
    minimist(['--__proto__.minimistPolluted', 'EXPLOITED']);

    assert.strictEqual(
      baseline.minimistPolluted,
      undefined,
      'Object.prototype was polluted — minimist is still vulnerable (GHSA-xvch-5gv4-984h)'
    );
  });
});

// ---------------------------------------------------------------------------
// GHSA-phwq-j96m-2c2q — Template injection in ejs
// The outputFunctionName option (ejs 3.x) allows code injection when user-supplied
// data is spread into render options. ejs 2.5.7 does not expose that option, so
// direct exploit reproduction at the dependency API is not feasible here.
// Closure proof is therefore a SMOKE-LEVEL version assertion only.
// Flag: a human should verify the ejs major-version upgrade does not break templates.
// ---------------------------------------------------------------------------
describe('GHSA-phwq-j96m-2c2q — ejs template injection (smoke-level version assert)', () => {
  it('ejs version must be >= 3.1.7 (patched) — SMOKE-LEVEL PROOF', () => {
    const pkg = require('ejs/package.json');
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    // The advisory covers ejs < 3.1.7 (outputFunctionName injection, CVE-2022-29078).
    // Current installed is 2.5.7 which pre-dates the vulnerable 3.x feature but the
    // recommended fix (6.0.1 per audit, resolves as >= 3.1.7) must be confirmed.
    const isPatched = major > 3 || (major === 3 && (minor > 1 || (minor === 1 && patch >= 7)));
    assert.ok(
      isPatched,
      `ejs ${pkg.version} is still vulnerable to GHSA-phwq-j96m-2c2q (need >= 3.1.7). ` +
      'NOTE: direct outputFunctionName exploit not reproduced here (feature absent in 2.x); ' +
      'this is a smoke-level proof — human review of ejs major upgrade required.'
    );
  });
});
