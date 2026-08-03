'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

function clearObjectPrototype(keys) {
  for (const key of keys) {
    delete Object.prototype[key];
  }
}

test('GHSA-ghr5-ch3p-vcr6: EJS ignores inherited client and escape options from a polluted prototype', () => {
  const marker = '__axiomEjsPrototypePollutionExecuted';
  delete global[marker];
  clearObjectPrototype(['client', 'escape']);

  try {
    Object.prototype.client = true;
    Object.prototype.escape = function escape(markup) {
      return String(markup);
    };
    Object.prototype.escape.toString = function toString() {
      return `function escapeFn(markup) { return String(markup); }; global.${marker} = true;`;
    };

    assert.strictEqual(ejs.render('<%= name %>', { name: 'ok' }), 'ok');
    assert.strictEqual(
      global[marker],
      undefined,
      'EJS must not execute code from inherited polluted template options'
    );
  } finally {
    delete global[marker];
    clearObjectPrototype(['client', 'escape']);
  }
});

test('GHSA-fvqr-27wr-82fm: lodash merge does not pollute Object.prototype through __proto__ payloads', () => {
  clearObjectPrototype(['axiomPolluted']);

  try {
    lodash.merge({}, JSON.parse('{"__proto__":{"axiomPolluted":"lodash"}}'));

    assert.strictEqual(
      {}.axiomPolluted,
      undefined,
      'lodash must not merge attacker-controlled __proto__ data onto Object.prototype'
    );
  } finally {
    clearObjectPrototype(['axiomPolluted']);
  }
});

test('GHSA-vh95-rmgr-6w4m / GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype from argv keys', () => {
  const cases = [
    {
      name: '__proto__ path',
      args: ['--__proto__.axiomPolluted=minimist'],
    },
    {
      name: 'constructor.prototype path',
      args: ['--constructor.prototype.axiomPolluted=minimist'],
    },
  ];

  try {
    for (const entry of cases) {
      clearObjectPrototype(['axiomPolluted']);
      minimist(entry.args);

      assert.strictEqual(
        {}.axiomPolluted,
        undefined,
        `minimist must ignore attacker-controlled ${entry.name} payloads`
      );
    }
  } finally {
    clearObjectPrototype(['axiomPolluted']);
  }
});
