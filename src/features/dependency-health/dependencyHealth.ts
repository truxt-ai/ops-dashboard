export type DependencySeverity =
  | 'critical'
  | 'high'
  | 'moderate'
  | 'low'
  | 'info';

export type DependencySeverityCounts = Record<DependencySeverity, number>;

export type DependencyHealthItem = {
  severity: DependencySeverity;
  count: number;
  label: string;
};

export type DependencyHealthSummary = {
  counts: DependencySeverityCounts;
  items: DependencyHealthItem[];
  total: number;
  isClean: boolean;
  text: string;
};

export type DependencyVulnerabilityRecord = {
  severity?: string | null;
  [key: string]: unknown;
};

export type DependencyAuditCountSource = Partial<
  Record<DependencySeverity | 'medium' | 'total', unknown>
>;

export type DependencyAuditObjectSource = {
  vulnerabilities?:
    | DependencyAuditCountSource
    | DependencyVulnerabilityRecord[]
    | Record<string, DependencyVulnerabilityRecord | string | null | undefined>
    | null;
  advisories?:
    | DependencyVulnerabilityRecord[]
    | Record<string, DependencyVulnerabilityRecord | string | null | undefined>
    | null;
  metadata?: {
    vulnerabilities?: DependencyAuditCountSource | null;
    [key: string]: unknown;
  } | null;
  counts?: DependencyAuditCountSource | null;
  severityCounts?: DependencyAuditCountSource | null;
  [key: string]: unknown;
};

export type DependencyAuditSource =
  | DependencyAuditObjectSource
  | DependencyAuditCountSource
  | DependencyVulnerabilityRecord[]
  | null
  | undefined;

export const DEPENDENCY_SEVERITY_ORDER: readonly DependencySeverity[] = [
  'critical',
  'high',
  'moderate',
  'low',
  'info',
];

export const CLEAN_DEPENDENCY_HEALTH_TEXT =
  'No known dependency vulnerabilities.';

function createEmptyCounts(): DependencySeverityCounts {
  return {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
  };
}

function toDisplayCount(value: unknown): number {
  const count = Number(value);

  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return Math.floor(count);
}

function normalizeSeverity(value: unknown): DependencySeverity | null {
  if (typeof value !== 'string') {
    return null;
  }

  const severity = value.toLowerCase();

  if (severity === 'medium') {
    return 'moderate';
  }

  return DEPENDENCY_SEVERITY_ORDER.includes(severity as DependencySeverity)
    ? (severity as DependencySeverity)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSeverityCountKeys(source: Record<string, unknown>): boolean {
  const severityKeys = [...DEPENDENCY_SEVERITY_ORDER, 'medium'];

  return severityKeys.some((severity) => {
    if (!(severity in source)) {
      return false;
    }

    const value = source[severity];
    return value === null || value === undefined || typeof value !== 'object';
  });
}

function readCounts(source: unknown): DependencySeverityCounts {
  const counts = createEmptyCounts();

  if (!isRecord(source)) {
    return counts;
  }

  for (const severity of DEPENDENCY_SEVERITY_ORDER) {
    counts[severity] = toDisplayCount(source[severity]);
  }

  counts.moderate = Math.max(
    counts.moderate,
    toDisplayCount(source.medium),
  );

  return counts;
}

function addCounts(
  target: DependencySeverityCounts,
  counts: DependencySeverityCounts,
): void {
  for (const severity of DEPENDENCY_SEVERITY_ORDER) {
    target[severity] += counts[severity];
  }
}

function readVulnerabilitySeverity(
  vulnerability: DependencyVulnerabilityRecord | string | null | undefined,
): DependencySeverity | null {
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

function countVulnerabilities(source: unknown): DependencySeverityCounts {
  const counts = createEmptyCounts();

  if (Array.isArray(source)) {
    for (const vulnerability of source) {
      const severity = readVulnerabilitySeverity(
        vulnerability as DependencyVulnerabilityRecord | string,
      );

      if (severity) {
        counts[severity] += 1;
      }
    }

    return counts;
  }

  if (!isRecord(source)) {
    return counts;
  }

  if (hasSeverityCountKeys(source)) {
    return readCounts(source);
  }

  for (const vulnerability of Object.values(source)) {
    const severity = readVulnerabilitySeverity(
      vulnerability as DependencyVulnerabilityRecord | string | null,
    );

    if (severity) {
      counts[severity] += 1;
    }
  }

  return counts;
}

function collectCounts(input: DependencyAuditSource): DependencySeverityCounts {
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

function formatDependencyHealthLabel(
  severity: DependencySeverity,
  count: number,
): string {
  const noun = count === 1 ? 'vulnerability' : 'vulnerabilities';
  return `${count} ${severity} ${noun}`;
}

export function normalizeDependencyAudit(
  input: DependencyAuditSource,
): DependencyHealthSummary {
  const counts = collectCounts(input);
  const items: DependencyHealthItem[] = [];

  for (const severity of DEPENDENCY_SEVERITY_ORDER) {
    const count = counts[severity];

    if (count > 0) {
      items.push({
        severity,
        count,
        label: formatDependencyHealthLabel(severity, count),
      });
    }
  }

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
