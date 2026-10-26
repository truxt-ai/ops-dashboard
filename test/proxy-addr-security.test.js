'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const proxyaddr = createRequire(require.resolve('express'))('proxy-addr');
const { app } = require('../src/server');

// Regression design: GHSA-jqcg-44mw-7w3h and PR107 (712d9c36).
// Atlas AXM-714 reruns this design against a fresh baseline and candidate.
for (const [id, subnet] of [['S1', '::ffff:10.0.0.0/8'], ['S2', '::/1']]) {
  test(`${id}: CVE-2026-90711: ${subnet} does not trust an arbitrary IPv4 client`, () => {
    const trust = proxyaddr.compile(subnet);
    for (const remoteAddress of ['203.0.113.9', '::ffff:203.0.113.9']) {
      const request = {
        headers: { 'x-forwarded-for': '192.0.2.99' },
        connection: { remoteAddress },
      };
      assert.equal(trust(remoteAddress), false, 'the direct client must remain untrusted');
      assert.equal(proxyaddr(request, trust), remoteAddress,
        'an untrusted client must not select its address through X-Forwarded-For');
    }
  });
}

test('C1: ordinary private proxy subnets preserve the forwarded client address', () => {
  const trust = proxyaddr.compile('10.0.0.0/8');
  const request = {
    headers: { 'x-forwarded-for': '198.51.100.10' },
    connection: { remoteAddress: '10.1.2.3' },
  };
  assert.equal(trust('10.1.2.3'), true);
  assert.equal(proxyaddr(request, trust), '198.51.100.10');
  assert.equal(trust('203.0.113.9'), false);
});

test('C2: untrusted clients cannot select their address and dashboard proxy trust stays disabled', () => {
  const trust = proxyaddr.compile('10.0.0.0/8');
  const request = {
    headers: { 'x-forwarded-for': '192.0.2.99' },
    connection: { remoteAddress: '203.0.113.9' },
  };
  assert.equal(trust(request.connection.remoteAddress), false);
  assert.equal(proxyaddr(request, trust), '203.0.113.9');
  assert.equal(app.get('trust proxy'), false);
});
