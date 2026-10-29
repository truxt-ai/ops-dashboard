# AXM-721 dependency verification

PR: [#110](https://github.com/truxt-ai/ops-dashboard/pull/110). Owner: Raunak Poonia.
Reviewer comment `4719b0b0-2b2b-48e8-b7e4-d5fef638d4c4` requested restoration
at reviewed head `abb3f44`. This repair restores `health.test.js`,
`health-freshness.test.js` and `service-health.test.js` from frozen baseline
`dff02375d83394d6f03ce2127e35e62fadc269ab`. All five original files now match
that baseline byte-for-byte, and the preservation/scope gate passes. The helper
permits restoration paths but requires exact baseline bytes locally and at the
remote head. Controls reject inherited drift and altered remote originals;
all 89 negative controls pass. Application, dependency, advisory-fixture and
CI-workflow bytes are unchanged in this repair.

| Fresh check, Node 24.15.0 / npm 11.12.1 | Result |
| --- | --- |
| Baseline install, lint, original suite | Pass; 49/49 tests |
| Identical advisory fixture on baseline | 14 intended assertion failures; 10 passing controls |
| Advisory fixture on candidate | 24/24 pass |
| Restored originals on inherited application | 40 pass / 9 fail |
| Full candidate suite | 100 pass / 9 fail; 109 tests, none skipped/cancelled |
| Candidate install and lint | Pass |
| Preservation and allowed scope | Pass; all five original hashes match |
| Paired OSV 2.6.0 scans | 52 raw / 51 canonical → 0 / 0; 51 removed, 0 remaining, 0 added |

**Acceptance is blocked by application compatibility.** Seven health tests expect
baseline upstream readiness and unauthenticated upstream requests; merged master
provides local readiness and authenticated cached upstream probes with sanitized
errors. Two dashboard tests expect unauthenticated rendering; master requires
authentication. Restoring originals reveals these conflicts without changing any
assertion. The full verifier fails at `final-existing`; passing preservation does
not establish acceptance. Application changes exceed approved scope and would
also conflict with inherited security tests. Coordinator direction is required.
No bypass, preload, test filtering or application rollback is introduced. Two
restored tests explain the increase from 107 to 109 tests. No separate build or
integration script is configured; HTTP/EJS tests mock upstream calls and advisory
fixtures use bounded loopback servers.

| Advisory / alias | Frozen baseline → inherited resolution | Library fixture |
| --- | --- | --- |
| GHSA-jqcg-44mw-7w3h / CVE-2026-90711 | proxy-addr 2.0.7 → 2.0.8 | Short-prefix IPv6 trust and spoofed forwarding chain |
| GHSA-8r9p-f939-6h3c / CVE-2026-111755 | follow-redirects 1.16.0 → 1.16.2 | Sensitive names containing regex metacharacters |
| GHSA-q3jh-wrc6-jgq8 / CVE-2026-111756 | follow-redirects 1.16.0 → 1.16.2 | Array-form credentials across origins |
| GHSA-pxg6-pf52-xh8x / CVE-2024-47764 | cookie 0.5.0 → 0.7.2 | Invalid name, path and domain |
| GHSA-m6fv-jmcg-4jfg / CVE-2024-43799 | send 0.18.0 → 0.19.2 | Untrusted directory redirect without an active link |

The graph remains inherited from merged master
[`a84002d5c256a3e7182849012f08276b35abffb3`](https://github.com/truxt-ai/ops-dashboard/tree/a84002d5c256a3e7182849012f08276b35abffb3).
The packet specifies follow-redirects 1.16.1 and send 0.19.0 exactly; inherited
1.16.2 and 0.19.2 meet fixed floors but require owner resolution of that difference.
The brace-expansion/js-yaml overrides and entire graph are checked against pinned
upstream. Every installed target copy and parent edge is inventoried. Five selected
removals and 46 additional removals are separately reconciled; additional removals
follow upstream upgrades, not new upgrades here. Fresh scan coverage is 175
identities/181 copies → 182/188. Historical AXM-720 measured 51 raw/50 canonical;
the fresh baseline additionally reports qs GHSA-6pq8-jhm2-2vcw / CVE-2026-110816.
Zero candidate findings is the pinned scanner's observation, not a general claim
of no vulnerabilities. OSV has a live database without an exposed pinned snapshot;
aliases and modification times are retained in raw reports.

Proxy trust remains disabled; fixed-URL axios calls lack the affected header
shapes; the app sets no cookies and has no affected redirect route. These are
library demonstrations without a claim of current application exploitability.

## Reproduction and publication

Fresh durable proof root:
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T223608Z-713f21-19ddb4/`.
Precommit checks retain full argv, UTC times, versions, exits, logs and input/output
hashes. Final committed-head measurements and immutable candidate links belong on
[AXM-721](https://axiom-stage.truxt.ai/b560f8c8/atlas/issues/AXM-721), avoiding a
report-only commit after verification. Local files are not uploaded artifacts.
`original-test-hashes.json` compares all five originals;
`preservation-scope.json` records the passing gate. Helper controls use the prior
run's attributed `candidate-proof` data solely for synthetic evidence checks, not
current application verification. The identical helper fixture fails the prior
path-scope rule's restoration assertion and passes the repaired rule. Application
tests and scans are separate fresh measurements.

[Frozen original sources](https://github.com/truxt-ai/ops-dashboard/tree/dff02375d83394d6f03ce2127e35e62fadc269ab/test)
and the [reviewed advisory fixture](https://github.com/truxt-ai/ops-dashboard/blob/a48560d200e4932fc22f6b4035b1bb1b08495d28/test/security-dependencies.test.js)
are immutable. The fixture SHA-256 remains
`f578923f51cd99aee74ab676730926b6c9b57fbc1013205723443940bee4890c`.

```sh
export OSV_SCANNER=/data/tmp/vuln-demo-scan-20261026/bin/osv-scanner_linux_arm64
python3 -B scripts/security-verification.py verify . "$NEW_PROOF_DIRECTORY"
python3 -B scripts/security-verification.py scope . "$SCOPE_JSON"
```

`verify` reconstructs BASE and clean committed HEAD from verified raw Git blobs,
isolates process environments, verifies source and installed-package hashes,
and fails on command errors. It currently stops at the real existing-suite
failure; individual remaining commands are measurements, not a successful
verifier run. Scanner SHA-256 is
`2c71403eb443d05891c4f268c3ad771cf4f16e5443463fd7851ef8f454d3c7e4`.
Paired scans use the recorded empty configuration with equivalent flags:

```sh
"$SCANNER" scan source --lockfile "$LOCKFILE" --no-ignore --no-call-analysis=all --no-resolve --config "$EMPTY_CONFIG" --all-packages --all-vulns --format json --output-file "$OUTPUT"
```

Finding exits (1) differ from clean exits (0) and tool errors. Full reconciliation
preserves all aliases and paths. The workflow is unchanged: ticket comment
`fa6c7c95-9d9d-4816-9aee-8f3034a885b6` records automatic rejection
`ci_policy_workflow_modified` under native `base_workflows` policy. Required CI
artifact publication needs owner/platform resolution; this repair does not bypass
that rejection. Fresh CI and independent host QA follow the produced head;
prior-head green CI does not certify it. This run must not wait on CI. Formal
acceptance remains separate. No merge, deployment, release or restart occurs.

Native QA uses host-injected `AXIOM_EVIDENCE_DIR` and declared flat txt/json/jsonl
artifacts (10/check, 8 MiB/file, 50 files/32 MiB/task). Ordinary implementation
has no arbitrary uploader. No new source attachment, fabricated upload field or
host credential is used.

## Sources and usage

Plan revision `3b34bfd2-ae78-4ebc-811f-6126a78e52c1`, digest
`cc45b2db3fbb3ab29a37a05a3ec448bb57c4075466e38e3f0145a447bfd8a626`;
input `7ac830713602a306ac91c3af56690e68725f9eaf4de877362cc59d615c801f17`;
requirements `8b2deef0-5ccc-41aa-a819-e822b50ec373`; project
`4c1a7bf2-a879-4734-b17c-ee320a736be5`; wiki
`1cf873a8-4343-4aee-8de4-f708552514d9`. Selected evidence is partial;
task mapping and SEI context are unavailable.

Historical implementation-only receipt, run
`474300fa-4f29-4273-8cfa-9d39e8af23a8`: 162,492 input, 41,772 output,
6,927,488 cached-input tokens, $2.13. It excludes planning, coordinator and QA.
This dispatch's input/output/cached tokens and cost are unrecorded, not zero;
native current-run usage finalizes after completion. The coordinator must append
actual nonoverlapping receipts; budget allowances are not incurred cost.
