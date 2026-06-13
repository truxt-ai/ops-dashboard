'use strict';

const SUPPORTED_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const ALL_CLEAR_SUMMARY = 'No known dependency vulnerabilities.';

function toPositiveCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

function formatDependencyRiskSummary(counts = {}) {
  const source = counts || {};
  const parts = SUPPORTED_SEVERITIES
    .map((severity) => {
      const count = toPositiveCount(source[severity]);
      if (!count) return null;
      const noun = count === 1 ? 'vulnerability' : 'vulnerabilities';
      return `${count} ${severity} ${noun}`;
    })
    .filter(Boolean);

  return parts.length ? parts.join(', ') : ALL_CLEAR_SUMMARY;
}

module.exports = { formatDependencyRiskSummary };
