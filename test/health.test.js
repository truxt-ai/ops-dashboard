'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');

describe('health endpoints (AXM-666 / TD-84, UoW-1)', { concurrency: false }, () => {
  let server;

  beforeEach(async t => {
    const previous = process.env.DASHBOARD_TOKEN;
    process.env.DASHBOARD_TOKEN = 'synthetic-dashboard-fixture';
    t.after(() => {
      if (previous === undefined) delete process.env.DASHBOARD_TOKEN;
      else process.env.DASHBOARD_TOKEN = previous;
    });
    t.mock.method(console, 'error', () => {});
    delete require.cache[require.resolve('../src/app')];
    const { app } = require('../src/app');
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
      const req = http.get({
        host: '127.0.0.1', port: server.address().port, path,
        headers: path === '/health/upstream' ? { authorization: `Bearer ${process.env.DASHBOARD_TOKEN}` } : {},
      }, res => {
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

  test('TC-03: authenticated upstream probe retains the existing timeout', async t => {
    const probe = t.mock.method(axios, 'get', async () => ({ status: 204 }));
    const response = await request('/health/upstream');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { upstream: 'ok', status: 204 });
    assert.equal(probe.mock.callCount(), 1);
    assert.deepEqual(probe.mock.calls[0].arguments, ['https://example.com', { timeout: 2000 }]);
  });

  for (const [kind, error] of [
    ['HTTP failure', Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } })],
    ['connection error', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['timeout', Object.assign(new Error('timeout of 2000ms exceeded'), { code: 'ECONNABORTED' })],
  ]) {
    test(`TC-04: authenticated upstream probe identifies ${kind}`, async t => {
      t.mock.method(axios, 'get', async () => { throw error; });
      const response = await request('/health/upstream');
      assert.equal(response.status, 502);
      assert.deepEqual(JSON.parse(response.body), { upstream: 'unreachable', error: 'upstream unavailable' });
    });
  }

  test('TC-05: pending and repeated failures leave local probes available, then upstream recovers', async t => {
    let now = 100000;
    t.mock.method(Date, 'now', () => now);
    let rejectProbe;
    let markStarted;
    const started = new Promise(resolve => { markStarted = resolve; });
    const probe = t.mock.method(axios, 'get', () => new Promise((resolve, reject) => {
      rejectProbe = reject;
      markStarted();
    }));
    const pending = request('/health/upstream');
    let duplicate;
    try {
      await Promise.race([
        started,
        pending.then(() => assert.fail('upstream responded without probing')),
      ]);
      const received = once(server, 'request');
      duplicate = request('/health/upstream');
      await received;
      const live = await request('/health/live');
      assert.equal(live.status, 200);
      assert.deepEqual(JSON.parse(live.body), { status: 'ok' });
      const ready = await request('/health/ready');
      assert.equal(ready.status, 200);
      assert.deepEqual(JSON.parse(ready.body), { status: 'ok' });
      assert.equal(probe.mock.callCount(), 1);
    } finally {
      if (rejectProbe) rejectProbe(new Error('upstream failed'));
    }
    const failed = await pending;
    assert.deepEqual(await duplicate, failed);
    assert.equal(failed.status, 502);
    assert.deepEqual(JSON.parse(failed.body), { upstream: 'unreachable', error: 'upstream unavailable' });

    probe.mock.mockImplementation(async () => { throw new Error('still unavailable'); });
    for (let i = 0; i < 3; i++) {
      now += 15000;
      const upstream = await request('/health/upstream');
      assert.equal(upstream.status, 502);
      assert.deepEqual(JSON.parse(upstream.body), { upstream: 'unreachable', error: 'upstream unavailable' });
      const calls = probe.mock.callCount();
      const live = await request('/health/live');
      assert.equal(live.status, 200);
      assert.deepEqual(JSON.parse(live.body), { status: 'ok' });
      assert.equal(probe.mock.callCount(), calls);
    }

    probe.mock.mockImplementation(async () => ({ status: 200 }));
    now += 15000;
    const recovered = await request('/health/upstream');
    assert.equal(recovered.status, 200);
    assert.deepEqual(JSON.parse(recovered.body), { upstream: 'ok', status: 200 });
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
    assert.deepEqual(JSON.parse(response.body), { upstream: 'unreachable', error: 'upstream unavailable' });
  });
});
