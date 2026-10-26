'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const proxyaddr = require('proxy-addr');
const { app } = require('../src/server');

for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
  test(`CVE-2026-90711: ${subnet} does not trust an arbitrary IPv4 client`, () => {
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

test('ordinary private proxy subnets still preserve the forwarded client address', () => {
  const trust = proxyaddr.compile('10.0.0.0/8');
  const request = {
    headers: { 'x-forwarded-for': '198.51.100.10' },
    connection: { remoteAddress: '10.1.2.3' },
  };
  assert.equal(proxyaddr(request, trust), '198.51.100.10');
  assert.equal(trust('203.0.113.9'), false);
});

test('the dashboard keeps proxy trust disabled by default', () => {
  assert.equal(app.get('trust proxy'), false);
});
