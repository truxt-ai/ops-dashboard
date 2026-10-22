'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const _ = require('lodash');
const minimist = require('minimist');

function assertObjectPrototypeNotPolluted(marker, exercise) {
  delete Object.prototype[marker];

  try {
    exercise();

    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      `${marker} must not be written to Object.prototype`
    );
    assert.strictEqual(
      {}[marker],
      undefined,
      `${marker} must not be inherited by plain objects`
    );
  } finally {
    delete Object.prototype[marker];
  }
}

test('GHSA-fvqr-27wr-82fm: lodash defaultsDeep blocks constructor prototype pollution', () => {
  const marker = 'atl510_lodash_defaults_deep_polluted';

  assertObjectPrototypeNotPolluted(marker, () => {
    const payload = JSON.parse(`{"constructor":{"prototype":{"${marker}":"polluted"}}}`);

    _.defaultsDeep({}, payload);
  });
});

test('GHSA-vh95-rmgr-6w4m: minimist blocks __proto__ argument pollution', () => {
  const marker = 'atl510_minimist_proto_polluted';

  assertObjectPrototypeNotPolluted(marker, () => {
    const parsed = minimist([`--__proto__.${marker}=polluted`, '--port=3000']);

    assert.strictEqual(parsed.port, 3000, 'normal numeric port parsing must still work');
  });
});

test('GHSA-xvch-5gv4-984h: minimist blocks constructor prototype argument pollution', () => {
  const marker = 'atl510_minimist_constructor_polluted';

  assertObjectPrototypeNotPolluted(marker, () => {
    const parsed = minimist([`--constructor.prototype.${marker}=polluted`, '--port=3000']);

    assert.strictEqual(parsed.port, 3000, 'normal numeric port parsing must still work');
  });
});
