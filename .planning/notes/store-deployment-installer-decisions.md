---
title: Store deployment installer decisions
date: 2026-08-27
context: GSD exploration of packaging a seamless, elevated Windows installer for the store machine, connected to remote Supabase
---

# Store Deployment Installer Decisions

## Decisions

- **Code signing:** self-signed certificate, generated at build time, imported into the store PC's
  Trusted Root store during the (now-elevated) installer run. Free, no CA verification wait. Only
  works cleanly because this targets one machine the owner controls — do not reuse this approach for
  a multi-customer/public distribution without a real CA cert.
- **Elevation:** the installer must run fully elevated (`requestedExecutionLevel=requireAdministrator`
  via NSIS `installMode: perMachine`), not just the individual post-install steps. The broker Windows
  Service registration, the firewall rule, and the cert Trusted-Root import (Phase 19-02 + this
  session) all require admin — a non-elevated installer silently fails those steps. `installMode:
  perMachine` was set in `src-tauri/tauri.conf.json` this session.
- **Updater endpoint:** was pointing at `github.com/zedfauji/bola8pos` (the old bar-pos repo this
  project pivoted from) — fixed to `github.com/zedfauji/supermarket-pos/releases/latest/download/latest.json`.
- **GitHub repo:** `zedfauji/supermarket-pos` created and pushed as **public** (explicit user choice —
  repo was empty/fresh, no secrets in history, `.env*` never committed).

## Remote Supabase bootstrap (done this session)

- Remote project confirmed: `taj-house-of-spice-supermarket-pos-backend`
  (`mkvinyekkyennyegfoxq`, us-west-2, healthy) — matches the app's `com.tajhouseofspices.supermarketpos`
  identifier.
- Remote DB had **zero tables** before this session. `.env.local` (used by local dev builds) points at
  `127.0.0.1:54321` — local Supabase, not remote. This is expected for dev, but meant a naive
  `npm run build` would have shipped a store installer pointing at localhost.
- Linked local `supabase/` config to the remote project and ran `supabase db push` — all 180
  migrations applied cleanly (one transient deadlock mid-push, resolved by retrying — `db push`
  tracks applied migrations so the retry resumed correctly). Security advisors post-push: 83 WARN-level
  findings, all pre-existing SECURITY DEFINER/search_path patterns consistent with this app's
  RPC-based RLS architecture — no ERROR-level findings, no RLS-disabled tables.
- Created `.env.production` (git-ignored) with the remote project's URL and anon key — Vite's
  `production` mode (the default for `npm run build`) picks this up automatically over `.env.local`.
- Seeded exactly one real admin profile — `Vinty Owner`, role `admin`, `must_change_pin: true` (the
  chosen PIN was sequential; the app will prompt a PIN change on first real login — this is an
  existing feature, not new work). No E2E/dev test accounts were seeded to production.

## Open follow-up

- The remote DB password was pasted directly into this chat session to run `supabase link`/`db push`.
  Rotate it from the Supabase dashboard (Project Settings → Database) as hygiene, independent of
  whether anything went wrong.
- `must_change_pin: true` on the seeded admin means the very first login will force a PIN change —
  make sure whoever does that first login expects the prompt.

## Incident: Vinty Owner could not log in (2026-08-30)

**Symptom:** After the installer shipped, `Vinty Owner` could not log in ("No se pudo iniciar sesión"),
password recovery failed, and magic link failed — all with generic client-facing errors. Supabase
Studio's own "Reset password" action also failed with `Database error finding user`.

**Root cause:** This account was seeded above via a raw SQL INSERT into `auth.users`, not through
GoTrue's Admin API. GoTrue's Go driver scans several `auth.users` text columns
(`confirmation_token`, `email_change`, `email_change_token_new`, `recovery_token`) into non-nullable
Go strings. These 4 columns have **no `DEFAULT ''`** at the Postgres schema level (unlike their
siblings `email_change_token_current`/`phone_change`/`phone_change_token`/`reauthentication_token`,
which already default to `''`). The raw INSERT above didn't set them, so they landed `NULL` —
confirmed via Supabase's own log stream (`auth_logs`): every affected endpoint (`/token`, `/recover`,
`/magiclink`, `/admin/users`) returned a 500 `error finding user: sql: Scan error ... converting NULL
to string is unsupported`. GoTrue's own `createUser`/Admin API always sets these explicitly, which is
exactly why none of this repo's own seeded fixture/test accounts (all created via
`scripts/setup-dev-users.ts`, `scripts/setup-test-fixtures.ts`, `scripts/seed-remote-e2e-admin.ts`, or
the app's `create-staff` edge function) ever hit this — only this one hand-seeded production account did.

**Fix:**
1. Live backfill (`UPDATE auth.users SET confirmation_token = COALESCE(...), ...`) — confirmed real
   login succeeded immediately after.
2. Captured as `supabase/migrations/20260830000001_auth_users_token_defaults.sql` (idempotent
   COALESCE backfill) so any environment applying migrations from scratch gets the same repair.
3. **Could not** add a schema-level `DEFAULT ''` to close the gap permanently — `ALTER TABLE
   auth.users ALTER COLUMN ... SET DEFAULT ''` fails with `must be owner of table users` (42501)
   under both `supabase db push` and a direct SQL connection, and even `SET ROLE
   supabase_auth_admin` is itself permission-denied. Supabase deliberately locks ownership of the
   `auth` schema to its own managed GoTrue service — this is a platform boundary the project cannot
   migrate around.
4. **Prevention is procedural, not schematic:** never create an `auth.users` row via a raw SQL INSERT
   again. Always provision accounts through GoTrue's Admin API (`supabase.auth.admin.createUser()`)
   or Supabase Studio's "Add user" button (which calls the same Admin API internally) — both already
   set every token column correctly.

Also discovered mid-incident: the disposable E2E fixture admin account created by Phase 20's
gap-closure plan (20-03) was removed post-launch along with all other E2E test residue
(payments/refunds/tabs/orders/caja_sessions/products), and the catalog was reseeded with 27 real
Indian grocery products across 9 categories, plus a real staff account (`Alex Cashier`, cashier role).
Full ledger entry: `.planning/WINDOWS.md` #42.
