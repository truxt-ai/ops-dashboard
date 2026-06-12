'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

function withCleanPrototype(prop, run) {
  delete Object.prototype[prop];
  try {
    return run();
  } finally {
    delete Object.prototype[prop];
  }
}

test('GHSA-phwq-j96m-2c2q: ejs template options must not execute attacker-controlled JavaScript', () => {
  const sentinel = '__rauEjsTemplateInjected';
  delete global[sentinel];

  try {
    const render = ejs.compile('safe', {
      client: true,
      localsName: `locals = (global.${sentinel} = true)`,
    });
    render();
  } catch (_err) {
    // Patched EJS rejects the malicious option before generated code can run.
  }

  const executed = global[sentinel] === true;
  delete global[sentinel];

  assert.equal(executed, false);
});

test('GHSA-jf85-cpcp-j695: lodash merge must not pollute Object.prototype through __proto__', () => {
  const polluted = withCleanPrototype('__rauLodashPolluted', () => {
    lodash.merge(
      {},
      JSON.parse('{"__proto__":{"__rauLodashPolluted":"yes"}}')
    );
    return {}.__rauLodashPolluted;
  });

  assert.equal(polluted, undefined);
});

test('GHSA-xvch-5gv4-984h: minimist must not pollute Object.prototype through __proto__ args', () => {
  const polluted = withCleanPrototype('__rauMinimistPolluted', () => {
    minimist(['--__proto__.__rauMinimistPolluted=yes']);
    return {}.__rauMinimistPolluted;
  });

  assert.equal(polluted, undefined);
});
