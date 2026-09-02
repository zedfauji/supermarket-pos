# Phase 27: Promotions & Discount Management - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 15 (new/modified, per CONTEXT.md + RESEARCH.md)
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/lib/domain.ts` (Promotion* schemas, `NearExpirySettingsSchema.discountPercent`, `DiscountScopeSchema` retire values) | model/schema | CRUD | `CategorySchema`/`NearExpiryAlertSchema` in same file | exact |
| `src/entities/promotion/model/types.ts` | model | CRUD | `src/entities/category/model/types.ts` | exact |
| `src/entities/promotion/model/queries.ts` (`usePromotions`, `useMutationCreate/Update/DeactivatePromotion`) | model/hook | CRUD | `src/entities/category/model/queries.ts` | exact |
| `src/entities/promotion/model/promotion-pricing.ts` (`evaluateBestPromotion`, pure fn) | utility/transform | transform | `supabase/functions/_shared/tax.ts` (`decomposeTax`, zero-import pure fn pattern) | role-match |
| `src/entities/promotion/ui/PromotionCard.tsx` (if needed) | component | request-response | `src/entities/category` has no `ui/`; use `src/entities/staff/ui/*` row-card pattern | partial |
| `src/features/manage-promotions/` (CRUD form/dialog, admin-only) | feature | CRUD | `src/features/manage-categories/` | exact |
| `src/features/apply-promotion-at-payment/` (payment-screen promotion selector) | feature | request-response | `src/features/process-refund/` (manager-gated payment-screen action) | role-match |
| `src/app/promotions-route.tsx` | route guard | request-response | `src/app/audit-route.tsx` | exact |
| `src/app/router.tsx` (register `/promotions`) | route | request-response | existing `/audit` route block, same file | exact |
| `src/pages/PromotionsPage.tsx` | page | request-response | `src/pages/audit/index.tsx` (or `suppliers/index.tsx`) | exact |
| `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (add `/promotions` tile) | component/config | request-response | existing `/settings` tile entry, same file | exact |
| `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` (add `discountPercent` field) | component | CRUD | same file, existing `thresholdDays` field | exact |
| `src/widgets/PaymentPane/ui/PaymentPane.tsx` (add "apply promotion" control) | component | request-response | same file, existing ad-hoc discount field + `ManagerPinDialog` wiring | exact |
| `src/shared/lib/rbac.ts` (add `manage_promotions`, `apply_custom_discount` actions) | config | CRUD | existing `STAFF_ACTIONS`/`MANAGER_EXTRA`/admin-only block, same file | exact |
| `supabase/migrations/<ts>_promotions_schema.sql` | migration | CRUD | `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` | exact |
| `supabase/migrations/<ts>_process_direct_sale_atomic_promotions.sql` | migration/RPC | request-response | `supabase/migrations/20260831000005_tax_inclusive_mode.sql` | exact |
| `supabase/functions/process-direct-sale/index.ts` (extend BodySchema/forwarded params) | route/edge-fn | request-response | same file, existing param-forwarding block | exact |
| `e2e/promotions/*.spec.ts` (new folder) | test | request-response | `e2e/suppliers/*.spec.ts` (CRUD + RLS denial pattern) | role-match |

## Pattern Assignments

### `src/entities/promotion/model/queries.ts` (model/hook, CRUD)

**Analog:** `src/entities/category/model/queries.ts` (full file read)

**Imports pattern:**
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryCreate, CategoryUpdate } from '@shared/lib/domain';
import { CategorySchema } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import { err, ok, supabaseMutation, supabaseQuery, unknownError, type Result } from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@shared/lib/supabase.types';
```

**Query key + row-mapper pattern** (lines 22-48):
```typescript
const CATEGORY_QUERY_KEY = ['categories'] as const;

function mapCategoryRow(row: Tables<'categories'>): Result<Category> {
  try {
    return ok(CategorySchema.parse({ /* snake_case row -> camelCase domain fields */ }));
  } catch (e) {
    return err(unknownError(e));
  }
}
```
Use `['promotions']` as the query key; `mapPromotionRow` parses via `PromotionSchema`. **Do not** copy the `happyHourStart: null` dead-field mapping lines (36-39) — that is exactly the vestigial trap CONTEXT.md/RESEARCH.md flag; the new promotion entity has no such field.

**Query pattern** (lines 70-108) — `useCategories()`:
```typescript
export function usePromotions() {
  const query = useQuery({
    queryKey: PROMOTION_QUERY_KEY,
    queryFn: async (): Promise<Result<Promotion[]>> => {
      const res = await supabaseQuery(() => supabase.from('promotions').select('*').order('created_at'));
      // ... map rows, return ok(promotions)
    },
    staleTime: 5 * 60 * 1000,
  });
  const r = query.data;
  return { ...query, data: r?.ok ? r.data : undefined, resultError: r && !r.ok ? r.error : undefined, isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0, isIdleOrLoading: query.isPending || query.isLoading };
}
```

**Mutation pattern** (lines 114-175) — `useMutationCreateCategory`/`useMutationUpdateCategory`: build a `TablesInsert<'promotions'>`/`TablesUpdate<'promotions'>` row from camelCase input, `supabaseMutation(...)`, `onSuccess` invalidates `PROMOTION_QUERY_KEY` (and `['products']`-equivalent if a promotion-aware query needs invalidation, e.g. cart pricing).

**Error handling:** every failure path returns `Result<T>` via `err(unknownError(e))`/`res` propagation and logs via `logger.error('promotions.<op>_failed', { message })` — matches `logger.error('categories.fetch_failed', ...)` exactly.

---

### `src/entities/promotion/model/promotion-pricing.ts` (utility/transform, pure)

**Analog:** `supabase/functions/_shared/tax.ts` (`decomposeTax`) — the zero-import, independently-testable pure-function shape used for Phase 24's cross-boundary math, per RESEARCH.md Pitfall 1.

**Core pattern:** write `evaluateBestPromotion(product, activePromotions, nearExpirySettings): { promotionId, discountRate, discountAmount, discountedUnitPrice } | null` with **zero imports** beyond types, so it is trivially unit-testable and mirrors 1:1 (not literally shared, per Pitfall 1) with the plpgsql body in the RPC migration. Add a `fast-check` property test file alongside it, mirroring `src/shared/lib/__tests__/edge-tax.test.ts`'s `fc.property` structure — that file is the direct analog for the parity/property-test approach (best-price-wins across a random matrix, tie-break by creation date, floor-guard boundary exactly at cost).

---

### `src/features/manage-promotions/` (feature, CRUD)

**Analog:** `src/features/manage-categories/`

Mirror its folder shape (1 mutation hook + 1 form/dialog UI component) exactly. RBAC-gate the UI entry point with `manage_promotions` (new admin-only action) instead of `manage_products`.

---

### `src/features/apply-promotion-at-payment/` (feature, request-response, manager-gated for ad-hoc path)

**Analog:** `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (full file) for the below-cost override / ad-hoc-discount PIN gate, reused verbatim:

```typescript
export interface ManagerPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredAction: StaffAction;   // new value: 'apply_custom_discount'
  onSuccess: () => void;
}
```
Key gotcha baked into this component already (lines 36-55): the dialog stays mounted across open/close cycles and resets `pin`/`error` state during render (not `useEffect`) when `open` transitions — copy this exact pattern if building any new dialog variant; do not re-derive it. `eligibleStaff` is filtered via `canAccess(s.role, requiredAction)` from `@shared/lib/rbac` — the client PIN check is UX-only, so the RPC must independently re-check role server-side (see RPC pattern below).

For the "apply an existing active promotion" (non-PIN) path at payment, no PIN dialog is needed — it's a simple selector reading `usePromotions()` filtered to active promotions matching the cart's line items; closest UI analog is the existing discount-field control already on `PaymentPane`.

---

### `src/app/promotions-route.tsx` (route guard, request-response)

**Analog:** `src/app/audit-route.tsx` (full file, copy verbatim with substitutions):
```typescript
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePermissions } from '@entities/staff/model/usePermissions';

type PromotionsRouteProps = { children: ReactNode };

export function PromotionsRoute({ children }: PromotionsRouteProps) {
  const { can } = usePermissions();
  if (!can('manage_promotions')) {
    toast.error('This page is restricted to admins.');
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
```
Register in `src/app/router.tsx` following the existing `AuditRoute`/`ReportsRoute` import + `<Route path="/audit" element={<ProtectedRoute><AuditRoute>...</AuditRoute></ProtectedRoute>} />` nesting pattern (lines 6-9, 76-83).

---

### `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (add tile)

**Analog:** existing `/settings` tile entry (admin-only precedent, same file):
```typescript
{
  path: '/settings',
  labelKey: 'homeDashboard.tiles.settings',
  icon: Settings,
  requiredAction: 'manage_settings',
  managerLabelKey: 'homeDashboard.managerLabels.admin',
},
```
Add an identical entry for `/promotions` with `requiredAction: 'manage_promotions'`, `managerLabelKey: 'homeDashboard.managerLabels.admin'`, and a suitable icon (e.g. `Tag`/`Percent` from lucide-react, whichever is already imported elsewhere in the codebase for discount iconography — check before adding a new lucide import).

---

### `src/shared/lib/rbac.ts` (add `manage_promotions`, `apply_custom_discount`)

**Analog:** existing `STAFF_ACTIONS` array + admin-only gating pattern (lines 13-32, plus the admin-only block further down where `manage_settings`/`manage_staff`/`delete_tab`/`view_all_shifts` appear only under admin, never manager — confirmed at `supabase/migrations/20260510000001_rls_rewrite_phase13.sql:330-333`):
```typescript
export const STAFF_ACTIONS = [
  // ...existing...
  'confirm_transfer_payment',
  'dispute_transfer_payment',
  'manage_promotions',       // NEW — admin-only (PROMO-01)
  'apply_custom_discount',   // NEW — manager+ (PROMO-05/PROMO-07, mirrors process_refund gating)
] as const;
```
`manage_promotions` goes in the admin-only block only (not `MANAGER_EXTRA`/`CASHIER_ACTIONS`); `apply_custom_discount` goes wherever `process_refund` currently lives (manager+ set) since RESEARCH.md's Open Question #2 recommends mirroring that exact tier.

---

### `supabase/migrations/<ts>_promotions_schema.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` (full file)

**RLS policy pair pattern** (lines 45-48):
```sql
CREATE POLICY suppliers_select_authenticated ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_manage ON suppliers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
Apply identically to `promotions`, swapping `action = 'manage_products'` for `action = 'manage_promotions'`, and seed exactly one `role_permissions` row: `('admin', 'manage_promotions')` — no manager/cashier row (mirrors `manage_settings`'s admin-only seeding, `20260510000001_rls_rewrite_phase13.sql:330-333`).

**Column pattern for the `order_items` snapshot (PROMO-06)** — analog `supabase/migrations/20260818000002_order_items_cost_price_snapshot.sql` (full file):
```sql
ALTER TABLE order_items ADD COLUMN cost_price_snapshot numeric(10,2);
```
Mirror as:
```sql
ALTER TABLE order_items
  ADD COLUMN promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
  ADD COLUMN discount_rate numeric,
  ADD COLUMN discount_amount numeric(10,2);
```
`ON DELETE SET NULL` is load-bearing — do not use `RESTRICT`/`CASCADE` (PROMO-06 requires the numeric snapshot survive promotion deletion).

**settings extension pattern** (D-03/D-04) — analog `NearExpirySettingsSchema` in `src/shared/lib/domain.ts:831-835`:
```typescript
export const NearExpirySettingsSchema = z.object({
  thresholdDays: z.number().int().min(1).max(365).default(14),
  discountPercent: z.number().min(0).max(100).default(15), // NEW
});
```
No new `settings` key — extend the existing `near_expiry` row's JSON shape.

---

### `supabase/migrations/<ts>_process_direct_sale_atomic_promotions.sql` (migration/RPC, request-response)

**Analog:** `supabase/migrations/20260831000005_tax_inclusive_mode.sql` (full file — current live 17-param signature) + `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:69-73` for the role-check envelope pattern.

**Auth/role-check pattern to replicate inside the RPC** (for `apply_custom_discount`/below-cost override):
```sql
PERFORM 1 FROM profiles p JOIN role_permissions rp ON rp.role = p.role
  WHERE p.id = p_staff_id AND rp.action = 'apply_custom_discount';
IF NOT FOUND THEN
  RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to apply custom discount');
END IF;
```

**Critical constraint (Pitfall 5):** `CREATE OR REPLACE FUNCTION process_direct_sale_atomic` must copy the exact existing 17-parameter list verbatim and only **append** new params with defaults at the end (e.g. `p_applied_promotions jsonb DEFAULT NULL`, `p_manager_override boolean DEFAULT false`), or Postgres registers a second overload silently.

**Gate to remove/rework (Pitfall 2)** — currently at `20260831000005_tax_inclusive_mode.sql:67-70`:
```sql
IF p_discount_scope IS NOT NULL OR p_discount_type IS NOT NULL
   OR p_discount_value IS NOT NULL OR p_discount_amount IS NOT NULL THEN
  RETURN jsonb_build_object('ok', false, 'code', 'DISCOUNT_UNSUPPORTED', ...);
END IF;
```
This unconditional reject must be replaced with real handling of the ad-hoc-discount path (D-10), while promotion-application uses new, distinct params.

**Floor-guard + best-price-wins insertion point:** inside the existing per-item loop, right after `v_cost_price`/`v_expected_price` are derived (same loop that already locks `products`/`inventory` `FOR UPDATE`) — evaluate qualifying promotions via `MAX()` over a small candidate list, compute `v_line_price`, and `RETURN jsonb_build_object('ok', false, 'code', 'BELOW_COST_REQUIRES_OVERRIDE', ...)` if `v_line_price < v_cost_price AND NOT p_manager_override` — same envelope-return style as the existing `PRICE_MISMATCH`/`AMOUNT_MISMATCH` checks in this file.

---

### `supabase/functions/process-direct-sale/index.ts` (edge-fn, request-response)

**Analog:** same file, existing param-forwarding block — extend the Zod `BodySchema` with the new promotion/override params and forward them unchanged into `admin.rpc('process_direct_sale_atomic', {...})`; this layer does no promotion math itself (per RESEARCH.md's architectural map — all promotion evaluation lives in the RPC, not here).

---

### `e2e/promotions/*.spec.ts` (test, new folder)

**Analog:** `e2e/suppliers/*.spec.ts` — CRUD + RLS-denial-for-cashier pattern; also cross-reference `e2e/payments/refund-with-stock-movement.spec.ts`-style specs (in `e2e/payments/`) for the manager-PIN-gated flow assertions, and `e2e/infra/` for the offline-queue-conflict scenario (PROMO-08) since that's where existing offline-queue tests already live.

---

## Shared Patterns

### Manager PIN Gate (below-cost override + ad-hoc discount)
**Source:** `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (full file)
**Apply to:** `apply-promotion-at-payment` feature, `PaymentPane` below-cost override dialog
```typescript
<ManagerPinDialog
  open={showPinDialog}
  onOpenChange={setShowPinDialog}
  requiredAction="apply_custom_discount"
  onSuccess={() => { /* proceed with override/ad-hoc discount */ }}
/>
```
Server independently re-checks role via `role_permissions`/`get_user_role()` inside the RPC — never trust the client PIN gate alone (same two-layer defense as `process_refund`).

### RLS table policy pair + admin-only `role_permissions` seeding
**Source:** `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:45-48`, `supabase/migrations/20260510000001_rls_rewrite_phase13.sql:330-333`
**Apply to:** `promotions` table migration
Select-all-authenticated + manage-gated-by-`role_permissions` policy pair; admin-only actions get exactly one `role_permissions` row (`admin` only, no `manager` row).

### Result<T> error handling + structured logging
**Source:** `src/entities/category/model/queries.ts` (throughout)
**Apply to:** `src/entities/promotion/model/queries.ts`
```typescript
const res = await supabaseQuery(() => supabase.from('promotions').select('*'));
if (!res.ok) {
  logger.error('promotions.fetch_failed', { code: res.error.code, message: res.error.message });
  return res;
}
```

### `settings` key/value extension, not a new key
**Source:** `src/shared/lib/domain.ts:831-835` (`NearExpirySettingsSchema`), `src/entities/inventory/model/queries.ts:233-267` (`useNearExpiryAlerts`)
**Apply to:** expiry-discount threshold/rate (D-03/D-04) — add `discountPercent` field onto the same `near_expiry` settings row, do not create a second settings key.

### Route guard + Home dashboard admin-only tile
**Source:** `src/app/audit-route.tsx`, `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (`/settings` tile)
**Apply to:** `PromotionsRoute`, new `/promotions` tile — both gated on the same new `manage_promotions` action, `managerLabelKey: 'homeDashboard.managerLabels.admin'`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/entities/promotion/model/promotion-pricing.ts` parity/property test | test | transform | No prior promotion-pricing math exists; closest structural analog (`edge-tax.test.ts`) is cross-domain (tax, not discounts) — use it for *test shape* only, not for pricing logic itself |
| Offline-queue promotion-conflict flag UI (PROMO-08) | component | event-driven | `OfflineQueueProcessor`/`OfflineBanner` exist for connectivity state but nothing in this codebase currently flags a "server recomputed differently than the offline snapshot" conflict — this is new UX, build minimal per RESEARCH.md Pitfall 4, no existing toast/banner variant to copy verbatim |

## Metadata

**Analog search scope:** `src/entities/`, `src/features/`, `src/app/`, `src/widgets/HomeDashboard`, `src/widgets/SettingsTabsPanel`, `src/widgets/PaymentPane`, `src/shared/lib/rbac.ts`, `supabase/migrations/`, `supabase/functions/process-direct-sale/`, `e2e/`
**Files scanned:** ~15 read in full (category entity/queries, ManagerPinDialog, audit-route, HomeDashboard, rbac.ts, useNearExpiryAlerts) plus RESEARCH.md's own verified-file list (process_direct_sale_atomic migrations, cost-price-snapshot migration, suppliers migration, edge function)
**Pattern extraction date:** 2026-09-01
