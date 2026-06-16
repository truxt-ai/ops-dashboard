'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Stub fallback keeps tests runnable (and RED) before the module is implemented.
let apply;
try {
  ({ apply } = require('../src/lib/promo'));
} catch (_) {
  apply = (_code, _price) => null;
}

let app;
try {
  ({ app } = require('../src/server'));
} catch (_) {
  app = null;
}

// ── apply() unit tests ────────────────────────────────────────────────────────

// Covers: FR-* (promo codes not yet in contract — no project-contract clause);
// acceptance criterion: apply("WELCOME10", 100) === 90.
test('apply WELCOME10 gives 10% discount', () => {
  assert.strictEqual(apply('WELCOME10', 100), 90);
});

// Covers acceptance criterion: apply("PRO25", 100) === 75.
test('apply PRO25 gives 25% discount', () => {
  assert.strictEqual(apply('PRO25', 100), 75);
});

// Covers acceptance criterion: inactive code LEGACY50 is a no-op.
// Risk guarded: inactive codes must not silently apply discounts.
test('apply LEGACY50 is a no-op (inactive code)', () => {
  assert.strictEqual(apply('LEGACY50', 100), 100);
});

// Covers acceptance criterion: unknown code is a no-op.
// Risk guarded: misspelled/nonexistent codes must not alter price.
test('apply unknown code WELCOME11 is a no-op', () => {
  assert.strictEqual(apply('WELCOME11', 100), 100);
});

// Covers acceptance criterion: empty string is a no-op.
// Risk guarded: missing/omitted promo must not alter price.
test('apply empty string is a no-op', () => {
  assert.strictEqual(apply('', 100), 100);
});

// Case/whitespace contract: apply() is case-sensitive; lowercase codes do not
// match. Rationale: promo codes are stored verbatim; callers must supply the
// canonical upper-case form. Documented here so implementer honours the same
// contract without guessing.
test('apply lowercase code is a no-op (case-sensitive)', () => {
  assert.strictEqual(apply('welcome10', 100), 100);
});

// ── GET /promos route tests ───────────────────────────────────────────────────

function httpGet(server, path) {
  return new Promise((resolve, reject) => {
    const srv = server.listen(0, () => {
      const { port } = srv.address();
      http.get(`http://localhost:${port}${path}`, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          srv.close(() => {
            let body;
            try { body = JSON.parse(raw); } catch (_) { body = raw; }
            resolve({ status: res.statusCode, body });
          });
        });
      }).on('error', (err) => { srv.close(); reject(err); });
    });
  });
}

// Covers acceptance criterion: list endpoint returns 200 with active codes.
// Risk guarded: route must exist and serve JSON, not 404.
test('GET /promos returns 200', async () => {
  assert.ok(app, 'app not loaded');
  const { status } = await httpGet(app, '/promos');
  assert.strictEqual(status, 200);
});

// Covers acceptance criterion: response includes WELCOME10 and PRO25.
// Risk guarded: active codes must appear in the listing.
test('GET /promos includes WELCOME10 and PRO25', async () => {
  assert.ok(app, 'app not loaded');
  const { status, body } = await httpGet(app, '/promos');
  assert.strictEqual(status, 200, 'expected 200');
  assert.ok(Array.isArray(body), 'body should be an array');
  const codes = body.map((p) => p.code);
  assert.ok(codes.includes('WELCOME10'), 'WELCOME10 missing from listing');
  assert.ok(codes.includes('PRO25'), 'PRO25 missing from listing');
});

// Covers acceptance criterion: LEGACY50 must not appear in listing.
// Risk guarded: inactive codes must be excluded so clients never offer them.
test('GET /promos excludes LEGACY50', async () => {
  assert.ok(app, 'app not loaded');
  const { status, body } = await httpGet(app, '/promos');
  assert.strictEqual(status, 200, 'expected 200');
  assert.ok(Array.isArray(body), 'body should be an array');
  const codes = body.map((p) => p.code);
  assert.ok(!codes.includes('LEGACY50'), 'inactive LEGACY50 must not appear');
});
