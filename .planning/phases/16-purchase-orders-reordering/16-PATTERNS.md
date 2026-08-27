# Phase 16: Purchase Orders & Reordering - Pattern Map

**Mapped:** 2026-08-23
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/*_purchase_orders.sql` (schema+RLS) | migration | CRUD | `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` | exact |
| `supabase/migrations/*_receive_shipment_po.sql` (extend RPC) | migration | event-driven (atomic RPC) | `supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql` | exact |
| `supabase/functions/receive-shipment/index.ts` (extend) | route/edge-function | request-response | itself (existing file, modify) | exact |
| `src/shared/lib/edge-function-contracts.ts` (extend `ReceiveShipmentRequestSchema`) | utility/config | request-response | itself (existing file, modify) | exact |
| `src/shared/lib/domain.ts` (add `PurchaseOrderSchema`, `PurchaseOrderItemSchema`, `PurchaseOrderStatusSchema`) | model | CRUD | `SupplierSchema`/`SupplierProductSchema` in same file | exact |
| `src/entities/purchase-order/model/types.ts` | model | CRUD | `src/entities/supplier/model/types.ts` (re-export shape) | exact |
| `src/entities/purchase-order/model/queries.ts` | model | CRUD | `src/entities/supplier/model/queries.ts` | exact |
| `src/entities/purchase-order/model/reorder-quantity.ts` (+`.test.ts`) | utility | transform | none (pure fn) — see No Analog | n/a |
| `src/entities/purchase-order/ui/PurchaseOrderStatusBadge.tsx` | component | request-response | `src/shared/ui/StatusBadge.tsx` | role-match |
| `src/entities/purchase-order/index.ts` | config (barrel) | n/a | `src/entities/supplier/index.ts` | exact |
| `src/features/create-purchase-order/model/useCreatePurchaseOrder.ts` (+update) | service/hook | CRUD | `useMutationCreateSupplier`/`useMutationUpdateSupplier` in `src/entities/supplier/model/queries.ts` (pattern), and hook-splitting style of `src/features/receive-shipment/model/useReceiveShipment.ts` | exact |
| `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx` | component | request-response | `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` (line-item grid) + `src/features/manage-suppliers/ui/SupplierForm.tsx` (form scaffold) | exact |
| `src/features/suggest-reorder/model/useSuggestReorder.ts` | service/hook | CRUD (read-only) | `useSupplierProductIds` in `src/entities/supplier/model/queries.ts` (read-only join query shape) | role-match |
| `src/features/receive-po-shipment/ui/ReceivePOButton.tsx` (or prop extension on `ReceiveShipmentForm`) | component | request-response | `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` itself (extend, don't fork) | exact |
| `src/widgets/PurchaseOrderListPanel.tsx` | component | request-response | `src/widgets/SupplierListPanel.tsx` | exact |
| `src/widgets/PurchaseOrderDetailPanel.tsx` | component | request-response | `src/widgets/SupplierListPanel.tsx` (dialog/detail sub-pattern) | role-match |
| `src/app/purchase-orders-route.tsx` | middleware/route-guard | request-response | `src/app/reports-route.tsx` | exact |
| `src/app/router.tsx` (add route) | route | request-response | existing `/suppliers`/`/reports` entries in same file | exact |
| `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (add tile) | component | request-response | existing `ITEMS` array entries in same file | exact |
| `e2e/56-purchase-orders.spec.ts` | test | request-response | `e2e/53-supplier-receiving.spec.ts` | exact |

## Pattern Assignments

### `src/entities/purchase-order/model/queries.ts` (model, CRUD)

**Analog:** `src/entities/supplier/model/queries.ts` (full file, 196 lines — read in full this session)

**Imports pattern** (lines 1-16):
```typescript
/* eslint-disable i18next/no-literal-string */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Supplier, SupplierCreate, SupplierUpdate } from '@shared/lib/domain';
import { SupplierSchema } from '@shared/lib/domain';
import {
  err, notFoundError, ok, supabaseMutation, supabaseQuery, unknownError, type Result,
} from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@shared/lib/supabase.types';
```
Per CLAUDE.md's "Missing generated types workaround" — since `purchase_orders`/`purchase_order_items` won't be in `supabase.types.ts` until regenerated post-migration, use `const db = supabase as any` with a file-level `/* eslint-disable */` in this new file instead of `import type { Tables, ... }`, then remove once types are regenerated.

**Query-keys + map/row translator pattern** (lines 17-56):
```typescript
export const supplierKeys = {
  all: ['suppliers'] as const,
  detail: (id: string) => ['suppliers', id] as const,
  products: (id: string) => ['suppliers', id, 'products'] as const,
};
function map(row: Record<string, unknown>): Result<Supplier> {
  try {
    return ok(SupplierSchema.parse({ id: row.id, name: row.name, contactName: row.contact_name, ... }));
  } catch (e) { return err(unknownError(e)); }
}
function row(input: {...}) {
  const value: Record<string, unknown> = {};
  if (input.name !== undefined) value.name = input.name;
  ...
  return value;
}
```
Mirror this exactly for `purchase_order`(`s_items`): a `mapPO`/`rowPO` pair for `purchase_orders`, a second pair for `purchase_order_items` (nested array select).

**Core CRUD read/mutation pattern** (lines 57-93, 142-196):
```typescript
export function useSuppliers() {
  const query = useQuery({
    queryKey: supplierKeys.all,
    queryFn: async (): Promise<Result<Supplier[]>> => {
      const res = await supabaseQuery(() => supabase.from('suppliers').select('*').order('name'));
      if (!res.ok) return res;
      const values: Supplier[] = [];
      for (const item of res.data) { const parsed = map(item); if (!parsed.ok) return parsed; values.push(parsed.data); }
      return ok(values);
    },
    staleTime: 60_000,
  });
  const result = query.data;
  return { ...query, data: result?.ok ? result.data : undefined, resultError: result && !result.ok ? result.error : undefined, isEmpty: query.isSuccess && !!result?.ok && result.data.length === 0 };
}
export function useMutationCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input): Promise<Result<Supplier>> => {
      const r = await supabaseMutation<Tables<'suppliers'>>(() => supabase.from('suppliers').insert(row(fields)).select('*').single());
      if (!r.ok) return r;
      if (r.data === null) return err(notFoundError('Supplier'));
      return map(r.data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}
```
Apply this shape 1:1 for `usePurchaseOrders()`, `usePurchaseOrder(id)` (single, with joined line items via `.select('*, purchase_order_items(*)')`), `useMutationCreatePurchaseOrder` (insert PO row, then insert items — mirrors `syncSupplierProducts`'s two-step insert), `useMutationUpdatePurchaseOrderItems`.

**Nested insert-after-parent pattern** (`syncSupplierProducts`, lines 109-124) — copy for inserting `purchase_order_items` right after the `purchase_orders` row is created:
```typescript
export async function syncSupplierProducts(supplierId: string, productIds: readonly string[]): Promise<Result<null>> {
  const del = await supabaseMutation(() => supabase.from('supplier_products').delete().eq('supplier_id', supplierId));
  if (!del.ok) return del;
  return productIds.length
    ? supabaseMutation(() => supabase.from('supplier_products').insert(productIds.map(product_id => ({ supplier_id: supplierId, product_id }))))
    : ok(null);
}
```

---

### `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx` (component, request-response)

**Analogs:** `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` (line-item grid, 267 lines, read in full) + `src/features/manage-suppliers/ui/SupplierForm.tsx` (form scaffold/submit pattern, 129 lines, read in full)

**Imports pattern** (ReceiveShipmentForm.tsx lines 1-15):
```typescript
/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import { useState } from 'react';
import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProductsForManagement } from '@entities/product';
import { useSuppliers } from '@entities/supplier';
import { EmptyState } from '@shared/ui/EmptyState';
import { FormField } from '@shared/ui/FormField';
import { MoneyInput } from '@shared/ui/MoneyInput';
import { POSButton } from '@shared/ui/POSButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Input } from '@shared/ui/input';
```

**Supplier-first `<select>` pattern** (lines 115-128) — copy verbatim for the PO form's supplier picker (per UI-SPEC.md: plain `<select>`, not shadcn `Select`):
```tsx
<FormField label={t('receiveShipment.supplier')}>
  <select className="border-input bg-background h-10 w-full rounded-md border px-3"
    value={supplierId} onChange={e => setSupplierId(e.target.value)}>
    <option value="" />
    {suppliers?.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}
  </select>
</FormField>
```

**Line-item grid + empty state + submit-disabled-guard pattern** (lines 24-30, 129-203, 243-262) — reuse for PO lines (drop the expiry `<Input type="date">` column per UI-SPEC.md D-line-item rule; UI-SPEC also specifies `gap-4`/`pb-4` not this file's legacy `gap-2`/`pb-3`):
```tsx
type Line = { productId: string; search: string; quantity: number; costPrice: number };
const blank = (): Line => ({ productId: '', search: '', quantity: 1, costPrice: 0 });
...
{lines.length === 0 ? (
  <EmptyState icon={Package} title={t('...emptyTitle')} description={t('...emptyBody')} />
) : (
  <div className="max-h-72 space-y-3 overflow-y-auto">
    {lines.map((line, index) => (
      <div className="grid grid-cols-1 gap-2 border-b pb-3 md:grid-cols-6" key={index}>
        <Input className="md:col-span-2" value={line.search} onChange={...} />
        <Input type="number" min="1" value={line.quantity} onChange={e => update(index, { quantity: Number(e.target.value) })} />
        <MoneyInput label={t('cost')} value={line.costPrice} onChange={costPrice => update(index, { costPrice })} />
        <POSButton type="button" variant="destructive" onClick={() => setLines(v => v.filter((_, i) => i !== index))}>×</POSButton>
      </div>
    ))}
  </div>
)}
...
<POSButton type="button" onClick={() => void submit()}
  disabled={!supplierId || lines.length === 0 || lines.some(line => !line.productId || line.quantity <= 0)}>
  {t('save')}
</POSButton>
```

**Form-submit dual create/update dispatch pattern** (SupplierForm.tsx lines 44-56):
```typescript
const submit = (e: SyntheticEvent) => {
  e.preventDefault();
  const value = { ...fields };
  initialSupplier ? onSubmitUpdate({ ...value, id: initialSupplier.id }) : onSubmitCreate(value);
};
```

**Cost-default lookup (D-05/D-06):** when a manager picks a product for a line, default `costPrice` from `inventory.costPrice` (fall back to `0` if null) — same fallback `ReceiveShipmentForm`'s `blank()`/quick-add flow already uses (`costPrice: 0` in `blank()`, line 28).

---

### `src/entities/purchase-order/ui/PurchaseOrderStatusBadge.tsx` (component, request-response)

**Analog:** `src/shared/ui/StatusBadge.tsx` (full file, 130 lines, read in full)

**Status-config-map pattern** (lines 38-103) — add two new keys, don't fork the component:
```typescript
const statusConfig: Record<string, StatusConfig> = {
  ...
  po_draft: { labelKey: 'statusBadge.poDraft', variant: 'secondary' },
  po_received: { labelKey: 'statusBadge.poReceived', variant: 'default', className: 'bg-primary text-primary-foreground hover:opacity-90' },
};
```
Per UI-SPEC.md Color section this maps to existing `closed`/`paid` treatments. Simplest approach: add `po_draft`/`po_received` directly into `StatusBadge`'s existing `statusConfig` map and extend its `status` union type (reuse the shared component, do not build a separate `PurchaseOrderStatusBadge` unless the union-type edit is judged too invasive — UI-SPEC only requires the two badge keys to exist, not a dedicated component).

---

### `src/widgets/PurchaseOrderListPanel.tsx` (component, request-response)

**Analog:** `src/widgets/SupplierListPanel.tsx` (full file, 142 lines, read in full)

**Loading/empty/list/dialog/confirm-delete composition pattern** (whole file) — copy the control flow exactly, swap `<ul>` rows for `DataTable` per UI-SPEC.md's explicit instruction (multi-column list, not single-name-per-row):
```tsx
const { data: purchaseOrders, isLoading, resultError } = usePurchaseOrders();
...
if (isLoading) return (<div className="space-y-4"><TableRowSkeleton columns={5} />...</div>);
if (purchaseOrders?.length === 0) return (<EmptyState icon={...} title={...} action={{ label: ..., onClick: () => setOpen(true) }} />);
...
<ConfirmDialog open={!!deleteId} title={t('deletePurchaseOrderTitle')} description={t('deletePurchaseOrderBody')}
  confirmLabel={t('delete')} variant="destructive" onCancel={...} onConfirm={...} />
```
Icon-only delete button needs `aria-label` per UI-SPEC.md List Contract (not present in `SupplierListPanel`'s text-label delete button — new requirement, add it).

---

### `src/app/purchase-orders-route.tsx` (middleware/route-guard, request-response)

**Analog:** `src/app/reports-route.tsx` (full file, 15 lines, quoted verbatim in RESEARCH.md and reproduced here)

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@entities/staff/model/usePermissions';

type PurchaseOrdersRouteProps = { children: ReactNode };

export function PurchaseOrdersRoute({ children }: PurchaseOrdersRouteProps) {
  const { can } = usePermissions();
  if (!can('manage_products')) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
```
Copy verbatim, change the permission string only.

---

### `supabase/migrations/*_purchase_orders.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` (lines 1-53, read this session)

**Table + RLS pattern to copy, WITH THE DELIBERATE DIVERGENCE noted in RESEARCH.md Pitfall 2** — use `FOR ALL` including SELECT, not a separate `USING (true)` SELECT policy:
```sql
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'received')),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  cost_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0)
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_manage ON purchase_orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
CREATE POLICY purchase_order_items_manage ON purchase_order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
Note the divergence from `suppliers_select_authenticated ... USING (true)` — do NOT add an open SELECT policy here (RESEARCH.md Pitfall 2).

---

### `receive_shipment` RPC extension (migration, event-driven atomic)

**Analog:** `supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql` (current full RPC body, lines 5-95+, read this session — signature and role-check/not-found-guard style shown below)

```sql
CREATE OR REPLACE FUNCTION receive_shipment(p_staff_id uuid, p_supplier_id uuid, p_items jsonb, p_po_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shipment_id uuid;
  ...
BEGIN
  ...
  PERFORM 1 FROM profiles p JOIN role_permissions rp ON rp.role = p.role
    WHERE p.id = p_staff_id AND rp.action = 'adjust_inventory';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to receive shipments');
  END IF;
  -- NEW: reject double-receive before mutating anything (mirrors this file's own not-found-guard idiom)
  IF p_po_id IS NOT NULL THEN
    PERFORM 1 FROM purchase_orders WHERE id = p_po_id AND status = 'received';
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PO_ALREADY_RECEIVED', 'message', 'Purchase order already received');
    END IF;
  END IF;
  ... -- existing per-line loop, unchanged
  -- NEW: immediately before final RETURN
  IF p_po_id IS NOT NULL THEN
    UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = p_po_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'shipmentId', v_shipment_id);
END;
$$;
```
Add matching `p_po_id` plumbing to `supabase/functions/receive-shipment/index.ts`'s `BodySchema` and `admin.rpc(...)` call, and to `ReceiveShipmentRequestSchema`/`callReceiveShipment` in `src/shared/lib/edge-function-contracts.ts` (all three layers, per RESEARCH.md Pattern 1).

---

### `e2e/56-purchase-orders.spec.ts` (test, request-response)

**Analog:** `e2e/53-supplier-receiving.spec.ts` — service-role fixture setup/teardown, `loginAs(page, 'manager')`/`loginAs(page, 'cashier')` shape. Not re-read in full this session (RESEARCH.md already quotes/verifies its `createSupplier`/`openQuickAdd` helper shape) — planner/executor should read it directly when writing the spec.

## Shared Patterns

### Result<T> + supabaseQuery/supabaseMutation wrapper
**Source:** `src/shared/lib/result.ts` (used throughout `src/entities/supplier/model/queries.ts`)
**Apply to:** every new `entities/purchase-order/model/queries.ts` function — never call `supabase.from(...)` unwrapped.

### RBAC gate via `manage_products`
**Source:** `src/shared/lib/rbac.ts` (`MANAGER_EXTRA` set, unchanged per D-01)
**Apply to:** `PurchaseOrdersRoute`, `HomeDashboard.tsx` new tile's `requiredAction`, and both new tables' RLS policies.

### Toast + inline-error dual feedback
**Source:** `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` (`toast.success(...)` on success, `<p className="text-sm text-destructive">` on failure) and `src/widgets/SupplierListPanel.tsx` (`toast.error(result.error.message)` in mutation callbacks)
**Apply to:** `PurchaseOrderForm.tsx` save flow, `PurchaseOrderDetailPanel.tsx` receive flow.

### Missing-generated-types workaround
**Source:** CLAUDE.md "Missing generated types workaround" section
**Apply to:** `src/entities/purchase-order/model/queries.ts` until `npx supabase gen types typescript --local` is rerun after the schema migration lands — use `const db = supabase as any` + file-level `/* eslint-disable */`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/entities/purchase-order/model/reorder-quantity.ts` | utility | transform | Pure D-07/D-08 top-up-and-round formula has no existing analog in the codebase (first reorder-math utility) — implement directly from CONTEXT.md's D-07/D-08 spec: `Math.max(0, lowStockThreshold - quantityOnHand)`, then round up to nearest multiple of `unitsPerPackage` if set. Unit-test with Vitest/fast-check per RESEARCH.md's Validation Architecture, not copied from an analog. |
| `src/features/suggest-reorder/model/useSuggestReorder.ts` (the 3-way join: inventory ⋈ products ⋈ supplier_products, scoped to one supplier and filtered to at/below threshold) | service/hook | CRUD (read-only, multi-table join) | No existing hook in this codebase performs a 3-table join scoped by a dynamic supplier filter — `useSupplierProductIds`/`useInventoryStore.lowStockAlerts` each cover half the problem (RESEARCH.md Pitfall 3). Compose the query from `supabaseQuery` primitives following `entities/supplier/model/queries.ts`'s general shape, not a literal analog copy. |

## Metadata

**Analog search scope:** `src/entities/supplier/`, `src/features/receive-shipment/`, `src/features/manage-suppliers/`, `src/widgets/SupplierListPanel.tsx`, `src/shared/ui/StatusBadge.tsx`, `src/app/reports-route.tsx`, `supabase/migrations/20260817000001_*.sql`, `supabase/migrations/20260819000003_*.sql`
**Files scanned:** ~10 read in full, plus grep/glob across `src/widgets`, `src/entities`, `src/features`
**Pattern extraction date:** 2026-08-23
