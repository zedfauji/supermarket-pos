---
phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry
reviewed: 2026-08-19T18:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/entities/inventory/model/queries-analytics.ts
  - src/entities/inventory/model/queries-analytics.test.ts
  - src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx
  - src/widgets/InventoryAnalyticsPanel/ValuationSection.tsx
  - src/widgets/InventoryAnalyticsPanel/ShrinkageWasteSection.tsx
  - src/widgets/InventoryAnalyticsPanel/ExpiryLossSection.tsx
  - src/widgets/InventoryAnalyticsPanel/TurnoverSection.tsx
  - src/widgets/InventoryAnalyticsPanel/index.ts
  - src/pages/reports/index.tsx
  - src/features/export-report/model/useExportReport.ts
  - src/features/export-report/ui/ExportButtons.tsx
  - src/shared/lib/domain.ts
  - src/widgets/InventoryPagePanel.tsx
  - supabase/migrations/20260819000005_add_expired_reason.sql
  - e2e/07-reports.spec.ts
  - e2e/10-inventory.spec.ts
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-08-19T18:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The pure computation core (`computeInventoryValueAsOf`, `groupShrinkageByReason`,
`combineTurnoverRows`) is well-tested and, on inspection, correct against its
documented contracts — the unit tests in `queries-analytics.test.ts` genuinely
exercise the edge cases they claim to (null cost, positive-delta exclusion,
idempotency, cross-product isolation). The four new report widgets
(`ValuationSection`, `ShrinkageWasteSection`, `ExpiryLossSection`,
`TurnoverSection`) correctly wire loading/error/empty states and their i18n
keys all resolve in both locale catalogs. The `expired` reason migration and
its DB↔domain.ts↔UI wiring (CHECK constraint, `StockMovementReasonSchema`,
`InventoryPagePanel`'s reason `<select>`) are consistent end-to-end and match
the e2e assertions in `10-inventory.spec.ts`.

That said, one real security defect and several correctness/robustness gaps
were found, concentrated in the data-fetching and export layers rather than
the pure logic:

- A CSV-export code path in `InventoryPagePanel.tsx` bypasses this codebase's
  own CSV-formula-injection mitigation (the one CLAUDE.md calls out as an
  established convention), reintroducing CWE-1236 for the Inventory page's
  "Export CSV" button.
- `useTurnoverReport` silently produces a wrong valuation number if the
  shared date range is ever inverted (From > To), because it re-uses a single
  `movements` fetch narrowed only by the earlier cutoff.
- None of the three new report hooks bound their Supabase reads with
  `.range()`/pagination, so the well-known PostgREST 1000-row default will
  silently truncate (and thus understate) valuation/shrinkage/turnover totals
  once the catalog or movement volume crosses that threshold.
- The exported CSV for Shrinkage-Waste/Expiry-Loss disagrees in sign with
  what's shown on screen for the same `value` field.

## Critical Issues

### CR-01: CSV export in InventoryPagePanel bypasses the codebase's CSV-formula-injection mitigation

**File:** `src/widgets/InventoryPagePanel.tsx:53-96`
**Issue:** Every other report export in this codebase (Caja, Product Sales,
Valuation, Shrinkage/Waste, Turnover, …) routes through
`src/shared/lib/exporters/csv.ts`'s `rowsToCsv()`, which explicitly
neutralizes formula-prefixed cells (`=`, `+`, `-`, `@`, tab, CR) per CWE-1236
(see the comment on `FORMULA_PREFIX` in that file, and CLAUDE.md's own
"Implemented Features" note calling this mitigation out by name). The
Inventory page's "Export CSV" button (`handleExportCsv` →
`downloadInventoryCsv` → `escapeCsvField`), however, hand-rolls its own CSV
serialization that only escapes quotes/commas/newlines — it never checks for
a leading `=`/`+`/`-`/`@`:

```ts
function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

`downloadInventoryCsv` feeds `r.product?.name`, `r.product?.category?.name`,
and `r.product?.sku` straight through this function. Product name/SKU/
category are staff-editable free text (via `manage-products`/
`manage-categories`, reachable by any `manager`+ role). A product named e.g.
`=HYPERLINK("http://evil.example","click")` or `=cmd|'/c calc'!A1` would be
written into the CSV unescaped and executed by Excel/Sheets/LibreOffice when
an admin opens the exported file — a classic CSV/formula-injection (CWE-1236)
vector, and one this codebase has already invested in closing everywhere
else.
**Fix:** Reuse the existing `rowsToCsv`/`csvToBytes` (or at minimum its
`sanitizeCsvCell`/`FORMULA_PREFIX` logic) instead of the local hand-rolled
serializer:

```ts
import { rowsToCsv } from '@shared/lib/exporters/csv';

const INVENTORY_CSV_COLUMNS: CsvColumn<{
  product: string; category: string; sku: string; quantity_on_hand: string;
  unit: string; low_stock_threshold: string; base_price: string;
}>[] = [
  { key: 'product', header: 'product' },
  { key: 'category', header: 'category' },
  { key: 'sku', header: 'sku' },
  { key: 'quantity_on_hand', header: 'quantity_on_hand' },
  { key: 'unit', header: 'unit' },
  { key: 'low_stock_threshold', header: 'low_stock_threshold' },
  { key: 'base_price', header: 'base_price' },
];

function downloadInventoryCsv(rows: Inventory[]) {
  const mapped = rows.map(r => ({
    product: r.product?.name ?? '',
    category: r.product?.category?.name ?? '',
    sku: r.product?.sku ?? '',
    quantity_on_hand: String(r.quantityOnHand),
    unit: r.unit,
    low_stock_threshold: String(r.lowStockThreshold),
    base_price: r.product?.basePrice != null ? String(r.product.basePrice) : '',
  }));
  const csv = rowsToCsv(mapped, INVENTORY_CSV_COLUMNS);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  // ...unchanged download-link code
}
```

## Warnings

### WR-01: `useTurnoverReport` silently under-reconstructs `valueAtTo` when the shared date range is inverted

**File:** `src/entities/inventory/model/queries-analytics.ts:403-453`
**Issue:** The hook fetches `stock_movements` once with
`.gt('created_at', from.toISOString())` (line 421), then calls
`computeInventoryValueAsOf` twice — once with `asOfDate = from`, once with
`asOfDate = to` — relying on the comment's assumption that "`to >= from`"
always holds so a `from`-bounded fetch is a superset of what a
`to`-bounded reconstruction needs. Nothing enforces that assumption:
`ReportsPage`'s `DateRangePicker` (`src/shared/ui/DateRangePicker.tsx`) is two
independent native `<input type="date">` fields with no min/max wiring
between them, so a user can set "From" later than "To". When `to < from`,
movements with `to < createdAt <= from` are never fetched at all (the SQL
filter already excluded them), so `computeInventoryValueAsOf(..., to)`
reconstructs `valueAtTo` from an incomplete movement set — silently
overstating `quantityAsOf`/`value` at the `to` cutoff (fewer loss movements
get subtracted than actually occurred). This flows straight into `avgValue`
and `turnoverRatio` in `combineTurnoverRows`, with no error or empty-state
shown to the user — it just renders a plausible-looking wrong number.
**Fix:** Guard the assumption explicitly, either by fetching from
`min(from, to)` instead of the raw `from` param, or by returning an error
Result when `to < from`:

```ts
const earliestCutoff = from <= to ? from : to;
const { data: movData, error: movError } = await db
  .from('stock_movements')
  .select('product_id, quantity_delta, created_at')
  .gt('created_at', earliestCutoff.toISOString());
```

### WR-02: `fetchShrinkageMovements` skips the null/array-safety guard its sibling hooks use

**File:** `src/entities/inventory/model/queries-analytics.ts:222-257`
**Issue:** `useInventoryValuationReport` (lines 124-125) and
`useTurnoverReport` (lines 428-429) both defensively normalize Supabase's
response with `Array.isArray(invData) ? invData : []` before mapping.
`fetchShrinkageMovements`, in the same file, does not:

```ts
const costByProduct = new Map<string, number | null>(
  (invData as { product_id: string; cost_price: number | null }[]).map(r => [...])
);
const movements: ShrinkageMovement[] = (movData as StockMovementReasonRawRow[]).map(r => ({...}));
```

If `invData`/`movData` were ever `null` (e.g. an unexpected PostgREST
response shape, or a future refactor that returns `null` on some code path)
this throws a `TypeError` inside the `queryFn`, which bypasses this
codebase's `Result<T>`/`logger.error(...)` convention (mandated by
CLAUDE.md's "Error handling" section) — the specific
`reports.shrinkage.fetch_failed` log message documented two lines above
never fires, and the failure is only visible as React Query's generic
`isError` state.
**Fix:** Match the guard already used two functions above in the same file:

```ts
const invRows = Array.isArray(invData) ? (invData as { product_id: string; cost_price: number | null }[]) : [];
const movRows = Array.isArray(movData) ? (movData as StockMovementReasonRawRow[]) : [];
```

### WR-03: No pagination on the new report queries — PostgREST's default 1000-row cap can silently truncate valuation/shrinkage/turnover totals

**File:** `src/entities/inventory/model/queries-analytics.ts:104-107, 114-117, 223-225, 231-235, 409-411, 418-421`
**Issue:** `useInventoryValuationReport`, `fetchShrinkageMovements`, and
`useTurnoverReport` all issue unbounded `db.from('inventory').select(...)`
and `db.from('stock_movements').select(...)` calls with no `.range()`/
`.limit()`. Supabase/PostgREST returns at most 1000 rows per request by
default when no range is specified. For a supermarket catalog (CLAUDE.md
describes "mostly barcoded packaged goods" across many categories — spices,
grains, snacks, pickles, ghee/oil, tea/coffee, frozen, sweets) crossing 1000
SKUs, or a `stock_movements` volume exceeding 1000 rows within a selected
date range, these queries will silently return a partial result set with no
error surfaced — the Valuation store total, Shrinkage/Waste total, and
Turnover ratios would all be understated with no indication to the user that
the number is incomplete. This is a pre-existing pattern elsewhere in the
reports layer too, but it's worth flagging here specifically because these
are the first *financial-total* reports in this codebase where silent
truncation directly corrupts a headline dollar figure users are expected to
reconcile against (per the e2e reconciliation tests in `07-reports.spec.ts`).
**Fix:** At minimum, page through results with `.range()` when the row count
could plausibly exceed 1000, or add a documented ceiling assumption + a
loud warning/log when a query returns exactly 1000 rows (a good signal that
truncation likely occurred).

### WR-04: Shrinkage-Waste/Expiry-Loss CSV export disagrees in sign with the on-screen display for the same field

**File:** `src/features/export-report/model/useExportReport.ts:275-285`, `src/widgets/InventoryAnalyticsPanel/ShrinkageWasteSection.tsx:60`, `src/widgets/InventoryAnalyticsPanel/ExpiryLossSection.tsx:39`
**Issue:** On screen, both sections render the `value` column as a negated,
red "loss" amount: `<MoneyDisplay amount={-info.getValue<number>()} ... />`.
The CSV export (`SHRINKAGE_WASTE_CSV_COLUMNS`/`EXPIRY_LOSS_CSV_COLUMNS`) maps
straight over `ShrinkageRow.value` without negation, so the same underlying
number appears as `15.00` in the exported file but `−$15.00` on screen. A
manager reconciling the on-screen total against the exported CSV (which is
exactly the scenario the "Value" column exists to support) will see
mismatched signs for identical data, and if the CSV is later summed
alongside other exported reports that do use negative-for-loss convention
(e.g. a spreadsheet combining this with Valuation's `value` column), the
sign mismatch silently breaks any grand-total arithmetic.
**Fix:** Either negate in the CSV column mapping to match the UI:

```ts
case 'shrinkage-waste-csv': {
  const ctx = data as ShrinkageWasteContext;
  const rows = ctx.rows.map(r => ({ ...r, value: -r.value }));
  bytes = csvToBytes(rowsToCsv(rows, SHRINKAGE_WASTE_CSV_COLUMNS));
  break;
}
```

or, if the positive magnitude is intentional for spreadsheet-friendliness,
rename the CSV column header to something unambiguous (`"Loss Value"`) and
add a one-line comment stating the sign convention differs from the UI on
purpose.

### WR-05: `ExportButtons`'s report-type dispatch has no exhaustiveness check, unlike `useExportReport`'s switch

**File:** `src/features/export-report/ui/ExportButtons.tsx:136-195`
**Issue:** `useExportReport.ts`'s `switch (type)` ends with
`const never: never = type; throw new Error(...)` — a compile-time
exhaustiveness guard that fails the build if a new `ExportType` isn't
handled. `ExportButtons.tsx`'s `handleExport` instead uses a long
`if (props.reportType === 'x') {...} else if (...) {...} else { /* assumed categories */ }`
chain that silently falls through to the `categories` branch for *any*
unmatched `reportType`:

```ts
} else {
  const type = format === 'excel' ? 'categories-excel' : ...;
  await exportReport(type, props.data);
}
```

Today every current `Props` union member is explicitly handled, so this is
correct as shipped — but the pattern has no TypeScript safety net: if a
future report type is added to the `Props` union without adding a matching
`else if` here, TypeScript will not flag it, and the new report type will
silently export as `categories-*` with the wrong data shape cast through
`props.data`.
**Fix:** Replace the `if/else if` chain with a `switch (props.reportType)`
that ends in a `never` exhaustiveness check, mirroring `useExportReport.ts`'s
own pattern in the same feature folder.

## Info

### IN-01: Valuation tooltip copy is misleading when a past "To" date is selected

**File:** `src/shared/lib/i18n/locales/en-US/wAdmin.json` (`valuationSection.formulaTooltip`), rendered from `src/widgets/InventoryAnalyticsPanel/ValuationSection.tsx:155`
**Issue:** The tooltip reads "...this report uses today's cost applied to
**current stock**." That's accurate only when the selected "To" date is
today. `useInventoryValuationReport` (correctly) reconstructs the quantity
*as of* the selected `dateRange.to` by reversing later movements — if the
user picks a past "To" date, the report shows today's cost applied to the
**reconstructed historical** quantity, not literal current stock. The copy
doesn't account for that case and could mislead a manager auditing a past
date into thinking the quantity shown is today's live count.
**Fix:** Adjust the tooltip copy to something like "...this report uses
today's cost applied to the on-hand quantity reconstructed as of the
selected date" (both `en-US` and `es-MX` catalogs).

---

_Reviewed: 2026-08-19T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
