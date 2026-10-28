'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { syncMetrics } = require('../src/jobs/upstream-sync');

test('syncMetrics posts the snapshot to the given url and returns the client promise', (t) => {
  const snapshot = { total: 3 };
  const result = Promise.resolve({ status: 200 });
  const client = { post: t.mock.fn(() => result) };

  assert.equal(syncMetrics(snapshot, { url: 'https://upstream.test/sync', client }), result);
  assert.equal(client.post.mock.callCount(), 1);
  assert.deepEqual(client.post.mock.calls[0].arguments, [
    'https://upstream.test/sync', snapshot, { timeout: 5000 },
  ]);
  assert.equal(client.post.mock.calls[0].arguments[1], snapshot);
});

test('syncMetrics falls back to UPSTREAM_SYNC_URL', (t) => {
  const previousUrl = process.env.UPSTREAM_SYNC_URL;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.UPSTREAM_SYNC_URL;
    else process.env.UPSTREAM_SYNC_URL = previousUrl;
  });
  process.env.UPSTREAM_SYNC_URL = 'https://upstream.test/env-sync';
  const snapshot = { total: 3 };
  const client = { post: t.mock.fn() };

  syncMetrics(snapshot, { client });

  assert.equal(client.post.mock.callCount(), 1);
  assert.deepEqual(client.post.mock.calls[0].arguments, [
    'https://upstream.test/env-sync', snapshot, { timeout: 5000 },
  ]);
});

test('syncMetrics throws synchronously without a configured url before calling the client', (t) => {
  const previousUrl = process.env.UPSTREAM_SYNC_URL;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.UPSTREAM_SYNC_URL;
    else process.env.UPSTREAM_SYNC_URL = previousUrl;
  });
  delete process.env.UPSTREAM_SYNC_URL;
  const client = { post: t.mock.fn() };

  assert.throws(() => syncMetrics({}, { client }), {
    message: 'UPSTREAM_SYNC_URL is not set',
  });
  assert.equal(client.post.mock.callCount(), 0);
});

test('syncMetrics propagates the client rejection unchanged', async (t) => {
  const error = new Error('upstream 503');
  const client = { post: t.mock.fn(() => Promise.reject(error)) };

  await assert.rejects(syncMetrics({}, { url: 'https://upstream.test/sync', client }),
    (actual) => actual === error);
  assert.equal(client.post.mock.callCount(), 1);
});

test('syncMetrics accepts no options and throws for a missing url without calling axios', (t) => {
  const previousUrl = process.env.UPSTREAM_SYNC_URL;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.UPSTREAM_SYNC_URL;
    else process.env.UPSTREAM_SYNC_URL = previousUrl;
  });
  delete process.env.UPSTREAM_SYNC_URL;
  const post = t.mock.method(axios, 'post', () => {
    throw new Error('Unexpected axios call');
  });

  assert.throws(() => syncMetrics({}), { message: 'UPSTREAM_SYNC_URL is not set' });
  assert.equal(post.mock.callCount(), 0);
});
