'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const { app } = require('../src/app');

async function listen(t, server) {
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(err => err ? reject(err) : resolve());
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function deadPort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function fixture(t, { status, port }) {
  const upstreamHits = [];
  let upstreamPort = port;
  if (status) {
    upstreamPort = await listen(t, http.createServer((req, res) => {
      upstreamHits.push(`${req.method} ${req.url}`);
      res.writeHead(status);
      res.end();
    }));
  }
  const id = axios.interceptors.request.use(config => ({
    ...config,
    url: `http://127.0.0.1:${upstreamPort}/`,
    proxy: false,
  }));
  t.after(() => axios.interceptors.request.eject(id));
  const appPort = await listen(t, http.createServer(app));
  return {
    upstreamHits,
    async get(path) {
      const res = await fetch(`http://127.0.0.1:${appPort}${path}`);
      return { status: res.status, body: await res.json() };
    },
  };
}

test('GET /health/upstream returns the real upstream status through real Axios', async t => {
  const { get, upstreamHits } = await fixture(t, { status: 204 });
  const response = await get('/health/upstream');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { upstream: 'ok', status: 204 });
  assert.deepEqual(upstreamHits, ['GET /']);
});

test('GET /health/upstream returns 502 with the real Axios error message on a refused connection', async t => {
  const port = await deadPort();
  const { get } = await fixture(t, { port });
  const response = await get('/health/upstream');
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    upstream: 'unreachable',
    error: `connect ECONNREFUSED 127.0.0.1:${port}`,
  });
});

test('GET /health/upstream returns 502 with the real Axios message on an upstream 500', async t => {
  const { get } = await fixture(t, { status: 500 });
  const response = await get('/health/upstream');
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    upstream: 'unreachable',
    error: 'Request failed with status code 500',
  });
});

test('GET /health/ready is 200 on a real successful probe', async t => {
  const { get, upstreamHits } = await fixture(t, { status: 200 });
  const response = await get('/health/ready');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { upstream: 'ok' });
  assert.deepEqual(upstreamHits, ['GET /']);
});

test('GET /health/ready is 503 on a real transport failure', async t => {
  const { get } = await fixture(t, { port: await deadPort() });
  const response = await get('/health/ready');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { upstream: 'unreachable' });
});

test('GET /health/live is 200 and never contacts the upstream', async t => {
  const { get, upstreamHits } = await fixture(t, { status: 500 });
  const response = await get('/health/live');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.deepEqual(upstreamHits, []);
});
