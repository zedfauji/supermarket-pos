---
title: Migrate Taj House of Spices' .env.production creds into a GitHub Environment
date: 2026-09-01
priority: medium
---

## What

`.env.production` (properly gitignored, never committed — confirmed via empty `git log -- 
.env.production`) holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for the one real customer
today (Taj House of Spices, project `mkvinyekkyennyegfoxq`). It's a loose plaintext file that has
to be hand-placed on whatever machine/runner does the production build — no rotation mechanism, no
audit trail, and nothing stops it from getting copied somewhere it shouldn't.

This is an interim fix, independent of the full multi-customer-deployment phase (spikes 007–010,
`.planning/spikes/MANIFEST.md`) — do this now for the one customer that exists today, without
waiting for the N-customer repo/config-override machinery to be built.

## Fix

1. Create a GitHub Environment on this repo, e.g. `taj-house-of-spices`.
2. Add its secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (values currently in the local
   `.env.production`).
3. Update `release.yml` to materialize `.env.production` from those secrets at build time (a step
   before `beforeBuildCommand` runs), and delete it at job end — this repo's runner is self-hosted
   and its workspace persists across jobs, so leaving a materialized `.env.production` around after
   the job is a real leak risk, not just tidiness (confirmed pattern in Spike 009's findings: this
   same runner already had two unrelated failures this session caused by leftover state persisting
   across jobs — `broker.exe`, a locked native module).
4. Delete the local `.env.production` file once the workflow no longer needs it read from disk by a
   human (keep `.env.local` — that's the self-hosted local dev stack, unrelated).

## Why it matters

Closes the credential-hygiene gap raised this session, immediately, for the one customer that
exists — proven mechanism (GitHub Environments give real secret isolation, Spike 009), just not
yet wired into `release.yml`.
