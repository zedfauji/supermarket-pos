# Phase 12: Checkout Verification (Scan & Search Confirmation) - Pattern Map

**Mapped:** 2026-08-24
**Files analyzed:** 7 (2 new, 5 edited)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/entities/product/model/productRiskFlag.ts` (NEW) | utility (pure predicate) | transform | `src/widgets/InventoryPagePanel.tsx` (`stockSortPriority`/`rowHighlightClass`) | role-match (predicate logic over `quantityOnHand`/`lowStockThreshold`) |
| `src/entities/product/model/useConfirmRiskyAdd.ts` (NEW) | hook (shared confirm gate) | event-driven | `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` (its `toast.error` call) | partial (only existing toast-with-action-buttons precedent is sonner's own API, not local code) |
| `src/entities/product/model/queries.ts` (EDIT — `.select()` + `mapProductRow`) | service/query | CRUD | same file, existing `useProducts()`/`mapProductRow` | exact (editing in place) |
| `src/shared/lib/domain.ts` (EDIT — `ProductSchema`) | model | transform | same file, existing `ProductSchema` optional-join fields (`category`) | exact (editing in place) |
| `src/entities/product/ui/ProductCard.tsx` (EDIT — barcode line) | component | request-response (render) | same file, existing category-label line | exact (editing in place) |
| `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` (EDIT — `.select()`) | service | request-response | same file, existing `.select()` | exact (editing in place) |
| `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` (EDIT — call confirm gate) | feature hook | event-driven | same file, existing `handleScan` | exact (editing in place) |
| `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` (EDIT — `ProductGrid onSelect`) | widget | event-driven | same file, existing `onSelect` callback | exact (editing in place) |

## Pattern Assignments

### `src/entities/product/model/productRiskFlag.ts` (NEW)

**Analog:** `src/widgets/InventoryPagePanel.tsx` lines 25-51 — copy the exact `quantityOnHand <= lowStockThreshold` predicate, not `products.stock_threshold`.

```typescript
// src/widgets/InventoryPagePanel.tsx:25-29 — predicate to mirror
function stockSortPriority(inv: Inventory): number {
  if (inv.quantityOnHand === 0) return 2;
  if (inv.quantityOnHand <= inv.lowStockThreshold) return 1;
  return 0;
}
```

Target shape (pure function, no React, `entities/product/model/` per FSD — `features` cannot import `features`, and `productRiskFlag`/`useConfirmRiskyAdd` must be importable from both `features/scan-barcode-to-cart` and `widgets/CheckoutPanel`):

```typescript
import type { Product } from '@shared/lib/domain';

export type ProductRiskFlag = 'zero-price' | 'low-stock' | null;

export function getProductRiskFlag(product: Product): ProductRiskFlag {
  if (product.basePrice === 0) return 'zero-price';
  if (
    product.quantityOnHand !== undefined &&
    product.lowStockThreshold !== undefined &&
    product.quantityOnHand <= product.lowStockThreshold
  ) {
    return 'low-stock';
  }
  return null;
}
```

Pitfall: a product with no `inventory` row has `quantityOnHand === undefined` — must fall through to `null` (no flag), never treat as low-stock (RESEARCH.md Pitfall 2).

---

### `src/entities/product/model/useConfirmRiskyAdd.ts` (NEW)

**Analog:** `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` for the toast-call convention (import + `toast.error(t(...))` pattern), but the action/cancel buttons are new sonner API usage with no local precedent.

**Imports pattern** (from `useScanBarcodeToCart.ts` lines 1-9):
```typescript
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
```

**Existing toast-call convention** (`useScanBarcodeToCart.ts` line 43):
```typescript
toast.error(t('scanBarcodeToCart.productNotFound'));
```

**New pattern to introduce** (sonner action/cancel + `duration: Infinity`, per RESEARCH.md/UI-SPEC — use `toast.warning`/`toast.error` per flag color, not plain `toast(...)`, to get `richColors` amber/red tinting):
```typescript
// entities/product/model/useConfirmRiskyAdd.ts
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Product } from '@shared/lib/domain';
import type { ProductRiskFlag } from './productRiskFlag';

export function useConfirmRiskyAdd() {
  const { t } = useTranslation('entities');

  return (flag: NonNullable<ProductRiskFlag>, product: Product, onConfirm: () => void) => {
    const toastFn = flag === 'zero-price' ? toast.error : toast.warning;
    const title =
      flag === 'zero-price'
        ? t('productRiskConfirm.zeroPriceTitle', { name: product.name })
        : t('productRiskConfirm.lowStockTitle', { name: product.name, count: product.quantityOnHand });
    const body =
      flag === 'zero-price'
        ? t('productRiskConfirm.zeroPriceBody')
        : t('productRiskConfirm.lowStockBody');

    toastFn(title, {
      description: body,
      duration: Infinity,
      action: {
        label: t('productRiskConfirm.confirm'),
        onClick: onConfirm,
        actionButtonStyle: { minHeight: '44px' }, // UI-SPEC: sonner default 24px is under the 44px touch-target min
      },
      cancel: {
        label: t('productRiskConfirm.cancel'),
        onClick: () => undefined,
        actionButtonStyle: { minHeight: '44px' },
      },
    });
  };
}
```

**Call-site pattern** (both scan and search paths gate identically per D-05; weighted products gate before `WeightEntryDialog` opens per RESEARCH.md Pitfall 3):
```typescript
// inside useScanBarcodeToCart.handleScan, replacing the direct addItem/onWeightedProduct calls
if (product) {
  const flag = getProductRiskFlag(product);
  const commit = () => {
    if (product.soldByWeight) { onWeightedProduct(product); return; }
    addItem(product, []);
  };
  if (flag) {
    confirmRiskyAdd(flag, product, commit);
    return;
  }
  commit();
  return;
}
```

```typescript
// CheckoutPanel.tsx — ProductGrid onSelect, current (line 71-73):
onSelect={product => {
  addItem(product, []);
}}
// becomes:
onSelect={product => {
  const flag = getProductRiskFlag(product);
  if (flag) {
    confirmRiskyAdd(flag, product, () => addItem(product, []));
    return;
  }
  addItem(product, []);
}}
```

---

### `src/entities/product/model/queries.ts` (EDIT)

**Analog:** same file — `useProducts()` `.select()` (lines 141-153) and `mapProductRow` (lines 39-92).

**Current `.select()`** (lines 142-150):
```typescript
supabase
  .from('products')
  .select(`
    *,
    category:categories(*),
    product_modifiers(
      modifier:modifiers(*)
    )
  `)
  .eq('is_active', true)
  .order('name')
```

**Add** `inventory(quantity_on_hand, low_stock_threshold)` to the select block (single-object embed — `inventory.product_id` is `isOneToOne: true` per `supabase.types.ts:37-40`).

**`mapProductRow`'s existing null-coalesce convention** (lines 81-84 — copy this exact style for the two new optional fields):
```typescript
stock_threshold: row.stock_threshold ?? null,
barcode: (row as { barcode?: string | null }).barcode ?? null,
unitsPerPackage: (row as { units_per_package?: number | null }).units_per_package ?? null,
```
New fields (add after `category` in the `ProductSchema.parse({...})` call, lines 68-87):
```typescript
quantityOnHand: (row as { inventory?: { quantity_on_hand: number } | null }).inventory?.quantity_on_hand ?? undefined,
lowStockThreshold: (row as { inventory?: { low_stock_threshold: number } | null }).inventory?.low_stock_threshold ?? undefined,
```
Also update `ProductRow` type (line 34-37) to add `inventory: { quantity_on_hand: number; low_stock_threshold: number } | null`.

---

### `src/shared/lib/domain.ts` (EDIT — `ProductSchema`)

**Note:** `src/entities/product/model/types.ts` only re-exports `ProductSchema` from `domain.ts` — it does not define it. Edit `domain.ts` directly; do not touch `types.ts`.

**Analog:** same file, lines 227-258 — the `category: CategorySchema.optional()` field (line 256) is the exact precedent for an optionally-joined field that most `.parse()` call sites won't populate.

```typescript
// domain.ts:244-256 — existing optional/nullable field conventions to match
stock_threshold: z.number().nullable(),
barcode: z.string().nullable().optional(),
...
comboPriceOverride: MoneySchema.nullable().optional(),
category: CategorySchema.optional(),
```

Add, same style (plain `.optional()`, no `.default()` — per RESEARCH.md Pitfall 4, `exactOptionalPropertyTypes` + the many hand-authored `Product` literals in `mocks.ts`/`ProductForm.tsx` must not be forced to carry these keys):
```typescript
quantityOnHand: z.number().int().nonnegative().optional(),
lowStockThreshold: z.number().int().nonnegative().optional(),
```

---

### `src/entities/product/ui/ProductCard.tsx` (EDIT — barcode line, VER-02)

**Analog:** same file — the existing category-label line (lines 48-55) is the direct visual/structural precedent per UI-SPEC.

**Current category line** (lines 48-55):
```tsx
<div className="flex items-center gap-2">
  <div
    className="h-3 w-3 shrink-0 rounded-full"
    style={{ backgroundColor: category.color }}
    aria-hidden="true"
  />
  <span className="text-xs text-muted-foreground">{category.name}</span>
</div>
<h3 className="w-full truncate text-lg font-semibold">{product.name}</h3>
<MoneyDisplay amount={displayPrice} size="lg" />
```

**Add** (per UI-SPEC: `text-xs text-muted-foreground` matching the category line, `font-mono` for the digits, `truncate` for overflow, i18n via `entities:productCard.barcodeLabel`):
```tsx
{product.barcode && (
  <span className="w-full truncate text-xs text-muted-foreground">
    {t('productCard.barcodeLabel', { code: product.barcode })}
  </span>
)}
```
Note existing `t` is already scoped to the `entities` namespace (`useTranslation('entities')`, line 18) — no new namespace import needed. Existing `truncate` convention is on the `<h3>` name (line 56); reuse the class name verbatim per UI-SPEC's overflow resolution.

---

### `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` (EDIT)

**Analog:** same file, current `.select()` (lines 31-39).

```typescript
// current
.select(`
    *,
    category:categories(*),
    product_modifiers(
      modifier:modifiers(*)
    )
  ` as never)
```
Add `inventory(quantity_on_hand, low_stock_threshold)` identically to the `queries.ts` change above — same embed, same `mapProductRow` already reused by this file (line 54: `mapProductRow(data as unknown as ProductRow)`), so no separate mapping logic needed here.

---

### `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` (EDIT)

**Analog:** same file, `handleScan` (lines 26-41) — see the "Call-site pattern" excerpt above under `useConfirmRiskyAdd.ts`. Import `getProductRiskFlag` from `@entities/product/model/productRiskFlag` and instantiate `useConfirmRiskyAdd()` at the top of the hook, following the existing `const { lookup } = useLookupProductByBarcode();` / `const addItem = useCartStore(...)` import-and-call convention (lines 15-16).

---

### `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` (EDIT)

**Analog:** same file, `onSelect` (lines 69-74) — see the "Call-site pattern" excerpt above. `CheckoutPanel.tsx` already imports from `@widgets/ProductGrid/ui/ProductGrid` (line 5) and calls `addItem` inline; add `useConfirmRiskyAdd`/`getProductRiskFlag` imports the same way (widgets may import `entities` per FSD).

---

## Shared Patterns

### FSD boundary constraint (critical — read before assigning file locations)
**Source:** `eslint.config.js` lines 109-140 (`boundaries/dependencies`, `{ from: ['features'], allow: ['entities', 'shared'] }` — no `features` in its own allow-list)
**Apply to:** `productRiskFlag.ts` and `useConfirmRiskyAdd.ts` MUST live in `entities/product/model/`, never a new `features/confirm-*` folder — `features/scan-barcode-to-cart` (a feature) cannot import a sibling feature, but both `features` and `widgets` may import `entities`.

### Low-stock threshold field
**Source:** `src/widgets/InventoryPagePanel.tsx` lines 25-51
**Apply to:** `productRiskFlag.ts` only. Use `inventory.low_stock_threshold` (→ `Product.lowStockThreshold`), never `products.stock_threshold` (a different, unrelated field feeding `useInventoryAlerts()`/Home-dashboard alerts).

### Toast pattern
**Source:** `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` line 43 (`toast.error(t(...))` call convention) + sonner's own `Action`/`ExternalToast` API (`node_modules/sonner/dist/index.d.ts:43-64`, no local precedent for action/cancel buttons)
**Apply to:** `useConfirmRiskyAdd.ts` only — the one new toast-confirm mechanism, shared by both scan and search paths (D-05).

### `exactOptionalPropertyTypes` + optional schema fields
**Source:** `src/shared/lib/domain.ts` line 256 (`category: CategorySchema.optional()`)
**Apply to:** `ProductSchema`'s two new fields (`quantityOnHand`, `lowStockThreshold`) — plain `.optional()`, no `.default()`, so existing hand-authored `Product` literals (`mocks.ts`, `ProductForm.tsx`) keep typechecking without new required keys.

### Single-object PostgREST embed for 1:1 FK
**Source:** `src/shared/lib/supabase.types.ts` lines 37-40 (`inventory_product_id_fkey`, `isOneToOne: true`)
**Apply to:** both `.select()` edits (`queries.ts` `useProducts()`, `useLookupProductByBarcode.ts`) — `inventory(quantity_on_hand, low_stock_threshold)` returns a single object/`null`, not an array.

## No Analog Found

None — all 7 files have a same-file or same-role analog (5 are direct in-place edits of the file being changed; 2 new files have a strong role-match analog plus RESEARCH.md-verified sonner API documentation for the one genuinely new UI mechanism).

## Metadata

**Analog search scope:** `src/entities/product/`, `src/features/scan-barcode-to-cart/`, `src/features/lookup-product-by-barcode/`, `src/widgets/CheckoutPanel/`, `src/widgets/InventoryPagePanel.tsx`, `src/shared/lib/domain.ts`
**Files scanned:** 7 read in full this session (all ≤ 300 lines; no large-file grep-first strategy needed)
**Pattern extraction date:** 2026-08-24
