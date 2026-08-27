---
phase: 04-reports-hardening
plan: 04
subsystem: database-testing
tags: [postgres, supabase, playwright, security, reports]
requires:
  - phase: 04-03
    provides: Full-day caja soak and reconciliation RPC
provides:
  - Authoritative authenticated caja-close attribution
  - Retained report-tab regression coverage
  - Shipment persistence evidence in the full-day soak
affects: [caja, reports, receiving, audit-integrity]
actuals:
  tokens: 15630
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns:
    - Security-definer RPCs validate supplied actor IDs against auth.uid()
    - E2E downstream UI evidence is preceded by response and persistence assertions
key-files:
  created:
    - supabase/migrations/20260818000005_close_caja_session_authoritative_closed_by.sql
  modified:
    - e2e/55-full-day-soak.spec.ts
    - e2e/07-reports.spec.ts
key-decisions:
  - "Keep close_caja_session's p_closed_by signature, validate it against auth.uid(), and persist auth.uid() directly."
  - "Leave unrelated retained-suite failures deferred rather than expanding this report-tab gap closure."
requirements-completed: [REP-01, REP-02]
coverage:
  - id: D1
    description: Caja close rejects a forged closer and leaves the session open.
    requirement: REP-01
    verification:
      - kind: e2e
        ref: 'e2e/55-full-day-soak.spec.ts#closing a caja session with a mismatched p_closed_by is rejected'
        status: pass
    human_judgment: false
  - id: D2
    description: Full-day soak proves receiving success and the resulting Corona inventory mutation.
    requirement: REP-01
    verification:
      - kind: e2e
        ref: 'npx playwright test e2e/55-full-day-soak.spec.ts --retries=0'
        status: pass
    human_judgment: false
  - id: D3
    description: Removed Tips and Modifiers report-tab assertions no longer block the retained report suite.
    requirement: REP-02
    verification:
      - kind: e2e
        ref: 'npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0'
        status: fail
    human_judgment: false
status: complete
---

# Phase 04 Plan 04: Reports Hardening Gap Closure Summary

**Authenticated caja-close attribution, evidence-backed shipment receiving, and report coverage aligned with the retained supermarket tabs.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-15T21:51:28Z
- **Completed:** 2026-08-15T22:04:19Z
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- Added a forward migration that rejects mismatched caja closer IDs with `PERMISSION_DENIED` and records `auth.uid()` as the closer.
- Added a live Playwright regression proving a forged close leaves the caja open; all three full-day soak tests pass.
- Removed obsolete Tip Distribution and Modifiers tab assertions, then made receiving evidence wait for the edge-function success response and persisted inventory values.

## Task Commits

1. **Task 1: Bind caja audit attribution** — `9144c47` (test RED), `034a49e` (fix GREEN)
2. **Task 2: Delete stale report assertions** — `b4de1f0` (test)
3. **Task 3: Prove receiving committed and replace reload** — `b715286` (test)

## Files Created/Modified

- `supabase/migrations/20260818000005_close_caja_session_authoritative_closed_by.sql` — authoritative actor validation and write.
- `e2e/55-full-day-soak.spec.ts` — forged-identity regression and receiving persistence proof.
- `e2e/07-reports.spec.ts` — retained report-tab assertions only.
- `.planning/phases/04-reports-hardening/deferred-items.md` — unrelated retained-suite failures.

## Decisions Made

- Preserved the existing RPC parameter and caller contract; validation and the database write now bind it to the authenticated caller.
- Kept the unrelated pool-tables test and four unrelated retained-suite failures out of this narrow gap closure.

## Deviations from Plan

None - production changes followed the plan. The reports command surfaced unrelated existing failures, documented below.

## Issues Encountered

- `e2e/07-reports.spec.ts --grep-invert "bartender-initiated"` ran 26 tests: 22 passed and 4 pre-existing tests failed. One has an ambiguous Voids & Refunds empty-state locator; three Staff Performance assertions use stale `order_items` fields and/or ambiguous empty-state locators. These are recorded in `deferred-items.md`.
- The explicitly excluded pool-tables-dependent bartender test remains untouched.

## Verification

- PASS: `npx playwright test e2e/55-full-day-soak.spec.ts -g "mismatched p_closed_by is rejected" --retries=0`
- PASS: live `pg_get_functiondef` includes both `p_closed_by IS DISTINCT FROM auth.uid()` and `closed_by = auth.uid()`; migration `20260818000005` is registered.
- PASS: `npx playwright test e2e/55-full-day-soak.spec.ts --retries=0` (3/3)
- PARTIAL: reports suite command above (22/26; unrelated failures documented).

## Self-Check: PASSED

- Created migration, updated E2E specs, deferred-items record, and task commits exist.

## Next Phase Readiness

The three Phase 04 gap-closure changes are in place and the full-day soak is green. Resolve the documented unrelated report-suite failures before treating that entire suite as green.

---
*Phase: 04-reports-hardening*
*Completed: 2026-08-15*
