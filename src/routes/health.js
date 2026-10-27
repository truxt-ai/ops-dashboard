'use strict';

const { probeUpstream } = require('../lib/status-probe');

function registerHealth(app) {
  app.get('/health/live', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', async (req, res) => {
    try {
      await probeUpstream();
      res.json({ upstream: 'ok' });
    } catch {
      res.status(503).json({ upstream: 'unreachable' });
    }
  });

  // Proxy a health probe through axios so the dependency is genuinely exercised.
  app.get('/health/upstream', async (req, res) => {
    try {
      const r = await probeUpstream();
      res.json({ upstream: 'ok', status: r.status });
    } catch (err) {
      res.status(502).json({ upstream: 'unreachable', error: err.message });
    }
  });
}

module.exports = { registerHealth };
