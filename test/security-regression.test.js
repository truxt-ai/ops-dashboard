'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function deleteObjectPrototypeKey(key) {
  delete Object.prototype[key];
}

test('GHSA-phwq-j96m-2c2q: ejs rejects executable template option names', () => {
  const marker = '__atl291EjsTemplateOptionInjection';
  delete global[marker];

  try {
    assert.throws(
      () => ejs.render('safe output', {}, {
        localsName: `locals = (global.${marker} = true, {})`,
      }),
      /localsName|identifier|Unexpected|Invalid/,
      'executable localsName values must be rejected before template execution'
    );
    assert.strictEqual(global[marker], undefined);
  }
  finally {
    delete global[marker];
  }
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep does not pollute Object.prototype', () => {
  const key = '__atl291LodashPolluted';
  deleteObjectPrototypeKey(key);

  try {
    const payload = JSON.parse(
      `{"constructor":{"prototype":{"${key}":"polluted"}}}`
    );

    _.defaultsDeep({}, payload);

    assert.strictEqual(
      Object.prototype[key],
      undefined,
      'defaultsDeep must not write payload keys onto Object.prototype'
    );
    assert.strictEqual({}[key], undefined);
  }
  finally {
    deleteObjectPrototypeKey(key);
  }
});

test('GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype from argv paths', () => {
  const key = '__atl291MinimistPolluted';
  deleteObjectPrototypeKey(key);

  try {
    minimist([`--__proto__.${key}=polluted`]);

    assert.strictEqual(
      Object.prototype[key],
      undefined,
      'argv __proto__ paths must remain inert data'
    );
    assert.strictEqual({}[key], undefined);
  }
  finally {
    deleteObjectPrototypeKey(key);
  }
});
