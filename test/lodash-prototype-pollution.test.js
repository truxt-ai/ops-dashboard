'use strict';

// Security regression test for GHSA-jf85-cpcp-j695
// Lodash prototype pollution via _.set and _.zipObjectDeep.
// RED on lodash@4.17.4: Object.prototype is mutated, ({}).isAdmin === true.
// GREEN on lodash@4.18.1+: Object.prototype stays clean.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const _ = require('lodash');

afterEach(() => {
  // Clean up any prototype pollution so it cannot leak into other tests.
  delete Object.prototype.isAdmin;
});

test('lodash _.set does not pollute Object.prototype via __proto__ key', () => {
  _.set({}, '__proto__.isAdmin', true);
  assert.strictEqual(
    ({}).isAdmin,
    undefined,
    'Object.prototype.isAdmin must remain undefined after _.set with __proto__ key'
  );
});

test('lodash _.zipObjectDeep does not pollute Object.prototype via __proto__ key', () => {
  _.zipObjectDeep(['__proto__.isAdmin'], [true]);
  assert.strictEqual(
    ({}).isAdmin,
    undefined,
    'Object.prototype.isAdmin must remain undefined after _.zipObjectDeep with __proto__ key'
  );
});
