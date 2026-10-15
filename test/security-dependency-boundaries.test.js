'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
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
    assert.strictEqual(
      ({})[marker],
      undefined,
      `${marker} must not appear on fresh objects`
    );
  } finally {
    delete Object.prototype[marker];
  }
}

const cases = [
  {
    name: 'GHSA-phwq-j96m-2c2q / CVE-2022-29078: ejs compile options stay inert',
    run() {
      delete global.__axiomEjsTemplateInjection;
      try {
        ejs.render('ok', {}, {
          localsName: 'locals = (global.__axiomEjsTemplateInjection = true, {})',
        });

        assert.strictEqual(
          global.__axiomEjsTemplateInjection,
          undefined,
          'malicious EJS option must not execute during template compilation'
        );
      } finally {
        delete global.__axiomEjsTemplateInjection;
      }
    },
  },
  {
    name: 'GHSA-jf85-cpcp-j695: lodash defaultsDeep blocks __proto__ pollution',
    run() {
      withoutPrototypeMarker('axiomLodashPolluted', () => {
        _.defaultsDeep(
          {},
          JSON.parse('{"__proto__":{"axiomLodashPolluted":"polluted"}}')
        );
      });
    },
  },
  {
    name: 'GHSA-xvch-5gv4-984h: minimist blocks __proto__ argument pollution',
    run() {
      withoutPrototypeMarker('axiomMinimistPolluted', () => {
        minimist(['--__proto__.axiomMinimistPolluted=polluted']);
      });
    },
  },
];

for (const tc of cases) {
  test(tc.name, tc.run);
}
