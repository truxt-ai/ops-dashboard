'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function withoutPrototypeProperty(name, exercise) {
  delete Object.prototype[name];
  let observed;
  try {
    observed = exercise();
  } finally {
    delete Object.prototype[name];
  }
  return observed;
}

test('GHSA-ghr5-ch3p-vcr6: EJS ignores polluted option prototypes', () => {
  delete Object.prototype.client;
  delete Object.prototype.escape;
  delete global.__atlEjsTemplateInjection;

  let executed = false;
  try {
    Object.prototype.client = true;
    Object.prototype.escape = 'false; global.__atlEjsTemplateInjection = true;';

    const render = ejs.compile('dependency boundary proof');
    render({});
    executed = global.__atlEjsTemplateInjection === true;
  } finally {
    delete Object.prototype.client;
    delete Object.prototype.escape;
    delete global.__atlEjsTemplateInjection;
  }

  assert.strictEqual(
    executed,
    false,
    'polluted EJS options must not be inherited into template compilation'
  );
});

test('GHSA-fvqr-27wr-82fm: lodash merge rejects __proto__ pollution payloads', () => {
  const polluted = withoutPrototypeProperty('atlLodashPolluted', () => {
    _.merge({}, JSON.parse('{"__proto__":{"atlLodashPolluted":"yes"}}'));
    return ({}).atlLodashPolluted;
  });

  assert.strictEqual(
    polluted,
    undefined,
    'lodash merge must not write attacker data onto Object.prototype'
  );
});

test('GHSA-vh95-rmgr-6w4m: minimist rejects __proto__ argument pollution', () => {
  const polluted = withoutPrototypeProperty('atlMinimistPolluted', () => {
    minimist(['--__proto__.atlMinimistPolluted', 'yes']);
    return ({}).atlMinimistPolluted;
  });

  assert.strictEqual(
    polluted,
    undefined,
    'minimist must not write attacker argv data onto Object.prototype'
  );
});
