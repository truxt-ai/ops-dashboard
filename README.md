# axiom-demo-dashboard

A small Express + EJS service-health dashboard. It exists to demonstrate the
**Truxt Axiom** vulnerability-remediation autopilot end to end.

The dependencies are intentionally pinned to old, vulnerable versions so that
`npm audit` reliably reports known critical and high advisories. The Axiom
autopilot picks up those findings, proposes fixes, and opens a pull request.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

- `/` renders the dashboard with a few fake service metrics.
- `/health/upstream` runs a trivial upstream health probe via axios.

## Develop

```bash
npm run lint       # eslint
npm test           # node --test
```

## CI

- `ci.yml` runs lint + tests on every push and pull request (Node 20).
- `axiom-audit-on-merge.yml` notifies the Axiom autopilot webhook when a PR
  merges, so the autopilot can scan the merged state.

> Note: this is a demo fixture. Do not deploy it; the vulnerable dependencies
> are deliberate.
