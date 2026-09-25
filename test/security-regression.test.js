'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Security Regression Tests for Critical Vulnerabilities (ATL-592)
// These tests must go RED on unfixed code, GREEN after dependency upgrades.
// Per security-regression-test skill: a test that is RED on unfixed code and
// GREEN after upgrade is closure proof.

// Filesystem-based package version lookup that does NOT rely on the package
// exporting `package.json` in its `exports` map. EJS 6.0.1 intentionally
// removed that export, so `require('ejs/package.json')` throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. Instead we resolve the package's main entry
// with `require.resolve(pkg)` and walk up the directory tree until we find
// the `package.json` whose `name` field matches the requested package.
function readInstalledPackageJson(pkgName) {
  const entry = require.resolve(pkgName);
  let dir = path.dirname(entry);
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed && parsed.name === pkgName) {
        return parsed;
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(`could not locate package.json for ${pkgName}`);
}

function majorVersion(v) {
  return Number(String(v).split('.')[0]);
}

function versionAtLeast(actual, min) {
  const a = String(actual).split('.').map(Number);
  const m = String(min).split('.').map(Number);
  for (let i = 0; i < m.length; i += 1) {
    const av = a[i] || 0;
    const mv = m[i] || 0;
    if (av > mv) return true;
    if (av < mv) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GHSA-phwq-j96m-2c2q: EJS Template Injection (RCE) — ejs < 6.0.1
// ---------------------------------------------------------------------------
test('GHSA-phwq-j96m-2c2q: ejs template injection allows code execution', () => {
  const ejs = require('ejs');

  // Vulnerable pattern: ejs < 6.0.1 evaluates arbitrary JavaScript inside
  // template scriptlets. The exploit below executes `7 * 7` to demonstrate
  // arbitrary code execution surface. On ejs 6.0.1+ the render succeeds but
  // the exploit surface is closed by the upstream fix; we anchor the
  // assertion on the installed major version so this test is definitively
  // RED on master (ejs 2.5.7) and GREEN on impl (ejs 6.0.1+).
  const ejsPkg = readInstalledPackageJson('ejs');
  const injectionPayload = '<%= 7 * 7 %>';
  const result = ejs.render(injectionPayload, {});

  // Guard 1: sanity — render did evaluate (proves the injection primitive works)
  assert.strictEqual(result.trim(), '49', 'ejs render must evaluate the payload');

  // Guard 2: closure proof — the installed ejs must be a fixed version.
  // ejs < 6.0.1 is affected by GHSA-phwq-j96m-2c2q. This is the
  // dependency-boundary assertion that flips RED (ejs 2.5.7) -> GREEN
  // (ejs 6.0.1+).
  assert.ok(
    majorVersion(ejsPkg.version) >= 6,
    `VULNERABLE: ejs ${ejsPkg.version} is affected by GHSA-phwq-j96m-2c2q (template injection RCE). Upgrade to >= 6.0.1.`
  );
});

// ---------------------------------------------------------------------------
// GHSA-jf85-cpcp-j695: Lodash Prototype Pollution — lodash < 4.17.21
// ---------------------------------------------------------------------------
test('GHSA-jf85-cpcp-j695: lodash merge allows prototype pollution via __proto__', () => {
  // Clear any prior pollution state
  delete Object.prototype.adminUser;

  const lodash = require('lodash');

  // Vulnerable pattern: lodash < 4.17.21 allows merging __proto__ directly
  // into Object.prototype. Using JSON.parse so the __proto__ key is a real
  // own property of the source object rather than the Object.prototype
  // accessor.
  const target = {};
  const malicious = JSON.parse('{"__proto__": {"adminUser": true}}');

  lodash.merge(target, malicious);

  // On vulnerable lodash: Object.prototype.adminUser === true (every object
  // becomes admin). On fixed lodash (4.17.21+): pollution is prevented.
  const pollutionOccurred = Object.prototype.adminUser === true;

  // Cleanup BEFORE asserting so a failed run does not leak state.
  delete Object.prototype.adminUser;

  assert.strictEqual(
    pollutionOccurred,
    false,
    'VULNERABLE: lodash merge allowed prototype pollution (GHSA-jf85-cpcp-j695). Upgrade to >= 4.17.21.'
  );
});

// ---------------------------------------------------------------------------
// GHSA-xvch-5gv4-984h: Minimist Prototype Pollution — minimist < 1.2.8
// ---------------------------------------------------------------------------
test('GHSA-xvch-5gv4-984h: minimist parse allows prototype pollution via __proto__', () => {
  // Clear any prior pollution state
  delete Object.prototype.isAdmin;

  const minimist = require('minimist');

  // Vulnerable pattern: minimist < 1.2.8 walks the dotted key path into
  // Object.prototype when it sees a --__proto__.<key>=<value> style flag.
  const maliciousArgs = ['--__proto__.isAdmin=true'];
  minimist(maliciousArgs);

  // On vulnerable minimist: Object.prototype.isAdmin is assigned (as a string,
  // since minimist parses all CLI values as strings). The pollution itself
  // occurs; fixed minimist (1.2.8+) prevents the walk.
  const pollutionOccurred = Object.prototype.hasOwnProperty('isAdmin');

  // Cleanup BEFORE asserting.
  delete Object.prototype.isAdmin;

  assert.strictEqual(
    pollutionOccurred,
    false,
    'VULNERABLE: minimist allowed prototype pollution (GHSA-xvch-5gv4-984h). Upgrade to >= 1.2.8.'
  );
});

// ---------------------------------------------------------------------------
// Advisory dependency-boundary check (formerly the smoke test).
// The smoke assertion originally used `require('<pkg>/package.json')`, which
// is unsupported for ejs 6.0.1+ because ejs 6.0.1 intentionally does not
// export ./package.json in its exports map. We switch to a filesystem-based
// lookup anchored from `require.resolve(pkg)` so the assertion works on
// both the vulnerable and fixed versions of ejs.
// ---------------------------------------------------------------------------
test('all three packages are installed at fixed versions', () => {
  const ejsPkg = readInstalledPackageJson('ejs');
  const lodashPkg = readInstalledPackageJson('lodash');
  const minimistPkg = readInstalledPackageJson('minimist');

  // These minimums are the advisory fix versions for the three critical
  // CVEs in the ATL-592 audit.
  assert.ok(
    versionAtLeast(ejsPkg.version, '6.0.1'),
    `VULNERABLE: ejs ${ejsPkg.version} < 6.0.1 (GHSA-phwq-j96m-2c2q).`
  );
  assert.ok(
    versionAtLeast(lodashPkg.version, '4.17.21'),
    `VULNERABLE: lodash ${lodashPkg.version} < 4.17.21 (GHSA-jf85-cpcp-j695).`
  );
  assert.ok(
    versionAtLeast(minimistPkg.version, '1.2.8'),
    `VULNERABLE: minimist ${minimistPkg.version} < 1.2.8 (GHSA-xvch-5gv4-984h).`
  );
});
