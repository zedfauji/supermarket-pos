---
spike: 007
idea: multi-customer-deployment
name: github-releases-latest-scope
type: standard
validates: "Given 2+ differently-tagged releases in one GitHub repo, when querying /releases/latest (what Tauri's updater endpoint pattern uses), then determine whether it scopes by tag prefix or is repo-wide"
verdict: INVALIDATED
related: []
tags: [github-releases, tauri-updater, multi-customer, ops]
---

# Spike 007: GitHub Releases `/releases/latest` Scope

## What This Validates

Given a repo with releases tagged for different customers (`customerA-v1.0.0`, `customerB-v1.0.0`),
when hitting `GET /repos/:owner/:repo/releases/latest` — the exact endpoint pattern this repo's
`tauri.conf.json` updater uses (`.../releases/latest/download/latest.json`) — then determine if
"latest" is scoped per tag-prefix/customer or is a single repo-wide pointer.

This is the highest-risk question: if it's repo-wide, a naive "one repo hosts every customer's
releases" design is broken for auto-update before anything else is built.

## Method

Created a throwaway private repo (`zedfauji/gsd-spike-multi-customer-scratch`, deleted after this
spike) and drove the real GitHub REST API with `gh api` — no simulation.

1. Published `customerA-v1.0.0` (t0), then `customerB-v1.0.0` (t0+3s) → queried `/releases/latest`.
2. Published `customerA-v2.0.0` (t0+6s, newer than both) → queried `/releases/latest` again.
3. Published a **draft** `customerB-v2.0.0` (newest by far) → queried `/releases/latest` again.

## Results

| Step | Releases published (oldest→newest) | `/releases/latest` returned |
|---|---|---|
| 1 | A-v1.0.0, B-v1.0.0 | **B-v1.0.0** (the newer one, not A even though A "owns" this hypothetical) |
| 2 | A-v1.0.0, B-v1.0.0, A-v2.0.0 | **A-v2.0.0** — flips back to A purely because it's newest overall |
| 3 | ...+ draft B-v2.0.0 (newest) | still **A-v2.0.0** — the draft is invisible to `/latest` |

Confirmed via direct API queries (`created_at` timestamps included in each response, not inferred).

**`/releases/latest` is a single repo-wide pointer to the most recently published non-draft,
non-prerelease release — it has no concept of tag prefix, customer, or product.** Two customers
sharing one repo would each see the *other* customer's release as "latest" the moment either one
ships, and Tauri's updater (which polls exactly this endpoint) would offer customer A an install of
customer B's build.

**Bonus finding, relevant to this repo today:** `release.yml` sets `releaseDraft: true`. Drafts are
provably invisible to `/releases/latest` (step 3) — so the *current* single-customer release flow
already depends on a human manually undrafting each release on GitHub before the updater can ever
see it. That's an existing manual gate, not new to multi-customer, but multi-customer makes the
consequence of forgetting it sharper (per-customer channels each need their own undraft step).

## Verdict

**INVALIDATED** — "one shared repo, every customer's releases in the same tag stream, updater
points at `/releases/latest`" does not work. This is a hard constraint, not a tuning knob.

## Signal for the Build

Each customer needs a `/releases/latest` that only ever contains *that customer's* releases. Two
ways to get that, both real (not requiring dropping the single-codebase model — see Spike 002):

1. **Separate repo per customer** (can be a thin repo that only holds Actions + Releases, or a full
   fork) — each has its own real `/releases/latest`, zero endpoint gymnastics, matches how
   `tauri.conf.json`'s updater endpoint already expects to work.
2. **Single repo, but the updater endpoint is not `/releases/latest`** — point each customer's
   `tauri.conf.json` `updater.endpoints` at a fixed, non-"latest" URL: either a specific release's
   asset (requires rewriting a stable alias tag like `customerX-latest` to the newest release each
   time — GitHub doesn't do this natively, would need a small script/Action step) or a tiny custom
   update-manifest server/static file per customer hosted elsewhere (e.g. a `gh-pages` branch path
   or object storage) that this repo's release workflow updates on every customer deploy.

Option 1 is simpler and needs no extra infrastructure; it's the natural pairing with Spike 008's
finding that installer identity is already cheap to parameterize per customer without forking the
*codebase*. Carry this into the branching-strategy decision.
