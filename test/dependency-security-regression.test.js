'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function withCleanPrototype(keys, fn) {
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

test('EJS ignores inherited render options from polluted prototypes (GHSA-ghr5-ch3p-vcr6)', () => {
  withCleanPrototype(['client', 'escape'], () => {
    let inheritedEscapeCalled = false;

    Object.prototype.client = true;
    Object.prototype.escape = function inheritedEscape(value) {
      inheritedEscapeCalled = true;
      return String(value);
    };

    const rendered = ejs.render('<%= name %>', { name: '<script>alert(1)</script>' });

    assert.strictEqual(
      inheritedEscapeCalled,
      false,
      'polluted Object.prototype.escape must not replace EJS built-in escaping'
    );
    assert.strictEqual(rendered, '&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

[
  {
    name: 'merge with __proto__ payload',
    advisory: 'GHSA-jf85-cpcp-j695',
    exploit: key => _.merge({}, JSON.parse(`{"__proto__":{"${key}":"owned"}}`))
  },
  {
    name: 'defaultsDeep with __proto__ payload',
    advisory: 'GHSA-jf85-cpcp-j695',
    exploit: key => _.defaultsDeep({}, JSON.parse(`{"__proto__":{"${key}":"owned"}}`))
  },
  {
    name: 'zipObjectDeep with __proto__ path',
    advisory: 'GHSA-f23m-r3pf-42rh',
    exploit: key => _.zipObjectDeep([`__proto__.${key}`], ['owned'])
  }
].forEach(({ name, advisory, exploit }) => {
  test(`lodash blocks prototype pollution through ${name} (${advisory})`, () => {
    const key = `__lodashPolluted_${name.replace(/[^a-z]/gi, '')}`;

    withCleanPrototype([key], () => {
      exploit(key);

      assert.strictEqual(
        ({}).hasOwnProperty(key),
        false,
        'new objects must not inherit attacker-controlled lodash payload keys'
      );
      assert.strictEqual(({})[key], undefined);
    });
  });
});

[
  {
    name: '__proto__ dotted option',
    advisory: 'GHSA-xvch-5gv4-984h',
    args: key => [`--__proto__.${key}=owned`]
  },
  {
    name: 'constructor.prototype dotted option',
    advisory: 'GHSA-vh95-rmgr-6w4m',
    args: key => [`--constructor.prototype.${key}=owned`]
  }
].forEach(({ name, advisory, args }) => {
  test(`minimist blocks prototype pollution through ${name} (${advisory})`, () => {
    const key = `__minimistPolluted_${name.replace(/[^a-z]/gi, '')}`;

    withCleanPrototype([key], () => {
      minimist(args(key));

      assert.strictEqual(
        ({}).hasOwnProperty(key),
        false,
        'new objects must not inherit attacker-controlled minimist payload keys'
      );
      assert.strictEqual(({})[key], undefined);
    });
  });
});
