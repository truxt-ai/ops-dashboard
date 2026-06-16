'use strict';

// Security regression test — lodash prototype pollution
// Advisory: GHSA-jf85-cpcp-j695 (Prototype Pollution in lodash)
// Vulnerable: lodash 4.17.4 (installed)   Fixed: lodash 4.18.1 (remediation bump)
//
// In vulnerable lodash, recursive merge helpers walk a `__proto__` key in attacker
// JSON straight onto Object.prototype, polluting every object in the process.
// Patched lodash skips `__proto__` / constructor keys, so the global prototype is
// left untouched.
//
// RED proof: on lodash 4.17.4 the merge pollutes Object.prototype -> assertion fails.
// GREEN proof: on patched lodash the prototype is clean -> assertion passes.

const { test } = require('node:test');
const assert = require('node:assert');
const _ = require('lodash');

const POLLUTED_KEY = 'atl96_lodash_pp';

test('lodash.merge must not pollute Object.prototype via a __proto__ payload (GHSA-jf85-cpcp-j695)', () => {
  // eslint-disable-next-line no-proto
  delete Object.prototype[POLLUTED_KEY];

  // Malicious input as it would arrive from an untrusted JSON body.
  const malicious = JSON.parse('{"__proto__":{"' + POLLUTED_KEY + '":"polluted"}}');

  try {
    _.merge({}, malicious);
  } finally {
    var leaked = ({})[POLLUTED_KEY];
    // eslint-disable-next-line no-proto
    delete Object.prototype[POLLUTED_KEY];
  }

  assert.strictEqual(
    leaked,
    undefined,
    'lodash.merge wrote an attacker key onto Object.prototype (prototype pollution)'
  );
});
