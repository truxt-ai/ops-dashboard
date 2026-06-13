'use strict';

const { normalizeDependencyAudit } = require('./dependencyHealth');

const STORED_DEPENDENCY_AUDIT = Object.freeze({
  sourceLabel: 'npm audit',
  generatedAt: null,
  dependencies: Object.freeze([
    Object.freeze({
      name: 'lodash',
      severity: 'critical',
      currentVersion: '4.17.4',
      fixedVersion: '4.17.21',
      remediation: 'Upgrade lodash to 4.17.21.',
      direct: true,
    }),
    Object.freeze({
      name: 'minimist',
      severity: 'high',
      currentVersion: '1.2.0',
      fixAvailable: false,
      direct: true,
    }),
  ]),
});

function buildDependencyHealthSummary(source = STORED_DEPENDENCY_AUDIT) {
  return normalizeDependencyAudit(source);
}

const dependencyHealthSummary = buildDependencyHealthSummary();

module.exports = {
  STORED_DEPENDENCY_AUDIT,
  buildDependencyHealthSummary,
  dependencyHealthSummary,
  getDependencyHealthSummary: buildDependencyHealthSummary,
};
