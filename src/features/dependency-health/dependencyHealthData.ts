import {
  normalizeDependencyAudit,
  type DependencyAuditSource,
  type DependencyHealthSummary,
} from './dependencyHealth.ts';

export type DependencyHealthDataSource = DependencyAuditSource;

export function buildDependencyHealthSummary(
  source: DependencyHealthDataSource = null,
): DependencyHealthSummary {
  return normalizeDependencyAudit(source);
}

export const getDependencyHealthSummary = buildDependencyHealthSummary;

export const dependencyHealthSummary = buildDependencyHealthSummary();
