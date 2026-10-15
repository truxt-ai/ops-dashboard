'use strict';

// Security regression test — ATL-211
// Advisory: GHSA-phwq-j96m-2c2q (CVE-2022-29078) — ejs template injection / RCE
// Vulnerable: ejs 2.5.7 (installed). Fixed: ejs >= 3.1.7 (audit fix: 6.0.1).
//
// The advisory: ejs concatenates compile-time options into the source of the
// generated template function WITHOUT validating them. The `localsName` option
// is emitted both as a function parameter and inside the `with (...)` header
// (node_modules/ejs/lib/ejs.js:512,549 in 2.5.7), so an attacker who controls it
// escapes the string context and runs arbitrary JS. The fix (3.1.7+, carried
// into 6.x) validates that these options are bare JS identifiers and throws
// otherwise, so the payload never reaches the compiled function.
//
// Proof obligation (dependency boundary): feed an option-injection payload and
// assert the attacker callback NEVER runs. The payload avoids parentheses (so it
// slips past V8's Function-parameter parser) and uses a tagged-template call to
// fire the marker. RED on 2.5.7 (callback fires during render); GREEN on the
// patched version (option rejected as "not a valid JS identifier").

const { test } = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');

test('ejs option injection does not execute attacker code (GHSA-phwq-j96m-2c2q)', () => {
  let executed = false;
  global.__ejs_injection_marker = () => { executed = true; };

  // `localsName` is injected raw into the compiled function. The default-value
  // expression `= global.__ejs_injection_marker``` runs when the function is
  // invoked during render. No parentheses, so V8 does not reject the param list.
  const payload = 'locals = global.__ejs_injection_marker``';

  try {
    ejs.render('<p>hello</p>', {}, { localsName: payload });
  } catch (err) {
    // Patched ejs throws "localsName is not a valid JS identifier" — the option
    // was rejected before compilation, which is the fix working as intended.
  } finally {
    delete global.__ejs_injection_marker;
  }

  assert.strictEqual(
    executed,
    false,
    'ejs compiled and executed an injected compile option (template injection / RCE reachable)',
  );
});
