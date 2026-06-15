'use strict';

const http = require('node:http');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { app } = require('../src/server');

function startTestServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function stopTestServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function request(pathname, port) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'GET',
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

test('GET /api/billing/promo-codes returns active local promo codes only', async (t) => {
  const originalAxiosGet = axios.get;
  let externalHttpCalls = 0;

  axios.get = async () => {
    externalHttpCalls += 1;
    throw new Error('promo code listing must be self-contained');
  };
  t.after(() => {
    axios.get = originalAxiosGet;
  });

  const server = await startTestServer();
  t.after(() => stopTestServer(server));

  const response = await request('/api/billing/promo-codes', server.address().port);

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] || '', /^application\/json\b/);
  assert.deepEqual(JSON.parse(response.body), {
    promoCodes: [
      { code: 'WELCOME10', percentOff: 10 },
      { code: 'PRO25', percentOff: 25 },
    ],
  });
  assert.equal(externalHttpCalls, 0, 'promo code route must not call an external service');
});
