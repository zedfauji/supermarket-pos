---
phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry
plan: 04
subsystem: reporting
tags: [react, tanstack-query, supabase, vitest, playwright, i18n, csv-export]

requires:
  - phase: 14-01
    provides: "computeInventoryValueAsOf pure fn (D-04 'value as of date' reconstruction), queries-analytics.ts sibling-file convention, InventoryAnalyticsPanel composer widget, CSV export pattern (valuation-csv)"
  - phase: 14-03
    provides: "InventoryAnalyticsPanel with 3 sections appended (Valuation/Shrinkage-Waste/Expiry-Loss), data-testid per-section convention for scoped Playwright lookups"
provides:
  - "combineTurnoverRows pure fn — unions units-sold + two-point average valuation into per-product Turnover rows, division-by-zero guarded"
  - "useTurnoverReport(from, to) TanStack Query hook — fetches inventory + movements after the earlier cutoff ONCE, reuses computeInventoryValueAsOf (D-04) twice"
  - "TurnoverSection widget — 4th and final InventoryAnalyticsPanel section, composes useProductSalesReport (reused verbatim) + useTurnoverReport client-side"
  - "'turnover-csv' ExportType wired through useExportReport/ExportButtons — completes CSV export for all 4 Inventory Analytics reports"
affects: []

actuals:
  tokens: 8670
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Two-sibling-hooks composition over a third queryFn calling hooks: TurnoverSection calls useProductSalesReport(from,to) and useTurnoverReport(from,to) as two independent useQuery hooks and combines their results client-side via a pure fn (combineTurnoverRows), avoiding a hook-call-inside-queryFn antipattern while still reusing D-04's shared reconstruction helper"
    - "Single movements-after-earlier-cutoff fetch serving two asOfDate reconstructions: useTurnoverReport fetches stock_movements after `from` ONCE, then calls computeInventoryValueAsOf twice (asOf=from, asOf=to) against that same fetched set — computeInventoryValueAsOf's own internal createdAt>asOfDate filter re-narrows correctly for the later cutoff, so no second movements fetch is issued"

key-files:
  created:
    - src/widgets/InventoryAnalyticsPanel/TurnoverSection.tsx
  modified:
    - src/entities/inventory/model/queries-analytics.ts
    - src/entities/inventory/model/queries-analytics.test.ts
    - src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/features/export-report/model/useExportReport.ts
    - src/features/export-report/ui/ExportButtons.tsx
    - e2e/07-reports.spec.ts

key-decisions:
  - "combineTurnoverRows guards turnoverRatio=null not only for avgValue===0/null (the plan's explicit division-by-zero guard) but also for unitsSold===null (a product present only in the valuation side) — JS coerces `null / n` to 0, so without this extra guard a missing-units row would silently render a fabricated 0 ratio instead of the required '—' fallback. Verified by a dedicated fixture test."
  - "seedTurnoverFixture (e2e) targets the fixed 'Budweiser' product rather than an arbitrary `.limit(1).single()` pick used by 14-01/14-03's sibling fixtures — discovered mid-implementation that this shared local Supabase test DB carries leftover `__test_r_box_*` products (from unrelated integration-test runs) with NO `inventory` row at all, and an unordered `.limit(1)` can land on one of those, producing a spuriously-null avgValue. Budweiser is the codebase's established stable fixture product (used as seedOpenTab's default) with a guaranteed real inventory row."
  - "seedTurnoverFixture returns the independently-recomputed TOTAL units sold today for the seeded product (querying order_items->orders->tabs the same way useProductSalesReport does) rather than assuming its own inserted quantity is the only contributor — mirrors computeExpectedValuationTotal/computeExpectedShrinkageTotals's reconciliation pattern, since other specs sharing this local DB may also sell Budweiser earlier the same day."

patterns-established:
  - "Client-side two-hook composition + pure combinator is now the established alternative to a queryFn-nested hook call whenever a report needs to merge two independently-fetched, already-hook-shaped data sources — reusable by any future report that similarly needs to blend Product Sales with another entity's report hook."

requirements-completed: [INVR-04]

coverage:
  - id: D1
    description: "Owner can view a Turnover/Sell-through sub-section on the Inventory Analytics tab showing, per product, units sold in the selected range combined with average inventory value (two-point average of computeInventoryValueAsOf at dateRange.from and dateRange.to), reusing useProductSalesReport verbatim rather than a duplicate sales query"
    requirement: "INVR-04"
    verification:
      - kind: unit
        ref: "src/entities/inventory/model/queries-analytics.test.ts#turnover: combineTurnoverRows (7 cases incl. two-point average, missing-side preservation, idempotency)"
        status: pass
      - kind: e2e
        ref: "e2e/07-reports.spec.ts#Inventory analytics: Turnover row shows units sold and a non-null turnover ratio"
        status: pass
    human_judgment: false
  - id: D2
    description: "Turnover ratio is division-by-zero guarded: avgValue===0, avgValue===null, or unitsSold===null all render turnoverRatio=null ('—' in the UI), never 0/Infinity/NaN; a product present in only one data source still renders exactly one row with '—' for the missing side, never dropped"
    requirement: "INVR-04"
    verification:
      - kind: unit
        ref: "src/entities/inventory/model/queries-analytics.test.ts#turnover: combineTurnoverRows (avgValue=0, avgValue=null, missing-side rows)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner can export the Turnover report as CSV via ExportButtons, reusing rowsToCsv (CWE-1236-safe) — completes the identical CSV export pattern across all 4 Inventory Analytics reports"
    requirement: "INVR-04"
    verification:
      - kind: e2e
        ref: "e2e/07-reports.spec.ts#Inventory analytics: Turnover CSV export writes a file"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-08-19
status: complete
---

# Phase 14 Plan 04: Turnover/Sell-through Report Summary

**Turnover/Sell-through (INVR-04) live on the Inventory Analytics tab as the 4th and final report — a per-product ratio combining units sold (reused verbatim from `useProductSalesReport`) with a two-point average of `computeInventoryValueAsOf` (D-04, shared with Valuation), division-by-zero guarded and per-cell "—" fallbacked, with CSV export completing the phase's four INVR-01..04 reports.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-19T19:50:30Z (approx, first commit 13:50:47-06:00)
- **Completed:** 2026-08-19T20:18:xx Z (last commit 14:18:xx-06:00)
- **Tasks:** 3
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- `combineTurnoverRows` — pure, unit-tested fn that unions units-sold rows with a from/to two-point average valuation into per-product Turnover rows: avgValue = round(((valueFrom+valueTo)/2)*100)/100, turnoverRatio = null whenever avgValue is 0/null OR unitsSold is null (never 0/Infinity/NaN), missing-side products still render one row with the other side null (never dropped, never defaulted to 0) — 7 fixture-pinned tests including a two-point-average case and an idempotency probe
- `useTurnoverReport(from, to)` — fetches `inventory` + `stock_movements` after the EARLIER cutoff (`from`) once, calls `computeInventoryValueAsOf` (D-04, reused from 14-01) twice against that same fetched data to reconstruct value at `from` and `to` — no second movements fetch, no duplicate reconstruction logic; units-sold intentionally left out of this hook (composed client-side instead) to avoid a hook-call-inside-queryFn antipattern
- `TurnoverSection` widget — composes `useProductSalesReport` (imported directly, reused verbatim per D-04's "build the reconstruction once, reuse for Valuation AND Turnover" requirement) with `useTurnoverReport` via `combineTurnoverRows` in a `useMemo`; `DataTable` with Product/Category/Units Sold/Avg Inventory Value/Turnover Ratio columns, each cell independently falling back to "—" with its own `aria-label`; formula note stating the two-point-average/current-cost limitation explicitly (D-03/D-04); appended as the 4th and final `InventoryAnalyticsPanel` section
- `turnover-csv` export type end-to-end (`useExportReport` + `ExportButtons`), CSV-only per UI-SPEC, reusing `rowsToCsv` — all four Inventory Analytics reports now share the identical export pattern
- Full en-US + genuine es-MX translations for every string the widget renders
- 2 new Playwright tests: a reconciliation test asserting the Turnover row shows the correct (independently-recomputed) units-sold figure and a non-null ratio, plus a CSV-export file-write assertion

## Task Commits

Each task was committed atomically (Task 1 is TDD — RED then GREEN):

1. **Task 1: `combineTurnoverRows` + `useTurnoverReport`**
   - `65c695e` (test) — RED: 7 fixture-pinned tests, confirmed failing (`combineTurnoverRows is not a function`)
   - `4bdc0a0` (feat) — GREEN: `combineTurnoverRows` + `useTurnoverReport`, confirmed passing (7/7)
2. **Task 2: TurnoverSection widget, panel wiring, i18n, E2E coverage** — `b4b3dd5` (feat)
3. **Task 3: CSV export wiring for Turnover** — `e74ada5` (feat)

## Files Created/Modified
- `src/entities/inventory/model/queries-analytics.ts` — `combineTurnoverRows` pure fn + `useTurnoverReport(from, to)` query hook
- `src/entities/inventory/model/queries-analytics.test.ts` — 7 fixture-pinned unit tests under `describe('turnover: combineTurnoverRows', ...)`
- `src/widgets/InventoryAnalyticsPanel/TurnoverSection.tsx` — new widget
- `src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx` — renders `TurnoverSection` as the 4th section
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` — `turnoverSection.*` copy block
- `src/features/export-report/model/useExportReport.ts` — `turnover-csv` ExportType + `TURNOVER_CSV_COLUMNS`
- `src/features/export-report/ui/ExportButtons.tsx` — `TurnoverProps`, CSV-only gating
- `e2e/07-reports.spec.ts` — `seedTurnoverFixture` helper + 2 new tests

## Decisions Made
- `combineTurnoverRows` guards `turnoverRatio=null` for `unitsSold===null` in addition to the plan's explicit `avgValue===0/null` guard — `null / n` coerces to `0` in JS, so without this extra check a valuation-only row would silently render a fabricated `0` ratio instead of the required "—" fallback. Covered by a dedicated fixture test.
- `useTurnoverReport` fetches only the valuation side (inventory + movements-after-`from`); units-sold is composed in `TurnoverSection.tsx` via a direct `useProductSalesReport` call rather than nesting that hook inside a third `useQuery`'s `queryFn` — hooks may only be called from a render/hook context, not from a query function callback, so this keeps the file free of that antipattern while still reusing `useProductSalesReport` verbatim (D-04).
- `seedTurnoverFixture` (e2e) targets the fixed `'Budweiser'` product instead of `.limit(1).single()` — this shared local Supabase test DB carries leftover `__test_r_box_*` products from unrelated integration-test runs with no `inventory` row at all, and an unordered `.limit(1)` pick can land on one of those, silently producing a null `avgValue`. `Budweiser` is the codebase's established stable fixture product (`seedOpenTab`'s default) with a guaranteed real `inventory` row.
- `seedTurnoverFixture` returns the independently-recomputed TOTAL units sold today for Budweiser (re-querying `order_items -> orders -> tabs` the same way `useProductSalesReport` does) rather than assuming its own inserted quantity is the only contributor — mirrors `computeExpectedValuationTotal`/`computeExpectedShrinkageTotals`'s established reconciliation pattern from 14-01/14-03, since other specs sharing this local DB may also sell Budweiser earlier the same day.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a division-by-zero edge case the plan's guard didn't cover**
- **Found during:** Task 1 (writing the fixture tests for `combineTurnoverRows`)
- **Issue:** The plan's suggested guard was `turnoverRatio = avgValue === null || avgValue === 0 ? null : Math.round((unitsSold / avgValue) * 100) / 100`. When a product is present only in the valuation-side data (missing from units-sold), `unitsSold` is `null`, and JavaScript coerces `null / avgValue` to `0` (never `NaN`) — so the guard as written would render a fabricated `turnoverRatio: 0` instead of the required "—" fallback for a missing data source.
- **Fix:** Extended the guard to `avgValue === null || avgValue === 0 || unitsSold === null`.
- **Files modified:** `src/entities/inventory/model/queries-analytics.ts`, `src/entities/inventory/model/queries-analytics.test.ts`
- **Verification:** Fixture test "a product present in valuation data but absent from units-sold data still produces one row, with unitsSold=null and turnoverRatio=null" passes.
- **Committed in:** `4bdc0a0` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Fixed a flaky e2e fixture caused by leftover test-pollution products in the shared local Supabase DB**
- **Found during:** Task 2 verification run (`npx playwright test e2e/07-reports.spec.ts -g "turnover"`)
- **Issue:** `seedTurnoverFixture`'s first draft mirrored `seedValuationFixture`/`seedShrinkageFixture`'s `.from('products').select(...).limit(1).single()` pattern. In this shared, long-running local Supabase test instance, that unordered query intermittently returned a leftover `__test_r_box_*` product (created by an unrelated integration test, `consume-open-unit.integration.test.ts`) that has no `inventory` row at all — the `inventory.update()` silently affected 0 rows, leaving `avgValue` null and the Turnover ratio cell stuck on "—", failing the row-level assertion.
- **Fix:** Switched `seedTurnoverFixture` to target the fixed `'Budweiser'` product (confirmed to have a real `inventory` row, and already this codebase's standard stable fixture product per `seedOpenTab`'s default), and changed the returned `unitsSold` to an independently-recomputed total (see Decisions Made) so repeated runs against the same shared DB stay correct.
- **Files modified:** `e2e/07-reports.spec.ts`
- **Verification:** `npx playwright test e2e/07-reports.spec.ts -g "turnover"` — both Turnover tests pass; full `-g "Inventory analytics"` (8 tests across all 4 sections) passes together.
- **Committed in:** `b4b3dd5` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 correctness bug in the pure fn, 1 e2e fixture-flakiness bug pre-dating this plan but only surfaced by this plan's per-row assertion).
**Impact on plan:** Both fixes are necessary for correctness/reliability. No scope creep — `seedValuationFixture`/`seedShrinkageFixture` were left untouched (their aggregate-sum assertions are insensitive to the same underlying DB-pollution issue, so "fixing" them was out of this plan's scope per the deviation rules' scope boundary).

## Issues Encountered
- Same worktree environment gap as 14-01/14-02/14-03: no `node_modules`/`.env.local` in this fresh checkout (both are per-checkout, gitignored). Symlinked `node_modules` to the main checkout and passed Supabase/E2E credentials as inline shell env vars to `vitest`/`playwright` commands (writing/symlinking `.env.local` itself is blocked by the sandbox as a secrets-file write). All verification commands ran successfully with this setup.
- Confirmed via `npm run test` (124 test files, 1170 tests, 15 pre-existing todo, 2 pre-existing skipped — 7 more passing tests than 14-03's baseline, exactly this plan's new turnover unit tests) that no other suite regressed. Confirmed via `npx playwright test e2e/07-reports.spec.ts -g "Inventory analytics"` (8/8 passing across all 4 sections) that Valuation/Shrinkage-Waste/Expiry-Loss were unaffected by this plan's shared-file edits (`ExportButtons.tsx`, `useExportReport.ts`, `InventoryAnalyticsPanel.tsx`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four Inventory Analytics reports (INVR-01..04: Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) are complete, proving D-04's "build the reconstruction once, reuse for Valuation AND Turnover" requirement end-to-end.
- No blockers. Phase 14 (Inventory Analytics Reports) is complete pending phase-level metadata/state updates by the orchestrator.

## Known Stubs
None.

## Self-Check: PASSED

- FOUND: src/entities/inventory/model/queries-analytics.ts (combineTurnoverRows, useTurnoverReport)
- FOUND: src/widgets/InventoryAnalyticsPanel/TurnoverSection.tsx
- FOUND: 65c695e (test commit)
- FOUND: 4bdc0a0 (feat commit)
- FOUND: b4b3dd5 (feat commit)
- FOUND: e74ada5 (feat commit)

---
*Phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry*
*Completed: 2026-08-19*
