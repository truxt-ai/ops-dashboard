'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { app } = require('../src/server');
const { version } = require('../package.json');

function listen(t) {
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  }));
  return server;
}

async function getStatus(server) {
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/status`);
}

async function readStatusPayload(response) {
  assert.strictEqual(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  return response.json();
}

test('GET /status returns the public service status JSON contract', async (t) => {
  const server = listen(t);

  const response = await getStatus(server);
  const payload = await readStatusPayload(response);

  assert.deepStrictEqual(Object.keys(payload).sort(), ['status', 'uptime', 'version']);
  assert.strictEqual(payload.status, 'up');
  assert.strictEqual(payload.version, version);
  assert.strictEqual(typeof payload.uptime, 'number');
  assert.ok(Number.isFinite(payload.uptime), 'uptime is finite');
  assert.ok(payload.uptime >= 0, 'uptime is non-negative');
});

test('GET /status reports uptime that increases while the app is serving', async (t) => {
  const server = listen(t);

  const first = await readStatusPayload(await getStatus(server));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = await readStatusPayload(await getStatus(server));

  assert.strictEqual(first.status, 'up');
  assert.strictEqual(second.status, 'up');
  assert.ok(
    second.uptime > first.uptime,
    `expected uptime to increase from ${first.uptime} to ${second.uptime}`,
  );
});

test('GET /status is unauthenticated and does not use the upstream health dependency', async (t) => {
  const server = listen(t);
  const originalGet = axios.get;
  let upstreamCalls = 0;
  axios.get = async () => {
    upstreamCalls += 1;
    throw new Error('status endpoint must not call upstream dependency');
  };
  t.after(() => {
    axios.get = originalGet;
  });

  const response = await getStatus(server);
  const payload = await readStatusPayload(response);

  assert.strictEqual(payload.status, 'up');
  assert.strictEqual(upstreamCalls, 0);
});
