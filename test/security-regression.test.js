'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function parseVersion(version) {
  return String(version)
    .split('-')[0]
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
    .concat([0, 0, 0])
    .slice(0, 3);
}

function readLockfilePackageVersion(packageName) {
  const lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const packageInfo = lockfile.packages[`node_modules/${packageName}`];

  assert.ok(
    packageInfo,
    `package-lock.json should contain node_modules/${packageName}`
  );

  return packageInfo.version;
}

function readResolvedPackageVersion(packageName) {
  let currentDir = path.dirname(require.resolve(packageName));
  const { root } = path.parse(currentDir);

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageInfo = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8')
      );

      if (packageInfo.name === packageName) {
        return packageInfo.version;
      }
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Unable to find package.json for ${packageName}`);
}

function assertVersionAboveVulnerableRange({
  advisory,
  packageName,
  version,
  vulnerableThrough,
}) {
  assert.ok(
    compareVersions(version, vulnerableThrough) > 0,
    `${packageName}@${version} must be outside ${advisory} vulnerable range <=${vulnerableThrough}`
  );
}

function withObjectPrototypeProperties(properties, fn) {
  const previousDescriptors = new Map();

  for (const key of Object.keys(properties)) {
    previousDescriptors.set(
      key,
      Object.getOwnPropertyDescriptor(Object.prototype, key)
    );
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      enumerable: false,
      value: properties[key],
      writable: true,
    });
  }

  try {
    return fn();
  } finally {
    for (const [key, descriptor] of previousDescriptors.entries()) {
      if (descriptor) {
        Object.defineProperty(Object.prototype, key, descriptor);
      } else {
        delete Object.prototype[key];
      }
    }
  }
}

test('GHSA-ghr5-ch3p-vcr6: ejs ignores inherited render options that replace escaping', () => {
  const injectedFlag = '__ATL443_EJS_ESCAPE_RAN__';
  delete globalThis[injectedFlag];

  try {
    const rendered = withObjectPrototypeProperties(
      {
        client: true,
        escape: {
          toString() {
            return `function escapeFn(markup) { globalThis.${injectedFlag} = true; return String(markup); }`;
          },
        },
      },
      () => ejs.render('<%= value %>', { value: '<script>alert(1)</script>' })
    );

    assert.strictEqual(
      rendered,
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      'ejs should keep default XML escaping when Object.prototype carries render options'
    );
    assert.strictEqual(
      globalThis[injectedFlag],
      undefined,
      'ejs should not execute an inherited escape function gadget'
    );
  } finally {
    delete globalThis[injectedFlag];
  }
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep does not merge __proto__ into Object.prototype', () => {
  const pollutionKey = 'atl443LodashPolluted';
  delete Object.prototype[pollutionKey];

  try {
    _.defaultsDeep(
      {},
      JSON.parse(`{"__proto__":{"${pollutionKey}":"polluted"}}`)
    );

    assert.strictEqual(
      {}[pollutionKey],
      undefined,
      'lodash should treat __proto__ as inert data during defaultsDeep merges'
    );
  } finally {
    delete Object.prototype[pollutionKey];
  }
});

test('GHSA-xvch-5gv4-984h: minimist does not parse __proto__ flags into Object.prototype', () => {
  const pollutionKey = 'atl443MinimistPolluted';
  delete Object.prototype[pollutionKey];

  try {
    minimist([`--__proto__.${pollutionKey}=polluted`]);

    assert.strictEqual(
      {}[pollutionKey],
      undefined,
      'minimist should reject __proto__ flag paths instead of mutating Object.prototype'
    );
  } finally {
    delete Object.prototype[pollutionKey];
  }
});

test('audited direct dependencies resolve outside vulnerable advisory ranges', () => {
  const advisories = [
    {
      advisory: 'GHSA-phwq-j96m-2c2q / GHSA-ghr5-ch3p-vcr6',
      packageName: 'ejs',
      vulnerableThrough: '3.1.9',
    },
    {
      advisory: 'GHSA-jf85-cpcp-j695 and related lodash advisories',
      packageName: 'lodash',
      vulnerableThrough: '4.17.23',
    },
    {
      advisory: 'GHSA-xvch-5gv4-984h',
      packageName: 'minimist',
      vulnerableThrough: '1.2.5',
    },
  ];

  for (const advisory of advisories) {
    assertVersionAboveVulnerableRange({
      ...advisory,
      version: readLockfilePackageVersion(advisory.packageName),
    });
    assertVersionAboveVulnerableRange({
      ...advisory,
      version: readResolvedPackageVersion(advisory.packageName),
    });
  }
});
