'use strict';

// Render the services table as CSV so operators can export the current
// snapshot from the dashboard. Header row first, then one row per service.

function escapeCell(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(services) {
  const header = ['name', 'requests', 'errors'];
  const rows = (services || []).map((s) =>
    [s.name, s.requests, s.errors].map(escapeCell).join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

module.exports = { toCsv };
