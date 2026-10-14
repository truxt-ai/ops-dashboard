'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const lock = require('../package-lock.json');
const { buildMetrics } = require('../src/server');

test('buildMetrics totals add up across services', () => {
  const m = buildMetrics();
  assert.strictEqual(m.totalRequests, 18420 + 9310 + 4502);
  assert.strictEqual(m.totalErrors, 12 + 3 + 0);
  assert.ok(m.errorRate >= 0, 'error rate is non-negative');
  assert.strictEqual(m.services.length, 3);
});

for (const [name, floor] of [['brace-expansion', '1.1.21'], ['js-yaml', '4.3.2']]) {
  test(`${name} installed and locked versions meet security floor ${floor}`, () => {
    const installed = require(`${name}/package.json`).version;
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`));
    assert.ok(copies.length > 0, `${name} is missing from the lockfile`);
    const order = new Intl.Collator('en', { numeric: true });
    for (const [path, { version }] of [['installed', { version: installed }], ...copies]) {
      assert.match(version, /^\d+\.\d+\.\d+$/, `${path} must resolve a stable release`);
      assert.ok(order.compare(version, floor) >= 0, `${path}@${version} is below ${floor}`);
    }
  });
}
