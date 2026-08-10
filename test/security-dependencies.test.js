'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const minimist = require('minimist');
const _ = require('lodash');
const lockfile = require('../package-lock.json');

function resolvedVersion(packageName) {
  return lockfile.packages[`node_modules/${packageName}`]?.version;
}

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split('.').map((part) => Number.parseInt(part, 10));
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < Math.max(actualParts.length, minimumParts.length); i += 1) {
    const actualPart = actualParts[i] || 0;
    const minimumPart = minimumParts[i] || 0;
    if (actualPart > minimumPart) {
      return true;
    }
    if (actualPart < minimumPart) {
      return false;
    }
  }
  return true;
}

function assertLockfileResolution(packageName, minimumVersion) {
  const actual = resolvedVersion(packageName);
  assert.ok(actual, `${packageName} must resolve in package-lock.json`);
  assert.ok(
    versionAtLeast(actual, minimumVersion),
    `${packageName} must resolve to >= ${minimumVersion}; package-lock.json has ${actual}`,
  );
}

test('GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype from __proto__ args', () => {
  // Dependency-boundary RED proof for minimist prototype pollution.
  delete Object.prototype.minimistPolluted;

  minimist(['--__proto__.minimistPolluted', 'owned']);
  const pollutedValue = {}.minimistPolluted;

  delete Object.prototype.minimistPolluted;

  assert.strictEqual(
    pollutedValue,
    undefined,
    'untrusted CLI args must not create properties on Object.prototype',
  );
  assertLockfileResolution('minimist', '1.2.8');
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep does not merge __proto__ into Object.prototype', () => {
  // Dependency-boundary RED proof for lodash prototype pollution.
  delete Object.prototype.lodashPolluted;

  _.defaultsDeep({}, JSON.parse('{"__proto__":{"lodashPolluted":"owned"}}'));
  const pollutedValue = {}.lodashPolluted;

  delete Object.prototype.lodashPolluted;

  assert.strictEqual(
    pollutedValue,
    undefined,
    'untrusted objects must not be able to pollute Object.prototype through lodash defaultsDeep',
  );
  assertLockfileResolution('lodash', '4.18.1');
});
