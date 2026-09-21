'use strict';

// Security regression tests for ATL-563.
// Each test targets a direct dependency boundary named in the parent audit
// and asserts the vulnerability is closed. Every test is RED against the
// currently-pinned (pre-fix) dependency versions and MUST turn GREEN once
// the implement task bumps the dependencies to the advised safe releases.
// Prototype-pollution tests use unique sentinel keys and clean up after
// themselves so a successful exploit in one test does not silently mask
// another test in the same process.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function withSentinel(key, fn) {
  try {
    fn();
  } finally {
    delete Object.prototype[key];
  }
}

// GHSA-jf85-cpcp-j695 — Prototype Pollution in lodash <4.17.12 via _.merge.
// RED on lodash 4.17.4: `_.merge({}, JSON.parse('{"__proto__":{...}}'))`
// walks into Object.prototype and mutates it.
test('lodash _.merge does not pollute Object.prototype (GHSA-jf85-cpcp-j695)', () => {
  const _ = require('lodash');
  const sentinel = 'atl563_lodash_polluted';

  withSentinel(sentinel, () => {
    const payload = JSON.parse(`{"__proto__":{"${sentinel}":"yes"}}`);
    _.merge({}, payload);

    assert.strictEqual(
      {}[sentinel],
      undefined,
      'Object.prototype was polluted through lodash.merge',
    );
    assert.strictEqual(Object.prototype[sentinel], undefined);
  });
});

// GHSA-xvch-5gv4-984h — Prototype Pollution in minimist <1.2.6 via `--__proto__.x`.
// RED on minimist 1.2.0: parsing dotted `__proto__` argv keys writes into
// Object.prototype.
test('minimist does not pollute Object.prototype from argv (GHSA-xvch-5gv4-984h)', () => {
  const minimist = require('minimist');
  const sentinel = 'atl563_minimist_polluted';

  withSentinel(sentinel, () => {
    minimist(['--__proto__.' + sentinel, 'yes']);

    assert.strictEqual(
      {}[sentinel],
      undefined,
      'Object.prototype was polluted through minimist argv parsing',
    );
    assert.strictEqual(Object.prototype[sentinel], undefined);
  });
});

// Dependency-remediation gate — every other advisory in the parent audit is
// closed by the version bump. This asserts the top-line remediation contract
// rather than authoring one exploit test per advisory.
test('npm audit reports zero critical and high vulnerabilities after remediation', () => {
  let output;
  try {
    output = execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    output = error.stdout;
  }
  const audit = JSON.parse(output);

  assert.strictEqual(audit.metadata?.vulnerabilities?.critical ?? 0, 0);
  assert.strictEqual(audit.metadata?.vulnerabilities?.high ?? 0, 0);
});
