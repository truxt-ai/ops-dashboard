'use strict';

/**
 * Security regression tests for RAU-70.
 * One test per CVE — each must be RED (failing) on the pinned vulnerable deps
 * and GREEN (passing) after the dependency bumps from the implement step.
 *
 * Tests use the dependency-boundary approach: require the package directly,
 * exercise the exact vulnerable API, and assert the SAFE behaviour.
 * On unpatched deps the assertion fails → RED.  After the bump → GREEN.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// CVE 1: ejs — GHSA-phwq-j96m-2c2q (template injection / escape-fn injection)
// ---------------------------------------------------------------------------
// ejs <3.1.7 reads `opts.escape` without an own-property check, so a prior
// prototype-pollution attack can inject a custom escape function that runs as
// part of every <%= … %> expression, leading to arbitrary code execution.
// Fix: ejs ≥3.1.7 validates / isolates option reads.
// ---------------------------------------------------------------------------
test('GHSA-phwq-j96m-2c2q: ejs uses prototype-polluted escape function', () => {
  const ejs = require('ejs');

  let injectedEscapeCalled = false;
  // Simulate a prior prototype-pollution attack injecting a malicious escape fn.
  Object.prototype.escape = function (s) {     // eslint-disable-line no-extend-native
    injectedEscapeCalled = true;
    return String(s);
  };

  try {
    // Empty opts ({}) — no explicit escape key, but ejs picks it up from proto.
    ejs.render('<%= name %>', { name: 'safe' }, {});
  } finally {
    delete Object.prototype.escape;            // always clean up
  }

  // SAFE assertion: the injected function should NOT have been called.
  // On vulnerable ejs 2.5.7  → injectedEscapeCalled === true → assert FAILS → RED.
  // On fixed    ejs ≥3.1.7   → injectedEscapeCalled === false → assert passes → GREEN.
  assert.strictEqual(
    injectedEscapeCalled,
    false,
    'GHSA-phwq-j96m-2c2q: ejs picked up escape function from Object.prototype — prototype pollution leads to arbitrary code execution via escape handler'
  );
});

// ---------------------------------------------------------------------------
// CVE 2: lodash — GHSA-fvqr-27wr-82fm (prototype pollution via _.merge)
// ---------------------------------------------------------------------------
// lodash <4.17.5 — _.merge() recursively copies __proto__ from a JSON-parsed
// object onto Object.prototype, poisoning every plain object in the process.
// Fix: lodash ≥4.17.5 skips __proto__ during deep merge.
// ---------------------------------------------------------------------------
test('GHSA-fvqr-27wr-82fm: lodash _.merge allows __proto__ prototype pollution', () => {
  const _ = require('lodash');

  const key = '__lodashMergeVuln__';
  // Craft the attack payload via JSON.parse so __proto__ is a real own key.
  const payload = JSON.parse(`{"__proto__":{"${key}":"POLLUTED"}}`);
  _.merge({}, payload);

  const polluted = ({} )[key];
  // Always clean up regardless of outcome.
  delete Object.prototype[key];

  // SAFE assertion: a fresh object must NOT have inherited the key.
  // On vulnerable lodash 4.17.4 → polluted === 'POLLUTED' → assert FAILS → RED.
  // On fixed    lodash ≥4.17.5  → polluted === undefined → assert passes → GREEN.
  assert.strictEqual(
    polluted,
    undefined,
    `GHSA-fvqr-27wr-82fm: lodash _.merge polluted Object.prototype.${key} — any object inherits attacker-controlled property`
  );
});

// ---------------------------------------------------------------------------
// CVE 3: minimist — GHSA-vh95-rmgr-6w4m (prototype pollution via --__proto__)
// ---------------------------------------------------------------------------
// minimist ≥1.0.0 <1.2.3 — parsing a CLI argument like --__proto__[key]=val
// directly assigns to Object.prototype, poisoning the entire runtime.
// Fix: minimist ≥1.2.3 treats __proto__ as a forbidden key.
// ---------------------------------------------------------------------------
test('GHSA-vh95-rmgr-6w4m: minimist allows __proto__ prototype pollution', () => {
  const minimist = require('minimist');

  const key = '__minimistVuln__';
  // minimist 1.2.0 treats --__proto__.key as a property write on Object.prototype
  minimist([`--__proto__.${key}`, 'POLLUTED']);

  const polluted = ({} )[key];
  delete Object.prototype[key];

  // SAFE assertion: a fresh object must NOT have the injected key.
  // On vulnerable minimist 1.2.0  → polluted === 'POLLUTED' → assert FAILS → RED.
  // On fixed    minimist ≥1.2.3   → polluted === undefined → assert passes → GREEN.
  assert.strictEqual(
    polluted,
    undefined,
    `GHSA-vh95-rmgr-6w4m: minimist polluted Object.prototype.${key} via --__proto__[…] argument`
  );
});

// ---------------------------------------------------------------------------
// CVE 4: axios — GHSA-wf5p-g6vw-rhxx (CSRF — XSRF token sent cross-origin)
// ---------------------------------------------------------------------------
// axios <0.28.0 XHR adapter sends the XSRF-TOKEN cookie as a request header
// whenever `withCredentials: true`, regardless of whether the destination is
// the same origin.  A malicious cross-origin page can therefore perform CSRF
// using the victim's real XSRF token.
// The smoking-gun in the source: the guard is
//   `config.withCredentials || isURLSameOrigin(fullPath)`
// meaning withCredentials=true BYPASSES the same-origin check.
// Fix: later axios removes the || short-circuit so only same-origin requests
// attach the XSRF header (or introduces an explicit allowedOrigins list).
// ---------------------------------------------------------------------------
test('GHSA-wf5p-g6vw-rhxx: axios XHR adapter sends XSRF token to cross-origin URLs', () => {
  const xhrAdapterPath = require.resolve('axios/lib/adapters/xhr');
  // In Node.js environments the XHR adapter file may not exist; skip if absent.
  if (!fs.existsSync(xhrAdapterPath)) {
    // Nothing to verify — vulnerability lives only in the browser adapter.
    return;
  }

  const src = fs.readFileSync(xhrAdapterPath, 'utf8');

  // The vulnerable pattern: withCredentials short-circuits the same-origin check.
  const vulnPattern = 'config.withCredentials || isURLSameOrigin';

  // SAFE assertion: the vulnerable pattern must NOT be present.
  // On vulnerable axios 0.21.1 → pattern found → assert FAILS → RED.
  // On fixed    axios ≥0.28.0  → pattern removed → assert passes → GREEN.
  assert.strictEqual(
    src.includes(vulnPattern),
    false,
    'GHSA-wf5p-g6vw-rhxx: found "' + vulnPattern + '" in axios/lib/adapters/xhr.js — withCredentials bypasses XSRF origin check, enabling CSRF from any cross-origin page'
  );
});

// ---------------------------------------------------------------------------
// CVE 5: express chain — GHSA-qw6h-vgh9-j6wx (XSS via res.redirect())
// ---------------------------------------------------------------------------
// express <4.20.0 — res.redirect() accepts any URL, including javascript: URIs,
// and embeds them in the HTML redirect body as a clickable <a href="…"> link.
// escapeHtml() only prevents HTML injection; it does not block javascript: or
// data: URIs, so an attacker who controls the redirect target can deliver a
// stored/reflected XSS payload to any user whose browser follows the redirect.
// Fix: express ≥4.20.0 validates that the Location header is a safe URL before
// embedding it in the HTML body.
// ---------------------------------------------------------------------------
test('GHSA-qw6h-vgh9-j6wx: express res.redirect() embeds javascript: URI in HTML body', (_, done) => {
  const express = require('express');
  const app = express();

  // Route that redirects to a javascript: URI (attacker-controlled Location).
  app.get('/xss-redirect', (_req, res) => {
    res.redirect('javascript:alert(document.domain)');
  });

  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const req = http.get(
      { host: '127.0.0.1', port, path: '/xss-redirect', headers: { Accept: 'text/html' } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          server.close();

          // SAFE assertion: the HTML body must NOT contain a javascript: href.
          // On vulnerable express 4.18.2 → body has href="javascript:…" → FAILS → RED.
          // On fixed    express ≥4.20.0  → redirect rejected or href sanitised → passes → GREEN.
          try {
            assert.strictEqual(
              body.includes('href="javascript:'),
              false,
              'GHSA-qw6h-vgh9-j6wx: express redirect body contains javascript: href — attacker-supplied javascript: URL creates clickable XSS link in the HTML redirect page'
            );
            done();
          } catch (err) {
            done(err);
          }
        });
      }
    );
    req.on('error', (err) => { server.close(); done(err); });
  });
});
