# Phase 26: Multi-Customer Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 26-multi-customer-deployment
**Areas discussed:** Core→customer sync mechanism, New-customer onboarding, Per-customer override file, Taj House of Spices retrofit

---

## Core→customer sync mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Full mirror | `git push --mirror` of core's main to the customer repo on every release | ✓ |
| Thin repo (workflows only) | Customer repo holds only workflows + checkout-from-core step | |

**User's choice:** Full mirror.
**Notes:** None.

| Option | Description | Selected |
|--------|-------------|----------|
| Core release workflow pushes to each customer repo | On a tag/dispatch, core's own CI mirror-pushes to each customer repo | ✓ |
| repository_dispatch fan-out | Core CI fires a dispatch event per customer repo; each listens and pulls | |

**User's choice:** Core release workflow pushes.
**Notes:** None.

| Option | Description | Selected |
|--------|-------------|----------|
| Lockstep | Every customer gets the same core version at the same time | |
| Independent per-customer | Customers pinned to different versions, synced on-demand | |

**User's choice:** Neither as framed — user wants per-customer gating tied to future licensing/payment status: "I need to control which customer gets latest version or not, i am planning to implement licensing and costs tracking, if any customer isn't paying, stop the update to the customer."
**Notes:** Split into two follow-up questions (licensing scope, and the near-term gating mechanism).

| Option | Description | Selected |
|--------|-------------|----------|
| Override file lives in core, synced with mirror push | `customers/<name>/tauri.override.json` in core, merged via tauri-action `--config` | ✓ |
| Override lives only in the customer repo | Each customer repo keeps its own override, untouched by core sync | |

**User's choice:** Option 1, after requesting an explanation of what a `tauri.override.json` is and why it matters — explanation given inline (Tauri's `--config` deep-merge, same mechanism already used for the cert-thumbprint override in `release.yml`, validated by Spike 008).

**Follow-up: licensing/billing scope**

| Option | Description | Selected |
|--------|-------------|----------|
| Own future phase | Phase 26 stays focused on shipping to N customers; billing/invoicing/payment-detection is a new capability | ✓ |
| In scope for Phase 26 | Build actual payment tracking and automated cutoff now | |

**User's choice:** Own future phase.

**Follow-up: near-term gate mechanism**

| Option | Description | Selected |
|--------|-------------|----------|
| Active-customer manifest in core | `customers.json` lists each customer + status: active/suspended; sync job reads it | ✓ |
| Manual workflow_dispatch per customer | No manifest; manually pick sync targets each release | |

**User's choice:** Active-customer manifest.

---

## New-customer onboarding

| Option | Description | Selected |
|--------|-------------|----------|
| A script + checklist | scripts/onboard-customer.ps1 for scriptable parts, doc for manual parts | ✓ |
| Documented manual runbook only | No script, all steps by hand | |

**User's choice:** Script + checklist.

| Option | Description | Selected |
|--------|-------------|----------|
| Manual | You create the Supabase project + run migrations by hand | ✓ |
| Scripted end-to-end | Script drives Supabase project creation via management API | |

**User's choice:** Manual.

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/onboard-customer.ps1 + docs/ | Matches existing repo convention | ✓ |
| New top-level customers/ or ops/ directory | Dedicated directory for everything customer-deployment-related | |

**User's choice:** scripts/ + docs/.

**Follow-up questions (user asked for more):**

| Option | Description | Selected |
|--------|-------------|----------|
| name, repo, status, supabase_project_ref | Minimum manifest fields for sync + ops | ✓ |
| Just name + status | Bare minimum for the sync gate | |

**User's choice:** name, repo, status, supabase_project_ref.
**Notes:** User raised the self-hosted-Supabase question here (see below) instead of directly answering "first sync" — treated as "Option 1" (plumbing only) plus a new sub-topic.

| Option | Description | Selected |
|--------|-------------|----------|
| Plumbing only | Script sets up plumbing; first sync happens on the next normal release | ✓ |
| Script also triggers first sync | Script immediately fires a manual sync after plumbing | |

**User's choice:** Plumbing only (Option 1), with a follow-up question: "what if customer decides to host a local supabase stack in docker and doesn't want remote supabase project. How will it be configured and shipped?"

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, idempotent | Each step checks first and skips/updates | ✓ |
| No, single-shot | Assumes a clean run | |

**User's choice:** Idempotent.

**Follow-up: self-hosted Supabase**

| Option | Description | Selected |
|--------|-------------|----------|
| Architectural door-open only | No customer has asked for this; keep the app's URL+anon-key-only assumption true | ✓ |
| Real near-term need | A specific customer wants it soon | |

**User's choice:** Architectural door-open only.

| Option | Description | Selected |
|--------|-------------|----------|
| Cloud only in this phase | Manifest gets a deployment_mode field for future-proofing; script/CI only implement "cloud" | ✓ |
| Build both modes now | Script branches on deployment_mode, self-hosted needs its own spike | |

**User's choice:** Cloud only in this phase.

---

## Per-customer override file

| Option | Description | Selected |
|--------|-------------|----------|
| identifier, publisher, updater.endpoints, icon path | Matches what's hardcoded today | ✓ |
| Same, plus productName + window title | Also override app display name/window title | |

**User's choice:** identifier, publisher, updater.endpoints, icon path.

| Option | Description | Selected |
|--------|-------------|----------|
| customers/<name>/icons/ directory in core | Icons synced with mirror push, referenced by --config merge | ✓ |
| All customers use the same icon for now | Skip per-customer icon | |

**User's choice:** customers/<name>/icons/ in core.

| Option | Description | Selected |
|--------|-------------|----------|
| Build fails loudly | Missing/invalid override errors the build immediately | ✓ |
| Falls back to core's generic defaults | Missing override silently builds with placeholder values | |

**User's choice:** Build fails loudly.

---

## Taj House of Spices retrofit

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, in this phase | Taj becomes first manifest entry + first override file, proving the mechanism end-to-end | ✓ |
| No, keep Taj as-is for now | New machinery ships untested against a real customer | |

**User's choice:** Yes, in this phase.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — core becomes customer-agnostic | Taj's real values move into their override file; core gets a generic placeholder | ✓ |
| No — core keeps Taj's values as the default | Core stays Taj-branded; other customers override it | |

**User's choice:** Core becomes customer-agnostic.

| Option | Description | Selected |
|--------|-------------|----------|
| Stand up new pipeline in parallel, verify, then retire old path | No window with no working update path for Taj's live store | ✓ |
| Cut over directly, no parallel run | Faster, but any bug hits Taj's live production path with no fallback | |

**User's choice:** Parallel run, then retire.

---

## Claude's Discretion

- Exact `gh` CLI invocations and GitHub Environment naming convention inside `onboard-customer.ps1`.
- Whether the mirror-push sync runs as a step in `release.yml` or a new dedicated workflow file.
- Retry/error-handling behavior when a mirror-push to one customer fails mid-fan-out (not raised during discussion — planner should default to continue-and-report rather than stop-on-first-failure).

## Deferred Ideas

- Full licensing/billing/payment-tracking system (invoicing, automated payment detection, auto-cutoff) — its own future roadmap phase; this phase only builds the manual active/suspended gate it could plug into.
- Self-hosted-Supabase-in-Docker production support — manifest reserves a `deployment_mode` field, but the CI deploy path is unbuilt/unvalidated until a real customer needs it.
