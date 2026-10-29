# AXM-721 dependency verification

Owner: Raunak Poonia. Assigned implementation: GPT-6.1 Sol/high; review repairs
from `93529ea` onward were made by Claude Opus 5.5. Independent GPT-6 Sol/high QA
runs separately through the host. Formal acceptance is pending.
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
fixtures through a local CI simulation (the former `ci-capture` command, now
replaced by `verify`). This simulation is not a GitHub CI result. No separate build or integration script is configured;
the existing HTTP/EJS tests stub axios, and new HTTP fixtures use loopback only.

Retained equivalent OSV 2.6.0 scans from 2026-10-26: **175 package identities / 181
lock copies** on both inputs; **51 raw / 50 canonical → 46 raw / 45 canonical**
findings. Exactly the five selected GHSA/CVE pairs were removed, 45 canonical
findings remain, and zero were added. A 2026-10-29 rescan of the same lockfiles
also reports the newly published qs GHSA-6pq8-jhm2-2vcw / CVE-2026-110816 on both
sides (**52/51 → 47/46**): the same five removed, zero added. The live OSV API
exposes no pinned database snapshot, so `verify` scans again and reports the
counts it observes. It requires exactly the five selected removals and no added
finding. No zero-vulnerability claim is made.

Only four package versions changed, with no dependency downgrades or additional
closure changes: `scope` rejects any lockfile entry that differs from BASE
unless it is a target package at its fixed version from the npm registry. npm relocated the sole follow-redirects copy under axios;
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
Publish the final remote head, the exact-head push CI run URL and independent QA
evidence on [AXM-721](https://axiom-stage.truxt.ai/b560f8c8/atlas/issues/AXM-721),
avoiding a report-only commit after verification. Independent host QA and formal
acceptance remain separate gates.

The settled implementation-only receipt for run
`474300fa-4f29-4273-8cfa-9d39e8af23a8` records **$2.13**, **162,492 input**,
**41,772 output** and **6,927,488 cached-input** tokens. This excludes planning,
coordinator follow-ups and independent review/QA. Current repair input, output,
cached-input tokens and cost remain **unrecorded**, not zero; native usage
finalizes after completion. The coordinator must append this dispatch's actuals
separately. No whole-flow total or budget estimate is presented as incurred cost.

## Retained proof and reproduction

Earlier proof directories are retained for reference only; `verify` reads none
of them:
- implementation proof:
  `/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261026T173717Z-474300/`;
- the `12877f8` CI-policy check:
  `/data/work-root/qa-evidence/atlas/pr110-ci-policy-20261027T035457Z/`;
- the `cc14e89` repair logs:
  `/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T174800Z-f5627c/`;
- the remote-head repair logs:
  `/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T194456Z-remote-head/`.

An earlier array fixture lacked Host and received HTTP 400; those setup failures
are retained in `baseline-security.*` and excluded from regression proof. The
[historical CI artifact](https://github.com/truxt-ai/ops-dashboard/actions/runs/40371968599/artifacts/12673081627)
belongs to `6225ed89f0fe2d7788e7f4734d79d2a2e7d05e15`, before workflow
restoration, and certifies no later head. The current workflow uploads no raw
scans. The reproduction for the current head is retained at
`/data/work-root/qa-evidence/atlas/overnight-20261026/AXM-721-20261029T200758Z-derived/`.

Recorded logs can be fabricated together with their hashes, so `verify` does not
accept them. It reproduces every result into a new directory:

```sh
export OSV_SCANNER=/path/to/osv-scanner   # osv-scanner 2.6.0 linux-arm64, SHA-256 2c71403e…
python3 scripts/security-verification.py verify . "$OUT"
python3 scripts/security-verification.py selftest "$OUT" "$OUT/selftest.json"
python3 scripts/security-verification.py publication "$REPORT" . "$OUT-publication"
```

`verify <checkout> <new-dir>` requires a clean checkout and works only from git
objects:
- It writes BASE's and HEAD's trees from raw objects, `ls-tree` plus `cat-file`,
  rehashing every blob. Git attributes, replace refs and ignored or untracked
  files therefore cannot take part.
- The head's fixture must be the reviewed one, whose SHA-256 is pinned from
  `a48560d`.
- Each child gets a minimal environment: its own fresh `HOME`, empty npm user
  and global config files, only absolute `PATH` entries, and no inherited
  `NODE_OPTIONS` or npm settings. Output is read through verifier-owned pipes.
  Each child runs in its own process group, and any process left in that group
  fails the run.
- It runs, in order:
  - in the BASE tree: `npm ci`, `npm run lint` and the original suite;
  - then, after copying the head's fixture into the BASE tree, the red fixture run;
  - in the head tree: `npm ci`, `npm run lint`, the green fixture run and the
    full suite.
- Neither tree may declare an install script, so `npm ci` runs no package code.
  `npm ci` checks every installed tarball against the lockfile's sha512
  integrity, and each target's integrity must equal the npm registry's.
- After every run, both trees' sources must equal their git objects exactly,
  with nothing added, and each `node_modules` must equal its state right after
  `npm ci`. Executed code therefore cannot rewrite sources, tests or packages
  for a later run. The checkout must still be the same clean head at the end,
  and the comparison `publication` uses stays in memory.
- TAP counters must agree with the result lines themselves: `not ok` lines equal
  failures, and no SKIP or TODO directive is allowed. A duplicated summary line
  fails. The counts must be the ones fixed by the pinned code: 49 original
  tests, and 24 fixture tests of which 14 fail before the fix.
- It requires:
  - the red run to fail exactly the five advisories by assertion;
  - every suite to pass with no skipped, todo or cancelled tests;
  - the green run to execute the red run's tests by name, each baseline copy
    path mapped to its candidate copy through both inventories, and every fixed
    copy to have a fixture test;
  - the full suite to be the original suite plus the fixture, by name;
  - the BASE tree to hold the vulnerable versions.
- It scans both lockfiles with the pinned scanner (`$OSV_SCANNER`, resolved once,
  checked by SHA-256 and executed by that absolute path) and this command, with
  an empty config:

```sh
"$SCANNER" scan source --lockfile "$LOCKFILE" --no-ignore \
  --no-call-analysis=all --no-resolve --config "$SCANNER_CONFIG" \
  --all-packages --all-vulns --format json --output-file "$OUTPUT"
```

`record` remains for ad-hoc retained logs. `scope` allows exactly the five files
this PR changes and lists both sides of any rename. CI runs the `lint` and `test`
scripts from `package.json`, so `package.json` may differ from BASE only by the
exact cookie and send overrides. The helper refuses to run under `python3 -O`,
which would strip its assert-based checks.

`publication <report.json> <checkout> <new-dir>` runs `verify` and then checks
the report's head and CI claims against fresh GitHub REST reads through the
authenticated `gh` CLI, pinned with `--hostname github.com`. A failed read fails
the check. The report must have exactly the publication schema: unknown fields,
including QA claims, are rejected. It requires:

- `pr_url` naming PR #110, open, same-repository and into `master`, whose live
  head equals `head_sha`, `remote_head_sha` and the reproduced checkout's HEAD;
- a head descending from BASE, where both the BASE diff and the PR's own file
  list (both sides of any rename) stay inside the `scope` allowlist;
- at that head, the CI workflow blob equal to BASE's, `package.json` passing the
  manifest rule above, and the fixture equal to the reviewed fixture, the
  checkout's and `fixture_sha256`;
- the reproduced scans covering exactly BASE's lockfile and the live head's,
  compared by SHA-256;
- `ci.run_url` naming a completed, successful, first-attempt `push` run of
  `.github/workflows/ci.yml` for that exact head and branch, whose jobs all
  succeeded with successful `Install dependencies`, `Lint` and `Test` steps;
- a complete run list that contains the cited run and in which every run of
  that workflow on the head is completed, successful and on its first attempt.

The PR, including its base SHA, and the run list are read again last; any change
in either fails the check. A `pull_request` run tests a synthetic merge revision, so it is not
exact-head CI. The API reports only a run's latest attempt, so a rerun could
hide a failure.

The helper does not certify QA. No comment or account check can establish that
an independent agent ran QA, so independent QA and formal acceptance belong to
the host gate. It does not require `ci.artifact_url`, because the restored
workflow publishes no proof artifact. Usage figures are reported values, not
verified ones. The helper trusts the host's `git`, `node`, `npm`, `gh` and Python.

The self-check rejects:
- failing, empty, skipped or miscounted suites, inflated counters, and
  duplicated summary lines;
- red and green runs of different tests or copies, untested copies, and full
  suites missing a test;
- setup errors posing as regressions, and changed trees;
- comparisons that miss aliases, records or paths, or that add or remove beyond
  the selection;
- lockfile changes beyond the targets, changed manifests or original tests, and
  out-of-scope paths including renames;
- dirty or other-head checkouts.

It also runs `publication` against an offline GitHub stand-in and rejects:
- stale or moving heads, other PRs or base branches, closed or fork PRs, and PR
  state or base changes during verification;
- failed, unfinished, rerun, merge-revision or other-workflow CI runs, failed jobs
  or test steps, and run lists that are incomplete or lack the cited run;
- an edited workflow or test script, lockfiles other than the scanned ones, a
  fixture other than the reviewed one, out-of-scope diffs against BASE or the PR
  base, and wrong test links;
- extra report fields such as QA claims, and incomplete records.

Current CI runs Node 20 `npm ci`, `npm run lint` and `npm test`, publishing ordinary
GitHub Actions job logs. It does not invoke the helper, reproduce baseline
red/green cases, run OSV, generate proof manifests or upload artifacts. The
historical artifact and separately retained native proof above supply earlier
evidence only; fresh host checks must bind the final head and publish their own
evidence. The trusted workflow remains byte-for-byte preserved by this repair:
`scope` rejects any edit to it and `publication` compares its blob with BASE.

Independent native QA must declare each check's `artifacts:[{filename:...}]` and
write newly owned flat `.txt`, `.json` or `.jsonl` files to host-injected
`AXIOM_EVIDENCE_DIR`: at most 10/check, 8 MiB/file, 50 files/32 MiB/task. Ordinary
implementation has no such upload directory. Local proof and local CI simulations
are not uploads; no TaskOutcome artifact fields or frozen source attachments
are used. Re-read the remote head after CI/QA; any movement invalidates proof.
