'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const minimist = require('minimist');
const lodash = require('lodash');

function clearObjectPrototypeKey(key) {
  delete Object.prototype[key];
}

const prototypePollutionCases = [
  {
    name: 'GHSA-xvch-5gv4-984h minimist blocks __proto__ argument prototype pollution',
    key: '__axiom_minimist_polluted__',
    exploit: (key) => minimist([`--__proto__.${key}=polluted`]),
    assertNormalBehavior: () => {
      assert.deepEqual(minimist(['--service=dashboard', '--retries=2']), {
        _: [],
        service: 'dashboard',
        retries: 2
      });
    }
  },
  {
    name: 'GHSA-jf85-cpcp-j695 lodash merge blocks __proto__ prototype pollution',
    key: '__axiom_lodash_merge_polluted__',
    exploit: (key) => {
      lodash.merge({}, JSON.parse(`{"__proto__":{"${key}":"polluted"}}`));
    },
    assertNormalBehavior: () => {
      assert.deepEqual(
        lodash.merge({ service: { name: 'dashboard' } }, { service: { status: 'ok' } }),
        { service: { name: 'dashboard', status: 'ok' } }
      );
    }
  }
];

for (const tc of prototypePollutionCases) {
  test(tc.name, () => {
    clearObjectPrototypeKey(tc.key);

    try {
      tc.exploit(tc.key);
      assert.equal(
        ({})[tc.key],
        undefined,
        `${tc.name}: malicious dependency input must not write to Object.prototype`
      );
      tc.assertNormalBehavior();
    } finally {
      clearObjectPrototypeKey(tc.key);
    }
  });
}

test('GHSA-r5fr-rjxr-66jc lodash template rejects executable imports key names', () => {
  const marker = '__axiom_lodash_template_injected__';
  global[marker] = false;

  try {
    try {
      lodash.template('safe template', {
        imports: {
          [`x = (global[${JSON.stringify(marker)}] = true)`]: undefined
        }
      });
    } catch (err) {
      assert.match(
        String(err && err.message),
        /import|identifier|argument|template|Unexpected|invalid/i,
        'patched lodash may reject the malicious imports key before compilation'
      );
    }

    assert.equal(
      global[marker],
      false,
      'GHSA-r5fr-rjxr-66jc: malicious lodash.template imports key must not execute'
    );

    const compiled = lodash.template('<%= upper(service) %>', {
      imports: {
        upper: (value) => value.toUpperCase()
      }
    });
    assert.equal(compiled({ service: 'dashboard' }), 'DASHBOARD');
  } finally {
    delete global[marker];
  }
});
