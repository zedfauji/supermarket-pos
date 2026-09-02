# Phase 26: Multi-Customer Deployment — API Coverage Matrix

**Trigger:** `workflow.api_coverage_gate` detector fired (`detected: true`) — this phase integrates
external services (GitHub API via `gh` CLI/Actions, Supabase CLI/API) at the CI/CD and ops-tooling
layer. Per "Full API Coverage by Default — Opt Out, Never Opt In", every capability surface of each
integrated service is enumerated below with an explicit `INTEGRATE`/`OPT-OUT` disposition and reason.
`INTEGRATE` is the default; every `OPT-OUT` below is a reasoned exception tied to a specific locked
decision (D-01..D-18) or a hard platform constraint, not a scope-reduction judgment call.

## GitHub (via `gh` CLI + GitHub Actions)

| Capability | Disposition | Reason |
|---|---|---|
| Repo creation (`gh repo create`) | INTEGRATE | D-09 — `onboard-customer.ps1` creates each new customer's mirrored repo. |
| Full-mirror push (`git push --mirror`) | INTEGRATE | D-01/D-02 — core's release workflow pushes core's `main` + all refs/tags to each active customer repo on every release. |
| GitHub Environment creation (`gh api -X PUT .../environments/<name>`) | INTEGRATE | D-06/D-18 — per-customer secret isolation (Spike 009), reused for both the D-18 interim `.env.production` migration and the ongoing mirror-push PAT. |
| Environment secret set (`gh secret set --env`) | INTEGRATE | D-06 — mirror-push PAT and (D-18) `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are stored per-Environment, never as plain repo secrets. |
| Release publish / `latest.json` (`tauri-action`) | INTEGRATE | Already-existing capability (Phase 20); extended per-customer via the dual `--config` merge (D-06). |
| Fine-grained PAT **creation** (minting the token itself) | OPT-OUT | GitHub does not expose a `gh`/API call to mint a fine-grained PAT — it can only be created by a human via the GitHub UI (Settings → Developer settings → Fine-grained tokens). `onboard-customer.ps1` only **stores** an already-created PAT as an Environment secret (see `gh secret set --env` row above); minting it is documented as a manual runbook step (D-09's docs/ half), not a gap — it is a hard platform constraint, not a choice. |
| SSH deploy-key management (`ssh-keygen` + `gh repo deploy-key add`) | OPT-OUT | RESEARCH.md Alternatives Considered / Assumption A2 explicitly recommends a fine-grained PAT over a deploy key for this phase (simpler to script idempotently, matches this repo's existing all-GitHub-native-secrets convention — no SSH agent setup exists anywhere else in this repo's CI). Deferred as a future hardening option if the team later wants per-repo-scoped SSH rotation instead of PAT rotation. |
| Repo visibility management (`gh repo edit --visibility private`) | OPT-OUT | Not automated/enforced by this phase's scripts. The core repo's current public status and the private-vs-public choice for each new customer repo is a one-time judgment call surfaced explicitly in this phase's `<threat_model>` (information-disclosure risk from a fully-mirrored override file) and the onboarding runbook (`docs/onboarding-new-customer.md` recommends `--private` as the default, and `onboard-customer.ps1` defaults to `gh repo create --private`) rather than being silently scripted/enforced without operator visibility — visibility is a security posture decision, not a mechanical step. |

## Supabase (via `supabase` CLI)

| Capability | Disposition | Reason |
|---|---|---|
| `db push --project-ref <ref> --yes` (migration push to a customer's project) | OPT-OUT (automation) | D-10 explicitly keeps this manual — "Creating/registering the new customer's Supabase project itself is a manual step (dashboard or `supabase` CLI, `supabase db push --project-ref` per Spike 010's already-validated pattern) — not scripted end-to-end." `onboard-customer.ps1`'s plumbing "picks up after the project exists" (D-10), so this phase documents the exact command in `docs/onboarding-new-customer.md` (Plan 26-03) rather than wiring it into any script or CI job. |
| Edge Function deploy (`supabase functions deploy`) + secrets (`supabase secrets set`) to a **new customer's own** Supabase project | OPT-OUT | Not covered by any locked decision (D-01..D-18) — D-09's field list for `onboard-customer.ps1` (repo creation, mirror-push target registration, GitHub Environment creation, override/icon scaffolding, `customers.json` entry) does not include per-customer edge-function deployment. Each customer's own backend deployment reuses the existing `deploy-remote-backend.ps1` pattern (Phase 20) manually, generalized to a new `--project-ref` — flagged as a candidate follow-up todo if onboarding a real customer #2 shows this step is being missed/forgotten in practice, not built speculatively here. |
| `db push`/migration **fan-out on every release** (auto-syncing schema across all active customers' Supabase projects going forward) | OPT-OUT | Not a locked decision. D-11 explicitly says the release workflow's "first sync" (and by extension every sync) follows "the exact same path every subsequent release uses" — the app-shipping path (mirror-push + Tauri build), which is silent on schema. No D-number establishes an ongoing per-release Supabase migration fan-out; inventing one would be scope addition beyond CONTEXT.md. Each customer's Supabase schema currency remains an operator-run `supabase db push --project-ref <ref> --yes` per customer, documented in the onboarding runbook. |

## Metadata

**Detector output:** `{"detected":true,"signals":[{"verb":"(surface)","noun":"api", ...}]}` — matched on `gh`/`api`/`integrate`-class terms present in RESEARCH.md's Architectural Responsibility Map.
**Scope:** Every row above is either INTEGRATE (built by a plan in this phase) or a reasoned OPT-OUT tied to a specific D-number/platform constraint — no row is a silent omission.
