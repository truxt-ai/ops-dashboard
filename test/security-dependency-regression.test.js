'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const _ = require('lodash');
const minimist = require('minimist');

const cases = [
  {
    name: 'GHSA-phwq-j96m-2c2q rejects EJS client escape template injection',
    run() {
      assert.equal(ejs.render('service: <%= name %>', { name: 'api' }), 'service: api');

      const marker = '__ejsTemplateInjectionProof';
      delete globalThis[marker];

      try {
        try {
          ejs.render('safe', {}, {
            client: true,
            escape: `false;globalThis.${marker}=true;//`,
          });
        } catch (_err) {
          // Rejection is safe as long as the injected source never executes.
        }

        assert.equal(
          globalThis[marker],
          undefined,
          'EJS must not compile attacker-controlled escape option source'
        );
      } finally {
        delete globalThis[marker];
      }
    },
  },
  {
    name: 'GHSA-jf85-cpcp-j695 blocks lodash defaultsDeep prototype pollution',
    run() {
      assert.deepEqual(
        _.defaultsDeep({ nested: {} }, { nested: { value: 42 } }),
        { nested: { value: 42 } }
      );

      const key = '__lodashPollutionProof';
      delete Object.prototype[key];

      try {
        _.defaultsDeep(
          {},
          JSON.parse(`{"constructor":{"prototype":{"${key}":"polluted"}}}`)
        );

        assert.equal(
          {}[key],
          undefined,
          'lodash must not copy constructor.prototype payloads onto Object.prototype'
        );
      } finally {
        delete Object.prototype[key];
      }
    },
  },
  {
    name: 'GHSA-xvch-5gv4-984h blocks minimist __proto__ prototype pollution',
    run() {
      const parsed = minimist(['--port=3000', 'api']);
      assert.equal(parsed.port, 3000);
      assert.deepEqual(parsed._, ['api']);

      const key = '__minimistPollutionProof';
      delete Object.prototype[key];

      try {
        minimist([`--__proto__.${key}=polluted`]);

        assert.equal(
          {}[key],
          undefined,
          'minimist must not assign __proto__ payloads onto Object.prototype'
        );
      } finally {
        delete Object.prototype[key];
      }
    },
  },
];

for (const regressionCase of cases) {
  test(regressionCase.name, regressionCase.run);
}
