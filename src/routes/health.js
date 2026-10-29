'use strict';

const { probeUpstream } = require('../lib/status-probe');

function registerHealth(app) {
  let cachedProbe;
  let expiresAt = 0;

  app.get('/health/live', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Proxy a health probe through axios so the dependency is genuinely exercised.
  app.get('/health/upstream', async (req, res) => {
    if (!cachedProbe || Date.now() >= expiresAt) {
      // Share in-flight work too; the TTL starts when the probe settles.
      expiresAt = Infinity;
      cachedProbe = (async () => {
        try {
          const r = await probeUpstream();
          return { status: 200, body: { upstream: 'ok', status: r.status } };
        } catch (err) {
          console.error('Upstream probe failed', err);
          return { status: 502, body: { upstream: 'unreachable', error: 'upstream unavailable' } };
        } finally {
          expiresAt = Date.now() + 15000;
        }
      })();
    }
    const result = await cachedProbe;
    res.status(result.status).json(result.body);
  });
}

module.exports = { registerHealth };
