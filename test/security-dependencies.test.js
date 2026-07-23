'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const ejsPackage = require('ejs/package.json');
const _ = require('lodash');
const minimist = require('minimist');

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const leftPart = leftParts[i] || 0;
    const rightPart = rightParts[i] || 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function withoutPrototypeKeys(keys, fn) {
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

test('GHSA-phwq-j96m-2c2q: ejs resolves outside the outputFunctionName injection range', () => {
  assert.ok(
    compareVersions(ejsPackage.version, '3.1.7') >= 0,
    `ejs ${ejsPackage.version} is still in the vulnerable <3.1.7 range`
  );
});

test('GHSA-ghr5-ch3p-vcr6: ejs ignores polluted render options at the dependency boundary', () => {
  withoutPrototypeKeys(['client', 'escape'], () => {
    delete global.__axiomEjsInjected;

    Object.prototype.client = true;
    Object.prototype.escape = 'false;global.__axiomEjsInjected="executed";';

    let renderError;
    let rendered;
    try {
      rendered = ejs.render('<%= service %>', { service: 'ops-dashboard' });
    } catch (err) {
      renderError = err;
    }

    try {
      assert.strictEqual(
        global.__axiomEjsInjected,
        undefined,
        'inherited EJS options must not execute injected client-side template code'
      );
      assert.ifError(renderError);
      assert.strictEqual(rendered, 'ops-dashboard');
    } finally {
      delete global.__axiomEjsInjected;
    }
  });
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep blocks constructor prototype pollution', () => {
  withoutPrototypeKeys(['__axiomLodashPolluted'], () => {
    const payload = JSON.parse(
      '{"constructor":{"prototype":{"__axiomLodashPolluted":"polluted"}}}'
    );

    _.defaultsDeep({}, payload);

    assert.strictEqual(
      {}.__axiomLodashPolluted,
      undefined,
      'lodash must not merge constructor.prototype payloads into Object.prototype'
    );
  });
});

test('GHSA-xvch-5gv4-984h: minimist blocks __proto__ argument pollution', () => {
  withoutPrototypeKeys(['__axiomMinimistPolluted'], () => {
    minimist(['--__proto__.__axiomMinimistPolluted=polluted']);

    assert.strictEqual(
      {}.__axiomMinimistPolluted,
      undefined,
      'minimist must not assign parsed __proto__ arguments to Object.prototype'
    );
  });
});
