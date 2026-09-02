---
spike: 009
idea: multi-customer-deployment
name: github-environments-secret-scoping
type: standard
validates: "Given N GitHub Environments each holding one customer's secrets, when a workflow_dispatch job selects one via `environment:`, then confirm the job cannot resolve a sibling customer's secret"
verdict: VALIDATED
related: []
tags: [github-actions, secrets, environments, multi-customer, ops]
---

# Spike 009: GitHub Environments Secret Scoping

## What This Validates

Given two GitHub Environments (`customer-a`, `customer-b`) each with a secret of the same name
(`MARKER`) but a different value, when a `workflow_dispatch` job sets `environment: <name>`, then
the job only ever resolves the secret belonging to the environment it declared — never the other
customer's value, even though both secrets share the same name in the same repo.

This is the load-bearing assumption behind "store `.env.production`-equivalent creds in GitHub
Environments, keyed by customer, instead of hand-copying files on disk."

## Method

Real GitHub Actions runs on the throwaway scratch repo (`gsd-spike-multi-customer-scratch`, deleted
after this spike) — not docs-only. A workflow can never safely *print* a secret (GitHub auto-masks
it, and doing so on purpose would be bad practice even in a scratch repo), so the test compares the
resolved secret against a known expected value and only ever emits `MATCH`/`MISMATCH` — the
comparison result is the observable, the secret value itself never appears in any log.

1. Created environments `customer-a` and `customer-b`, each with its own `MARKER` secret
   (`secret-value-for-customer-A-...`, `secret-value-for-customer-B-...`).
2. Workflow (`check-env-secret.yml`): `environment: ${{ inputs.customer }}`, step compares
   `secrets.MARKER` (loaded into `$MARKER` via `env:`) against an `expected` input.
3. Three dispatches:
   - `customer=customer-a`, `expected=<A's value>`
   - `customer=customer-a`, `expected=<B's value>` — deliberately wrong, to prove isolation
   - `customer=customer-b`, `expected=<B's value>`

## Results

| Run | environment selected | expected value | Result |
|---|---|---|---|
| 33590467459 | customer-a | A's value | **MATCH** |
| 33590477983 | customer-a | B's value | **MISMATCH** |
| 33590488844 | customer-b | B's value | **MATCH** |

The middle run is the actual proof: a job scoped to `customer-a` was handed B's expected value and
failed to match — it never had access to a value that would satisfy that comparison, confirming
`customer-a`'s job genuinely only resolved `customer-a`'s own `MARKER`, not some repo-wide/last-set
value.

## Verdict

**VALIDATED** — GitHub Environments give real per-customer secret isolation with same-named
secrets, driven purely by which `environment:` a job declares. No external secret manager needed
for this property.

## Signal for the Build

- One GitHub Environment per customer (e.g. `taj-house-of-spices`), holding that customer's
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Supabase project ref, and (per Spike 010) whatever
  the migration-push step needs.
- `release.yml` gains a `customer` input (`workflow_dispatch.inputs.customer`) and sets
  `environment: ${{ inputs.customer }}` on the job — this also gets GitHub's built-in environment
  protection rules (required reviewers, deployment branch restrictions) for free if ever wanted.
- `.env.production` as a loose on-disk file goes away entirely: the workflow writes the resolved
  environment's secrets into `.env.production` at build time (or passes them directly as env vars
  to `npm run build`), and the file never exists outside that one job's ephemeral runner filesystem.
  On this repo's **self-hosted** runner specifically, add an explicit cleanup step
  (`rm -f .env.production`) at the end of the job — the workspace persists across jobs/customers
  here (already the root cause behind this session's separate `broker.exe`-missing and locked
  native-module CI issues), so a stale customer-scoped `.env.production` left on disk after one
  customer's job is exactly the kind of thing that already burned this runner. A GitHub-hosted
  (non-self-hosted) runner would get this for free via ephemeral teardown, but this repo currently
  targets `[self-hosted, windows]` in `release.yml`.
