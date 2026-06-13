'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const express = require('express');
const lodash = require('lodash');
const minimist = require('minimist');

function withCleanPrototype(key, fn) {
  delete Object.prototype[key];

  try {
    fn();
  } finally {
    delete Object.prototype[key];
  }
}

function captureExpressLocation(url) {
  const headers = {};
  const res = {
    req: {
      get: () => undefined
    },
    set(field, value) {
      headers[field] = value;
      return this;
    }
  };

  express.response.location.call(res, url);

  return headers.Location;
}

test('GHSA-jf85-cpcp-j695: lodash merge blocks __proto__ prototype pollution', () => {
  const pollutionKey = 'rau112LodashPolluted';

  withCleanPrototype(pollutionKey, () => {
    lodash.merge({}, JSON.parse(`{"__proto__":{"${pollutionKey}":"polluted"}}`));

    assert.strictEqual(
      Object.prototype[pollutionKey],
      undefined,
      'lodash.merge allowed attacker-controlled __proto__ data to pollute Object.prototype'
    );

    assert.deepStrictEqual(lodash.merge({ service: 'api' }, { requests: 12 }), {
      service: 'api',
      requests: 12
    });
  });
});

test('GHSA-xvch-5gv4-984h: minimist blocks dotted __proto__ prototype pollution', () => {
  const pollutionKey = 'rau112MinimistPolluted';

  withCleanPrototype(pollutionKey, () => {
    minimist([`--__proto__.${pollutionKey}`, 'polluted']);

    assert.strictEqual(
      Object.prototype[pollutionKey],
      undefined,
      'minimist allowed attacker-controlled argv to pollute Object.prototype'
    );

    assert.deepStrictEqual(minimist(['--port', '8080', 'serve'])._, ['serve']);
  });
});

test('GHSA-rv95-896h-c2vc: express res.location does not turn malformed allowlisted URLs into open redirects', () => {
  const attackerUrl = 'https://example.com\\@evil.example/steal-token';

  assert.strictEqual(
    new URL(attackerUrl).hostname,
    'example.com',
    'sanity check: a common allowlist sees the raw malformed URL as the trusted host'
  );

  const locationHeader = captureExpressLocation(attackerUrl);

  assert.strictEqual(
    new URL(locationHeader).hostname,
    'example.com',
    'res.location rewrote the malformed URL into a Location header whose host is attacker controlled'
  );

  assert.strictEqual(captureExpressLocation('/dashboard'), '/dashboard');
});
