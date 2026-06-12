'use strict';

const SEVERITIES = ['critical', 'high', 'moderate', 'low'];

function normalizeCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function formatRiskSummary(counts) {
  const source = counts && typeof counts === 'object' ? counts : {};
  const parts = SEVERITIES
    .map((severity) => {
      const count = normalizeCount(source[severity]);
      return count > 0 ? `${count} ${severity}` : null;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '0 vulnerabilities';
}

module.exports = { formatRiskSummary };
