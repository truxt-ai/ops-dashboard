'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('GHSA-phwq-j96m-2c2q: ejs rejects code-bearing localsName values', () => {
  const ejs = require('ejs');
  const marker = '__ejs_localsName_injection_probe__';

  global[marker] = false;
  try {
    let rejected = false;
    try {
      const template = ejs.compile("ok", {
        client: true,
        localsName: `locals = (global.${marker} = true)`,
      });
      template();
    } catch (error) {
      rejected = /localsName|identifier|invalid/i.test(error.message);
    }

    assert.strictEqual(global[marker], false);
    assert.strictEqual(rejected, true);
  } finally {
    delete global[marker];
  }
});

test('GHSA-jf85-cpcp-j695: lodash merge does not pollute Object.prototype', () => {
  const _ = require('lodash');
  const marker = '__lodash_merge_pollution_probe__';
  const payload = JSON.parse(`{"__proto__":{"${marker}":"polluted"}}`);

  delete Object.prototype[marker];
  try {
    _.merge({}, payload);
    assert.strictEqual({}[marker], undefined);
  } finally {
    delete Object.prototype[marker];
  }
});

test('GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype', () => {
  const minimist = require('minimist');
  const marker = '__minimist_pollution_probe__';

  delete Object.prototype[marker];
  try {
    minimist([`--__proto__.${marker}=polluted`]);
    assert.strictEqual({}[marker], undefined);
  } finally {
    delete Object.prototype[marker];
  }
});
