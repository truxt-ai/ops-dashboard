'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const minimist = require('minimist');
const _ = require('lodash');

function withTemporaryObjectPrototypeValue(property, value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, property);
  Object.defineProperty(Object.prototype, property, {
    configurable: true,
    writable: true,
    value,
  });

  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(Object.prototype, property, descriptor);
    } else {
      Reflect.deleteProperty(Object.prototype, property);
    }
  }
}

test('GHSA-ghr5-ch3p-vcr6: ejs ignores inherited escape options from polluted prototypes', () => {
  const marker = '__ejsPollutedEscapeInvoked';
  Reflect.deleteProperty(global, marker);

  try {
    withTemporaryObjectPrototypeValue('escape', () => {
      global[marker] = true;
      return 'polluted-output';
    }, () => {
      const output = ejs.render('<%= "safe" %>', {});

      assert.equal(global[marker], undefined);
      assert.equal(output, 'safe');
    });
  } finally {
    Reflect.deleteProperty(global, marker);
  }
});

test('GHSA-vh95-rmgr-6w4m/GHSA-xvch-5gv4-984h: minimist blocks __proto__ prototype pollution', () => {
  assert.equal(minimist(['--port=3000']).port, 3000);

  const property = '__minimistPolluted';
  Reflect.deleteProperty(Object.prototype, property);

  try {
    minimist([`--__proto__.${property}=owned`]);

    assert.equal({}[property], undefined);
  } finally {
    Reflect.deleteProperty(Object.prototype, property);
  }
});

test('GHSA-jf85-cpcp-j695/GHSA-fvqr-27wr-82fm: lodash defaultsDeep blocks constructor prototype pollution', () => {
  assert.deepEqual(
    _.defaultsDeep({ service: { status: 'ok' } }, { service: { latencyMs: 12 } }),
    { service: { status: 'ok', latencyMs: 12 } },
  );

  const property = '__lodashPolluted';
  Reflect.deleteProperty(Object.prototype, property);

  try {
    _.defaultsDeep({}, {
      constructor: {
        prototype: {
          [property]: 'owned',
        },
      },
    });

    assert.equal({}[property], undefined);
  } finally {
    Reflect.deleteProperty(Object.prototype, property);
  }
});
