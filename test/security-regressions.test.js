'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const _ = require('lodash');
const minimist = require('minimist');

function withoutPrototypeMarker(marker, exercise) {
  delete Object.prototype[marker];
  try {
    exercise();
    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      `${marker} must not be written to Object.prototype`
    );
    assert.strictEqual({}[marker], undefined, `${marker} must not be inherited by plain objects`);
  } finally {
    delete Object.prototype[marker];
  }
}

test('GHSA-fvqr-27wr-82fm: lodash defaultsDeep treats constructor.prototype input as data', () => {
  const marker = 'atl511_lodash_defaults_deep_polluted';

  withoutPrototypeMarker(marker, () => {
    const untrusted = JSON.parse(`{"constructor":{"prototype":{"${marker}":"polluted"}}}`);

    _.defaultsDeep({}, untrusted);
  });
});

test('GHSA-vh95-rmgr-6w4m: minimist treats __proto__ arguments as data', () => {
  const marker = 'atl511_minimist_proto_polluted';

  withoutPrototypeMarker(marker, () => {
    const parsed = minimist([`--__proto__.${marker}=polluted`, '--port=3000']);

    assert.strictEqual(parsed.port, 3000, 'normal numeric argument parsing should still work');
  });
});

test('GHSA-xvch-5gv4-984h: minimist treats constructor.prototype arguments as data', () => {
  const marker = 'atl511_minimist_constructor_polluted';

  withoutPrototypeMarker(marker, () => {
    const parsed = minimist([`--constructor.prototype.${marker}=polluted`, '--port=3000']);

    assert.strictEqual(parsed.port, 3000, 'normal numeric argument parsing should still work');
  });
});
