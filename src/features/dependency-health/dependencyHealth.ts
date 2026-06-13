import runtime from './dependencyHealth.js';

export type DependencySeverity =
  | 'critical'
  | 'high'
  | 'moderate'
  | 'low'
  | 'info';

export type DependencyHealthStatus = 'clean' | 'at-risk';

export type DependencySeverityCounts = Record<DependencySeverity, number>;

export type DependencyHealthItem = {
  severity: DependencySeverity;
  count: number;
  label: string;
};

export type DependencyHealthDependency = {
  name: string;
  severity: DependencySeverity;
  risk: DependencySeverity;
  riskLabel: string;
  currentVersion: string | null;
  version: string | null;
  vulnerableRange: string | null;
  fixedVersion: string | null;
  remediation: string;
  direct: boolean | null;
  isDirect: boolean | null;
  title: string | null;
  url: string | null;
  label: string;
  versionLabel: string;
};

export type DependencyHealthSummary = {
  status: DependencyHealthStatus;
  statusLabel: string;
  highestSeverity: DependencySeverity | null;
  counts: DependencySeverityCounts;
  items: DependencyHealthItem[];
  dependencies: DependencyHealthDependency[];
  total: number;
  isClean: boolean;
  generatedAt: string | null;
  sourceLabel: string;
  text: string;
};

export type DependencyVulnerabilityRecord = {
  name?: string | null;
  severity?: string | null;
  risk?: string | null;
  level?: string | null;
  currentVersion?: string | null;
  current?: string | null;
  installedVersion?: string | null;
  version?: string | null;
  fixedVersion?: string | null;
  fixed?: string | null;
  remediation?: string | null;
  recommendation?: string | null;
  fixAvailable?: boolean | { version?: string | null } | null;
  via?: Array<string | { severity?: string | null; title?: string | null; url?: string | null }>;
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
  dependencies?:
    | DependencyVulnerabilityRecord[]
    | Record<string, DependencyVulnerabilityRecord | string | null | undefined>
    | null;
  metadata?: {
    vulnerabilities?: DependencyAuditCountSource | null;
    generatedAt?: string | null;
    generated_at?: string | null;
    [key: string]: unknown;
  } | null;
  counts?: DependencyAuditCountSource | null;
  severityCounts?: DependencyAuditCountSource | null;
  generatedAt?: string | null;
  generated_at?: string | null;
  sourceLabel?: string | null;
  source_label?: string | null;
  [key: string]: unknown;
};

export type DependencyAuditSource =
  | DependencyAuditObjectSource
  | DependencyAuditCountSource
  | DependencyVulnerabilityRecord[]
  | null
  | undefined;

type DependencyHealthRuntime = {
  CLEAN_DEPENDENCY_HEALTH_TEXT: string;
  DEFAULT_SOURCE_LABEL: string;
  DEPENDENCY_SEVERITY_ORDER: readonly DependencySeverity[];
  REMEDIATION_FALLBACK: string;
  normalizeDependencyAudit(input: DependencyAuditSource): DependencyHealthSummary;
};

const dependencyHealthRuntime = runtime as DependencyHealthRuntime;

export const DEPENDENCY_SEVERITY_ORDER =
  dependencyHealthRuntime.DEPENDENCY_SEVERITY_ORDER;
export const CLEAN_DEPENDENCY_HEALTH_TEXT =
  dependencyHealthRuntime.CLEAN_DEPENDENCY_HEALTH_TEXT;
export const DEFAULT_SOURCE_LABEL = dependencyHealthRuntime.DEFAULT_SOURCE_LABEL;
export const REMEDIATION_FALLBACK = dependencyHealthRuntime.REMEDIATION_FALLBACK;

export function normalizeDependencyAudit(
  input: DependencyAuditSource,
): DependencyHealthSummary {
  return dependencyHealthRuntime.normalizeDependencyAudit(input);
}
