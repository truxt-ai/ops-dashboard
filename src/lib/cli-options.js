'use strict';

const minimist = require('minimist');

function resolvePort(argv, env = process.env) {
  const args = minimist(argv);
  return args.port || env.PORT || 3000;
}

module.exports = { resolvePort };
