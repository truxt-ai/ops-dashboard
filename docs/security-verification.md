# AXM-721 dependency verification

PR: [#110](https://github.com/truxt-ai/ops-dashboard/pull/110). Owner: Raunak
Poonia. This repair restores the approved frozen-test gate relaxed in `58864c1`;
independent host review, exact-head CI and formal acceptance remain pending.
No merge, deployment, release or restart is authorized.

| Advisory / alias | Frozen baseline → inherited resolved version | Fixture |
| --- | --- | --- |
| [GHSA-jqcg-44mw-7w3h / CVE-2026-90711](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | proxy-addr 2.0.7 → 2.0.8 | Short-prefix IPv6 trust and spoofed forwarding chain |
| [GHSA-8r9p-f939-6h3c / CVE-2026-111755](https://github.com/advisories/GHSA-8r9p-f939-6h3c) | follow-redirects 1.16.0 → 1.16.2 | Sensitive header names containing regex metacharacters |
| [GHSA-q3jh-wrc6-jgq8 / CVE-2026-111756](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8) | follow-redirects 1.16.0 → 1.16.2 | Array-form credentials across origins |
| [GHSA-pxg6-pf52-xh8x / CVE-2024-47764](https://github.com/advisories/GHSA-pxg6-pf52-xh8x) | cookie 0.5.0 → 0.7.2 | Invalid name, path and domain |
| [GHSA-m6fv-jmcg-4jfg / CVE-2024-43799](https://github.com/advisories/GHSA-m6fv-jmcg-4jfg) | send 0.18.0 → 0.19.2 | Untrusted directory redirect without an active link |

The merge imported master
[`a84002d5c256a3e7182849012f08276b35abffb3`](https://github.com/truxt-ai/ops-dashboard/tree/a84002d5c256a3e7182849012f08276b35abffb3),
including dependency upgrades and authentication/readiness changes. This repair
changes only the helper and report. It preserves the entire inherited manifest,
lockfile, application, tests and trusted Node 20 CI workflow. The helper pins
that immutable upstream revision, rejects further graph changes, checks every
installed target copy against its fixed floor and npm integrity, and limits the
PR diff against both pinned upstream and the live PR base. The packet specifies
follow-redirects 1.16.1 and send 0.19.0 exactly; inherited 1.16.2 and 0.19.2 meet
fixed floors but differ from those targets. Owner resolution must cover that
scope difference too; this repair introduces no downgrade or dependency change.

Fresh Node 24.15.0/npm 11.12.1 reproduction: baseline install/lint and **49/49**
tests; identical fixtures **14 intended assertion failures and 10 passing
controls** on baseline, then **24/24** passing on the inherited graph; inherited
suite **83/83**, full suite **107/107**, lint green. No configured build or
separate integration script exists. HTTP/EJS tests mock upstream calls; advisory
fixtures use bounded loopback servers. The helper self-check rejects **88**
malformed evidence/provenance controls (87 before this repair).

Fresh equivalent OSV 2.6.0 scans measured **175 identities/181 copies → 182/188**,
**52 raw/51 canonical → 0/0**. All **51** canonical findings are removed, **0**
remain and **0** are added. Five selected removals and 46 additional removals
are separately identifiable in `comparison.json`; the latter come from the
already merged upstream graph, not new upgrades by this repair. This is the
scanner's observation of these inputs, not a general vulnerability-free claim.
Historical AXM-720 totals were 51 raw/50 canonical; the fresh baseline includes
qs GHSA-6pq8-jhm2-2vcw / CVE-2026-110816. OSV uses a live advisory database with
no exposed pinned snapshot; raw advisory aliases/modified times and scan
commands, versions, UTC times, exit codes, input/output hashes are retained.

**Acceptance blocker — original-test preservation:** three original tests
(`health.test.js`, `health-freshness.test.js`, `service-health.test.js`) differ from
[dff02375's copies](https://github.com/truxt-ai/ops-dashboard/tree/dff02375d83394d6f03ce2127e35e62fadc269ab/test)
because master changed them before the merge; restoring those copies gives
**40 pass/9 fail** against master's authentication and readiness behavior in the
previous run. Commit `58864c1` substituted upstream preservation for the frozen
requirement; no owner exception appears in the supplied approved packet or
ticket comments. This repair restores comparison with `dff02375`, and adds a
negative control that rejects changed originals even when inherited unchanged
from upstream. A complete synthetic dependency inventory and a passing control
ensure that the regression reaches its intended preservation assertion. The
relaxed gate fails this new control; the repaired gate passes it. The real
candidate still fails frozen preservation: no exception or acceptance is
claimed. Owner resolution is required; application and test bytes are untouched.

The [reviewed new fixture](https://github.com/truxt-ai/ops-dashboard/blob/a48560d200e4932fc22f6b4035b1bb1b08495d28/test/security-dependencies.test.js)
remains byte-for-byte unchanged (SHA-256
`f578923f51cd99aee74ab676730926b6c9b57fbc1013205723443940bee4890c`).
[Inherited test sources](https://github.com/truxt-ai/ops-dashboard/tree/a84002d5c256a3e7182849012f08276b35abffb3/test)
and [candidate fixture sources](https://github.com/truxt-ai/ops-dashboard/tree/f5d55d54536cf0c5796f14feb1bac7deb19b52aa/test)
are immutable. The final helper/report head and fresh CI/QA links belong on
[AXM-721](https://axiom-stage.truxt.ai/b560f8c8/atlas/issues/AXM-721), avoiding a
report-only commit after checks.

These are library demonstrations. Proxy trust remains disabled; fixed-URL axios
requests lack the affected header shapes; the app sets no cookies and has no
affected redirect route. No current application exploitability is claimed.

## Reproduce and retain proof

Current-run durable proof root:
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T222327Z-5ec3a6-81572f/`.
`inherited-proof/` contains fresh baseline and inherited-head reproduction on
`58864c1`; its successful gate uses the relaxed upstream requirement and does
not establish approved acceptance. `gate-regression/` records assertion-level
red/green for the preservation repair using identical synthetic fixtures.
`candidate-proof/` is reserved for reproduction after the repair commit; it
retains measurements and exits 1 at frozen preservation. Earlier raw proof and
the restored-frozen-test run remain at
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T215250Z-10e07d/`.
These are local files, not uploaded artifacts. The implementation is not
independent QA.

```sh
export OSV_SCANNER=/data/tmp/vuln-demo-scan-20261026/bin/osv-scanner_linux_arm64
python3 -B scripts/security-verification.py verify . "$NEW_PROOF_DIRECTORY"
python3 -B scripts/security-verification.py selftest "$NEW_PROOF_DIRECTORY" "$SELFTEST_JSON"
```

`verify` requires a clean committed checkout. It reconstructs BASE and HEAD
from raw git objects and rehashes each blob. Every process gets a fresh HOME,
empty npm configuration, no inherited Node/npm settings, captured output and
its own process group. It checks source and installed-package digests after
each command. It runs baseline install/lint/full suite, copies the reviewed
fixture into that prepared baseline, verifies advisory-specific assertion reds,
and runs candidate install/lint/inherited suite/fixture/full suite. TAP counters
and test names must reconcile; skipped, cancelled or setup failures cannot
count as proof. The full suite must equal the inherited suite plus the fixture,
rather than the stale 49+24 assumption. Baseline count/fixture identity remain
pinned. All target copies and parent edges are inventoried.

The pinned scanner SHA-256 is
`2c71403eb443d05891c4f268c3ad771cf4f16e5443463fd7851ef8f454d3c7e4`.
All 27 historical manifest entries and the recorded empty scanner config were
freshly validated. Both lockfiles use equivalent coverage:

```sh
"$SCANNER" scan source --lockfile "$LOCKFILE" --no-ignore \
  --no-call-analysis=all --no-resolve --config "$EMPTY_CONFIG" \
  --all-packages --all-vulns --format json --output-file "$OUTPUT"
```

Finding exits (1) and clean exits (0) must match the raw reports; tool failures
fail verification. Complete package coverage, all aliases and every copy path
are reconciled. Added findings, missing selected aliases, unreconciled records,
dirty/moving heads, altered original tests and out-of-scope changes fail. Extra
removals are recorded instead of rejected merely for exceeding five. The
manifest hashes retained proof, including any `acceptance-gap.json`; a
measurement is never presented as acceptance.

`publication` repeats `verify` before fresh GitHub reads. It checks the open
same-repository PR, pinned ancestry, current scope, immutable input hashes,
fixture, successful first-attempt exact-head push CI with install/lint/test
steps, and stable PR/run state after verification. It cannot certify independent
QA. A PR merge-ref run is not exact-head
push CI. The workflow remains unchanged and uploads no artifacts. The user-authored
ticket comment `fa6c7c95-9d9d-4816-9aee-8f3034a885b6` records automatic native
rejection `ci_policy_workflow_modified` under the mission's `base_workflows`
policy. Required CI artifact publication therefore needs owner/platform
resolution; this repair does not bypass that rejection. Fresh native
publication of raw proof and independent QA remain outstanding.
Historical CI/artifacts do not certify this repair head.

Independent native QA uses host-injected `AXIOM_EVIDENCE_DIR` and declared flat
`.txt`/`.json`/`.jsonl` artifacts (10/check, 8 MiB/file, 50 files/32 MiB/task).
Ordinary implementation has no artifact uploader. No frozen source attachment,
TaskOutcome upload field or host credentials are used.

## Provenance and usage

Plan revision `3b34bfd2-ae78-4ebc-811f-6126a78e52c1`, digest
`cc45b2db3fbb3ab29a37a05a3ec448bb57c4075466e38e3f0145a447bfd8a626`;
input `7ac830713602a306ac91c3af56690e68725f9eaf4de877362cc59d615c801f17`;
requirements source `8b2deef0-5ccc-41aa-a819-e822b50ec373`; project
`4c1a7bf2-a879-4734-b17c-ee320a736be5`; wiki
`1cf873a8-4343-4aee-8de4-f708552514d9` (selected evidence partial; task mapping
and SEI context unavailable). Reviewer comment
`4719b0b0-2b2b-48e8-b7e4-d5fef638d4c4` owns this repair round.

Historical implementation-only receipt for run
`474300fa-4f29-4273-8cfa-9d39e8af23a8`: **162,492 input**, **41,772 output**,
**6,927,488 cached-input tokens**, **$2.13**. It excludes planning, coordinator
follow-ups and independent QA. This repair's input/output/cached-input tokens
and cost are **unrecorded**, not zero; current-run usage finalizes after
completion. The coordinator must append actual nonoverlapping receipts; the
planning allowance is not incurred cost.
