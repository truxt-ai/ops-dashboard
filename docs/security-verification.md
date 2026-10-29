# AXM-721 dependency verification

Owner: Raunak Poonia. Assigned implementation: GPT-6.1 Sol/high; independent
GPT-6 Sol/high QA runs separately through the host. Formal acceptance is pending.
This report covers the approved plan revision
`3b34bfd2-ae78-4ebc-811f-6126a78e52c1`, input digest
`7ac830713602a306ac91c3af56690e68725f9eaf4de877362cc59d615c801f17`.

| Selected advisory | Baseline → resolved, every copy | Library regression |
| --- | --- | --- |
| [GHSA-jqcg-44mw-7w3h / CVE-2026-90711](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | proxy-addr 2.0.7 → 2.0.8 | Spoofed forwarding chain with short-prefix IPv6 trust |
| [GHSA-8r9p-f939-6h3c / CVE-2026-111755](https://github.com/advisories/GHSA-8r9p-f939-6h3c) | follow-redirects 1.16.0 → 1.16.1 | Sensitive names containing `^` and `\|` across origins |
| [GHSA-q3jh-wrc6-jgq8 / CVE-2026-111756](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8) | follow-redirects 1.16.0 → 1.16.1 | Array-form built-in/custom credentials across origins |
| [GHSA-pxg6-pf52-xh8x / CVE-2024-47764](https://github.com/advisories/GHSA-pxg6-pf52-xh8x) | cookie 0.5.0 → 0.7.2 | Injected name, path and domain |
| [GHSA-m6fv-jmcg-4jfg / CVE-2024-43799](https://github.com/advisories/GHSA-m6fv-jmcg-4jfg) | send 0.18.0 → 0.19.0 | Attacker-controlled directory redirect has no clickable link |

The five [original tests](https://github.com/truxt-ai/ops-dashboard/tree/dff02375d83394d6f03ce2127e35e62fadc269ab/test)
are byte-for-byte preserved. The [new fixtures](https://github.com/truxt-ai/ops-dashboard/blob/a48560d200e4932fc22f6b4035b1bb1b08495d28/test/security-dependencies.test.js)
are immutable at the dependency commit; their bytes are checked again at the final
PR head. Source patches were retrieved from the advisory references and hashed.

Retained implementation checks at dependency commit `a48560d` and proof commit
`6225ed89` used Node 24.15.0/npm 11.12.1: baseline install/lint and **49/49** tests;
identical fixture **14 intended assertion failures, 10 passing controls** before
the fix, then **24/24** passing; candidate install/lint and **73/73** full tests.
Node 20.20.2/npm 10.8.2 also passed baseline 49, candidate 73, and the same red/green
fixtures through a local simulation of the CI capture helper. This simulation is
not a GitHub CI result. No separate build or integration script is configured;
the existing HTTP/EJS tests stub axios, and new HTTP fixtures use loopback only.

Retained equivalent OSV 2.6.0 scans: **175 package identities / 181 lock copies** on
both inputs; **51 raw / 50 canonical → 46 raw / 45 canonical** findings. Exactly
the five selected GHSA/CVE pairs were removed, 45 canonical findings remain, and
zero were added. The live OSV API exposes no pinned database snapshot; full
records and advisory modification times are retained. Scanner finding exit 1 is
recorded explicitly. No zero-vulnerability claim is made.

Only four package versions changed, with no dependency downgrades or additional
closure changes. npm relocated the sole follow-redirects copy under axios;
the all-copy inventory and fixtures cover that path. Exact cookie/send overrides
cover Express and serve-static. Existing brace-expansion/js-yaml overrides remain.

These are library demonstrations: the application leaves proxy trust disabled,
uses fixed-URL axios requests without these header shapes, sets no cookies and
has no affected redirect route. They establish no current application exploit.

The single [PR #110](https://github.com/truxt-ai/ops-dashboard/pull/110) restored
the trusted baseline CI workflow at `12877f821840199d06a89313e6a3bbe4e0ecb754`.
Its [push CI](https://github.com/truxt-ai/ops-dashboard/actions/runs/40447309652)
and [PR CI](https://github.com/truxt-ai/ops-dashboard/actions/runs/40447315550)
passed 73 tests. These are historical runs for that head; this report/helper
repair requires fresh CI and independent host verification on its produced head.
Publish final remote head, actual CI run/log URLs and independent QA evidence on
[AXM-721](https://axiom-stage.truxt.ai/b560f8c8/atlas/issues/AXM-721), avoiding a
report-only commit after verification. Verify the checkout revision in CI logs;
a pull-request merge revision must name the candidate as a parent. Independent
host QA and formal acceptance remain separate gates.

The settled implementation-only receipt for run
`474300fa-4f29-4273-8cfa-9d39e8af23a8` records **$2.13**, **162,492 input**,
**41,772 output** and **6,927,488 cached-input** tokens. This excludes planning,
coordinator follow-ups and independent review/QA. Current repair input, output,
cached-input tokens and cost remain **unrecorded**, not zero; native usage
finalizes after completion. The coordinator must append this dispatch's actuals
separately. No whole-flow total or budget estimate is presented as incurred cost.

## Retained proof and reproduction

Retained implementation proof is outside runtime scratch:
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261026T173717Z-474300/`.
`run.json` records the baseline and input/original-test hashes. `commands/` holds
complete argv, cwd, UTC times, versions, exit codes, input/output hashes and
measured runner summaries. `fixture-final.json`, both inventories, raw OSV
reports, `scanner.json`, `comparison.json`, `verification.json`, `selftest.json`
and `manifest.json` support the results above. `comparison.json` accounts for
every raw record, alias and lockfile path under removed/remaining/added findings.
An earlier array fixture lacked Host and received HTTP 400; those setup failures
are retained in `baseline-security.*` and excluded from regression proof.

The [historical CI artifact](https://github.com/truxt-ai/ops-dashboard/actions/runs/40371968599/artifacts/12673081627)
belongs to `6225ed89f0fe2d7788e7f4734d79d2a2e7d05e15`, before workflow restoration.
It does not certify a later head. The subsequent `12877f8` verification is retained
separately at `/data/work-root/qa-evidence/atlas/pr110-ci-policy-20261027T035457Z/`:
`summary.json`, `manifest.json`, command records, downloaded CI logs and paired
raw scans/comparison record the same 73 passing tests and 51/50 → 46/45 findings.
These local raw scans await host QA publication; the current workflow does not
upload them. This repair's local logs are retained separately beneath
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T174800Z-f5627c/`.

Historical [AXM-720](https://axiom-stage.truxt.ai/b560f8c8/atlas/issues/AXM-720)
inputs/manifest were verified before reuse as reference. New scans use its exact
recorded executable and empty config, whose SHA-256 is
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`:

```sh
"$SCANNER" scan source --lockfile "$LOCKFILE" --no-ignore \
  --no-call-analysis=all --no-resolve --config "$SCANNER_CONFIG" \
  --all-packages --all-vulns --format json --output-file "$OUTPUT"
```

Use an untouched archive of the pinned baseline, run its original suite, then
copy the candidate `test/security-dependencies.test.js` into that archive before
running the new cases. The baseline never contained that file. The helper's
`ci-capture` command can perform this preparation locally, validate assertion-level
reds and check the same fixture bytes on the candidate. The current GitHub
workflow does not invoke it. Other local helper commands are:

```sh
python3 scripts/security-verification.py record "$PROOF/commands" install . npm ci
python3 scripts/security-verification.py inventory . "$PROOF/candidate-inventory.json"
python3 scripts/security-verification.py compare \
  "$PROOF/baseline.osv.json" "$PROOF/baseline/package-lock.json" \
  "$PROOF/candidate.osv.json" package-lock.json "$PROOF/comparison.json"
python3 scripts/security-verification.py selftest "$PROOF" "$PROOF/selftest.json"
python3 scripts/security-verification.py verify "$PROOF" . "$PROOF/verification.json"
python3 scripts/security-verification.py manifest "$PROOF"
```

`record` refuses to overwrite an existing label and propagates command failures.
The self-check rejects missing exits/aliases, incomplete finding/copy inventories,
changed original tests, mismatched fixture hashes, stale heads, setup errors and
incomplete publication records. `publication <report.json>` requires successful
CI with `ci.run_url` pointing to its GitHub Actions run/logs, observed
`ci.github_sha` and merge `ci.parents` for head reconciliation, plus independent
QA evidence on that head. It does not require `ci.artifact_url`: the restored
workflow publishes no proof artifact. Pending CI/QA fields are not accepted as
successful evidence; retained local files alone do not satisfy publication.

Current CI runs Node 20 `npm ci`, `npm run lint` and `npm test`, publishing ordinary
GitHub Actions job logs. It does not invoke the helper, reproduce baseline
red/green cases, run OSV, generate proof manifests or upload artifacts. The
historical artifact and separately retained native proof above supply earlier
evidence only; fresh host checks must bind the final head and publish their own
evidence. The trusted workflow remains byte-for-byte preserved by this repair.

Independent native QA must declare each check's `artifacts:[{filename:...}]` and
write newly owned flat `.txt`, `.json` or `.jsonl` files to host-injected
`AXIOM_EVIDENCE_DIR`: at most 10/check, 8 MiB/file, 50 files/32 MiB/task. Ordinary
implementation has no such upload directory. Local proof and local CI simulations
are not uploads; no TaskOutcome artifact fields or frozen source attachments
are used. Re-read the remote head after CI/QA; any movement invalidates proof.
