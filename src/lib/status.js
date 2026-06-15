'use strict';

const { version } = require('../../package.json');

function buildStatus() {
  return {
    status: 'up',
    uptime: process.uptime(),
    version,
  };
}

module.exports = { buildStatus };
