'use strict';

const axios = require('axios');

const UPSTREAM_URL = 'https://example.com';
const TIMEOUT_MS = 2000;

// The client is injectable so the probe can be exercised without the network.
function probeUpstream(client = axios) {
  return client.get(UPSTREAM_URL, { timeout: TIMEOUT_MS });
}

module.exports = { probeUpstream, UPSTREAM_URL, TIMEOUT_MS };
