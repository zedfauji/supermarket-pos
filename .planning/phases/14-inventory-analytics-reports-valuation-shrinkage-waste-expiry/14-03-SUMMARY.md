---
phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry
plan: 03
subsystem: reporting
tags: [react, tanstack-query, supabase, vitest, playwright, i18n, csv-export]

requires:
  - phase: 14-01
    provides: "queries-analytics.ts sibling-file convention, InventoryAnalyticsPanel composer widget, CSV export pattern (valuation-csv)"
  - phase: 14-02
    provides: "'expired' as a live, DB-enforced, Zod-validated stock_movements reason + D-01 reason picker on the batch-adjust dialog"
provides:
  - "groupShrinkageByReason pure fn (GROUP BY reason over negative-delta stock_movements, D-02 unclassified bucket, expired isolated)"
  - "useShrinkageWasteReport(from, to) / useExpiryLossReport(from, to) TanStack Query hooks — independent fetches over the same underlying data, filtered separately"
  - "ShrinkageWasteSection / ExpiryLossSection widgets appended to InventoryAnalyticsPanel"
  - "'shrinkage-waste-csv' / 'expiry-loss-csv' ExportType wired through useExportReport/ExportButtons"
affects: [14-04]

actuals:
  tokens: 10605
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "groupShrinkageByReason: pure fn, GROUP BY reason over negative-quantityDelta stock_movements only — 'waste'/'correction'/'expired' each an independent Map key, legacy 'manual_adjustment' remapped to 'unclassified_adjustments' (D-02), 'sale'/'refund'/other reasons excluded entirely"
    - "Two independent report hooks over the same fetch shape (useShrinkageWasteReport filters OUT 'expired', useExpiryLossReport filters IN only 'expired') — mirrors this codebase's one-fetch-per-report-hook convention, no forced shared cache entry"
    - "data-testid on each InventoryAnalyticsPanel sub-section (valuation-section, shrinkage-waste-section, expiry-loss-section) for scoped Playwright lookups once multiple sections render 'Export' buttons on the same tabpanel"

key-files:
  created:
    - src/widgets/InventoryAnalyticsPanel/ShrinkageWasteSection.tsx
    - src/widgets/InventoryAnalyticsPanel/ExpiryLossSection.tsx
  modified:
    - src/entities/inventory/model/queries-analytics.ts
    - src/entities/inventory/model/queries-analytics.test.ts
    - src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx
    - src/widgets/InventoryAnalyticsPanel/ValuationSection.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/features/export-report/model/useExportReport.ts
    - src/features/export-report/ui/ExportButtons.tsx
    - e2e/07-reports.spec.ts

key-decisions:
  - "D-02 enforced in code: 'manual_adjustment' movements bucket under the explicit 'unclassified_adjustments' key with UI-SPEC's exact caption + helper text, never silently folded into waste/expired — verified by a fixture-pinned unit test asserting 5 separate manual_adjustment rows collapse to exactly ONE Map entry with summed units/value."
  - "Expiry-Loss and Shrinkage/Waste are two independent useQuery hooks over the same underlying stock_movements+inventory fetch, each calling the same groupShrinkageByReason pure fn and then filtering client-side (OUT 'expired' / IN only 'expired') — proven end-to-end by seeding one 'waste' and one 'expired' movement and asserting each section's total reconciles independently and never leaks the other section's value (ROADMAP SC #3)."
  - "Added data-testid to all three InventoryAnalyticsPanel sub-sections (including retroactively to 14-01's ValuationSection) once a shared tabPanel-wide getByRole('button', { name: /export/i }) lookup became ambiguous across 3 sections that can each render an Export button — a Rule 1 fix to the pre-existing Valuation CSV export test, not a new requirement."

patterns-established:
  - "Reconciliation E2E pattern extended to two filtered-separately report sections in one test: independently re-derive the expected per-section totals in JS from a direct stock_movements+inventory query (not by calling the app's own groupShrinkageByReason), then assert the rendered UI matches per section — proves both the math and the cross-section filtering boundary, usable by 14-04's Turnover E2E test."

requirements-completed: [INVR-02, INVR-03]

coverage:
  - id: D1
    description: "Owner can view a Shrinkage/Waste sub-section showing dollar value of non-sale stock loss, grouped by reason (waste, correction, unclassified adjustments), for the selected date range"
    requirement: "INVR-02"
    verification:
      - kind: unit
        ref: "src/entities/inventory/model/queries-analytics.test.ts#shrinkage: groupShrinkageByReason (9 cases incl. unclassified-at-scale and idempotency backstops)"
        status: pass
      - kind: e2e
        ref: "e2e/07-reports.spec.ts#Inventory analytics: shrinkage/waste and expiry-loss totals reconcile and stay filtered separately"
        status: pass
    human_judgment: false
  - id: D2
    description: "Owner can view an Expiry-Loss sub-section showing the dollar value of stock written off as reason='expired', filtered separately from Shrinkage/Waste even though both read the same underlying stock_movements data"
    requirement: "INVR-03"
    verification:
      - kind: e2e
        ref: "e2e/07-reports.spec.ts#Inventory analytics: shrinkage/waste and expiry-loss totals reconcile and stay filtered separately"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pre-Phase-14 manual_adjustment rows render under an explicit 'Unclassified adjustments' bucket, never silently folded into waste or expired (D-02)"
    requirement: "INVR-02"
    verification:
      - kind: unit
        ref: "src/entities/inventory/model/queries-analytics.test.ts#shrinkage: 5 separate manual_adjustment movements produce exactly ONE unclassified_adjustments Map entry"
        status: pass
    human_judgment: false
  - id: D4
    description: "Expiry-Loss report copy never uses 'batch', 'lot', or 'shipment' (Pitfall 8)"
    requirement: "INVR-03"
    verification:
      - kind: other
        ref: "grep -rni 'batch|\\blot\\b|shipment' ExpiryLossSection.tsx + expiryLossSection i18n keys — zero matches"
        status: pass
    human_judgment: false
  - id: D5
    description: "Owner can export the Shrinkage/Waste and Expiry-Loss reports as CSV via ExportButtons, reusing rowsToCsv"
    requirement: "INVR-02"
    verification:
      - kind: e2e
        ref: "e2e/07-reports.spec.ts#Inventory analytics: Shrinkage/Waste CSV export writes a file"
        status: pass
      - kind: e2e
        ref: "e2e/07-reports.spec.ts#Inventory analytics: Expiry-Loss CSV export writes a file"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-08-19
status: complete
---

# Phase 14 Plan 03: Shrinkage/Waste + Expiry-Loss Reports Summary

**Shrinkage/Waste (INVR-02) and Expiry-Loss (INVR-03) reason-bucketed loss reports live on the Inventory Analytics tab, both reading the same tagged `stock_movements` ledger via a shared, unit-tested `groupShrinkageByReason` pure function that keeps 'expired' isolated from 'waste'/'correction' and buckets pre-Phase-14 `manual_adjustment` rows as an explicit "Unclassified adjustments" line (D-02) — with CSV export for both, all proven by 9 fixture-pinned unit tests and 3 Playwright E2E tests (no manual verification).**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-19T18:55:04Z (approx, first commit 12:55:04-06:00)
- **Completed:** 2026-08-19T19:19:02Z (last commit 13:19:02-06:00)
- **Tasks:** 3
- **Files modified:** 11 (2 created, 9 modified)

## Accomplishments
- `groupShrinkageByReason` — pure, unit-tested GROUP BY function over negative-delta `stock_movements`: `waste`/`correction`/`expired` each an independent bucket, `manual_adjustment` remapped to `unclassified_adjustments` (D-02), `sale`/`refund`/anything else excluded entirely; 9 fixture-pinned tests including the D-02 unclassified-at-scale backstop (5 rows → 1 Map entry) and an idempotency probe
- `useShrinkageWasteReport(from, to)` / `useExpiryLossReport(from, to)` — two independent TanStack Query hooks over the same `stock_movements` + `inventory` fetch shape, filtered client-side (`useShrinkageWasteReport` excludes `'expired'`, `useExpiryLossReport` returns only `'expired'`), same `Result<T>` error shape as every other hook in `queries-analytics.ts`
- `ShrinkageWasteSection` — total-loss `MoneyDisplay`, reason-bucket `DataTable` (waste/correction/unclassified), D-02 caption + helper text rendered inline on the unclassified row, D-05-compliant formula note using the full from-to range
- `ExpiryLossSection` — total-loss `MoneyDisplay`, single expired-only row, formula note scoped strictly to "product-level stock write-offs" with zero "batch"/"lot"/"shipment" language (Pitfall 8, grep-verified)
- Both sections appended to `InventoryAnalyticsPanel` below Valuation, reusing the exact `LoadingSpinner`/`role="alert"`/`EmptyState` guard order and UI-SPEC copy
- `shrinkage-waste-csv` / `expiry-loss-csv` export types end-to-end (`useExportReport` + `ExportButtons`), CSV-only per UI-SPEC, reusing `rowsToCsv`
- Full en-US + genuine es-MX translations for every string both widgets render
- 3 new Playwright tests: an independent-reconciliation test proving Shrinkage/Waste and Expiry-Loss totals stay filtered separately from the same seeded data (ROADMAP SC #3), plus one CSV-export assertion per new report type

## Task Commits

Each task was committed atomically (Task 1 is TDD — RED then GREEN):

1. **Task 1: `groupShrinkageByReason` + both report query hooks**
   - `1f98014` (test) — RED: 9 fixture-pinned tests, confirmed failing (function didn't exist)
   - `2706237` (feat) — GREEN: `groupShrinkageByReason` + `useShrinkageWasteReport`/`useExpiryLossReport`, confirmed passing
2. **Task 2: ShrinkageWasteSection + ExpiryLossSection widgets, panel wiring, i18n** — `5817b72` (feat)
3. **Task 3: CSV export wiring for Shrinkage/Waste and Expiry-Loss** — `40e7b43` (feat)

_Task 2 and 3 commits were built as separate diffs against the working tree (Task 3's `ExportButtons` wiring was written, then temporarily stripped from the two new sections before Task 2's commit, then re-applied for Task 3's commit) to keep each task's commit scoped to its own declared `<files>` — no functional rework, purely commit hygiene._

## Files Created/Modified
- `src/entities/inventory/model/queries-analytics.ts` — `groupShrinkageByReason` pure fn + `useShrinkageWasteReport`/`useExpiryLossReport` hooks
- `src/entities/inventory/model/queries-analytics.test.ts` — 9 fixture-pinned unit tests under `describe('shrinkage: groupShrinkageByReason', ...)`
- `src/widgets/InventoryAnalyticsPanel/ShrinkageWasteSection.tsx` — new widget
- `src/widgets/InventoryAnalyticsPanel/ExpiryLossSection.tsx` — new widget
- `src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx` — renders both new sections below Valuation
- `src/widgets/InventoryAnalyticsPanel/ValuationSection.tsx` — `data-testid="valuation-section"` (Rule 1 fix, see Deviations)
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` — `shrinkageWasteSection.*` / `expiryLossSection.*` copy blocks
- `src/features/export-report/model/useExportReport.ts` — `shrinkage-waste-csv`/`expiry-loss-csv` ExportTypes + column configs
- `src/features/export-report/ui/ExportButtons.tsx` — `ShrinkageWasteProps`/`ExpiryLossProps`, CSV-only gating
- `e2e/07-reports.spec.ts` — `seedShrinkageFixture`/`computeExpectedShrinkageTotals`/`formatNegativeUsd` helpers + 3 new tests, plus a scoping fix to the pre-existing Valuation CSV export test

## Decisions Made
- `groupShrinkageByReason` keeps `'expired'` as its own independent Map key rather than a separate function — both `useShrinkageWasteReport` and `useExpiryLossReport` call the exact same grouping fn and then filter the resulting array, so there is exactly one grouping implementation to keep the two reports' totals from ever drifting apart (RESEARCH.md Pattern 2, D-02).
- Kept `useShrinkageWasteReport`/`useExpiryLossReport` as two independent `useQuery` hooks (separate query keys, separate fetches) rather than one hook two consumers share — matches this codebase's established one-fetch-per-report-hook convention (`useCategoryRevenueReport` vs. `useProductSalesReport`) and avoids forcing a shared cache entry between two reports with different UI/date semantics.
- Added `data-testid` to all three `InventoryAnalyticsPanel` sub-sections (see Deviations) instead of relying on nested-DOM `xpath` traversal or renaming visible copy for e2e scoping — an inert attribute with zero visual/behavioral effect, consistent with the project's headless-Playwright-only testing policy (CLAUDE.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a strict-mode ambiguity the new sections introduced against the pre-existing Valuation CSV export test**
- **Found during:** Task 3 verification run (`npx playwright test e2e/07-reports.spec.ts -g "Inventory analytics"`)
- **Issue:** 14-01's "Inventory analytics: Valuation CSV export writes a file" test located its Export button via `tabPanel.getByRole('button', { name: /export/i })`. Once Task 3 wired `ExportButtons` into `ShrinkageWasteSection`/`ExpiryLossSection` too, and the local test DB already carried qualifying `stock_movements` rows from other tests sharing the same instance, all three sections rendered an "Export" button simultaneously — the tabPanel-wide lookup became a strict-mode violation (3 matching elements), failing a previously-green test.
- **Fix:** Added `data-testid="valuation-section"` to `ValuationSection.tsx` (mirroring the `data-testid`s already added to the two new sections) and scoped the pre-existing test's `exportBtn` lookup to `tabPanel.getByTestId('valuation-section')` first.
- **Files modified:** `src/widgets/InventoryAnalyticsPanel/ValuationSection.tsx`, `e2e/07-reports.spec.ts`
- **Verification:** Full `-g "Inventory analytics"` re-run — all 6 tests (3 from 14-01, 3 from this plan) pass together.
- **Committed in:** `40e7b43` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing test broken by this plan's own new UI surface, blocking full-suite verification).
**Impact on plan:** Necessary to keep the whole `e2e/07-reports.spec.ts` Inventory Analytics block green together, not just this plan's own new tests in isolation. No scope creep — only the one file (plus the test file already in scope) touched.

## Issues Encountered
- Same worktree environment gap as 14-01/14-02: no `node_modules`/`.env.local` in this fresh checkout (both are per-checkout, gitignored). Symlinked `node_modules` to the main checkout and passed Supabase/E2E credentials as inline shell env vars to `vitest`/`playwright` commands (writing/symlinking `.env.local` itself is blocked by the sandbox as a secrets-file write). All verification commands ran successfully with this setup.
- Confirmed via `npm run test` (124 test files, 1163 tests, 15 pre-existing todo, 2 pre-existing skipped) that no other suite regressed from this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `groupShrinkageByReason` and the reason-bucket `ShrinkageRow` type are available for 14-04 (Turnover) if it needs any reason-filtered movement data, though Turnover's own RESEARCH.md plan is to reuse `computeInventoryValueAsOf` (from 14-01) instead.
- `InventoryAnalyticsPanel.tsx` is ready to receive `<TurnoverSection dateRange={dateRange} />` appended by 14-04.
- The `data-testid` convention (`valuation-section`, `shrinkage-waste-section`, `expiry-loss-section`) is now established on every `InventoryAnalyticsPanel` sub-section — 14-04's `TurnoverSection` should follow the same convention (`data-testid="turnover-section"`) for consistent e2e scoping once a 4th section can also render an Export button on the same tabpanel.
- No blockers.

## Known Stubs
None.

## Self-Check: PASSED

- FOUND: src/widgets/InventoryAnalyticsPanel/ShrinkageWasteSection.tsx
- FOUND: src/widgets/InventoryAnalyticsPanel/ExpiryLossSection.tsx
- FOUND: 1f98014 (test commit)
- FOUND: 2706237 (feat commit)
- FOUND: 5817b72 (feat commit)
- FOUND: 40e7b43 (feat commit)

---
*Phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry*
*Completed: 2026-08-19*
