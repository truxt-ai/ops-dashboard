# Evidence index

- [Approved packet, pinned plan and all original source references](approved-packet.json)
- [Fresh baseline coverage](baseline/coverage.md), [install](baseline/install-arm64.txt), [49 tests](baseline/tests.txt), [lint](baseline/lint.txt), [file hashes](baseline/files.json), [resolved versions](baseline/versions.txt)
- [Preserved initial architecture setup failure](baseline/install.txt); corrected ARM64 install and all tests subsequently passed
- [Fixture sources and independent expected outcomes](fixtures.md), [vulnerable fixture bytes](vulnerable/proxy-addr-security.test.js), [fixture digest](vulnerable/fixture.json), [two red assertions and two passing controls](vulnerable/regression.txt)
- [Package-manager update](candidate/lockfile-update.txt), [installed candidate](candidate/install.txt), [dependency version delta](candidate/dependency-delta.txt), [complete code diff](candidate/diff.txt)
- Exact committed head: [versions](candidate/versions.txt), [four regression passes](candidate/regression.txt), [lint](candidate/lint.txt), [53 tests](candidate/full-suite.txt)
- [Baseline raw OSV](scans/baseline.json), [head raw OSV](scans/final-head.json), [empty policy](scans/osv-scanner.toml), [scanner version](scans/scanner-version.txt), [baseline command/timestamps](scans/baseline-command.txt), [head command/timestamps](scans/final-head-command.txt)
- [Complete scan comparison](scans/comparison.json), [49 open findings](scans/comparison.md), [comparison command](scans/comparison-command.txt), [comparison program](compare-scans.py)
- [Scope evidence; actual human review pending](scope-review.md), [PR draft for coordinator](pr-body.md), [six-row QA report](qa-report.md)
- [Candidate PR107](https://github.com/truxt-ai/ops-dashboard/pull/107), [open/unmerged identity](delivery/pr.json), [exact-head CI run](https://github.com/truxt-ai/ops-dashboard/actions/runs/40295522832), [CI identity](delivery/ci-readback.txt), [hosted command log](delivery/ci-log.txt), [all successful exact-head runs](delivery/ci.json)
- [Independent baseline review comments and blocked disposition](delivery/baseline-review-comments.json)
- [Measured usage snapshot with limitations](usage.json), [snapshot extraction](capture-usage.py)
- [Command capture program](run.py); each command has a sibling `.meta.json` with actual command, cwd, revision, timestamps and exit status

Historical reference evidence is confined to `reference/`, including PR106 metadata/diff/fixture/lockfile, AXM-707 report and comments, advisory, release and upstream fix. Those historical execution results and usage are not counted as this attempt's results.

PR107 publication and exact-head hosted CI are verified above. Independent baseline/red/scan/delivery reviews, actual human CHECK-4/CHECK-7, user publication, final independent host verification and final accounting still require their own attributable receipts. The worker does not manufacture those receipts. Evidence links here are relative to this durable evidence root and must be retained together when transferred to the cloud review environment.
