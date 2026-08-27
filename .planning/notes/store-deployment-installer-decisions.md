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
