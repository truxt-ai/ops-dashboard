'use strict';

const { buildMetrics } = require('./lib/metrics');
const { syncMetrics } = require('./jobs/upstream-sync');

syncMetrics(buildMetrics())
  .then((r) => {
    // eslint-disable-next-line no-console
    console.log(`metrics synced: ${r.status}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`metrics sync failed: ${err.message}`);
    process.exitCode = 1;
  });
