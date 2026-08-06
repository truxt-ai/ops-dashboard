'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

function deleteOwnPrototypeMarker(marker) {
  delete Object.prototype[marker];
}

function assertPrototypeUnchanged(marker, exercise) {
  deleteOwnPrototypeMarker(marker);
  try {
    exercise();
    assert.strictEqual(
      Object.prototype[marker],
      undefined,
      `${marker} must not be written to Object.prototype`
    );
    assert.strictEqual({}[marker], undefined, `${marker} must not be inherited by plain objects`);
  } finally {
    deleteOwnPrototypeMarker(marker);
  }
}

const cases = [
  {
    name: 'GHSA-phwq-j96m-2c2q: EJS rejects localsName template-option code injection',
    run() {
      assert.strictEqual(ejs.render('<%= service %>', { service: 'api-gateway' }), 'api-gateway');

      const marker = '__atlEjsTemplateInjection';
      delete global[marker];
      try {
        try {
          ejs.compile('safe', {
            localsName: `locals=global.${marker}="executed"`,
          })({});
        } catch (err) {
          assert.match(String(err.message), /localsName|identifier|compil/i);
        }

        assert.strictEqual(global[marker], undefined, 'malicious localsName must not execute JS');
      } finally {
        delete global[marker];
      }
    },
  },
  {
    name: 'GHSA-jf85-cpcp-j695: lodash defaultsDeep blocks constructor.prototype pollution',
    run() {
      assert.deepStrictEqual(
        _.defaultsDeep({ service: { errors: 0 } }, { service: { requests: 18420, errors: 12 } }),
        { service: { errors: 0, requests: 18420 } }
      );

      assertPrototypeUnchanged('__atlLodashPolluted', () => {
        _.defaultsDeep(
          {},
          JSON.parse('{"constructor":{"prototype":{"__atlLodashPolluted":"polluted"}}}')
        );
      });
    },
  },
  {
    name: 'GHSA-xvch-5gv4-984h: minimist blocks prototype pollution argv payloads',
    run() {
      assert.deepStrictEqual(minimist(['--port', '4000', '--verbose']), {
        _: [],
        port: 4000,
        verbose: true,
      });

      for (const payload of [
        '--__proto__.__atlMinimistPolluted=polluted',
        '--constructor.prototype.__atlMinimistPolluted=polluted',
      ]) {
        assertPrototypeUnchanged('__atlMinimistPolluted', () => {
          minimist([payload]);
        });
      }
    },
  },
];

for (const c of cases) {
  test(c.name, c.run);
}
