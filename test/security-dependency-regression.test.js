'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');
const lockfile = require('../package-lock.json');

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function withCleanObjectPrototype(keys, fn) {
  for (const key of keys) {
    delete Object.prototype[key];
  }

  try {
    fn();
  } finally {
    for (const key of keys) {
      delete Object.prototype[key];
    }
  }
}

function compareVersions(actual, minimum) {
  const actualParts = String(actual).split(/[.-]/);
  const minimumParts = String(minimum).split(/[.-]/);
  const length = Math.max(actualParts.length, minimumParts.length);

  for (let i = 0; i < length; i += 1) {
    const actualPart = Number.parseInt(actualParts[i] || '0', 10);
    const minimumPart = Number.parseInt(minimumParts[i] || '0', 10);

    if (actualPart > minimumPart) {
      return 1;
    }
    if (actualPart < minimumPart) {
      return -1;
    }
  }

  return 0;
}

test('GHSA-phwq-j96m-2c2q/GHSA-ghr5-ch3p-vcr6: EJS ignores polluted client escape options', () => {
  withCleanObjectPrototype(['client', 'escape'], () => {
    global.__ejsTemplateInjectionProof = 'clean';

    Object.prototype.client = true;
    Object.prototype.escape = {
      toString() {
        return 'function escapeXML(markup) { global.__ejsTemplateInjectionProof = "owned"; return markup; }';
      }
    };

    try {
      const render = ejs.compile('<%= value %>', {});
      const output = render({ value: '<script>alert(1)</script>' });

      assert.equal(
        global.__ejsTemplateInjectionProof,
        'clean',
        'polluted EJS escape option executed through client template compilation'
      );
      assert.equal(output, '&lt;script&gt;alert(1)&lt;/script&gt;');
    } finally {
      delete global.__ejsTemplateInjectionProof;
    }
  });
});

test('GHSA-fvqr-27wr-82fm/GHSA-4xc9-xhrj-v574: lodash defaultsDeep does not pollute Object.prototype', () => {
  withCleanObjectPrototype(['lodashPolluted'], () => {
    const merged = lodash.defaultsDeep(
      { service: { retries: 1 } },
      { service: { retries: 3, timeoutMs: 5000 } }
    );
    assert.deepEqual(merged, { service: { retries: 1, timeoutMs: 5000 } });

    const payload = JSON.parse('{"constructor":{"prototype":{"lodashPolluted":"owned"}}}');
    lodash.defaultsDeep({}, payload);

    assert.equal(
      hasOwn(Object.prototype, 'lodashPolluted'),
      false,
      'lodash wrote attacker-controlled data onto Object.prototype'
    );
    assert.equal({}.lodashPolluted, undefined);
  });
});

test('GHSA-vh95-rmgr-6w4m/GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype from dotted proto args', () => {
  withCleanObjectPrototype(['minimistPolluted'], () => {
    const argv = minimist(['serve', '--port', '3000']);
    assert.equal(argv.port, 3000);
    assert.deepEqual(argv._, ['serve']);

    minimist(['--__proto__.minimistPolluted=owned']);

    assert.equal(
      hasOwn(Object.prototype, 'minimistPolluted'),
      false,
      'minimist wrote attacker-controlled CLI data onto Object.prototype'
    );
    assert.equal({}.minimistPolluted, undefined);
  });
});

test('lockfile resolves patched direct critical dependency versions', () => {
  const expectedPatches = [
    {
      advisory: 'GHSA-phwq-j96m-2c2q/GHSA-ghr5-ch3p-vcr6',
      packagePath: 'node_modules/ejs',
      minimumVersion: '6.0.1'
    },
    {
      advisory: 'lodash critical advisories including GHSA-fvqr-27wr-82fm and GHSA-r5fr-rjxr-66jc',
      packagePath: 'node_modules/lodash',
      minimumVersion: '4.18.1'
    },
    {
      advisory: 'GHSA-vh95-rmgr-6w4m/GHSA-xvch-5gv4-984h',
      packagePath: 'node_modules/minimist',
      minimumVersion: '1.2.8'
    }
  ];

  const failures = expectedPatches
    .map(({ advisory, packagePath, minimumVersion }) => {
      const resolved = lockfile.packages[packagePath];
      if (!resolved) {
        return `${packagePath} missing for ${advisory}`;
      }
      if (compareVersions(resolved.version, minimumVersion) < 0) {
        return `${packagePath} resolved ${resolved.version}; expected >= ${minimumVersion} for ${advisory}`;
      }
      return null;
    })
    .filter(Boolean);

  assert.deepEqual(failures, []);
});
