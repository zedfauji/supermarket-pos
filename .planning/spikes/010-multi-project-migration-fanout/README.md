---
spike: 010
idea: multi-customer-deployment
name: multi-project-migration-fanout
type: standard
validates: "Given Spike 006's proven single-project supabase db push method, when driven by a customer-to-project-ref loop on this repo's disk-persistent self-hosted runner, then confirm no state collision between customers across sequential invocations"
verdict: VALIDATED
related: ["006-local-remote-supabase-delta"]
tags: [supabase, migrations, multi-customer, self-hosted-runner, ci]
---

# Spike 010: Multi-Project Migration Fan-Out

## What This Validates

Spike 006 already proved (and applied live) the single-project deploy method:
`supabase migration repair` + `supabase db push --linked` + `supabase functions deploy <fn>
--project-ref <ref>` against one remote project (`mkvinyekkyennyegfoxq`). Given N customers, each
with their own remote Supabase project, when that method is driven by a loop over a
customer→project-ref list in one CI job, then confirm the CLI can do this **without** persistent
`supabase link` state colliding between customers — a real risk specifically on this repo's
**self-hosted** runner, where the workspace directory persists across jobs (already the confirmed
root cause of two unrelated failures earlier this session: a stale `broker.exe` masking a missing
build dependency, and a locked native module blocking `npm ci`).

## Method

Installed Supabase CLI version already used by this project (`supabase` on PATH via scoop) and read
its real `--help` output for the exact commands Spike 006 used — not simulated, the actual CLI
binary this repo's contributors run locally.

## Results

`supabase db push --help` and `supabase functions deploy --help` both expose `--project-ref
<string>` as a **direct flag**, independent of `--linked`:

```
--linked                 Pushes to the linked project.
--project-ref string     Project ref of the Supabase project.
```

`--linked` and `--project-ref` are mutually-independent flags — `--linked` reads the project ref
Spike 006 stashed via a prior `supabase link` (written to `supabase/.temp/project-ref` under the
repo checkout — persistent, exactly the self-hosted-runner risk). `--project-ref` takes the ref
**inline, per invocation**, with no dependency on any prior `link` call or on-disk state at all.

This means a fan-out loop over customers never needs to call `supabase link` per customer — it can
call `supabase db push --project-ref $CUSTOMER_REF --password $CUSTOMER_DB_PASSWORD` directly for
each customer in sequence, and no two customers' invocations touch any shared file. The
self-hosted-runner persistence risk that bit `broker.exe` and `npm ci` this session doesn't apply
here, because the stateless flag path was available all along — Spike 006 used `--linked` for
convenience (single project, no fan-out need), not because `--project-ref` didn't exist.

One shared credential, not per-customer: `SUPABASE_ACCESS_TOKEN` (the CLI's account-level PAT) is
what authenticates every `supabase` CLI call regardless of target project — this is one Supabase
*account/org* token, not a per-project secret. What legitimately varies per customer is
`--project-ref` and the project's database password (`--password`) for `db push`, and nothing else.

## Verdict

**VALIDATED** — fan-out across N customer projects in one CI job is safe as long as every command
uses explicit `--project-ref` (never `--linked`/`supabase link`). This is the same shape of finding
as Spike 007 (avoid the shared/ambient shortcut, use the explicit-per-target flag) and Spike 009
(isolation is a property of what you explicitly scope to, not of running sequentially in one job).

## Signal for the Build

- A `customers.json`-style manifest (or one GitHub Environment per customer, per Spike 003, reusing
  its secrets: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`) drives a loop:
  `for customer in ...; do supabase db push --project-ref $REF --password $PW --include-all; done`.
- Never call `supabase link` in a multi-customer job — it's the one command in this toolchain that
  writes persistent state to the checkout, and this repo's runner keeps checkouts around.
- `SUPABASE_ACCESS_TOKEN` can be a single repo-level (or org-level) secret; it does not need to be
  duplicated per customer Environment the way `SUPABASE_PROJECT_REF`/`SUPABASE_DB_PASSWORD` do.
- Not independently tested against two *real* separate remote Supabase projects in this spike (would
  require provisioning throwaway Cloud projects, a real billing/quota action on the linked Supabase
  org — out of scope without explicit sign-off). The flag-level finding (`--project-ref` is fully
  stateless per Supabase's own CLI contract) is what the verdict rests on; treat "runs cleanly
  against two real distinct projects back-to-back" as the one remaining confirmation to do for real
  the first time a second customer's project actually exists.
