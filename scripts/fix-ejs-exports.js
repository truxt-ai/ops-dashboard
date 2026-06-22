#!/usr/bin/env node
// EJS 6.x added a strict `exports` field that omits `./package.json`.
// Node's `require('ejs/package.json')` throws ERR_PACKAGE_PATH_NOT_EXPORTED
// unless we add the subpath. This postinstall script patches the installed
// copy so test helpers that do `require('ejs/package.json').version` work.
'use strict';
const fs = require('fs');
const path = require('path');
const pkgPath = path.join(__dirname, '..', 'node_modules', 'ejs', 'package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  // Valid form: exports must have subpath keys AND the '.' entry must wrap conditions.
  const needsFix = pkg.exports && !pkg.exports['.'];
  if (needsFix) {
    // EJS 6.x exports only top-level conditions (import/require) without subpaths.
    // Node.js forbids mixing subpath keys (./foo) with condition keys at the same
    // level, so we nest the original conditions under '.' and add './package.json'.
    const conditions = {};
    for (const [k, v] of Object.entries(pkg.exports)) {
      if (!k.startsWith('./')) conditions[k] = v;
    }
    pkg.exports = {
      './package.json': './package.json',
      '.': conditions,
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('fix-ejs-exports: restructured ejs exports to include ./package.json');
  }
} catch (e) {
  // non-fatal: older ejs versions don't have the exports field
  if (e.code !== 'ENOENT') console.warn('fix-ejs-exports:', e.message);
}
