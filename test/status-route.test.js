'use strict';

const http = require('node:http');
const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const packageJson = require('../package.json');
const { app } = require('../src/server');

function request(pathname) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');

    server.once('error', reject);
    server.once('listening', () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: pathname,
          method: 'GET',
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            server.close((err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve({ body, headers: res.headers, statusCode: res.statusCode });
            });
          });
        },
      );

      req.once('error', (err) => {
        server.close(() => reject(err));
      });
      req.end();
    });
  });
}

test('GET /status returns the stable monitoring JSON contract', async () => {
  const response = await request('/status');

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.headers['content-type'] || '', /^application\/json\b/);

  const body = JSON.parse(response.body);
  assert.deepStrictEqual(Object.keys(body).sort(), ['status', 'uptime_seconds', 'version']);
  assert.strictEqual(body.status, 'up');
  assert.strictEqual(typeof body.uptime_seconds, 'number');
  assert.ok(Number.isFinite(body.uptime_seconds));
  assert.ok(body.uptime_seconds >= 0);
  assert.strictEqual(body.version, packageJson.version);
});

test('GET /status is lightweight and preserves existing route contracts', async (t) => {
  const originalAxiosGet = axios.get;
  const axiosCalls = [];
  t.after(() => {
    axios.get = originalAxiosGet;
  });

  axios.get = async (url, options) => {
    axiosCalls.push({ options, url });
    return { status: 204 };
  };

  const dashboard = await request('/');
  assert.strictEqual(dashboard.statusCode, 200);
  assert.match(dashboard.headers['content-type'] || '', /^text\/html\b/);
  assert.match(dashboard.body, /api-gateway/);

  const upstream = await request('/health/upstream');
  assert.strictEqual(upstream.statusCode, 200);
  assert.match(upstream.headers['content-type'] || '', /^application\/json\b/);
  assert.deepStrictEqual(JSON.parse(upstream.body), { upstream: 'ok', status: 204 });
  assert.deepStrictEqual(axiosCalls.map((call) => call.url), ['https://example.com']);

  const callsBeforeStatus = axiosCalls.length;
  const status = await request('/status');
  assert.strictEqual(status.statusCode, 200);
  assert.match(status.headers['content-type'] || '', /^application\/json\b/);
  assert.strictEqual(axiosCalls.length, callsBeforeStatus);
});
