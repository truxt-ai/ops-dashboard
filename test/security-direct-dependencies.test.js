'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

test('GHSA-ghr5-ch3p-vcr6: ejs ignores inherited client and escape options', () => {
  const marker = '__ejsPollutedEscapeRan';
  delete global[marker];
  delete Object.prototype.client;
  delete Object.prototype.escape;

  Object.prototype.client = true;
  Object.prototype.escape = `function escape(markup) { return markup; }
global.${marker} = true;
//`;

  try {
    const rendered = ejs.render('<%= value %>', {
      value: '<script>alert(1)</script>',
    });

    assert.strictEqual(
      global[marker],
      undefined,
      'polluted inherited escape option must not execute code'
    );
    assert.strictEqual(rendered, '&lt;script&gt;alert(1)&lt;/script&gt;');
  } finally {
    delete global[marker];
    delete Object.prototype.client;
    delete Object.prototype.escape;
  }
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep blocks constructor.prototype pollution', () => {
  delete Object.prototype.pollutedByLodashDefaultsDeep;

  try {
    lodash.defaultsDeep(
      {},
      JSON.parse('{"constructor":{"prototype":{"pollutedByLodashDefaultsDeep":"owned"}}}')
    );

    assert.strictEqual(
      {}.pollutedByLodashDefaultsDeep,
      undefined,
      'constructor.prototype payload must not pollute Object.prototype'
    );
  } finally {
    delete Object.prototype.pollutedByLodashDefaultsDeep;
  }
});

test('GHSA-xvch-5gv4-984h: minimist blocks __proto__ argv pollution', () => {
  delete Object.prototype.pollutedByMinimistArgv;

  try {
    minimist(['--__proto__.pollutedByMinimistArgv', 'owned']);

    assert.strictEqual(
      {}.pollutedByMinimistArgv,
      undefined,
      '__proto__ argv payload must not pollute Object.prototype'
    );
  } finally {
    delete Object.prototype.pollutedByMinimistArgv;
  }
});
