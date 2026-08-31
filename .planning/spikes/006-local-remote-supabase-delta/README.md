---
spike: 006
idea: supabase-env-parity
name: local-remote-supabase-delta
type: standard
validates: "Given the local self-hosted Supabase dev stack and the remote Supabase Cloud project (mkvinyekkyennyegfoxq), when compared across schema/migrations, RPCs, edge functions, extensions, RLS, and auth config, then every material delta between them is documented before the next feature deploy"
verdict: VALIDATED
related: []
tags: [supabase, migrations, edge-functions, ops, sanity-check, document-only]
---

# Spike 006: Local ↔ Remote Supabase Delta (Sanity Check)

Document-only spike. No code changed. Purpose: know exactly what differs between the local
dev/test Supabase stack and the live remote project before shipping new features remote.

## What This Validates

Given both environments, when audited field-by-field, then any gap that could break a deploy or
mask a bug in local testing is surfaced with evidence (not guessed).

## Method

- Local: `npx supabase status` / `migration list --local`, direct `psql` against
  `127.0.0.1:54322`, and reading `supabase/config.toml` + `supabase/functions/`.
- Remote: Supabase MCP tools (`list_migrations`, `list_tables`, `list_edge_functions`,
  `list_extensions`, `get_advisors`) against project `mkvinyekkyennyegfoxq`
  ("taj-house-of-spice-supermarket-pos-backend", ACTIVE_HEALTHY, us-west-2, PG 17.6.1.166).
- Cross-referenced against `.planning/phases/20-store-deployment-installer/*` (the original
  remote-deploy phase) and `.planning/notes/vinty-owner-login-outage-rca.md` (a live incident on
  this same remote project, 2026-08-30/31) for why some deltas exist.

## Results

### 1. 🔴 Migration drift — one local migration not yet deployed to remote

`supabase/migrations/20260831000001_clear_must_change_pin_sync_pin_column.sql` exists locally
(185 migration files, applied to local DB) and is **absent from remote's migration ledger**
(remote's `list_migrations` tops out at `20260830000002_terminal_lock_settings`, then jumps
straight to the placeholder below — no `20260831000001` entry at all).

This migration fixes a real, already-reproduced production bug (RCA: "Incident 3", forced-PIN-change
credential desync — see `vinty-owner-login-outage-rca.md`). It rewrites `clear_must_change_pin()`
from a 1-arg to a 2-arg (`p_new_pin`, `p_terminal_id`) function so `profiles.pin` and
`auth.users.encrypted_password` can never diverge again after a forced PIN change.

**Impact if shipped out of order:** the fix only closes the bug once *both* halves land together —
this migration on remote, and the `PINLoginForm.tsx` code that calls the new 2-arg signature in the
next installer build. Right now neither has reached remote/production, so the app in the field is
still exposed to the same recurrence this migration was written to prevent. Deploying the frontend
build before this migration would break every forced-PIN-change (new signature, old 1-arg function
on remote → `PGRST202` function-not-found). Deploying the migration alone is safe (old frontend
doesn't call it yet).

**Action:** `supabase db push --project-ref mkvinyekkyennyegfoxq` (or the phase's normal deploy
script) before or together with the next installer that ships this frontend change — never after.

### 2. 🔴 Edge function gap — `admin-reset-pin` never deployed to remote

Local `supabase/functions/` has 13 deployable functions (14 dirs minus `_shared`). Remote
`list_edge_functions` returns only **12** — `admin-reset-pin` is missing entirely.

This is Phase 22's "Admin PIN Reset (Server-Side Recovery Path)" feature, merged to `main` at
`e54b6df` (2026-08-30). It has never been deployed (`supabase functions deploy admin-reset-pin
--project-ref mkvinyekkyennyegfoxq`). Any admin using the live app today who clicks "Reset PIN"
gets a 404 from the edge function, not the feature.

### 3. 🟡 Six edge functions deployed from a stale worktree path, never redeployed since

Remote function metadata shows two deploy generations:

| Generation | Functions | version | entrypoint_path | deployed |
|---|---|---|---|---|
| A (initial bulk deploy, phase 20-01) | `agent-proxy`, `process-payment`, `get-server-time`, `process-direct-sale`, `process-split-payment`, `receive-shipment` | 3 | `.../.claude/worktrees/agent-ac0c8d350d9b8fd10/supabase/functions/...` | 2026-08-29/30, never redeployed since |
| B (CORS-fix redeploy, phase 20-03) | `create-staff`, `send-receipt-email`, `settings-backup`, `settings-email-status`, `settings-test-email`, `settings-restore` | 4 | `.../supabase/functions/...` (main checkout) | 2026-08-30, matches `main` |

Generation A's 6 functions were last deployed from an ephemeral agent worktree and have not been
touched since — any `main`-branch change to those 6 files after that worktree was created/deleted
is **not** live on remote. A `git log` diff of each against its last-deployed commit should be run
before assuming remote matches `main` for these 6; this spike did not diff file-by-file (out of
scope for a document-only pass), but flags it as the concrete question to answer before relying on
them for new work.

### 4. 🟡 Stale ledger placeholder on both sides (harmless, but uncleaned)

Both local DB and remote list `20260831001057_concurrent_agent_placeholder` as an applied
migration with **no corresponding file** anywhere in the repo. Queried its stored statement text
directly (`supabase_migrations.schema_migrations`):

> "Placeholder only: satisfies supabase CLI's local-file glob check for 'migration repair
> --status applied' on a migration a concurrent worktree agent already applied directly to the
> shared remote project. Not executed by repair (ledger-only operation); deleted immediately
> after repair runs."

It's a no-op ledger row from GSD's worktree-isolation `migration repair` mechanism — its own
comment says it should have been deleted after use but wasn't. Harmless (empty statement, never
re-executed), identical on both sides, so it is not schema drift — but it's dead weight in the
migration ledger on both environments. Low-priority cleanup: `supabase migration repair --status
reverted 20260831001057` on both, or leave it (it does nothing).

### 5. ✅ Table/schema parity confirmed — no drift

Both environments have the exact same 35 `public` tables, same names, and **RLS enabled on all 35
tables in both** (local: `0` disabled of `35` via direct `pg_tables` query; remote:
`rls_enabled: true` on every row from `list_tables`). No table exists on one side and not the
other.

### 6. 🟡 Extension version/enablement drift

| Extension | Local (installed) | Remote (installed) | Note |
|---|---|---|---|
| `pg_graphql` | **1.5.11** | **not installed** | Local dev stack enables GraphQL by default (`supabase start`); remote does not. `config.toml`'s `api.schemas` includes `graphql_public`, so if anything ever calls the GraphQL endpoint, it works locally and silently 404s/errors on remote. App doesn't currently use GraphQL (REST/RPC only) — flagged as a latent gap, not an active bug. |
| `pg_net` | 0.20.0 | 0.20.4 | Platform-managed patch version skew (Postgres/Supabase-image version, not something this repo controls). |
| `vector` | 0.8.0 | 0.8.2 | Same — platform-managed patch skew. |
| `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`, `plpgsql` | present | present, same major | No material difference. |

### 7. 🟡 Remote security-advisor findings (context, not a local/remote delta — local has no advisor equivalent)

`get_advisors(type=security)` on remote returns 86 WARN-level lints, 0 ERROR:

- 37× `anon_security_definer_function_executable`, 37× `authenticated_security_definer_function_executable` — expected for an RPC-heavy app (every checkout/inventory/payment RPC is `SECURITY DEFINER` by design), not new drift.
- 9× `function_search_path_mutable` — functions missing `SET search_path`. Worth a follow-up pass to add it project-wide (the 2026-08-31 `clear_must_change_pin` fix above already does this correctly: `SET search_path = public`).
- 2× `extension_in_public` — `pg_net` and `vector` are installed in the `public` schema rather than a dedicated `extensions` schema (matches finding #6's schema column).
- 1× `auth_leaked_password_protection` — HaveIBeenPwned check disabled on remote Auth (dashboard-only setting, not in `config.toml`, so it can't be "compared" to local — local's GoTrue doesn't enforce this either way).

`get_advisors(type=performance)` returns 78 lints, all INFO/WARN, 0 ERROR: 20× `unindexed_foreign_keys`, 40× `unused_index`, 4× `auth_rls_initplan`, 14× `multiple_permissive_policies`. Pre-existing state of the remote project, not something this spike introduced or that differs from what local schema *would* produce if the same advisor ran against it (local self-hosted has no advisor API to compare against — noted as a tooling gap, not a data point).

### 8. ⚪ Auth config — structurally different by design, not comparable 1:1

`supabase/config.toml`'s `[auth]` block only governs the **local** stack. Remote's Auth settings
(SMTP, leaked-password protection, JWT expiry, redirect URLs, rate limits) live in the Supabase
Cloud dashboard/Management API and are not tracked in this repo at all. This is expected — flagging
so no one assumes `config.toml` is the source of truth for remote Auth, and lists finding #7's
`auth_leaked_password_protection` as the one concretely known remote-only Auth gap.

## Verdict

**VALIDATED** — the delta audit is complete and every finding above is backed by a live query
against both environments (not inference). Two 🔴 items are actionable before the next remote
deploy (migration 20260831000001, `admin-reset-pin` function); the rest are either informational,
already-known platform behavior, or low-priority cleanup.

## Signal for the Build

Before shipping the next feature to remote:
1. Deploy `20260831000001_clear_must_change_pin_sync_pin_column.sql` via `supabase db push` — do this *before or with* any installer build that ships the new `clear_must_change_pin` 2-arg call.
2. Deploy `admin-reset-pin`: `supabase functions deploy admin-reset-pin --project-ref mkvinyekkyennyegfoxq` (plus its required secrets, per Phase 22's plan).
3. Before trusting the 6 generation-A edge functions (`agent-proxy`, `process-payment`, `get-server-time`, `process-direct-sale`, `process-split-payment`, `receive-shipment`) as "in sync with main," diff each against its last-deployed commit (their `updated_at` predates every commit since the initial worktree deploy) and redeploy any that changed.
4. Adopt `supabase migration list --linked --project-ref mkvinyekkyennyegfoxq` (or this spike's method) as a pre-deploy checklist step going forward — this is the first time local/remote parity was checked end-to-end since the pivot, and it already found a live-bug-fix migration sitting undeployed.
