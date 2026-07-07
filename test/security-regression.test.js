'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const axiosModule = require('axios');
const _ = require('lodash');
const minimist = require('minimist');

const axios = axiosModule.default || axiosModule;

function assertDoesNotPolluteObjectPrototype(marker, exercise, context) {
  delete Object.prototype[marker];

  try {
    exercise();

    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      `${context}: ${marker} must not be written to Object.prototype`
    );
    assert.strictEqual({}[marker], undefined, `${context}: ${marker} must not appear on plain objects`);
  } finally {
    delete Object.prototype[marker];
  }
}

[
  {
    name: 'constructor.prototype path through defaultsDeep',
    marker: 'atlLodashDefaultsDeepPolluted',
    exercise() {
      _.defaultsDeep(
        {},
        JSON.parse('{"constructor":{"prototype":{"atlLodashDefaultsDeepPolluted":"owned"}}}')
      );
    },
  },
  {
    name: '__proto__ path through merge',
    marker: 'atlLodashMergePolluted',
    exercise() {
      _.merge({}, JSON.parse('{"__proto__":{"atlLodashMergePolluted":"owned"}}'));
    },
  },
].forEach(({ name, marker, exercise }) => {
  test(`lodash blocks prototype pollution payload: ${name} (GHSA-jf85-cpcp-j695)`, () => {
    assertDoesNotPolluteObjectPrototype(marker, exercise, name);
  });
});

[
  {
    name: '__proto__ dotted argument',
    marker: 'atlMinimistProtoPolluted',
    argv: ['--__proto__.atlMinimistProtoPolluted=owned'],
  },
  {
    name: 'constructor.prototype dotted argument',
    marker: 'atlMinimistConstructorPolluted',
    argv: ['--constructor.prototype.atlMinimistConstructorPolluted=owned'],
  },
].forEach(({ name, marker, argv }) => {
  test(`minimist blocks prototype pollution payload: ${name} (GHSA-xvch-5gv4-984h)`, () => {
    assertDoesNotPolluteObjectPrototype(marker, () => minimist(argv), name);
  });
});

test('axios honors trusted baseURL when absolute URLs are disabled (GHSA-jr5f-v2jv-69x6)', () => {
  const trustedBaseURL = 'https://ops.example.internal/api/';
  const attackerURL = 'http://169.254.169.254/latest/meta-data';

  const resolvedURL = axios.getUri({
    baseURL: trustedBaseURL,
    url: attackerURL,
    allowAbsoluteUrls: false,
  });

  assert.ok(
    resolvedURL.startsWith(trustedBaseURL),
    `absolute request target must stay under trusted baseURL, got ${resolvedURL}`
  );
  assert.notStrictEqual(
    resolvedURL,
    attackerURL,
    'attacker-controlled absolute URL must not override baseURL'
  );
});
