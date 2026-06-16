'use strict';

/**
 * Security regression tests for ATL-66 — ops-dashboard dependency vulnerabilities.
 *
 * These tests must be RED on the pre-fix dependency versions and GREEN after the
 * remediation bumps specified in ATL-66. Each test exercises the EXACT unsafe
 * behavior described by the advisory at the dependency boundary.
 *
 * Covered advisories (top 3 critical, direct dependencies):
 *   - GHSA-vh95-rmgr-6w4m : Prototype Pollution in minimist < 1.2.8
 *   - GHSA-fvqr-27wr-82fm : Prototype Pollution in lodash < 4.18.1
 *   - GHSA-phwq-j96m-2c2q : Code injection via localsName in ejs < 3.x
 *
 * Remaining high/moderate/low advisories (axios, express, body-parser, etc.) are
 * covered by the npm-audit sweep test at the bottom of this file.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// GHSA-vh95-rmgr-6w4m — Prototype Pollution in minimist (minimist < 1.2.8)
// Malicious CLI args can set arbitrary keys on Object.prototype, poisoning
// every plain object in the process.
// ---------------------------------------------------------------------------
describe('GHSA-vh95-rmgr-6w4m: minimist prototype pollution', () => {
  test('should not pollute Object.prototype via --__proto__ flag', () => {
    const KEY = '__sec_test_minimist_proto__';
    delete Object.prototype[KEY];

    const minimist = require('minimist');
    // On minimist 1.2.0: --__proto__.KEY=HACKED writes to Object.prototype
    minimist([`--__proto__.${KEY}`, 'HACKED']);

    // RED on minimist 1.2.0: ({}).KEY === 'HACKED'
    // GREEN on minimist 1.2.8+: ({}).KEY === undefined
    assert.strictEqual(
      ({})[KEY],
      undefined,
      `GHSA-vh95-rmgr-6w4m: minimist must not pollute Object.prototype via --__proto__ (got: ${({})[KEY]})`
    );

    delete Object.prototype[KEY];
  });

  test('should not pollute Object.prototype via --constructor.prototype flag', () => {
    const KEY = '__sec_test_minimist_ctor__';
    delete Object.prototype[KEY];

    const minimist = require('minimist');
    minimist([`--constructor.prototype.${KEY}`, 'HACKED']);

    // RED on minimist 1.2.0: ({}).KEY === 'HACKED'
    // GREEN on minimist 1.2.8+: ({}).KEY === undefined
    assert.strictEqual(
      ({})[KEY],
      undefined,
      `GHSA-vh95-rmgr-6w4m: minimist must not pollute Object.prototype via --constructor.prototype (got: ${({})[KEY]})`
    );

    delete Object.prototype[KEY];
  });
});

// ---------------------------------------------------------------------------
// GHSA-fvqr-27wr-82fm — Prototype Pollution in lodash (lodash < 4.18.1)
// _.merge and _.defaultsDeep allow __proto__ / constructor.prototype keys
// from user-supplied JSON to overwrite properties on Object.prototype.
// ---------------------------------------------------------------------------
describe('GHSA-fvqr-27wr-82fm: lodash prototype pollution', () => {
  test('_.merge should not pollute Object.prototype via __proto__ key', () => {
    const KEY = '__sec_test_lodash_merge__';
    delete Object.prototype[KEY];

    const _ = require('lodash');
    // Simulate attacker-controlled JSON with __proto__ key
    const payload = JSON.parse(`{"__proto__":{"${KEY}":true}}`);
    _.merge({}, payload);

    // RED on lodash 4.17.4: ({}).KEY === true
    // GREEN on lodash 4.18.1+: ({}).KEY === undefined
    assert.strictEqual(
      ({})[KEY],
      undefined,
      `GHSA-fvqr-27wr-82fm: _.merge must not pollute Object.prototype via __proto__ (got: ${({})[KEY]})`
    );

    delete Object.prototype[KEY];
  });

  test('_.defaultsDeep should not pollute Object.prototype via constructor.prototype', () => {
    const KEY = '__sec_test_lodash_defaults__';
    delete Object.prototype[KEY];

    const _ = require('lodash');
    const payload = JSON.parse(`{"constructor":{"prototype":{"${KEY}":true}}}`);
    _.defaultsDeep({}, payload);

    // RED on lodash 4.17.4: ({}).KEY === true
    // GREEN on lodash 4.18.1+: ({}).KEY === undefined
    assert.strictEqual(
      ({})[KEY],
      undefined,
      `GHSA-fvqr-27wr-82fm: _.defaultsDeep must not pollute Object.prototype via constructor.prototype (got: ${({})[KEY]})`
    );

    delete Object.prototype[KEY];
  });
});

// ---------------------------------------------------------------------------
// GHSA-phwq-j96m-2c2q — Code injection via localsName option in ejs < 3.x
// ejs builds a Function() from opts.localsName without sanitizing it. An
// attacker who controls rendering options can inject JavaScript as a default
// parameter expression that executes on every template render.
//
// Exploit: localsName = 'locals, _z=(process.env.KEY="YES"), escapeFn2'
// → new Function('locals, _z=(process.env.KEY="YES"), escapeFn2, escapeFn, ...', src)
// → _z default evaluates on call → arbitrary code runs.
// ---------------------------------------------------------------------------
describe('GHSA-phwq-j96m-2c2q: ejs localsName code injection', () => {
  test('ejs should not execute code injected via opts.localsName', () => {
    const MARKER = '__EJS_SEC_TEST_INJECTED__';
    delete process.env[MARKER];

    const ejs = require('ejs');
    // Craft localsName to inject a default-parameter expression that sets env var
    const injectedLocalsName = `locals, _z=(process.env.${MARKER}="YES"), escapeFn2`;

    try {
      ejs.render('safe-template', {}, { localsName: injectedLocalsName });
    } catch (_) {
      // A throw is also an acceptable secure response (option rejected)
    }

    const wasInjected = process.env[MARKER] === 'YES';

    // RED on ejs 2.5.7: wasInjected === true (code ran)
    // GREEN on ejs with fix: wasInjected === false (injection blocked or throws)
    assert.strictEqual(
      wasInjected,
      false,
      'GHSA-phwq-j96m-2c2q: ejs must not execute code injected via opts.localsName'
    );

    delete process.env[MARKER];
  });
});

// ---------------------------------------------------------------------------
// Remaining high/moderate advisories sweep:
//   GHSA-wf5p-g6vw-rhxx  axios CSRF
//   GHSA-qwcr-r2fm-qrc7  body-parser DoS
//   GHSA-qw6h-vgh9-j6wx  express XSS via redirect
//   GHSA-9wv6-86v2-598j  path-to-regexp ReDoS
//   GHSA-w7fw-mjwx-w883  qs arrayLimit DoS
//   GHSA-pxg6-pf52-xh8x  cookie out-of-bounds
//   GHSA-m6fv-jmcg-4jfg  send template injection → XSS
//   GHSA-cm22-4g7w-348p  serve-static template injection → XSS
//
// These are transitive via express or in axios. After the ATL-66 bumps,
// npm audit must report 0 critical and 0 high vulnerabilities.
// ---------------------------------------------------------------------------
describe('npm audit sweep: all critical/high vulnerabilities must be cleared', () => {
  test('npm audit reports 0 critical and 0 high vulnerabilities after remediation', () => {
    let auditData;
    try {
      const raw = execSync('npm audit --json', { cwd: ROOT }).toString();
      auditData = JSON.parse(raw);
    } catch (e) {
      // npm audit exits non-zero when vulnerabilities exist; stdout still has JSON
      auditData = JSON.parse(e.stdout.toString());
    }

    const vuln = (auditData.metadata || {}).vulnerabilities || {};
    const critical = vuln.critical || 0;
    const high = vuln.high || 0;

    // RED on pre-fix: critical=3, high=4
    // GREEN on post-fix: critical=0, high=0
    assert.strictEqual(
      critical,
      0,
      `Expected 0 critical vulnerabilities after bumps, found ${critical} — run the ATL-66 remediation first`
    );
    assert.strictEqual(
      high,
      0,
      `Expected 0 high vulnerabilities after bumps, found ${high} — run the ATL-66 remediation first`
    );
  });
});
