'use strict';

// Security regression tests for ATL-226 dependency vulnerabilities.
// Each test must be RED (fail) on the vulnerable dependency version and
// GREEN (pass) after the fix is applied. Do NOT edit these tests to make
// them pass; fix the dependencies in package.json instead.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// 1. lodash — Prototype Pollution (GHSA-jf85-cpcp-j695 / CVE-2019-10744)
//    Vulnerable: lodash < 4.17.12  Installed: 4.17.4  Fix: 4.18.1
//    Attack: _.merge copies __proto__ key onto Object.prototype, polluting
//    all plain objects created after the merge.
// ---------------------------------------------------------------------------

test('lodash _.merge must not pollute Object.prototype via __proto__ key (GHSA-jf85-cpcp-j695)', () => {
  const _ = require('lodash');
  const MARKER = 'lodashPolluted_atl226';

  // Baseline: property must not exist on a fresh object before the test.
  assert.equal(Object.prototype[MARKER], undefined, 'baseline: Object.prototype must be clean before test');

  try {
    // Attacker-controlled payload delivered as JSON (mirrors real attack: body-parser → _.merge).
    _.merge({}, JSON.parse(`{"__proto__": {"${MARKER}": "EXPLOITED"}}`));

    // On vulnerable lodash (<4.17.12) this silently sets Object.prototype[MARKER] = 'EXPLOITED'.
    // RED on 4.17.4: assertion fails because ({}) now has the injected property.
    // GREEN on 4.18.1+: _.merge rejects __proto__ mutation, assertion passes.
    assert.equal(
      ({} )[MARKER],
      undefined,
      `lodash _.merge must not set Object.prototype["${MARKER}"] — prototype pollution exploitable`
    );
  } finally {
    // Always clean up to avoid cross-test contamination, even on failure.
    delete Object.prototype[MARKER];
  }
});

// ---------------------------------------------------------------------------
// 2. minimist — Prototype Pollution (GHSA-xvch-5gv4-984h / CVE-2021-44906)
//    Vulnerable: minimist < 1.2.6  Installed: 1.2.0  Fix: 1.2.8
//    Attack: --__proto__.key value args pollute Object.prototype.
// ---------------------------------------------------------------------------

test('minimist must not pollute Object.prototype via --__proto__ argument (GHSA-xvch-5gv4-984h)', () => {
  const parseArgs = require('minimist');
  const MARKER = 'minimistPolluted_atl226';

  assert.equal(Object.prototype[MARKER], undefined, 'baseline: Object.prototype must be clean before test');

  try {
    // Attacker-controlled CLI args (or query string parsed as argv).
    parseArgs([`--__proto__.${MARKER}`, 'EXPLOITED']);

    // RED on minimist 1.2.0: prototype walk sets Object.prototype[MARKER] = 'EXPLOITED'.
    // GREEN on 1.2.8+: __proto__ key is blocked, Object.prototype stays clean.
    assert.equal(
      ({} )[MARKER],
      undefined,
      `minimist must not set Object.prototype["${MARKER}"] via --__proto__ flag — prototype pollution exploitable`
    );
  } finally {
    delete Object.prototype[MARKER];
  }
});

// ---------------------------------------------------------------------------
// 3. ejs — Template Injection (GHSA-phwq-j96m-2c2q)
//    Vulnerable: ejs 2.x (unmaintained) and ejs < 3.1.10
//    Fix: upgrade to ejs ≥ 3.1.10 (semver-major from 2.x)
//
//    Note: the outputFunctionName injection vector exists in ejs 3.x; ejs 2.x
//    does not expose that option but is covered by the same advisory as an
//    unmaintained release. This test is therefore a version-boundary
//    (smoke-level) proof: it asserts the installed ejs is ≥ 3.1.10.
//    Label: smoke-level — see completion comment for explicit callout.
// ---------------------------------------------------------------------------

test('ejs must be on a maintained version not covered by GHSA-phwq-j96m-2c2q (≥ 3.1.10)', () => {
  const ejsPkg = require('ejs/package.json');
  const [major, minor, patch] = ejsPkg.version.split('.').map(Number);

  // RED on ejs 2.5.7: major < 3 → fails.
  // GREEN on ejs ≥ 3.1.10: passes.
  const meetsMinimum =
    major > 3 ||
    (major === 3 && minor > 1) ||
    (major === 3 && minor === 1 && patch >= 10);

  assert.ok(
    meetsMinimum,
    `ejs ${ejsPkg.version} is covered by GHSA-phwq-j96m-2c2q; upgrade to ≥ 3.1.10`
  );
});

// ---------------------------------------------------------------------------
// 4. Remaining high/critical vulns — npm audit sweep
//    Covers: axios (GHSA-cph5-m8f7-6c5x), express (GHSA-qw6h-vgh9-j6wx),
//            body-parser, path-to-regexp, qs (GHSA-6rw7-vpxm-498p).
//    After bumping express ≥ 4.22.2 and axios ≥ 0.21.4 these must clear.
// ---------------------------------------------------------------------------

test('npm audit reports zero critical and zero high vulnerabilities after dependency bumps', () => {
  const { execSync } = require('child_process');

  let auditOutput;
  try {
    // --audit-level=high exits non-zero if any high/critical vuln is found.
    execSync('npm audit --audit-level=high --json', {
      cwd: require('path').resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Exit 0 → no high/critical vulns → GREEN.
    auditOutput = null;
  } catch (err) {
    // Non-zero exit means high/critical vulns remain → RED.
    auditOutput = err.stdout ? err.stdout.toString() : String(err);
  }

  // Parse the JSON output to get a human-readable count for the failure message.
  let critCount = '?', highCount = '?';
  if (auditOutput) {
    try {
      const parsed = JSON.parse(auditOutput);
      const meta = parsed.metadata && parsed.metadata.vulnerabilities;
      if (meta) { critCount = meta.critical || 0; highCount = meta.high || 0; }
    } catch (_) {}
  }

  assert.equal(
    auditOutput,
    null,
    `npm audit found high/critical vulnerabilities (critical: ${critCount}, high: ${highCount}). ` +
    'Bump axios ≥ 0.21.4 and express ≥ 4.22.2 to clear them.'
  );
});
