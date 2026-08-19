'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function withObjectPrototypeProperties(properties, fn) {
  const previousDescriptors = new Map();

  for (const key of Object.keys(properties)) {
    previousDescriptors.set(
      key,
      Object.getOwnPropertyDescriptor(Object.prototype, key)
    );
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      enumerable: false,
      value: properties[key],
      writable: true,
    });
  }

  try {
    return fn();
  } finally {
    for (const [key, descriptor] of previousDescriptors.entries()) {
      if (descriptor) {
        Object.defineProperty(Object.prototype, key, descriptor);
      } else {
        delete Object.prototype[key];
      }
    }
  }
}

test('GHSA-ghr5-ch3p-vcr6: ejs ignores inherited render options that replace escaping', () => {
  const injectedFlag = '__ATL443_EJS_ESCAPE_RAN__';
  delete globalThis[injectedFlag];

  try {
    const rendered = withObjectPrototypeProperties(
      {
        client: true,
        escape: {
          toString() {
            return `function escapeFn(markup) { globalThis.${injectedFlag} = true; return String(markup); }`;
          },
        },
      },
      () => ejs.render('<%= value %>', { value: '<script>alert(1)</script>' })
    );

    assert.strictEqual(
      rendered,
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      'ejs should keep default XML escaping when Object.prototype carries render options'
    );
    assert.strictEqual(
      globalThis[injectedFlag],
      undefined,
      'ejs should not execute an inherited escape function gadget'
    );
  } finally {
    delete globalThis[injectedFlag];
  }
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep does not merge __proto__ into Object.prototype', () => {
  const pollutionKey = 'atl443LodashPolluted';
  delete Object.prototype[pollutionKey];

  try {
    _.defaultsDeep(
      {},
      JSON.parse(`{"__proto__":{"${pollutionKey}":"polluted"}}`)
    );

    assert.strictEqual(
      {}[pollutionKey],
      undefined,
      'lodash should treat __proto__ as inert data during defaultsDeep merges'
    );
  } finally {
    delete Object.prototype[pollutionKey];
  }
});

test('GHSA-xvch-5gv4-984h: minimist does not parse __proto__ flags into Object.prototype', () => {
  const pollutionKey = 'atl443MinimistPolluted';
  delete Object.prototype[pollutionKey];

  try {
    minimist([`--__proto__.${pollutionKey}=polluted`]);

    assert.strictEqual(
      {}[pollutionKey],
      undefined,
      'minimist should reject __proto__ flag paths instead of mutating Object.prototype'
    );
  } finally {
    delete Object.prototype[pollutionKey];
  }
});

test('audited direct dependencies resolve to patched versions', () => {
  assert.deepStrictEqual(
    {
      ejs: require('ejs/package.json').version,
      lodash: require('lodash/package.json').version,
      minimist: require('minimist/package.json').version,
    },
    {
      ejs: '6.0.1',
      lodash: '4.18.1',
      minimist: '1.2.8',
    }
  );
});
