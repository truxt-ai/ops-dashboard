'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function deleteObjectPrototypeKey(key) {
  delete Object.prototype[key];
}

test('GHSA-ghr5-ch3p-vcr6: ejs must ignore polluted inherited render options', () => {
  const globalFlag = '__axiomEjsPollutionExecuted';
  delete global[globalFlag];
  deleteObjectPrototypeKey('client');
  deleteObjectPrototypeKey('escape');

  Object.prototype.client = true;
  Object.prototype.escape = `function escapeFn(markup) { global.${globalFlag} = true; return markup; }`;

  let injected;
  try {
    const output = ejs.render('<%= name %>', { name: 'safe' });
    injected = global[globalFlag] === true;

    assert.equal(output, 'safe');
  } finally {
    deleteObjectPrototypeKey('client');
    deleteObjectPrototypeKey('escape');
    delete global[globalFlag];
  }

  assert.equal(
    injected,
    false,
    'EJS executed a polluted inherited escape function from Object.prototype'
  );
});

test('GHSA-jf85-cpcp-j695: lodash merge must not pollute Object.prototype', () => {
  const pollutionKey = '__axiomLodashPolluted';
  deleteObjectPrototypeKey(pollutionKey);

  let pollutedValue;
  try {
    _.merge({}, JSON.parse(`{"__proto__":{"${pollutionKey}":"owned"}}`));
    pollutedValue = {}[pollutionKey];
  } finally {
    deleteObjectPrototypeKey(pollutionKey);
  }

  assert.equal(
    pollutedValue,
    undefined,
    'lodash merge allowed a __proto__ payload to write to Object.prototype'
  );
});

test('GHSA-xvch-5gv4-984h: minimist argv parsing must not pollute Object.prototype', () => {
  const pollutionKey = '__axiomMinimistPolluted';
  deleteObjectPrototypeKey(pollutionKey);

  let pollutedValue;
  try {
    minimist([`--__proto__.${pollutionKey}=owned`]);
    pollutedValue = {}[pollutionKey];
  } finally {
    deleteObjectPrototypeKey(pollutionKey);
  }

  assert.equal(
    pollutedValue,
    undefined,
    'minimist allowed a __proto__ argv payload to write to Object.prototype'
  );
});
