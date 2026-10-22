'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lodash = require('lodash');

// CVE-2019-10744 / GHSA-jf85-cpcp-j695:
// https://github.com/advisories/GHSA-jf85-cpcp-j695
// Dependency-boundary proof; this does not claim an application route exposes defaultsDeep.
test('GHSA-jf85-cpcp-j695: defaultsDeep cannot pollute unrelated objects through constructor.prototype', (t) => {
  assert.deepEqual(
    lodash.defaultsDeep({ server: { port: 3000 } }, { server: { port: 80, host: 'localhost' } }),
    { server: { port: 3000, host: 'localhost' } },
    'ordinary nested defaults must still work'
  );

  const marker = 'atl712PrototypePollution';
  const original = Object.getOwnPropertyDescriptor(Object.prototype, marker);
  t.after(() => {
    if (original) Object.defineProperty(Object.prototype, marker, original);
    else delete Object.prototype[marker];
  });
  assert.equal(original, undefined, 'the test must begin without a polluted fixture');

  const unrelated = {};
  const payload = JSON.parse('{"constructor":{"prototype":{"atl712PrototypePollution":"attacker-controlled"}}}');
  lodash.defaultsDeep({}, payload);

  assert.deepEqual(
    { prototype: Object.prototype[marker], existingObject: unrelated[marker], newObject: ({})[marker] },
    { prototype: undefined, existingObject: undefined, newObject: undefined },
    'attacker-controlled defaults must never become inherited application properties'
  );
});
