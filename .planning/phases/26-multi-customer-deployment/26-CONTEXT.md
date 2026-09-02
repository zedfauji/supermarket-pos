# Phase 26: Multi-Customer Deployment - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship this same supermarket-pos codebase to multiple customers, each with a fully isolated Supabase project and their own genuine `/releases/latest` update channel. This is a multi-**instance** deployment model (no tenant_id/shared-DB retrofit) built on top of spikes 007–010's validated mechanisms (Tauri config-merge, GitHub Environments secret scoping, `--project-ref` migration fan-out) and the user-confirmed branching decision: core repo stays the single source of truth; each customer gets their own repo (full mirror), synced from core, whose job is Actions + Releases.

Phase delivers:
1. A mirror-push sync mechanism from core to each active customer's repo, gated by an active-customer manifest.
2. A per-customer override file (identity: identifier/publisher/updater-endpoint/icon) merged at build time via Tauri's `--config` mechanism.
3. A scripted + documented onboarding path for customer N+1.
4. Retrofit of the one real existing customer (Taj House of Spices) into this model, cutover via parallel-run.

Out of this phase: any actual licensing/billing/payment-tracking system, and self-hosted-Supabase production support beyond a schema placeholder.

</domain>

<decisions>
## Implementation Decisions

### Core→customer sync mechanism
- **D-01:** Customer repos are full mirrors of core's `main` (not thin workflow-only repos) — `git push --mirror` on release. — **Reversibility:** costly — switching to thin repos later means redesigning every customer repo's checkout/build step to pull core as a dependency instead of containing it.
- **D-02:** Core's own release workflow triggers the sync (mirror-push to each customer repo on tag/dispatch), not `repository_dispatch` fan-out or a pull-based model on the customer side.
- **D-03:** Sync target selection is gated by an active-customer manifest (`customers.json` or one file per customer) with a `status: active | suspended` field — the sync job only mirror-pushes to customers marked active. Flipping a customer to `suspended` is a one-line edit + commit; no build/release changes needed.
- **D-04:** Release cadence is effectively lockstep among *active* customers (one core release = one sync attempt to every active customer), with suspension as the per-customer override mechanism — not independent per-customer version pinning.
- **D-05:** Full licensing/billing system (invoicing, automated payment tracking, auto-cutoff) is explicitly **out of scope for this phase** — see Deferred Ideas. This phase only builds the manual active/suspended gate a future licensing phase could eventually flip automatically.

### Per-customer override file
- **D-06:** `customers/<name>/tauri.override.json` lives in core (not in the customer repo), synced by the same mirror push. Fields: `identifier`, `publisher`, `updater.endpoints`, icon path. Applied at build time via `tauri-action`'s `--config` deep-merge (the same mechanism already used in `release.yml` for the cert-thumbprint override, and validated for this exact purpose by Spike 008).
- **D-07:** Per-customer icons live in `customers/<name>/icons/` in core, synced alongside the override file, referenced by the same `--config` merge.
- **D-08:** A missing or malformed override file at build time **fails the build loudly** — never silently falls back to core's generic defaults. Rationale: a wrong updater endpoint silently shipped to the wrong customer is a worse failure mode (broken/misdirected auto-update) than a red CI run. — **Reversibility:** reversible — this is a CI-step behavior, not a data/schema decision.

### New-customer onboarding
- **D-09:** Onboarding produces both a script and docs: `scripts/onboard-customer.ps1` (repo creation via `gh` CLI, mirror-push target registration, GitHub Environment creation, `tauri.override.json` + icon template scaffolding, `customers.json` manifest entry) plus a `docs/` runbook for the parts that can't be scripted. Matches this repo's existing convention (`scripts/generate-build-cert.ps1`, `scripts/backup-db.sh`, `scripts/verify-installer-integrity.ps1`).
- **D-10:** Creating/registering the new customer's Supabase project itself is a **manual** step (dashboard or `supabase` CLI, `supabase db push --project-ref` per Spike 010's already-validated pattern) — not scripted end-to-end. The script's plumbing picks up after the project exists.
- **D-11:** `scripts/onboard-customer.ps1` sets up plumbing only — it does **not** trigger the customer's first release. The first sync happens naturally on the next normal release-workflow run once the customer is marked `active`, using the exact same path every subsequent release uses (no special-cased first-run logic).
- **D-12:** The script is idempotent — every step checks current state first and skips/updates rather than failing or duplicating, so a partially-failed onboarding run can be safely re-run.
- **D-13:** `customers.json` manifest entry fields: `name`, `repo`, `status`, `supabase_project_ref`, `deployment_mode`.
- **D-14:** `deployment_mode` (`"cloud" | "self_hosted"`) is added to the manifest schema now as an architectural door-open, but **only `"cloud"` is implemented** in this phase's script and CI. No customer has asked for a self-hosted-Docker Supabase stack yet; the app already only needs a reachable URL + anon key, so nothing else hardcodes a Cloud-only assumption. Building the self-hosted CI deploy path (migrations via `--db-url` instead of `--project-ref`, secrets in that stack's own env) is deferred until a real customer needs it — see Deferred Ideas. — **Reversibility:** reversible — the field is additive; implementing the second mode later doesn't require touching the cloud path.

### Taj House of Spices retrofit
- **D-15:** Phase 26 retrofits Taj House of Spices (the one real existing customer) into the new model rather than leaving them on the old hardcoded path — proves the mechanism end-to-end against a real customer instead of shipping it untested until customer #2 arrives.
- **D-16:** Core's `tauri.conf.json` is stripped to a generic, customer-agnostic placeholder identity (e.g. `com.example.supermarketpos`) that fails loudly per D-08 if built without an override. Taj's real values (`com.tajhouseofspices.supermarketpos`, their publisher string, their updater endpoint) move into `customers/taj-house-of-spices/tauri.override.json`. — **Reversibility:** one-way for already-installed Taj clients — an installed app's `identifier` determines its Windows install location/registry keys and its updater's trust chain; changing it after Taj is live would require a fresh install, not an in-place update. The retrofit must preserve the exact current identifier value, not invent a new one.
- **D-17:** Cutover order is parallel-run, not a direct cut: stand up Taj's new mirrored repo + override file + release pipeline while core's existing `release.yml` keeps working as today's fallback; verify a real signed installer and a real update cycle through the new path; only then retire the direct-from-core release path. No window exists where Taj's live store has no working update path.

### Dependencies (pre-existing, filed as todos)
- **D-18:** This phase depends on two already-filed todos landing first (or as part of this phase's own early tasks): `fix-ci-tauri-build-broker-order.md` (blocks `tauri-build`/CI entirely today — the broker crate must be built before `cargo test` runs) and `migrate-env-production-to-github-environment.md` (interim single-customer credential-hygiene fix for Taj, ahead of the full N-customer machinery — a natural predecessor to D-06's per-customer secrets pattern). The planner should sequence these as prerequisite or first-wave work, not assume they're already resolved.

### Claude's Discretion
- Exact `gh` CLI invocations and GitHub Environment naming convention inside `onboard-customer.ps1`.
- Whether the mirror-push sync runs as a step in the existing `release.yml` or a new dedicated workflow file — implementation detail, not a user-facing decision.
- Exact retry/error-handling behavior when a mirror-push to one customer fails mid-fan-out (e.g., does it stop or continue to remaining customers) — not raised during discussion; planner should pick a sane default (continue + report failures, don't let one customer's push failure block others) and can flag if it needs confirmation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike findings (this phase's technical validation)
- `.planning/spikes/MANIFEST.md` (idea key: `multi-customer-deployment`) — full requirements list, spikes 007–010 verdicts, and the branching decision. Spike 007 (github-releases-latest-scope) is INVALIDATED — confirms `/releases/latest` is repo-wide, which is *why* the separate-repo-per-customer model was chosen. Spikes 008–010 are VALIDATED: Tauri config-merge (008), GitHub Environments secret isolation (009), multi-project migration fan-out via `--project-ref` (010).

### Dependency todos
- `.planning/todos/pending/fix-ci-tauri-build-broker-order.md` — blocking CI bug, must land before/alongside this phase's CI changes (D-18).
- `.planning/todos/pending/migrate-env-production-to-github-environment.md` — interim single-customer secrets fix for Taj, precedes/informs D-06's GitHub Environment-based secrets pattern (D-18).

### Current hardcoded state (what this phase replaces)
- `src-tauri/tauri.conf.json` — currently hardcodes `identifier: com.tajhouseofspices.supermarketpos`, `publisher: Taj House of Spice Supermarket POS`, and `updater.endpoints: [github.com/zedfauji/supermarket-pos/releases/latest/...]`. These exact values must be preserved verbatim into Taj's override file per D-16.
- `.github/workflows/release.yml` — current single-customer release pipeline (tauri-action, self-hosted Windows runner, build-cert generation via `--config` merge — the precedent D-06/D-07 extend). Sync/manifest-gating logic (D-01..D-04) is new work layered onto this file or a sibling workflow.
- `.github/workflows/ci.yml` — separate pipeline; relevant only via the D-18 broker-build-order dependency.

No formal ADR/spec doc exists for this phase beyond the spike manifest and STATE.md's Phase 26 roadmap-evolution entry — this CONTEXT.md is the canonical decision record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/generate-build-cert.ps1`, `scripts/backup-db.sh`, `scripts/verify-installer-integrity.ps1` — existing `scripts/` convention that `onboard-customer.ps1` should match (D-09).
- `release.yml`'s existing `--config` JSON-merge pattern (used today for `certificateThumbprint`/`digestAlgorithm`) is the exact mechanism the override-file merge (D-06) extends — no new Tauri capability needed, just a second merge input.

### Established Patterns
- Migration/edge-function deploys already use explicit `--project-ref` per Supabase project (Spike 006/010 precedent) — the same discipline applies per-customer, never `supabase link`/`--linked`, since this repo's self-hosted runner workspace persists across jobs/customers.
- Self-hosted Windows runner workspace persistence is a recurring gotcha across this session's spikes (`broker.exe`, locked native modules, leftover `.env.production`) — any new sync/onboarding automation must explicitly clean up per-customer materialized secrets/files before job end, same as D-06/D-07's synced files should be scoped to only touch what they own.

### Integration Points
- `release.yml` is the natural home for the new sync step (D-01..D-04) — it already runs on the self-hosted Windows runner and already does a `--config` merge.
- `tauri.conf.json` is the file D-16's placeholder-identity change touches directly; `src-tauri/` has no other customer-identity-bearing files found during this discussion.

</code_context>

<specifics>
## Specific Ideas

- User's exact framing for the licensing tie-in: "I need to control which customer gets latest version or not, i am planning to implement licensing and costs tracking, if any customer isn't paying, stop the update to the customer." — captured as D-03/D-04 (the mechanism this phase builds) plus a deferred idea (the actual licensing/billing system, D-05).
- User's exact framing for the self-hosted question: "what if customer decides to host a local supabase stack in docker and doesn't want remote supabase project. How will it be configured and shipped?" — captured as D-13/D-14 (manifest field now, implementation later).

</specifics>

<deferred>
## Deferred Ideas

- **Licensing/billing/payment-tracking system** — invoicing, automated payment detection, auto-suspending non-paying customers. This phase only builds the manual `active`/`suspended` gate (D-03) a future system could plug into; the system itself (who pays, how, what triggers cutoff, grace periods, notifications) needs its own requirements discussion and belongs in its own future roadmap phase.
- **Self-hosted-Supabase-in-Docker production support** — a customer running their own Docker Compose Supabase stack instead of a Supabase Cloud project. The manifest reserves a `deployment_mode` field (D-14) but the CI deploy path (migrations via `--db-url`, secrets in that stack's own env, no `--project-ref` fan-out) is unbuilt and unvalidated — no spike has covered a self-hosted-in-production pattern anywhere in this project. Build when a real customer needs it.

### Reviewed Todos (not folded)
None — `todo.match-phase` found no automatic matches for Phase 26, but two pending todos (`fix-ci-tauri-build-broker-order.md`, `migrate-env-production-to-github-environment.md`) were manually identified as dependencies during discussion and are captured as D-18 / canonical refs rather than folded scope items, since they're pre-existing blockers this phase depends on rather than work this phase newly discovers.

</deferred>

---

*Phase: 26-multi-customer-deployment*
*Context gathered: 2026-09-01*
