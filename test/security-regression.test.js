/**
 * Security regression tests for ATL-200 (dependency vulnerability remediation).
 *
 * Each test MUST be RED (fail) on the pre-fix dependency version and GREEN
 * (pass) after the fix. Tests exercise the vulnerable API directly at the
 * dependency boundary per the security-regression-test skill.
 *
 * Covered advisories:
 *   - GHSA-phwq-j96m-2c2q  ejs ≤ 2.5.7   template injection → RCE
 *   - GHSA-fvqr-27wr-82fm  lodash ≤ 4.17.4  prototype pollution via merge/set
 *   - GHSA-vh95-rmgr-6w4m  minimist ≤ 1.2.0  prototype pollution via CLI args
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// 1. ejs — template injection (GHSA-phwq-j96m-2c2q)
//    Vulnerable: ejs < 6.0.1 allows arbitrary code execution via
//    the `outputFunctionName` render option.
//    Safe:       ejs ≥ 6.0.1 rejects / sanitises the option.
// ---------------------------------------------------------------------------
describe('ejs GHSA-phwq-j96m-2c2q — template injection', () => {
  const ejs = require('ejs');

  it('version is ≥ 6.0.1 (patched)', () => {
    const installedVersion = require('../node_modules/ejs/package.json').version;
    const [major] = installedVersion.split('.').map(Number);
    assert.ok(
      major >= 6,
      `ejs ${installedVersion} is below 6.0.1 — template injection (GHSA-phwq-j96m-2c2q) is unpatched`,
    );
  });

  it('outputFunctionName injection does not execute arbitrary code', () => {
    // On ejs < 6 this payload causes execSync to run during render.
    const marker = `/tmp/ejs-rce-proof-${Date.now()}`;
    const maliciousOpt =
      `x; require('child_process').execSync('touch ${marker}'); var __output`;

    let threw = false;
    try {
      ejs.render('', { outputFunctionName: maliciousOpt });
    } catch (_) {
      threw = true;
    }

    const fs = require('fs');
    assert.ok(
      !fs.existsSync(marker),
      `ejs executed the injected command — RCE exploit still active (GHSA-phwq-j96m-2c2q). ejs version: ${require('../node_modules/ejs/package.json').version}`,
    );
    // Either threw (fixed) or rendered without executing — both are GREEN.
    // The marker file NOT existing is the real guard.
  });
});

// ---------------------------------------------------------------------------
// 2. lodash — prototype pollution via merge (GHSA-fvqr-27wr-82fm)
//    Vulnerable: lodash < 4.18.1 _.merge({}, {"__proto__": {"x": 1}}) pollutes
//    Safe:       lodash ≥ 4.18.1 ignores __proto__ key.
// ---------------------------------------------------------------------------
describe('lodash GHSA-fvqr-27wr-82fm — prototype pollution via merge', () => {
  const _ = require('lodash');

  it('version is ≥ 4.18.1 (patched)', () => {
    const [major, minor, patch] = _.VERSION.split('.').map(Number);
    const ok = major > 4 || (major === 4 && minor > 18) || (major === 4 && minor === 18 && patch >= 1);
    assert.ok(
      ok,
      `lodash ${_.VERSION} is below 4.18.1 — prototype pollution (GHSA-fvqr-27wr-82fm) is unpatched`,
    );
  });

  it('_.merge does not pollute Object.prototype via __proto__', () => {
    // Clean sentinel before test
    delete Object.prototype._atl200_polluted;

    const payload = JSON.parse('{"__proto__": {"_atl200_polluted": true}}');
    _.merge({}, payload);

    assert.strictEqual(
      ({})._atl200_polluted,
      undefined,
      `_.merge polluted Object.prototype — exploit active (GHSA-fvqr-27wr-82fm). lodash version: ${_.VERSION}`,
    );

    // Cleanup regardless of outcome
    delete Object.prototype._atl200_polluted;
  });

  it('_.set does not pollute Object.prototype via __proto__ path', () => {
    delete Object.prototype._atl200_set_polluted;

    _.set({}, '__proto__._atl200_set_polluted', true);

    assert.strictEqual(
      ({})._atl200_set_polluted,
      undefined,
      `_.set polluted Object.prototype — exploit active (GHSA-fvqr-27wr-82fm). lodash version: ${_.VERSION}`,
    );

    delete Object.prototype._atl200_set_polluted;
  });
});

// ---------------------------------------------------------------------------
// 3. minimist — prototype pollution (GHSA-vh95-rmgr-6w4m)
//    Vulnerable: minimist < 1.2.8 parsing --__proto__.foo=bar pollutes
//    Safe:       minimist ≥ 1.2.8 ignores __proto__ keys.
// ---------------------------------------------------------------------------
describe('minimist GHSA-vh95-rmgr-6w4m — prototype pollution via CLI args', () => {
  const minimist = require('minimist');

  it('version is ≥ 1.2.8 (patched)', () => {
    const installedVersion = require('../node_modules/minimist/package.json').version;
    const [major, minor, patch] = installedVersion.split('.').map(Number);
    const ok = major > 1 || (major === 1 && minor > 2) || (major === 1 && minor === 2 && patch >= 8);
    assert.ok(
      ok,
      `minimist ${installedVersion} is below 1.2.8 — prototype pollution (GHSA-vh95-rmgr-6w4m) is unpatched`,
    );
  });

  it('minimist does not pollute Object.prototype via --__proto__ argument', () => {
    delete Object.prototype._atl200_min_polluted;

    minimist(['--__proto__._atl200_min_polluted', 'true']);

    assert.strictEqual(
      ({})._atl200_min_polluted,
      undefined,
      `minimist polluted Object.prototype — exploit active (GHSA-vh95-rmgr-6w4m). Check installed minimist version.`,
    );

    delete Object.prototype._atl200_min_polluted;
  });

  it('minimist does not pollute via --constructor.prototype argument', () => {
    delete Object.prototype._atl200_ctor_polluted;

    minimist(['--constructor.prototype._atl200_ctor_polluted', 'true']);

    assert.strictEqual(
      ({})._atl200_ctor_polluted,
      undefined,
      `minimist polluted via constructor.prototype — exploit active (GHSA-vh95-rmgr-6w4m).`,
    );

    delete Object.prototype._atl200_ctor_polluted;
  });
});
