# AXM-708 fresh worker QA report

Candidate [PR107](https://github.com/truxt-ai/ops-dashboard/pull/107), `712d9c36395d58996689763523d7fe8ba9b7fbae` on `raunakTruxt/axm-708-db9dc0`; baseline `dff02375d83394d6f03ce2127e35e62fadc269ab`. Worker technical validation and hosted CI pass; independent reviews, actual user reviews, publication and final accounting remain open.

| Result | Evidence |
| --- | --- |
| Existing tests | **49 passed**, zero failures/skips at untouched baseline; [raw run](baseline/tests.txt), [HTTP coverage](baseline/coverage.md), [versions](baseline/versions.txt) |
| Security regression | **2 intended assertion failures + 2 controls passed** on 2.0.7; **4 passed** on 2.0.8 with identical bytes; [red](vulnerable/regression.txt), [green](candidate/regression.txt), [inputs and provenance](fixtures.md), [digest](vulnerable/fixture.json) |
| Full suite | **53 passed**, zero failures/skips; [raw exact-head run](candidate/full-suite.txt), [lint passed](candidate/lint.txt), [installed/locked 2.0.8](candidate/versions.txt), [scope evidence](scope-review.md) |
| CI | **Passed** on the exact head; [hosted PR run](https://github.com/truxt-ai/ops-dashboard/actions/runs/40295522832), [CI identity](delivery/ci-readback.txt), [actual hosted command log](delivery/ci-log.txt), [open/unmerged PR identity](delivery/pr.json). Reference [PR106](https://github.com/truxt-ai/ops-dashboard/pull/106) is not this execution's candidate or CI proof. |
| Rescan | **50 → 49**, selected alias group removed, zero additions; all **49 remaining findings open**. [Baseline raw](scans/baseline.json), [exact-head raw](scans/final-head.json), [full comparison](scans/comparison.json), [remaining inventory](scans/comparison.md), [baseline command](scans/baseline-command.txt), [head command](scans/final-head-command.txt) |
| Usage | **181,485 fresh input / 26,214 output tokens so far**, native event 2026-10-26T08:58:09.449Z; [actual snapshot](usage.json). Final billed cost, separate planning and independent QA usage unavailable; estimates are not actuals. |

Proof is preserved outside `.axiom` at `/data/work-root/qa-evidence/AXM-708-db9dc0`, with [index](evidence-index.md). Baseline evidence has additionally been transferred by the coordinator to the independent AXM-711 task; no frozen AXM-708 fields or attachments were changed by this worker. This prepared report is not the plan-required user publication or Raunak's personal CHECK-4/CHECK-7 review. Agent-assisted scope review must be attributed to its actual performer.

[AXM-711's attributable result](delivery/baseline-review-comments.json) reports independent 49-test/lint/OSV reruns passing, but its review is **blocked** because it did not access the original evidence tree; the coordinator has provided a downloadable attachment for recovery. That result is not a completed baseline-evidence review. Independent vulnerable-proof, PR/CI, scan-delta and final reviews remain open; the actual user review/publication and final execution/planning accounting are also completion gaps.

The application keeps Express trust proxy disabled. Regression results establish dependency behavior under the advisory precondition, not current application exploitability. No merge, deployment, runtime restart, external service change, test suppression or unrelated upgrade was performed. [Source plan and lineage](approved-packet.json) remain authoritative; pending sequential independent-review gates are not certified by this worker's implementation results.
