'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function restorePrototypeProperty(name, hadOwnProperty, previousValue) {
  if (hadOwnProperty) {
    Object.prototype[name] = previousValue;
  } else {
    delete Object.prototype[name];
  }
}

test('EJS render ignores inherited client/escape options before template compilation', () => {
  // GHSA-phwq-j96m-2c2q / GHSA-ghr5-ch3p-vcr6: inherited render options must
  // not become generated client-template code.
  const marker = path.join(os.tmpdir(), `ops-dashboard-ejs-rce-${process.pid}-${Date.now()}`);
  const hadClient = Object.prototype.hasOwnProperty.call(Object.prototype, 'client');
  const previousClient = Object.prototype.client;
  const hadEscape = Object.prototype.hasOwnProperty.call(Object.prototype, 'escape');
  const previousEscape = Object.prototype.escape;
  let rendered;
  let payloadExecuted;

  try {
    Object.prototype.client = true;
    Object.prototype.escape =
      `false; process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(marker)}, 'pwned');`;

    rendered = ejs.render('safe dashboard', {});
    payloadExecuted = fs.existsSync(marker);
  } finally {
    restorePrototypeProperty('client', hadClient, previousClient);
    restorePrototypeProperty('escape', hadEscape, previousEscape);
    fs.rmSync(marker, { force: true });
  }

  assert.strictEqual(rendered, 'safe dashboard');
  assert.strictEqual(payloadExecuted, false, 'EJS executed code from polluted inherited render options');
});

test('lodash defaultsDeep rejects __proto__ prototype pollution payloads', () => {
  // GHSA-jf85-cpcp-j695: deep merge helpers must not mutate Object.prototype.
  const pollutedKey = `opsDashboardLodashPolluted${process.pid}`;
  delete Object.prototype[pollutedKey];

  try {
    _.defaultsDeep({}, JSON.parse(`{"__proto__":{"${pollutedKey}":"polluted"}}`));

    assert.strictEqual(
      Object.prototype[pollutedKey],
      undefined,
      'lodash polluted Object.prototype through defaultsDeep'
    );
    assert.strictEqual(({})[pollutedKey], undefined, 'new objects inherited lodash pollution');
  } finally {
    delete Object.prototype[pollutedKey];
  }
});

test('minimist rejects __proto__ and constructor.prototype argv pollution payloads', () => {
  // GHSA-xvch-5gv4-984h: CLI argument parsing must treat prototype paths as data.
  const protoKey = `opsDashboardMinimistProto${process.pid}`;
  const ctorKey = `opsDashboardMinimistCtor${process.pid}`;
  delete Object.prototype[protoKey];
  delete Object.prototype[ctorKey];

  try {
    minimist([
      `--__proto__.${protoKey}=polluted`,
      `--constructor.prototype.${ctorKey}=polluted`,
    ]);

    assert.strictEqual(Object.prototype[protoKey], undefined, 'minimist polluted Object.prototype via __proto__');
    assert.strictEqual(({})[protoKey], undefined, 'new objects inherited minimist __proto__ pollution');
    assert.strictEqual(
      Object.prototype[ctorKey],
      undefined,
      'minimist polluted Object.prototype via constructor.prototype'
    );
    assert.strictEqual(({})[ctorKey], undefined, 'new objects inherited minimist constructor pollution');
  } finally {
    delete Object.prototype[protoKey];
    delete Object.prototype[ctorKey];
  }
});
