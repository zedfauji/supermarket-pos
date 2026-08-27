# Phase 4: Reports & Hardening - Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** ~24 (Track A deletion: 14, Track B margin: 9, Track C soak: 1)
**Analogs found:** all — this phase is dominated by *modify/delete existing files*, so the "analog" for nearly every file is itself (its own current content, read via RESEARCH.md's verified excerpts). A few genuinely new files (migrations, soak spec) have real external analogs below.

This phase is unusual: most "new" work is surgical deletion/extension of existing files, not net-new files needing a borrowed pattern. Where RESEARCH.md already contains a verified, line-numbered excerpt of the exact code to touch, this file points to it directly rather than re-reading (no re-reads per instructions). Only genuinely new files (2 migrations, 1 E2E spec) get a full analog-copy treatment below.

## File Classification

| File | Role | Data Flow | Action | Closest Analog | Match Quality |
|------|------|-----------|--------|-----------------|----------------|
| `src/pages/reports/index.tsx` | route/page | request-response | modify (remove 2 tabs) | itself (current file) | n/a — edit in place |
| `src/widgets/TipDistributionPanel/` | component | request-response | delete | — | n/a |
| `src/widgets/ModifierPopularityReport/` | component | request-response | delete | — | n/a |
| `src/entities/staff/model/queries.ts` (`useStaffTips`) | hook (query) | CRUD (read) | delete function only | — | n/a |
| `src/entities/tab/model/queries-reports.ts` (`useModifierPopularityReport`) | hook (query) | CRUD (read) | delete function only | — | n/a |
| `src/shared/lib/domain.ts` (`StaffTipsSchema`, `ModifierPopularityRowSchema`) | model (Zod) | transform | delete schemas | — | n/a |
| `src/features/export-report/model/useExportReport.ts` | service (export) | transform | modify (remove union members + switch cases) | itself | n/a — edit in place |
| `src/features/export-report/ui/ExportButtons.tsx` | component | request-response | modify (remove props/branches) | itself | n/a — edit in place |
| `src/shared/lib/exporters/excel.ts`, `pdf.tsx` | utility | transform | delete 2 fns / add 1 column | itself | n/a — edit in place |
| `src/shared/lib/i18n/locales/{es-MX,en-US}/pages.json`, `wAdmin.json` | config | transform | modify (delete keys) | itself | n/a — edit in place |
| `supabase/migrations/<new>_drop_modifier_popularity_report_rpc.sql` | migration | CRUD (DDL) | new file | `supabase/migrations/20260810000010_drop_tip_distribution.sql` | exact (same "drop a report RPC cleanly" pattern) |
| `supabase/migrations/<new>_order_items_cost_price_snapshot.sql` | migration | CRUD (DDL) | new file | `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` (adds `inventory.cost_price`) | exact (nullable-column-add, no backfill) |
| `supabase/migrations/<new>_process_direct_sale_atomic_cost_snapshot.sql` | migration | CRUD (DDL + RPC) | new file (CREATE OR REPLACE) | `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` | exact — this IS the function being replaced |
| `src/shared/lib/domain.ts` (`OrderItemSchema` + `costPriceSnapshot`) | model (Zod) | transform | modify (add nullable field) | `InventorySchema.costPrice` (same file, lines 509-514) | exact |
| `src/shared/lib/domain.ts` (`ProductSalesRow` margin fields) | model (type) | transform | modify (add fields) | itself | n/a — edit in place |
| `src/entities/tab/model/queries-reports.ts` (`useProductSalesReport`) | hook (query) | CRUD (read, client-agg) | modify (add cost aggregation) | itself, same function | n/a — edit in place |
| `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` | component | request-response | modify (add `ColumnDef`) | itself | n/a — edit in place |
| `src/shared/lib/exporters/excel.ts` (`productSalesToWorkbook`) | utility | transform | modify (add column) | itself | n/a — edit in place |
| `src/shared/lib/exporters/pdf.tsx` (`productSalesToPdfBytes`) | utility | transform | modify (add column) | itself | n/a — edit in place |
| `e2e/55-full-day-soak.spec.ts` | test | event-driven / batch | new file | `e2e/50-direct-sale-checkout.spec.ts` + `e2e/53-supplier-receiving.spec.ts` | exact (RPC-level adversarial pattern) + role-match (bulk volume / UI sampling) |

## Pattern Assignments

### `supabase/migrations/<new>_drop_modifier_popularity_report_rpc.sql` (migration, DDL)

**Analog:** `supabase/migrations/20260810000010_drop_tip_distribution.sql` (Phase 1's own precedent for cleanly dropping a report RPC — same shape of change, same repo convention).

**Pattern:** A drop-migration in this repo is just `DROP FUNCTION IF EXISTS <name>;` (plus a REVOKE if the function had explicit grants) with a header comment stating what's being removed and why, no down-script requirement violated (per CLAUDE.md, DOWN scripts only required from Phase 8 onward — this migration is new, in Phase 8+ territory, so it should still include a DOWN comment/block per that convention. Confirm current migration numbering is >= Phase 8's introduction point before deciding DOWN-script necessity.)

```sql
-- Shape to follow (do not literally copy tip_distribution's DROP TABLE —
-- this phase drops a FUNCTION, not a table):
DROP FUNCTION IF EXISTS get_modifier_popularity_report(date, date);
```

Confirm the exact signature (arg types) via `\df get_modifier_popularity_report` or by reading `supabase/migrations/20260721000003_modifier_popularity_rpc.sql`'s `CREATE FUNCTION` line before writing the DROP — signature must match exactly for `DROP FUNCTION` to resolve.

---

### `supabase/migrations/<new>_order_items_cost_price_snapshot.sql` (migration, DDL)

**Analog:** `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` — the migration that originally added `inventory.cost_price` as nullable with no backfill (same "new nullable numeric money column, historical rows stay NULL, no backfill possible" shape).

**Pattern to copy:**
```sql
ALTER TABLE order_items ADD COLUMN cost_price_snapshot numeric(10,2);
-- nullable — pre-existing rows stay NULL; no backfill possible since
-- receive_shipment never versioned cost historically before this phase
```

---

### `supabase/migrations/<new>_process_direct_sale_atomic_cost_snapshot.sql` (migration, RPC CREATE OR REPLACE)

**Analog:** `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` (the function being replaced — copy its full current body, then add the two edits below).

**Edit 1 — per-item loop, add inventory cost lock+read** (source: lines 100-105 of that file, verified in RESEARCH.md):
```sql
FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  SELECT base_price, sold_by_weight INTO v_catalog_price, v_sold_by_weight
  FROM products WHERE id = (v_elem->>'product_id')::uuid AND is_active = true FOR UPDATE;
  IF v_catalog_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRICE_MISMATCH', 'message', 'Item price does not match catalog');
  END IF;
  -- ... existing weight/price derivation ...

  -- NEW: also lock+read inventory.cost_price for the snapshot (nullable is fine)
  SELECT cost_price INTO v_cost_price FROM inventory
    WHERE product_id = (v_elem->>'product_id')::uuid FOR UPDATE;
```

**Edit 2 — INSERT column list** (source: lines 177-181, verified in RESEARCH.md):
```sql
INSERT INTO order_items (order_id, product_id, quantity, unit_price, modifier_ids,
  modifier_price_delta, notes, weight_grams, cost_price_snapshot)
SELECT v_order_id, (elem->>'product_id')::uuid, (elem->>'quantity')::int,
  (elem->>'unit_price')::numeric, ...,
  (elem->>'cost_price_snapshot')::numeric  -- threaded through v_derived_items same as unit_price
FROM jsonb_array_elements(v_derived_items) AS elem;
```

Do NOT accept `cost_price_snapshot` from `p_items` (client input) — it must be derived server-side from the `inventory` SELECT above and threaded into `v_derived_items` alongside the other server-computed fields, never trusted from the client (per RESEARCH.md's Security Domain section).

---

### `src/shared/lib/domain.ts` — `costPriceSnapshot` field (model)

**Analog:** `InventorySchema.costPrice`, same file, lines 509-514 (verified in RESEARCH.md):
```typescript
export const InventorySchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  quantityOnHand: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  unit: z.string().min(1).max(20),
  costPrice: MoneySchema.nullable().optional(),
});
```
Mirror exactly for `OrderItemSchema`: `costPriceSnapshot: MoneySchema.nullable().optional()`. Remember `exactOptionalPropertyTypes: true` — when constructing mutation input objects elsewhere (not the Zod schema itself), use `costPriceSnapshot: number | null | undefined`, not `costPriceSnapshot?: number`.

---

### `src/entities/tab/model/queries-reports.ts` — `useProductSalesReport` margin aggregation

**Analog:** itself, current body (verified this session, lines ~224-292):

```typescript
export function useProductSalesReport(from: Date, to: Date) {
  return useQuery({
    queryKey: ['reports', 'product-sales', from.toISOString(), to.toISOString()] as const,
    queryFn: async (): Promise<Result<ProductSalesRow[]>> => {
      const { data, error } = await db
        .from('order_items')
        .select(`
          quantity, unit_price, modifier_price_delta,
          products(id, name, categories(name)),
          orders!inner(status, tabs!inner(created_at))
        `)
        .neq('orders.status', 'voided')
        .gte('orders.tabs.created_at', from.toISOString())
        .lte('orders.tabs.created_at', to.toISOString());
      // ... map/aggregate loop computes { units, revenue } per product ...
    },
    staleTime: 60_000,
  });
}
```

**Extension pattern:** add `cost_price_snapshot` to the `.select()` string; in the aggregation loop, track `costTotal` and a `hasCost` flag per product row (per Pitfall 2 — a NULL `cost_price_snapshot` row must be excluded from the cost sum, not treated as zero). Compute `margin = revenue - costTotal` and `marginPct = margin / revenue` only when at least one contributing row had a non-null snapshot; otherwise render "—" in the UI column rather than 0 or NaN.

---

### `e2e/55-full-day-soak.spec.ts` (test, batch + event-driven)

**Analog 1 (RPC adversarial pattern):** `e2e/50-direct-sale-checkout.spec.ts:331-346` (verified in RESEARCH.md):
```typescript
test('rejects a tampered price before creating any rows', async () => {
  const { admin, args } = await directSaleInput(0.02);
  const [{ count: paymentsBefore }, { count: tabsBefore }] = await Promise.all([
    admin.from('payments').select('id', { count: 'exact', head: true }),
    admin.from('tabs').select('id', { count: 'exact', head: true }),
  ]);
  const result = await admin.rpc('process_direct_sale_atomic', args);
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ ok: false, code: 'PRICE_MISMATCH' });
  const [{ count: paymentsAfter }, { count: tabsAfter }] = await Promise.all([
    admin.from('payments').select('id', { count: 'exact', head: true }),
    admin.from('tabs').select('id', { count: 'exact', head: true }),
  ]);
  expect(paymentsAfter).toBe(paymentsBefore);
  expect(tabsAfter).toBe(tabsBefore);
});
```
Equivalent for receiving: `e2e/53-supplier-receiving.spec.ts:140-194` ("rejects a later invalid line without receiving earlier lines" — asserts `inventory.quantity_on_hand`/`shipments` count unchanged).

**Analog 2 (bulk RPC volume + UI sampling split):** loop `admin.rpc('process_direct_sale_atomic', ...)` using the same `directSaleInput()`-style helper for the 50-100+ bulk count; drive 5-10 real UI checkouts (one per cart type) via the existing helpers in `e2e/51-barcode-scan-search.spec.ts`, `e2e/52-loose-weight-hold-sale.spec.ts`, and `e2e/50-direct-sale-checkout.spec.ts`'s split-pay flow.

**Timeout pattern:** `test.setTimeout(<large ms>)` called at the top of the test body — do not raise `playwright.config.ts`'s global `timeout` (would loosen every other spec's budget). Structure as `test.describe.serial()` with one shared `resetTestState()`/open-caja at the top, since this is a single continuous day narrative, unlike every other spec's independent `test()` + `beforeEach` reset pattern.

**Auth/setup helpers:** `e2e/helpers/auth.ts` (`loginAs`), `e2e/helpers/supabase.ts` (service-role admin client) — reuse as-is, no new helper needed.

---

### Deletion-only files (no analog needed — see RESEARCH.md's exact line/file list)

These are pure subtraction, listed here for planner completeness (full detail already in RESEARCH.md "Recommended Project Structure" → Track A):

- `src/widgets/TipDistributionPanel/` — delete directory (3 files)
- `src/widgets/ModifierPopularityReport/` — delete directory (2 files)
- `src/entities/staff/model/queries.ts` — delete `useStaffTips` + `staffKeys.staffTips`; **KEEP `fetchActiveProfiles`** (shared with `useStaffMetrics`, both call it — verified lines 653/719)
- `src/entities/staff/model/queries.staff-report.test.ts` — delete only `describe('useStaffTips', ...)` block
- `src/entities/tab/model/queries-reports.ts` — delete `useModifierPopularityReport` + its type re-export
- `src/entities/tab/model/modifier-popularity-report.integration.test.ts` — delete file
- `src/shared/lib/domain.ts` — delete `StaffTipsSchema`/`StaffTips`, `ModifierPopularityRowSchema`/`ModifierPopularityRow`
- `src/features/export-report/model/useExportReport.ts` — delete `ExportType` members `'tips-excel' | 'tips-pdf' | 'tips-csv' | 'modifier-popularity-csv'` (lines 64-66, 75), their switch cases (`case 'tips-excel':` line 393, `'tips-pdf':` line 399, `'tips-csv':` line 445, `'modifier-popularity-csv':` line 479 — verified this session), `TipsContext`/`ModifierPopularityContext`, `TIPS_CSV_COLUMNS`/`MODIFIER_POPULARITY_CSV_COLUMNS`
- `src/features/export-report/ui/ExportButtons.tsx` — delete `TipsProps`/`ModifierPopularityProps`, corresponding `handleExport` branches
- `src/shared/lib/exporters/excel.ts`, `pdf.tsx` — delete `staffTipsToWorkbook`/`staffTipsToPdfBytes` (verify no other caller first)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/pages.json` — delete `reports.tabs.tips`/`.modifierPopularity`, `reports.groups.menu` (whole group — only child is modifier-popularity), adjust `reports.groups.staffTips` label to staff-only
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` — delete `tipDistributionPanel{}`, `modifierPopularityReport{}` blocks

**Exhaustiveness safety net:** `useExportReport.ts`'s `default: { const never: never = type; ... }` (line ~489-492) means an incomplete deletion is a `tsc` compile error, not a silent bug — use `npm run typecheck` as the pass/fail gate for this track.

## Shared Patterns

### FSD tab deletion (3-layer removal)
**Source:** `src/pages/reports/index.tsx` current structure (imports at top, `TabsTrigger`+`TabsContent` pairs inside `<Tabs>`, verified this session — `ModifierPopularityReport`/`TipDistributionPanel` imported at top, `TabsTrigger value="modifier-popularity"` at line 81, `value="tips"` at line 94, `TabsContent value="modifier-popularity"` at line 159, `value="tips"` at line 187).
**Apply to:** Any report-tab deletion — remove the import, the `TabsTrigger`, and the `TabsContent` block together; if the tab's `TabsList` group (`reports.groups.menu`) has no remaining sibling tab, delete the whole group `<div>` and its i18n key too.

### Nullable money snapshot field
**Source:** `InventorySchema.costPrice` (`src/shared/lib/domain.ts:509-514`) — `MoneySchema.nullable().optional()`.
**Apply to:** `OrderItemSchema.costPriceSnapshot` — same nullable-optional shape, same "no backfill for historical rows" semantics.

### RPC-level atomicity adversarial assertion
**Source:** `e2e/50-direct-sale-checkout.spec.ts:331-346`, `e2e/53-supplier-receiving.spec.ts:140-194` — call target RPC directly via service-role client, snapshot row counts before/after, assert unchanged on rejection.
**Apply to:** Every D-09 adversarial sub-case in the new soak spec.

## No Analog Found

None — every file in scope either has a direct in-repo predecessor (migrations mirroring prior migrations) or is a modify/delete of its own existing content.

## Metadata

**Analog search scope:** `src/pages/reports/`, `src/widgets/`, `src/entities/staff/`, `src/entities/tab/`, `src/features/export-report/`, `src/shared/lib/`, `supabase/migrations/`, `e2e/`
**Files scanned:** ~20 (targeted reads/greps this session) + RESEARCH.md's prior verified reads (reused, not re-read)
**Pattern extraction date:** 2026-08-15
