---
phase: 17-e2e-suite-overhaul
plan: 02
subsystem: testing
tags: [supabase, seed-data, e2e, indian-grocery]
requires:
  - phase: 17-01
    provides: E2E infrastructure baseline
provides:
  - Shared 27-SKU Indian grocery catalog for remote and local seed paths
  - Inventory fixture data with stock, cost, and expiry values
affects: [e2e, inventory, checkout]
actuals:
  tokens: 8076
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - Idempotent remote seed and fixed-ID local seed mirror the same product catalog
key-files:
  created: []
  modified:
    - scripts/seed-dev-data.ts
    - supabase/seed.sql
key-decisions:
  - Packaged Indian grocery units use fixed synthetic 13-digit barcodes and no unit variants.
  - Local staff fixtures use cashier because bartender is no longer a valid role enum value.
patterns-established:
  - Keep remote and local seed catalog names, prices, barcodes, and inventory values synchronized.
requirements-completed: [TEST-02]
coverage:
  - id: D1
    description: Remote and local development seed paths provide the same 27-SKU Indian grocery catalog.
    requirement: TEST-02
    verification:
      - kind: other
        ref: node catalog name comparison plus npm run typecheck
        status: pass
    human_judgment: false
  - id: D2
    description: Seeded inventory includes packaged-unit stock, cost, and expiry fixtures without dropped table references.
    requirement: TEST-02
    verification:
      - kind: other
        ref: grep acceptance checks and npm run typecheck
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 02: Indian Grocery Seed Catalog Summary

**Remote and local Supabase seed paths now share a 27-SKU, nine-category Indian grocery catalog with stock, cost, and expiry fixtures.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-25T05:37:10Z
- **Completed:** 2026-08-25T05:42:46Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Replaced remote bar-food data and dropped-table calls with 27 packaged Indian grocery SKUs across nine categories.
- Added idempotent remote inventory fixtures with realistic quantities, costs, and expiry dates, including near-expiry frozen products.
- Mirrored catalog and inventory values for local `supabase start` while removing obsolete pool-table data.

## Task Commits

1. **Task 1: scripts/seed-dev-data.ts — Indian grocery catalog** - `e126b99` (feat)
2. **Task 2: supabase/seed.sql — mirror catalog for local stack** - `2ebf9de` (feat)

## Files Created/Modified

- `scripts/seed-dev-data.ts` - Idempotent remote seed for categories, packaged products, one smoke-level modifier, and inventory.
- `supabase/seed.sql` - Fixed-ID local mirror of the catalog, modifier, and inventory fixtures.

## Decisions Made

- Used 27 packaged SKUs (three per required category) with synthetic fixed 13-digit barcodes.
- Replaced the invalid local `bartender` fixture role with `cashier`, the current valid enum value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Corrected invalid local seed role**
- **Found during:** Task 2
- **Issue:** `bartender` is no longer in the generated `user_role` enum and would make local seed execution fail.
- **Fix:** Changed only the affected staff role values to `cashier`.
- **Files modified:** `supabase/seed.sql`
- **Verification:** `src/shared/lib/supabase.types.ts` and `src/shared/lib/rbac.ts` both list `cashier` as valid.
- **Committed in:** `2ebf9de`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required for local seed correctness; no scope expansion.

## Issues Encountered

Prettier has no configured SQL parser, so `supabase/seed.sql` was checked through its plan-specified content assertions instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 E2E specs can query the shared Indian grocery fixture names and categories.

## Self-Check: PASSED

- Confirmed both seeded catalog files exist.
- Confirmed task commits `e126b99` and `2ebf9de` exist in git history.
