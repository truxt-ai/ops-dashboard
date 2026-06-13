'use strict';

const SERVICE_HEALTH_STATES = [
  {
    key: 'healthy',
    label: 'Healthy',
    description: 'Operating normally',
  },
  {
    key: 'degraded',
    label: 'Degraded',
    description: 'Needs attention',
  },
  {
    key: 'offline',
    label: 'Offline',
    description: 'Unavailable',
  },
];

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function normalizeServiceHealthStatus(service) {
  const rawStatus = typeof service === 'string'
    ? service
    : service && (service.status || service.health || service.healthStatus);

  if (typeof rawStatus !== 'string') {
    return null;
  }

  const normalizedStatus = rawStatus.trim().toLowerCase();
  if (SERVICE_HEALTH_STATES.some((state) => state.key === normalizedStatus)) {
    return normalizedStatus;
  }

  return null;
}

function getServiceHealthLabel(status) {
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : null;
  const state = SERVICE_HEALTH_STATES.find((item) => item.key === normalizedStatus);

  return state ? state.label : 'Unknown';
}

function formatCount(count, label) {
  return `${count} ${label.toLowerCase()} ${pluralize(count, 'service', 'services')}`;
}

function joinCountParts(parts) {
  if (parts.length <= 1) {
    return parts[0] || '';
  }

  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function buildProblemMessage(counts) {
  const parts = [];

  if (counts.degraded > 0) {
    parts.push(formatCount(counts.degraded, 'degraded'));
  }

  if (counts.offline > 0) {
    parts.push(formatCount(counts.offline, 'offline'));
  }

  if (counts.unknown > 0) {
    parts.push(`${counts.unknown} ${pluralize(counts.unknown, 'service', 'services')} with unknown health`);
  }

  return `Attention needed: ${joinCountParts(parts)}.`;
}

function buildServiceHealthSummary(services) {
  const serviceList = Array.isArray(services) ? services : [];
  const counts = {
    healthy: 0,
    degraded: 0,
    offline: 0,
    unknown: 0,
  };

  serviceList.forEach((service) => {
    const status = normalizeServiceHealthStatus(service);

    if (status) {
      counts[status] += 1;
    } else {
      counts.unknown += 1;
    }
  });

  const total = serviceList.length;
  const problemCount = counts.degraded + counts.offline + counts.unknown;
  const hasServices = total > 0;
  const isAllHealthy = hasServices && problemCount === 0;
  const state = !hasServices ? 'empty' : isAllHealthy ? 'healthy' : 'attention';
  const message = !hasServices
    ? 'Service health data unavailable.'
    : isAllHealthy
      ? 'All services healthy.'
      : buildProblemMessage(counts);

  const items = SERVICE_HEALTH_STATES.map((item) => ({
    key: item.key,
    label: item.label,
    description: item.description,
    count: counts[item.key],
    countLabel: formatCount(counts[item.key], item.label),
    ariaLabel: `${item.label}: ${counts[item.key]} ${pluralize(counts[item.key], 'service', 'services')}`,
  }));

  return {
    total,
    counts,
    items,
    state,
    message,
    hasServices,
    hasProblems: problemCount > 0,
    isAllHealthy,
  };
}

module.exports = {
  SERVICE_HEALTH_STATES,
  buildServiceHealthSummary,
  getServiceHealthLabel,
  normalizeServiceHealthStatus,
  summarizeServiceHealth: buildServiceHealthSummary,
};
