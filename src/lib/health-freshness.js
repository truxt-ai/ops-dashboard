'use strict';

function presentHealthFreshness(lastSuccessfulRefreshAt, now = () => new Date()) {
  const refreshedAt = new Date(lastSuccessfulRefreshAt);
  const isoTimestamp = refreshedAt.toISOString();
  const stale = now() - refreshedAt > 300000;
  const label = `${stale ? 'Stale: last updated' : 'Last updated'} ${isoTimestamp.slice(11, 16)} UTC`;
  return { isoTimestamp, label, stale };
}

module.exports = { presentHealthFreshness };
