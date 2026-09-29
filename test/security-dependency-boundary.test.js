'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const minimist = require('minimist');
const _ = require('lodash');

const pollutionCases = [
  {
    name: 'minimist blocks GHSA-xvch-5gv4-984h prototype pollution via __proto__ argv path',
    property: '__minimistSecurityProbe',
    runExploit(property) {
      minimist([`--__proto__.${property}=polluted`]);
    },
  },
  {
    name: 'lodash blocks GHSA-jf85-cpcp-j695 prototype pollution via defaultsDeep source object',
    property: '__lodashSecurityProbe',
    runExploit(property) {
      const source = JSON.parse(`{"__proto__":{"${property}":"polluted"}}`);
      _.defaultsDeep({}, source);
    },
  },
];

for (const { name, property, runExploit } of pollutionCases) {
  test(name, () => {
    delete Object.prototype[property];

    try {
      runExploit(property);

      assert.strictEqual(
        Object.prototype[property],
        undefined,
        'dependency boundary must reject attacker-controlled prototype pollution payloads',
      );
      assert.strictEqual(
        {}[property],
        undefined,
        'new plain objects must not inherit attacker-controlled data',
      );
    } finally {
      delete Object.prototype[property];
    }
  });
}
