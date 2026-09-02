# Spike Manifest

## Ideas

### store-local-printing

Validate the store-local Windows printing broker before committing the production implementation.

**Requirements:**

- Must accept authenticated jobs from mobile, desktop, and POS clients over LAN/VPN only.
- Must durably accept a job before the originating workflow succeeds.
- Must continue processing after the POS application exits or restarts.
- Must retain an auditable event history and propagate correlated structured errors.
- Must use named Windows printer queues and make no public-internet or cloud calls.
- Must treat "spooler accepted the job" as ambiguous, never as physical-output proof — jobs that
  purge from the spooler before their terminal status is observed land in a distinct `unknown`
  state, never auto-resubmitted, surfaced to an operator for manual confirm/reprint (Spike 001).
- Must actively monitor per-printer queue health (a stuck head-of-queue job blocks every job
  behind it) — plain per-job retry does not detect or clear this (Spike 001).
- Every client (mobile, desktop, POS) must set an aggressive connect-timeout when calling the
  broker — an unreachable broker can time out rather than instantly refuse (Spike 001).
- Service must run under a dedicated least-privilege account, not LocalSystem (Spike 001 used
  LocalSystem for expedience; this still needs its own verification pass).

### bank-transfer-payment-tracking

Track customer bill payments made by bank-to-bank transfer (SPEI) instead of cash/card, replacing
the current hand-written paper name+phone process. Core mechanism: the POS generates a unique
reference code per pending-transfer sale; the customer is expected to include that code in the
transfer's concept/memo field; admin manually reconciles by matching the reference against their
own banking app/statement (the statement is never imported into or synced with the POS) and
confirms the sale in-app. The store manages multiple bank accounts (Banorte confirmed, others
unspecified).

**Requirements:**

- Bank statement data must never be imported into or synced with the POS — the reference code is
  the only cross-system link; confirmation is always a manual admin action inside the POS.
- Ambiguous or duplicate-amount matches always require an explicit manual tap-to-confirm from
  admin/manager — no silent auto-confirm, even when a match looks unambiguous.
- WhatsApp send-out of payment confirmation to the customer is planned as a later integration —
  out of scope for this spike round.
- Store operates across multiple banks — any reference-code scheme or bank-API research must not
  assume a single bank.
- A pending/confirmed transfer-transactions view lives on the existing `/payments` page (not a
  new route), listing every pay-later/bank-transfer sale regardless of state, with an admin export
  (CSV) of the pending+confirmed list for end-of-day final reconciliation.
- Reference code must be numeric-first (targets SPEI's Banxico-standard "referencia numérica"
  field, ≤7 digits) with concepto (40-char freeform) as fallback; never natural-language phrasing
  in a concepto-based code — MX banks' fraud/UIF filters actively scan concepto text (Spike 002).
- No automated bank-transaction feed is available at reasonable cost/effort for this store's size
  today (Spike 002) — direct Banorte integration is contract/batch-only, MX open-banking
  aggregators are unregulated and enterprise-priced. A PSP SPEI-reference product (Conekta/Clip,
  ~$12.50 MXN+IVA/txn, works across every MX bank via SPEI) is a viable future upgrade to fully
  automate confirmation, but is out of scope for this build — manual admin confirmation is the
  near-term design target.

### supabase-env-parity

Keep the local self-hosted Supabase dev/test stack and the remote Supabase Cloud project
(`mkvinyekkyennyegfoxq`) in known sync before every remote deploy — document-only delta audits,
no code changes. Triggered as a pre-deploy sanity check, not tied to a specific feature build.

**Requirements:**

- A migration that fixes a live-reproduced production bug must never sit undeployed on remote
  while its matching frontend change ships — deploy DB migration before or with the app build
  that depends on it, never after (Spike 006).
- Edge functions deployed from an ephemeral agent worktree path must be diffed against `main`
  before being trusted as in-sync — their `updated_at` freezes at worktree-deploy time, not at
  the worktree's later commits (Spike 006).

### multi-customer-deployment

Ship this same supermarket-pos codebase to multiple customers, each downloading their own Windows
installer from GitHub Releases, each with a fully isolated Supabase project (confirmed: no
tenant_id/shared-DB scaffolding exists anywhere in the schema — isolation-by-separate-project is
the only viable model without a large RLS retrofit). Triggered by CI run
`33587195680`/job `100113706453` failing with `bar-pos v1.2.0` in the log (leftover fork branding)
and the realization that `.env.production`'s creds and `tauri.conf.json`'s identifier/publisher/
updater-endpoint are all hardcoded to one customer (Taj House of Spices) today.

**Requirements:**

- No shared-DB/tenant_id retrofit — every customer gets a fully separate Supabase project; this is
  a multi-**instance** model, not multi-tenant-in-one-database.
- Each customer must have its own effective `/releases/latest` (a shared repo-wide "latest" breaks
  Tauri's auto-updater across customers — Spike 007).
- The core `tauri.conf.json` stays customer-agnostic; per-customer identity (identifier, publisher,
  updater endpoint, icon) is supplied as a small override file merged at build time, not a forked
  config or forked codebase (Spike 008).
- Per-customer secrets (Supabase URL/anon key/project-ref/db password) live in one GitHub
  Environment per customer, never as a hand-copied `.env.production` file on disk outside CI
  (Spike 009). On this repo's self-hosted runner specifically, the job must clean up any
  materialized `.env.production` before exiting — the workspace persists across jobs/customers here.
- Migration/edge-function fan-out to each customer's remote project must use explicit
  `--project-ref` per call, never `supabase link`/`--linked` — the self-hosted runner's persistent
  workspace makes `link`'s on-disk state a cross-customer collision risk that stateless
  `--project-ref` invocations avoid entirely (Spike 010).
- `SUPABASE_ACCESS_TOKEN` (account/org-level) can be one shared secret; project-ref and DB password
  are what actually varies per customer (Spike 010).
- **Branching decision (post-spike, user confirmed):** one private core repo stays the single
  source of truth for the codebase (current `main`). Each customer gets their own thin repo whose
  job is only Actions + Releases (or a full mirror), giving each a genuine, uncontaminated
  `/releases/latest` — not a shared repo with workaround endpoints (Spike 007's alternative was
  considered and rejected in favor of this). Core fixes reach customer repos via a sync/mirror
  step, never manual per-customer cherry-picks.

## Spikes

| # | Idea | Name | Type | Validates | Verdict | Tags |
|---|------|------|------|-----------|---------|------|
| 010 | multi-customer-deployment | multi-project-migration-fanout | standard | Given Spike 006's proven single-project supabase db push method, when driven by a customer-to-project-ref loop on this repo's disk-persistent self-hosted runner, then confirm no state collision between customers across sequential invocations | VALIDATED | supabase, migrations, multi-customer, self-hosted-runner, ci |
| 009 | multi-customer-deployment | github-environments-secret-scoping | standard | Given N GitHub Environments each holding one customer's secrets, when a workflow_dispatch job selects one via environment:, then confirm the job cannot resolve a sibling customer's secret | VALIDATED | github-actions, secrets, environments, multi-customer, ops |
| 008 | multi-customer-deployment | tauri-multi-config-merge | standard | Given the base tauri.conf.json plus a small per-customer override, when built via Tauri's config-merge mechanism, then confirm the override reaches the compiled artifact without forking the whole config file | VALIDATED | tauri, config, multi-customer, build |
| 007 | multi-customer-deployment | github-releases-latest-scope | standard | Given 2+ differently-tagged releases in one GitHub repo, when querying /releases/latest, then determine whether it scopes by tag prefix or is repo-wide | INVALIDATED | github-releases, tauri-updater, multi-customer, ops |
| 006 | supabase-env-parity | local-remote-supabase-delta | standard | Given the local self-hosted Supabase dev stack and the remote Supabase Cloud project, when compared across schema/migrations/RPCs/edge functions/extensions/RLS/auth config, then every material delta is documented before the next feature deploy | VALIDATED (remediated) | supabase, migrations, edge-functions, ops, sanity-check |
| 001 | store-local-printing | windows-print-broker | standard | Given a LAN client and installed broker, when a job is durably accepted and the POS exits, then the broker retains, routes, and audits it through a named Windows printer queue | VALIDATED | windows-service, printing, sqlite, lan |
| 002 | bank-transfer-payment-tracking | bank-integration-research | standard | Given the store banks with Banorte and others, when researched for MX SPEI/business-API/open-banking integration options, then a clear feasibility verdict on programmatic reconciliation vs. manual reference-code matching is produced | PARTIAL | research, payments, mexico, spei |
| 003 | bank-transfer-payment-tracking | reference-code-design | standard | Given a 6-digit payload + Luhn check digit inside SPEI's 7-digit referencia numerica limit, when a customer or admin mistypes it, then the mistype is almost always caught rather than silently matching the wrong sale | VALIDATED | algorithm, payments, mexico, spei |
| 004 | bank-transfer-payment-tracking | transfer-state-model | standard | Given a sale marked pending bank transfer, when cashier marks it and manager+ later confirms/disputes it, then the state machine fits the project's existing payments/audit_logs/RBAC patterns with zero silent auto-confirm paths | VALIDATED | state-machine, rbac, payments, schema |
| 005 | bank-transfer-payment-tracking | payments-transfer-view | standard | Given sales sitting in pending/confirmed/disputed bank-transfer state, when admin opens the /payments page's Bank Transfers view, then it lists everything with reference code, customer name/phone, elapsed time, manual confirm/dispute controls, and a CSV export of pending+confirmed for end-of-day reconciliation | VALIDATED | ui, payments, export, csv |

