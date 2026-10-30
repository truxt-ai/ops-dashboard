# AXM-721 dependency verification

[PR #110](https://github.com/truxt-ai/ops-dashboard/pull/110), owner Raunak Poonia,
implements approved plan `c6d004c1-fcc7-4d84-92b8-0c9251a24bcc`, digest
`2b825f8e8b6076f8f35509da9da748a39862514e5447e083dc6ad4af48bef263`.
This revision supersedes the earlier historical-test restoration requirement.

Three identities are deliberately separate:

- [Historical vulnerable tests, dff02375](https://github.com/truxt-ai/ops-dashboard/tree/dff02375d83394d6f03ce2127e35e62fadc269ab/test): disposable reproduction only.
- [Preserved master tests, a84002d5](https://github.com/truxt-ai/ops-dashboard/tree/a84002d5c256a3e7182849012f08276b35abffb3/test): every original test, both package inputs and CI must match byte for byte.
- Final candidate: immutable source, CI and independent QA links are published on
  [AXM-721](https://axiom-stage.truxt.ai/b560f8c8/atlas/issues/AXM-721) after pushing,
  avoiding report-only commits that invalidate verification.

Only this report, `scripts/security-verification.py` and
`test/security-dependencies.test.js` differ from the preservation base. Existing
master upgrades, including [#117](https://github.com/truxt-ai/ops-dashboard/pull/117)
and [#118](https://github.com/truxt-ai/ops-dashboard/pull/118), supplied the dependency
fixes; this PR adds proof and preserves the entire dependency graph and overrides.

| Advisory (linked authoritative semantics) / CVE alias | Historical → preserved resolution | Regression |
| --- | --- | --- |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) / CVE-2026-90711 | proxy-addr 2.0.7 → 2.0.8 | Short-prefix IPv6 proxy trust |
| [GHSA-8r9p-f939-6h3c](https://github.com/advisories/GHSA-8r9p-f939-6h3c) / CVE-2026-111755 | follow-redirects 1.16.0 → 1.16.2 | Sensitive header regex metacharacters |
| [GHSA-q3jh-wrc6-jgq8](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8) / CVE-2026-111756 | follow-redirects 1.16.0 → 1.16.2 | Array-form credentials across origins |
| [GHSA-pxg6-pf52-xh8x](https://github.com/advisories/GHSA-pxg6-pf52-xh8x) / CVE-2024-47764 | cookie 0.5.0 → 0.7.2 | Invalid name, path and domain |
| [GHSA-m6fv-jmcg-4jfg](https://github.com/advisories/GHSA-m6fv-jmcg-4jfg) / CVE-2024-43799 | send 0.18.0 → 0.19.2 | Directory redirect without an active link |

The higher inherited versions meet the approved fixed floors. The unchanged
[reviewed fixture](https://github.com/truxt-ai/ops-dashboard/blob/a48560d200e4932fc22f6b4035b1bb1b08495d28/test/security-dependencies.test.js)
has SHA-256 `f578923f51cd99aee74ab676730926b6c9b57fbc1013205723443940bee4890c`.
It tests every locked target copy, observes loopback destinations and includes
benign controls. Assertion failures qualify as red proof; setup errors do not.
Proxy trust remains disabled. Current axios callers supply no affected header
shapes; the app sets no cookies and adds no redirect route. These demonstrate
library behavior without claiming current application exploitability.

| Evidence before this commit, Node 24.15.0 / npm 11.12.1 | Result |
| --- | --- |
| Fresh install, lint, full candidate suite | Pass; 107/107 tests, no skips/cancellations |
| Preservation and three-path scope | Pass |
| Helper synthetic negative controls | 102 rejected, valid records accepted |
| Earlier historical reproduction, retained as reference | 49 original tests pass; identical fixture has 14 intended failures and 10 passing controls |
| Earlier paired OSV scans, retained as reference | 52 raw / 51 canonical → 0 / 0; 51 removed, none remaining/added |

Final committed-head commands, measured counts, fresh paired scans and hashes are
retained beneath
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261030T005334Z-acf573-6bc977/`.
Precommit negative controls use attributed earlier proof solely as synthetic data;
final verification runs them again against fresh proof. No separate build or
integration script is configured; existing HTTP/EJS tests mock upstream services.

```sh
export OSV_SCANNER=/data/tmp/vuln-demo-scan-20261026/bin/osv-scanner_linux_arm64
python3 -B scripts/security-verification.py verify . "$NEW_PROOF_DIRECTORY"
python3 -B scripts/security-verification.py selftest "$NEW_PROOF_DIRECTORY" "$SELFTEST_JSON"
```

The helper reconstructs raw Git blobs, preserves historical/base/candidate hashes,
records argv, UTC times, Node/npm versions, exits and runner counts, inventories
locked/installed copies and parent paths, and checks source/package integrity.
It rejects missing scan exits, incomplete aliases/inventories, changed package or
test bytes, wrong preservation bases, mismatched fixtures and stale heads.

The remediation round after `e59a1c9` also binds each scan result to the supplied
absolute lockfile path and requires npm ecosystem records. Six new controls reject
wrong/missing ecosystems and wrong/missing/mixed source provenance. Before the
parser repair, the new ecosystem control failed because the malformed report was
accepted; afterward all 108 helper controls pass against attributed prior proof.
Fresh committed-head proof is retained under
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261030T010539Z-dc3076-0eeb04/`;
the ticket records its measured results and final external verification links.
The review request reported unavailable inspection tooling and no source defect;
this is a concrete scan-provenance improvement, not a claim to repair that tooling.

Paired OSV 2.6.0 scans use the historical executable/config paths with
`scan source --lockfile <input> --no-ignore --no-call-analysis=all --no-resolve
--config <recorded-empty-config> --all-packages --all-vulns --format json
--output-file <output>`. Scanner SHA-256:
`2c71403eb443d05891c4f268c3ad771cf4f16e5443463fd7851ef8f454d3c7e4`.
Finding exit 1 differs from clean exit 0 and tool errors. Full raw and alias-aware
per-copy reconciliation retain residual/new findings. The historical 51 raw/50
canonical reference grew to 52/51 because of qs GHSA-6pq8-jhm2-2vcw /
CVE-2026-110816; live OSV exposes no pinned database snapshot. Additional removals
are inherited master upgrades, outside this PR's five-finding remediation scope.

**Delivery remains subject to publication and independent QA.** Unchanged Node 20
CI has no artifact-upload step. Earlier automatic approval rejected a CI edit
(`ci_policy_workflow_modified`, ticket comment `fa6c7c95-9d9d-4816-9aee-8f3034a885b6`);
the current plan explicitly forbids that edit. A verified authorized route must
publish actual CI artifacts with observed `GITHUB_SHA`, commands, times, exits,
hashes and scanner metadata; without it delivery is blocked. Local logs and green
workflow status do not satisfy this obligation. The helper's `publication`
command checks reproduced proof and CI/head provenance; it cannot certify artifact
publication or independent QA. This dispatched run must not wait on CI.

Independent GPT-6 Sol/high host verification follows the produced head on a separate
Atlas collector. QA implements none of the candidate and publishes newly owned flat
txt/json/jsonl files through declared per-check `artifacts:[{filename:...}]` in
host-injected `AXIOM_EVIDENCE_DIR` (10/check, 8 MiB/file, 50 files/32 MiB/task).
No arbitrary TaskOutcome uploader, new frozen-source attachment or host credential
is used. Remote head movement invalidates prior CI/QA. Formal acceptance is separate.

Source references: input `7ac830713602a306ac91c3af56690e68725f9eaf4de877362cc59d615c801f17`;
requirements `8b2deef0-5ccc-41aa-a819-e822b50ec373`; project
`4c1a7bf2-a879-4734-b17c-ee320a736be5`; wiki
`1cf873a8-4343-4aee-8de4-f708552514d9`. Context is partial: task mapping and SEI
context are unavailable. Historical plan `3b34bfd2-ae78-4ebc-811f-6126a78e52c1`
is superseded by the revision above.

Assigned implementation: GPT-6.1 Sol/high. Historical implementation-only receipt,
run `474300fa-4f29-4273-8cfa-9d39e8af23a8`, reported 162,492 input, 41,772 output,
6,927,488 cached-input tokens and $2.13; this attributed receipt excludes planning,
coordinator and QA. This run's input/output/cached tokens and cost are unrecorded,
not zero, pending native finalization. The coordinator must append actual
nonoverlapping receipts; budget allowances are not incurred cost.
