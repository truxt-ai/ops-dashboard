'use strict';

/**
 * Security regression tests for RAU-79.
 * Each test must be RED (failing / exploit reproduced) on the pinned vulnerable
 * package versions and GREEN (passing / exploit blocked) after these exact upgrades:
 *   ejs@6.0.1, lodash@4.18.1, minimist@1.2.8, express@4.22.2, axios@0.21.4
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// CVE 1: ejs — GHSA-phwq-j96m-2c2q  (escape-handler injection via prototype)
// ---------------------------------------------------------------------------
// ejs <3.1.7 (including the 2.x line) looks up `opts.escape` without an
// own-property guard.  A prototype-pollution step (e.g., via the lodash or
// minimist vulns above) can pre-inject a malicious escape function onto
// Object.prototype, which ejs then silently adopts as its HTML encoder for
// every `<%= … %>` expression, enabling arbitrary code execution.
//
// Fix: ejs ≥3.1.7 / 6.x validates that escape is an own property of opts.
// ---------------------------------------------------------------------------
test('GHSA-phwq-j96m-2c2q: ejs reads escape function from Object.prototype (RCE via opts)', () => {
  const ejs = require('ejs');

  let injectedEscapeCalled = false;
  Object.prototype.escape = function (s) {   // eslint-disable-line no-extend-native
    injectedEscapeCalled = true;
    return String(s);
  };

  try {
    // Pass an empty opts object — the escape key is not set as an own property,
    // yet vulnerable ejs picks it up from the prototype chain.
    ejs.render('<%= name %>', { name: 'safe' }, {});
  } finally {
    delete Object.prototype.escape;
  }

  // SAFE assertion: the injected function must NOT have been called.
  // Vulnerable ejs 2.5.7  → injectedEscapeCalled === true  → FAILS → RED.
  // Fixed     ejs ≥3.1.7  → injectedEscapeCalled === false → passes → GREEN.
  assert.strictEqual(
    injectedEscapeCalled,
    false,
    'GHSA-phwq-j96m-2c2q: ejs picked up escape handler from Object.prototype — prototype-polluted escape fn runs on every template expression (RCE vector)'
  );
});

// ---------------------------------------------------------------------------
// ejs smoke test — API compatibility after 2.x → 6.x major version jump
// ---------------------------------------------------------------------------
// ejs 6.x is a major rewrite; verify that basic template rendering,
// HTML escaping, and multi-expression templates all still work correctly
// so that a breaking API change is caught before the app ships.
// ---------------------------------------------------------------------------
test('ejs smoke: basic template rendering works correctly after upgrade to 6.x', () => {
  const ejs = require('ejs');

  // Plain variable interpolation.
  assert.strictEqual(
    ejs.render('<h1><%= title %></h1>', { title: 'Hello World' }),
    '<h1>Hello World</h1>',
    'ejs: basic interpolation must render correctly'
  );

  // HTML special characters must be escaped in <%= … %>.
  assert.strictEqual(
    ejs.render('<%= html %>', { html: '<script>alert(1)</script>' }),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    'ejs: <%= %> must HTML-escape output'
  );

  // Unescaped output via <%- … %>.
  assert.strictEqual(
    ejs.render('<%- raw %>', { raw: '<b>bold</b>' }),
    '<b>bold</b>',
    'ejs: <%- %> must pass output through unescaped'
  );

  // Multi-expression template with arithmetic.
  const result = ejs.render('<%= a %> + <%= b %> = <%= a + b %>', { a: 3, b: 4 });
  assert.strictEqual(result, '3 + 4 = 7', 'ejs: multi-expression template must evaluate correctly');
});

// ---------------------------------------------------------------------------
// CVE 2: lodash — GHSA-fvqr-27wr-82fm  (prototype pollution via _.merge / _.set)
// ---------------------------------------------------------------------------
// lodash <4.17.5 — _.merge() recursively copies properties from a parsed JSON
// object onto Object.prototype when the key is __proto__, poisoning every plain
// object created afterwards.  _.set() has the same flaw when the path contains
// __proto__ as a path segment.
//
// Fix: lodash ≥4.17.5 skips __proto__ and constructor.prototype writes.
// ---------------------------------------------------------------------------
test('GHSA-fvqr-27wr-82fm: lodash _.merge allows __proto__ prototype pollution', () => {
  const _ = require('lodash');

  const key = '__lodashMergeVuln__';
  // JSON.parse is the canonical way to create an object with __proto__ as an
  // own key (object literals always set the real prototype instead).
  const payload = JSON.parse(`{"__proto__":{"${key}":"POLLUTED"}}`);
  _.merge({}, payload);

  const polluted = ({})[key];
  delete Object.prototype[key];

  // SAFE assertion: a freshly created object must NOT inherit the injected key.
  // Vulnerable lodash 4.17.4 → polluted === 'POLLUTED' → FAILS → RED.
  // Fixed     lodash ≥4.17.5 → polluted === undefined  → passes → GREEN.
  assert.strictEqual(
    polluted,
    undefined,
    `GHSA-fvqr-27wr-82fm (_.merge): Object.prototype.${key} was set — every subsequently created plain object inherits the attacker-controlled property`
  );
});

test('GHSA-fvqr-27wr-82fm: lodash _.set allows __proto__ prototype pollution', () => {
  const _ = require('lodash');

  const key = '__lodashSetVuln__';
  // _.set with a dotted path that contains __proto__ as a segment.
  _.set({}, `__proto__.${key}`, 'POLLUTED');

  const polluted = ({})[key];
  delete Object.prototype[key];

  // SAFE assertion: a freshly created object must NOT inherit the injected key.
  // Vulnerable lodash 4.17.4 → polluted === 'POLLUTED' → FAILS → RED.
  // Fixed     lodash ≥4.17.5 → polluted === undefined  → passes → GREEN.
  assert.strictEqual(
    polluted,
    undefined,
    `GHSA-fvqr-27wr-82fm (_.set): Object.prototype.${key} was set via __proto__ path segment — every subsequently created plain object inherits the attacker-controlled property`
  );
});

// ---------------------------------------------------------------------------
// CVE 3: minimist — GHSA-vh95-rmgr-6w4m  (prototype pollution via --__proto__)
// ---------------------------------------------------------------------------
// minimist ≥1.0.0 <1.2.3 — parsing a CLI argument of the form
// --__proto__[key]=value directly assigns to Object.prototype, poisoning the
// entire runtime.  No special environment is required; any app that passes
// user-controlled argv through minimist is affected.
//
// Fix: minimist ≥1.2.3 treats __proto__ as a forbidden key and silently drops it.
// ---------------------------------------------------------------------------
test('GHSA-vh95-rmgr-6w4m: minimist allows __proto__ prototype pollution via CLI args', () => {
  const minimist = require('minimist');

  const key = '__minimistVuln__';
  // minimist 1.2.0 interprets --__proto__.key as an assignment to
  // Object.prototype.key when parsed in the dot-notation expansion path.
  minimist([`--__proto__.${key}`, 'POLLUTED']);

  const polluted = ({})[key];
  delete Object.prototype[key];

  // SAFE assertion: a freshly created object must NOT have the injected key.
  // Vulnerable minimist 1.2.0  → polluted === 'POLLUTED' → FAILS → RED.
  // Fixed     minimist ≥1.2.3  → polluted === undefined  → passes → GREEN.
  assert.strictEqual(
    polluted,
    undefined,
    `GHSA-vh95-rmgr-6w4m: minimist polluted Object.prototype.${key} via --__proto__[…] argument — any app that exposes argv parsing to users is vulnerable`
  );
});

// ---------------------------------------------------------------------------
// npm audit sweep — packages in scope for this task
// ---------------------------------------------------------------------------
// After the RAU-79 upgrades are applied, npm audit must report no critical or
// high advisories for the four packages explicitly targeted here:
//   ejs@6.0.1, lodash@4.18.1, minimist@1.2.8, express@4.22.2.
//
// NOTE: axios@0.21.4 (the version pinned by this task) is still within the
// advisory range for GHSA-wf5p-g6vw-rhxx and GHSA-jr5f-v2jv-69x6 (cleared
// only at axios ≥0.28.0 / ≥0.30.0).  The axios advisories are out of scope
// for RAU-79 and are excluded from this assertion.
//
// npm audit exits non-zero when vulnerabilities are found; spawnSync is used
// so a non-zero exit does not throw — we inspect the JSON output directly.
// ---------------------------------------------------------------------------
test('npm audit: no critical/high advisories for ejs, lodash, minimist, express after upgrades', () => {
  // Packages whose advisories must be cleared by the RAU-79 upgrades.
  const IN_SCOPE = new Set(['ejs', 'lodash', 'minimist', 'express', 'path-to-regexp']);

  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });

  // npm audit exits non-zero when vulnerabilities are found; parse JSON regardless.
  let auditData;
  try {
    auditData = JSON.parse(result.stdout);
  } catch {
    assert.fail(`npm audit returned unparseable output.\nstderr: ${result.stderr}`);
  }

  const vulns = Object.values(auditData.vulnerabilities || {});
  const blocking = vulns.filter(
    (v) => IN_SCOPE.has(v.name) && (v.severity === 'critical' || v.severity === 'high')
  );

  // SAFE assertion: no critical/high advisories for in-scope packages.
  // Vulnerable state (ejs@2.5.7, lodash@4.17.4, minimist@1.2.0, express@4.18.2)
  //   → blocking.length > 0 → FAILS → RED.
  // After upgrades (ejs@6.0.1, lodash@4.18.1, minimist@1.2.8, express@4.22.2)
  //   → blocking.length === 0 → passes → GREEN.
  const names = blocking.map((v) => `${v.name} [${v.severity}]`).join(', ');
  assert.strictEqual(
    blocking.length,
    0,
    `npm audit: ${blocking.length} in-scope critical/high advisory(ies) still present: ${names}`
  );
});
