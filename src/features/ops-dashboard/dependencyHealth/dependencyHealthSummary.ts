export type DependencySeverity = 'critical' | 'high' | 'moderate' | 'low';

export type VulnerabilityCounts = Partial<
  Record<DependencySeverity, number | null | undefined>
>;

export type DependencyHealthSummaryItem = {
  severity: DependencySeverity;
  count: number;
  label: string;
};

export type DependencyHealthSummary = {
  items: DependencyHealthSummaryItem[];
  isClean: boolean;
  text: string;
};

export type NpmAuditVulnerabilityCounts = Partial<
  Record<DependencySeverity | 'info' | 'total', number | null | undefined>
>;

export type NpmAuditMetadata = {
  vulnerabilities?: NpmAuditVulnerabilityCounts | null;
};

export type NpmAuditResult = {
  metadata?: NpmAuditMetadata | null;
};

export const DEPENDENCY_SEVERITY_ORDER: readonly DependencySeverity[] = [
  'critical',
  'high',
  'moderate',
  'low',
];

export const CLEAN_DEPENDENCY_HEALTH_TEXT =
  'No known dependency vulnerabilities.';

function toPositiveFiniteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function formatDependencyHealthLabel(
  severity: DependencySeverity,
  count: number,
): string {
  const noun = count === 1 ? 'vulnerability' : 'vulnerabilities';
  return `${count} ${severity} ${noun}`;
}

export function summarizeDependencyHealth(
  counts?: VulnerabilityCounts | null,
): DependencyHealthSummary {
  const source = counts ?? {};
  const items: DependencyHealthSummaryItem[] = [];

  for (const severity of DEPENDENCY_SEVERITY_ORDER) {
    const count = toPositiveFiniteCount(source[severity]);

    if (count) {
      items.push({
        severity,
        count,
        label: formatDependencyHealthLabel(severity, count),
      });
    }
  }

  const isClean = items.length === 0;

  return {
    items,
    isClean,
    text: isClean
      ? CLEAN_DEPENDENCY_HEALTH_TEXT
      : items.map((item) => item.label).join(', '),
  };
}

export function dependencyCountsFromNpmAuditVulnerabilities(
  vulnerabilities?: NpmAuditVulnerabilityCounts | null,
): VulnerabilityCounts {
  const source = vulnerabilities ?? {};

  return {
    critical: source.critical,
    high: source.high,
    moderate: source.moderate,
    low: source.low,
  };
}

export function dependencyCountsFromNpmAuditMetadata(
  metadata?: NpmAuditMetadata | null,
): VulnerabilityCounts {
  return dependencyCountsFromNpmAuditVulnerabilities(metadata?.vulnerabilities);
}

export function dependencyCountsFromNpmAudit(
  audit?: NpmAuditResult | null,
): VulnerabilityCounts {
  return dependencyCountsFromNpmAuditMetadata(audit?.metadata);
}

export function summarizeDependencyHealthFromNpmAuditVulnerabilities(
  vulnerabilities?: NpmAuditVulnerabilityCounts | null,
): DependencyHealthSummary {
  return summarizeDependencyHealth(
    dependencyCountsFromNpmAuditVulnerabilities(vulnerabilities),
  );
}

export function summarizeDependencyHealthFromNpmAuditMetadata(
  metadata?: NpmAuditMetadata | null,
): DependencyHealthSummary {
  return summarizeDependencyHealth(
    dependencyCountsFromNpmAuditMetadata(metadata),
  );
}

export function summarizeNpmAuditDependencyHealth(
  audit?: NpmAuditResult | null,
): DependencyHealthSummary {
  return summarizeDependencyHealth(dependencyCountsFromNpmAudit(audit));
}
