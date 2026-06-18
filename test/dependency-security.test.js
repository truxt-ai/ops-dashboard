'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

test('EJS ignores polluted render options before compiling templates', () => {
  // GHSA-ghr5-ch3p-vcr6 / CVE-2024-33883: polluted Object.prototype options
  // must not be trusted as EJS render options or used to compile executable JS.
  delete global.__ejsPrototypePollutionExecuted;
  Object.prototype.client = true;
  Object.prototype.escape = {
    toString() {
      return 'function(){return "";} ; global.__ejsPrototypePollutionExecuted = "executed"; //';
    },
  };

  try {
    const rendered = ejs.render('<%= value %>', { value: 'ok' });

    assert.strictEqual(
      global.__ejsPrototypePollutionExecuted,
      undefined,
      'polluted EJS options must not execute injected template compiler code'
    );
    assert.strictEqual(rendered, 'ok');
  } finally {
    delete Object.prototype.client;
    delete Object.prototype.escape;
    delete global.__ejsPrototypePollutionExecuted;
  }
});

test('lodash set rejects prototype pollution through __proto__ paths', () => {
  // GHSA-fvqr-27wr-82fm and related lodash prototype-pollution advisories.
  try {
    _.set({}, '__proto__.pollutedByLodash', 'yes');

    assert.strictEqual(
      {}.pollutedByLodash,
      undefined,
      'lodash must not write attacker-controlled values onto Object.prototype'
    );
    assert.strictEqual(_.sumBy([{ count: 2 }, { count: 3 }], 'count'), 5);
  } finally {
    delete Object.prototype.pollutedByLodash;
  }
});

test('minimist rejects prototype pollution through parsed CLI arguments', () => {
  // GHSA-vh95-rmgr-6w4m / CVE-2020-7598: parsed CLI flags must not mutate
  // Object.prototype via __proto__ paths.
  try {
    const parsed = minimist(['--port=3000', '--__proto__.pollutedByMinimist=yes']);

    assert.strictEqual(
      {}.pollutedByMinimist,
      undefined,
      'minimist must not write parsed attacker flags onto Object.prototype'
    );
    assert.strictEqual(parsed.port, 3000);
  } finally {
    delete Object.prototype.pollutedByMinimist;
  }
});
