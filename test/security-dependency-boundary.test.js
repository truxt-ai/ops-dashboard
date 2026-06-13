'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const lodash = require('lodash');
const minimist = require('minimist');

const EJS_EXECUTION_FLAG = '__axiomEjsTemplateInjectionExecuted';
const LODASH_POLLUTION_KEY = '__axiomLodashPrototypePolluted';
const LODASH_TEMPLATE_FLAG = '__axiomLodashTemplateImportExecuted';
const MINIMIST_POLLUTION_KEY = '__axiomMinimistPrototypePolluted';

function clearPrototypePollution(...keys) {
  for (const key of keys) {
    delete Object.prototype[key];
  }
}

test('GHSA-phwq-j96m-2c2q: ejs client template options do not execute injected code', () => {
  delete global[EJS_EXECUTION_FLAG];

  try {
    assert.doesNotThrow(() => {
      ejs.render('healthy', {}, {
        client: true,
        escape: `false;global.${EJS_EXECUTION_FLAG}=true;false`,
      });
    });

    assert.equal(
      global[EJS_EXECUTION_FLAG],
      undefined,
      'ejs must treat attacker-controlled client escape options as inert data'
    );
  } finally {
    delete global[EJS_EXECUTION_FLAG];
  }
});

test('GHSA-jf85-cpcp-j695: lodash merge does not pollute Object.prototype via __proto__', () => {
  clearPrototypePollution(LODASH_POLLUTION_KEY);

  try {
    lodash.merge(
      {},
      JSON.parse(`{"__proto__":{"${LODASH_POLLUTION_KEY}":"owned"}}`)
    );

    assert.equal(
      {}[LODASH_POLLUTION_KEY],
      undefined,
      'lodash merge must not copy __proto__ payloads onto Object.prototype'
    );
  } finally {
    clearPrototypePollution(LODASH_POLLUTION_KEY);
  }
});

test('GHSA-r5fr-rjxr-66jc: lodash template import names cannot execute code', () => {
  delete global[LODASH_TEMPLATE_FLAG];

  try {
    let compiled;
    let rejected = false;

    try {
      compiled = lodash.template('healthy', {
        imports: {
          [`safeName=global.${LODASH_TEMPLATE_FLAG}=true`]: undefined,
        },
      });
    } catch (error) {
      rejected = true;
      assert.match(
        error.message,
        /imports|identifier|argument/i,
        'lodash should reject executable import names with a validation error'
      );
    }

    assert.equal(
      global[LODASH_TEMPLATE_FLAG],
      undefined,
      'lodash template compilation must not execute import key expressions'
    );

    if (!rejected) {
      assert.equal(compiled({}), 'healthy');
      assert.equal(
        global[LODASH_TEMPLATE_FLAG],
        undefined,
        'lodash template rendering must not execute import key expressions'
      );
    }
  } finally {
    delete global[LODASH_TEMPLATE_FLAG];
  }
});

test('GHSA-xvch-5gv4-984h: minimist does not pollute Object.prototype via __proto__ paths', () => {
  clearPrototypePollution(MINIMIST_POLLUTION_KEY);

  try {
    minimist([`--__proto__.${MINIMIST_POLLUTION_KEY}=owned`]);

    assert.equal(
      {}[MINIMIST_POLLUTION_KEY],
      undefined,
      'minimist must not assign parsed __proto__ paths onto Object.prototype'
    );
  } finally {
    clearPrototypePollution(MINIMIST_POLLUTION_KEY);
  }
});
