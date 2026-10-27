'use strict';

const axios = require('axios');

// The client is injectable so the job can be exercised without the network.
function syncMetrics(snapshot, { url = process.env.UPSTREAM_SYNC_URL, client = axios } = {}) {
  if (!url) throw new Error('UPSTREAM_SYNC_URL is not set');
  return client.post(url, snapshot, { timeout: 5000 });
}

module.exports = { syncMetrics };
