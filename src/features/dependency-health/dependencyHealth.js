'use strict';

const DEPENDENCY_SEVERITY_ORDER = Object.freeze([
  'critical',
  'high',
  'moderate',
  'low',
  'info',
]);

const CLEAN_DEPENDENCY_HEALTH_TEXT =
  'No known dependency vulnerabilities.';

function createEmptyCounts() {
  return {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
  };
}

function toDisplayCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return Math.floor(count);
}

function normalizeSeverity(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const severity = value.toLowerCase();

  if (severity === 'medium') {
    return 'moderate';
  }

  return DEPENDENCY_SEVERITY_ORDER.includes(severity) ? severity : null;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSeverityCountKeys(source) {
  const severityKeys = DEPENDENCY_SEVERITY_ORDER.concat('medium');

  return severityKeys.some((severity) => {
    if (!(severity in source)) {
      return false;
    }

    const value = source[severity];
    return value === null || value === undefined || typeof value !== 'object';
  });
}

function readCounts(source) {
  const counts = createEmptyCounts();

  if (!isRecord(source)) {
    return counts;
  }

  DEPENDENCY_SEVERITY_ORDER.forEach((severity) => {
    counts[severity] = toDisplayCount(source[severity]);
  });

  counts.moderate = Math.max(
    counts.moderate,
    toDisplayCount(source.medium),
  );

  return counts;
}

function addCounts(target, counts) {
  DEPENDENCY_SEVERITY_ORDER.forEach((severity) => {
    target[severity] += counts[severity];
  });
}

function readVulnerabilitySeverity(vulnerability) {
  if (typeof vulnerability === 'string') {
    return normalizeSeverity(vulnerability);
  }

  if (!vulnerability) {
    return null;
  }

  const directSeverity = normalizeSeverity(vulnerability.severity);

  if (directSeverity) {
    return directSeverity;
  }

  if (Array.isArray(vulnerability.via)) {
    for (const via of vulnerability.via) {
      const viaSeverity =
        typeof via === 'string'
          ? normalizeSeverity(via)
          : isRecord(via)
            ? normalizeSeverity(via.severity)
            : null;

      if (viaSeverity) {
        return viaSeverity;
      }
    }
  }

  return null;
}

function countVulnerabilities(source) {
  const counts = createEmptyCounts();

  if (Array.isArray(source)) {
    source.forEach((vulnerability) => {
      const severity = readVulnerabilitySeverity(vulnerability);

      if (severity) {
        counts[severity] += 1;
      }
    });

    return counts;
  }

  if (!isRecord(source)) {
    return counts;
  }

  if (hasSeverityCountKeys(source)) {
    return readCounts(source);
  }

  Object.values(source).forEach((vulnerability) => {
    const severity = readVulnerabilitySeverity(vulnerability);

    if (severity) {
      counts[severity] += 1;
    }
  });

  return counts;
}

function collectCounts(input) {
  if (input === null || input === undefined) {
    return createEmptyCounts();
  }

  if (Array.isArray(input)) {
    return countVulnerabilities(input);
  }

  if (!isRecord(input)) {
    return createEmptyCounts();
  }

  if (
    isRecord(input.metadata) &&
    isRecord(input.metadata.vulnerabilities) &&
    hasSeverityCountKeys(input.metadata.vulnerabilities)
  ) {
    return readCounts(input.metadata.vulnerabilities);
  }

  if (input.counts) {
    return readCounts(input.counts);
  }

  if (input.severityCounts) {
    return readCounts(input.severityCounts);
  }

  if (hasSeverityCountKeys(input)) {
    return readCounts(input);
  }

  const counts = createEmptyCounts();

  if (input.vulnerabilities) {
    addCounts(counts, countVulnerabilities(input.vulnerabilities));
  }

  if (input.advisories) {
    addCounts(counts, countVulnerabilities(input.advisories));
  }

  return counts;
}

function formatDependencyHealthLabel(severity, count) {
  const noun = count === 1 ? 'vulnerability' : 'vulnerabilities';
  return `${count} ${severity} ${noun}`;
}

function normalizeDependencyAudit(input) {
  const counts = collectCounts(input);
  const items = [];

  DEPENDENCY_SEVERITY_ORDER.forEach((severity) => {
    const count = counts[severity];

    if (count > 0) {
      items.push({
        severity,
        count,
        label: formatDependencyHealthLabel(severity, count),
      });
    }
  });

  const total = items.reduce((sum, item) => sum + item.count, 0);
  const isClean = total === 0;

  return {
    counts,
    items,
    total,
    isClean,
    text: isClean
      ? CLEAN_DEPENDENCY_HEALTH_TEXT
      : items.map((item) => item.label).join(', '),
  };
}

module.exports = {
  CLEAN_DEPENDENCY_HEALTH_TEXT,
  DEPENDENCY_SEVERITY_ORDER,
  formatDependencyHealthLabel,
  normalizeDependencyAudit,
};
