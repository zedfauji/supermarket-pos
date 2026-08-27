# Phase 2: Core Direct-Sale Checkout - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 16 (new/modified)
**Analogs found:** 16 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/pages/pos/index.tsx` | route (page) | request-response | `src/pages/home/index.tsx` | exact |
| `src/app/router.tsx` (add `/pos` route) | route | request-response | existing `<Route path="/inventory">` block, same file | exact |
| `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (add tile) | component | event-driven | own existing `ITEMS` array entries | exact |
| `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` | component (composite widget) | event-driven | `src/widgets/PaymentPane` (composes cart/payment widgets) — structure inferred, not read this pass; closest true analog is composition of `ProductGrid`+`CartPanel` below | role-match |
| `src/widgets/ProductGrid/ui/ProductGrid.tsx` | component | CRUD (browse/select) | `src/entities/product/ui/ProductCard.tsx` + `CategoryTabs.tsx` (composed) | exact |
| `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` | hook/feature | event-driven | `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` + `src/shared/lib/useBarcodeScanner.ts` | exact |
| `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` | component (form dialog) | request-response (local) | `src/shared/ui/PINKeypad.tsx` (numeric keypad UX) + `src/features/process-payment/ui/EmailReceiptDialog.tsx` (Dialog form shape) | role-match |
| `src/features/add-loose-weight-item/model/useAddLooseWeightItem.ts` | hook/feature | CRUD (client-only) | `src/entities/tab/model/cartStore.ts` (`addItem`) | exact |
| `src/features/hold-sale/ui/HoldSaleBanner.tsx` | component | event-driven | `src/features/void-order/ui/VoidOrderDialog.tsx` (ConfirmDialog usage for discard) | role-match |
| `src/features/hold-sale/model/useHoldSale.ts` | hook/feature | CRUD (client-only) | `src/entities/tab/model/cartStore.ts` | exact |
| `src/entities/tab/model/cartStore.ts` (extend: `heldCart`, weight fields) | store (Zustand) | CRUD (client-only) | itself (extend in place) | exact |
| `src/entities/tab/ui/CartItem.tsx` (extend: weight-line branch) | component | request-response (local) | itself (extend in place) | exact |
| `src/features/checkout-sale/model/useCheckoutSale.ts` | hook/feature | event-driven (atomic RPC) | `src/features/void-order/model/useVoidOrder.ts` (mutation → edge-function/RPC call → `Result<T>` → logger → cache invalidate) | exact |
| `supabase/migrations/NNNNN_process_direct_sale_atomic.sql` | migration (new RPC) | CRUD (atomic transaction) | `supabase/migrations/20260810000003_drop_pool_resources.sql` (`process_payment_atomic`/`process_split_payment_atomic` bodies) + `supabase/migrations/20260810000008_drop_promotions.sql` (`create_order_with_items` body) | exact |
| `src/shared/lib/payment-processor.ts` (fix: reuse idempotency key across retries) | utility | request-response | itself (`generateIdempotencyKey` call sites) | exact |
| Failed-scan audit call (inline in `useScanBarcodeToCart.ts`) | event-driven | event-driven | `src/app/OfflineQueueProcessor.tsx:33-41` (`record_audit` direct RPC call) | exact |

## Pattern Assignments

### `src/pages/pos/index.tsx` (route/page)

**Analog:** `src/pages/home/index.tsx` (full file, 19 lines)

Pages in this FSD codebase are thin containers: header with `LogoImage`, translated `t('pages')` namespace, and a single widget doing the real work.

```tsx
import { useTranslation } from 'react-i18next';
import { CheckoutPanel } from '@widgets/CheckoutPanel';
import { LogoImage } from '@widgets/LogoImage';

export default function PosPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-center border-b px-4">
        <div className="flex h-12 items-center">
          <LogoImage alt={t('common.logoAlt')} className="h-12" />
        </div>
      </header>
      <div className="flex flex-1 overflow-auto">
        <CheckoutPanel />
      </div>
    </div>
  );
}
```

---

### `src/app/router.tsx` (add `/pos` route)

**Analog:** existing `/inventory` route block in the same file (lines 48-55).

```tsx
const PosPage = lazy(() => import('../pages/pos'));
// ...
<Route
  path="/pos"
  element={
    <ProtectedRoute>
      <PosPage />
    </ProtectedRoute>
  }
/>
```
No role-gating wrapper is needed (unlike `ReportsRoute`/`RbacRoute`/`AuditRoute`) — checkout is available to bartender+ (all authenticated roles), matching `/inventory`'s bare `ProtectedRoute` wrap, not a gated one.

---

### `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (add POS tile)

**Analog:** its own `ITEMS: DashboardItem[]` array (lines 32-73 of the same file).

```tsx
{ path: '/pos', labelKey: 'homeDashboard.tiles.pos', icon: ShoppingCart },
```
Add near the top of the array (primary action). No `requiredAction` gate needed — matches `/payments`/`/staff` entries which have no RBAC gate, unlike `/inventory`/`/settings`/`/rbac` which do (`requiredAction` field present on those entries only — confirm via `grep -n requiredAction` before wiring if RBAC-gating checkout turns out to be required; CONTEXT.md does not ask for one).

---

### `src/widgets/ProductGrid/ui/ProductGrid.tsx` (net-new)

**Analog:** `src/entities/product/ui/ProductCard.tsx` (60 lines) + `src/entities/product/ui/CategoryTabs.tsx` (100 lines) — compose unchanged, do not redesign either.

**ProductCard usage pattern** (already touch-optimized, `POSButton touchSize="large"`, `aria-label`, unavailable/out-of-stock badge):
```tsx
<ProductCard product={product} category={category} onSelect={handleAddToCart} />
```

**CategoryTabs usage pattern** (controlled `activeCategory`, scroll-into-view on change):
```tsx
<CategoryTabs categories={categories} activeCategory={activeCategory} onChange={setActiveCategory} />
```

**Data source:** `src/entities/product/model/queries.ts` — `useProducts()`/`useCategories()` (grep-confirmed present, `staleTime: 5 * 60 * 1000` per RESEARCH.md Pitfall 4 — mount this early on the page so the barcode-lookup cache is warm).

**Search input:** no existing search-bar component was found in `entities/product` this pass — build a plain `Input` (from `@shared/ui/input`, same import as `CartItem.tsx`'s notes field) with client-side `.filter()` over the `useProducts()` result; this is the one genuinely new small piece, matching CONTEXT.md's framing of CHK-02 as net-new UI over existing data hooks.

**Empty/loading states:** reuse `LoadingSkeletons` (per UI-SPEC "backstop" entries) — locate via `Glob("src/shared/ui/*Skeleton*")` at execution time; not read this pass (out of the 3–5-analog budget), but UI-SPEC explicitly names it as the existing component to reuse, not a new one.

---

### `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` (net-new, thin composition)

**Analogs:**
- `src/shared/lib/useBarcodeScanner.ts` (full file, 72 lines) — reuse the hook unmodified, just wire its `onScan` callback.
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` (full file, 48 lines) — reuse `lookup()` unmodified (Pitfall 4's fix, if taken, patches this file directly, not the caller).
- `src/app/OfflineQueueProcessor.tsx:30-49` — the `record_audit` direct-RPC call shape for D-11.

**Composition pattern:**
```typescript
// src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts
import { toast } from 'sonner';
import { useCartStore } from '@entities/tab/model/cartStore';
import { useLookupProductByBarcode } from '@features/lookup-product-by-barcode/model/useLookupProductByBarcode';
import { useBarcodeScanner } from '@shared/lib/useBarcodeScanner';
import { supabase } from '@shared/lib/supabase';
import { TERMINAL_ID } from '@shared/lib/terminal'; // confirm actual export name at execution

export function useScanBarcodeToCart(enabled = true) {
  const { lookup } = useLookupProductByBarcode();
  const addItem = useCartStore(s => s.addItem);

  useBarcodeScanner({
    enabled,
    onScan: async (code) => {
      const product = await lookup(code);
      if (!product) {
        toast.error('Product not found'); // D-10, i18n key TBD in planning
        await supabase.rpc('record_audit', {
          p_action: 'barcode.scan_failed', // D-11
          p_entity_type: 'product',
          p_entity_id: null,
          p_before: { barcode: code },
          p_after: null,
          p_terminal_id: TERMINAL_ID,
          p_user_id: null,
        } as never);
        return;
      }
      addItem(product, []);
    },
  });
}
```

---

### `src/features/add-loose-weight-item/*` (net-new, D-06/D-07/D-08)

**Analog for keypad UX:** `src/shared/ui/PINKeypad.tsx` (full file, 202 lines) — do NOT reuse this component directly (it's PIN-specific, dot-masked display), but copy its structural pattern: controlled `value`/`onChange` string state, numeric grid of `Button`s, keyboard support via a `window.addEventListener('keydown', ...)` effect, `disabled` gating on validity. For weight entry, display the typed value as a plain numeric string (not dots) with a running "Weight × price = line total" computed label (UI-SPEC Copywriting Contract).

**Analog for Dialog shape:** `src/features/process-payment/ui/EmailReceiptDialog.tsx` (full file, 107 lines) — `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@shared/ui/dialog`, local `useState` for the field + error, `POSButton` cancel/confirm pair in `DialogFooter`, confirm disabled while invalid (mirrors D-06 spec: "Add to cart" disabled until weight > 0).

**Analog for cart-store action:** `cartStore.ts`'s `addItem`/`setLineQuantity` — new action should follow the same `set(state => ...)` + `calcLineTotal`-equivalent + `logger.debug` shape (see cartStore excerpt below).

---

### `src/entities/tab/model/cartStore.ts` (extend in place)

**Analog:** itself — `addItem` (lines 56-100), `setLineQuantity` (lines 136-154), `clearCart` (lines 156-159).

**Pattern to copy for `heldCart` (D-01..D-05):**
```typescript
interface CartState {
  items: CartItem[];
  heldCart: CartItem[] | null; // [NEW]
}
// ...
holdCart: () => {
  logger.info('cart.held');
  set(state => ({ heldCart: state.items, items: [] }));
},
resumeHeld: () => {
  set(state => {
    if (!state.heldCart) return state;
    logger.info('cart.resumed');
    return { items: state.heldCart, heldCart: null };
  });
},
discardHeld: () => {
  logger.info('cart.held.discarded');
  set({ heldCart: null });
},
```

**Pattern to copy for weight-line total math** (RESEARCH.md Pitfall 2, `calcLineTotal` at line 49-50):
```typescript
const calcLineTotal = (unitPrice: number, modifiers: Modifier[], quantity: number): number =>
  (unitPrice + modifiers.reduce((sum, m) => sum + m.priceDelta, 0)) * quantity;
// [NEW] weighted-line equivalent (per RESEARCH.md Code Examples):
const calcWeightedLineTotal = (pricePerKg: number, weightGrams: number): number =>
  Math.round(pricePerKg * (weightGrams / 1000) * 100) / 100;
```
Add `weightGrams: number | null` to `CartItem`/`CartItemSchema` (`src/shared/lib/domain.ts`) per RESEARCH.md Pitfall 2 — `quantity` stays `1` as a sentinel for weighted lines.

---

### `src/entities/tab/ui/CartItem.tsx` (extend in place)

**Analog:** itself (full file, 74 lines) — the `QuantityControl`/`MoneyDisplay`/`Input`(notes) row structure (lines 49-70).

Branch on a `weightGrams != null` flag: render a "Weight: X.XXX kg" read-only label + an "Edit" affordance opening `WeightEntryDialog` (D-08: same edit UX pattern, not a new stepper) instead of `QuantityControl`. Keep the `MoneyDisplay`/notes/remove parts unchanged — same component, same props shape, just a conditional in the middle row.

---

### `src/features/hold-sale/ui/HoldSaleBanner.tsx` (net-new)

**Analog for the discard confirmation:** `src/features/void-order/ui/VoidOrderDialog.tsx` (full file, 131 lines) — uses `ConfirmDialog` from `@shared/ui` with `title`/`description`/`confirmLabel`/`variant`/`onConfirm`. For D-05, per UI-SPEC Copywriting Contract, do NOT use `variant="destructive"` (no PIN gate, nothing committed) — omit `confirmClassName`'s 72px destructive treatment; use `ConfirmDialog`'s default styling.

```tsx
<ConfirmDialog
  open={open}
  title={t('holdSale.discardTitle')}       // "Discard held sale?"
  description={t('holdSale.discardBody')}  // "This clears the parked cart..."
  confirmLabel={t('holdSale.discardConfirm')} // "Discard"
  onCancel={() => setOpen(false)}
  onConfirm={() => { discardHeld(); setOpen(false); }}
/>
```
Badge + Resume/Discard buttons: `Badge` from `@shared/ui/badge` (same import CartItem.tsx uses for modifiers), `POSButton variant="outline"`/`variant="ghost"` for Resume/Discard (per UI-SPEC color contract — accent reserved for the payment CTA only).

---

### `src/features/checkout-sale/model/useCheckoutSale.ts` (net-new, orchestration)

**Analog:** `src/features/void-order/model/useVoidOrder.ts` (full file, 121 lines) — `useMutation` wrapping an edge-function/RPC call, `Result<T>` return discipline, `logger.error`/`logger.info` on failure/success, `queryClient.invalidateQueries` in `onSuccess`.

**Core pattern to copy (mutation shape, lines 38-119 of the analog):**
```typescript
export function useCheckoutSale() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CheckoutInput): Promise<Result<CheckoutResult>> => {
      const result = await callProcessDirectSaleAtomic(input); // new edge-function-contracts entry, mirrors callVoidOrder
      if (!result.ok) {
        logger.error('checkout.sale.failed', { code: result.error.code, message: result.error.message });
        return err({ code: 'SUPABASE_ERROR', message: result.error.message });
      }
      logger.info('checkout.sale.succeeded', { tabId: result.value.tabId, amount: input.totalAmount });
      return ok(result.value);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] }); // stock changed
    },
  });
  return { checkoutSale: mutation.mutateAsync, isPending: mutation.isPending };
}
```
Per RESEARCH.md Architecture Pattern 2 (option 1, recommended), this calls one new `process_direct_sale_atomic` RPC/edge-function, not two sequential calls — see the SQL analog below.

**Idempotency-key fix (Security section, "client-side gap"):** `src/shared/lib/payment-processor.ts` currently calls `generateIdempotencyKey(prefix)` fresh on every invocation of `processCashPayment`/`processCardPayment`/`processSplitPayment` — for direct-sale checkout, generate the key once per checkout attempt (e.g. `useRef` scoped to the current cart, cleared only on success or `clearCart()`) and pass it through, reusing it across retries of the same "Charge" click sequence.

---

### `supabase/migrations/NNNNN_process_direct_sale_atomic.sql` (net-new RPC)

**Analogs (read as bodies referenced by RESEARCH.md, not re-read this pass — file:line citations from RESEARCH.md Sources):**
- `supabase/migrations/20260810000008_drop_promotions.sql:60-147` — live `create_order_with_items` body (order/item bulk insert, fires `trigger_decrement_inventory_on_order_item`).
- `supabase/migrations/20260810000003_drop_pool_resources.sql:72-267` (`process_payment_atomic`) and `:269-530` (`process_split_payment_atomic`) — row locking (`FOR UPDATE`), `STALE_VERSION`/`NOT_FOUND_VERSIONED` guards, per-payment idempotency key backed by `idx_payments_idempotency_key` UNIQUE INDEX with a `WHEN unique_violation` replay handler.

**Pattern:** new `SECURITY DEFINER` function combining both bodies verbatim (tab-open if needed + `create_order_with_items`'s item-insert logic + `process_payment_atomic`'s payment-insert/tab-close logic) inside one transaction, so the existing `AFTER INSERT` stock-decrement trigger fires inside the same commit as the payment. Do not duplicate the trigger logic — let it fire as-is. Preserve the existing idempotency-key/version-guard/row-locking patterns from the payment RPC bodies unchanged.

---

## Shared Patterns

### Result<T> + logger discipline
**Source:** `src/features/void-order/model/useVoidOrder.ts` (full file)
**Apply to:** `useScanBarcodeToCart`, `useCheckoutSale`, `useAddLooseWeightItem` — every async mutation/lookup returns `Result<T>` (`ok`/`err` from `@shared/lib/result`), logs via `logger.error`/`logger.info`/`logger.debug` from `@shared/lib/logger-instance` (client hooks) or `@shared/lib/logger` (feature-level), never `console.log`.

### Client-only Zustand cart state
**Source:** `src/entities/tab/model/cartStore.ts:52` ("Client-only — never persisted")
**Apply to:** `heldCart`, weight-line fields — per RESEARCH.md Pattern 1, do NOT write held-sale state to Postgres; keep 100% in Zustand until the "Charge" click.

### `record_audit` direct RPC call
**Source:** `src/app/OfflineQueueProcessor.tsx:33-41`
**Apply to:** `useScanBarcodeToCart`'s D-11 failed-scan logging — call `supabase.rpc('record_audit', {...})` directly, no wrapping feature-specific RPC, dot-namespace action string (`barcode.scan_failed`).

### POSButton touchSize / focusEmphasis
**Source:** `src/entities/product/ui/ProductCard.tsx` (`touchSize="large"`), `src/features/void-order/ui/VoidOrderDialog.tsx` (`confirmClassName="min-h-[72px] ... focus-visible:ring-4"`)
**Apply to:** all new interactive elements — "Process payment" CTA and weight keypad digits use `touchSize="xl"` (72px) per UI-SPEC; Hold/Resume/Discard/category tabs use `default`/`large`.

### i18n — no hardcoded strings
**Source:** every file read this pass (`CartItem.tsx`, `ProductCard.tsx`, `CategoryTabs.tsx`, `VoidOrderDialog.tsx`, `EmailReceiptDialog.tsx`) uses `useTranslation(namespace)` + `t('key')`, zero literal UI strings.
**Apply to:** all new components — `wPanels` namespace for `CheckoutPanel`/`ProductGrid`/hold-banner (widgets layer), `featOrders` for `scan-barcode-to-cart`/`add-loose-weight-item`/`hold-sale`/`checkout-sale` (features layer), matching the namespace-per-FSD-layer scheme in CLAUDE.md. New keys required per UI-SPEC Copywriting Contract table — add to both `es-MX` and `en-US` locale JSON files under `src/shared/lib/i18n/locales/`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` | widget (composite) | event-driven | No prior widget composes a product-browse grid + cart + hold-banner + payment trigger together in this codebase (`PaymentPane` composes payment history, not a product grid) — compose fresh from `ProductGrid` + `CartItem` list + `HoldSaleBanner` + `PaymentForm`, per RESEARCH.md's Recommended Project Structure. |
| Search input inside `ProductGrid` | component (form) | request-response (client filter) | No existing product-search-bar component found in `entities/product`; build a plain `Input` + client-side filter over `useProducts()`, per the ProductGrid pattern assignment above. |

## Metadata

**Analog search scope:** `src/entities/tab/`, `src/entities/product/`, `src/features/lookup-product-by-barcode/`, `src/features/void-order/`, `src/features/process-payment/`, `src/widgets/PaymentModal/`, `src/widgets/HomeDashboard/`, `src/shared/lib/`, `src/shared/ui/`, `src/app/`, `src/pages/home/`, relevant `supabase/migrations/*.sql` (cited via RESEARCH.md, not re-read)
**Files scanned:** 16 read in full this session (all ≤ 202 lines, single-pass reads, no re-reads)
**Pattern extraction date:** 2026-08-12
