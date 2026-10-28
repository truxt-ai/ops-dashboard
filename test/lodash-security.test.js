'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const _ = require('lodash');

test('defaultsDeep preserves normal defaults without polluting Object.prototype (GHSA-jf85-cpcp-j695)', () => {
  assert.deepEqual(_.defaultsDeep({ nested: { value: 1 } }, { nested: { value: 2, other: 3 } }),
    { nested: { value: 1, other: 3 } });
  try {
    _.defaultsDeep({}, { constructor: { prototype: { __axm747Polluted: true } } });
    assert.equal(Object.prototype.__axm747Polluted, undefined);
  } finally {
    delete Object.prototype.__axm747Polluted;
  }
});

test('template accepts normal imports and rejects injected import names (GHSA-r5fr-rjxr-66jc)', () => {
  assert.equal(_.template('<%= value %>', { imports: { value: 42 } })({}), '42');
  try {
    assert.throws(() => _.template('', {
      imports: { 'x = (globalThis.__axm747Template = true)': undefined },
    }), /imports/);
    assert.equal(globalThis.__axm747Template, undefined);
  } finally {
    delete globalThis.__axm747Template;
  }
});

test('unset and omit accept normal paths and block array-wrapped prototype paths (GHSA-f23m-r3pf-42rh)', () => {
  const value = { nested: { keep: true, remove: true } };
  assert.equal(_.unset(value, ['nested', 'remove']), true);
  assert.deepEqual(value, { nested: { keep: true } });
  assert.deepEqual(_.omit({ keep: true, remove: true }, ['remove']), { keep: true });
  try {
    for (const remove of [
      () => _.unset({}, [['__proto__'], '__axm747Sentinel']),
      () => _.omit({}, [[['__proto__'], '__axm747Sentinel']]),
    ]) {
      Object.prototype.__axm747Sentinel = true;
      remove();
      assert.equal(Object.prototype.__axm747Sentinel, true);
    }
  } finally {
    delete Object.prototype.__axm747Sentinel;
  }
});
