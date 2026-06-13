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
const DEFAULT_SOURCE_LABEL = 'Dependency audit';
const REMEDIATION_FALLBACK = 'Review dependency advisory.';

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

function severityRank(severity) {
  const index = DEPENDENCY_SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? DEPENDENCY_SEVERITY_ORDER.length : index;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function hasAnyCount(counts) {
  return DEPENDENCY_SEVERITY_ORDER.some((severity) => counts[severity] > 0);
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

  const directSeverity =
    normalizeSeverity(vulnerability.severity) ||
    normalizeSeverity(vulnerability.risk) ||
    normalizeSeverity(vulnerability.level);

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

function readNestedString(record, keys) {
  for (const key of keys) {
    const value = stringValue(record[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function readFindingVersion(record) {
  if (!Array.isArray(record.findings)) {
    return null;
  }

  for (const finding of record.findings) {
    if (isRecord(finding)) {
      const version = stringValue(finding.version);

      if (version) {
        return version;
      }
    }
  }

  return null;
}

function readFirstViaRecord(record) {
  if (!Array.isArray(record.via)) {
    return null;
  }

  return record.via.find((via) => isRecord(via)) || null;
}

function readFixedVersion(record) {
  const explicit = readNestedString(record, [
    'fixedVersion',
    'fixed',
    'patchedVersion',
    'recommendedVersion',
    'targetVersion',
  ]);

  if (explicit) {
    return explicit;
  }

  if (isRecord(record.fixAvailable)) {
    const fixVersion = stringValue(record.fixAvailable.version);

    if (fixVersion) {
      return fixVersion;
    }
  }

  const patchedVersions = readNestedString(record, [
    'patchedVersions',
    'patched_versions',
  ]);

  if (patchedVersions && patchedVersions !== '<0.0.0') {
    return patchedVersions;
  }

  return null;
}

function readRemediation(record, fixedVersion, name) {
  const explicit = readNestedString(record, [
    'remediation',
    'recommendation',
    'fix',
    'resolution',
  ]);

  if (explicit) {
    return explicit;
  }

  if (isRecord(record.fixAvailable)) {
    const fixVersion = stringValue(record.fixAvailable.version);

    if (fixVersion) {
      return `Upgrade ${name} to ${fixVersion}.`;
    }
  }

  if (record.fixAvailable === true) {
    return 'Upgrade to a patched version.';
  }

  if (record.fixAvailable === false) {
    return 'No fix available.';
  }

  if (fixedVersion) {
    return `Upgrade ${name} to ${fixedVersion}.`;
  }

  return REMEDIATION_FALLBACK;
}

function readDependencyName(record, fallbackName) {
  return (
    readNestedString(record, [
      'name',
      'module_name',
      'moduleName',
      'package',
      'packageName',
      'dependency',
    ]) || stringValue(fallbackName) || 'unknown dependency'
  );
}

function normalizeDependencyRecord(value, fallbackName) {
  if (typeof value === 'string') {
    const severity = normalizeSeverity(value);

    if (!severity || !fallbackName) {
      return null;
    }

    return {
      name: fallbackName,
      severity,
      risk: severity,
      riskLabel: `${capitalize(severity)} risk`,
      currentVersion: null,
      version: null,
      vulnerableRange: null,
      fixedVersion: null,
      remediation: REMEDIATION_FALLBACK,
      direct: null,
      isDirect: null,
      title: null,
      url: null,
      label: `${fallbackName} ${severity} risk`,
      versionLabel: 'Version unavailable',
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const severity = readVulnerabilitySeverity(value);

  if (!severity) {
    return null;
  }

  const name = readDependencyName(value, fallbackName);
  const viaRecord = readFirstViaRecord(value);
  const currentVersion =
    readNestedString(value, [
      'currentVersion',
      'current',
      'installedVersion',
      'version',
      'foundVersion',
    ]) || readFindingVersion(value);
  const vulnerableRange = readNestedString(value, [
    'vulnerableRange',
    'vulnerableVersions',
    'vulnerable_versions',
    'range',
  ]);
  const fixedVersion = readFixedVersion(value);
  const remediation = readRemediation(value, fixedVersion, name);
  const direct =
    typeof value.isDirect === 'boolean'
      ? value.isDirect
      : typeof value.direct === 'boolean'
        ? value.direct
        : null;
  const title =
    readNestedString(value, ['title', 'advisoryTitle']) ||
    (viaRecord ? readNestedString(viaRecord, ['title']) : null);
  const url =
    readNestedString(value, ['url', 'advisoryUrl']) ||
    (viaRecord ? readNestedString(viaRecord, ['url']) : null);
  const versionLabel = currentVersion || vulnerableRange || 'Version unavailable';

  return {
    name,
    severity,
    risk: severity,
    riskLabel: `${capitalize(severity)} risk`,
    currentVersion,
    version: currentVersion,
    vulnerableRange,
    fixedVersion,
    remediation,
    direct,
    isDirect: direct,
    title,
    url,
    label: `${name} ${severity} risk`,
    versionLabel,
  };
}

function normalizeDependencyCollection(source) {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source
      .map((dependency) => normalizeDependencyRecord(dependency))
      .filter(Boolean);
  }

  if (!isRecord(source) || hasSeverityCountKeys(source)) {
    return [];
  }

  return Object.entries(source)
    .map(([name, dependency]) => normalizeDependencyRecord(dependency, name))
    .filter(Boolean);
}

function collectDependencies(input) {
  if (input === null || input === undefined) {
    return [];
  }

  if (Array.isArray(input)) {
    return normalizeDependencyCollection(input);
  }

  if (!isRecord(input)) {
    return [];
  }

  const dependencies = [];

  if (input.dependencies) {
    dependencies.push(...normalizeDependencyCollection(input.dependencies));
  }

  if (input.vulnerabilities) {
    dependencies.push(...normalizeDependencyCollection(input.vulnerabilities));
  }

  if (input.advisories) {
    dependencies.push(...normalizeDependencyCollection(input.advisories));
  }

  if (!dependencies.length && readVulnerabilitySeverity(input)) {
    dependencies.push(normalizeDependencyRecord(input));
  }

  return dedupeDependencies(dependencies);
}

function dedupeDependencies(dependencies) {
  const byName = new Map();

  dependencies.forEach((dependency) => {
    if (!dependency) {
      return;
    }

    const existing = byName.get(dependency.name);

    if (!existing || severityRank(dependency.severity) < severityRank(existing.severity)) {
      byName.set(dependency.name, dependency);
    }
  });

  return Array.from(byName.values()).sort((a, b) => {
    const severityDelta = severityRank(a.severity) - severityRank(b.severity);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return a.name.localeCompare(b.name);
  });
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

function countDependencies(dependencies) {
  const counts = createEmptyCounts();

  dependencies.forEach((dependency) => {
    if (dependency.severity) {
      counts[dependency.severity] += 1;
    }
  });

  return counts;
}

function explicitCountsFromInput(input) {
  if (!isRecord(input)) {
    return null;
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

  if (isRecord(input.vulnerabilities) && hasSeverityCountKeys(input.vulnerabilities)) {
    return readCounts(input.vulnerabilities);
  }

  return null;
}

function collectCounts(input, dependencies) {
  if (input === null || input === undefined) {
    return createEmptyCounts();
  }

  if (Array.isArray(input)) {
    return countVulnerabilities(input);
  }

  const explicitCounts = explicitCountsFromInput(input);

  if (explicitCounts && (hasAnyCount(explicitCounts) || !dependencies.length)) {
    return explicitCounts;
  }

  if (dependencies.length) {
    return countDependencies(dependencies);
  }

  if (!isRecord(input)) {
    return createEmptyCounts();
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

function readGeneratedAt(input) {
  if (!isRecord(input)) {
    return null;
  }

  const direct = readNestedString(input, [
    'generatedAt',
    'generated_at',
    'createdAt',
    'created_at',
    'timestamp',
  ]);

  if (direct) {
    return direct;
  }

  if (isRecord(input.metadata)) {
    return readNestedString(input.metadata, [
      'generatedAt',
      'generated_at',
      'createdAt',
      'created_at',
      'timestamp',
    ]);
  }

  return null;
}

function readSourceLabel(input) {
  if (!isRecord(input)) {
    return DEFAULT_SOURCE_LABEL;
  }

  const direct = readNestedString(input, ['sourceLabel', 'source_label', 'tool']);

  if (direct) {
    return direct;
  }

  if (isRecord(input.source)) {
    const source = readNestedString(input.source, ['label', 'name']);

    if (source) {
      return source;
    }
  }

  if ('auditReportVersion' in input || 'auditReportVersion' in (input.metadata || {})) {
    return 'npm audit';
  }

  return DEFAULT_SOURCE_LABEL;
}

function highestSeverityFromCounts(counts) {
  return DEPENDENCY_SEVERITY_ORDER.find((severity) => counts[severity] > 0) || null;
}

function formatDependencyHealthLabel(severity, count) {
  const noun = count === 1 ? 'vulnerability' : 'vulnerabilities';
  return `${count} ${severity} ${noun}`;
}

function normalizeDependencyAudit(input) {
  const dependencies = collectDependencies(input);
  const counts = collectCounts(input, dependencies);
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
  const highestSeverity = highestSeverityFromCounts(counts);
  const status = isClean ? 'clean' : 'risk';
  const statusLabel = isClean ? 'Clean' : `${capitalize(highestSeverity)} risk`;

  return {
    status,
    statusLabel,
    highestSeverity,
    counts,
    items,
    dependencies,
    total,
    isClean,
    generatedAt: readGeneratedAt(input),
    sourceLabel: readSourceLabel(input),
    text: isClean
      ? CLEAN_DEPENDENCY_HEALTH_TEXT
      : items.map((item) => item.label).join(', '),
  };
}

module.exports = {
  CLEAN_DEPENDENCY_HEALTH_TEXT,
  DEFAULT_SOURCE_LABEL,
  DEPENDENCY_SEVERITY_ORDER,
  REMEDIATION_FALLBACK,
  formatDependencyHealthLabel,
  normalizeDependencyAudit,
};
