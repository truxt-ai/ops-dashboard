'use strict';

const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

function assertDependencyBoundaryHolds(script) {
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
  });

  assert.strictEqual(
    result.status,
    0,
    [
      'dependency-boundary exploit reproduced in isolated child process',
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join('\n')
  );
}

const cases = [
  {
    name: 'ejs rejects localsName code injection',
    advisory: 'GHSA-phwq-j96m-2c2q',
    script: String.raw`
const assert = require('node:assert/strict');
const ejs = require('ejs');

delete global.__axiomEjsInjected;

try {
  ejs.render('safe <%= value %>', { value: 'render' }, {
    localsName: 'locals = (global.__axiomEjsInjected = true)',
  });
} catch (err) {
  // Patched EJS versions may reject the malicious option outright.
}

assert.strictEqual(
  global.__axiomEjsInjected,
  undefined,
  'GHSA-phwq-j96m-2c2q: malicious localsName option must not execute JavaScript'
);
assert.strictEqual(ejs.render('safe <%= value %>', { value: 'render' }), 'safe render');
`,
  },
  {
    name: 'lodash blocks constructor.prototype pollution through defaultsDeep',
    advisory: 'GHSA-jf85-cpcp-j695',
    script: String.raw`
const assert = require('node:assert/strict');
const _ = require('lodash');

delete Object.prototype.__axiomLodashPolluted;

const payload = JSON.parse(
  '{"constructor":{"prototype":{"__axiomLodashPolluted":"owned"}}}'
);

_.defaultsDeep({}, payload);

assert.strictEqual(
  {}.__axiomLodashPolluted,
  undefined,
  'GHSA-jf85-cpcp-j695: defaultsDeep must not pollute Object.prototype'
);
assert.deepStrictEqual(
  _.defaultsDeep({ service: { retries: 1 } }, { service: { timeoutMs: 500 } }),
  { service: { retries: 1, timeoutMs: 500 } }
);
`,
  },
  {
    name: 'minimist blocks __proto__ option pollution',
    advisory: 'GHSA-xvch-5gv4-984h',
    script: String.raw`
const assert = require('node:assert/strict');
const minimist = require('minimist');

delete Object.prototype.__axiomMinimistPolluted;

const parsed = minimist([
  '--__proto__.__axiomMinimistPolluted',
  'owned',
  '--port=4000',
]);

assert.strictEqual(
  {}.__axiomMinimistPolluted,
  undefined,
  'GHSA-xvch-5gv4-984h: __proto__ CLI options must not pollute Object.prototype'
);
assert.strictEqual(parsed.port, 4000);
`,
  },
];

test('critical direct dependencies reject known advisory payloads', async (t) => {
  for (const tc of cases) {
    await t.test(`${tc.name} (${tc.advisory})`, () => {
      assertDependencyBoundaryHolds(tc.script);
    });
  }
});
