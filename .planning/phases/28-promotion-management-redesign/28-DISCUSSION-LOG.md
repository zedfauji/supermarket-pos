# Phase 28: Promotion Management Redesign - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-04
**Phase:** 28-promotion-management-redesign
**Areas discussed:** Recurrence semantics, Wizard flow & step validation, Existing promotions migration

---

## Recurrence Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Date range required + recurrence narrows it | starts_at/ends_at stay mandatory; day/time recurrence is an additional AND filter within that window | ✓ |
| Recurrence-only, open-ended date range allowed | Promotion can run indefinitely at specific days/times, no end date | |

**User's choice:** Date range required + recurrence narrows it.

| Option | Description | Selected |
|--------|-------------|----------|
| Integer array column (0-6), multi-select checkboxes | e.g. days_of_week int[] = {1,2,3,4,5}; empty/null = every day | ✓ |
| Bitmask integer | Single int, bit per day; harder to read/debug | |

**User's choice:** Integer array column (0-6), multi-select checkboxes.

| Option | Description | Selected |
|--------|-------------|----------|
| Same-day only (start_time < end_time enforced) | Covers ROADMAP's own example (4-6PM); simpler validation | ✓ |
| Support overnight wrap now | start_time > end_time means crosses midnight; more complexity | |

**User's choice:** Same-day only.

| Option | Description | Selected |
|--------|-------------|----------|
| Store-local timezone (GeneralSettings.timezone) | Matches how Phase 27 already handles store-local date-range boundaries | ✓ |
| UTC | Simpler math but wrong for a physical store | |

**User's choice:** Store-local timezone (GeneralSettings.timezone).

**Notes:** No follow-up needed — all four answers were direct selections with no free-text clarification.

---

## Wizard Flow & Step Validation

| Option | Description | Selected |
|--------|-------------|----------|
| 4 steps: Basics+Discount / Scope / Validity+Recurrence / Review | Natural field grouping; dedicated Review step | ✓ |
| 3 steps: Basics+Discount+Scope / Validity+Recurrence / Review | Fewer steps, denser first step | |

**User's choice:** 4 steps.

| Option | Description | Selected |
|--------|-------------|----------|
| Block forward nav until current step is valid | Literal reading of "validates on exit" | ✓ |
| Free navigation, all errors surfaced on Review | User can jump freely, Review step blocks Save | |

**User's choice:** Block forward nav until current step is valid.

| Option | Description | Selected |
|--------|-------------|----------|
| Live computed example using evaluateBestPromotion | Reuses existing pure pricing function against a sample product | ✓ |
| Plain configuration summary only | Just lists entered fields, no computed pricing | |

**User's choice:** Live computed example using evaluateBestPromotion.

| Option | Description | Selected |
|--------|-------------|----------|
| Same wizard, pre-filled, steps unlocked via step indicator | One component for create and edit | ✓ |
| Separate flat single-screen edit form | Different, simpler full-page form for edits | |

**User's choice:** Same wizard, pre-filled, steps unlocked via step indicator.

**Notes:** No follow-up needed — all four answers were direct selections.

---

## Existing Promotions Migration

| Option | Description | Selected |
|--------|-------------|----------|
| Dev/test data only — no real store usage yet | Safe breaking migration | |
| Real customer (Taj House of Spices) already has live promotions | Migration must preserve rows exactly | |

**User's choice (free text):** "In the local supabase setup is dev and Taj House of Spices remote supabase is suppose to be production but its not live yet."
**Notes:** Neither environment has real/live promotion data — treated as equivalent to the "dev/test data only" option for migration-safety purposes (recorded in CONTEXT.md as D-11).

| Option | Description | Selected |
|--------|-------------|----------|
| Drop scope_type — junction table rows determine scope | No separate enum to keep in sync | ✓ |
| Keep scope_type as a display/filter hint | Retains a top-level label for list-page filtering | |

**User's choice:** Drop scope_type — junction table rows determine scope.

| Option | Description | Selected |
|--------|-------------|----------|
| No special treatment — they just display/edit normally | Migrated promotions are a valid subset, no special UI | |
| Flag migrated promotions for admin review | One-time banner/list filter for admin to review each carried-over promotion | ✓ |

**User's choice:** Flag migrated promotions for admin review.

**Notes:** Exact review-flag mechanism (column, banner, dismiss behavior) left to planning per CONTEXT.md D-12.

---

## Todo Fold Review

3 pending todos matched Phase 28 by keyword score (audit-manager-pin-identity-in-remaining-rpcs.md,
rename-cargo-package-bar-pos.md, rotate-remote-supabase-db-password.md). None were scope-relevant
to promotion redesign by Claude's assessment, but the user explicitly chose to fold
`audit-manager-pin-identity-in-remaining-rpcs.md` into Phase 28 anyway. The other two were reviewed
and left as standalone pending todos.

## Claude's Discretion

- Exact junction-table column/table naming (D-01/D-02).
- Exact migrated-promotion review-flag mechanism (D-12).
- Multi-select target-picker UX detail (search-combobox vs. checkbox list) — not discussed in
  depth; `src/shared/ui/command.tsx` noted as the only existing candidate primitive.
- Scope Data Model (junction table vs. array columns) was offered as a discussable area but the
  user did not select it — junction table was adopted as the framing for the later Recurrence
  and Migration questions without objection, so it is recorded in CONTEXT.md as Claude's
  discretion (D-01/D-02), not a directly-discussed decision.

## Deferred Ideas

None — discussion stayed within phase scope.
