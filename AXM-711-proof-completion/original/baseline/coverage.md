# Baseline compatibility inspection

Baseline `dff02375d83394d6f03ce2127e35e62fadc269ab`, clean tree before test/dependency edits. All five test files, src/server.js, package.json, relevant lockfile entries, README, ESLint configuration and unchanged CI were read. CI uses Node 20, npm ci, lint, and node --test; no build script exists.

Fresh execution: [install](install-arm64.txt), [49 passing tests](tests.txt), [lint](lint.txt), [versions and application trust](versions.txt), [npm version](npm-version.txt). Node 20.20.2 ARM64 and npm 10.8.2. An initial x64-binary launch failed before installing packages and is retained in [install.txt](install.txt); it is not counted as a test result.

- health.test.js: nine cases cover liveness with healthy/failing upstream without any upstream calls; readiness success and exact timeout 2000; separate HTTP failure, connection error and timeout responses; pending/repeated failure liveness and readiness recovery; upstream success status and failure 502/error preservation.
- health-freshness.test.js: eight cases cover calculations, clock order, five-minute freshness boundary, UTC date formatting and real HTTP GET / with UTC freshness output.
- service-health.test.js: fourteen cases cover thresholds, sorting, immutability, EJS rows, repeated HTTP GET / with service row/cell values, and metrics consistency.
- promo-codes.test.js: fifteen cases preserve discount behavior and active code catalog.
- smoke.test.js: three cases preserve aggregate metrics and brace-expansion/js-yaml installed and locked security floors.

Runner output reports 49 tests, 49 passes, zero failures/cancellations/skips/todos. The numbered top-level TAP plan contains 41 entries because the health describe suite contains nine nested cases.

[OSV raw baseline](../scans/baseline.json) inventories 175 package versions. [Complete finding occurrences](../scans/baseline-findings.json) lists 50 groups; raw advisory entries total 51 because OSV groups aliases. Scan uses OSV 2.6.0, explicit empty policy, all packages, all vulnerabilities, no ignores, no offline flags, and live OSV API. [Command log](../scans/baseline-command.txt) records start/end and exit 1 for reported vulnerabilities; no API failure was reported.
