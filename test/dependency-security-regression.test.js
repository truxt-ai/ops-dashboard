'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

const packageVersions = [
  {
    name: 'ejs',
    advisory: 'GHSA-ghr5-ch3p-vcr6 / GHSA-phwq-j96m-2c2q',
    installed: require('ejs/package.json').version,
    patched: '6.0.1',
  },
  {
    name: 'lodash',
    advisory: 'GHSA-jf85-cpcp-j695',
    installed: require('lodash/package.json').version,
    patched: '4.18.1',
  },
  {
    name: 'minimist',
    advisory: 'GHSA-xvch-5gv4-984h',
    installed: require('minimist/package.json').version,
    patched: '1.2.8',
  },
];

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  for (let i = 0; i < Math.max(actualParts.length, minimumParts.length); i += 1) {
    const actualPart = actualParts[i] || 0;
    const minimumPart = minimumParts[i] || 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }

  return true;
}

function clearPrototypeKey(key) {
  delete Object.prototype[key];
}

test('critical dependency versions resolve outside the vulnerable advisory ranges', () => {
  for (const pkg of packageVersions) {
    assert.ok(
      versionAtLeast(pkg.installed, pkg.patched),
      `${pkg.name} ${pkg.installed} is still below patched ${pkg.patched} for ${pkg.advisory}`,
    );
  }
});

test('EJS GHSA-ghr5-ch3p-vcr6 does not execute prototype-polluted client escape options', () => {
  const injectedKey = '__rau237EjsInjected';

  clearPrototypeKey('client');
  clearPrototypeKey('escape');
  delete global[injectedKey];

  try {
    Object.prototype.client = true;
    Object.prototype.escape =
      '(() => { global.__rau237EjsInjected = true; return function escape(value) { return value; }; })()';

    const output = ejs.render('<%= name %>', { name: 'safe' });

    assert.strictEqual(output, 'safe');
    assert.strictEqual(
      global[injectedKey],
      undefined,
      'EJS executed an inherited escape compiler option from Object.prototype',
    );
  } finally {
    clearPrototypeKey('client');
    clearPrototypeKey('escape');
    delete global[injectedKey];
  }
});

test('lodash GHSA-jf85-cpcp-j695 blocks __proto__ merge prototype pollution', () => {
  const pollutionKey = '__rau237LodashPolluted';
  const payload = JSON.parse(`{"__proto__":{"${pollutionKey}":"polluted"}}`);

  clearPrototypeKey(pollutionKey);

  try {
    lodash.merge({}, payload);

    assert.strictEqual(
      Object.prototype[pollutionKey],
      undefined,
      'lodash.merge polluted Object.prototype through a __proto__ payload',
    );
    assert.strictEqual({}[pollutionKey], undefined);
  } finally {
    clearPrototypeKey(pollutionKey);
  }
});

test('minimist GHSA-xvch-5gv4-984h blocks dotted __proto__ argument pollution', () => {
  const pollutionKey = '__rau237MinimistPolluted';

  clearPrototypeKey(pollutionKey);

  try {
    minimist([`--__proto__.${pollutionKey}=polluted`]);

    assert.strictEqual(
      Object.prototype[pollutionKey],
      undefined,
      'minimist polluted Object.prototype through a dotted __proto__ argument',
    );
    assert.strictEqual({}[pollutionKey], undefined);
  } finally {
    clearPrototypeKey(pollutionKey);
  }
});
