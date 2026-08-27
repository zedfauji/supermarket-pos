# Architecture Research

**Domain:** Receipt design/branding customization + purchase orders/reordering + deeper inventory reporting, layered onto an existing Tauri 2 + React 19 + Supabase FSD supermarket POS
**Researched:** 2026-08-19
**Confidence:** HIGH (verified directly against this repo's migrations, schema, RPCs, and FSD conventions — not generic domain research)

## Standard Architecture

### System Overview

This milestone adds no new layer to the existing 6-layer FSD stack (`app → pages → widgets → features → entities → shared`) and no new backend paradigm — every new capability is either (a) a straight extension of an existing entity/table, or (b) a new entity that reuses the exact `receive_shipment` pattern already proven in this codebase: **Zod-validated Edge Function → SECURITY DEFINER RPC → RLS-protected tables → `record_audit`.**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ pages/                                                                    │
│  SettingsPage (+ReceiptDesignTab)   ReportsPage (+3 tabs)   PurchaseOrdersPage (NEW) │
├──────────────────────────────────────────────────────────────────────────┤
│ widgets/                                                                  │
│  ReceiptDesignerPanel (NEW)   InventoryValuationPanel/ShrinkageReport/    │
│  TurnoverReport (NEW)         PurchaseOrderListPanel/PODetailPanel (NEW)  │
├──────────────────────────────────────────────────────────────────────────┤
│ features/                                                                │
│  update-receipt-design (extends update-receipt-settings surface)         │
│  create-purchase-order / receive-po-shipment / suggest-reorder (NEW)     │
│  export-report (EXTENDED — new report kinds)                             │
├──────────────────────────────────────────────────────────────────────────┤
│ entities/                                                                │
│  settings (receipt_settings — EXTENDED, no new table)                    │
│  purchase-order (NEW: purchase_orders, purchase_order_items)             │
│  supplier (unchanged — PO references it)                                 │
│  inventory (unchanged — stock_movements is the analytics source)         │
├──────────────────────────────────────────────────────────────────────────┤
│ shared/                                                                  │
│  receipt-format.ts (EXTENDED — template-driven, not hardcoded 32-col)    │
│  pos-printer.ts (unchanged interface)                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ Supabase                                                                 │
│  receipt_settings (ALTER, new columns)                                   │
│  purchase_orders / purchase_order_items (NEW tables + RLS)               │
│  create_purchase_order / receive_po_shipment RPCs (NEW, mirror           │
│    receive_shipment's SECURITY DEFINER pattern)                          │
│  Reports: read-only SQL views/queries over EXISTING stock_movements,     │
│    inventory, shipments — no new movement-tracking table needed         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New or extend |
|-----------|----------------|----------------|
| `entities/settings` (`receipt_settings` table + `types.ts`/`queries.ts`) | Store-wide receipt config, now including layout/branding fields | **Extend** — add columns, no new table |
| `shared/lib/receipt-format.ts` | Renders `ReceiptData` → printable text | **Extend** — read new `receipt_settings` fields (section order, font-weight zones, extra branding lines) instead of hardcoded layout |
| `widgets/ReceiptDesignerPanel` (new) | Live-preview editor UI for receipt layout, composes `ReceiptPreview` (already exists) + new controls | **New widget**, reuses existing `ReceiptPreview.tsx` |
| `entities/purchase-order` (new) | Domain model + queries for `purchase_orders`/`purchase_order_items` | **New entity** |
| `features/create-purchase-order` (new) | Draft a PO against a supplier, optionally pre-filled from low-stock suggestions | **New feature** |
| `features/receive-po-shipment` (new) | Marks a PO (or PO line items) received — **delegates to `receive_shipment` RPC**, does not duplicate its stock-mutation logic | **New feature, thin wrapper** |
| `features/suggest-reorder` (new, or a query not a mutation) | Reads `inventory.quantity_on_hand <= low_stock_threshold` (index already exists) grouped by `supplier_products` | **New read-only query**, no new table |
| `widgets/InventoryValuationPanel` / `ShrinkageWasteReport` / `ExpiryLossReport` / `TurnoverReport` (new) | Render analytics queries over existing `inventory`/`stock_movements`/`shipments` | **New widgets**, zero new movement-tracking tables |
| `pages/reports` `ReportsPage` | Add 3-4 new tabs to existing Tabs component under a new "Inventory" group | **Extend** existing page |
| `pages/purchase-orders` (new route) | PO list + detail, gated by `manage_products` or a new `manage_purchase_orders` RBAC action | **New page** |

## Recommended Project Structure

```
src/
├── entities/
│   ├── purchase-order/              # NEW
│   │   ├── model/
│   │   │   ├── types.ts             # re-export PurchaseOrder* Zod schemas from domain.ts
│   │   │   └── queries.ts           # TanStack Query hooks: usePurchaseOrders, usePurchaseOrder(id)
│   │   ├── ui/                      # PurchaseOrderStatusBadge, POLineItemRow
│   │   └── index.ts
│   └── settings/                    # EXTEND (existing)
│       └── model/types.ts           # ReceiptSettingsSchema gets new fields
├── features/
│   ├── create-purchase-order/       # NEW — 1 mutation hook + 1 form
│   ├── receive-po-shipment/         # NEW — thin wrapper delegating to receive_shipment RPC
│   ├── update-receipt-design/       # NEW (or extend an existing update-receipt-settings
│   │                                  feature if one already exists under settings widgets)
│   └── export-report/               # EXTEND — add 'valuation'|'shrinkage'|'expiry-loss'|
│                                       'turnover' report kinds to existing CSV exporter
├── widgets/
│   ├── ReceiptDesignerPanel/        # NEW
│   ├── PurchaseOrderListPanel/      # NEW
│   ├── PurchaseOrderDetailPanel/    # NEW
│   ├── LowStockReorderPanel/        # NEW — surfaces suggest-reorder query, "Create PO" CTA
│   ├── InventoryValuationPanel/     # NEW
│   ├── ShrinkageWasteReport/        # NEW
│   ├── ExpiryLossReport/            # NEW
│   └── TurnoverReport/              # NEW
├── pages/
│   ├── purchase-orders/             # NEW route: /purchase-orders
│   └── reports/index.tsx            # EXTEND — new "Inventory" tab group
└── shared/lib/
    └── receipt-format.ts            # EXTEND — template-driven rendering
```

### Structure Rationale

- **One new entity (`purchase-order`), not three.** PO header + line items is exactly the `shipments`/(implicit)`shipment_items` shape already proven by `receive_shipment` — reuse the same two-table pattern (header table + JSONB-in/relational-out line items), not a speculative "reordering engine" module.
- **No new `receipt-template` entity.** `receipt_settings` is already a store-wide singleton table with RLS and a DB-enforced singleton constraint (v1.1, D-04). A "receipt designer" is new *columns* on that table plus a richer editor UI, not a new templating subsystem — there's exactly one store, one receipt layout, no multi-template requirement in scope.
- **No new stock-movement/valuation tables.** `stock_movements` already has `reason IN ('sale','manual_adjustment','waste','delivery','correction','physical_count', ...)`, polymorphic `ref_type`/`ref_id`, and a timestamp index. `inventory.cost_price` already holds weighted-average cost (fixed in v1.1). Every requested report (valuation, shrinkage/waste, expiry-loss, turnover) is a read-only aggregation query over data that already exists — this is the single biggest scope-reduction finding of this research.

## Architectural Patterns

### Pattern 1: Edge Function → SECURITY DEFINER RPC (the established mutation pattern)

**What:** Every multi-table atomic write in this codebase (`receive_shipment`, `process_direct_sale_atomic`, `close_caja_session`) follows: thin Deno Edge Function validates the request shape with Zod and checks `Authorization`, then calls a Postgres `SECURITY DEFINER` function granted only to `service_role`. The RPC re-checks the caller's RBAC permission via `role_permissions`, does the multi-row write in one transaction, writes to `stock_movements`/`record_audit`, and returns `jsonb_build_object('ok', ...)`.

**When to use:** `create_purchase_order` and `receive_po_shipment` (the PO-receiving step) must follow this exact pattern — receiving a PO shipment **is** a `receive_shipment` call (same stock/cost/expiry mutation), just sourced from a PO's line items instead of a free-form form. Do not write a second stock-mutation code path.

**Trade-offs:** Slightly more boilerplate per mutation (edge function + RPC + Zod contract in `edge-function-contracts.ts`) than a direct client `.insert()`, but it's the only pattern in this codebase with RLS-independent authorization + atomicity, and matches `CLAUDE.md`'s "no service-role key in renderer" rule.

**Example (target shape for `receive_po_shipment`):**
```sql
CREATE OR REPLACE FUNCTION receive_po_shipment(p_staff_id uuid, p_po_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_supplier_id uuid;
  v_shipment_result jsonb;
BEGIN
  SELECT supplier_id INTO v_supplier_id FROM purchase_orders WHERE id = p_po_id AND status = 'sent';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_NOT_RECEIVABLE', 'message', 'PO not found or not in sent status');
  END IF;
  -- Delegate to the existing, already-hardened receive_shipment logic rather than
  -- re-implementing weighted-avg-cost / earliest-expiry-wins stock mutation.
  v_shipment_result := receive_shipment(p_staff_id, v_supplier_id, p_items);
  IF (v_shipment_result->>'ok')::boolean THEN
    UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = p_po_id;
  END IF;
  RETURN v_shipment_result || jsonb_build_object('poId', p_po_id);
END;
$$;
```

### Pattern 2: Reports as read-only aggregation widgets, not new tables

**What:** Every existing report widget (`CajaReportPanel`, `PaymentMethodsReport`, `DeletionsPostCloseReport`) is a TanStack Query hook running a `select`/aggregate against existing tables, rendered by a widget, wired into `ReportsPage`'s `Tabs`, and piped through the existing `export-report`/`rowsToCsv` CSV exporter (which already neutralizes CSV-injection, CWE-1236).

**When to use:** All four new report types.
- **Valuation** = `SUM(inventory.quantity_on_hand * inventory.cost_price)`, optionally grouped by category — one query, no new table.
- **Shrinkage/waste** = `stock_movements WHERE reason = 'waste'` joined to `products`, valued at `cost_price` — the `waste` reason already exists in the CHECK constraint (added in the S1-01 migration); if `adjust-inventory`'s UI doesn't yet expose "waste" as a selectable adjustment reason, that's a one-field UI gap, not a schema gap (verify during planning).
- **Expiry-loss** = `stock_movements WHERE reason IN ('waste','correction')` cross-referenced with `inventory.expiry_date < movement date`, or (simpler, lazier) a new `reason = 'expired'` value appended to the existing CHECK constraint if the team wants expiry-driven write-offs distinguished from generic waste. Recommend the latter: one `ALTER TABLE ... reason_check` migration, not a new table.
- **Turnover** = `SUM(stock_movements.quantity_delta) WHERE reason = 'sale'` over a period ÷ average `inventory.quantity_on_hand` — one query.

**Trade-offs:** Aggregation queries against `stock_movements` will need a `product_id`/`created_at` composite index if date-range + product-group queries get slow at scale; not a concern at 1-2 terminal/single-store scale (see Scaling Considerations).

### Pattern 3: `receipt_settings` extension over new receipt-template entity

**What:** `receipt_settings` is already: (1) a singleton table, (2) RLS-gated cashier-read/manager-write, (3) rendered through `buildThermalReceiptText()` in `receipt-format.ts`, (4) previewed live via `ReceiptPreview.tsx`, (5) editable via `EmailReceiptsSettingsTab`-style tab in `SettingsTabsPanel`. "Receipt designer" work is: add columns (e.g. `section_order jsonb`, `accent_style`, `show_barcode`, additional branding lines beyond `header_line_2`/`footer_text`, logo placement), then make `receipt-format.ts` read them instead of assuming a fixed 32-col hardcoded structure for anything beyond width (width is already configurable via `paperWidthChars`).

**When to use:** Any layout/branding field the milestone requires. Only reach for a genuinely new table if the requirement turns out to need **multiple named templates** (e.g. "different receipt for returns vs sales") — not indicated by current requirements language ("customizable layout/branding" — singular, store-wide).

**Trade-offs:** A single-row JSONB `section_order` column is more flexible than one boolean-per-section, but harder to validate with a flat Zod object schema. Recommend a small closed `z.array(z.enum([...]))` for section ordering rather than free-form JSON — keeps `exactOptionalPropertyTypes` and Zod validation simple, matches the existing `ReceiptPaperWidthSchema` union style.

## Data Flow

### Purchase Order → Receiving Flow

```
LowStockReorderPanel (reads inventory ⋈ low_stock_threshold, existing partial index)
    ↓ "Create PO" CTA, pre-fills supplier + products
create-purchase-order feature → create_purchase_order RPC → purchase_orders (status='draft'|'sent')
                                                            → purchase_order_items
    ↓ (owner marks PO sent to supplier — no external EDI/email integration in scope)
PurchaseOrderDetailPanel → "Receive" action
    ↓
receive-po-shipment feature → receive_po_shipment RPC
    → delegates to receive_shipment RPC (unchanged) → inventory + stock_movements + shipments
    → UPDATE purchase_orders SET status='received'
    ↓
record_audit('po.receive', ...) (existing helper, already used by receive_shipment)
```

### Receipt Design Flow

```
SettingsPage → ReceiptDesignTab (new tab in SettingsTabsPanel)
    ↓ live edits
ReceiptDesignerPanel (new widget, wraps existing ReceiptPreview.tsx for live preview)
    ↓ save
update-receipt-design feature → receipt_settings table (UPDATE, RLS: manager/admin only — unchanged policy)
    ↓ next checkout
pos-printer.ts → receipt-format.ts reads receipt_settings (already fetched via entities/settings/model/queries.ts)
    → renders per new layout fields → Tauri print_receipt / web fallback (unchanged)
```

### Inventory Analytics Flow

```
ReportsPage → new "Inventory" tab group (Valuation | Shrinkage/Waste | Expiry-Loss | Turnover)
    ↓
Each *Panel widget → TanStack Query hook → direct Supabase select/aggregate
    (inventory, stock_movements, shipments — all existing, RLS already permits
     manager/admin read via existing view_reports-gated policies)
    ↓
export-report feature (existing) → rowsToCsv (existing, CSV-injection-safe) → CSV download
```

## Scaling Considerations

| Concern | 1-2 terminals, single store (actual target) | If it ever grew |
|---------|----------------------------------------------|-------------------|
| Report query performance | Trivial — `stock_movements` at single-store daily volume is a few hundred rows/day; unindexed date-range scans are fine | Add composite index `(reason, created_at)` on `stock_movements` only if a report page visibly lags |
| PO volume | A handful of POs/week; a plain `purchase_orders`/`purchase_order_items` pair with no queueing/workflow engine is correct | N/A — out of scope per PROJECT.md ("no automatic PO generation, no multi-warehouse") |
| Receipt template complexity | One singleton row is correct — no multi-terminal, no multi-template need stated | If a second store/terminal identity ever appears, that's a `receipt_settings` schema change (add `terminal_id`), not a new entity |

**Do not build:** a PO approval workflow/state machine beyond `draft → sent → received (→ cancelled)`, a forecasting/auto-reorder engine, or a generic "report builder." All three are explicitly Out of Scope in PROJECT.md and would be premature complexity for a single store.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Duplicating `receive_shipment`'s stock-mutation logic inside a new PO-receiving RPC

**What people do:** Write a fresh `INSERT ... ON CONFLICT DO UPDATE` for inventory/cost/expiry inside `receive_po_shipment` because "it's a different entry point."
**Why it's wrong:** `receive_shipment` was hardened twice in v1.1 (cost/expiry overwrite bug fix, weighted-average-cost fix). A second, slightly different mutation path reopens both bugs.
**Instead:** `receive_po_shipment` calls `receive_shipment(p_staff_id, p_supplier_id, p_items)` internally and only adds the PO-status bookkeeping around it (see Pattern 1 example).

### Anti-Pattern 2: A new `receipt_templates` table for "receipt designer"

**What people do:** Model "receipt design" as a new normalized entity with a foreign key from `receipt_settings`, anticipating future multi-template needs.
**Why it's wrong:** No stated requirement for multiple templates; `receipt_settings` is already correctly scoped as a singleton (locked decision D-04, v1.1). Adding a template table means a second RLS surface, a second singleton-enforcement problem, and a join on every checkout print — pure speculative generality (YAGNI).
**Instead:** Add columns to `receipt_settings`. Revisit only if a second store/terminal identity is genuinely added later.

### Anti-Pattern 3: A dedicated `inventory_valuation_snapshots` or `shrinkage_events` table

**What people do:** Create new tables to "properly model" valuation/shrinkage as first-class domain concepts, mirroring textbook inventory-accounting systems.
**Why it's wrong:** `inventory.cost_price` (already weighted-avg) and `stock_movements.reason` (already includes `waste`) fully cover the stated requirements. A snapshot table adds a write-path (when to snapshot? nightly cron? no scheduler exists in this Tauri+Supabase stack without adding one) for data that's cheaply computed on read at this volume.
**Instead:** Compute valuation/shrinkage/turnover as on-demand aggregation queries, exactly like every existing report in `ReportsPage`. Only add a materialized/snapshot table if a report is measurably slow in production — not preemptively.

### Anti-Pattern 4: Auto-generating POs from low-stock thresholds

**What people do:** Build a background job or trigger that auto-creates draft POs when `quantity_on_hand <= low_stock_threshold`.
**Why it's wrong:** PROJECT.md Out of Scope explicitly excludes "automatic PO generation" and "demand forecasting." This is also architecturally awkward here — there is no server-side scheduler in this stack (Supabase Edge Functions are request-driven; no cron is wired up).
**Instead:** `LowStockReorderPanel` is a read-only suggestion surface (query, not a job) with a manual "Create PO" CTA that pre-fills a draft — the owner decides.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Postgres/RLS | New tables (`purchase_orders`, `purchase_order_items`) follow the exact RLS shape of `suppliers`/`shipments`: `SELECT` open to `authenticated`, write gated by `role_permissions` action check | Reuse `manage_products` action or add a new `manage_purchase_orders` action if PO write access should differ from product-catalog write access (decide during planning — cheap either way) |
| Supabase Edge Functions | `receive-po-shipment` edge function mirrors `supabase/functions/receive-shipment/index.ts` structure exactly (Zod `BodySchema`, CORS headers, auth check, RPC call) | `create-purchase-order` may not need an edge function at all if it's a simple RLS-gated `INSERT` from the client (no cross-table atomicity requirement) — evaluate before adding a function that isn't needed |
| ESC/POS printer (Tauri Rust `print_receipt`) | Unchanged interface — `pos-printer.ts` still sends plain text lines; new layout logic lives entirely in `receipt-format.ts` before lines reach Rust | No Rust-side changes needed unless a layout feature requires new ESC/POS commands (e.g. bold-zone control) beyond what `bold_totals` already demonstrates is possible client-side via text markers |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `features/receive-po-shipment` ↔ `receive_shipment` RPC | RPC-to-RPC call inside Postgres (`receive_po_shipment` calls `receive_shipment`) | Keep this a DB-level call, not two separate client-side edge function calls — preserves the existing transaction/atomicity guarantee |
| `widgets/*Report` ↔ `entities/inventory`, `entities/supplier` | Read-only TanStack Query, same pattern as existing `ProductSalesPanel`/`CajaReportPanel` | No new entity needed for reports themselves — they compose existing entity queries plus new aggregation queries co-located in the widget or a small `entities/inventory-reports` query module if reused across 2+ widgets |
| `widgets/ReceiptDesignerPanel` ↔ `features/process-payment/ui/ReceiptPreview.tsx` | Direct reuse — pass draft (unsaved) settings into the existing preview component | Avoids building a second preview renderer; `ReceiptPreview` already renders `receipt-format.ts` output |

## Suggested Build Order

Dependency-ordered, not necessarily 1:1 with roadmap phases:

1. **`receipt_settings` schema extension + `receipt-format.ts` template-driven rendering** — purely additive migration, no dependency on anything else, unblocks the Receipt Designer UI work immediately. Lowest risk, do first.
2. **Inventory reporting (valuation, shrinkage/waste, expiry-loss, turnover)** — zero new schema beyond one optional `reason` CHECK-constraint addition for `expired`; fastest path to shipped value since it's all read-only queries over data that already exists. Do second — independent of PO work.
3. **Purchase orders + reorder suggestions** — depends on nothing new except its own two tables, but should land after (1) and (2) because `receive_po_shipment` reuses the already-hardened `receive_shipment` RPC untouched, and the low-stock suggestion query benefits from the same aggregation patterns proven in step 2's reports.
4. **Receipt Designer UI polish (live preview, section reordering)** — depends on step 1's schema being final; sequence last within the receipt-design track so the schema isn't shifting under the UI.

Reasoning: (2) and (1) are independent and parallelizable if using multiple phases; (3) has the highest schema-design risk (new RBAC action decision, PO status lifecycle) so benefits from being sequenced after the two lower-risk, pattern-confirming tracks are done.

## Sources

- Direct repo inspection (HIGH confidence — primary source, not inferred):
  - `supabase/migrations/20260819000001_receipt_settings.sql`, `20260819000004_receipt_settings_singleton_enforce.sql`
  - `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql`, `20260817000002_receive_shipment_atomicity.sql`, `20260819000003_receive_shipment_weighted_avg_cost.sql`
  - `supabase/migrations/20260414000007_inventory.sql`, `20260424000001_stock_movements.sql`, `20260422000003_add_physical_count_reason.sql`, `20260426000002_stock_movements_idempotency_index.sql`
  - `supabase/functions/receive-shipment/index.ts`
  - `src/shared/lib/receipt-format.ts`, `src/shared/lib/pos-printer.ts`, `src/shared/lib/domain.ts` (`ReceiptSettingsSchema`, `SupplierSchema`)
  - `src/pages/reports/index.tsx`, `src/entities/supplier/model/types.ts`, `src/entities/settings/model/`
  - `.planning/PROJECT.md` (v1.3 scope, Out of Scope constraints, decisions log)
  - `CLAUDE.md` (FSD conventions, RBAC actions, mutation patterns, testing policy)

---
*Architecture research for: Receipt Designer + Purchase Orders + Inventory Reporting (v1.3 milestone)*
*Researched: 2026-08-19*
