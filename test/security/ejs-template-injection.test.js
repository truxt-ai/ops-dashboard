'use strict';

// Security regression test — ejs template injection
// Advisory: GHSA-phwq-j96m-2c2q (ejs Server-Side Template Injection -> code execution)
// Vulnerable: ejs 2.5.7 (installed)   Fixed: ejs 6.0.1 (remediation bump)
//
// In ejs <3.1.7 the `localsName` render option is concatenated verbatim into the
// generated template function source (node_modules/ejs/lib/ejs.js: `with (<localsName> || {})`).
// An attacker who controls that option escapes the `with` statement and runs arbitrary
// JavaScript at render time. ejs 6.0.1 rejects a localsName that is not a valid JS
// identifier, so the injected code never executes.
//
// RED proof: on ejs 2.5.7 the canary fires (code executed) -> assertion fails.
// GREEN proof: on ejs 6.0.1 render throws "localsName is not a valid JS identifier",
//              the canary never fires -> assertion passes. The test body is unchanged.

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');

const CANARY = '__ejs_ssti_canary_atl96';

test('ejs must not execute code injected through the localsName option (GHSA-phwq-j96m-2c2q)', () => {
  delete globalThis[CANARY];

  // Payload escapes `with (<localsName> || {})` and runs an assignment expression
  // at render time. On vulnerable ejs this sets the canary on globalThis.
  const payload = 'locals=(globalThis.' + CANARY + '=true)';

  try {
    ejs.render('<%= 1 %>', {}, { localsName: payload });
  } catch (_e) {
    // Patched ejs refuses the invalid localsName identifier and never compiles it.
  }

  const injectionExecuted = globalThis[CANARY] === true;
  delete globalThis[CANARY];

  assert.strictEqual(
    injectionExecuted,
    false,
    'attacker-controlled localsName executed injected code (template injection / RCE)'
  );
});
