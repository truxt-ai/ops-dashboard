'use strict';

// Security regression test for GHSA-qwcr-r2fm-qrc7
// body-parser <= 1.20.1 passes `depth: Infinity` to qs, allowing a single
// URL-encoded key with 100 000 nesting levels to monopolise the CPU for
// ~1500ms per request — a reliable remote DoS.
// RED on body-parser@1.20.1 (express@4.18.2): elapsed >> 500ms.
// GREEN on body-parser@1.20.3+ (express@4.22.2): 400 returned in < 50ms.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

function buildPayload() {
  let key = 'a';
  for (let i = 0; i < 100_000; i++) key += '[0]';
  return key + '=x';
}

test(
  'GHSA-qwcr-r2fm-qrc7: POST with deeply-nested url-encoded body must respond within 500ms',
  { timeout: 4000 },
  async () => {
    const app = express();
    // limit: 1mb lets the 300 KB payload reach the parser; the vulnerability
    // lies in qs depth handling, not the body size gate.
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.post('/parse', (_req, res) => res.json({ ok: true }));

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const body = buildPayload();

    try {
      const start = Date.now();
      await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/parse',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res) => {
            res.resume();
            res.on('end', resolve);
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      const elapsed = Date.now() - start;
      assert.ok(
        elapsed < 500,
        `Response took ${elapsed}ms — body-parser DoS (GHSA-qwcr-r2fm-qrc7): expected < 500ms`
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
