Upgrades only proxy-addr 2.0.7 → 2.0.8 for CVE-2026-90711 / GHSA-jqcg-44mw-7w3h, retaining a fixed-minimum override and four advisory-grounded regression/control cases. Reuses [PR106](https://github.com/truxt-ai/ops-dashboard/pull/106) as implementation reference, preserving its test filename and strengthening C2 with an actual untrusted-client forwarding decision. The separate candidate uses AXM-708's required native branch; reference results are not counted as fresh execution.

| Check | Fresh worker result |
| --- | --- |
| Existing tests | 49 passed at baseline dff02375d83394d6f03ce2127e35e62fadc269ab |
| Security regression | 2 intended assertion failures + 2 passing controls on 2.0.7; identical four cases pass on 2.0.8 |
| Full suite | 53 passed, zero failed/skipped; lint passed under Node 20.20.2 / npm 10.8.2 |
| CI | Coordinator to attach hosted results for exact head 712d9c36395d58996689763523d7fe8ba9b7fbae |
| Rescan | Live OSV 2.6.0: 175 packages on both revisions; 50 → 49 findings, only target removed, zero additions |
| Usage | Native token snapshot available in proof; final billed execution cost and separate planning usage remain outstanding |

All 49 other findings remain open. The application's Express trust proxy stays disabled; these fixtures establish dependency behavior under the advisory precondition, not current application exploitability. Existing application source, tests, overrides and CI are preserved. Complete durable worker proof is at `/data/work-root/qa-evidence/AXM-708-db9dc0/qa-report.md`; coordinator must provide accessible native evidence links before delivery is accepted. Actual human review and independent verification are not claimed by this implementation report. Leave open and unmerged; no deployment or runtime restart.
