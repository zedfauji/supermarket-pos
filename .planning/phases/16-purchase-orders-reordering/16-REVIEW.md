---
phase: 16-purchase-orders-reordering
reviewed: 2026-08-24T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - e2e/56-purchase-orders.spec.ts
  - src/app/purchase-orders-route.tsx
  - src/app/router.tsx
  - src/entities/purchase-order/index.ts
  - src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts
  - src/entities/purchase-order/model/queries.ts
  - src/entities/purchase-order/model/reorder-quantity.test.ts
  - src/entities/purchase-order/model/reorder-quantity.ts
  - src/entities/purchase-order/model/types.ts
  - src/features/create-purchase-order/index.ts
  - src/features/create-purchase-order/ui/PurchaseOrderForm.tsx
  - src/features/receive-shipment/model/receive-po-shipment.integration.test.ts
  - src/features/receive-shipment/model/useReceiveShipment.ts
  - src/features/receive-shipment/ui/ReceiveShipmentForm.tsx
  - src/features/suggest-reorder/index.ts
  - src/features/suggest-reorder/model/useSuggestReorder.ts
  - src/pages/purchase-orders/index.tsx
  - src/shared/lib/domain.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/i18n/locales/en-US/common.json
  - src/shared/lib/i18n/locales/en-US/featMgmt.json
  - src/shared/lib/i18n/locales/en-US/pages.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/common.json
  - src/shared/lib/i18n/locales/es-MX/featMgmt.json
  - src/shared/lib/i18n/locales/es-MX/pages.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/shared/lib/supabase.types.ts
  - src/shared/ui/StatusBadge.tsx
  - src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx
  - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
  - src/widgets/PurchaseOrderDetailPanel.tsx
  - src/widgets/PurchaseOrderListPanel.tsx
  - supabase/functions/receive-shipment/index.ts
  - supabase/migrations/20260823000001_purchase_orders.sql
  - supabase/migrations/20260823000002_receive_shipment_po.sql
findings:
  critical: 3
  warning: 3
  info: 1
  total: 7
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-08-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27 (in scope; some required-reading files are pre-existing and unchanged by this phase, reviewed for context only)
**Status:** issues_found

## Summary

Reviewed the Purchase Orders & Reordering phase: schema/RLS (`purchase_orders`/`purchase_order_items`), the `receive_shipment` RPC's PO-close extension, the reorder-quantity formula, and the React feature/widget/page layer.

RLS correctness for D-02 (cashier exclusion) is solid — both tables use a `FOR ALL` policy scoped to `manage_products` with no separate open `SELECT USING(true)` policy, matching the documented intent, confirmed by the integration test and the `role_permissions` seed (`manager`/`admin` only). The reorder-quantity formula (`computeReorderQuantity`) is correct and well covered by a property-based test.

The `receive_shipment` RPC's new PO-close logic, however, has a genuine concurrency hole in its double-receive guard, and the client-side purchase-order mutations (create/update) are not transactional, creating real data-loss/orphan-row risk on partial failure. The `ReceiveShipmentForm`'s Confirm button is also missing the double-submit guard that its sibling `PurchaseOrderForm` has, which materially increases the odds of hitting the RPC race in practice. Details below.

## Critical Issues

### CR-01: `receive_shipment`'s double-receive guard is a TOCTOU race, not an atomic check

**File:** `supabase/migrations/20260823000002_receive_shipment_po.sql:49-58` (guard) and `:117-119` (unconditional close)

**Issue:** The PO guard block reads `purchase_orders.status` with a plain `SELECT` (no `FOR UPDATE`), then later locks only the `products` rows referenced by the submitted items (line 66), never the `purchase_orders` row itself. The final `UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = p_po_id` (line 118) is unconditional — it does not check `WHERE status = 'draft'` or inspect the row count.

If two `receive_shipment` calls for the same `p_po_id` run concurrently (e.g. a double-click, a client retry after a slow response, or two staff members racing to close the same PO), both transactions can pass the `status = 'received'` check before either commits, both proceed to lock/upsert `inventory` for the same product(s), and both add their quantity — double-counting stock for a single physical receiving event — and both then blindly flip `status` to `'received'` (harmless in isolation, but the inventory double-count is not). This directly undermines the "atomic close" guarantee the surrounding comments (`D-04`) claim, and contradicts what `receive-po-shipment.integration.test.ts` (Test 2) actually proves — that test is strictly sequential (`await`s the first call to fully complete before issuing the second), so it cannot catch this race.

**Fix:** Lock the PO row up front and re-validate status after acquiring the lock, and make the final status flip self-guarding:
```sql
-- Right after the supplier-exists check, before the item-loop:
DECLARE v_po_status text;
IF p_po_id IS NOT NULL THEN
  SELECT status INTO v_po_status FROM purchase_orders WHERE id = p_po_id AND supplier_id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_SUPPLIER_MISMATCH', 'message', 'Purchase order not found for this supplier');
  END IF;
  IF v_po_status = 'received' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_ALREADY_RECEIVED', 'message', 'Purchase order already received');
  END IF;
END IF;
...
-- at close time, make it self-guarding too:
IF p_po_id IS NOT NULL THEN
  UPDATE purchase_orders SET status = 'received', received_at = now()
    WHERE id = p_po_id AND status = 'draft';
END IF;
```
The `FOR UPDATE` on the `purchase_orders` row makes a second concurrent call block until the first transaction commits, at which point its own (now re-run inside the lock) status check will correctly see `'received'` and return `PO_ALREADY_RECEIVED` instead of double-mutating inventory.

### CR-02: `ReceiveShipmentForm`'s Confirm button has no in-flight guard — double-click double-submits

**File:** `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx:277-287`

**Issue:** The Confirm button's `disabled` expression only checks form validity (`!supplierId || lines.length === 0 || lines.some(...)`) — it never includes `receive.isPending`. `POSButton` (`src/shared/ui/POSButton.tsx`) is a plain styled wrapper with no built-in double-click protection. A double-click (very plausible on a touchscreen POS device, which is this component's explicit target per `POSButton`'s own docs) fires `submit()` twice, issuing two concurrent `receive_shipment` RPC calls with the same `poId`/items — exactly the race window described in CR-01. Even without a `poId` (plain, non-PO shipment receiving), a double-click still creates two separate `shipments` rows and double-adds the received quantity to inventory, since there is no idempotency key on the RPC call.

Contrast with `PurchaseOrderForm` (`src/features/create-purchase-order/ui/PurchaseOrderForm.tsx:190-201`), whose Save button correctly includes `submitting` in its `disabled` expression — this guard exists elsewhere in the same phase but was omitted here.

**Fix:**
```tsx
<POSButton
  type="button"
  onClick={() => void submit()}
  disabled={
    receive.isPending ||
    !supplierId ||
    lines.length === 0 ||
    lines.some(line => !line.productId || line.quantity <= 0)
  }
>
```

### CR-03: `useMutationUpdatePurchaseOrder` can permanently lose a PO's line items on partial failure

**File:** `src/entities/purchase-order/model/queries.ts:240-275`

**Issue:** Editing a draft PO is three separate, non-transactional network round-trips: `UPDATE purchase_orders` → `DELETE FROM purchase_order_items WHERE purchase_order_id = ...` → `INSERT INTO purchase_order_items (...)`. If the `DELETE` succeeds but the subsequent `INSERT` fails (network drop, a product referenced by a new line was deleted between form-open and submit causing an FK violation, a transient RLS/auth hiccup, etc.), the mutation returns the `INSERT` error — but the previously-saved line items are already gone with no rollback. The purchase order is left in the database with zero items and no way for the user to recover the prior state; the only trace is whatever was previously fetched into the React Query cache before invalidation.

**Fix:** Move this to a single `SECURITY DEFINER` RPC (mirroring the transactional pattern already used by `receive_shipment`) that performs the update/delete/insert inside one Postgres transaction, so a mid-way failure rolls back everything:
```sql
CREATE OR REPLACE FUNCTION update_purchase_order(p_id uuid, p_supplier_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE purchase_orders SET supplier_id = p_supplier_id WHERE id = p_id;
  DELETE FROM purchase_order_items WHERE purchase_order_id = p_id;
  INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, cost_price)
    SELECT p_id, (e->>'product_id')::uuid, (e->>'quantity')::integer, (e->>'cost_price')::numeric
    FROM jsonb_array_elements(p_items) e;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;
```
At minimum (smaller fix), re-insert the original items if the final `INSERT` fails, so the operation is at least client-side-compensated rather than silently lossy.

## Warnings

### WR-01: `useMutationCreatePurchaseOrder` can leave an orphaned, empty draft PO on partial failure

**File:** `src/entities/purchase-order/model/queries.ts:212-238`

**Issue:** Creating a PO is two separate calls: `INSERT INTO purchase_orders` then `INSERT INTO purchase_order_items`. If the items insert fails for any reason (network drop, a line item's `product_id` no longer exists, a `quantity`/`cost_price` value that fails the DB `CHECK` constraints because it slipped past client-side validation — e.g. `PurchaseOrderCreateSchema` is never actually `.parse()`-validated before this mutation runs, unlike `callReceiveShipment` which does validate), the `purchase_orders` row from the first insert is already committed and stays behind with zero items, silently violating the `items.min(1)` business invariant that only the Zod schema (never enforced server-side) claims to guarantee. The user sees a generic `saveError` toast (`PurchaseOrderForm.tsx:73`) with no indication that a stray empty draft now exists in the list.

**Fix:** Same as CR-03 — wrap create in a single RPC, or on items-insert failure, delete the just-created `purchase_orders` row before returning the error:
```ts
if (!itemsRes.ok) {
  await supabase.from('purchase_orders').delete().eq('id', po.id);
  return itemsRes;
}
```

### WR-02: No DB-level immutability for a `received` purchase order — RLS/mutations don't guard status

**File:** `supabase/migrations/20260823000001_purchase_orders.sql:38-43`; `src/entities/purchase-order/model/queries.ts` (`useMutationUpdatePurchaseOrder`, `useMutationDeletePurchaseOrder`); `src/widgets/PurchaseOrderListPanel.tsx:63-77`

**Issue:** `purchase_orders_manage`/`purchase_order_items_manage` are `FOR ALL` policies gated solely by `manage_products`, with no `status` condition. `useMutationUpdatePurchaseOrder` and `useMutationDeletePurchaseOrder` likewise never check `status` before issuing their UPDATE/DELETE. The UI only *hides* the Edit/Delete/Receive buttons once `status === 'received'` (`PurchaseOrderListPanel.tsx:64`, `PurchaseOrderDetailPanel.tsx:61`) — this is UX-only. Any manager/admin hitting the REST API directly (or a future UI regression that re-exposes these actions) can edit or delete a PO that `receive_shipment` has already used to authoritatively mutate inventory, silently desyncing the PO record from the stock movement/shipment history it's meant to document, and (per CR-03's DELETE cascade) destroying the audit trail of what was actually ordered/received.

**Fix:** Add a status guard to the RLS `WITH CHECK`/`USING` clauses (or a `BEFORE UPDATE/DELETE` trigger) that rejects mutation once `status = 'received'`, e.g.:
```sql
CREATE POLICY purchase_orders_manage ON purchase_orders FOR ALL TO authenticated
  USING (EXISTS (...) )
  WITH CHECK (EXISTS (...) AND status = 'draft' OR status IS NULL);
```
(Scope precisely — this needs to still allow the `receive_shipment` RPC's own status flip, which runs as `SECURITY DEFINER` and bypasses RLS entirely, so it is unaffected by this tightening.)

### WR-03: `ReceiveShipmentForm`/`PurchaseOrderForm` quantity inputs can submit `NaN` past the disabled-button guard

**File:** `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx:186`; `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx:149`

**Issue:** Both quantity `<Input type="number">` fields do `onChange={e => update(index, { quantity: Number(e.target.value) })}`. The Save/Confirm buttons guard against invalid input with `lines.some(line => !line.productId || line.quantity <= 0)`. If `Number(e.target.value)` ever evaluates to `NaN` (reachable via paste of non-numeric text, or via IME/locale input in some browsers), the comparison `NaN <= 0` is `false`, so this guard silently fails to catch it and the button stays enabled with an invalid line. In `ReceiveShipmentForm`'s case this is caught downstream by `ReceiveShipmentRequestSchema.parse()` in `callReceiveShipment` (`.int()` rejects `NaN`), surfacing as a generic client error — acceptable but unfriendly. In `PurchaseOrderForm`'s case there is no equivalent schema validation before `useMutationCreatePurchaseOrder`'s direct `supabase.insert()` call, so this compounds WR-01 (the PO row insert can succeed before the items insert fails on the DB's `quantity > 0` / `NOT NULL` constraint, since `JSON.stringify(NaN)` serializes to `null`).

**Fix:** Guard the comparison explicitly: `lines.some(line => !line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0)`.

## Info

### IN-01: `PO_ALREADY_RECEIVED` error-code propagation relies on brittle string matching through a shared, unrelated error mapper

**File:** `src/shared/lib/edge-function-contracts.ts:168-195`; `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx:86-95`

**Issue:** `mapProcessPaymentEdgeError` is a generic mapper shared with the (unrelated) payment/tab-closing flows; its `default` branch is the only path that preserves the RPC's raw code, and only inside `details`. `ReceiveShipmentForm` then does `result.error.details === 'PO_ALREADY_RECEIVED'` to special-case the toast. This works today (correctly documented in a code comment acknowledging the fragility), but any future edit to that shared mapper's `default` case, or any other RPC code that happens to collide via `details`, could silently break this comparison with no compiler signal, since `details` is typed as an unconstrained `string`.

**Fix:** Give `receive_shipment`-originated errors their own dedicated mapper function (or add explicit `PO_ALREADY_RECEIVED`/`PO_SUPPLIER_MISMATCH` cases to a receive-shipment-specific switch) instead of overloading the payment error mapper's catch-all `details` field.

---

_Reviewed: 2026-08-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
