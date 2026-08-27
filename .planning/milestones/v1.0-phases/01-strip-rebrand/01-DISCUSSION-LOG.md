# Phase 1: Strip & Rebrand - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 1-Strip & Rebrand
**Areas discussed:** Rebrand identity, /pos route gap, E2E spec handling, Home dashboard nav, Supabase project separation, SQL migration strategy, RBAC role rename fallout, Settings/i18n cleanup

---

## Rebrand identity

| Option | Description | Selected |
|--------|-------------|----------|
| Supermarket POS | Matches PROJECT.md's project title | ✓ |
| Store-specific name | Name it after the actual supermarket | |
| Keep placeholder for now | Fix the awkward string, decide real name later | |

**User's choice:** Supermarket POS

| Option | Description | Selected |
|--------|-------------|----------|
| Strings only | Rename strings, keep existing theme/icon/colors | ✓ |
| New color accent | Swap primary accent color | |
| Full visual rebrand | New icon, logo, palette | |

**User's choice:** Strings only

**Notes:** User asked Claude to check other installed skills before answering the naming question. Claude invoked `ui-ux-pro-max:brand` and found it was built for full product-branding systems (voice, logo rules, messaging) — overkill for an internal single-tenant tool per PROJECT.md ("not sold"). Returned to the direct question instead of pursuing the heavyweight brand-system flow.

| Option | Description | Selected |
|--------|-------------|----------|
| All user-visible + config strings | package.json, tauri.conf.json, README, in-app text | ✓ |
| Just the Tauri window title | Only what the desktop window/taskbar shows | |

**User's choice:** All user-visible + config strings

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as-is | AI persona/wording isn't bar-specific | ✓ |
| Rename to match new brand | Give assistant a name tied to new identity | |

**User's choice:** Leave as-is

---

## /pos route gap

| Option | Description | Selected |
|--------|-------------|----------|
| Remove route entirely | Delete /pos route + nav link, nothing links there until Phase 2 | ✓ |
| Stub placeholder page | Keep route alive with "coming in Phase 2" placeholder | |
| Leave tab-based /pos working | Don't touch /pos until Phase 2 replaces it wholesale | |

**User's choice:** Remove route entirely

| Option | Description | Selected |
|--------|-------------|----------|
| Keep schema, strip only bar/pool-specific bits | Phase 2 adapts process_payment's atomic-RPC discipline | ✓ |
| Remove tabs schema entirely | Phase 2 builds fresh direct-sale schema from scratch | |

**User's choice:** Keep schema, strip only bar/pool-specific bits

| Option | Description | Selected |
|--------|-------------|----------|
| Strip transfer-tab only, keep split-payment | Remove transfer-tab + split-TAB; keep split-payment + refund | ✓ |
| Strip all three | Remove transfer-tab, split-tab, and refund | |

**User's choice:** Strip transfer-tab only, keep split-payment

| Option | Description | Selected |
|--------|-------------|----------|
| Add explicit removed-route assertions | Playwright checks that removed routes 404/redirect | ✓ |
| Rely on nav-link absence only | Only check nav buttons are gone | |

**User's choice:** Add explicit removed-route assertions

---

## E2E spec handling

| Option | Description | Selected |
|--------|-------------|----------|
| Delete them | Remove ~20 bar/pool-specific spec files outright | ✓ |
| Move to e2e/_archived/ | Keep but exclude from default run | |

**User's choice:** Delete them

| Option | Description | Selected |
|--------|-------------|----------|
| Judge case-by-case during execution | Delete removed-feature specs, keep generic-behavior specs | |
| Delete anything with 'tab' in the test flow | Simpler blanket rule | ✓ |

**User's choice:** Delete anything with 'tab' in the test flow

| Option | Description | Selected |
|--------|-------------|----------|
| Keep infra/build specs untouched | 18-updater, 13-tauri-build, 12-infrastructure, 11-offline, 01-ci | ✓ (only option — not domain-specific) |

**User's choice:** Keep untouched (single viable path, confirmed rather than posed as a multi-way AskUserQuestion after the tool rejected a single-option question)

---

## Home dashboard nav

| Option | Description | Selected |
|--------|-------------|----------|
| Only retained routes, no new tiles | Sparse dashboard until Phase 2/3 add tiles | ✓ |
| Add placeholder tiles for future features | Greyed-out tiles for Checkout/Receiving | |

**User's choice:** Only retained routes, no new tiles

| Option | Description | Selected |
|--------|-------------|----------|
| Let it re-flow naturally | Standard responsive grid/flex behavior | ✓ |
| Explicitly redesign the grid | Manual resize/reposition for visual balance | |

**User's choice:** Let it re-flow naturally

| Option | Description | Selected |
|--------|-------------|----------|
| Rename bartender → cashier | Matches actual job at checkout | ✓ |
| Leave as 'bartender' internally | Purely a code-level label | |

**User's choice:** Rename bartender → cashier

---

## Supabase project separation

**This area was not Claude-identified — the user raised it as "Very important question" mid-discussion, correcting an implicit assumption in the SQL migration strategy area.**

| Option | Description | Selected |
|--------|-------------|----------|
| Dev/test only — safe to DROP | No real bar depends on this data | |
| Live production for a real bar | Actively used by an operating bar — do NOT run destructive migrations | ✓ |
| Not sure / need to check | Pause SQL work until confirmed | |

**User's choice:** Live production for a real bar

**Notes:** This directly invalidated the assumption behind the SQL migration strategy questions that had already been asked (that DROP migrations would run against the currently-linked project). Required a follow-up decision on whether to provision a new project.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, provision it in Phase 1 | New project + full migration history + DROP migrations on top, blocking prerequisite | ✓ |
| I'll provision it myself, tell me what's needed | User creates project, Claude documents requirements only | |

**User's choice:** Yes, provision it in Phase 1

---

## SQL migration strategy

| Option | Description | Selected |
|--------|-------------|----------|
| New forward DROP migrations | Fresh migrations that DROP tables/RPCs/policies | ✓ |
| Squash/rewrite migration history | Collapse 76 migrations into a clean baseline | |

**User's choice:** New forward DROP migrations (target corrected post-hoc to the new project per the Supabase project separation area above)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add DOWN scripts | Follow Phase 8+ convention, real rollback path | ✓ |
| No DOWN scripts needed | Rely on git revert + redeploy instead | |

**User's choice:** Yes, add DOWN scripts

| Option | Description | Selected |
|--------|-------------|----------|
| Split per feature | Separate migration per removed feature | ✓ |
| One combined migration | Single migration for the whole strip | |

**User's choice:** Split per feature

---

## RBAC role rename fallout

| Option | Description | Selected |
|--------|-------------|----------|
| Full rename everywhere | DB enum, TS types, i18n, E2E helpers, seed scripts | ✓ |
| UI/i18n labels only, keep code identifier 'bartender' | Smaller diff, permanent naming mismatch | |

**User's choice:** Full rename everywhere

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as-is | Tab-named RBAC actions stay, consistent with keeping tabs schema | ✓ |
| Rename now for consistency | close_tab→close_order etc. now | |

**User's choice:** Leave as-is (except delete `transfer_tab` action, since that feature is stripped per D-09)

---

## Settings/i18n cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Remove settings tabs + prune i18n keys together | Same commit as each feature's removal | ✓ |
| Leave i18n keys, only remove UI | Orphaned strings accumulate for later cleanup | |

**User's choice:** Remove settings tabs + prune i18n keys together

| Option | Description | Selected |
|--------|-------------|----------|
| Manual grep per removed feature | Bounded set of ~7-8 features, no new tooling | ✓ |
| Add a scripted unused-i18n-key checker | More thorough, new one-time tooling | |

**User's choice:** Manual grep per removed feature

---

## Claude's Discretion

- Exact migration file naming/ordering within the per-feature DROP-migration split.
- Which specific in-app strings need a "bar-pos"/"Bar POS" grep pass beyond the explicitly named config files.

## Deferred Ideas

None captured as out-of-phase-scope deferrals. Visual/logo rebrand was discussed and explicitly scoped out of Phase 1 (strings-only, D-02) rather than deferred as a new capability — it may be picked up in a future phase or milestone if desired.
