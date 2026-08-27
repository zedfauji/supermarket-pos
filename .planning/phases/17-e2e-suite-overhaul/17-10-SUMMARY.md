---
phase: 17-e2e-suite-overhaul
plan: 10
subsystem: testing
tags: [playwright, receipts, e2e, indian-grocery]
requires:
  - phase: 17-02
    provides: Indian grocery E2E catalog fixtures (Extra Spicy modifier on Haldiram's Aloo Bhujia 200g)
  - phase: 17-04
    provides: e2e/checkout/ folder-move pattern and Indian-catalog checkout fixture conventions
provides:
  - e2e/receipts/ folder with settings, category-grouping, print-retry-resilience, reprint, and pdf-delivery specs
  - Dead KDS-bar cross-check (SC-4) permanently removed, not quarantined
affects: [e2e, receipts, checkout]
actuals:
  tokens: 9700
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - Retry a seed+login+pay flow when a shared local dev database is contended by concurrent test runs
key-files:
  created:
    - e2e/receipts/settings.spec.ts
    - e2e/receipts/category-grouping.spec.ts
    - e2e/receipts/print-retry-resilience.spec.ts
    - e2e/receipts/reprint.spec.ts
    - e2e/receipts/pdf-delivery.spec.ts
  modified: []
key-decisions:
  - "SC-4 (KDS bar board cross-check) deleted outright per D-08, not ported as test.skip."
  - "pickTwoCategoryProducts resolves the modifier-carrying product via the product_modifiers join instead of a routing: 'BAR' category filter, which no longer matches anything in the Indian catalog (every category seeds as routing: 'NONE')."
  - "Seeded tabs for SC-2b are owned by the exact E2E_MANAGER_NAME fixture's shift, not an arbitrary 'admin' profile — useTabs() unconditionally scopes by the logged-in viewer's own shift_id."
requirements-completed: [TEST-01, TEST-02]
coverage:
  - id: D1
    description: Receipt/hardware settings (paper width, cashier-name/auto-cut toggles, header/footer text, live preview) persist correctly after reload.
    requirement: TEST-01
    verification:
      - kind: e2e
        ref: e2e/receipts/settings.spec.ts (9/9 tests)
        status: pass
    human_judgment: false
  - id: D2
    description: Receipt shows category headers and an indented modifier line for a real cash payment against the Indian catalog (SC-2b); the dead KDS-bar cross-check (SC-4) is removed, not skipped.
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "e2e/receipts/category-grouping.spec.ts — SC-2b"
        status: unknown
    human_judgment: true
    rationale: "Test logic verified correct by direct DB inspection (seeded tab's shift_id exactly matched the logged-in manager's session shift_id) and by isolated debugging runs that got past every app-level assertion up to the point of external interference. A full green CI run could not be captured in this session because this repo's parallel wave-execution setup runs many worktree agents' E2E suites against one shared, non-namespaced local Supabase database and a shared dev server port; live polling during test runs showed another process voiding this test's just-seeded tab/shift within ~2 seconds, and separately the shared :1520 dev server returned ERR_CONNECTION_REFUSED mid-run (5 concurrent `npm run dev`/vite processes observed). See Deviations below for full evidence and the retry hardening already applied."
  - id: D3
    description: Print-retry resilience (RCP-02/RCP-04), reprint (RCP-01), and PDF/email delivery (RCP-03) all pass against the Indian catalog fixture.
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "e2e/receipts/print-retry-resilience.spec.ts, e2e/receipts/reprint.spec.ts, e2e/receipts/pdf-delivery.spec.ts (6/6 tests, isolated run)"
        status: pass
    human_judgment: false
duration: 45min
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 10: Receipts E2E Move Summary

**`e2e/receipts/` now holds 5 specs (settings, category-grouping, print-retry-resilience, reprint, pdf-delivery); the dead KDS-bar cross-check is deleted outright and three genuine app/fixture bugs found during the move are fixed.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-25T19:27:00Z
- **Completed:** 2026-08-25T20:12:00Z
- **Tasks:** 2/2
- **Files modified:** 8 (5 created, 5 deleted, 2 net-new content files)

## Accomplishments

- Moved `e2e/08-settings-receipt.spec.ts` to `e2e/receipts/settings.spec.ts` verbatim (only import-path fixes) — 9/9 tests pass in isolation.
- Split `e2e/49-receipt-category-grouping.spec.ts`: `SC-2b` (live category/modifier receipt coverage) survives as `e2e/receipts/category-grouping.spec.ts`, updated to the Indian catalog's "Extra Spicy" modifier on "Haldiram's Aloo Bhujia 200g"; `SC-4` (permanently `test.skip`'d cross-check against the wholesale-deleted KDS bar board) is deleted outright per D-08.
- Moved `e2e/59-receipt-print-retry-resilience.spec.ts`, `e2e/60-reprint-receipt.spec.ts`, `e2e/61-receipt-pdf-delivery.spec.ts` to `e2e/receipts/`, swapping the bar-pos "Budweiser" fixture for "Haldiram's Aloo Bhujia 200g" — 6/6 tests pass in isolation.
- Found and fixed 3 real bugs surfaced by the fixture swap (see Deviations).

## Task Commits

1. **Task 1: e2e/receipts/settings.spec.ts + category-grouping.spec.ts** - `a8b6f2d` (test)
2. **Task 2: e2e/receipts/print-retry-resilience.spec.ts + reprint.spec.ts + pdf-delivery.spec.ts** - `7dd3ac2` (test)
3. **Follow-up fix: retry SC-2b against shared-DB contention** - `fd7874b` (fix)

## Files Created/Modified

- `e2e/receipts/settings.spec.ts` — full move of `08-settings-receipt.spec.ts`, plus a `page.waitForResponse` wait on the `receipt_settings` PATCH before reload (Rule 1 fix, see Deviations).
- `e2e/receipts/category-grouping.spec.ts` — `SC-2b` only, ported to the Indian catalog; `SC-4` deleted outright.
- `e2e/receipts/print-retry-resilience.spec.ts`, `e2e/receipts/reprint.spec.ts`, `e2e/receipts/pdf-delivery.spec.ts` — moved from `59`/`60`/`61`, "Budweiser" swapped for "Haldiram's Aloo Bhujia 200g".
- `e2e/08-settings-receipt.spec.ts`, `e2e/49-receipt-category-grouping.spec.ts`, `e2e/59-receipt-print-retry-resilience.spec.ts`, `e2e/60-reprint-receipt.spec.ts`, `e2e/61-receipt-pdf-delivery.spec.ts` — deleted (moved).

## Decisions Made

- `pickTwoCategoryProducts` in `category-grouping.spec.ts` resolves the modifier-carrying product via the `product_modifiers` join (looking up the seeded "Extra Spicy" modifier), not a `routing: 'BAR'` category filter — every category in the Indian catalog seeds as `routing: 'NONE'`, so the old filter always threw `no BAR-routed category found`.
- The "second category" query is scoped to `routing: 'NONE'` so it can't accidentally pick a leftover pre-Phase-1 bar/pool category still present in a long-lived shared dev database.
- Seeded tabs in `category-grouping.spec.ts` are now owned by the exact `E2E_MANAGER_NAME` fixture's shift (looked up by name, not an arbitrary `role: 'manager'` row) — `useTabs()` (`src/entities/tab/model/queries.ts`) unconditionally filters `.eq('shift_id', shiftId)` on the logged-in viewer's own shift, so a tab seeded under a different staff member's shift is invisible on `/payments` regardless of role.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `routing: 'BAR'` category filter no longer matches anything in the Indian catalog**
- **Found during:** Task 1
- **Issue:** `pickTwoCategoryProducts` filtered `categories.routing = 'BAR'` to find the modifier-carrying product (the KDS-board test's original purpose) — every Indian-catalog category seeds as `routing: 'NONE'` (`scripts/seed-dev-data.ts`), so this always threw.
- **Fix:** Resolve the modifier-carrying product via the `product_modifiers` join on the seeded "Extra Spicy" modifier instead; scope the "second category" query to `routing: 'NONE'` for determinism against leftover bar-pos categories in a shared dev DB.
- **Files modified:** `e2e/receipts/category-grouping.spec.ts`
- **Committed in:** `a8b6f2d`

**2. [Rule 1 - Bug] Seeded tab's shift didn't match the logged-in payer's shift**
- **Found during:** Task 1 (post-verification debugging)
- **Issue:** `seedTwoCategoryTabWithModifier` created the tab under an arbitrary `role: 'admin'` profile's shift, then the test logs in as `'manager'` to pay it. `useTabs()` filters strictly on the current viewer's own `shift_id` — the tab was structurally invisible to the manager's `/payments` view regardless of timing, confirmed by direct DB inspection (seeded tab's `shift_id` did not match the manager's `staff.loggedIn` shiftId).
- **Fix:** Seed under the exact `E2E_MANAGER_NAME` fixture (matching who logs in), and scope the "reuse an existing open shift" lookup by `staff_id` too (was previously unscoped, risking reuse of an unrelated staff member's shift).
- **Files modified:** `e2e/receipts/category-grouping.spec.ts`
- **Committed in:** `a8b6f2d`

**3. [Rule 1 - Bug] `driveCashCheckout` in print-retry/reprint/pdf-delivery specs searched for a deleted bar-pos product**
- **Found during:** Task 2
- **Issue:** All three moved files searched the product picker for `'Budweiser'`, a bar-pos-era product not in the Indian catalog — every test in this task would have failed at the product-select step.
- **Fix:** Swapped to `"Haldiram's Aloo Bhujia 200g"`, the same fixture already established by `e2e/checkout/happy-path.spec.ts` in this wave.
- **Files modified:** `e2e/receipts/print-retry-resilience.spec.ts`, `e2e/receipts/reprint.spec.ts`, `e2e/receipts/pdf-delivery.spec.ts`
- **Committed in:** `7dd3ac2`

**4. [Rule 1 - Bug] `receipt_settings` autoCut-persistence test raced its own save**
- **Found during:** Task 1
- **Issue:** `HardwareSettingsTab.tsx`'s `patchReceipt` fires `updateReceiptSettings.mutate(...)` without awaiting it (fire-and-forget optimistic update). The "Auto-cut toggle persists after reload" test asserted only the optimistic local checkbox state before calling `page.reload()`, which under load could race ahead of the actual `receipt_settings` PATCH landing — reproduced deterministically against the byte-identical original file at its old path, so this is pre-existing, not introduced by the move.
- **Fix:** Added `page.waitForResponse` on the `receipt_settings` REST call before each reload.
- **Files modified:** `e2e/receipts/settings.spec.ts`
- **Committed in:** `a8b6f2d`

**5. [Rule 3 - Blocking] `category-grouping.spec.ts`'s `SC-2b` retried against shared-DB contention (see Known Stubs / Issues Encountered — did not fully resolve)**
- **Found during:** Task 1 verification
- **Issue:** This repo's parallel wave-execution setup runs many worktree agents' E2E suites against one shared, non-namespaced local Supabase database (confirmed via live polling: `open_tabs`/`open_shifts` counts changed every ~2s from external processes) and a shared `:1520` dev server (confirmed 5 concurrent `npm run dev`/vite processes; intermittent `ERR_CONNECTION_REFUSED` observed across every spec in this folder, not just this one).
- **Fix:** Retries the seed+login+pay sequence up to 3 times with a fresh tab per attempt, tolerating one interference window. Did not achieve a clean full run in this session — see Issues Encountered.
- **Files modified:** `e2e/receipts/category-grouping.spec.ts`
- **Committed in:** `fd7874b`

---

**Total deviations:** 5 auto-fixed (4 Rule 1, 1 Rule 3)
**Impact on plan:** All fixes were necessary for correctness against the current app/schema and catalog — none expand scope beyond the plan's stated files.

## Issues Encountered

**`e2e/receipts/category-grouping.spec.ts`'s `SC-2b` did not achieve a clean full-run pass in this session**, despite the app-level logic being verified correct:

- Direct DB inspection after a run confirmed the seeded tab's `shift_id` **exactly matched** the logged-in manager's `staff.loggedIn` shiftId — proving the Rule 1 fix (#2 above) is structurally correct and the flow would work absent external interference.
- Live polling (`open_tabs`/`open_shifts` counts sampled every 2s during a run) showed continuous external mutation of tabs/shifts state from processes outside this test — consistent with other worktree agents' `resetTestState()`/`openCaja()` calls, which are global (not test-run-scoped) in `e2e/helpers/supabase.ts`.
- Separately, full-folder runs (`npx playwright test e2e/receipts/`) hit `ERR_CONNECTION_REFUSED` at `http://localhost:1520/` mid-run on unrelated specs (`settings.spec.ts`, `pdf-delivery.spec.ts`, `print-retry-resilience.spec.ts`, `reprint.spec.ts`) that had all passed cleanly moments earlier in isolation — `ps aux` showed 5 concurrent `npm run dev`/vite processes, confirming the dev server port itself is shared and unstable under concurrent worktree load, not specific to this file.
- All 5 other tests in this task's scope (`settings.spec.ts` 9/9, `print-retry-resilience.spec.ts`/`reprint.spec.ts`/`pdf-delivery.spec.ts` 6/6) passed cleanly in isolated runs once the dev server was briefly uncontended.

This is a wave-level test-infrastructure gap (unscoped global DB reset + shared dev-server port across concurrently-executing worktree agents) — out of scope for this plan's file list (`e2e/helpers/supabase.ts`/`playwright.config.ts` are not among `files_modified`). Flagged in `.planning/WINDOWS.md` for visibility at ship time; a future phase should consider per-run namespacing for `resetTestState()`/`openCaja()` or a per-worktree dev-server port if parallel wave execution against one shared local Supabase stack continues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`e2e/receipts/` is fully populated (5 files) and ready to be counted in the phase-level `npx playwright test e2e/receipts/` verification once run under lower shared-database contention (e.g., outside a heavy parallel-wave window). No other plan in this phase depends on this one's output.

## Self-Check: PASSED

- Confirmed all 5 files exist: `e2e/receipts/settings.spec.ts`, `e2e/receipts/category-grouping.spec.ts`, `e2e/receipts/print-retry-resilience.spec.ts`, `e2e/receipts/reprint.spec.ts`, `e2e/receipts/pdf-delivery.spec.ts`.
- Confirmed all 5 original files are deleted.
- Confirmed commits `a8b6f2d`, `7dd3ac2`, `fd7874b` exist in git history.

---
*Phase: 17-e2e-suite-overhaul*
*Completed: 2026-08-25*
