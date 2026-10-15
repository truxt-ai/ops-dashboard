'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

function installedVersion(packageName) {
  return require(`${packageName}/package.json`).version;
}

function compareVersions(left, right) {
  const normalize = (version) => String(version)
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);

  const a = normalize(left);
  const b = normalize(right);

  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] > b[i] ? 1 : -1;
    }
  }

  return 0;
}

function assertVersionAtLeast(packageName, safeVersion, advisories) {
  const actual = installedVersion(packageName);

  assert.ok(
    compareVersions(actual, safeVersion) >= 0,
    `${packageName}@${actual} is still inside the audited vulnerable boundary for ${advisories}; expected >= ${safeVersion}`,
  );
}

test('critical dependency versions resolve outside audited vulnerable ranges', () => {
  assertVersionAtLeast('ejs', '3.1.10', 'GHSA-phwq-j96m-2c2q / GHSA-ghr5-ch3p-vcr6');
  assertVersionAtLeast('lodash', '4.17.24', 'GHSA-jf85-cpcp-j695 and related lodash advisories');
  assertVersionAtLeast('minimist', '1.2.6', 'GHSA-vh95-rmgr-6w4m / GHSA-xvch-5gv4-984h');
});

test('GHSA-phwq-j96m-2c2q: ejs client escape option cannot execute injected code', () => {
  assert.strictEqual(ejs.render('<%= name %>', { name: '<ops>' }), '&lt;ops&gt;');

  delete global.__rau305EjsInjected;

  try {
    try {
      ejs.render('<%= name %>', { name: 'ops' }, {
        client: true,
        compileDebug: false,
        escape: '1;global.__rau305EjsInjected=true;',
      });
    } catch (err) {
      assert.match(
        err.message,
        /escape|function|identifier|invalid|option/i,
        'safe EJS versions may reject the malicious option, but should do so as an option/escape validation failure',
      );
    }

    assert.strictEqual(
      global.__rau305EjsInjected,
      undefined,
      'EJS executed attacker-controlled code from the escape option before rejecting the render',
    );
  } finally {
    delete global.__rau305EjsInjected;
  }
});

test('GHSA-jf85-cpcp-j695: lodash merge blocks constructor.prototype pollution', () => {
  assert.deepStrictEqual(
    lodash.merge({ service: { requests: 1 } }, { service: { errors: 0 } }),
    { service: { requests: 1, errors: 0 } },
  );

  const marker = '__rau305LodashPolluted';
  delete Object.prototype[marker];

  try {
    const payload = JSON.parse(`{"constructor":{"prototype":{"${marker}":"polluted"}}}`);

    lodash.merge({}, payload);

    assert.strictEqual(
      ({})[marker],
      undefined,
      'lodash.merge polluted Object.prototype through a constructor.prototype payload',
    );
  } finally {
    delete Object.prototype[marker];
  }
});

test('GHSA-xvch-5gv4-984h: minimist blocks __proto__ argument pollution', () => {
  const parsed = minimist(['--service', 'api', '--retries', '2']);
  assert.strictEqual(parsed.service, 'api');
  assert.strictEqual(parsed.retries, 2);

  const marker = '__rau305MinimistPolluted';
  delete Object.prototype[marker];

  try {
    minimist([`--__proto__.${marker}=polluted`]);

    assert.strictEqual(
      ({})[marker],
      undefined,
      'minimist polluted Object.prototype through a __proto__ CLI argument',
    );
  } finally {
    delete Object.prototype[marker];
  }
});
