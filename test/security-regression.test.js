'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lockfile = require('../package-lock.json');
const _ = require('lodash');
const minimist = require('minimist');

function versionParts(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function atLeast(actual, minimum) {
  const actualParts = versionParts(actual);
  const minimumParts = versionParts(minimum);
  for (let i = 0; i < Math.max(actualParts.length, minimumParts.length); i += 1) {
    const left = actualParts[i] || 0;
    const right = minimumParts[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
}

function packageVersion(packageName) {
  const packageKey = `node_modules/${packageName}`;
  return lockfile.packages[packageKey] && lockfile.packages[packageKey].version;
}

function prototypePollutionValue(action) {
  delete Object.prototype.axiomSecurityProbe;
  let observed;
  try {
    action();
    observed = {}.axiomSecurityProbe;
  } finally {
    delete Object.prototype.axiomSecurityProbe;
  }
  return observed;
}

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep must not pollute Object.prototype', () => {
  const payload = JSON.parse(
    '{"constructor":{"prototype":{"axiomSecurityProbe":"polluted-by-lodash"}}}'
  );

  const observed = prototypePollutionValue(() => {
    _.defaultsDeep({}, payload);
  });

  assert.equal(
    observed,
    undefined,
    'lodash defaultsDeep accepted constructor.prototype input and polluted Object.prototype'
  );
});

test('GHSA-xvch-5gv4-984h: minimist argv parsing must not pollute Object.prototype', async (t) => {
  const cases = [
    {
      name: '__proto__ dotted path',
      argv: ['--__proto__.axiomSecurityProbe=polluted-by-minimist'],
    },
    {
      name: 'constructor.prototype dotted path',
      argv: ['--constructor.prototype.axiomSecurityProbe=polluted-by-minimist'],
    },
  ];

  for (const { name, argv } of cases) {
    await t.test(name, () => {
      const observed = prototypePollutionValue(() => {
        minimist(argv);
      });

      assert.equal(
        observed,
        undefined,
        `minimist parsed ${argv.join(' ')} into Object.prototype pollution`
      );
    });
  }
});

test('high and critical npm audit families resolve outside known vulnerable ranges', () => {
  const boundaries = [
    {
      packageName: 'ejs',
      minimum: '3.1.7',
      advisory: 'GHSA-phwq-j96m-2c2q',
      required: true,
    },
    {
      packageName: 'lodash',
      minimum: '4.18.1',
      advisory: 'GHSA-jf85-cpcp-j695/GHSA-r5fr-rjxr-66jc',
      required: true,
    },
    {
      packageName: 'minimist',
      minimum: '1.2.6',
      advisory: 'GHSA-xvch-5gv4-984h',
      required: true,
    },
    {
      packageName: 'axios',
      minimum: '0.31.2',
      advisory: 'GHSA-pjwm-pj3p-43mv and related high-severity axios advisories',
      required: true,
    },
    {
      packageName: 'express',
      minimum: '4.22.2',
      advisory: 'inherited high-severity express dependency advisories',
      required: true,
    },
    {
      packageName: 'body-parser',
      minimum: '1.20.4',
      advisory: 'GHSA-qwcr-r2fm-qrc7',
      required: false,
    },
    {
      packageName: 'path-to-regexp',
      minimum: '0.1.13',
      advisory: 'GHSA-rhx6-c78j-4q9w/GHSA-9wv6-86v2-598j/GHSA-37ch-88jc-xwx2',
      required: false,
    },
  ];

  const unresolved = boundaries.flatMap(({ packageName, minimum, advisory, required }) => {
    const actual = packageVersion(packageName);
    if (!actual) {
      return required ? [`${packageName} is missing from package-lock.json`] : [];
    }
    if (!atLeast(actual, minimum)) {
      return [`${packageName}@${actual} is still below ${minimum} for ${advisory}`];
    }
    return [];
  });

  assert.deepEqual(unresolved, [], 'critical/high audit findings remain in the lockfile');
});
