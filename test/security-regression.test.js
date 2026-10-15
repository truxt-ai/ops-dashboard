'use strict';

// Security regression tests for ATL-79 dependency remediation.
//
// Each test has TWO halves (per the security-regression-test skill):
//   (a) lockfile/version assertion  -> proves the installed version is patched
//   (b) behavioral exploit reproduction -> proves the advisory's exploit is dead
//
// RED on the pre-fix deps (ejs 2.5.7 / lodash 4.17.4 / minimist 1.2.0):
//   the exploit executes and/or the version floor is unmet.
// GREEN after the bump lands on hod/atl-79-impl: the exploit is inert and the
// version floor is satisfied. The test files are NEVER edited to pass.
//
// Version floors are the advisories' CANONICAL patched versions, not the audit
// table's literal "fix" column, so the test stays GREEN for ANY valid patched
// version the impl lands (e.g. lodash 4.17.21, the real GHSA fix, vs the audit's
// non-canonical 4.18.1).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Read a dependency's resolved version without depending on its `exports` map
// (ejs 6.x blocks require('ejs/package.json')). Walk up from the resolved entry
// point to the package's own package.json.
function resolvedVersion(name) {
  let dir = path.dirname(require.resolve(name));
  const root = path.parse(dir).root;
  while (dir !== root) {
    const pj = path.join(dir, 'package.json');
    if (fs.existsSync(pj)) {
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (j.name === name) return j.version;
    }
    dir = path.dirname(dir);
  }
  throw new Error('package.json not found for ' + name);
}

// Minimal semver >= compare on the x.y.z core (prerelease tag stripped).
function gte(actual, floor) {
  const a = actual.split('-')[0].split('.').map(Number);
  const b = floor.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// CVE 1 — ejs template injection (GHSA-phwq-j96m-2c2q)
// ejs <= 2.5.7 interpolates opts.localsName raw into the compiled function
// source AND its parameter list, with no identifier validation. A malicious
// localsName therefore runs arbitrary code at render time (server-side template
// injection). The 3.1.7+ / 6.x fix validates these options against a JS
// identifier regex and rejects the payload.
// ---------------------------------------------------------------------------
test('ejs: GHSA-phwq-j96m-2c2q — localsName template injection cannot execute code', () => {
  // (b) Exploit reproduction first — this is the RED proof on 2.5.7.
  const ejs = require('ejs');
  delete global.__EJS_PWNED__;
  try {
    // On 2.5.7 this sets global.__EJS_PWNED__ at render time (SSTI). On a fixed
    // ejs the malicious localsName is rejected and render throws instead.
    ejs.render('hello world', {}, { localsName: 'locals = global.__EJS_PWNED__ = true' });
  } catch (_) {
    // Fixed ejs throws on the invalid option — acceptable; the side effect below
    // is the real assertion.
  }
  const executed = global.__EJS_PWNED__ === true;
  delete global.__EJS_PWNED__;
  assert.strictEqual(executed, false, 'ejs executed injected code via localsName (SSTI reachable)');

  // (a) Lockfile/version assertion.
  assert.ok(
    gte(resolvedVersion('ejs'), '3.1.7'),
    'ejs must be >= 3.1.7 (option-validation fix); audit target is 6.0.1'
  );
});

// ---------------------------------------------------------------------------
// CVE 2 — lodash command injection (GHSA-35jh-r3h4-6jhm, CVE-2021-23337)
// lodash < 4.17.21 inserts options.sourceURL into the compiled template
// function without sanitizing newlines, so a sourceURL containing a newline
// breaks out of the `//# sourceURL=` comment and injects arbitrary statements
// that run when the template is invoked. The fix strips newlines from sourceURL.
// ---------------------------------------------------------------------------
test('lodash: GHSA-35jh-r3h4-6jhm — _.template sourceURL cannot inject code', () => {
  // (b) Exploit reproduction first — this is the RED proof on 4.17.4.
  const _ = require('lodash');
  delete global.__LODASH_PWNED__;
  try {
    // Newline breaks out of the sourceURL comment; on 4.17.4 the injected
    // statement runs when the compiled template is called.
    const compiled = _.template('x', { sourceURL: '\nglobal.__LODASH_PWNED__ = true;\n' });
    compiled();
  } catch (_) {
    // A throw is fine — the side effect below is what matters.
  }
  const executed = global.__LODASH_PWNED__ === true;
  delete global.__LODASH_PWNED__;
  assert.strictEqual(executed, false, 'lodash executed injected code via _.template sourceURL');

  // (a) Lockfile/version assertion.
  assert.ok(
    gte(resolvedVersion('lodash'), '4.17.21'),
    'lodash must be >= 4.17.21 (canonical GHSA-35jh-r3h4-6jhm fix)'
  );
});

// ---------------------------------------------------------------------------
// CVE 3 — minimist prototype pollution (GHSA-xvch-5gv4-984h, CVE-2021-44906)
// minimist < 1.2.6 lets `--__proto__.x value` walk into Object.prototype,
// polluting every object in the process. The fix blocks __proto__ keys.
// ---------------------------------------------------------------------------
test('minimist: GHSA-xvch-5gv4-984h — __proto__ args cannot pollute Object.prototype', () => {
  // (b) Exploit reproduction first — this is the RED proof on 1.2.0.
  const parse = require('minimist');
  delete Object.prototype.__MINIMIST_PWNED__;
  parse(['--__proto__.__MINIMIST_PWNED__', 'polluted']);
  const polluted = ({}).__MINIMIST_PWNED__;
  delete Object.prototype.__MINIMIST_PWNED__;
  assert.strictEqual(polluted, undefined, 'minimist polluted Object.prototype via --__proto__');

  // (a) Lockfile/version assertion.
  assert.ok(
    gte(resolvedVersion('minimist'), '1.2.6'),
    'minimist must be >= 1.2.6 (canonical fix); audit target is 1.2.8'
  );
});
