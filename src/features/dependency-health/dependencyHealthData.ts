import runtime from './dependencyHealthData.js';
import type {
  DependencyAuditSource,
  DependencyHealthSummary,
} from './dependencyHealth.ts';

export type DependencyHealthDataSource = DependencyAuditSource;

type DependencyHealthDataRuntime = {
  STORED_DEPENDENCY_AUDIT: DependencyAuditSource;
  dependencyHealthSummary: DependencyHealthSummary;
  buildDependencyHealthSummary(source?: DependencyHealthDataSource): DependencyHealthSummary;
  getDependencyHealthSummary(source?: DependencyHealthDataSource): DependencyHealthSummary;
};

const dependencyHealthDataRuntime = runtime as DependencyHealthDataRuntime;

export const STORED_DEPENDENCY_AUDIT =
  dependencyHealthDataRuntime.STORED_DEPENDENCY_AUDIT;
export const dependencyHealthSummary =
  dependencyHealthDataRuntime.dependencyHealthSummary;

export function buildDependencyHealthSummary(
  source?: DependencyHealthDataSource,
): DependencyHealthSummary {
  return dependencyHealthDataRuntime.buildDependencyHealthSummary(source);
}

export const getDependencyHealthSummary = buildDependencyHealthSummary;
