# AXM-683 / TD-87 implementation evidence

Source: existing [TD-87](https://truxt.atlassian.net/browse/TD-87), UoW-1,
approved plan revision `4fb320fa-97fa-4e07-83ce-f5cf557368b8`,
mission `01a163cd-38c9-757f-be47-a9e4974f1674`,
implementation attempt `01a163cd-3a74-7435-82a1-58e8e84017e4`.
Baseline: `dff0237` (TD-86 / PR #103). Verification performed 2026-10-22 UTC
using Node v24.15.0 and npm 11.12.1.

## Test-first sequence

1. Added `test/service-health-summary.test.js`, using the existing node:test,
   EJS fixture rendering and local HTTP patterns in `test/service-health.test.js`
   and `test/health-freshness.test.js`. No production files changed.
2. Ran `node --test test/service-health-summary.test.js`: six failures, each
   reporting `service health summary is visible` because markup was absent.
   Full output: [tests-before.txt](tests-before.txt). Commit `f159fce` retains
   those tests and failures before production changes.
3. Updated only `views/dashboard.ejs` in production. Counts use the existing
   presented `status` from `src/lib/service-health.js`, initialize all states to
   zero, and introduce no classifier thresholds. The summary follows freshness
   and precedes the table wrapper. Positive failing reuses the existing
   `service-status--failing` class; zero failing omits it.
4. New acceptance tests: six pass ([output](summary-tests-after.txt)).
   `npm test`: 55 pass, zero fail ([output](npm-test.txt)).
   `npm run lint`: exit 0 ([output](npm-lint.txt)). `git diff --check` passes.

## Acceptance case results

| Case | Result | Evidence |
| --- | --- | --- |
| TD87-TC-01 | Pass: Healthy 2, Degraded 1, Failing 3; each count matches table statuses and total six; summary precedes wrapper | New acceptance test |
| TD87-TC-02 | Pass: 0.99%, 1%, 4.99%, 5% and zero requests produce 2 / 2 / 1 | New acceptance test using `presentServices` |
| TD87-TC-03 | Pass: nonempty fixture shows 1 / 1 / 0 without failing emphasis | Acceptance test and zero-failing screenshot |
| TD87-TC-04 | Pass: empty fixture shows 0 / 0 / 0 without failing emphasis | New acceptance test |
| TD87-TC-05 | Pass: positive failing has #fee2e2 background, #991b1b text, weight 700; zero failing has transparent background and weight 400 | Acceptance test, computed browser styles and screenshots |
| TD87-TC-06 | Pass: actual GET / returns 200 and 1 / 1 / 1; row order, metrics and freshness preserved | New HTTP acceptance test and existing regression suite |
| TD87-TC-07 | Pass: six missing-feature failures retained before implementation, followed by passing full test and lint commands | Logs above and test-first commit |
| TD87-TC-08 | Pass: real GET / screenshots at 1280 × 900 and 390 × 844; all counts readable above the table; positive failing wraps at 390 px | Screenshots and browser-results.json |

## Browser evidence

Chromium headless shell revision 1243 was controlled with Playwright. Browser
tooling was installed only in excluded `.axiom/browser`; project dependencies
and shipped sample data were unchanged. Actual Express `app` served `/` on an
ephemeral loopback port. A separate local fixture server rendered the same EJS
template with `presentServices([{name: 'healthy', requests: 100, errors: 0},
{name: 'degraded', requests: 100, errors: 1}])` for the zero-failing comparison.

- [Desktop, actual /, 1280 × 900](shipped-1280.png)
- [Mobile, actual /, 390 × 844](shipped-390.png)
- [Zero-failing fixture, 390 × 844](zero-failing-390.png)
- [Viewport, computed styles and geometry](browser-results.json)

Browser assertions confirmed HTTP 200, exact labels/counts, summary outside
and above the scroll wrapper, all summary elements within the viewport,
document width equal to viewport width and table scrollLeft equal to zero.
Visual inspection of all three screenshots confirmed readable counts and the
positive/zero styling difference. The existing mobile table continues to scroll
independently at its existing minimum width of 480 px.

These are implementer checks; independent host review and verification follow
the produced head. No review approval, CI result, deployment or merge is claimed.
