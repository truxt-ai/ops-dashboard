'use strict';

// Stable top-level entry point for the promo module. The implementation lives in
// ./lib/promoCodes.js (the single source of truth); this re-export lets callers
// import it as either '../src/promoCodes' or '../src/lib/promoCodes'.
module.exports = require('./lib/promoCodes');
