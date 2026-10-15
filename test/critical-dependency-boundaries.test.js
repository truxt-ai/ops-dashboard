'use strict';

const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');

const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

const PATCH_FLOORS = [
  {
    packageName: 'ejs',
    minimumVersion: '3.1.10',
    advisories: 'GHSA-phwq-j96m-2c2q, GHSA-ghr5-ch3p-vcr6'
  },
  {
    packageName: 'lodash',
    minimumVersion: '4.18.1',
    advisories: 'GHSA-jf85-cpcp-j695, GHSA-r5fr-rjxr-66jc'
  },
  {
    packageName: 'minimist',
    minimumVersion: '1.2.8',
    advisories: 'GHSA-vh95-rmgr-6w4m, GHSA-xvch-5gv4-984h'
  }
];

function packageVersion(packageName) {
  return require(`${packageName}/package.json`).version;
}

function compareVersions(a, b) {
  const left = a.split('.').map((part) => Number.parseInt(part, 10));
  const right = b.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const leftPart = Number.isNaN(left[i]) ? 0 : left[i] || 0;
    const rightPart = Number.isNaN(right[i]) ? 0 : right[i] || 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function clearPollution() {
  delete Object.prototype.opsDashboardPolluted;
  delete Object.prototype.opsDashboardAdmin;
  delete globalThis.__opsDashboardEjsInjection;
}

afterEach(clearPollution);

test('critical direct dependencies resolve outside the RAU-316 vulnerable ranges', () => {
  for (const patch of PATCH_FLOORS) {
    const actualVersion = packageVersion(patch.packageName);

    assert.ok(
      compareVersions(actualVersion, patch.minimumVersion) >= 0,
      `${patch.packageName}@${actualVersion} must be >= ${patch.minimumVersion} for ${patch.advisories}`
    );
  }
});

test('GHSA-phwq-j96m-2c2q: ejs rejects localsName template injection before code runs', () => {
  clearPollution();

  let renderError;

  try {
    ejs.render('dashboard', {}, {
      localsName: 'locals = (globalThis.__opsDashboardEjsInjection = true)'
    });
  }
  catch (err) {
    renderError = err;
  }

  try {
    assert.strictEqual(
      globalThis.__opsDashboardEjsInjection,
      undefined,
      'EJS must not execute code injected through the localsName option'
    );
    assert.ok(renderError, 'EJS must reject a non-identifier localsName option');
  }
  finally {
    clearPollution();
  }
});

test('GHSA-jf85-cpcp-j695: lodash prototype-pollution APIs leave Object.prototype clean', async (t) => {
  const cases = [
    {
      name: 'merge blocks __proto__ object payloads',
      exercise: () => lodash.merge({}, JSON.parse('{"__proto__":{"opsDashboardAdmin":true}}')),
      property: 'opsDashboardAdmin'
    },
    {
      name: 'zipObjectDeep blocks __proto__ path payloads',
      exercise: () => lodash.zipObjectDeep(['__proto__.opsDashboardPolluted'], ['yes']),
      property: 'opsDashboardPolluted'
    },
    {
      name: 'set blocks __proto__ path payloads',
      exercise: () => lodash.set({}, '__proto__.opsDashboardPolluted', 'yes'),
      property: 'opsDashboardPolluted'
    }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      clearPollution();
      testCase.exercise();

      try {
        assert.strictEqual(
          ({})[testCase.property],
          undefined,
          `Object.prototype.${testCase.property} must remain undefined`
        );
      }
      finally {
        clearPollution();
      }
    });
  }
});

test('GHSA-xvch-5gv4-984h: minimist argv parsing ignores prototype pollution keys', async (t) => {
  const cases = [
    {
      name: 'blocks dotted __proto__ argv keys',
      argv: ['--__proto__.opsDashboardPolluted=yes'],
      property: 'opsDashboardPolluted'
    },
    {
      name: 'blocks constructor.prototype argv keys',
      argv: ['--constructor.prototype.opsDashboardPolluted=yes'],
      property: 'opsDashboardPolluted'
    }
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      clearPollution();
      minimist(testCase.argv);

      try {
        assert.strictEqual(
          ({})[testCase.property],
          undefined,
          `Object.prototype.${testCase.property} must remain undefined`
        );
      }
      finally {
        clearPollution();
      }
    });
  }
});
