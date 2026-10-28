'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const lock = require('../package-lock.json');
const { syncMetrics } = require('../src/jobs/upstream-sync');

for (const [name, floor] of [['axios', '0.34.0'], ['follow-redirects', '1.16.1']]) {
  test(`${name} installed and locked copies meet security floor ${floor}`, () => {
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

test('syncMetrics posts JSON through a local 307 redirect with real Axios', { timeout: 10000 }, async t => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, contentType: req.headers['content-type'], body });
      if (req.url === '/redirect') res.writeHead(307, { Location: '/sync' });
      else res.writeHead(204);
      res.end();
    });
  });
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const snapshot = { totalRequests: 42, totalErrors: 1 };
  const response = await syncMetrics(snapshot, {
    url: `http://127.0.0.1:${server.address().port}/redirect`,
    client: axios.create({ proxy: false }),
  });
  assert.equal(response.status, 204);
  assert.equal(response.config.timeout, 5000);
  assert.deepEqual(requests.map(({ url }) => url), ['/redirect', '/sync']);
  for (const request of requests) {
    assert.equal(request.method, 'POST');
    assert.match(request.contentType, /^application\/json\b/);
    assert.deepEqual(JSON.parse(request.body), snapshot);
  }
});
