'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

function parseVersion(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function isAtLeastVersion(actual, minimum) {
  const actualParts = parseVersion(actual);
  const minimumParts = parseVersion(minimum);

  for (let i = 0; i < Math.max(actualParts.length, minimumParts.length); i += 1) {
    const actualPart = actualParts[i] || 0;
    const minimumPart = minimumParts[i] || 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }

  return true;
}

function assertPrototypeNotPolluted(advisory, propertyName, exerciseDependency) {
  delete Object.prototype[propertyName];

  try {
    assert.equal(Object.prototype[propertyName], undefined, `${advisory}: clean precondition`);

    exerciseDependency();

    assert.equal(
      Object.prototype[propertyName],
      undefined,
      `${advisory}: dependency input must not pollute Object.prototype.${propertyName}`
    );
    assert.equal(
      ({})[propertyName],
      undefined,
      `${advisory}: new plain objects must not inherit attacker-controlled data`
    );
  } finally {
    delete Object.prototype[propertyName];
  }
}

test('RAU-139 audit: direct critical dependencies resolve to patched versions', () => {
  [
    {
      packageName: 'ejs',
      actual: require('ejs/package.json').version,
      minimum: '3.1.7',
      advisory: 'GHSA-phwq-j96m-2c2q',
    },
    {
      packageName: 'lodash',
      actual: require('lodash/package.json').version,
      minimum: '4.18.1',
      advisory: 'GHSA-r5fr-rjxr-66jc / GHSA-jf85-cpcp-j695',
    },
    {
      packageName: 'minimist',
      actual: require('minimist/package.json').version,
      minimum: '1.2.8',
      advisory: 'GHSA-xvch-5gv4-984h',
    },
  ].forEach(({ packageName, actual, minimum, advisory }) => {
    assert.equal(
      isAtLeastVersion(actual, minimum),
      true,
      `${advisory}: ${packageName} resolved ${actual}, expected >= ${minimum}`
    );
  });
});

test('GHSA-phwq-j96m-2c2q: ejs rejects localsName template-code injection', () => {
  const injectionFlag = '__rauEjsLocalsNameExecuted';
  delete global[injectionFlag];

  let threw = false;

  try {
    try {
      ejs.render('<%= 42 %>', {}, {
        localsName: `locals = (global.${injectionFlag} = true, {})`,
      });
    } catch (error) {
      threw = true;
      assert.match(
        error.message,
        /localsName|identifier|argument|parameter|Unexpected/i,
        'invalid localsName should be rejected explicitly'
      );
    }

    assert.equal(
      global[injectionFlag],
      undefined,
      'attacker-controlled localsName code must not execute during template compilation'
    );
    assert.equal(threw, true, 'invalid localsName input must be rejected');
  } finally {
    delete global[injectionFlag];
  }
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep does not pollute Object.prototype', () => {
  const propertyName = '__rauLodashPolluted';

  assertPrototypeNotPolluted('GHSA-jf85-cpcp-j695', propertyName, () => {
    lodash.defaultsDeep(
      {},
      JSON.parse(`{"__proto__":{"${propertyName}":"polluted"}}`)
    );
  });
});

[
  {
    name: '__proto__ dotted path',
    args: ['--__proto__.__rauMinimistPolluted', 'polluted'],
  },
  {
    name: 'constructor.prototype dotted path',
    args: ['--constructor.prototype.__rauMinimistPolluted', 'polluted'],
  },
].forEach(({ name, args }) => {
  test(`GHSA-xvch-5gv4-984h: minimist rejects ${name} prototype pollution`, () => {
    assertPrototypeNotPolluted('GHSA-xvch-5gv4-984h', '__rauMinimistPolluted', () => {
      minimist(args);
    });
  });
});
