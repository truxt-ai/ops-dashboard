'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const minimist = require('minimist');
const _ = require('lodash');

function clearPrototypeMarker(marker) {
  delete Object.prototype[marker];
}

test('GHSA-phwq-j96m-2c2q: ejs client escape option must not execute injected code', () => {
  const marker = '__atl338EjsTemplateInjection';
  delete global[marker];

  const injectedEscape = {
    toString() {
      return `function escapeFn(markup) { return markup; }; global.${marker} = true;`;
    }
  };

  try {
    const renderClientTemplate = ejs.compile('<%= value %>', {
      client: true,
      escape: injectedEscape
    });

    renderClientTemplate({ value: 'safe' });

    assert.strictEqual(
      global[marker],
      undefined,
      'untrusted ejs escape option source must be rejected or treated as inert data'
    );
  } finally {
    delete global[marker];
  }
});

test('GHSA-xvch-5gv4-984h: minimist must not allow __proto__ argument pollution', () => {
  const marker = '__atl338MinimistPolluted';
  clearPrototypeMarker(marker);

  try {
    minimist([`--__proto__.${marker}=polluted`]);

    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      'minimist must not write attacker-controlled values onto Object.prototype'
    );
    assert.strictEqual(
      ({})[marker],
      undefined,
      'fresh objects must not inherit minimist attacker-controlled values'
    );
  } finally {
    clearPrototypeMarker(marker);
  }
});

test('GHSA-jf85-cpcp-j695: lodash merge must not allow __proto__ payload pollution', () => {
  const marker = '__atl338LodashPolluted';
  clearPrototypeMarker(marker);

  try {
    _.merge({}, JSON.parse(`{"__proto__":{"${marker}":"polluted"}}`));

    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      'lodash merge must not copy attacker-controlled __proto__ payloads to Object.prototype'
    );
    assert.strictEqual(
      ({})[marker],
      undefined,
      'fresh objects must not inherit lodash attacker-controlled values'
    );
  } finally {
    clearPrototypeMarker(marker);
  }
});
