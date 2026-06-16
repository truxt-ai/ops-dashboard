# Ops Dashboard Project Contract

This contract is the source-of-truth context for Axiom agents working on
`ops-dashboard`. Test-writing tasks should cite the relevant clause IDs in
their test impact memo.

## Purpose

`ops-dashboard` is a deliberately small Express + EJS service-health dashboard
used to demonstrate Truxt Axiom's vulnerability-remediation and test-driven
delivery flows.

The app must stay simple enough for a demo viewer to inspect quickly:

- one server entry point,
- one dashboard view,
- small reusable helpers under `src/lib/`,
- Node built-in test coverage under `test/`,
- no production deployment assumptions.

## System Shape

**SD-1 Server runtime.** The app runs with `node src/server.js` and serves HTTP
from Express. The default port is `3000`, overridable by `--port` or `PORT`.

**SD-2 View rendering.** The dashboard route `/` renders `views/dashboard.ejs`
using data returned by `buildMetrics()`.

**SD-3 Upstream probe.** The route `/health/upstream` uses `axios` to probe
`https://example.com` and returns JSON:

- success: `{ upstream: "ok", status: <http-status> }`
- failure: HTTP `502` with `{ upstream: "unreachable", error: <message> }`

**SD-4 Shared logic.** Reusable non-route logic belongs under `src/lib/` and is
exported via CommonJS (`module.exports`). Route handlers should call shared
helpers instead of duplicating formatting or business rules.

**SD-5 Test layout.** Tests use Node's built-in `node:test` runner and live
under `test/`. Test files should avoid external test frameworks unless the repo
already depends on them.

## Functional Requirements

**FR-1 Dashboard metrics.** `buildMetrics()` returns deterministic service
metrics so the dashboard and tests are stable across runs.

**FR-2 Dashboard route.** `GET /` renders a service-health dashboard containing
the service names, total requests, total errors, and error rate.

**FR-3 Upstream health route.** `GET /health/upstream` must preserve the success
and failure JSON contracts in `SD-3`.

**FR-4 Dependency health summary.** When dependency risk is shown, the reusable
summary must accept normalized counts for `critical`, `high`, `moderate`, and
`low`, omit zero counts, order severities by risk, pluralize correctly, and use
the exact clean-state text `No known dependency vulnerabilities.`

**FR-5 Reuse boundary.** Dependency-health formatting and rendering logic must
be importable by future dashboard modules without reaching into route internals.

**FR-6 Demo vulnerability intent.** The repo intentionally pins old dependency
versions for the vulnerability-remediation demo. Tests may verify remediation
behavior, but feature work must not remove the demo purpose without an explicit
task requirement.

## Nonfunctional Requirements

**NFR-1 Small surface area.** Prefer small CommonJS modules and plain EJS/HTML.
Do not introduce a frontend framework, build system, or large dependency for a
simple display or formatter.

**NFR-2 Determinism.** Tests must not depend on live network availability,
clock-sensitive values, or remote service behavior unless explicitly marked as
integration coverage with a stable mock/fallback.

**NFR-3 Security posture.** Do not render raw audit JSON or unsanitized external
error payloads into HTML. User-visible dependency risk should be summarized.

**NFR-4 Accessibility.** New dashboard UI should use semantic HTML, readable
labels, and stable test hooks for important status regions.

**NFR-5 Demo clarity.** User-facing copy should be short and inspectable. The
dashboard exists for a live demo, so avoid noisy logs, walls of text, or hidden
state that cannot be explained quickly.

## Data Flows

**DF-1 Dashboard page flow.** Browser requests `/` -> Express route calls
`buildMetrics()` -> EJS template renders deterministic metrics -> browser sees
the dashboard.

**DF-2 Upstream probe flow.** Browser or test calls `/health/upstream` -> Express
route calls `axios.get()` -> route maps success/failure into the JSON contract
from `SD-3`.

**DF-3 Dependency summary flow.** A feature or route receives dependency counts
or audit metadata -> adapter normalizes to severity counts -> shared formatter
produces ordered summary items and text -> dashboard component/view renders the
summary without exposing raw audit output.

## Testing Contract

**TC-1 Unit tests.** Unit tests should cover pure helpers directly, including
edge cases such as empty input, malformed counts, ordering, and pluralization.

**TC-2 Route tests.** Route or integration tests should prove Express responses
preserve public behavior for `/` and `/health/upstream` when those surfaces are
touched.

**TC-3 Dependency-risk tests.** Tests for dependency risk must cite `FR-4`,
`FR-5`, and `DF-3`, and should verify both non-empty risk and clean-state output.

**TC-4 Test impact memo.** Every Axiom-generated test task should include a
short memo mapping the tests it added to affected clauses, for example:
`FR-4, FR-5, DF-3, TC-3`.

## Out of Scope Unless Requested

- Replacing Express or EJS.
- Adding a database or persistent storage.
- Adding a background vulnerability scanner.
- Deploying this app to production.
- Removing the intentionally vulnerable dependency baseline.
