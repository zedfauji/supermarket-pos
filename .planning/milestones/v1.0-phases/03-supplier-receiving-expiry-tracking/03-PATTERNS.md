# Phase 3: Supplier, Receiving & Expiry Tracking - Pattern Map

**Mapped:** 2026-08-14
**Files analyzed:** 20 (net-new/modified)
**Analogs found:** 20 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/<ts>_suppliers_receiving_expiry.sql` (tables: `suppliers`, `supplier_products`, `shipments`; columns: `inventory.cost_price`, `inventory.expiry_date`) | migration | CRUD/DDL | `supabase/migrations/20260419000001_settings_and_backups.sql` (table+RLS shape), `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (role_permissions RLS policy) | role-match |
| `receive_shipment()` Postgres RPC (in same migration) | service (DB function) | event-driven / atomic multi-effect | `process_direct_sale_atomic` in `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` | exact |
| `supabase/functions/receive-shipment/index.ts` | route (edge function) | request-response | `supabase/functions/process-direct-sale/index.ts` | exact |
| `src/shared/lib/domain.ts` (add `SupplierSchema`, `SupplierCreateSchema`, `SupplierProductSchema`, `ShipmentSchema`/line-item schema, extend `InventorySchema` with `costPrice`/`expiryDate`, extend `SettingsKeySchema` + `NearExpirySettingsSchema`) | model (Zod schema) | transform | existing `TipDistributionSettingsSchema` (domain.ts:748-754), `CajaEntrySchema` (domain.ts:821-831), `InventorySchema` (domain.ts:508-515) | exact |
| `src/shared/lib/edge-function-contracts.ts` (add `callReceiveShipment`, `ReceiveShipmentRequestSchema`, envelope schema) | service (client API wrapper) | request-response | `callProcessDirectSale` (edge-function-contracts.ts:381-420) | exact |
| `src/entities/supplier/model/types.ts` | model | transform | `src/entities/inventory/model/types.ts` | exact |
| `src/entities/supplier/model/queries.ts` (`useSuppliers`, `useSupplierProducts`, `useMutationCreateSupplier`, `useMutationUpdateSupplier`, `useMutationDeleteSupplier`) | model (TanStack Query hooks) | CRUD | `src/entities/inventory/model/queries.ts` (`useInventory`, `useMutationAdjustInventory`) | exact |
| `src/entities/supplier/ui/SupplierRow.tsx` | component | CRUD (display) | `src/entities/inventory/ui/InventoryRow.tsx` (or equivalent row component) | role-match |
| `src/entities/inventory/model/queries.ts` — ADD `useNearExpiryAlerts()` | model (TanStack Query hook) | CRUD (read, threshold filter) | `useInventoryAlerts()` in same file (queries.ts:166-231) | exact |
| `src/entities/inventory/ui/NearExpiryBadge.tsx` | component | request-response (read-only) | `src/entities/inventory/ui/LowStockBadge.tsx` (full 21-line file) | exact |
| `src/features/manage-suppliers/ui/SupplierForm.tsx` | component (form) | CRUD | `src/features/manage-products/ui/ProductForm.tsx` (full form + modifier multi-select at lines 348-379) | exact |
| `src/features/manage-suppliers/model/useSupplierMutations.ts` (or reuse entity mutations directly) | service (mutation hook) | CRUD | `src/entities/inventory/model/queries.ts` `useMutationAdjustInventory` (optimistic update shape) | role-match |
| `src/features/receive-shipment/model/useReceiveShipment.ts` | service (mutation hook, edge-function call) | event-driven / atomic | `src/features/physical-count/model/usePhysicalCount.ts` (multi-line-item mutation) + `callProcessDirectSale` pattern | role-match |
| `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` | component (form, line-item table + quick-add) | CRUD / event-driven | `src/features/physical-count/ui/PhysicalCountForm.tsx` (line-item table dialog) | exact |
| `src/features/manage-products/ui/ProductForm.tsx` — MODIFY: add supplier multi-select (D-02) | component (form) | CRUD | same file, existing modifier multi-select block (lines 348-379) — copy-paste pattern into same file | exact |
| `src/pages/suppliers/index.tsx` | route/page | request-response | `src/pages/inventory/index.tsx` (`PageContainer`, `useLowStockToast`, panel composition) | exact |
| `src/pages/inventory/index.tsx` — MODIFY: add near-expiry tab/list next to low-stock, add `useNearExpiryToast` | route/page | request-response | same file, existing `useLowStockToast` (lines 16-47) and low-stock composition | exact |
| `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` — MODIFY: add near-expiry badge overlay on `/inventory` tile | component (widget) | request-response | same file, existing `Lock` icon absolute-positioning on gated tiles (lines 137-142) | role-match (new UI, no prior badge-overlay analog) |
| `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` | component (settings form) | CRUD | `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` (numeric-field settings tab, dirty-state pattern) | role-match |
| `src/entities/tab/ui/CartItem.tsx` — MODIFY: add near-expiry badge signal (D-06 POS checkout surface) | component | display | same file, existing modifier `Badge`s (lines 45-54) and happy-hour `Zap` icon indicator (line 72) | exact |

## Pattern Assignments

### `receive_shipment()` RPC (supplier/receiving migration)

**Analog:** `process_direct_sale_atomic` — `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql`

**Signature + guard pattern** (lines 32-43):
```sql
CREATE OR REPLACE FUNCTION public.process_direct_sale_atomic(
  p_staff_id uuid, p_shift_id uuid, p_caja_session_id uuid, p_items jsonb, p_idempotency_key text,
  ...
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ...
BEGIN
  PERFORM 1 FROM caja_sessions WHERE id = p_caja_session_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CAJA_CLOSED', 'message', 'Caja session is not open');
  END IF;
  ...
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS', 'message', 'At least one item is required');
  END IF;
```

**Row-lock + per-item loop pattern** (lines 88-92, adapt `FOR UPDATE` product lock):
```sql
FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  SELECT base_price, sold_by_weight INTO v_catalog_price, v_sold_by_weight
  FROM products WHERE id = (v_elem->>'product_id')::uuid AND is_active = true FOR UPDATE;
  IF v_catalog_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRICE_MISMATCH', ...);
  END IF;
```
For receiving: lock the `inventory` row (or absence thereof) instead, and use `INSERT ... ON CONFLICT (product_id) DO UPDATE` (see Common Pitfall #1 in RESEARCH.md — no `inventory` row is auto-provisioned for a `products` row).

**Terminal error handling** (lines 234-240):
```sql
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'DIRECT_SALE_FAILED', 'message', SQLERRM);
END;
$$;
```

**Grant pattern** (lines 242-243) — copy verbatim, adjust function signature:
```sql
REVOKE ALL ON FUNCTION public.process_direct_sale_atomic(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_direct_sale_atomic(...) TO service_role;
```

**`record_audit` call convention** — signature `[VERIFIED: 20260511000001_audit_logs_table.sql:73-79]`:
```sql
PERFORM record_audit(p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL, p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL, p_source text DEFAULT 'rpc');
```
Use `record_audit('shipment.receive', 'shipment', v_shipment_id, NULL, jsonb_build_object('supplierId', ..., 'itemCount', ...))`.

---

### RLS policies for `suppliers` / `supplier_products` / `shipments`

**Analog:** `supabase/migrations/20260510000001_rls_rewrite_phase13.sql:435-437` (`products_insert_manager_admin`, verbatim):
```sql
CREATE POLICY "products_insert_manager_admin" ON products
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
Reuse `'manage_products'` action for `suppliers`/`supplier_products`; reuse `'adjust_inventory'` for `shipments`. No new RBAC action, no `rbac.ts` edit.

---

### `src/shared/lib/edge-function-contracts.ts` — `callReceiveShipment`

**Analog:** `callProcessDirectSale` (edge-function-contracts.ts:381-420)
```typescript
export async function callProcessDirectSale(
  request: ProcessDirectSaleRequest
): Promise<Result<ProcessDirectSaleSuccess, AppError>> {
  const validatedRequest = ProcessDirectSaleRequestSchema.parse(request);
  const accessToken = getCachedAccessToken();
  if (!accessToken) return err({ code: 'AUTH_REQUIRED', message: 'Not authenticated' });
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-direct-sale`,
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
  const data: unknown = await response.json().catch(() => null);
  const envelope = ProcessDirectSaleEnvelopeSchema.safeParse(data);
  if (!response.ok || !envelope.success || !envelope.data.success) {
    const edge = envelope.success ? envelope.data.error : undefined;
    return err(mapProcessPaymentEdgeError(edge?.code, edge?.message ?? '...'));
  }
  const result = ProcessDirectSaleSuccessSchema.safeParse(envelope.data);
  return result.success ? ok(result.data) : err({ code: 'VALIDATION_ERROR', ... });
}
```
Copy this exact shape into `callReceiveShipment`, target `/functions/v1/receive-shipment`, define `ReceiveShipmentRequestSchema`/`ReceiveShipmentSuccessSchema`/envelope schema alongside it.

---

### `src/entities/supplier/model/queries.ts`

**Analog:** `src/entities/inventory/model/queries.ts` (full file, 439 lines)

**Query-key factory pattern** (lines 26-32):
```typescript
export const inventoryKeys = {
  all: ['inventory'] as const,
  product: (id: string) => [...inventoryKeys.all, 'product', id] as const,
  lowStock: () => [...inventoryKeys.all, 'low-stock'] as const,
  alerts: () => [...inventoryKeys.all, 'alerts'] as const,
  log: (productId?: string) => [...inventoryKeys.all, 'log', productId ?? 'all'] as const,
};
```
Mirror as `supplierKeys = { all, detail(id), products(supplierId) }`.

**Read query + Result-unwrap return shape** (lines 105-154):
```typescript
export function useInventory() {
  const query = useQuery({
    queryKey: inventoryKeys.all,
    queryFn: async (): Promise<Result<Inventory[]>> => {
      const res = await supabaseQuery(() => supabase.from('inventory').select(`*, product:products(*, category:categories(*))`).order('product(name)'));
      if (!res.ok) { logger.error('inventory.fetch_failed', { message: res.error.message }); return res; }
      const list: Inventory[] = [];
      for (const row of res.data as InventoryRow[]) {
        const m = mapInventoryRow(row);
        if (!m.ok) { logger.error('inventory.map_failed', { message: m.error.message }); return m; }
        list.push(m.data);
      }
      return ok(list);
    },
    staleTime: 60 * 1000,
  });
  const r = query.data;
  return { ...query, data: r?.ok ? r.data : undefined, resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0, isIdleOrLoading: query.isPending || query.isLoading };
}
```
Use this exact `Result`-unwrap return shape for `useSuppliers()`/`useSupplierProducts()`.

**Pre-type-regen cast note** (lines 1-24) — until `npx supabase gen types typescript --local` is rerun post-migration, new tables (`suppliers`, `supplier_products`, `shipments`) will need the same escape hatch used for `stock_movements`:
```typescript
/* eslint-disable */
// TODO(...): Remove this eslint-disable and the `db` cast below once supabase.types.ts is regenerated.
const db = supabase as any;
```
Per RESEARCH.md Pitfall #2, this phase is expected to run the regen and remove the *existing* `stock_movements` casts too — do the same for new tables from the start if the migration lands before types are regenerated, then remove once regenerated.

**Mutation pattern with optimistic update + rollback** (lines 235-375, `useMutationAdjustInventory`) — mirror for `useMutationCreateSupplier`/`useMutationUpdateSupplier`: `onMutate` snapshot + optimistic set, `onSuccess` invalidate, `onError` rollback to snapshot.

---

### `src/entities/inventory/model/queries.ts` — `useNearExpiryAlerts()`

**Analog:** `useInventoryAlerts()` in the same file (lines 156-231), copy structure verbatim, only the filter/threshold source and schema differ:
```typescript
export function useInventoryAlerts() {
  const query = useQuery({
    queryKey: inventoryKeys.alerts(),
    queryFn: async (): Promise<Result<InventoryAlert[]>> => {
      const res = await supabaseQuery(() =>
        supabase.from('inventory').select(`quantity_on_hand, product:products!inner(id, name, stock_threshold)`)
          .not('product.stock_threshold', 'is', null)
      );
      if (!res.ok) { logger.error('inventory.alerts.fetch_failed', { message: res.error.message }); return res; }
      const alerts: InventoryAlert[] = [];
      for (const row of res.data as Array<{...}>) {
        if (!row.product || row.product.stock_threshold === null) continue;
        const threshold = row.product.stock_threshold;
        if (row.quantity_on_hand > threshold) continue;
        try { alerts.push(InventoryAlertSchema.parse({...})); } catch (e) { return err(unknownError(e)); }
      }
      return ok(alerts);
    },
    staleTime: 30 * 1000,
  });
  const r = query.data;
  return { ...query, data: r?.ok ? r.data : undefined, resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0, isIdleOrLoading: query.isPending || query.isLoading };
}
```
For `useNearExpiryAlerts`: select `expiry_date` + product name, filter `.not('expiry_date', 'is', null)`, fetch threshold from `settings` (key=`'near_expiry'`) first (or pass a constant default 14 and let the server-side query do `expiry_date <= CURRENT_DATE + p_days` per RESEARCH.md's recommendation), add `inventoryKeys.nearExpiry()` to the key factory.

---

### `src/entities/inventory/ui/NearExpiryBadge.tsx`

**Analog:** `src/entities/inventory/ui/LowStockBadge.tsx` (full file, copy near-verbatim):
```tsx
import { useTranslation } from 'react-i18next';
import { Badge } from '@shared/ui/badge';
import { useInventoryAlerts } from '../model/queries';

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
For `NearExpiryBadge`: swap `useInventoryAlerts` → `useNearExpiryAlerts`, `variant="destructive"` → the amber `--pos-warning` token per UI-SPEC (not `destructive` — advisory, not blocking), `data-testid="near-expiry-badge"`, i18n key `nearExpiryBadge.count`.

---

### `src/features/manage-suppliers/ui/SupplierForm.tsx` — multi-select block

**Analog:** `src/features/manage-products/ui/ProductForm.tsx:348-379` (modifier checkbox multi-select, exact structure for D-02's product↔supplier multi-select):
```tsx
<FormField label={t('manageProducts.productForm.modifiersLabel')} error={fieldErrors.modifiers ?? ''}>
  <ScrollArea className="max-h-40 rounded-md border p-2">
    <ul className="space-y-2 pr-2">
      {sortedModifiers.length === 0 ? (
        <li className="text-muted-foreground text-sm">{t('manageProducts.productForm.noModifiersDefined')}</li>
      ) : (
        sortedModifiers.map(m => (
          <li key={m.id} className="flex items-center gap-2">
            <Checkbox id={`mod-${m.id}`} checked={modifierIds.includes(m.id)}
              onCheckedChange={() => { toggleModifier(m.id); }} disabled={submitting} />
            <label htmlFor={`mod-${m.id}`} className="text-sm">{m.name}</label>
          </li>
        ))
      )}
    </ul>
  </ScrollArea>
</FormField>
```
Use this exact `Checkbox` + `ScrollArea` + `toggleX(id)` shape for both the Supplier form's product multi-select and (D-02) the Product form's supplier multi-select — same file (`ProductForm.tsx`) gets a second identical block wired to `supplierIds`/`toggleSupplier`.

**Submit button footer pattern** (ProductForm.tsx bottom, same excerpt) — copy the `POSButton` cancel/submit footer with `touchSize="default"` and `submitting ? t('...saving') : ...` label swap.

---

### `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx`

**Analog:** `src/features/physical-count/ui/PhysicalCountForm.tsx` — multi-line-item dialog form (product picker + quantity per row, add/remove row). Structural pattern to replicate for the receiving line-item table (product select | qty | `MoneyInput` for cost_price | native `<input type="date">` for expiry_date), plus the inline quick-add sub-form reusing `useMutationCreateProduct` (`src/entities/product/model/queries.ts`, lines 404-466) for D-03.

---

### `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx`

**Analog:** `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` (numeric-field settings tab, dirty-state pattern):
```tsx
export function BillingSettingsTab({ currentRole }: Props) {
  const { t } = useTranslation('wAdmin');
  const { data } = useSettings();
  const updateSetting = useMutationUpdateSetting();
  const [form, setForm] = useState<BillingForm>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!data) return;
    if (!dirty) { setForm({ taxRatePercent: String(data.billing.taxRatePercent), ... }); }
  }, [data]);
  // ... form fields bound to `form`, setDirty(true) on change, save button calls updateSetting.mutate
}
```
For `NearExpirySettingsTab`: single numeric field `thresholdDays` (default 14, `min=1 max=365`), `settings` key `'near_expiry'`, admin-only (do NOT add `'near_expiry'` to the manager-scoped `key IN ('billing', 'pool_tables')` RLS allowlist — see Common Pitfall #3 in RESEARCH.md).

---

### `src/entities/tab/ui/CartItem.tsx` — near-expiry signal (D-06 POS surface)

**Analog:** existing modifier `Badge`s (lines 45-54) and happy-hour `Zap` icon indicator (line 72) in the same file — add an amber `Badge` "Expires {date}" inline next to the product name, following the existing badge placement pattern, gated on whether the cart line's product has a near-expiry `expiry_date` (requires either extending `CartItemType.product` with expiry or a separate `inventory` lookup by `productId` — Open Question #2 in RESEARCH.md, planner's discretion; badge over toast recommended, no new interruptive logic needed).

## Shared Patterns

### Atomic RPC + Edge Function pairing
**Source:** `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` + `supabase/functions/process-direct-sale/index.ts` + `edge-function-contracts.ts:381-420`
**Apply to:** `receive_shipment` RPC, `receive-shipment` edge function, `callReceiveShipment` — every multi-effect, must-not-partially-fail mutation in this phase.

### `role_permissions`-backed RLS (not hardcoded role checks)
**Source:** `supabase/migrations/20260510000001_rls_rewrite_phase13.sql:435-437`
**Apply to:** All RLS policies on `suppliers`, `supplier_products`, `shipments`. Reuse `'manage_products'` and `'adjust_inventory'` actions — no new RBAC action needed.

### Result-unwrap query return shape
**Source:** `src/entities/inventory/model/queries.ts` (every `useQuery` in the file ends with the same `{ ...query, data, resultError, isEmpty, isIdleOrLoading }` spread)
**Apply to:** All new `entities/supplier` and `useNearExpiryAlerts` query hooks — keep the return shape identical for consistency with every other entity hook in the codebase.

### Low-stock-alert trio → near-expiry-alert trio
**Source:** `useInventoryAlerts` (queries.ts:166-231) + `LowStockBadge.tsx` (full file) + `useLowStockToast` (`src/pages/inventory/index.tsx:16-47`)
**Apply to:** `useNearExpiryAlerts`, `NearExpiryBadge`, a new `useNearExpiryToast` — structural 1:1 copy, only query filter/schema/copy/color token differ (amber `--pos-warning`, not `destructive` red — see UI-SPEC Color section).

### Zod domain schema extension pattern
**Source:** `TipDistributionSettingsSchema` (domain.ts:748-754), `InventorySchema` (domain.ts:508-515)
**Apply to:** `SupplierSchema`, `SupplierCreateSchema`, `SupplierProductSchema`, extended `InventorySchema` (`costPrice`, `expiryDate`), extended `SettingsKeySchema` + new `NearExpirySettingsSchema`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` badge overlay | component | display | No existing badge-overlay mechanism on any Home tile today (confirmed via full-file read, RESEARCH.md Pitfall #5) — only the `Lock` icon absolute-positioning technique is reusable as a scaffold, not a direct badge analog. Treat as new UI construction, not a wire-up. |

## Metadata

**Analog search scope:** `src/entities/`, `src/features/`, `src/widgets/`, `src/pages/`, `src/shared/lib/`, `supabase/migrations/`, `supabase/functions/`
**Files scanned:** ~15 read/grepped directly this session (plus full RESEARCH.md/CONTEXT.md/UI-SPEC.md source citations reused)
**Pattern extraction date:** 2026-08-14
