---
phase: 04-reports-hardening
plan: 02
subsystem: reports, checkout, database
tags: [postgres, supabase, react, reports, exports]
requires:
  - phase: 02-core-direct-sale-checkout
    provides: process_direct_sale_atomic checkout transaction
  - phase: 03-supplier-receiving-expiry
    provides: inventory.cost_price receiving data
provides:
  - Server-derived historical cost snapshots for direct-sale order items
  - Product Sales margin reporting and export support
affects: [04-03 full-day soak, checkout, reports]
actuals:
  tokens: 74454
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - Historical cost is captured inside the SECURITY DEFINER checkout RPC.
    - Unknown historical cost is excluded from margin revenue and cost totals.
key-files:
  created:
    - supabase/migrations/20260818000002_order_items_cost_price_snapshot.sql
    - supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql
  modified:
    - src/entities/tab/model/queries-reports.ts
    - src/widgets/ProductSalesPanel/ProductSalesPanel.tsx
    - src/shared/lib/exporters/excel.ts
    - src/shared/lib/exporters/pdf.tsx
key-decisions:
  - Margin uses only rows with a recorded historical cost; null snapshots never imply zero cost.
  - Cost snapshots are derived from locked inventory inside the RPC and ignore client JSON fields.
requirements-completed: [REP-02]
coverage:
  - id: D1
    description: Direct sales snapshot locked inventory cost server-side and ignore client-supplied snapshots.
    requirement: REP-02
    verification:
      - kind: e2e
        ref: e2e/50-direct-sale-checkout.spec.ts#snapshots inventory cost_price server-side and ignores a supplied snapshot
        status: pass
    human_judgment: false
  - id: D2
    description: Product Sales calculates historical-cost margin while excluding unknown-cost revenue from margin math.
    requirement: REP-02
    verification:
      - kind: integration
        ref: src/entities/tab/model/product-sales-report.integration.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Product Sales exports Margin through Excel, PDF, and CSV with the appropriate null representation.
    requirement: REP-02
    verification:
      - kind: unit
        ref: src/shared/lib/exporters/excel.test.ts and src/shared/lib/exporters/pdf.test.ts
        status: pass
    human_judgment: false
duration: 14min
completed: 2026-08-15
status: complete
---

# Phase 04 Plan 02: Historical Cost Margin Summary

**Direct-sale cost snapshots feed an accurate Product Sales Margin column across the table and every export format.**

## Performance

- **Duration:** 14min
- **Started:** 2026-08-15T05:41:28Z
- **Completed:** 2026-08-15T05:55:18Z
- **Tasks:** 2/2
- **Files modified:** 20

## Accomplishments

- Added a nullable `order_items.cost_price_snapshot` migration and captured the locked `inventory.cost_price` in `process_direct_sale_atomic`, with no client RPC parameter.
- Added Product Sales cost/margin aggregation that omits unknown-cost revenue from the margin calculation and renders an accessible em dash when all costs are unknown.
- Added Margin to Excel, PDF, and CSV exports and localized the UI/PDF labels in English and Mexican Spanish.

## Task Commits

1. **Task 1 RED: cost snapshot coverage** — `5c6bc77` (test)
2. **Task 1: Snapshot cost at sale time and surface it as Margin on Product Sales** — `59f2300` (feat)
3. **Task 2: Extend Margin to Excel/PDF/CSV exports and i18n** — `d07b956` (feat)

## Decisions Made

- Margin is calculated from the subset of rows with known historical costs, while Revenue remains the full sales total.
- PDF uses an em dash for unknown margin; spreadsheet and CSV exports retain an empty value to avoid representing unknown cost as zero.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the Product Sales integration fixture self-contained and time-isolated.**
- **Found during:** Task 1
- **Issue:** The local fixture referenced a removed Jamie profile and current-day sales from other test runs polluted its totals.
- **Fix:** Created and cleaned up a dedicated authenticated test profile, and seeded report rows on a fixed future date.
- **Files modified:** `src/entities/tab/model/product-sales-report.integration.test.ts`
- **Verification:** Targeted integration suite passes (5 tests).
- **Committed in:** `d07b956`

**2. [Rule 3 - Blocking] Updated generated Supabase row types and dependent report fixtures.**
- **Found during:** Task 1
- **Issue:** The new column and required ProductSalesRow fields initially blocked TypeScript checks.
- **Fix:** Added the nullable order-item field to local database types and supplied the new report fields in affected fixtures.
- **Files modified:** `src/shared/lib/supabase.types.ts`, report/export/panel test fixtures
- **Verification:** `npm run typecheck` passes.
- **Committed in:** `59f2300`, `d07b956`

**Total deviations:** 2 auto-fixed Rule 3 issues. Both were required to run the plan's automated proof without changing product scope.

## Verification

- PASS — `npx vitest run src/entities/tab/model/product-sales-report.integration.test.ts` (5 tests)
- PASS — `npx playwright test e2e/50-direct-sale-checkout.spec.ts -g "snapshots inventory cost_price"` (1 test)
- PASS — `npm run typecheck`
- PASS — focused ESLint for every changed source/test file.
- PASS — live database confirms nullable `numeric(10,2)` snapshot column and deployed function markers for the inventory read and extended insert.
- UNRUN — repository-wide `npm run lint` does not terminate in this environment after its existing boundaries-plugin warning (confirmed with `timeout 5s`, status 124); no changed-file lint findings remain.

## Known Stubs

None.

## Issues Encountered

The existing repository-wide lint command hangs after emitting a legacy boundaries-plugin warning. This is unrelated tooling behavior; focused lint for all plan-owned source and test files passes.

## User Setup Required

None.

## Next Phase Readiness

The checkout RPC now persists historical cost atomically, so Plan 04-03's full-day soak can exercise the post-margin sales path.

## Self-Check: PASSED

- Created migrations exist and all three task commits are present in git history.
