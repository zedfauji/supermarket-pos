# Phase 3: Supplier, Receiving & Expiry Tracking - Research

**Researched:** 2026-08-14
**Domain:** Supabase Postgres schema + atomic RPC design, React/TanStack Query feature-folder CRUD, FSD entity/feature wiring
**Confidence:** HIGH — every claim below is grounded in files read this session (migrations, domain.ts, live query/store code); no external library research was needed because this phase introduces zero new dependencies.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Many-to-many join table (`supplier_products` or similar) links suppliers to the products they supply, not a free-text field or a single `preferred_supplier_id` FK. — Reversibility: costly.
- **D-02:** The product-supplier assignment UI is editable from **both** the Supplier form (multi-select products) and the Product form (multi-select suppliers), synced to the same join table. Both UIs must be built and kept consistent against one underlying relationship.
- **D-03:** Receiving line items support **inline quick-add**: if a scanned/entered barcode has no catalog match, the cashier can create a minimal product without leaving the receiving screen. Quick-add captures **name, category, barcode, and sale price** — the product is immediately sellable, no follow-up trip to product management required.
- **D-04:** Receiving writes a `cost_price` (landed cost) field, stored separately from `basePrice`. Receiving never modifies `basePrice`.
- **D-05:** EXP-01: one active expiry date per product, captured at receiving time (no batch-level FEFO — locked project-level).
- **D-06:** EXP-02 near-expiry alert surfaces in **three places**: a Home dashboard tile/badge (mirrors `LowStockBadge`), a near-expiry list/tab on the Inventory page (next to low-stock), and a surfaced signal on the POS checkout screen when an expiring item is scanned/added to cart.
- **D-07:** The near-expiry window is **configurable in Settings** (admin-only, mirrors `TipDistributionSettingsTab`-style patterns), default 14 days, not hardcoded.
- **D-08:** Receiving is a **single atomic Postgres RPC** (e.g. `receive_shipment`) mirroring `process_direct_sale_atomic` — commits stock + cost + expiry for all line items together or not at all, not a client-side loop. — Reversibility: costly.

### Claude's Discretion

- Exact `supplier_products` table shape (columns beyond the FK pair).
- Supplier record's contact fields (phone/email/address granularity).
- Where exactly on the POS checkout screen the near-expiry signal appears (banner vs. cart-line badge).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. AI invoice intake, FIFO/FEFO batch tracking, multi-warehouse, supplier scorecards are out of scope per PROJECT.md.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INV-01 | View real-time stock on-hand per product | **Already implemented** — `useInventory()` (`src/entities/inventory/model/queries.ts:105`), `InventoryPagePanel`. No new work; confirm regression only. |
| INV-02 | Manual stock adjustment with required reason, audit-logged | **Already implemented** — `src/features/adjust-inventory/`, `useMutationAdjustInventory` writes to `stock_movements`. No new work. |
| INV-03 | Physical count reconciliation | **Already implemented** — `src/features/physical-count/` (`usePhysicalCount.ts`, `PhysicalCountForm.tsx`). No new work. |
| INV-04 | Low-stock list from reorder point | **Already implemented** — `useInventoryAlerts()`, `LowStockBadge`, `useLowStockToast` in `src/pages/inventory/index.tsx`. No new work. |
| SUP-01 | Create/edit supplier record (name, contact, products supplied) | New `suppliers` + `supplier_products` tables; new `entities/supplier`, `features/manage-suppliers`; product-side multi-select added to existing `ProductForm.tsx`. See Architecture Patterns. |
| SUP-02 | Receive shipment atomically (product, qty, cost, expiry → stock+cost+expiry, no PO workflow) | New `receive_shipment` atomic RPC mirroring `process_direct_sale_atomic`; new `shipments` header table; reuses existing `stock_movements` ledger (`'delivery'` reason already defined) and `inventory.cost_price`/`inventory.expiry_date` (new columns). See Common Pitfalls #1 for the quick-add/inventory-row gap. |
| EXP-01 | Expiry date captured at receiving, one active date per product | `inventory.expiry_date` column (nullable DATE), overwritten by every receipt for that product — matches the existing "one row per product" shape `inventory` already has for `low_stock_threshold`. |
| EXP-02 | Near-expiry alert visible outside Reports (3 surfaces per D-06) | New `useNearExpiryAlerts()` query pattern-matched 1:1 against `useInventoryAlerts()`; new `NearExpiryBadge` pattern-matched against `LowStockBadge`; new Settings tab for the threshold (admin-only via existing settings RLS scoping). |

</phase_requirements>

## Summary

This phase is almost entirely **additive, in-repo pattern replication** — no new npm packages, no new architectural style. Four of the eight requirements (INV-01..04) are already built and just need confirmation they still pass; the phase's real net-new surface is: (1) a `suppliers`/`supplier_products` schema + CRUD UI, (2) one new atomic RPC (`receive_shipment`) that mirrors the already-proven `process_direct_sale_atomic` pattern exactly (row-lock, derive-server-side, single commit, `record_audit` call), and (3) an expiry-tracking column + alert query/badge/settings-tab trio that is a near-exact structural copy of the existing low-stock alert trio (`useInventoryAlerts` / `LowStockBadge` / `useLowStockToast`).

The most important non-obvious finding: **no code anywhere in this repo auto-creates an `inventory` row when a `products` row is inserted** (no trigger, no client-side upsert — confirmed by reading `20260414000008_triggers.sql` in full and grepping for `inventory`+`insert`). Today, `ProductForm`'s create path (`useMutationCreateProduct`) leaves a product with zero inventory row until some other process creates one. This is a real, pre-existing gap that D-03 (inline quick-add during receiving) will collide with head-on: the `receive_shipment` RPC **must** `INSERT ... ON CONFLICT (product_id) DO UPDATE` into `inventory`, never assume the row exists.

The second key finding: `StockMovementReasonSchema` already contains `'delivery'` as a valid reason (`src/shared/lib/domain.ts:115-127`) and `stock_movements` already has polymorphic `ref_type`/`ref_id` columns (`src/shared/lib/domain.ts:590-604`) — the receiving ledger trail needs **zero new columns** on `stock_movements`; it only needs a lightweight `shipments` header table (supplier_id, received_by, received_at — no status column, so it can never become the PO status machine SUP-02 explicitly forbids) referenced via `ref_type='shipment'`.

**Primary recommendation:** Add `cost_price NUMERIC(10,2)` and `expiry_date DATE` directly to the existing `inventory` table (1:1 with `products`, already the "one row per product" state table — matches D-05's "one active expiry date" requirement exactly, no new per-product state table needed); add `suppliers`, `supplier_products`, `shipments` tables; write one `receive_shipment(p_staff_id, p_supplier_id, p_items jsonb, ...)` SECURITY DEFINER RPC modeled line-for-line on `process_direct_sale_atomic`'s row-locking and `record_audit` conventions, exposed through a new `receive-shipment` Supabase Edge Function (client cannot call the RPC directly — it will be granted to `service_role` only, exactly like every other atomic RPC in this codebase).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Supplier CRUD (SUP-01) | API / Backend (Postgres RLS + `suppliers` table) | Browser/Client (`entities/supplier`, `features/manage-suppliers` forms) | Simple table-backed CRUD, same shape as `categories`/`modifiers` — no server business logic beyond RLS. |
| Supplier↔Product linking (D-01/D-02) | API / Backend (`supplier_products` join table + RLS) | Browser/Client (two synced multi-select UIs) | Relationship lives in one DB table; both UIs are thin views over the same join, like `product_modifiers`. |
| Atomic shipment receiving (SUP-02) | API / Backend (`receive_shipment` Postgres RPC, SECURITY DEFINER, `service_role`-only) | Browser/Client (line-item entry form) + Edge Function (auth + validation wrapper) | Multi-effect (`inventory` + `stock_movements` + `shipments` + optional new `products`), must-not-partially-fail — same tier assignment as `process_direct_sale_atomic`. |
| Quick-add product mid-receiving (D-03) | API / Backend (reuses `products` INSERT + RLS) | Browser/Client (`entities/product` `useMutationCreateProduct`, already exists) | No new backend capability — existing product-creation path, invoked from a new UI entry point. |
| Cost price / expiry storage (D-04/D-05/EXP-01) | Database / Storage (`inventory.cost_price`, `inventory.expiry_date` columns) | — | State, not logic — belongs on the existing per-product `inventory` row, mirroring `low_stock_threshold`. |
| Near-expiry alert computation (EXP-02) | API / Backend (Postgres query filtering `inventory.expiry_date` against a threshold) | Browser/Client (`useNearExpiryAlerts`, badge/toast/checkout-signal rendering) | Same tier split as the existing low-stock alert (`useInventoryAlerts` does the threshold comparison client-side over a narrow server SELECT; keep the pattern for consistency, not because it's the only valid design). |
| Near-expiry threshold config (D-07) | Database / Storage (`settings` key-value row) | Browser/Client (new admin-only Settings tab) | Existing generic `settings` table + existing RLS admin-scoping (new key falls outside the manager allowlist automatically — see Architecture Patterns). |

## Standard Stack

No new dependencies. This phase reuses the exact installed stack documented in `CLAUDE.md`'s Paperclip Sprint Team Standards table `[VERIFIED: package.json — cross-checked against CLAUDE.md, which is itself derived from package.json/tsconfig.json]`: React 19.1.0, TypeScript 5.8.3 (strict, `exactOptionalPropertyTypes: true`), Tauri 2, Vite 7, TanStack Query v5, Zustand v5, Zod v4, Tailwind v3 + shadcn/ui, Vitest v4, Playwright v1.59.

### Core (all already installed — no `npm install` needed)
| Library | Purpose in this phase |
|---------|------------------------|
| Zod v4 | New `Supplier`/`SupplierProduct`/`Shipment` schemas in `domain.ts`; extend `InventorySchema`/`ProductSchema` |
| TanStack Query v5 | `useSuppliers`, `useMutationCreateSupplier`, `useNearExpiryAlerts`, `useMutationReceiveShipment` |
| Zustand v5 | Not needed for new entities unless a Realtime bridge is added for `suppliers` (low-value; suppliers change rarely — skip a store, use TanStack Query cache directly, matching `entities/product`'s split of server-state-only vs. `useProductStore` for derived UI state) |
| date-fns v4.1.0 `[VERIFIED: package.json:63]` | Already installed; usable for "is this date within N days" comparisons if the near-expiry filter needs client-side date math beyond a raw SQL `<= NOW() + interval` filter |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<input type="date">` for expiry-date entry | `react-day-picker` (already installed, powers `DateRangePicker.tsx`) | A single date field doesn't need a range-picker or popover calendar — native date input is the ladder-correct choice (rung 4: native platform feature) and is what every other single-date field pattern in this codebase would use if one existed; `DateRangePicker` stays reserved for report date-range filtering, its only current use. |
| New `product_costs`/`receiving_history` table for cost/expiry state | `inventory.cost_price`/`inventory.expiry_date` columns | A new table is unnecessary: `inventory` is already the 1:1-per-product state row (see `low_stock_threshold`), and D-05 explicitly wants only the single active value, not history — history is already covered by `stock_movements` rows. |

**Installation:** None. No `npm install` step for this phase.

## Package Legitimacy Audit

**Not applicable — zero new external packages are introduced by this phase.** Every capability (date input, multi-select checkboxes, dialog forms, Zod validation, atomic RPC + Edge Function pairing) is built from libraries already installed and used elsewhere in this codebase (see Standard Stack). No `npm view`/registry check was needed.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  /suppliers (new page)      │        │  Product Form (existing,      │
│  SupplierForm (create/edit) │        │  extended with supplier       │
│  ↳ multi-select: products   │◄──────►│  multi-select, D-02)          │
└──────────────┬───────────────┘        └───────────────┬───────────────┘
               │  writes                                 │  writes
               ▼                                          ▼
      ┌─────────────────────────────────────────────────────────┐
      │  supplier_products (join table, RLS: manage_products)   │
      └─────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│  Receiving screen (new): line-item table                   │
│  [product select | qty | cost_price | expiry_date] × N     │
│  + inline "quick add product" (D-03, reuses                │
│    useMutationCreateProduct)                                │
└───────────────────────────┬───────────────────────────────┘
                             │  confirm (one click)
                             ▼
                 ┌───────────────────────────┐
                 │  Edge Function             │
                 │  receive-shipment          │   Zod-validates body,
                 │  (Deno, service-role key)  │   forwards to RPC
                 └─────────────┬─────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────────┐
        │  receive_shipment() Postgres RPC (SECURITY DEFINER) │
        │  FOR UPDATE row-lock each product's inventory row   │
        │  → upsert inventory (qty +=, cost_price=, expiry=)  │
        │  → insert shipments header row (supplier, staff)    │
        │  → insert stock_movements rows (reason='delivery',  │
        │       ref_type='shipment', ref_id=shipment.id)      │
        │  → record_audit('shipment.receive', ...)            │
        │  ALL-OR-NOTHING (single Postgres transaction)        │
        └─────────────┬─────────────┬──────────────┬──────────┘
                       ▼             ▼              ▼
              inventory table  stock_movements  shipments (new)
                (cost_price,      (ledger,        (header:
                 expiry_date       reason=          supplier_id,
                 columns)          'delivery')      received_by,
                                                     received_at)
                       │
                       ▼ (Realtime postgres_changes on inventory)
        ┌───────────────────────────────────────────────────┐
        │  useInventoryRealtimeBridge (existing) invalidates  │
        │  inventory + alerts queries automatically            │
        └─────────────┬─────────────────────┬─────────────────┘
                       ▼                     ▼
          useNearExpiryAlerts()      useInventoryAlerts()  (existing,
          (new, mirrors alerts       untouched)
          query 1:1)
                       │
      ┌────────────────┼─────────────────────┐
      ▼                ▼                     ▼
  Home dashboard   Inventory page       POS checkout
  tile/badge        near-expiry tab      cart signal
  (new)             (new, next to        (new — CartItem
                     low-stock tab)       badge or add-to-
                                          cart toast)
```

### Recommended Project Structure
```
src/
├── entities/
│   └── supplier/
│       ├── model/
│       │   ├── types.ts        # re-export Supplier/SupplierProduct/Shipment from domain.ts (matches entities/inventory/types.ts pattern)
│       │   ├── queries.ts       # useSuppliers, useSupplierProducts, useMutationCreateSupplier, useMutationUpdateSupplier
│       │   └── store.ts         # only if a Zustand store is actually needed — likely skip (YAGNI); see Standard Stack note
│       ├── ui/
│       │   └── SupplierRow.tsx  # list-row display component, mirrors entities/inventory/ui/InventoryRow.tsx
│       └── index.ts
├── entities/inventory/
│   ├── model/queries.ts         # ADD: useNearExpiryAlerts (mirrors useInventoryAlerts, lines 166-231)
│   └── ui/NearExpiryBadge.tsx   # NEW, mirrors LowStockBadge.tsx exactly
├── features/
│   ├── manage-suppliers/
│   │   ├── ui/SupplierForm.tsx  # mirrors features/manage-products/ui/CategoryForm.tsx shape
│   │   └── index.ts
│   └── receive-shipment/
│       ├── model/useReceiveShipment.ts   # 1 mutation hook, mirrors features/checkout-sale's edge-function-call pattern
│       └── ui/ReceiveShipmentForm.tsx    # line-item table + quick-add sub-form
├── widgets/
│   └── SupplierListPanel/       # if /suppliers gets its own page, mirrors widgets/InventoryPagePanel
├── pages/
│   └── suppliers/index.tsx      # new route, gated by 'manage_products' (reuse, see Common Pitfalls #3)
supabase/
├── migrations/
│   └── <timestamp>_suppliers_receiving_expiry.sql   # tables + RPC in one migration, DOWN script included (Phase 8+ convention)
└── functions/
    └── receive-shipment/index.ts   # mirrors supabase/functions/process-direct-sale/index.ts structure
```

### Pattern 1: Atomic multi-effect RPC (mirror `process_direct_sale_atomic`)

**What:** A single `SECURITY DEFINER` Postgres function that validates inputs, locks rows with `FOR UPDATE`, performs every write inside one implicit transaction (function body), and returns a `jsonb` envelope `{ok, ...}` or `{ok: false, code, message}` on failure — never partial writes.
**When to use:** SUP-02 explicitly requires this ("stock quantity, cost price, and expiry update atomically in one step").
**Example (verified structure, not literal receiving code — adapt from the real file):**
```sql
-- Source: supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql
CREATE OR REPLACE FUNCTION public.receive_shipment(
  p_staff_id uuid, p_supplier_id uuid, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shipment_id uuid; v_elem jsonb; v_product_id uuid;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS', 'message', 'At least one item is required');
  END IF;

  INSERT INTO shipments (supplier_id, received_by) VALUES (p_supplier_id, p_staff_id)
  RETURNING id INTO v_shipment_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_elem->>'product_id')::uuid;
    PERFORM 1 FROM products WHERE id = v_product_id AND is_active = true FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'Product not in catalog');
    END IF;

    INSERT INTO inventory (product_id, quantity_on_hand, cost_price, expiry_date)
    VALUES (v_product_id, (v_elem->>'quantity')::int, (v_elem->>'cost_price')::numeric, NULLIF(v_elem->>'expiry_date','')::date)
    ON CONFLICT (product_id) DO UPDATE SET
      quantity_on_hand = inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
      cost_price = EXCLUDED.cost_price,
      expiry_date = EXCLUDED.expiry_date;

    INSERT INTO stock_movements (product_id, quantity_delta, reason, staff_id, ref_type, ref_id)
    VALUES (v_product_id, (v_elem->>'quantity')::int, 'delivery', p_staff_id, 'shipment', v_shipment_id);
  END LOOP;

  PERFORM record_audit('shipment.receive', 'shipment', v_shipment_id, NULL,
    jsonb_build_object('supplierId', p_supplier_id, 'itemCount', jsonb_array_length(p_items)));

  RETURN jsonb_build_object('ok', true, 'shipmentId', v_shipment_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'RECEIVE_SHIPMENT_FAILED', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_shipment(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_shipment(uuid, uuid, jsonb) TO service_role;
```
This skeleton is `[ASSUMED]` (my own design, not a literal file I read) built from verified conventions: the `record_audit` call signature is `[VERIFIED: supabase/migrations/20260511000001_audit_logs_table.sql:73-79]` — quoted: `record_audit( p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL, p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL, p_source text DEFAULT 'rpc' )`; the `REVOKE ALL ... GRANT ... TO service_role` line is `[VERIFIED: supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:205-206]`; `'delivery'` as a valid `stock_movements.reason` value is `[VERIFIED: src/shared/lib/domain.ts:115-127]` (quoted verbatim in Common Pitfalls below).

### Pattern 2: Edge Function wrapper for a `service_role`-only RPC

**What:** Every atomic RPC in this codebase is granted `EXECUTE` to `service_role` only (never `authenticated`) — the client cannot call it via `supabase.rpc()` directly. A thin Deno Edge Function validates the request body with Zod, authenticates the caller's JWT, then calls the RPC with the service-role key.
**When to use:** Always, for any new atomic multi-effect RPC — confirmed pattern for `process-direct-sale`, `process-payment`, `process-split-payment`, `void-order`.
**Example:**
```typescript
// Source: src/shared/lib/edge-function-contracts.ts:381-420 (callProcessDirectSale — pattern to replicate as callReceiveShipment)
export async function callReceiveShipment(
  request: ReceiveShipmentRequest
): Promise<Result<ReceiveShipmentSuccess, AppError>> {
  const validatedRequest = ReceiveShipmentRequestSchema.parse(request);
  const accessToken = getCachedAccessToken();
  if (!accessToken) return err({ code: 'AUTH_REQUIRED', message: 'Not authenticated' });
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receive-shipment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(validatedRequest),
    }
  );
  // ... parse envelope with a ReceiveShipmentEnvelopeSchema, same shape as ProcessDirectSaleEnvelopeSchema
}
```

### Pattern 3: Low-stock-alert trio, replicated for near-expiry

**What:** A three-piece pattern — (a) a query that joins the state table and filters against a threshold, (b) a `Badge`-rendering component that returns `null` when the list is empty, (c) a `useXToast()` hook that diffs the previous alert-ID set against the current one to fire a Sonner toast only on *new* entries.
**When to use:** EXP-02's three alert surfaces (D-06) are a structural copy of this exact trio, not a new design.
**Example — the query to mirror:**
```typescript
// Source: src/entities/inventory/model/queries.ts:166-231 (useInventoryAlerts, verbatim structure)
export function useNearExpiryAlerts() {
  const query = useQuery({
    queryKey: inventoryKeys.nearExpiry(), // new key, mirrors inventoryKeys.alerts()
    queryFn: async (): Promise<Result<NearExpiryAlert[]>> => {
      // fetch the configured threshold from settings (key='near_expiry', default 14)
      // SELECT inventory joined with products WHERE expiry_date IS NOT NULL
      //   AND expiry_date <= (CURRENT_DATE + thresholdDays)
      // map rows into NearExpiryAlertSchema.parse(...)
    },
    staleTime: 30 * 1000, // matches useInventoryAlerts' staleTime
  });
  // ... identical Result-unwrapping return shape as useInventoryAlerts (lines 223-231)
}
```
The badge component to mirror verbatim (only the icon/copy/query differ):
```tsx
// Source: src/entities/inventory/ui/LowStockBadge.tsx (full file, 21 lines)
export function LowStockBadge() {
  const { t } = useTranslation('entities');
  const { data: alerts, isLoading } = useInventoryAlerts();
  if (isLoading || !alerts || alerts.length === 0) return null;
  return (
    <Badge variant="destructive" className="ml-3 tabular-nums" data-testid="low-stock-badge">
      {t('lowStockBadge.count', { count: alerts.length })}
    </Badge>
  );
}
```

### Pattern 4: Dynamic RBAC via `role_permissions`, not hardcoded role checks

**What:** Every RLS write policy in this codebase checks `EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = '<action>')`, not `get_user_role() = 'manager'` directly — the RBAC matrix is admin-editable at `/rbac` (Phase 13).
**When to use:** Any new table's write policies (`suppliers`, `supplier_products`, `shipments`).
**Example:**
```sql
-- Source: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:435-437 (products_insert_manager_admin, verbatim)
CREATE POLICY "products_insert_manager_admin" ON products
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
**Recommendation:** reuse the existing `'manage_products'` action for `suppliers`/`supplier_products` RLS (supplier CRUD is product-catalog-adjacent, and `manage_products` is already manager+); reuse `'adjust_inventory'` for `shipments`/receiving (stock-affecting, matches physical-count/adjust-inventory gating). Both actions already exist in `STAFF_ACTIONS` `[VERIFIED: src/shared/lib/rbac.ts:13-33]` and are both granted to `manager`+`admin` identically `[VERIFIED: src/shared/lib/rbac.ts:46-57]` — **no new RBAC action, no `rbac.ts` edit, no new `role_permissions` seed row is needed.** This is the ladder-correct choice over inventing `'manage_suppliers'`.

### Pattern 5: Native multi-select via checkbox list (no new component)

**What:** The existing modifier multi-select in `ProductForm.tsx` (checkbox list inside a `ScrollArea`, toggled via a `toggleX(id)` helper) is the exact UI shape D-02 needs for "Supplier form: multi-select products" and "Product form: multi-select suppliers."
**Example:**
```tsx
// Source: src/features/manage-products/ui/ProductForm.tsx:348-379 (verbatim structure to replicate for supplier↔product)
<FormField label={t('...')} error={fieldErrors.modifiers ?? ''}>
  <ScrollArea className="max-h-40 rounded-md border p-2">
    <ul className="space-y-2 pr-2">
      {items.map(m => (
        <li key={m.id} className="flex items-center gap-2">
          <Checkbox id={`mod-${m.id}`} checked={selectedIds.includes(m.id)}
            onCheckedChange={() => toggleSelection(m.id)} disabled={submitting} />
          <label htmlFor={`mod-${m.id}`} className="text-sm">{m.name}</label>
        </li>
      ))}
    </ul>
  </ScrollArea>
</FormField>
```

### Anti-Patterns to Avoid
- **Client-side loop of per-line-item `update`/`insert` calls for receiving:** D-08 explicitly forbids this (mirrors the `process_direct_sale_atomic` rationale — a partial-failure mid-loop leaves stock/cost/expiry inconsistent). Use the single RPC.
- **Calling a new atomic RPC directly from the client via `supabase.rpc()`:** every existing atomic RPC in this codebase is `REVOKE ALL ... GRANT ... TO service_role` — client calls will fail with a permission error. Always go through an Edge Function.
- **Assuming an `inventory` row exists for every `products` row:** it doesn't (see Summary + Common Pitfalls #1) — any UPSERT-shaped write into `inventory` must use `ON CONFLICT (product_id) DO UPDATE`, never a bare `UPDATE`.
- **Hardcoding a settings key string outside `SettingsKeySchema`:** the Zod enum in `domain.ts:690-698` is the single source of truth for valid settings keys; a new `near_expiry` key must be added there or `SettingsKeySchema.parse()` rejects it client-side even though the SQL `settings.key` column has no matching CHECK constraint (`[VERIFIED: supabase/migrations/20260419000001_settings_and_backups.sql:5-11]` — quoted: `key VARCHAR(100) UNIQUE NOT NULL` — no enum CHECK, so the DB will silently accept a typo'd key that the Zod schema would have caught).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-row commit with rollback-on-failure | A client-side "try each row, roll back manually on error" helper | Postgres function body (implicit transaction) + `EXCEPTION WHEN OTHERS` | Postgres transactions are free correctness; a client-side rollback simulation can never truly undo a partially-applied Realtime-visible write. |
| Row-level locking against concurrent receiving of the same product | Optimistic client-side re-fetch-and-compare | `SELECT ... FOR UPDATE` inside the RPC (exact pattern already in `process_direct_sale_atomic:100-102`) | Two terminals confirming a shipment for the same product simultaneously would otherwise race on `quantity_on_hand +=`. |
| Alert threshold config | A hardcoded `14` constant sprinkled across 3 UI surfaces | One `settings` row (`key='near_expiry'`) read by the one `useNearExpiryAlerts()` query, consumed by all 3 surfaces | D-07 requires it configurable; a single source avoids the 3 surfaces drifting out of sync. |
| Date math for "is this within N days" | Manual millisecond arithmetic in the client | `date-fns` (already installed) for any client-side date comparison, or a raw SQL `expiry_date <= CURRENT_DATE + p_days` for the server-side filter (preferred — keeps the threshold check in the query that already does the join) | Avoids timezone/DST edge-case bugs a hand-rolled `Date.now() + days*86400000` computation would hit. |

**Key insight:** Nothing in this phase requires new infrastructure — the entire net-new surface is schema (3 tables + 2 columns) plus straight structural replication of two patterns (`process_direct_sale_atomic` and the low-stock-alert trio) that already exist, proven, and tested in this exact codebase.

## Common Pitfalls

### Pitfall 1: No `inventory` row auto-provisioned for a new `products` row
**What goes wrong:** A quick-added product (D-03) or any product created via the existing `ProductForm` has no `inventory` row until something creates one — `receive_shipment` writing a bare `UPDATE inventory SET ... WHERE product_id = X` would silently affect 0 rows and the shipment would appear to succeed while stock/cost/expiry are never actually recorded for that product.
**Why it happens:** Confirmed by reading the full trigger file `[VERIFIED: supabase/migrations/20260414000008_triggers.sql]` (95 lines, no `AFTER INSERT ON products` trigger exists) and grepping the entire `src/entities`+`src/features` tree for any client-side `.from('inventory').insert(...)` (zero matches).
**How to avoid:** `receive_shipment`'s inventory write must be `INSERT ... ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand = inventory.quantity_on_hand + EXCLUDED.quantity_on_hand, cost_price = EXCLUDED.cost_price, expiry_date = EXCLUDED.expiry_date`.
**Warning signs:** A shipment confirm returns success but the receiving line-item's product never shows updated stock on the Inventory page — check whether an `inventory` row existed for that `product_id` before assuming a Realtime bug.

### Pitfall 2: `stock_movements` isn't in `supabase.types.ts` yet — every file touching it needs the pre-regen cast
**What goes wrong:** TypeScript will fail to compile (`Property 'stock_movements' does not exist`) if a new query/mutation uses the typed `supabase.from('stock_movements')` client without the workaround.
**Why it happens:** Confirmed live in two files: `src/entities/inventory/model/queries.ts:1-24` and `src/features/physical-count/model/usePhysicalCount.ts:1-13`, both carry a `/* eslint-disable */` + `const db = supabase as any;` with an identical `TODO(S1-06)` comment saying this is "pending Plan 03" — i.e., **this phase is explicitly expected to be the one that regenerates `supabase.types.ts`.**
**How to avoid:** After applying the new migration to the local Supabase stack, run `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts` (per `CLAUDE.md`'s documented workflow) and remove the `db = supabase as any` casts in both files above, plus use properly-typed `Tables<'suppliers'>` etc. for the new tables from the start.
**Warning signs:** New `entities/supplier` code needing the same `/* eslint-disable */ const db = supabase as any` escape hatch is a signal the type regen step was skipped or run before the migration was applied.

### Pitfall 3: `pool_tables` is a dead settings-key entry in the manager RLS allowlist
**What goes wrong:** Copying the settings RLS "manager can write these keys" allowlist verbatim (`key IN ('billing', 'pool_tables')`, `[VERIFIED: supabase/migrations/20260419000001_settings_and_backups.sql:41-51]`) without noticing `pool_tables` is legacy (pool-table domain was stripped in Phase 1) could lead to assuming a `near_expiry` key needs a similar manager-allowlist addition when it explicitly should NOT (D-07 says admin-only).
**How to avoid:** Do not add `'near_expiry'` to the manager-scoped `key IN (...)` list in either the INSERT or UPDATE settings policy — leaving it out is what makes it admin-only automatically (any key not in that list falls through to the `get_user_role() = 'admin'` branch).
**Warning signs:** A manager account able to change the near-expiry threshold in Settings without the ManagerPin gate they'd hit for anything under `manage_settings` elsewhere.

### Pitfall 4: `SettingsKeySchema` enum drift between DB and Zod
**What goes wrong:** The SQL `settings.key` column has no CHECK constraint (any string is accepted at the DB layer); `SettingsKeySchema` in `domain.ts:690-698` is a closed Zod enum. Forgetting to add the new key there means every `SettingsSchema.parse()` call on a fetched `near_expiry` row throws at runtime, even though the INSERT succeeded.
**How to avoid:** Add `'near_expiry'` to `SettingsKeySchema` in the same commit as the migration, plus a `NearExpirySettingsSchema = z.object({ thresholdDays: z.number().int().min(1).max(365).default(14) })`, following the exact shape of `TipDistributionSettingsSchema` (`domain.ts:748-754`).

### Pitfall 5: Home dashboard has no existing badge-overlay slot
**What goes wrong:** CONTEXT.md's D-06 says the near-expiry Home tile "mirrors the existing `LowStockBadge` pattern" as if `LowStockBadge` is already rendered on Home — it is not. Confirmed by grepping every consumer of `LowStockBadge` `[VERIFIED: grep -rn "LowStockBadge" src]`: only `src/pages/inventory/index.tsx:6,68` renders it (the Inventory page toolbar). `HomeDashboard.tsx` (`src/widgets/HomeDashboard/ui/HomeDashboard.tsx`) is a plain icon-grid of `DashboardItem[]` tiles (verified full file, 183 lines) with no badge/count overlay mechanism on any tile today.
**How to avoid:** The planner should treat "Home dashboard tile/badge" as new UI, not a wire-up of an existing pattern — likely a small `Badge` positioned absolutely on the existing `/inventory` tile (similar to how the `Lock` icon is already absolutely positioned on gated tiles, `HomeDashboard.tsx:137-142`), reusing that same positioning technique rather than inventing a new one.
**Warning signs:** A plan step that says "wire up the existing Home badge" without a corresponding UI-construction task is a scope-estimation gap.

## Code Examples

### Extending `domain.ts` for the new entities (structural pattern to follow, not literal final code)
```typescript
// Source: src/shared/lib/domain.ts — pattern from CajaEntrySchema (lines 821-831) and
// TipDistributionSettingsSchema (lines 748-754), adapted
export const SupplierSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(150),
  contactName: z.string().max(120).nullable(),
  phone: z.string().max(30).nullable(),
  email: z.email().nullable(),
  address: z.string().max(300).nullable(),
  notes: z.string().max(500).nullable(),
  createdAt: TimestampSchema,
});
export const SupplierCreateSchema = SupplierSchema.omit({ id: true, createdAt: true });
export type Supplier = z.infer<typeof SupplierSchema>;
export type SupplierCreate = z.infer<typeof SupplierCreateSchema>;

// Extend existing InventorySchema (domain.ts:508-515) — do not create a parallel table:
export const InventorySchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  quantityOnHand: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  unit: z.string().min(1).max(20),
  costPrice: MoneySchema.nullable(),      // NEW (D-04)
  expiryDate: TimestampSchema.nullable(), // NEW (D-05/EXP-01)
  product: ProductSchema.optional(),
});
```

### `mapInventoryRow`-style extension (pre-type-regen cast pattern already used for `units_per_package`)
```typescript
// Source: src/entities/inventory/model/queries.ts:42-103 — the existing mapInventoryRow already
// has precedent for reading a column not yet in supabase.types.ts via a raw-record cast
// (see units_per_package handling, lines 46-50, 83-84) — same technique applies to cost_price/expiry_date
// until `npx supabase gen types typescript --local` is rerun after the migration lands.
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cost_price`/`expiry_date` should live on `inventory` (not a new table) | Summary, Standard Stack, Code Examples | Low — reversible at planning time, no code written yet; if the planner instead wants per-receipt history as first-class queryable state (not just via `stock_movements`), a new table would be a bigger structural change. |
| A2 | `receive_shipment`'s exact SQL body/signature | Architecture Patterns Pattern 1 | Medium — this is my own draft, not read from any file (no such RPC exists yet). The planner must design the final signature/columns; the *pattern* (row-lock, upsert-with-ON-CONFLICT, single transaction, `record_audit` call, `service_role`-only grant) is grounded in `[VERIFIED]` sources, but the literal SQL is illustrative. |
| A3 | Reuse `manage_products` (suppliers) and `adjust_inventory` (receiving) RBAC actions instead of a new `manage_suppliers` action | Architecture Patterns Pattern 4 | Low — both actions already exist and are manager+admin-scoped identically; if the user wants finer-grained supplier-specific permissions later, adding a new action is a small additive migration, not a breaking change. |
| A4 | Near-expiry Home-dashboard surface needs new badge-overlay UI (not a wire-up) | Common Pitfalls #5 | Medium — if this assumption is wrong and there's a badge mechanism I missed, the plan would over-scope a UI task; verified via full-file read of `HomeDashboard.tsx` and exhaustive grep, so confidence is high this gap is real. |
| A5 | Settings key `'near_expiry'` naming and `NearExpirySettingsSchema` shape | Common Pitfalls #4, Code Examples | Low — naming bikeshed only; any valid enum string + Zod shape works as long as it's added consistently. |

## Open Questions

1. **Should `receive_shipment` accept an idempotency key like `process_direct_sale_atomic` does?**
   - What we know: Every payment-adjacent atomic RPC in this codebase (`process_direct_sale_atomic`, `process_payment_atomic`, `process_split_payment_atomic`) takes an idempotency key to guard against double-submit/retry.
   - What's unclear: Receiving is a manager-initiated, infrequent, non-networked-retry-prone action (unlike a customer-facing payment where a network blip triggers a client retry) — the cost/benefit of adding idempotency-key plumbing is less obviously worth it here.
   - Recommendation: Planner's discretion; if added, it's a cheap, well-proven addition (same `p_idempotency_key text` param + a `UNIQUE` constraint or lookup against `shipments`), but it is not required by any locked decision (D-08 only requires atomicity, not idempotency).

2. **Where exactly does D-06's POS checkout near-expiry signal render — `CartItem` badge or a toast on add?**
   - What we know: `CartItem.tsx` (`src/entities/tab/ui/CartItem.tsx`) already renders per-modifier `Badge`s inline (lines 45-54) — a near-expiry `Badge` could slot in the same way. `useLowStockToast` (`src/pages/inventory/index.tsx:16-47`) is the toast-on-new-alert pattern.
   - What's unclear: D-06 leaves this to "Claude's Discretion" explicitly, and it depends on whether `CartItemType.product` (currently `ProductSchema`, no expiry field) gets extended to carry expiry, or the cart component looks up `inventory` separately by `productId`.
   - Recommendation: A `CartItem` badge (visible per-line, no timing/dismissal logic needed) is simpler than a toast-on-add (which needs new logic in `addItem`/`useScanBarcodeToCart`) — ladder-favor the badge unless the planner has a UX reason to prefer an interruptive toast.

## Environment Availability

No new external dependency. The local Supabase Docker stack this repo already runs against was confirmed working as of Phase 2 (`STATE.md`: "RESOLVED (02-06/02-verify): Docker Desktop was started, migration ... applied directly against the live local Supabase stack"). The same `docker exec psql` + `supabase_migrations.schema_migrations` registration workflow applies to this phase's new migration.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No new surface | Existing Supabase Auth / PIN login unchanged |
| V3 Session Management | No new surface | Existing shift/Caja session checks (receiving does not require an open Caja session — it is not a sale — but should require the caller's own open shift, matching `adjust-inventory`'s existing pattern of trusting `staffId` from the authenticated session) |
| V4 Access Control | Yes | Reuse dynamic `role_permissions` RLS pattern (`manage_products`/`adjust_inventory`) for all 3 new tables — see Architecture Patterns Pattern 4 |
| V5 Input Validation | Yes | Zod schemas client-side (`SupplierCreateSchema`, receiving line-item schema) + Zod re-validation inside the Edge Function body (Deno `zod` import, matching `process-direct-sale/index.ts`'s `BodySchema`) + Postgres-side `CHECK` constraints (e.g. `cost_price >= 0`, matching `base_price_positive` on `products`) |
| V6 Cryptography | No new surface | No secrets/crypto introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Client-supplied `cost_price`/`quantity` trusted without server-side bound checks | Tampering | Postgres `CHECK` constraints (`quantity > 0`, `cost_price >= 0`) on `inventory`/`shipments`-adjacent inserts, same as `products`' existing `base_price_positive` constraint — do not rely on client Zod validation alone (same lesson as `process_direct_sale_atomic`'s CR-01 fix, which stopped trusting client-supplied prices entirely) |
| Direct RPC call bypassing the Edge Function's auth/validation layer | Elevation of Privilege | `REVOKE ALL ... GRANT EXECUTE ... TO service_role` on `receive_shipment`, exactly like every existing atomic RPC — the anon/authenticated roles must never get `EXECUTE` |
| A manager-role account writing the admin-only `near_expiry` settings key by omission from the RLS allowlist rather than explicit denial | Elevation of Privilege | Explicit awareness (Common Pitfalls #3) — do not add `'near_expiry'` to the `key IN ('billing', 'pool_tables')` manager allowlist; verify with a negative-path E2E test that a manager PATCH to that settings key is rejected by RLS |

## Sources

### Primary (HIGH confidence — read this session)
- `src/shared/lib/domain.ts` (full file, 1446 lines) — schema conventions, `StockMovementReasonSchema`, `SettingsKeySchema`, `TipDistributionSettingsSchema`
- `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` (full file) — atomic RPC pattern to mirror
- `supabase/migrations/20260511000001_audit_logs_table.sql` (full file) — `record_audit` signature
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (lines 255-450) — `role_permissions`-backed RLS pattern
- `supabase/migrations/20260419000001_settings_and_backups.sql` (full file) — `settings` table + manager/admin scoped RLS
- `supabase/migrations/20260414000003_products_and_categories.sql`, `20260414000007_inventory.sql`, `20260414000008_triggers.sql` (full files) — current `products`/`inventory` schema, confirmed no auto-provisioning trigger
- `src/entities/inventory/model/queries.ts`, `store.ts`, `ui/LowStockBadge.tsx` (full files) — low-stock alert trio to replicate
- `src/features/physical-count/model/usePhysicalCount.ts`, `ui/PhysicalCountForm.tsx` — existing multi-line-item mutation + dialog pattern
- `src/features/manage-products/ui/ProductForm.tsx` (full file) — multi-select checkbox pattern, product-creation form conventions
- `src/entities/product/model/queries.ts` (`useMutationCreateProduct`, lines 404-466) — reusable quick-add product creation path
- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (full file) — confirmed no existing badge-overlay slot
- `src/shared/lib/rbac.ts`, `src/app/router.tsx`, `src/widgets/SettingsTabsPanel/index.tsx` (full files) — RBAC action set, routing conventions, settings-tab gating pattern
- `src/shared/lib/edge-function-contracts.ts` (lines 360-420), `supabase/functions/process-direct-sale/index.ts` — Edge Function wrapper pattern
- `.planning/phases/03-supplier-receiving-expiry-tracking/03-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` — phase scope, decisions, project state

### Secondary / Tertiary
None — no WebSearch or external documentation lookup was performed; this phase's entire technical surface is answerable from in-repo verified sources, and no new library was introduced that would require external docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all reused libraries confirmed installed via `package.json`/CLAUDE.md
- Architecture: HIGH — every pattern replicated is a live, working file in this exact codebase, not an external best-practice
- Pitfalls: HIGH — both major pitfalls (#1 missing inventory-row provisioning, #5 no Home badge slot) were confirmed by reading full files / exhaustive grep, not inferred

**Research date:** 2026-08-14
**Valid until:** No hard expiry — this research is grounded in the current state of this specific repo, not external library versions; re-verify only if the codebase changes materially before planning starts (e.g. Phase 2 gap-closure work touching `inventory`/`stock_movements` schema).
