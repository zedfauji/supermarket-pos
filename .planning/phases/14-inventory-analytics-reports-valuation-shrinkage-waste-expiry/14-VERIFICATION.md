---
phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry
verified: 2026-08-19T14:35:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) Verification Report

**Phase Goal:** The owner can see where inventory value sits, what's being lost to shrinkage/waste
and expiry, and how fast stock turns — all from read-only reports layered on existing
inventory/stock-movement data, with zero new schema beyond the reports themselves.

**Verified:** 2026-08-19T14:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner can view an inventory valuation report: on-hand qty × current weighted-average cost, by product/category, plus store-wide total | ✓ VERIFIED | `ValuationSection.tsx` renders store total (`MoneyDisplay size="xl"`), category-subtotal stat cards, and a per-product `DataTable`; backed by `computeInventoryValueAsOf` (`src/entities/inventory/model/queries-analytics.ts:52-69`), 7 fixture-pinned unit tests pass, e2e test `Inventory analytics: Valuation store total reconciles with quantity x current cost across seeded inventory` independently re-derives the expected total from a direct DB query and asserts it renders — PASSED live. |
| 2 | Owner can view a shrinkage/waste report: dollar value of non-sale stock loss rolled up from adjustment reason codes | ✓ VERIFIED | `ShrinkageWasteSection.tsx` renders total loss + reason-bucket table (waste/correction/unclassified_adjustments) via `groupShrinkageByReason` (`queries-analytics.ts:195-211`); 9 fixture-pinned unit tests incl. D-02 "5 rows → 1 unclassified entry" backstop; e2e reconciliation test PASSED live confirming waste value included, expired value excluded. |
| 3 | Owner can view an expiry-loss report: dollar value of stock written off due to expiry, filtered separately from other shrinkage even though both read the same `stock_movements` data | ✓ VERIFIED | `ExpiryLossSection.tsx` calls `useExpiryLossReport`, which filters `groupShrinkageByReason`'s output to only the `'expired'` bucket; same e2e test above PASSED live asserting expiry-loss total excludes waste value and vice versa. Pitfall-8 grep guard (no "batch"/"lot"/"shipment" in `ExpiryLossSection.tsx` or its i18n keys) returns zero matches. |
| 4 | Owner can view a turnover/sell-through report combining units-sold (Product Sales report) with average inventory value (Valuation) | ✓ VERIFIED | `TurnoverSection.tsx` composes `useProductSalesReport` (imported verbatim from `entities/tab/model/queries-reports.ts`, not reimplemented — confirmed via grep) with `useTurnoverReport`'s two-point average of `computeInventoryValueAsOf`, combined via pure fn `combineTurnoverRows`; 8 fixture-pinned unit tests incl. division-by-zero guard (avgValue=0/null, unitsSold=null all → turnoverRatio=null, never Infinity/NaN/0); e2e test `Turnover row shows units sold and a non-null turnover ratio` PASSED live. |
| 5 | Each report states its cost-basis formula directly in the UI, auditable/reconciling, pinned by automated fixture tests | ✓ VERIFIED | All 4 sections render an inline formula-note `<p>` (`whitespace-normal`, never truncated) with the exact cost-basis wording (Valuation: "as of end date" only, per D-05 — verified by a dedicated e2e backstop test asserting no en-dash range; Shrinkage/Turnover: full from–to range). 22 vitest fixture-pinned tests across `computeInventoryValueAsOf`/`groupShrinkageByReason`/`combineTurnoverRows` pin each formula's output against known input. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/entities/inventory/model/queries-analytics.ts` | `computeInventoryValueAsOf`, `groupShrinkageByReason`, `combineTurnoverRows` pure fns + 5 query hooks | ✓ VERIFIED | 454 lines; all functions present, exported, and consumed by widgets. |
| `src/entities/inventory/model/queries-analytics.test.ts` | Fixture-pinned unit tests for all 3 pure fns | ✓ VERIFIED | 267 lines, 22 tests, all pass (`npx vitest run` — 22/22). |
| `src/widgets/InventoryAnalyticsPanel/{InventoryAnalyticsPanel,ValuationSection,ShrinkageWasteSection,ExpiryLossSection,TurnoverSection,index}.{ts,tsx}` | 4 report widgets + composer + barrel | ✓ VERIFIED | All 6 files exist; composer renders all 4 sections in `space-y-8` stack. |
| `src/pages/reports/index.tsx` | New "Inventory Analytics" tab | ✓ VERIFIED | `TabsTrigger value="inventory-analytics"` + `TabsContent` wired to `InventoryAnalyticsPanel`, imported and rendered. |
| `supabase/migrations/20260819000005_add_expired_reason.sql` | `expired` added to `stock_movements_reason_check` | ✓ VERIFIED | File exists; confirmed applied to the live local Supabase DB (`schema_migrations` row present) and the live CHECK constraint definition includes `'expired'::character varying`. |
| `src/shared/lib/domain.ts` | `expired` in both `InventoryAdjustReasonSchema`/`StockMovementReasonSchema` | ✓ VERIFIED | `grep "'expired'"` returns 2 array matches + 2 const-object matches (4 total). |
| `src/widgets/InventoryPagePanel.tsx` | Required 6-value reason picker, no hardcoded default | ✓ VERIFIED | `batchReason` state, guard requires it, `<select>` has exactly 6 hardcoded `<option>`s in D-01 order (waste, expired, delivery, correction, manual_adjustment, physical_count); `MANUAL_ADJUSTMENT` hardcoded default removed from the mutation call. |
| `src/features/export-report/model/useExportReport.ts`, `ui/ExportButtons.tsx` | CSV export for all 4 report types | ✓ VERIFIED | `valuation-csv`, `shrinkage-waste-csv`, `expiry-loss-csv`, `turnover-csv` all present in `ExportType` union, switch statement, and `ExportButtons` Props union/handlers. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/pages/reports/index.tsx` | `InventoryAnalyticsPanel` | `TabsContent[value=inventory-analytics]` | ✓ WIRED | Confirmed by grep + live e2e navigation. |
| `InventoryAnalyticsPanel` | 4 sections | direct render | ✓ WIRED | All 4 `<XSection dateRange={dateRange} />` present in composer. |
| `ValuationSection`/`ShrinkageWasteSection`/`ExpiryLossSection`/`TurnoverSection` | Supabase (`inventory`/`stock_movements`) | query hooks in `queries-analytics.ts` | ✓ WIRED | Each hook issues real `.from(...).select(...)` calls; e2e reconciliation tests confirm real data flows (not static/mock). |
| `InventoryPagePanel.tsx` reason `<select>` | `stock_movements` insert | `handleBatchSubmit` → `useMutationAdjustInventory` | ✓ WIRED | Live DB INSERT with `reason='expired'` succeeds against the CHECK constraint; e2e T5c/T5d confirm persistence + validation. |
| Each Section | `ExportButtons` → `useExportReport` → `rowsToCsv`/`csvToBytes` → Tauri `write_file` | CSV export | ✓ WIRED | 4/4 CSV-export e2e tests PASSED live, mocked `write_file` invoke confirmed called. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ValuationSection` | `storeTotal`, `rows` | `useInventoryValuationReport` → real Supabase `inventory`/`stock_movements` SELECT | Yes (e2e reconciles against independent DB query) | ✓ FLOWING |
| `ShrinkageWasteSection`/`ExpiryLossSection` | `rows` | `fetchShrinkageMovements` → real Supabase SELECT | Yes (e2e reconciles) | ✓ FLOWING |
| `TurnoverSection` | `rows` | `useProductSalesReport` + `useTurnoverReport` → real Supabase SELECTs | Yes (e2e asserts non-null ratio + correct units-sold) | ✓ FLOWING |

### Behavioral Spot-Checks / E2E Execution

All checks below were run live against the local dev server (port 1520) and local Supabase Docker stack, not narrated — full stdout captured.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests (all 3 pure fns, 22 cases) | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts` | 22/22 passed | ✓ PASS |
| Inventory Analytics E2E suite (8 tests) | `npx playwright test e2e/07-reports.spec.ts -g "Inventory analytics"` | 8/8 passed (1.8m) | ✓ PASS |
| Reason-picker E2E suite (10-inventory) | `npx playwright test e2e/10-inventory.spec.ts` | 7 passed, 2 skipped (pre-existing conditional skips) | ✓ PASS |
| `npm run typecheck` | `tsc --noEmit` | clean, 0 errors | ✓ PASS |
| `npm run lint` | `eslint src --max-warnings 0` | clean (only a pre-existing tooling-config info warning, 0 lint errors) | ✓ PASS |
| Full unit suite regression check | `npm run test` | 124 files, 1170 tests passed, 15 todo, 2 skipped — no failures | ✓ PASS |
| Live migration applied | `docker exec supabase-db psql ... SELECT version FROM schema_migrations WHERE version='20260819000005'` | 1 row returned | ✓ PASS |
| Live CHECK constraint accepts `expired` | `pg_get_constraintdef` on `stock_movements_reason_check` | includes `'expired'::character varying` | ✓ PASS |
| Pitfall 8 grep guard (Expiry-Loss copy) | `grep -rni "batch\|\blot\b\|shipment" ExpiryLossSection.tsx + i18n keys` | zero matches | ✓ PASS |
| Debt-marker scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) | grep across all phase-modified source files | zero matches | ✓ PASS |
| i18n genuine-translation check | Python diff of en-US vs es-MX keys for all 4 sections | 0/14, 0/13, 0/10, 0/13 identical values (all genuinely translated) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INVR-01 | 14-01 | Inventory valuation report | ✓ SATISFIED | Truth #1 above; live e2e + unit tests pass. |
| INVR-02 | 14-02, 14-03 | Shrinkage/waste report | ✓ SATISFIED | Truth #2 above; `expired` reason live in DB, reason picker required, live e2e pass. |
| INVR-03 | 14-02, 14-03 | Expiry-loss report, filtered separately | ✓ SATISFIED | Truth #3 above; live e2e pass. |
| INVR-04 | 14-04 | Turnover/sell-through report | ✓ SATISFIED | Truth #4 above; live e2e pass. |

**Note (non-blocking):** `.planning/REQUIREMENTS.md`'s coverage table (lines 108-111) still lists INVR-01..04 as "Pending" — this is a stale tracking-table entry (the checklist items themselves and phase mapping are otherwise correct), not a code or functional gap. Recommend updating the coverage table's status column in a follow-up doc pass; does not block phase completion.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers, no empty stub implementations, no hardcoded-empty-data patterns in any of the 12 phase-modified source files scanned.

### Human Verification Required

None. Per this repo's CLAUDE.md mandatory-automated-testing policy, every check above was executed as an automated Vitest/Playwright run against the live dev server and local Supabase instance (not narrated, not delegated to the user) — no `human_needed` items exist for this phase.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria for Phase 14 are verified against actual running code and live E2E execution (not SUMMARY.md claims): all 4 reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) render real data reconciled against independently-computed DB queries, share the D-04 reconstruction helper (no duplicate valuation logic), correctly isolate the `expired` bucket from other shrinkage per D-02/D-05, and expose auditable formula notes pinned by 22 fixture tests plus 8 live E2E tests. Zero new schema beyond the single additive `expired` CHECK-constraint value (no new tables), matching the phase's "zero new schema beyond the reports themselves" constraint.

---

_Verified: 2026-08-19T14:35:00Z_
_Verifier: Claude (gsd-verifier)_
