# Phase 14: Inventory Analytics Reports - Pattern Map

**Mapped:** 2026-08-19
**Files analyzed:** 11
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/entities/inventory/model/queries-analytics.ts` | service (query hooks + pure fns) | CRUD/aggregation | `src/entities/tab/model/queries-reports.ts` | exact |
| `src/entities/inventory/model/queries-analytics.test.ts` | test | transform | `src/entities/tab/model/queries-reports.test.ts` | exact |
| `src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx` | component | request-response | `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` | exact |
| `src/widgets/InventoryAnalyticsPanel/ValuationSection.tsx` | component | request-response | `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` | role-match |
| `src/widgets/InventoryAnalyticsPanel/ShrinkageWasteSection.tsx` | component | request-response | `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` | role-match |
| `src/widgets/InventoryAnalyticsPanel/ExpiryLossSection.tsx` | component | request-response | `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` | role-match |
| `src/widgets/InventoryAnalyticsPanel/TurnoverSection.tsx` | component | request-response | `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` | role-match |
| `src/widgets/InventoryAnalyticsPanel/index.ts` | barrel | n/a | `src/widgets/ProductSalesPanel/index.ts` (if present) / `src/features/export-report/index.ts` | exact |
| `src/shared/lib/domain.ts` (edit) | model/schema | CRUD | itself, existing enum block lines 97-141 | exact |
| `src/widgets/InventoryPagePanel.tsx` (edit) | component | request-response | itself, `handleBatchSubmit` ~186-241 | exact |
| `src/pages/reports/index.tsx` (edit) | route/page | request-response | itself, existing `TabsContent`/group pattern | exact |
| `src/features/export-report/model/useExportReport.ts` (edit) | service | file-I/O | itself, `ExportType` union + `*Context` types | exact |
| `supabase/migrations/<ts>_add_expired_reason.sql` | migration | CRUD | `supabase/migrations/20260422000003_add_physical_count_reason.sql` | exact |

## Pattern Assignments

### `src/entities/inventory/model/queries-analytics.ts` (service, CRUD/aggregation)

**Analog:** `src/entities/tab/model/queries-reports.ts`

**Imports pattern** (lines 1-32):
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any, ... */
import { useQuery } from '@tanstack/react-query';
import type { ... } from '@shared/lib/domain';
import i18n from '@shared/lib/i18n';
import { logger } from '@shared/lib/logger-instance';
import { err, ok, unknownError, type Result } from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
const db = supabase as any;
```

**Core query + pure-fn-extraction pattern** (`useProductSalesReport`, lines 224-331):
```typescript
export function useProductSalesReport(from: Date, to: Date) {
  return useQuery({
    queryKey: ['reports', 'product-sales', from.toISOString(), to.toISOString()] as const,
    queryFn: async (): Promise<Result<ProductSalesRow[]>> => {
      const { data, error } = await db.from('order_items').select(`...`)
        .neq('orders.status', 'voided')
        .gte('orders.tabs.created_at', from.toISOString())
        .lte('orders.tabs.created_at', to.toISOString());
      if (error) { logger.error('reports.product_sales.fetch_failed', { message: error.message }); return err(unknownError(error)); }
      if (!data || !Array.isArray(data)) return ok([]);
      // ... Map<productId, aggregate> accumulation, then Array.from(map.entries()).map(...)
      return ok(result);
    },
    staleTime: 60_000,
  });
}
```
Apply this exact shape for `useInventoryValuationReport(asOfDate)`, `useShrinkageWasteReport(from, to)`, `useExpiryLossReport(from, to)`, `useTurnoverReport(from, to)` — one `useQuery` per report, `queryKey` namespaced `['reports', 'inventory-valuation', ...]` etc., `staleTime: 60_000`.

**Pure-function extraction pattern (for unit testing, no Supabase mock needed)** — mirror `computePctTotals` (top of file, exported standalone) and the RESEARCH.md-specified `computeInventoryValueAsOf` / `groupShrinkageByReason` functions (verbatim code given in RESEARCH.md `Pattern 1`/`Pattern 2` — copy those directly):
```typescript
export function computeInventoryValueAsOf(
  current: CurrentStock[],
  movementsAfterCutoff: MovementForReconstruction[],
  asOfDate: Date
): Array<{ productId: string; quantityAsOf: number; costPrice: number | null; value: number | null }> { /* RESEARCH.md Pattern 1 */ }

function groupShrinkageByReason(movements: ...) { /* RESEARCH.md Pattern 2 — D-02 'unclassified_adjustments' bucket */ }
```
Both `useInventoryValuationReport` and `useTurnoverReport` must call the **same** `computeInventoryValueAsOf` (D-04) — do not duplicate.

**Error handling pattern**: identical `if (error) { logger.error('reports.<name>.fetch_failed', {...}); return err(unknownError(error)); }` then `if (!data) return ok([])`.

---

### `src/entities/inventory/model/queries-analytics.test.ts` (test)

**Analog:** `src/entities/tab/model/queries-reports.test.ts` (co-located, tests `computePctTotals`/`fillMissingHours` as pure fns with fixture arrays, no Supabase mocking). Mirror this: fixture-pinned assertions on `computeInventoryValueAsOf` and `groupShrinkageByReason` directly, per RESEARCH.md's Validation Architecture section (`-t valuation`, `-t shrinkage`, `-t expiry`, `-t turnover` test-name filters expected).

---

### `src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx` (component, request-response)

**Analog:** `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` (full file read, 176 lines)

**Imports pattern** (lines 1-8):
```typescript
import type { ColumnDef } from '@tanstack/react-table';
import { BarChart2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExportButtons } from '@features/export-report';
import { useProductSalesReport, type ProductSalesRow } from '@entities/tab/model/queries-reports';
import { DataTable, EmptyState, LoadingSpinner, MoneyDisplay, POSButton } from '@shared/ui';
```
Replace with `useInventoryValuationReport` etc. from `@entities/inventory/model/queries-analytics`; add `SectionHeader` import (per UI-SPEC's `SectionHeader` sub-section title requirement) and `Tooltip` (Valuation's D-03 note).

**Loading/error/empty guard pattern** (lines 149-172):
```typescript
if (isLoading) { return <LoadingSpinner />; }
return (
  <DataTable
    columns={columns}
    data={filtered}
    toolbar={toolbar}
    emptyState={<EmptyState icon={BarChart2} title={t('...emptyTitle')} description={t('...emptyDescription')} />}
    getRowClassName={(row) => { const idx = filtered.indexOf(row); if (idx < 3 && filtered.length > 0) { return 'border-l-2 border-l-pos-highlight bg-pos-highlight/5'; } return undefined; }}
  />
);
```
Reuse verbatim for the accent/top-3 row highlight (UI-SPEC Color section). For query error state (not present in `ProductSalesPanel` — use `InventoryPagePanel`'s `resultError` pattern instead, see below).

**Top-level composition:** `InventoryAnalyticsPanel.tsx` should be a thin composer rendering the 4 sub-sections stacked with `space-y-8`/`xl` gap (`InventoryPagePanel`'s outer `<div className="mx-auto max-w-6xl space-y-8">` wrapper, lines 217+), each sub-section owning its own `useXReport` hook call + `SectionHeader` + formula note + `DataTable`.

**Margin/cost-unavailable fallback** (lines 74-89, apply to Valuation/Turnover `costPrice === null` rows per UI-SPEC "partial" state):
```typescript
{
  accessorKey: 'margin',
  cell: info => {
    const margin = info.getValue<number | null>();
    return margin !== null ? (
      <MoneyDisplay amount={margin} size="sm" />
    ) : (
      <span className="text-muted-foreground text-sm" aria-label={t('...marginUnavailableAriaLabel')}>—</span>
    );
  },
},
```

**Export toolbar pattern** (lines 149-150):
```typescript
{rawRows.length > 0 && <ExportButtons reportType="products" data={exportData} />}
```
Extend `ExportType` union in `useExportReport.ts` with new `-csv` suffixed types (`valuation-csv`, `shrinkage-csv`, `expiry-loss-csv`, `turnover-csv`) per that file's existing "net-new report types... CSV-only for now" comment block (lines 60-64) — do not add Excel/PDF unless requested.

---

### `src/shared/lib/domain.ts` (edit — add `expired` to both enums)

**Analog:** itself, lines 97-141 (verbatim current state, confirmed):
```typescript
export const InventoryAdjustReasonSchema = z.enum([
  'sale', 'manual_adjustment', 'waste', 'delivery', 'correction', 'physical_count',
]);
export const InventoryAdjustReason = {
  SALE: 'sale', MANUAL_ADJUSTMENT: 'manual_adjustment', WASTE: 'waste',
  DELIVERY: 'delivery', CORRECTION: 'correction', PHYSICAL_COUNT: 'physical_count',
} as const;

export const StockMovementReasonSchema = z.enum([
  'sale', 'manual_adjustment', 'waste', 'delivery', 'correction', 'physical_count',
  'prep_production', 'prep_consumption', 'combo_component', 'refund', 'void',
]);
export const StockMovementReason = { ... } as const;
```
**Required edit:** add `'expired'` to BOTH `z.enum([...])` arrays AND both const objects (`EXPIRED: 'expired'`) — Pitfall 4 in RESEARCH.md: `InventoryLogSchema` (what `useInventoryLog`/`useMutationAdjustInventory` actually `.parse()` against) uses `InventoryAdjustReasonSchema`, not `StockMovementReasonSchema`. Missing either one breaks the change-log UI or lets an unvalidated value through.

---

### `src/widgets/InventoryPagePanel.tsx` (edit — D-01 reason picker)

**Analog:** itself, `handleBatchSubmit` + batch dialog (lines 186-241, 336-402 for the Dialog JSX)

**Current hardcoded call to replace** (lines 199-206):
```typescript
const res = await adjustMutation.mutateAsync({
  productId: batchProductId,
  quantityDelta: delta,
  reason: InventoryAdjustReason.MANUAL_ADJUSTMENT,
  staffId,
});
```
Replace `InventoryAdjustReason.MANUAL_ADJUSTMENT` with new `batchReason` state (default `''`, required — no silent default per UI-SPEC), validated alongside `batchProductId`/`delta` in the existing guard:
```typescript
if (!batchProductId || Number.isNaN(delta) || delta === 0) {
  toast.error(t('inventoryPagePanel.chooseProductAndDelta'));
  return;
}
```
Extend this same guard to also require `batchReason` (UI-SPEC's extended toast copy: "Choose a product, quantity, and reason.").

**Existing `<select>` pattern to copy for the reason picker** (category filter, lines 165-181, and batch-product select, lines 360-376):
```typescript
<select
  id="batch-product"
  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
  value={batchProductId}
  onChange={e => { setBatchProductId(e.target.value); }}
>
  <option value="">{t('inventoryPagePanel.selectPlaceholder')}</option>
  {(data ?? []).map(inv => (
    <option key={inv.productId} value={inv.productId}>{inv.product?.name ?? inv.productId}</option>
  ))}
</select>
```
Copy this shape for the new reason `<select>`, with a hardcoded 6-item option list in D-01's declared order (`waste, expired, delivery, correction, manual_adjustment, physical_count` → UI labels "Waste · Expired · Delivery · Correction · Manual Adjustment · Physical Count") — **do not** map over `StockMovementReasonSchema.options` (Pitfall 5: leaks bar-pos-era values like `prep_production`).

**FormField wrapper pattern** (lines 378-388) — reuse `FormField` for the new reason field, mirroring how `quantityDeltaLabel`/`quantityDeltaHint` is wrapped.

**RBAC gate** — no change needed; whole dialog already inside `ProtectedAction action="adjust_inventory"` (lines 259-271).

---

### `src/pages/reports/index.tsx` (edit — D-06 new tab)

**Analog:** itself — existing grouped `TabsList` + `TabsContent` pattern (lines 47-97 for group headers, 99-172 for content panes)

**Group header pattern** (lines 65-73):
```tsx
<div className="flex flex-col gap-1.5">
  <span className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
    {t('reports.groups.sales')}
  </span>
  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
    <TabsTrigger value="session" className="flex-none">{t('reports.tabs.session')}</TabsTrigger>
    ...
  </div>
</div>
```
Add a new group (e.g. `t('reports.groups.inventoryAnalytics')`) with one `TabsTrigger value="inventory-analytics"`.

**Content pane pattern** (lines 106-110, repeated per tab):
```tsx
<TabsContent value="products">
  <div className="space-y-4">
    <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
    <ProductSalesPanel dateRange={dateRange} />
  </div>
</TabsContent>
```
Copy exactly for `<TabsContent value="inventory-analytics">` wrapping `<InventoryAnalyticsPanel dateRange={dateRange} />` — reuses the same shared `DateRangePicker`/`toDateStr`/`fromDateStr` helpers (lines 16-27) already defined at module scope. D-05: Valuation section internally treats `dateRange.to` as "as of end date"; Shrinkage/Expiry/Turnover treat the full range as from/to — this distinction lives inside `InventoryAnalyticsPanel`'s sub-sections, not in this page file.

---

### `src/features/export-report/model/useExportReport.ts` (edit — extend `ExportType`)

**Analog:** itself, lines 58-65 (the precedent for CSV-only net-new report types):
```typescript
// Net-new report types (Plans 08/09) — CSV-only for now; Excel/PDF stay optional
// per-report per D-11/D-12, added later if a widget plan wants them.
| 'tip-split-csv'
| 'deletions-pre-csv'
| 'deletions-post-csv'
| 'payment-methods-csv';
```
Add `'valuation-csv' | 'shrinkage-waste-csv' | 'expiry-loss-csv' | 'turnover-csv'` following this exact precedent comment style, plus a matching `*Context` type (mirror `ProductsContext`/`CategoriesContext`, lines 68-84) and CSV serialization branch using `rowsToCsv`/`csvToBytes` from `@shared/lib/exporters/csv` (already imported).

---

### `supabase/migrations/<timestamp>_add_expired_reason.sql` (migration)

**Analog:** `supabase/migrations/20260422000003_add_physical_count_reason.sql` (verbatim pattern per RESEARCH.md Code Examples):
```sql
BEGIN;
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_reason_check
  CHECK (reason IN (
    'sale', 'manual_adjustment', 'waste', 'delivery', 'correction', 'physical_count',
    'prep_production', 'prep_consumption', 'combo_component', 'refund', 'void',
    'expired'
  )) NOT VALID;
COMMIT;
```

---

## Shared Patterns

### Data fetching + aggregation (client-side, TanStack Query)
**Source:** `src/entities/tab/model/queries-reports.ts:224-331` (`useProductSalesReport`)
**Apply to:** all 4 new report hooks in `queries-analytics.ts` — single Supabase `select()`, `Map`-based groupby, `Array.from(map.entries()).map(...)`, sort, return `ok(result)`. No new RPC/DB view (RESEARCH.md `Don't Hand-Roll`).

### Error handling
**Source:** `src/entities/tab/model/queries-reports.ts` fetch blocks — `if (error) { logger.error(...); return err(unknownError(error)); }`
**Apply to:** all new query functions. UI-level error surface: `src/widgets/InventoryPagePanel.tsx:220-224` (`resultError` → `role="alert" text-sm text-destructive`), matches UI-SPEC's "Couldn't load this report. Try again." copy.

### RBAC / auth
**Source:** `ReportsRoute` gate (`view_reports`, manager+) already wraps `/reports` — no change needed for the 4 new report sections. Reason-picker stays inside existing `ProtectedAction action="adjust_inventory"` (`InventoryPagePanel.tsx:259,271`) — no new RBAC action.

### Money/negative-value display
**Source:** `MoneyDisplay` component (used throughout `ProductSalesPanel.tsx`) — already colors negative amounts `text-destructive` with leading `−`; pass shrinkage/waste/expiry-loss values through unmodified (UI-SPEC Color section, no manual color logic needed).

### CSV export
**Source:** `src/shared/lib/exporters/csv.ts` (`rowsToCsv`, `csvToBytes`) + `src/features/export-report/model/useExportReport.ts` `ExportType` union pattern (lines 58-65)
**Apply to:** all 4 new reports' `ExportButtons reportType="..."` wiring.

### Top-3-value row highlight (accent color)
**Source:** `ProductSalesPanel.tsx:157-165` (`getRowClassName`, `border-l-2 border-l-pos-highlight bg-pos-highlight/5`)
**Apply to:** all 4 report `DataTable`s per UI-SPEC Color section.

## No Analog Found

None — every file in scope has a direct, recently-modified in-repo analog. This phase is a pure pattern-extension phase per RESEARCH.md ("no new technology adoption").

## Metadata

**Analog search scope:** `src/entities/tab/model/`, `src/entities/inventory/model/`, `src/widgets/ProductSalesPanel/`, `src/widgets/InventoryPagePanel.tsx`, `src/pages/reports/`, `src/features/export-report/`, `src/shared/lib/domain.ts`, `supabase/migrations/`
**Files scanned:** 8 read in full/targeted sections (queries-reports.ts, ProductSalesPanel.tsx, InventoryPagePanel.tsx, reports/index.tsx, domain.ts enum block, inventory queries.ts mutation, useExportReport.ts, plus CONTEXT/RESEARCH/UI-SPEC)
**Pattern extraction date:** 2026-08-19
