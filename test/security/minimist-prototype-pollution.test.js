'use strict';

// Security regression test — minimist prototype pollution
// Advisory: GHSA-xvch-5gv4-984h (Prototype Pollution in minimist, CVE-2020-7598)
// Vulnerable: minimist 1.2.0 (installed)   Fixed: minimist 1.2.8 (remediation bump)
//
// In minimist <1.2.3, an argv entry like `--__proto__.x value` is parsed into a
// nested assignment that walks `__proto__` onto Object.prototype, polluting every
// object in the process. Patched minimist refuses to traverse `__proto__`.
//
// RED proof: on minimist 1.2.0 the crafted argv pollutes Object.prototype -> assertion fails.
// GREEN proof: on patched minimist the prototype is clean -> assertion passes.

const { test } = require('node:test');
const assert = require('node:assert');
const minimist = require('minimist');

const POLLUTED_KEY = 'atl96_minimist_pp';

test('minimist must not pollute Object.prototype via a __proto__ argv key (GHSA-xvch-5gv4-984h)', () => {
  // eslint-disable-next-line no-proto
  delete Object.prototype[POLLUTED_KEY];

  // Attacker-controlled command-line arguments.
  minimist(['--__proto__.' + POLLUTED_KEY, 'polluted']);

  var leaked = ({})[POLLUTED_KEY];
  // eslint-disable-next-line no-proto
  delete Object.prototype[POLLUTED_KEY];

  assert.strictEqual(
    leaked,
    undefined,
    'minimist wrote an attacker key onto Object.prototype (prototype pollution)'
  );
});
