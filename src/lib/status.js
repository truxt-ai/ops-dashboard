'use strict';

const pkg = require('../../package.json');

function normalizeUptimeSeconds(value) {
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }

  return process.uptime();
}

function buildStatusPayload(options = {}) {
  return {
    status: 'ok',
    uptimeSeconds: normalizeUptimeSeconds(options.uptimeSeconds),
    version: typeof options.version === 'string' ? options.version : pkg.version,
  };
}

module.exports = { buildStatusPayload };
