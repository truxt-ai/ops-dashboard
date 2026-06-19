'use strict';

const SEVERITIES = ['critical', 'high', 'moderate', 'low'];
const SEVERITY_ORDER = new Map(SEVERITIES.map((severity, index) => [severity, index]));

function emptySummary() {
  return {
    total: 0,
    bySeverity: {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    },
    top: [],
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function usableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSeverity(value) {
  const severity = usableString(value);
  if (!severity) return null;

  const normalized = severity.toLowerCase();
  return SEVERITY_ORDER.has(normalized) ? normalized : null;
}

function packageNameFrom(vulnerabilityKey, vulnerability) {
  return usableString(vulnerability.name) || usableString(vulnerabilityKey);
}

function advisoryPackageName(advisory, fallbackPackage) {
  return (
    usableString(advisory.name) ||
    usableString(advisory.package) ||
    usableString(advisory.dependency) ||
    usableString(advisory.module_name) ||
    fallbackPackage
  );
}

function collectAdvisory(summaryTop, vulnerability, vulnerabilityPackage, discoveryIndex) {
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];

  for (const item of via) {
    if (!isObject(item)) continue;

    const severity = normalizeSeverity(item.severity);
    const title = usableString(item.title);
    const packageName = advisoryPackageName(item, vulnerabilityPackage);
    if (!severity || !title || !packageName) continue;

    summaryTop.push({
      package: packageName,
      severity,
      title,
      discoveryIndex: discoveryIndex.next,
    });
    discoveryIndex.next += 1;
  }
}

function summarizeNpmAuditRisk(auditReport) {
  const summary = emptySummary();
  if (!isObject(auditReport) || !isObject(auditReport.vulnerabilities)) {
    return summary;
  }

  const discoveredTop = [];
  const discoveryIndex = { next: 0 };

  for (const [vulnerabilityKey, vulnerability] of Object.entries(auditReport.vulnerabilities)) {
    if (!isObject(vulnerability)) continue;

    const severity = normalizeSeverity(vulnerability.severity);
    const vulnerabilityPackage = packageNameFrom(vulnerabilityKey, vulnerability);
    if (!severity || !vulnerabilityPackage) continue;

    summary.total += 1;
    summary.bySeverity[severity] += 1;
    collectAdvisory(discoveredTop, vulnerability, vulnerabilityPackage, discoveryIndex);
  }

  summary.top = discoveredTop
    .sort((left, right) => {
      const severityDifference = SEVERITY_ORDER.get(left.severity) - SEVERITY_ORDER.get(right.severity);
      if (severityDifference !== 0) return severityDifference;
      return left.discoveryIndex - right.discoveryIndex;
    })
    .slice(0, 3)
    .map(({ package: packageName, severity, title }) => ({
      package: packageName,
      severity,
      title,
    }));

  return summary;
}

module.exports = { summarizeNpmAuditRisk };
