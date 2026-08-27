# Phase 16: Purchase Orders & Reordering - Research

**Researched:** 2026-08-23
**Domain:** Supabase (Postgres RLS + Edge Function + SECURITY DEFINER RPC) purchase-order schema/lifecycle, layered onto an existing React 19 + FSD supermarket POS
**Confidence:** HIGH — grounded directly in this repo's own migrations, RPC source, RLS policies, and prior milestone research (`.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `FEATURES.md`, dated 2026-08-19), not generic domain knowledge. No new external packages are involved, so there is no package-legitimacy surface for this phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**PO access control**
- **D-01:** Reuse the existing `manage_products` RBAC action to gate all PO functionality (create, edit, receive) — manager+admin already have it, cashier doesn't, and it exactly matches PO-01..03's "manager+" requirement. No new `manage_purchase_orders` action.
- **D-02:** The whole PO feature (including read/list/detail view) is manager+ only — cashiers cannot see purchase orders at all, matching how the existing Suppliers page already works (no cashier access). No read/write RBAC split.

**Creation & lifecycle implementation path**
- **D-03:** PO creation and status transitions (draft → submitted, edits) use plain RLS-gated inserts/updates on `purchase_orders`/`purchase_order_items` — **not** a new RPC/Edge Function. Unlike `receive_shipment`, PO creation has no cross-table atomicity requirement (stock/cost/expiry don't move at create time), so a manager-gated RLS policy is sufficient.
- **D-04:** Receiving a PO in full still goes through `receive_shipment`, extended to accept an optional `po_id` (or similar) parameter. **`receive_shipment` itself sets `purchase_orders.status = 'received'`/closed** when a PO reference is passed — not a separate client-side update after the RPC call — keeping the stock mutation and PO status change atomic in one RPC, avoiding a window where stock moved but the PO still shows open. — **Reversibility:** costly — **rationale:** changes the `receive_shipment` RPC's signature and internal transaction; once other callers (PO flow, receiving UI) depend on the new atomic-close behavior, reverting to a two-step client update requires touching every caller and re-auditing the non-atomic window.

**Line-item cost default**
- **D-05:** A PO line item's cost defaults to the product's current `inventory.costPrice` (the same weighted-average-cost field `receive_shipment` already maintains) when a manager adds a product to a PO. Requires no schema change — read-only lookup at add-line time, manager can still edit it.
- **D-06:** When a product has never been received (`costPrice` is null), the line defaults to 0 and the manager fills it in manually — same fallback behavior `ReceiveShipmentForm` already uses today. No blocking validation forcing a cost before the line saves.

**Draft reorder quantities (PO-02 auto-draft)**
- **D-07 (Claude's discretion, confirmed default):** Suggested quantity per line = `lowStockThreshold − quantityOnHand`, floored at 0 (top up to the reorder point). No arbitrary multiplier/buffer — uses only fields that already exist on every product, no dependency on missing pack-size data.
- **D-08:** For products where `products.unitsPerPackage` is set (case/box products from the open-unit feature), round the raw top-up quantity **up** to the nearest whole multiple of `unitsPerPackage` — you're ordering cases from a supplier, not loose units. Falls back to the raw D-07 quantity when `unitsPerPackage` is null (the common case — most products have no case/box link; per research PITFALLS.md Pitfall 4, `supplier_products` itself carries no pack-size data at all).

### Claude's Discretion
- Exact reorder-quantity formula (D-07) and its case-rounding behavior (D-08) — user explicitly deferred to "You decide"; the values above are the concrete defaults to implement, not open questions for the planner to re-raise.
- PO status enum values beyond draft/received-closed (e.g. whether an intermediate "submitted"/"ordered" status exists between draft and received) were not discussed — not raised as a gray area by the user; planner should pick the minimum states PO-01..03's success criteria require (draft → received/closed is the only lifecycle the requirements actually name).
- UI page placement (new top-level route vs. a tab/panel on the existing Suppliers page) was not discussed — Phase 16 carries `UI hint: yes` in ROADMAP.md, so route this through `/gsd-ui-phase 16` before/alongside planning rather than deciding it here.

### Deferred Ideas (OUT OF SCOPE)
None raised — discussion stayed within the four selected implementation-decision areas (PO access control, creation path, cost default, draft reorder quantities). No scope-creep redirects were needed.

Also out of scope per REQUIREMENTS.md/PROJECT.md: partial/backorder receiving, auto-PO generation/demand forecasting, multi-level approval workflow, multi-supplier price comparison, EDI/API integration to suppliers.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PO-01 | A manager+ can create a purchase order against a supplier with line items (product, quantity, cost), reusing the existing `suppliers`/`supplier_products` entities for selection and default cost. | `entities/supplier` query hooks (`useSuppliers`, `useSupplierProductIds`) confirmed reusable as-is [VERIFIED: src/entities/supplier/model/queries.ts:81-94]; D-05/D-06 cost-default source (`inventory.costPrice`) confirmed to exist [VERIFIED: src/shared/lib/domain.ts:513-522]; plain-RLS CRUD pattern confirmed via `manage-suppliers`/`SupplierForm.tsx` and `suppliers`/`supplier_products` RLS policies [VERIFIED: supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:41-53]. |
| PO-02 | A manager+ can generate a draft purchase order pre-filled from the current low-stock/reorder-point list for a chosen supplier, in one action, then edit line items before saving. | `lowStockThreshold`/`quantityOnHand` fields confirmed on `InventorySchema` [VERIFIED: src/shared/lib/domain.ts:513-522]; existing `lowStockAlerts` derivation logic in `useInventoryStore.refreshAlerts` is store-wide, not supplier-scoped — new query needed joining `inventory` ⋈ `supplier_products` (see Common Pitfalls); `unitsPerPackage` field confirmed for D-08 case rounding [VERIFIED: src/shared/lib/domain.ts:247]. |
| PO-03 | A manager+ can receive a purchase order in full, updating stock/cost/expiry via the existing `receive_shipment` RPC (extended with an optional PO reference) rather than a duplicate receiving code path, and marking the PO received/closed. | Full 4-layer call chain for `receive_shipment` read and quoted verbatim (SQL RPC → Edge Function → contract → UI form) — see Code Examples. Current RPC signature confirmed: `receive_shipment(p_staff_id uuid, p_supplier_id uuid, p_items jsonb)` [VERIFIED: supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql:5]. `stock_movements.reason` CHECK constraint confirmed to already include `'delivery'` — no new reason value needed [VERIFIED: supabase/migrations/20260424000001_stock_movements.sql:26-40]. |
</phase_requirements>

## Summary

This phase adds exactly two new tables (`purchase_orders`, `purchase_order_items`) and one additive parameter on an existing, twice-hardened RPC (`receive_shipment`). Nothing else in the stack changes: no new npm package, no new architectural layer, no new RBAC action. The codebase already contains a complete, proven template for every piece of this phase — the `suppliers`/`supplier_products`/`shipments` schema-and-RLS shape (migration `20260817000001`), the Edge-Function-→-SECURITY-DEFINER-RPC mutation pattern (`receive_shipment`, `process_direct_sale_atomic`), and the `ReceiveShipmentForm`/`useReceiveShipment` UI pattern to mirror for PO line items. A prior milestone-research pass (`.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, dated 2026-08-19 — read before this phase's user discussion) already anticipated this exact phase and is directly reusable; this research verifies its claims against the current code and reconciles it with the CONTEXT.md decisions that were locked afterward.

One reconciliation is required: `ARCHITECTURE.md` (2026-08-19, pre-discussion) sketches a **new wrapper RPC** `receive_po_shipment(p_staff_id, p_po_id, p_items)` that internally calls `receive_shipment(...)` and then updates `purchase_orders.status`. CONTEXT.md's locked **D-04** (2026-08-23, post-discussion, authoritative) instead requires **extending `receive_shipment` itself** with an optional `p_po_id` parameter, doing the `purchase_orders.status = 'received'` update inside the same function body/transaction — no second RPC. Both approaches satisfy Pitfall 5 ("don't duplicate receive_shipment's stock-mutation logic"), but they are different call shapes. **D-04 governs** — the planner must extend `receive_shipment` in place, not add `receive_po_shipment`.

A second finding not present in either CONTEXT.md or the prior milestone research: the existing **Suppliers page precedent that D-02 cites as the model for "no cashier access" is weaker than D-02 requires.** `/suppliers` has no route guard (`ProtectedRoute` only — auth, not role) and its `SELECT` RLS policy is `USING (true)` for all `authenticated` users — cashier-role JWTs can read the table today; only nav-tile visibility and INSERT/UPDATE/DELETE are actually gated. D-02 explicitly wants the *whole* PO feature, including read, blocked for cashiers. To honor D-02 (not just its cited precedent), the planner needs the stronger pattern already used elsewhere in this codebase: a `ReportsRoute`-style route guard component (`usePermissions().can('manage_products')` → `<Navigate to="/home" />`) plus `SELECT` RLS on `purchase_orders`/`purchase_order_items` gated to `manage_products`, not `USING (true)`.

**Primary recommendation:** Two migrations (schema+RLS, then `receive_shipment` extension), one new `entities/purchase-order` slice mirroring `entities/supplier`, plain-RLS mutations for create/edit (no edge function), and a `receive-po-shipment` feature that is a *thin client-side wrapper* passing `poId` through the existing `useReceiveShipment`/`callReceiveShipment`/Edge-Function/RPC chain — not a new server-side entry point.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PO create/edit (draft line items) | API/Backend (Postgres RLS) | Frontend Server — n/a (SPA) | D-03: plain RLS-gated insert/update, no cross-table atomicity needed at create time; enforced at the DB, not just the client |
| PO low-stock auto-draft suggestion | API/Backend (Postgres read query) | Browser/Client (form pre-fill) | Suggested quantities are computed from `inventory`/`supplier_products`/`products` server data, then loaded into an editable client-side draft — never auto-submitted (Pitfall/Anti-Pattern 4 in prior research) |
| PO receive → stock/cost/expiry mutation + PO status close | API/Backend (SECURITY DEFINER RPC) | — | Must stay atomic (D-04) — same tier as `receive_shipment` today; a client-side two-step update would reopen the exact non-atomic-window bug class v1.1 already fixed for ad-hoc receiving |
| PO access control (cashier exclusion) | API/Backend (RLS on `purchase_orders`/`purchase_order_items`) | Browser/Client (route guard + nav-tile hide) | RLS is the actual enforcement boundary; the client route guard/nav-tile is UX-only and must not be the sole gate (see Common Pitfalls) |
| PO list/detail UI | Browser/Client (React/FSD widgets+pages) | — | Standard SPA rendering, no SSR tier in this Tauri app |

## Standard Stack

### Core

No new packages. This phase is entirely additive schema + reused stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.1.0 | UI layer for new PO pages/widgets/features | Already the project stack [VERIFIED: package.json] |
| Zod | 4.3.6 | `PurchaseOrder`/`PurchaseOrderItem` schemas in `domain.ts` | Single source of truth convention already enforced project-wide |
| @tanstack/react-query | 5.99.0 | `usePurchaseOrders`, `usePurchaseOrder(id)`, mutation hooks | Matches every existing entity's `model/queries.ts` pattern |
| Zustand | 5.0.12 | Not required for this phase — PO state is server state (TanStack Query), no Realtime subscription or local UI store called for in CONTEXT.md | Only add a store if a later UI-phase pass finds a concrete Realtime/local-state need |
| Supabase (Postgres + PostgREST + Edge Functions) | project-pinned, CLI 2.109.1 present locally [VERIFIED: `supabase --version` in this environment] | New tables, RLS, extended `receive_shipment` RPC | Existing backend, no alternative under consideration |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | 1.59.1 | E2E RBAC/RLS test for success criterion 4, PO create→receive flow test | Per CLAUDE.md mandatory-automated-testing policy — no manual UAT permitted |
| Vitest | 4.1.4 | Unit tests for D-07/D-08 reorder-quantity formula (pure function) | Property/boundary tests for the top-up-and-round-to-pack-size math |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `receive_shipment` in place (D-04) | New wrapper RPC `receive_po_shipment` calling into `receive_shipment` (prior milestone research's suggestion) | D-04 is the locked decision — wrapper approach is functionally similar (both avoid duplicating stock-mutation logic) but has a different call signature and does not match what CONTEXT.md instructs. Do not build the wrapper. |
| Plain RLS-gated insert for PO create (D-03) | Edge Function + RPC (mirroring `receive_shipment`) | Rejected by D-03 — no cross-table atomicity need at create time; would be unnecessary boilerplate per this codebase's own established split (RPC only for atomic multi-table writes) |

**Installation:** None — no `npm install` needed for this phase.

**Version verification:** Versions above read directly from `package.json` in this repo [VERIFIED: package.json] and `supabase --version`/`node --version` run in this environment [VERIFIED: shell]. No registry lookups needed since no new packages are introduced.

## Package Legitimacy Audit

**N/A for this phase.** No new npm/pip/cargo packages are installed — the phase is pure Supabase schema/RPC + reused-stack React code. Skipping the Package Legitimacy Gate protocol per its own scope condition ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser/Client (React SPA)                                          │
│                                                                       │
│  PurchaseOrdersPage (NEW, manager+ route-guarded)                    │
│    ├─ PurchaseOrderListPanel ──▶ usePurchaseOrders()  ──┐            │
│    ├─ PurchaseOrderDetailPanel ─▶ usePurchaseOrder(id) ─┤            │
│    └─ LowStockReorderPanel ──▶ useSupplierReorderSuggestions(sId) ─┐ │
│                                                                     │ │
│  create-purchase-order (feature)                                   │ │
│    └─ plain supabase.from('purchase_orders').insert(...)  [D-03]   │ │
│         + .from('purchase_order_items').insert([...])              │ │
│                                                                     │ │
│  receive-po-shipment (feature, THIN wrapper — no new server entry) │ │
│    └─ useReceiveShipment({ supplierId, items, poId }) ──────────┐  │ │
└───────────────────────────────────────────────────────────────┼──┼─┘
                                                                  │  │
                     (existing, UNCHANGED transport)              │  │
┌─────────────────────────────────────────────────────────────────┼──┼─┐
│ Supabase Edge Function: receive-shipment (EXTEND: +poId)         │  │ │
│    Zod BodySchema validates → admin.rpc('receive_shipment', {   │  │ │
│      p_staff_id, p_supplier_id, p_items, p_po_id  })  [NEW arg] ◀┘  │ │
└───────────────────────────────────────────────────────────────────┼─┘
                                                                      │
┌─────────────────────────────────────────────────────────────────────┐
│ Postgres (SECURITY DEFINER RPCs, RLS-protected tables)               │
│                                                                       │
│  receive_shipment(p_staff_id, p_supplier_id, p_items, p_po_id)  [EXT]│
│    ├─ role check: role_permissions.action = 'adjust_inventory'      │
│    ├─ per-line: lock inventory row, weighted-avg cost, LEAST expiry │
│    ├─ INSERT shipments / stock_movements (reason='delivery')        │
│    ├─ [NEW] IF p_po_id IS NOT NULL:                                 │
│    │     UPDATE purchase_orders SET status='received' WHERE id=..   │
│    └─ record_audit('shipment.receive', ...)                         │
│                                                                       │
│  purchase_orders / purchase_order_items  [NEW tables]                │
│    RLS: SELECT + write both gated to role_permissions.action =      │
│    'manage_products' (NOT `USING (true)` — see Common Pitfalls)     │
│                                                                       │
│  suppliers / supplier_products  [UNCHANGED — PO reads these]         │
│  inventory (costPrice, quantityOnHand, lowStockThreshold) [UNCHANGED]│
└─────────────────────────────────────────────────────────────────────┘
```

A reader can trace: manager opens `LowStockReorderPanel` for a supplier → suggestion query joins `inventory`+`supplier_products`+`products` (D-07/D-08 math) → manager edits the draft → `create-purchase-order` inserts rows directly (no RPC) → manager clicks Receive on `PurchaseOrderDetailPanel` → `receive-po-shipment` calls the *same* `useReceiveShipment` hook the ad-hoc Suppliers-page flow uses, now carrying `poId` → one already-hardened RPC does the stock mutation and closes the PO atomically.

### Recommended Project Structure

```
src/
├── entities/
│   └── purchase-order/                    # NEW — mirrors entities/supplier shape exactly
│       ├── model/
│       │   ├── types.ts                   # re-export PurchaseOrder*/PurchaseOrderItem* from domain.ts
│       │   └── queries.ts                 # usePurchaseOrders, usePurchaseOrder(id),
│       │                                  #   useMutationCreatePurchaseOrder,
│       │                                  #   useMutationUpdatePurchaseOrderItems
│       ├── ui/                            # PurchaseOrderStatusBadge
│       └── index.ts
├── features/
│   ├── create-purchase-order/             # NEW — 1 mutation hook + 1 form (mirrors
│   │                                      #   manage-suppliers/SupplierForm.tsx pattern)
│   ├── suggest-reorder/                   # NEW — read-only query joining inventory ⋈
│   │                                      #   supplier_products ⋈ products for one supplier;
│   │                                      #   NOT a mutation (no auto-submit, Anti-Pattern 4)
│   └── receive-po-shipment/                # NEW — thin wrapper: reuses
│                                            #   receive-shipment's useReceiveShipment,
│                                            #   passes poId; DOES NOT re-implement the RPC call
├── widgets/
│   ├── PurchaseOrderListPanel/            # NEW
│   ├── PurchaseOrderDetailPanel/          # NEW
│   └── LowStockReorderPanel/              # NEW — surfaces suggest-reorder, "Create PO" CTA
├── pages/
│   └── purchase-orders/                   # NEW route: /purchase-orders (or nested under /suppliers
│                                          #   — UI placement deferred to /gsd-ui-phase 16 per CONTEXT.md)
└── app/
    └── purchase-orders-route.tsx          # NEW — ReportsRoute-style guard: can('manage_products')
                                            #   → <Navigate to="/home" /> (see Common Pitfalls)
```

### Pattern 1: Edge-Function → SECURITY DEFINER RPC extension (verified call chain)

**What:** The full existing chain for ad-hoc receiving, read end-to-end this session:

`ReceiveShipmentForm.tsx` (UI) → `useReceiveShipment()` (TanStack mutation) → `callReceiveShipment()` in `edge-function-contracts.ts` (fetches `${VITE_SUPABASE_URL}/functions/v1/receive-shipment` with Bearer JWT) → `supabase/functions/receive-shipment/index.ts` (Deno Edge Function: Zod `BodySchema`, auth check, then `admin.rpc('receive_shipment', { p_staff_id, p_supplier_id, p_items })` using the **service-role** client) → Postgres `receive_shipment(p_staff_id uuid, p_supplier_id uuid, p_items jsonb)` SECURITY DEFINER function.

**Confirmed current RPC body** (D-04 extends this exact function) [VERIFIED: supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql:5-95]:
```sql
CREATE OR REPLACE FUNCTION receive_shipment(p_staff_id uuid, p_supplier_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
...
  PERFORM 1 FROM profiles p JOIN role_permissions rp ON rp.role = p.role
    WHERE p.id = p_staff_id AND rp.action = 'adjust_inventory';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to receive shipments');
  END IF;
...
    INSERT INTO inventory (product_id, quantity_on_hand, cost_price, expiry_date)
      VALUES (v_product_id, v_quantity, v_new_cost, v_new_expiry)
      ON CONFLICT (product_id) DO UPDATE SET
        quantity_on_hand = inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
        cost_price = v_new_cost,
        expiry_date = v_new_expiry;
    INSERT INTO stock_movements (product_id, quantity_delta, reason, staff_id, ref_type, ref_id)
      VALUES (v_product_id, v_quantity, 'delivery', p_staff_id, 'shipment', v_shipment_id);
...
$$;
```

**When to use:** Extend this exact function with `p_po_id uuid DEFAULT NULL`. Add, immediately before the final `RETURN jsonb_build_object('ok', true, ...)`:
```sql
IF p_po_id IS NOT NULL THEN
  UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = p_po_id;
END IF;
```
Also extend `supabase/functions/receive-shipment/index.ts`'s `BodySchema` with `poId: z.string().uuid().optional()` and pass `p_po_id: parsed.data.poId ?? null` in the `admin.rpc(...)` call [VERIFIED: supabase/functions/receive-shipment/index.ts:4-71], and extend `ReceiveShipmentRequestSchema` in `edge-function-contracts.ts` [VERIFIED: src/shared/lib/edge-function-contracts.ts:649-655] the same way. All three layers must change together — the RPC signature alone is not reachable from the client without the Edge Function and contract also accepting `poId`.

**Note the RBAC action mismatch that is NOT a bug:** `receive_shipment`'s internal check is against `adjust_inventory`, not `manage_products` (D-01's chosen action for the rest of the PO feature). Both actions resolve to the identical role set — `manager`+`admin` — in `MANAGER_EXTRA` [VERIFIED: src/shared/lib/rbac.ts:45-55, quoting the literal set: `'close_tab', 'view_reports', 'adjust_inventory', 'manage_products', 'manage_caja', 'process_refund', 'view_audit_log', 'edit_paid_tab', 'reopen_tab'`]. No behavioral difference results from D-01 choosing `manage_products` for the client-side PO gates while `receive_shipment` itself continues to check `adjust_inventory` server-side — leave the RPC's existing check untouched.

### Pattern 2: Plain RLS-gated CRUD (D-03's chosen pattern for PO create/edit)

**What:** `manage-suppliers`/`SupplierForm.tsx` inserts/updates `suppliers` and `supplier_products` directly via `supabase.from(...).insert(...)`/`.update(...)`, relying on RLS to reject unauthorized writes — no Edge Function, no RPC [VERIFIED: src/features/manage-suppliers/ui/SupplierForm.tsx:1-56, src/entities/supplier/model/queries.ts:142-196].

**When to use:** `purchase_orders`/`purchase_order_items` insert/update (create draft, edit line items, mark submitted) — mirror this exact shape: a `map()`/`row()` snake_case↔camelCase translator pair, a `useMutationCreatePurchaseOrder`/`useMutationUpdatePurchaseOrderItems` hook per `entities/supplier/model/queries.ts`'s style, invalidating a `purchaseOrderKeys` query-key set on success.

**RLS policy shape to reuse, WITH ONE DELIBERATE DIVERGENCE** (see Common Pitfalls — read-gating): [VERIFIED: supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:41-53, quoting the literal `suppliers`/`supplier_products` policy pattern]:
```sql
CREATE POLICY suppliers_manage ON suppliers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
For `purchase_orders`/`purchase_order_items`, use `FOR ALL` (not a separate `..._select_authenticated ... USING (true)` policy) so `SELECT` is *also* gated to `manage_products` — this is what D-02 requires and the `suppliers` table does not provide.

### Anti-Patterns to Avoid

- **Building `receive_po_shipment` as a second RPC** (prior milestone research's sketch) instead of extending `receive_shipment` in place — contradicts locked D-04. The stock-mutation logic must live in exactly one function body.
- **Gating cashier PO access with nav-tile hiding alone** — the existing `/suppliers`/`/inventory` tiles do this via `requiredAction` in `HomeDashboard.tsx`'s `ITEMS` array [VERIFIED: src/widgets/HomeDashboard/ui/HomeDashboard.tsx:35-88], but neither route has a `ProtectedRoute`-wrapping role guard, and `suppliers`'s own `SELECT` RLS is `USING (true)`. Copying this exactly under-delivers D-02.
- **Auto-submitting the low-stock draft without a review step** — PROJECT.md explicitly rules out auto-PO generation; PO-02's own wording ("then edit line items before saving") requires a review state, not an auto-send.
- **Recomputing weighted-average cost or earliest-expiry-wins logic inside `create-purchase-order`** — creation never touches `inventory`/`stock_movements` at all (D-03); only `receive_shipment` (extended) does, at receive time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic stock/cost/expiry mutation on PO receipt | A new `UPDATE inventory SET ...` block inside a PO-specific RPC | The extended `receive_shipment` RPC (D-04) | Already hardened twice in v1.1 (cost/expiry-overwrite fix, weighted-average-cost fix) — a parallel path reopens both bug classes (Pitfall 5) |
| Role/permission gating | A bespoke `if (staff.role === 'manager' || staff.role === 'admin')` check anywhere | `canAccess(role, 'manage_products')` / `usePermissions().can('manage_products')` | Single source of truth already exists in `rbac.ts`; a hand-rolled check drifts from the RBAC table over time |
| Supplier/product selection UI | A new product-picker component from scratch | `useSuppliers()`, `useSupplierProductIds()`, existing `useProductsForManagement()` (seen wired into `ReceiveShipmentForm.tsx`) | Same data, same hooks, already paginate/filter correctly |
| CSV/audit trail for PO actions | A new logging table | `record_audit(p_action, p_entity_type, p_entity_id, p_before, p_after)` | Already used by `receive_shipment` (`record_audit('shipment.receive', 'shipment', v_shipment_id, ...)`); use action names like `'po.create'`, `'po.receive'` for consistency |

**Key insight:** Every mutation this phase needs is a shape this codebase has already built once (supplier CRUD for creation, `receive_shipment` for receiving). The entire implementation risk is in *wiring these together correctly*, not in designing new patterns.

## Common Pitfalls

### Pitfall 1: Building a second `receive_po_shipment` RPC instead of extending `receive_shipment`
**What goes wrong:** A fresh RPC re-implements the `INSERT ... ON CONFLICT DO UPDATE` inventory mutation, cost-averaging, and expiry-merge logic "because it's a different entry point" — reopening bugs `receive_shipment` already fixed twice in v1.1.
**Why it happens:** PO receiving has extra bookkeeping (status close) that tempts a from-scratch implementation; the prior milestone research (`ARCHITECTURE.md`) even sketches this shape.
**How to avoid:** Follow D-04, not the prior research sketch: add `p_po_id uuid DEFAULT NULL` to `receive_shipment` itself; the status-close `UPDATE purchase_orders SET status = 'received' WHERE id = p_po_id` line lives inside the *same* function body, after the existing per-line loop, before the final `RETURN`.
**Warning signs:** A migration that does `CREATE OR REPLACE FUNCTION receive_po_shipment(...)` with its own `INSERT INTO inventory` block.

### Pitfall 2: Read access to PO data is left open to cashiers because it mirrors the Suppliers page
**What goes wrong:** D-02 says "cashiers cannot see purchase orders at all," but its own cited precedent (`/suppliers`) only gates *writes* — `SELECT` is `USING (true)` for all authenticated users [VERIFIED: supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:45,49,54, quoting `suppliers_select_authenticated ON suppliers FOR SELECT TO authenticated USING (true)`], and there is no route-level role guard on `/suppliers` [VERIFIED: src/app/router.tsx:66-73, showing only `<ProtectedRoute>`, no `SuppliersRoute` wrapper]. Copying this pattern verbatim leaves a cashier able to `curl`/direct-navigate and read PO data.
**Why it happens:** "Matches how Suppliers already works" reads as full parity, but Suppliers' own enforcement is actually incomplete relative to what D-02 is asking for.
**How to avoid:** Use `FOR ALL` (not a separate open `SELECT` policy) on `purchase_orders`/`purchase_order_items`, gated to `manage_products` for every operation including `SELECT`. Add a `ReportsRoute`-style client guard component (`usePermissions().can('manage_products')` → `<Navigate to="/home" replace />`) wrapping the new route [VERIFIED: src/app/reports-route.tsx:1-15, quoting the full 15-line component verbatim above under Pattern 2].
**Warning signs:** A migration with `CREATE POLICY purchase_orders_select_authenticated ... USING (true)`; a router entry using only `<ProtectedRoute>` with no role-checking wrapper.

### Pitfall 3: Reorder suggestions computed from the store-wide low-stock list instead of a supplier-scoped query
**What goes wrong:** `useInventoryStore().lowStockAlerts` is a global, all-suppliers list derived client-side from `inventory.quantityOnHand <= inventory.lowStockThreshold` [VERIFIED: src/entities/inventory/model/store.ts:95-108, quoting `.filter(item => item.quantityOnHand <= item.lowStockThreshold)`]. PO-02 needs the subset that a *specific chosen supplier* actually carries — joining through `supplier_products.supplier_id`. Reusing the store list unfiltered would draft a PO containing products the chosen supplier doesn't even sell.
**Why it happens:** CONTEXT.md's Reusable Assets note correctly identifies `lowStockAlerts`/`lowStockProductIds` as "the exact data source," which is true for the *low-stock filter* but not sufficient alone — it still needs the supplier join layered on top.
**How to avoid:** Write a new server-side (or client-composed) query: `inventory ⋈ products ⋈ supplier_products WHERE supplier_products.supplier_id = :chosen AND inventory.quantity_on_hand <= inventory.low_stock_threshold`, then apply D-07 (top-up to threshold) and D-08 (round to `unitsPerPackage` if set) client- or server-side before rendering the editable draft.
**Warning signs:** A "Create draft PO" button that pre-fills line items for products the chosen supplier has no `supplier_products` row for.

### Pitfall 4: `supabase.types.ts` has no `purchase_orders`/`purchase_order_items` entries yet
**What goes wrong:** TypeScript compile errors or unsafe `any` sprawl when the new tables are queried before types are regenerated.
**Why it happens:** Confirmed via grep — zero occurrences of `purchase_order` in the generated types file today [VERIFIED: `grep -c "purchase_order" src/shared/lib/supabase.types.ts` → `0`, run this session].
**How to avoid:** Follow the documented project workaround exactly (CLAUDE.md "Missing generated types workaround"): `const db = supabase as any` with a file-level `/* eslint-disable */` comment on the new `entities/purchase-order/model/queries.ts` until `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts` is run after the schema migration lands, then remove the cast.
**Warning signs:** Hand-written `interface PurchaseOrderRow {...}` duplicating what codegen should produce; the `as any` cast left in permanently past the type-regeneration step.

### Pitfall 5: `ref_type`/`ref_id` on `stock_movements` isn't reused to link a movement back to its PO
**What goes wrong:** `stock_movements` already carries polymorphic `ref_type text, ref_id uuid` columns (no CHECK constraint restricting values — confirmed free-form) [VERIFIED: supabase/migrations/20260424000001_stock_movements.sql:20-23, and the reason CHECK at lines 26-40 lists only `reason` values, not `ref_type` values]. `receive_shipment` already writes `ref_type='shipment', ref_id=v_shipment_id` per line item [VERIFIED: supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql:84-85]. If the PO extension doesn't also thread `p_po_id` onto the `shipments` row (or a `purchase_orders.shipment_id` back-reference), there is no way to later query "which stock movements came from this PO" without joining through `shipments` by `supplier_id`+`received_at` heuristics.
**How to avoid:** Either add a nullable `po_id uuid REFERENCES purchase_orders(id)` column to `shipments` (set it in the same INSERT `receive_shipment` already does), or store the reverse link on `purchase_orders.shipment_id` once the RPC creates the shipment row. Either is a one-column addition; pick one and thread it through consistently. Do not invent a third linkage mechanism (e.g., matching by timestamp).
**Warning signs:** A PO detail page that cannot show "received via shipment #X" / "movements from this PO" without a fragile join.

## Code Examples

### `stock_movements.reason` CHECK constraint — confirmed values, no PO-specific addition needed
```sql
-- Source: supabase/migrations/20260424000001_stock_movements.sql:26-40 (read this session)
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_reason_check
  CHECK (reason IN (
    'sale', 'manual_adjustment', 'waste', 'delivery', 'correction',
    'physical_count', 'prep_production', 'prep_consumption',
    'combo_component', 'refund', 'void'
  )) NOT VALID;
```
`'delivery'` already covers PO-linked receiving — `receive_shipment` continues to insert `reason='delivery'` regardless of whether `p_po_id` is passed. No migration needed against this constraint.

### `record_audit` signature (for `'po.create'`/`'po.receive'` audit entries)
```sql
-- Source: supabase/migrations/20260703000001_record_audit_terminal_id.sql:47-56 (read this session)
CREATE FUNCTION record_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid        DEFAULT NULL,
  p_before      jsonb       DEFAULT NULL,
  p_after       jsonb       DEFAULT NULL,
  p_source      text        DEFAULT 'rpc',
  p_terminal_id text        DEFAULT NULL,
  p_user_id     uuid        DEFAULT NULL
) RETURNS uuid ...
```
Positional-optional — the existing `PERFORM record_audit('shipment.receive', 'shipment', v_shipment_id, NULL, jsonb_build_object(...))` call style is the pattern to copy for a PO-create audit entry (`record_audit('po.create', 'purchase_order', v_po_id, NULL, jsonb_build_object('supplierId', ..., 'itemCount', ...))`).

### `get_user_role()` — used by every RLS policy this phase adds
```sql
-- Source: supabase/migrations/20260414000009_rls_policies.sql:24-27 (read this session)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### `ReportsRoute` — the guard component shape to copy for the new PO route
```tsx
// Source: src/app/reports-route.tsx (read in full this session, 15 lines, quoted verbatim)
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@entities/staff/model/usePermissions';

type ReportsRouteProps = { children: ReactNode };

export function ReportsRoute({ children }: ReportsRouteProps) {
  const { can } = usePermissions();
  if (!can('view_reports')) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
```
For PO: `PurchaseOrdersRoute` identical shape, `can('manage_products')`.

## State of the Art

Not applicable — this is an internal feature addition to an existing, current-generation stack (React 19, Supabase, TanStack Query v5), not a domain where "old vs. current approach" framing applies. No deprecated APIs are involved.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact PO status enum should be `draft`/`received` only (two states), per CONTEXT.md's discretion note that "draft → received/closed is the only lifecycle the requirements actually name" | Recommended Project Structure, Common Pitfalls | Low — CONTEXT.md explicitly defers this to the planner as a non-gray-area default; if the planner wants an intermediate "submitted/ordered" status it's an additive enum value, not a rework |
| A2 | Linking a `stock_movements`/`shipments` row back to its originating PO via a new nullable `shipments.po_id` column (vs. `purchase_orders.shipment_id`) — no existing precedent in this codebase for which direction is preferred | Pitfall 5, Code Examples | Low — either direction is a one-column, backward-compatible addition; only matters for later "show movements for this PO" UI, not for PO-01..03's success criteria |

**All other claims in this research were verified this session by reading the actual migration/RPC/component source or the prior milestone research documents — no other assumptions carried.**

## Open Questions (RESOLVED)

1. **Should `shipments`/`stock_movements` carry an explicit PO back-reference, or is `purchase_orders.status='received'` alone sufficient for PO-01..03's success criteria?**
   - What we know: Success criteria 1-4 only require creating, auto-drafting, receiving-in-full, and closing a PO plus an RBAC test — none explicitly require "view movements originating from this PO."
   - What's unclear: Whether the UI-hint pass (`/gsd-ui-phase 16`) will want a PO detail page showing "received via shipment #X."
   - Recommendation: Add the nullable `shipments.po_id` column now (cheap, one line in the extended `receive_shipment` INSERT) even if the UI doesn't immediately surface it — avoids a later migration once real PO rows exist.
   - **RESOLVED:** Yes — the nullable `shipments.po_id` back-reference is added, per the recommendation above. Implemented in `16-01-PLAN.md`'s schema/RPC task.

2. **Does the PO-page route belong under a new top-level `/purchase-orders` path, or nested into the existing `/suppliers` page as a tab?**
   - What we know: CONTEXT.md explicitly defers this to `/gsd-ui-phase 16`.
   - What's unclear: Nothing technical blocks either; RLS/RPC work is identical regardless of URL structure.
   - Recommendation: Treat as a pure UI-phase decision — this research's schema/RPC recommendations are unaffected by the choice.
   - **RESOLVED:** New top-level route `/purchase-orders`, guarded by a dedicated `PurchaseOrdersRoute` — decided in `16-UI-SPEC.md`'s "Page Placement Decision" section and implemented in `16-03-PLAN.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Local migration development/testing | ✓ | 2.109.1 [VERIFIED: `supabase --version`, run this session] | — |
| Docker | Local Supabase stack (Postgres, Edge Functions runtime) | ✓ | 29.7.2 (Docker Engine - Community) [VERIFIED: `docker info`, run this session] | — |
| Node.js | Build/test tooling | ✓ | v24.18.0 [VERIFIED: `node --version`, run this session] | — |
| Google Chrome (`channel: 'chrome'`) | Playwright E2E (headless) per CLAUDE.md testing policy | Not probed this session | — | Verify with `google-chrome --version` before executing E2E; per CLAUDE.md this is a documented Ubuntu dev-setup gap, not new to this phase |

**Missing dependencies with no fallback:** None identified.
**Missing dependencies with fallback:** None — all core tooling already present.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit), Playwright 1.59.1 (E2E) [VERIFIED: package.json] |
| Config file | `vitest.config.ts`, `playwright.config.ts` (both present at repo root) [VERIFIED: `ls playwright.config.ts vitest.config.ts`, run this session] |
| Quick run command | `npx vitest run src/entities/purchase-order/model/reorder-quantity.test.ts` (or equivalent new file) |
| Full suite command | `npm run test` (unit), `npm run test:e2e` (E2E) [VERIFIED: package.json scripts `"test": "vitest run --project unit --reporter=dot"`, `"test:e2e": "playwright test"`] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PO-01 | Manager+ creates a PO with line items against a supplier, defaulting cost from `inventory.costPrice` | E2E | `npx playwright test e2e/56-purchase-orders.spec.ts -g "create"` | ❌ Wave 0 |
| PO-01 | Cashier cannot create/view a PO (RLS + route guard) | E2E (RBAC/RLS) | `npx playwright test e2e/56-purchase-orders.spec.ts -g "cashier"` | ❌ Wave 0 |
| PO-02 | Draft PO auto-fills from low-stock list for a chosen supplier, respecting D-07 top-up and D-08 pack-size rounding | Unit (pure formula) + E2E (integration) | `npx vitest run src/entities/purchase-order/model/reorder-quantity.test.ts`; `npx playwright test e2e/56-purchase-orders.spec.ts -g "auto-draft"` | ❌ Wave 0 (both) |
| PO-03 | Receiving a PO updates stock/cost/expiry via `receive_shipment` and closes the PO atomically | E2E (integration against real Supabase, per `53-supplier-receiving.spec.ts` pattern) | `npx playwright test e2e/56-purchase-orders.spec.ts -g "receive"` | ❌ Wave 0 |
| PO-03 | PO-linked and ad-hoc receiving produce identical weighted-average-cost/earliest-expiry-wins results for equivalent inputs | E2E or integration test | New assertion mirroring `receive-shipment-weighted-avg.integration.test.ts` [VERIFIED: src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts exists] | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run typecheck && npx vitest run <touched test file>`
- **Per wave merge:** `npm run test` (full unit suite)
- **Phase gate:** `npm run test:e2e` (or the new `56-purchase-orders.spec.ts` subset) green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/56-purchase-orders.spec.ts` — new spec covering PO-01..03's four success criteria, following the `53-supplier-receiving.spec.ts` pattern (service-role `getServiceClient()` fixture setup/teardown, `loginAs(page, 'manager')`/`loginAs(page, 'cashier')` for the RBAC criterion) [VERIFIED: e2e/53-supplier-receiving.spec.ts:1-30, quoting the `createSupplier`/`openQuickAdd` helper shape to mirror]
- [ ] `src/entities/purchase-order/model/reorder-quantity.test.ts` — unit test for the D-07 top-up formula and D-08 pack-size rounding (pure function, fast-check-eligible for boundary conditions per CLAUDE.md's property-based-testing convention)
- [ ] No new test framework/config needed — both Vitest and Playwright are already fully configured.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new logic) | Reuses existing Supabase Auth/JWT — unchanged |
| V3 Session Management | No | Unchanged |
| V4 Access Control | **Yes** | RLS `FOR ALL` policy on `purchase_orders`/`purchase_order_items` gated to `role_permissions.action = 'manage_products'` (Pattern 2); client route guard mirroring `ReportsRoute`; `receive_shipment`'s existing `adjust_inventory` role check (unchanged, D-01 confirmed equivalent) |
| V5 Input Validation | **Yes** | Zod schemas in `domain.ts` (`PurchaseOrderSchema`, `PurchaseOrderItemSchema`) for every client-side write; extended `BodySchema`/`ReceiveShipmentRequestSchema` Zod validation for the new `poId` field at both Edge-Function and client-contract layers |
| V6 Cryptography | No | Not touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cashier bypasses UI nav-tile hiding via direct URL/API call to read or write PO data | Elevation of Privilege | `FOR ALL` RLS policy on both new tables gated to `manage_products` for every operation including `SELECT` (Pitfall 2) — RLS is the real boundary, not the client route guard, which is UX-only |
| A crafted `poId` on the receive-shipment request references a PO belonging to a different/nonexistent supplier, causing a stock mutation to be misattributed | Tampering | The extended `receive_shipment` RPC should validate `p_po_id`'s `purchase_orders.supplier_id` matches `p_supplier_id` before proceeding (or simply derive `p_supplier_id` from the PO row when `p_po_id` is supplied) — mirrors the existing `PERFORM 1 FROM suppliers WHERE id = p_supplier_id` not-found guard already in the function |
| Double-receiving the same PO (network retry, double-click) marks stock received twice | Repudiation / data integrity | Extended RPC should check `purchase_orders.status <> 'received'` before mutating (return a distinct error code, e.g. `PO_ALREADY_RECEIVED`, mirroring the existing `SUPPLIER_NOT_FOUND`/`FORBIDDEN` early-return style already in `receive_shipment`) |

## Sources

### Primary (HIGH confidence — direct repo inspection this session)
- `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` — `suppliers`/`supplier_products`/`shipments` schema, RLS, original `receive_shipment` RPC
- `supabase/migrations/20260817000002_receive_shipment_atomicity.sql`, `20260819000003_receive_shipment_weighted_avg_cost.sql` — current `receive_shipment` RPC body, weighted-average-cost/earliest-expiry-wins logic
- `supabase/functions/receive-shipment/index.ts` — Edge Function wire contract, full call chain
- `src/shared/lib/edge-function-contracts.ts:639-699` — `ReceiveShipmentRequestSchema`/`callReceiveShipment`
- `src/shared/lib/domain.ts:227-273,513-562` — `ProductSchema`, `InventorySchema`, `SupplierSchema`, `SupplierProductSchema`
- `src/shared/lib/rbac.ts` — `STAFF_ACTIONS`, `MANAGER_EXTRA` role-set definitions
- `src/entities/supplier/model/queries.ts`, `src/entities/inventory/model/store.ts` — reusable query hooks and low-stock derivation logic
- `src/features/receive-shipment/model/useReceiveShipment.ts`, `ui/ReceiveShipmentForm.tsx` — UI pattern to mirror
- `src/features/manage-suppliers/ui/SupplierForm.tsx` — plain-RLS CRUD pattern to mirror
- `src/app/router.tsx`, `src/app/reports-route.tsx`, `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` — route-guard precedent (present) vs. nav-tile-only gating (Suppliers/Inventory, insufficient for D-02)
- `supabase/migrations/20260424000001_stock_movements.sql`, `20260703000001_record_audit_terminal_id.sql`, `20260414000009_rls_policies.sql` — `stock_movements` reason/ref_type shape, `record_audit`, `get_user_role`
- `e2e/09-rbac.spec.ts`, `e2e/53-supplier-receiving.spec.ts` — existing RBAC-test and receiving-E2E patterns to extend
- `package.json` — pinned dependency versions (no new deps needed)
- Shell verification this session: `supabase --version` (2.109.1), `docker info`, `node --version` (v24.18.0), `grep -c "purchase_order" src/shared/lib/supabase.types.ts` (0)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` (2026-08-19 milestone-level research) — architecture sketch, largely confirmed against current code this session; one reconciliation needed against later-locked D-04 (see Summary)
- `.planning/research/PITFALLS.md` (2026-08-19) — Pitfall 4 (unit-of-measure), Pitfall 5 (duplicate receive-stock path) directly informed Common Pitfalls 1 and 3 above, cross-checked against current schema
- `.planning/research/FEATURES.md` (2026-08-19) — MVP scoping precedent (full-receive only, no partial/backorder) — consistent with REQUIREMENTS.md Out of Scope

### Tertiary (LOW confidence)
None — no unverified web-only claims were needed for this phase; it is entirely internal-codebase-grounded.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all versions read directly from `package.json`
- Architecture: HIGH — full call chain read source-to-source this session; one explicit reconciliation flagged (wrapper RPC vs. in-place extension)
- Pitfalls: HIGH — Pitfall 2 (read-access gap) and Pitfall 3 (supplier-scoping gap) are new findings from this session's direct code reading, not present in either CONTEXT.md or the prior milestone research; Pitfalls 1, 4, 5 corroborate and extend the prior milestone research's PITFALLS.md against current code

**Research date:** 2026-08-23
**Valid until:** 30 days (stable internal codebase, no fast-moving external dependency)
