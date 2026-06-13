'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

test('GHSA-phwq-j96m-2c2q: ejs rejects localsName injection without executing it', () => {
  const marker = '__ejsSecurityRegressionReached';

  try {
    delete globalThis[marker];

    let thrown;
    try {
      ejs.render('safe dashboard template', {}, {
        _with: false,
        localsName: `{missing = (globalThis.${marker} = 'executed')}`,
      });
    } catch (err) {
      thrown = err;
    }

    assert.strictEqual(
      globalThis[marker],
      undefined,
      'unsafe localsName option must not execute attacker-controlled JavaScript'
    );
    assert.ok(thrown, 'unsafe localsName option should be rejected');
  } finally {
    delete globalThis[marker];
  }
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep blocks __proto__ pollution', () => {
  const marker = '__lodashSecurityRegressionPolluted';
  const payload = JSON.parse(`{"__proto__":{"${marker}":"polluted"}}`);

  try {
    _.defaultsDeep({}, payload);

    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      'lodash must not copy attacker-controlled __proto__ keys onto Object.prototype'
    );
    assert.strictEqual(
      ({}[marker]),
      undefined,
      'new objects must not inherit properties from a polluted Object.prototype'
    );
  } finally {
    delete Object.prototype[marker];
  }
});

test('GHSA-xvch-5gv4-984h: minimist blocks dotted __proto__ pollution', () => {
  const marker = '__minimistSecurityRegressionPolluted';

  try {
    minimist([`--__proto__.${marker}`, 'polluted']);

    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      'minimist must not write dotted __proto__ arguments onto Object.prototype'
    );
    assert.strictEqual(
      ({}[marker]),
      undefined,
      'new objects must not inherit properties from a polluted Object.prototype'
    );
  } finally {
    delete Object.prototype[marker];
  }
});
