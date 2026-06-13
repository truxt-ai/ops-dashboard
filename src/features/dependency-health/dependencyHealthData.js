'use strict';

const { normalizeDependencyAudit } = require('./dependencyHealth');

function buildDependencyHealthSummary(source = null) {
  return normalizeDependencyAudit(source);
}

const dependencyHealthSummary = buildDependencyHealthSummary();

module.exports = {
  buildDependencyHealthSummary,
  dependencyHealthSummary,
  getDependencyHealthSummary: buildDependencyHealthSummary,
};
