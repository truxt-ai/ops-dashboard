'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

function request(server, forwardedFor) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: '/protected',
      agent: false,
      headers: forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {},
      timeout: 2000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('local HTTP fixture timed out')); });
  });
}

// CVE-2026-90711 / GHSA-jqcg-44mw-7w3h:
// https://github.com/advisories/GHSA-jqcg-44mw-7w3h
// Real Express -> its installed proxy-addr -> req.ip/req.ips -> test-only access check.
// The fixture demonstrates the dependency contract, not an existing dashboard ACL.
for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
  test(`GHSA-jqcg-44mw-7w3h: ${subnet} cannot trust an unrelated IPv4 peer and spoof Express identity`, async (t) => {
    const app = express();
    const forgedIP = '198.51.100.42';
    app.get('/protected', (req, res) => {
      const body = { ip: req.ip, ips: req.ips };
      if (req.ip === forgedIP) body.protectedData = 'fixture-only secret';
      res.status(req.ip === forgedIP ? 200 : 403).json(body);
    });
    const server = http.createServer(app);
    t.after(() => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const denied = { status: 403, body: { ip: '127.0.0.1', ips: [] } };
    app.set('trust proxy', '127.0.0.0/8');
    assert.deepEqual(await request(server), denied, 'a request without forwarding headers uses its socket peer');
    assert.deepEqual(await request(server, forgedIP), {
      status: 200,
      body: { ip: forgedIP, ips: [forgedIP], protectedData: 'fixture-only secret' }
    }, 'a genuinely trusted proxy can still supply the client address');

    app.set('trust proxy', '::ffff:10.0.0.0/104');
    assert.deepEqual(await request(server, forgedIP), denied, 'the correctly spelled private subnet excludes loopback');

    app.set('trust proxy', subnet);
    assert.deepEqual(await request(server, forgedIP), denied,
      'an IPv4 socket outside the trust subnet must not expose protected data through a forged forwarding header');
  });
}
