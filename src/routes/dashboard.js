'use strict';

const { buildMetrics } = require('../lib/metrics');
const { presentHealthFreshness } = require('../lib/health-freshness');

function registerDashboard(app) {
  app.get('/', (req, res) => {
    const metrics = buildMetrics();
    const freshness = presentHealthFreshness(metrics.lastSuccessfulRefreshAt);
    res.render('dashboard', { metrics, freshness });
  });
}

module.exports = { registerDashboard };
