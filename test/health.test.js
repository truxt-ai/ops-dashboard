'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const { app } = require('../src/server');

describe('health endpoints (AXM-666 / TD-84, UoW-1)', { concurrency: false }, () => {
  let server;

  beforeEach(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve());
    });
  });

  function request(path) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: server.address().port, path }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
        res.on('error', reject);
      });
      req.setTimeout(2000, () => req.destroy(new Error('Local HTTP request timed out')));
      req.on('error', reject);
    });
  }

  for (const healthy of [true, false]) {
    test(`TC-0${healthy ? 1 : 2}: liveness ignores ${healthy ? 'healthy' : 'failing'} upstream`, async t => {
      const probe = t.mock.method(axios, 'get', async () => {
        if (!healthy) throw new Error('upstream failed');
        return { status: 200 };
      });
      const response = await request('/health/live');
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
      assert.equal(probe.mock.callCount(), 0);
    });
  }

  test('TC-03: readiness probes upstream with the existing timeout', async t => {
    const probe = t.mock.method(axios, 'get', async () => ({ status: 204 }));
    const response = await request('/health/ready');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { upstream: 'ok' });
    assert.equal(probe.mock.callCount(), 1);
    assert.deepEqual(probe.mock.calls[0].arguments, ['https://example.com', { timeout: 2000 }]);
  });

  for (const [kind, error] of [
    ['HTTP failure', Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } })],
    ['connection error', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['timeout', Object.assign(new Error('timeout of 2000ms exceeded'), { code: 'ECONNABORTED' })],
  ]) {
    test(`TC-04: readiness identifies upstream on ${kind}`, async t => {
      t.mock.method(axios, 'get', async () => { throw error; });
      const response = await request('/health/ready');
      assert.equal(response.status, 503);
      assert.deepEqual(JSON.parse(response.body), { upstream: 'unreachable' });
    });
  }

  test('TC-05: pending and repeated failures leave liveness available, then readiness recovers', async t => {
    let rejectProbe;
    let markStarted;
    const started = new Promise(resolve => { markStarted = resolve; });
    const probe = t.mock.method(axios, 'get', () => new Promise((resolve, reject) => {
      rejectProbe = reject;
      markStarted();
    }));
    const pending = request('/health/ready');
    try {
      await Promise.race([
        started,
        pending.then(() => assert.fail('readiness responded without probing upstream')),
      ]);
      const live = await request('/health/live');
      assert.equal(live.status, 200);
      assert.deepEqual(JSON.parse(live.body), { status: 'ok' });
      assert.equal(probe.mock.callCount(), 1);
    } finally {
      if (rejectProbe) rejectProbe(new Error('upstream failed'));
    }
    const failed = await pending;
    assert.equal(failed.status, 503);
    assert.deepEqual(JSON.parse(failed.body), { upstream: 'unreachable' });

    probe.mock.mockImplementation(async () => { throw new Error('still unavailable'); });
    for (let i = 0; i < 3; i++) {
      const ready = await request('/health/ready');
      assert.equal(ready.status, 503);
      assert.deepEqual(JSON.parse(ready.body), { upstream: 'unreachable' });
      const calls = probe.mock.callCount();
      const live = await request('/health/live');
      assert.equal(live.status, 200);
      assert.deepEqual(JSON.parse(live.body), { status: 'ok' });
      assert.equal(probe.mock.callCount(), calls);
    }

    probe.mock.mockImplementation(async () => ({ status: 200 }));
    const recovered = await request('/health/ready');
    assert.equal(recovered.status, 200);
    assert.deepEqual(JSON.parse(recovered.body), { upstream: 'ok' });
  });

  test('TC-06: legacy upstream success preserves the upstream status', async t => {
    t.mock.method(axios, 'get', async () => ({ status: 204 }));
    const response = await request('/health/upstream');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { upstream: 'ok', status: 204 });
  });

  test('TC-06: legacy upstream failure preserves 502 and the error field', async t => {
    t.mock.method(axios, 'get', async () => { throw new Error('upstream failed'); });
    const response = await request('/health/upstream');
    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(response.body), { upstream: 'unreachable', error: 'upstream failed' });
  });
});
