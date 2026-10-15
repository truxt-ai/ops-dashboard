'use strict';

/**
 * Security regression tests for ATL-199 — three critical dependency vulns.
 *
 * RED on current vulnerable packages; GREEN after version bumps:
 *   ejs      2.5.7  → ≥ 6.0.1   (GHSA-phwq-j96m-2c2q)
 *   lodash   4.17.4 → ≥ 4.18.1  (GHSA-jf85-cpcp-j695)
 *   minimist 1.2.0  → ≥ 1.2.8   (GHSA-xvch-5gv4-984h)
 *
 * Each describe block has two parts:
 *   1. Version boundary — assert installed version ≥ safe minimum.
 *   2. Exploit boundary — reproduce the actual attack surface.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// 1. ejs ≤ 2.5.7 — template injection (GHSA-phwq-j96m-2c2q)
// ---------------------------------------------------------------------------
describe('ejs — GHSA-phwq-j96m-2c2q template injection', () => {
  const ejsPkg = require('ejs/package.json');
  const ejs = require('ejs');

  // Boundary 1: version assertion.
  // Fails RED on 2.5.7 because 2.5.7 < 6.0.1.
  // Passes GREEN after upgrade to ≥ 6.0.1.
  it('installed ejs version must be ≥ 6.0.1 (safe boundary)', () => {
    const [major, minor, patch] = ejsPkg.version.split('.').map(Number);
    const safeEnough = major > 6
      || (major === 6 && minor > 0)
      || (major === 6 && minor === 0 && patch >= 1);
    assert.ok(
      safeEnough,
      `ejs ${ejsPkg.version} is below the safe version 6.0.1 — ` +
      'upgrade to resolve GHSA-phwq-j96m-2c2q'
    );
  });

  // Exploit boundary: malicious `outputFunctionName` must be rejected.
  //
  // In ejs 2.5.7, the `outputFunctionName` option is unknown and silently
  // ignored; render() succeeds without throwing (no validation).
  // In the fixed ≥ 6.0.1, ejs validates options and throws RangeError on
  // untrusted outputFunctionName, preventing code injection via this vector.
  //
  // Assertion: render() with a malicious outputFunctionName MUST throw.
  // Fails RED on 2.5.7 (render succeeds, no throw).
  // Passes GREEN on ≥ 6.0.1 (ejs rejects the dangerous option).
  it('render() with malicious outputFunctionName must throw (GHSA-phwq-j96m-2c2q exploit path)', () => {
    const maliciousOutputFunctionName =
      'x; process.mainModule.require("child_process").execSync("id"); x';

    assert.throws(
      () => ejs.render('<p>hello</p>', {}, { outputFunctionName: maliciousOutputFunctionName }),
      /range|invalid|unsafe|sanitize/i,
      'ejs must reject an untrusted outputFunctionName — ' +
      'silent acceptance is the vulnerability (GHSA-phwq-j96m-2c2q)'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. lodash ≤ 4.17.4 — prototype pollution (GHSA-jf85-cpcp-j695)
// ---------------------------------------------------------------------------
describe('lodash — GHSA-jf85-cpcp-j695 prototype pollution via _.merge', () => {
  const lodashPkg = require('lodash/package.json');
  const _ = require('lodash');

  after(() => {
    // Clean up any pollution this describe block may have left on Object.prototype.
    delete Object.prototype.polluted;
  });

  // Boundary 1: version assertion.
  // Fails RED on 4.17.4 because 4.17.4 < 4.18.1.
  // Passes GREEN after upgrade to ≥ 4.18.1.
  it('installed lodash version must be ≥ 4.18.1 (safe boundary)', () => {
    const [major, minor, patch] = lodashPkg.version.split('.').map(Number);
    const safeEnough = major > 4
      || (major === 4 && minor > 18)
      || (major === 4 && minor === 18 && patch >= 1);
    assert.ok(
      safeEnough,
      `lodash ${lodashPkg.version} is below the safe version 4.18.1 — ` +
      'upgrade to resolve GHSA-jf85-cpcp-j695'
    );
  });

  // Exploit boundary: merge with __proto__ payload must NOT pollute Object.prototype.
  //
  // In lodash 4.17.4, _.merge() walks __proto__ keys and writes them directly
  // onto Object.prototype, so every subsequent plain object inherits the
  // injected property.
  // In lodash ≥ 4.18.1 the __proto__ key is filtered out.
  //
  // Assertion: ({}).polluted must remain undefined after the merge.
  // Fails RED on 4.17.4 (pollution succeeds, ({}).polluted === true).
  // Passes GREEN on ≥ 4.18.1 (pollution is blocked).
  it('_.merge with __proto__ payload must NOT pollute Object.prototype (GHSA-jf85-cpcp-j695 exploit path)', () => {
    const protoPayload = JSON.parse('{"__proto__":{"polluted":true}}');
    _.merge({}, protoPayload);

    assert.strictEqual(
      ({}).polluted,
      undefined,
      'Object.prototype was polluted via _.merge — lodash is vulnerable (GHSA-jf85-cpcp-j695)'
    );

    // Defensive cleanup so subsequent tests start clean.
    delete Object.prototype.polluted;
  });
});

// ---------------------------------------------------------------------------
// 3. minimist ≤ 1.2.0 — prototype pollution (GHSA-xvch-5gv4-984h)
// ---------------------------------------------------------------------------
describe('minimist — GHSA-xvch-5gv4-984h prototype pollution via __proto__ flag', () => {
  const minimistPkg = require('minimist/package.json');
  const minimist = require('minimist');

  after(() => {
    // Clean up any pollution this describe block may have left on Object.prototype.
    delete Object.prototype.polluted;
  });

  // Boundary 1: version assertion.
  // Fails RED on 1.2.0 because 1.2.0 < 1.2.8.
  // Passes GREEN after upgrade to ≥ 1.2.8.
  it('installed minimist version must be ≥ 1.2.8 (safe boundary)', () => {
    const [major, minor, patch] = minimistPkg.version.split('.').map(Number);
    const safeEnough = major > 1
      || (major === 1 && minor > 2)
      || (major === 1 && minor === 2 && patch >= 8);
    assert.ok(
      safeEnough,
      `minimist ${minimistPkg.version} is below the safe version 1.2.8 — ` +
      'upgrade to resolve GHSA-xvch-5gv4-984h'
    );
  });

  // Exploit boundary: --__proto__.polluted=true must NOT pollute Object.prototype.
  //
  // In minimist ≤ 1.2.5, parsing --__proto__.key=value walks __proto__ and
  // writes the value onto Object.prototype, poisoning every subsequent plain
  // object in the process.
  // In minimist ≥ 1.2.6 (fully fixed by 1.2.8) the __proto__ key is blocked.
  //
  // Assertion: ({}).polluted must remain undefined after parsing.
  // Fails RED on 1.2.0 (pollution succeeds, ({}).polluted === 'true').
  // Passes GREEN on ≥ 1.2.8 (pollution is blocked).
  it('minimist must NOT pollute Object.prototype via --__proto__.polluted flag (GHSA-xvch-5gv4-984h exploit path)', () => {
    minimist(['--__proto__.polluted', 'true']);

    assert.strictEqual(
      ({}).polluted,
      undefined,
      'Object.prototype was polluted via minimist argument parsing — ' +
      'minimist is vulnerable (GHSA-xvch-5gv4-984h)'
    );

    // Defensive cleanup so subsequent tests start clean.
    delete Object.prototype.polluted;
  });
});
