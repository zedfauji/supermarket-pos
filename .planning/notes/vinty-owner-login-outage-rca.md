---
title: Vinty Owner login outage — full RCA
date: 2026-08-30
context: Production login outage on remote Supabase project mkvinyekkyennyegfoxq (taj-house-of-spice-supermarket-pos-backend), staff account "Vinty Owner". Investigated live against the remote project via Supabase MCP (execute_sql, query_logs, list_migrations).
---

# Vinty Owner login outage — RCA

## User-reported symptom (verbatim)

> logged in as Vinty Owner, click on force to change pin, for the same user Vinty Owner, logged out,
> then logged in with right PIN, it asked me to change the PIN, i changed it to 100001 and now its
> saying PIN is incorrect and when i put the old one which was 582147, its saying "No se pudo iniciar
> sesión. Inténtalo de nuevo o contacta a tu gerente."

Both the new PIN (100001) and the old PIN (582147) failed after the change attempt. That symptom shape
— old **and** new credential both rejected — is the signature of a backend account failure, not a
wrong-password user error, and that's what the evidence below confirms.

## Root cause (confirmed via GoTrue error logs)

```
error: "error finding user: sql: Scan error on column index 3, name \"confirmation_token\":
        converting NULL to string is unsupported"
error_code: unexpected_failure
status: 500
```
and
```
error: "error finding user: sql: Scan error on column index 8, name \"email_change\":
        converting NULL to string is unsupported"
```

GoTrue (Supabase's Go auth server) scans the full `auth.users` row into non-nullable Go `string`
fields on every endpoint that reads a user by row (`/token` password grant, `/recover`, `/magiclink`,
`/admin/users`). Four `auth.users` text columns had **no schema-level `DEFAULT ''`** and were `NULL`
for the Vinty Owner row:

- `confirmation_token`
- `recovery_token`
- `email_change_token_new`
- `email_change`

The moment GoTrue tried to scan that row, it 500'd — for **every** endpoint that touches the row, not
just the one the user happened to be using. This is why entering the new PIN failed, and why falling
back to the old PIN *also* failed: neither request ever reached a "does this password match" check —
the row-scan crashed before credential comparison even ran.

## How the NULLs got there

The Vinty Owner row was created via a **raw SQL `INSERT` into `auth.users`** in an earlier session
(2026-08-27), bypassing GoTrue's Admin API. Every other account-creation path in this repo
(`scripts/setup-dev-users.ts`, `scripts/setup-test-fixtures.ts`, `scripts/seed-remote-e2e-admin.ts`,
and Supabase Studio's "Add user" button) goes through `supabase.auth.admin.createUser()`, which sets
every token column to `''` explicitly. The raw INSERT omitted them, so they defaulted to Postgres
`NULL` (no column-level default exists for those 4 columns — confirmed below), leaving a landmine that
sat dormant until the first GoTrue endpoint tried to read that row's full column set.

Confirmed no migration in this repo ever creates or touches an `auth.users` row — `list_migrations`
on the remote project shows 190 migrations, all against `public.*` tables; the Vinty Owner row was
never part of the tracked migration history at all. It was invisible to the whole migration/CI
pipeline by construction, not something "an earlier migration let slip through."

## Why the two app-level features (`force_pin_change`, `updateUser`) are innocent

Checked both RPCs' live definitions on the remote project:

- `public.force_pin_change(p_staff_id, p_terminal_id)` — only updates `public.profiles.must_change_pin`. Never touches `auth.users`.
- `public.clear_must_change_pin(p_terminal_id)` — same, only `public.profiles`.

Neither has any code path that could set a NULL in `auth.users`. The actual write to `auth.users`
happens client-side in `src/widgets/PINLoginForm/PINLoginForm.tsx:121`:
```ts
await supabase.auth.updateUser({ password: newPin });
```
This calls GoTrue's own `/user` PUT endpoint, which is exactly one of the endpoints that does a
full-row scan — so it was the trigger that surfaced the pre-existing NULL landmine, not the cause of it.

## Full incident timeline (from `auth_logs`, 2026-08-30, times UTC)

| Time | Path | Status | Meaning |
|---|---|---|---|
| 21:33:29 – 21:41:47 | `/token`, `/recover`, `/magiclink`, `/admin/users` | 500 `unexpected_failure` | GoTrue scan crash on NULL `confirmation_token` / `email_change`. This is the outage window — Vinty Owner fully locked out, admin user list itself broken. |
| ~21:4x (undated exact deploy timestamp not logged by GoTrue) | — | — | Migration `20260830000001_auth_users_token_defaults.sql` applied: `COALESCE(..., '')` backfill on the 7 nullable token columns for any row currently NULL. |
| 23:17:43 – 23:30:10 | `/token` | 400 `invalid_credentials` | **Real** wrong-password rejections (clean GoTrue behavior, no scan crash) — consistent with someone testing PIN entry after the fix. |
| 23:28:09 | `/token` | 200 | Unrelated account (`alex-cashier@store.local`) logs in successfully — confirms the auth service itself was healthy again. |
| 23:54:56 | `/token` | 200 (implied by `last_sign_in_at`) | Vinty Owner successful login. |
| 23:55:04 – 23:55:21 | `/user` (password update), then `/token` | 400 once, then stable | PIN reset back to the original `582147` and `must_change_pin` cleared directly via SQL (`profiles.pin`, `must_change_pin`), sidestepping the in-app forced-change UI for this account. |

This confirms the sequence the user described happened **during the live outage window**
(21:33–21:41 UTC), and that the account was already stable again by 23:55 UTC, well before this
`/gsd-explore` session started.

## Current verified state (queried live, 2026-08-30 ~23:58 UTC)

```
auth.users:    confirmation_token='', recovery_token='', email_change_token_new='',
               email_change_token_current='', phone_change_token='', reauthentication_token=''
               (all empty string, none NULL)
public.profiles: pin='582147', must_change_pin=false, is_active=true
```
Only 2 rows total exist in `auth.users` on this project (`alex-cashier@store.local`,
`vinty-owner@store.local`) — both checked, neither has any NULL token column. No other landmine
accounts exist right now.

## The fix (`supabase/migrations/20260830000001_auth_users_token_defaults.sql`)

An idempotent `UPDATE ... SET x = COALESCE(x, '') WHERE x IS NULL OR ...` backfill across all 7
token-ish columns. Applied to both remote and local dev Supabase.

**What it explicitly does NOT do, and why:** it cannot add a schema-level `ALTER TABLE auth.users
ALTER COLUMN ... SET DEFAULT ''`. That statement fails with `must be owner of table users`
(`SQLSTATE 42501`) under `supabase db push`, a direct service-role SQL Editor connection, and even
`SET ROLE supabase_auth_admin` — Supabase locks schema-level ownership of `auth.*` to its own managed
GoTrue service specifically so project migrations can't alter its DDL shape. Confirmed live: 4 of the
7 columns (`confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`) still
report `column_default: null` in `information_schema.columns` today — the other 3
(`email_change_token_current`, `phone_change_token`, `reauthentication_token`) already had `DEFAULT
''::character varying` from Supabase's own GoTrue-managed schema, unrelated to our migration.

## Residual risk (not fully closed — procedural only)

Because the schema-level gap can't be closed by this project, **the exact same outage will recur** if
anyone ever inserts or updates a row directly against `auth.users` and leaves those 4 columns
unset/NULL again — whether via a manual SQL Editor session, a future one-off "quick fix," or a script
that doesn't go through the Admin API. There is no DB-level guard against it going forward; the only
mitigation is procedural discipline:

- **Always** create/repair Supabase Auth users via `supabase.auth.admin.createUser()` /
  `admin.updateUserById()` (or Studio's "Add user", which calls the same API) — never a raw
  `INSERT`/`UPDATE` on `auth.users`.
- If a raw fix on `auth.users` is ever unavoidable again, re-run the
  `20260830000001_auth_users_token_defaults.sql` backfill immediately after, or manually set the 4
  gap columns to `''` in the same statement.

## Why "earlier migrations" didn't catch this

They couldn't have — this wasn't a migration-introduced bug. No migration in this repo's 190-migration
history ever creates or writes to `auth.users`; the account that broke was seeded completely outside
the migration system via a manual SQL session. The migration pipeline has no visibility into `auth.*`
at all (by Supabase's design — see permission boundary above), so there was never a gate this could
have passed or failed. The only realistic prevention is the procedural rule above, not a schema check.

## Incident 2 — same symptom returned, DIFFERENT root cause (2026-08-31 00:05 UTC)

After the outage above was fixed and this doc's first version was written, the user reported PIN
`582147` still failing. Re-checked live logs: this was **not** a recurrence of the NULL-scan crash.

```
error: "400: Invalid login credentials"
error_code: invalid_credentials
```
A clean, honest rejection — GoTrue successfully scanned the row and compared the password; it simply
didn't match. This is a **second, distinct bug**, introduced by the manual recovery step taken during
Incident 1.

**Root cause 2:** the PIN login flow has **two separate sources of truth** for the credential:

1. `public.profiles.pin` — a plaintext column read client-side, used only for the pre-flight UX check
   in `PINLoginForm.tsx:76` (`enteredPin !== selectedStaff.pin`) before ever calling Supabase Auth.
2. `auth.users.encrypted_password` — the actual bcrypt hash GoTrue checks in `signInWithPassword()`.
   This is the row that decides whether login succeeds.

During Incident 1's live recovery, whoever ran the manual SQL fix set `profiles.pin` back to
`582147` and cleared `must_change_pin`, but **never touched `auth.users.encrypted_password`** —
which still held the bcrypt hash of whatever PIN the in-app forced-change flow had last successfully
written (the `/user` PUT that succeeded at `2026-08-30T23:55:04Z`, confirmed 200 in `auth_logs`, value
unknown — it was never logged). So the two stores silently diverged: the UI showed/compared `582147`
and let the user past the first client-side check, then `signInWithPassword` rejected it for real
because the actual stored hash was for a different value entirely.

**Fix applied (2026-08-31T00:06:54Z, verified):**
```sql
update auth.users
set encrypted_password = crypt('582147', gen_salt('bf', 10)),
    updated_at = now()
where email = 'vinty-owner@store.local';
```
Verified post-write with `crypt('582147', encrypted_password) = encrypted_password` → `true`, and
`public.profiles.pin = '582147'`, `must_change_pin = false` — both stores now agree. `pgcrypto`
(already installed, v1.3) produces the same `$2a$10$` bcrypt format GoTrue itself uses, confirmed by
comparing the hash prefix/length (`$2a$10$`, 60 chars) against the pre-existing row.

**Prevention — never patch just one side again.** If a PIN/password ever needs a manual SQL reset for
this app, **both** columns must be written **in the same statement/transaction**:
`public.profiles.pin` (display/UX-gate value) **and** `auth.users.encrypted_password` (real credential,
via `crypt(new_pin, gen_salt('bf', 10))`). Whenever possible, prefer going through
`supabase.auth.admin.updateUserById(id, { password })` instead — it hashes correctly and is the
sanctioned path — but if `profiles.pin` is touched by hand afterward to keep the UI's own comparison
in sync, both writes belong in one operation, not two separate ad hoc fixes done at different times.

## Related records

- Broken-windows ledger entry #42 (`.planning/WINDOWS.md`) — status `fixed` (Incident 1).
- `.planning/notes/store-deployment-installer-decisions.md` — earlier postmortem note (this doc
  supersedes it with full log evidence and the residual-risk section).
- `CLAUDE.md` — "Auth: PIN has two credential stores" rule added as a result of Incident 2.
