'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const lock = require('../package-lock.json');

function copies(name) {
  const paths = Object.keys(lock.packages).filter(p => p.endsWith(`node_modules/${name}`));
  assert.ok(paths.length, `${name} must have a locked copy`);
  return paths.map(p => [p, require(path.resolve(__dirname, '..', p))]);
}

async function listen(t, handler) {
  const server = http.createServer(handler);
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(err => err ? reject(err) : resolve());
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function request(client, options) {
  return new Promise((resolve, reject) => {
    const req = client.get(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('local fixture request timed out')));
    req.on('error', reject);
  });
}

async function redirect(t, client, headers, sensitiveHeaders, sameOrigin = false) {
  const collector = await listen(t, (req, res) => res.end(JSON.stringify(req.headers)));
  const origin = await listen(t, (req, res) => {
    if (req.url === '/end') return res.end(JSON.stringify(req.headers));
    res.writeHead(302, { Location: `http://127.0.0.1:${sameOrigin ? origin : collector}/end` });
    res.end();
  });
  const response = await request(client, {
    hostname: '127.0.0.1', port: origin, path: '/',
    headers: Array.isArray(headers) ? ['Host', `127.0.0.1:${origin}`, ...headers] : headers,
    sensitiveHeaders, maxRedirects: 2,
  });
  assert.equal(response.status, 200, 'redirect fixture must reach its destination');
  return JSON.parse(response.body);
}

for (const [copy, proxyaddr] of copies('proxy-addr')) {
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    for (const peer of ['203.0.113.9', '::ffff:203.0.113.9']) {
      test(`GHSA-jqcg-44mw-7w3h ${copy}: ${subnet} cannot trust ${peer}`, () => {
        const req = { connection: { remoteAddress: peer }, headers: { 'x-forwarded-for': '198.51.100.7' } };
        assert.equal(proxyaddr(req, [subnet]), peer, 'untrusted socket must not accept spoofed X-Forwarded-For');
      });
    }
  }
  test(`control proxy ${copy}: valid subnet and default-disabled trust`, () => {
    for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
      const trusted = { connection: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '198.51.100.7' } };
      assert.equal(proxyaddr(trusted, [subnet]), '198.51.100.7');
      const untrusted = { connection: { remoteAddress: '203.0.113.9' }, headers: trusted.headers };
      assert.equal(proxyaddr(untrusted, [subnet]), '203.0.113.9');
      assert.equal(proxyaddr(trusted, () => false), '10.0.0.1');
    }
    const { app } = require('../src/server');
    assert.equal(app.get('trust proxy'), false);
  });
}

for (const [copy, follow] of copies('follow-redirects')) {
  for (const header of ['X-Api^Key', 'X-Token|Secret']) {
    test(`GHSA-8r9p-f939-6h3c ${copy}: strips ${header} across origins`, { timeout: 5000 }, async t => {
      const received = await redirect(t, follow.http, { [header]: 'fixture-secret', 'X-Ordinary': 'public' }, [header]);
      assert.equal(received['x-ordinary'], 'public');
      assert.equal(received[header.toLowerCase()], undefined, 'declared sensitive header must not cross origins');
    });
    test(`control sensitive ${copy}: retains ${header} on same origin`, { timeout: 5000 }, async t => {
      const received = await redirect(t, follow.http, { [header]: 'fixture-secret' }, [header], true);
      assert.equal(received[header.toLowerCase()], 'fixture-secret');
    });
  }
  test(`control scalar ${copy}: strips ordinary sensitive names and builtins`, { timeout: 5000 }, async t => {
    const received = await redirect(t, follow.http, {
      Authorization: 'Bearer fixture', Cookie: 'session=fixture', 'X-API-Key': 'fixture-secret', 'X-Ordinary': 'public',
    }, ['X-API-Key']);
    for (const name of ['authorization', 'cookie', 'x-api-key']) assert.equal(received[name], undefined);
    assert.equal(received['x-ordinary'], 'public');
  });
  for (const header of ['Authorization', 'Cookie', 'Proxy-Authorization', 'X-API-Key']) {
    test(`GHSA-q3jh-wrc6-jgq8 ${copy}: strips array-form ${header}`, { timeout: 5000 }, async t => {
      const received = await redirect(t, follow.http, [header, 'fixture-secret', 'X-Ordinary', 'public'], ['X-API-Key']);
      assert.equal(received['x-ordinary'], 'public');
      assert.equal(received[header.toLowerCase()], undefined, 'array-form credential must not cross origins');
    });
    test(`control array ${copy}: retains same-origin ${header}`, { timeout: 5000 }, async t => {
      const received = await redirect(t, follow.http, [header, 'fixture-secret'], ['X-API-Key'], true);
      assert.equal(received[header.toLowerCase()], 'fixture-secret');
    });
  }
}

for (const [copy, cookie] of copies('cookie')) {
  for (const [field, args, error] of [
    ['name', ['user=other; injected', 'value'], /argument name is invalid/],
    ['path', ['session', 'value', { path: '/; Secure' }], /option path is invalid/],
    ['domain', ['session', 'value', { domain: 'example.com; Secure' }], /option domain is invalid/],
  ]) {
    test(`GHSA-pxg6-pf52-xh8x ${copy}: rejects injected ${field}`, () => {
      assert.throws(() => cookie.serialize(...args), error, `cookie ${field} must reject attribute injection`);
    });
  }
  test(`control cookie ${copy}: valid name, path, domain and encoding`, () => {
    assert.equal(cookie.serialize('session', 'hello world', {
      path: '/account', domain: 'example.com', httpOnly: true, secure: true,
    }), 'session=hello%20world; Domain=example.com; Path=/account; HttpOnly; Secure');
  });
}

for (const [copy, send] of copies('send')) {
  const serve = async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'axm-721-send-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, 'javascript:alert(1)'));
    await fs.mkdir(path.join(root, 'docs'));
    await fs.writeFile(path.join(root, 'file.txt'), 'fixture file');
    return listen(t, (req, res) => {
      // Deliberately pass attacker-controlled relative input, as required by the advisory.
      send(req, req.url.slice(1), { root }).on('error', err => {
        res.statusCode = err.statusCode || 500;
        res.end(err.message);
      }).pipe(res);
    });
  };
  test(`GHSA-m6fv-jmcg-4jfg ${copy}: directory redirect has no active link`, { timeout: 5000 }, async t => {
    const port = await serve(t);
    const response = await request(http, { hostname: '127.0.0.1', port, path: '/javascript:alert(1)' });
    assert.equal(response.status, 301, 'must reach directory redirect, not error handler');
    assert.equal(response.headers.location, 'javascript:alert(1)/');
    assert.match(response.body, /Redirecting to /);
    assert.doesNotMatch(response.body, /<a\b/i, 'untrusted redirect input must not become a clickable javascript link');
  });
  test(`control send ${copy}: ordinary files and directories`, { timeout: 5000 }, async t => {
    const port = await serve(t);
    const file = await request(http, { hostname: '127.0.0.1', port, path: '/file.txt' });
    assert.equal(file.status, 200);
    assert.equal(file.body, 'fixture file');
    const directory = await request(http, { hostname: '127.0.0.1', port, path: '/docs' });
    assert.equal(directory.status, 301);
    assert.equal(directory.headers.location, 'docs/');
    assert.match(directory.body, /Redirecting to /);
    assert.equal(directory.headers['x-content-type-options'], 'nosniff');
    assert.equal(directory.headers['content-security-policy'], "default-src 'none'");
  });
}
