'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const { probeUpstream, UPSTREAM_URL, TIMEOUT_MS } = require('../src/lib/status-probe');

async function listen(t, host, handler) {
  const server = http.createServer(handler);
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  server.listen(0, host);
  await once(server, 'listening');
  return `http://${host}:${server.address().port}`;
}

for (const status of [301, 302, 303, 307, 308]) {
  test(`probeUpstream rejects HTTP ${status} without contacting the redirect host`, async t => {
    let targetRequests = 0;
    const target = await listen(t, '127.0.0.2', (req, res) => {
      req.resume();
      targetRequests++;
      res.end('redirect target');
    });
    let originRequests = 0;
    const origin = await listen(t, '127.0.0.1', (req, res) => {
      req.resume();
      originRequests++;
      res.writeHead(status, { Location: target });
      res.end();
    });
    const client = axios.create({ proxy: false });
    client.interceptors.request.use(config => {
      assert.equal(config.url, UPSTREAM_URL);
      assert.equal(config.timeout, TIMEOUT_MS);
      // Retarget only the initial request; Axios still handles the redirect itself.
      config.url = origin;
      return config;
    });

    let rejection;
    await probeUpstream(client).catch(error => { rejection = error; });
    assert.equal(originRequests, 1);
    assert.equal(targetRequests, 0, 'the redirect host must receive no request');
    assert.ok(rejection, 'a redirect must reject the probe');
    assert.equal(rejection.response.status, status);
  });
}

test('probeUpstream preserves direct success and HTTP failure handling', async t => {
  let status = 200;
  const origin = await listen(t, '127.0.0.1', (req, res) => {
    req.resume();
    res.writeHead(status);
    res.end('upstream');
  });
  const client = axios.create({ proxy: false });
  client.interceptors.request.use(config => {
    config.url = origin;
    return config;
  });

  assert.equal((await probeUpstream(client)).status, 200);
  status = 503;
  await assert.rejects(probeUpstream(client), error => error.response.status === 503);
});
