'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { buildMetrics } = require('../src/server');

test('buildMetrics totals add up across services', () => {
  const m = buildMetrics();
  assert.strictEqual(m.totalRequests, 18420 + 9310 + 4502);
  assert.strictEqual(m.totalErrors, 12 + 3 + 0);
  assert.ok(m.errorRate >= 0, 'error rate is non-negative');
  assert.strictEqual(m.services.length, 3);
});

for (const key of ['__proto__', 'constructor.prototype']) {
  test(`startup arguments cannot pollute Object.prototype via ${key}`, () => {
    const result = spawnSync(process.execPath, ['-e', `
      process.argv.push('server.js', '--${key}.axiomPolluted=true');
      require(${JSON.stringify(require.resolve('../src/server'))});
      require('node:assert').strictEqual({}.axiomPolluted, undefined);
    `], { encoding: 'utf8', timeout: 5000 });
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, result.stderr);
  });
}
