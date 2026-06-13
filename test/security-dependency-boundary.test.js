'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

test('GHSA-phwq-j96m-2c2q: ejs does not execute JavaScript from untrusted client-mode options', () => {
  const marker = `__ejs_injected_${process.pid}_${Date.now()}`;
  let observed;

  delete global[marker];
  try {
    const render = ejs.compile('safe', {
      client: true,
      escape: `false; global.${marker} = 'executed'; function escapeFn() {}`,
    });
    render({});
    observed = global[marker];
  } finally {
    delete global[marker];
  }

  assert.strictEqual(
    observed,
    undefined,
    'malicious EJS options must be rejected or treated as inert data'
  );
  assert.strictEqual(ejs.render('<%= name %>', { name: 'dashboard' }), 'dashboard');
});

test('GHSA-jf85-cpcp-j695: lodash defaultsDeep does not write attacker data to Object.prototype', () => {
  const marker = `__lodash_polluted_${process.pid}_${Date.now()}`;
  let observed;

  delete Object.prototype[marker];
  try {
    _.defaultsDeep(
      {},
      JSON.parse(`{"constructor":{"prototype":{"${marker}":"polluted"}}}`)
    );
    observed = {}[marker];
  } finally {
    delete Object.prototype[marker];
  }

  assert.strictEqual(
    observed,
    undefined,
    'constructor.prototype payloads must not pollute Object.prototype'
  );
  assert.deepStrictEqual(
    _.defaultsDeep({ service: { status: 'ok' } }, { service: { status: 'bad', region: 'us' } }),
    { service: { status: 'ok', region: 'us' } }
  );
});

test('GHSA-xvch-5gv4-984h: minimist does not assign parsed args into object prototypes', () => {
  const payloads = [
    { name: '__proto__ path', arg: (marker) => `--__proto__.${marker}=polluted` },
    { name: 'constructor.prototype path', arg: (marker) => `--constructor.prototype.${marker}=polluted` },
  ];

  const polluted = payloads.flatMap(({ name, arg }) => {
    const marker = `__minimist_polluted_${process.pid}_${Date.now()}_${name.replace(/\W/g, '_')}`;
    let observed;

    delete Object.prototype[marker];
    try {
      minimist([arg(marker)]);
      observed = {}[marker];
    } finally {
      delete Object.prototype[marker];
    }

    return observed === undefined ? [] : [`${name}: ${observed}`];
  });

  assert.deepStrictEqual(
    polluted,
    [],
    'prototype pollution payloads must not create inherited properties on plain objects'
  );
  assert.deepStrictEqual(minimist(['--port', '3000', 'worker']), { _: ['worker'], port: 3000 });
});

