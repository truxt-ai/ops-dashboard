'use strict';

function buildStatusPayload({ uptimeSeconds, version }) {
  const numericUptime = Number(uptimeSeconds);
  const safeUptime = Number.isFinite(numericUptime) && numericUptime >= 0 ? numericUptime : 0;

  return {
    status: 'up',
    uptime_seconds: safeUptime,
    version,
  };
}

module.exports = { buildStatusPayload };
