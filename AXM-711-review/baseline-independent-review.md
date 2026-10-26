# AXM-711 independent baseline review of AXM-708

Reviewer: dispatched Quality Assurance worker on 2026-10-26. Scope: CHECK-1 and baseline CHECK-6 only; this is not final independent verification, CHECK-4, CHECK-7, host verification, or a Verified Delivery seal.

## Verdict

**Baseline evidence cannot be approved in this runtime.** The exact assigned checkout is available and an independent rerun passes, but the supplied baseline evidence tree is absent and its required destination is not writable. The rerun corroborates the claimed test and scan counts; it cannot authenticate `baseline/tests.txt`, `baseline/install-arm64.txt`, `baseline/lint.txt`, `scans/baseline.json`, `scans/baseline-command.txt`, `scans/osv-scanner.toml`, `tools/osv-scanner`, or `run.py`.

## Identity and access

- `git rev-parse HEAD` returned `dff02375d83394d6f03ce2127e35e62fadc269ab`, matching the assigned full SHA. Branch was `raunakTruxt/axm-711-3d6566`; `git status --short` was clean before this review's untracked evidence directory was added.
- `ps -eo pid,args | rg 'codex|opencode|axiom'` showed the active Codex command using `-m gpt-6-sol -c model_reasoning_effort="high"`. This matches the requested route as observed from the process command line.
- `rg --files /data/work-root/qa-evidence/AXM-708-db9dc0` failed because the path did not exist. `ls -ld /data/work-root` likewise returned “No such file or directory.” `mkdir -p /data/work-root/qa-evidence/AXM-708-db9dc0/independent` failed with “Permission denied” at `/data/work-root`. No original baseline artifact was available to read.
- `truxt-axiom orchestration check` and the attempted escalation both failed with `runtime_unavailable`: the CLI could not read `/data/runtime/truxt-axiom-runtime.json`. The file exists but is not readable by this worker. A coordinator question or lifecycle report could not be delivered through that command at review time.

## CHECK-1: source, HTTP behavior, tests, and lint

The original tracked tests are exactly `test/health-freshness.test.js`, `test/health.test.js`, `test/promo-codes.test.js`, `test/service-health.test.js`, and `test/smoke.test.js`. I inspected them with `src/server.js`, `package.json`, and `.github/workflows/ci.yml`. CI specifies Node 20 and runs `npm ci`, `npm run lint`, then `npm test`.

The tests exercise actual loopback HTTP for `GET /`, `/health/live`, `/health/ready`, and `/health/upstream`, plus EJS rendering and deterministic helpers. Coverage includes the UTC timestamp and stale threshold at 299999/300000/300001 ms; stable service order and adjacent health labels; liveness with healthy, failing, and pending upstream probes; readiness success, HTTP 500, connection refusal, timeout, repeated failures, and recovery; legacy upstream 502 and error field; metrics totals and error rate; promo-code discounts and inactive/unknown/empty codes; and installed plus locked `brace-expansion` and `js-yaml` security floors. The `/` tests assert rendered HTML, timestamp, viewport, and absence of scripts. This is local HTTP execution evidence, not browser or host evidence.

Independent command evidence, after matching the assigned SHA:

| Command | Exit | Observation | Artifact |
| --- | ---: | --- | --- |
| `npm exec --yes --package=node@20 -- node --version` | 0 | `v20.20.2` | terminal output |
| `npm exec --yes --package=node@20 -- npm ci` | 0 | 181 installed packages; npm reported 11 vulnerability package entries | `AXM-711-npm-ci-node20.txt` |
| `npm exec --yes --package=node@20 -- npm test` | 0 | 49 passed, 0 failed, 0 skipped | `AXM-711-npm-test-node20.txt` |
| `npm exec --yes --package=node@20 -- npm run lint` | 0 | ESLint completed without diagnostics | `AXM-711-npm-lint-node20.txt` |

The first local attempt used the runtime's default Node 24 (`npm ci`, tests and lint all passed); I then reran on Node 20 to match CI. The supplied statement that the *original baseline's first install* used a wrong CPU binary and failed before installation remains unverified because its original log is absent. The corrected original `install-arm64.txt` also remains unverified; the successful independent Node 20 install above is separate evidence.

## Baseline CHECK-6: independent comparable scan

The supplied scanner binary and command file were absent. I downloaded the official `osv-scanner` v2.6.0 Linux arm64 release to a temporary file, confirmed `osv-scanner version: 2.6.0`, and ran:

```text
osv-scanner scan source --lockfile package-lock.json --format json --all-packages --all-vulns --no-ignore --output-file AXM-711-osv-live.json
```

The scanner exited **1** and produced a valid 488483-byte JSON result. Its stderr records that it scanned `package-lock.json` and found **175 packages**; there is no API or extraction error in stderr or a JSON error field. The JSON has one lockfile source, **175 versioned packages**, **175 distinct name/version pairs**, and **50 vulnerability groups** across 11 affected packages. All 175 scanner pairs exactly match the 175 distinct name/version pairs derived from the 181 lockfile package entries; no scanner pair is missing from the lockfile and vice versa. All 50 groups have identifiers. One group contains target `GHSA-jqcg-44mw-7w3h` with alias `CVE-2026-90711` on `proxy-addr@2.0.7` (reported maximum severity 9.1). The 50 groups are preserved in the raw JSON; group count is the canonical finding count, whereas distinct ID count is 51 because at least one group has multiple IDs.

The fresh command supplied no ignore configuration and the JSON contains no ignored or error keys. This supports a complete *new* live scan, not a conclusion about the absent `scans/baseline.json`, its ignored-findings policy, API completeness, or original scanner exit code. Scanner exit 1 here accompanies findings and a complete parsed result; it is not, by itself, evidence of API failure. `npm audit --json` independently returned exit 1 and 11 vulnerable package entries (3 low, 1 moderate, 5 high, 2 critical); npm's package-level count is not comparable to OSV's 50 advisory groups.

The affected package group counts in the new OSV report are: axios 24, body-parser 3, cookie 1, express 2, follow-redirects 2, lodash 10, path-to-regexp 2, proxy-addr 1, qs 3, send 1, serve-static 1. No finding was suppressed or repaired during this review.

## Required follow-up

Make the original `/data/work-root/qa-evidence/AXM-708-db9dc0` tree readable and its review destination writable in the assigned QA runtime, then compare each original file with this independent rerun. Preserve the distinction between the failed wrong-CPU first install and successful corrected arm64 Node 20 install. Restore the orchestration runtime access so the native outcome can be delivered. Do not treat this review as final host or browser verification.

This fallback report and its raw rerun artifacts are untracked in `AXM-711-review/` in the assigned checkout because the specified external evidence root was unavailable. No application, test, manifest, CI, dependency, ignore-rule, or repository-history file was changed; no PR, deployment, restart, or merge was made.
