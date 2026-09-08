---
phase: 31-product-catalog-detail-photo-upload
reviewed: 2026-09-08T00:00:00Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - e2e/checkout/peek-window.spec.ts
  - e2e/inventory/open-units.spec.ts
  - e2e/products/catalog-row-and-thumbnails.spec.ts
  - e2e/products/product-management.spec.ts
  - e2e/products/product-photo-rls.spec.ts
  - e2e/products/product-photo-upload.spec.ts
  - e2e/visual/46-product-dialog-baseline.spec.ts
  - src/entities/inventory/model/queries.ts
  - src/entities/inventory/model/store.test.ts
  - src/entities/open-unit/model/queries.ts
  - src/entities/product/index.ts
  - src/entities/product/model/index.ts
  - src/entities/product/model/queries.ts
  - src/entities/product/model/resolveProductImage.test.ts
  - src/entities/product/model/resolveProductImage.ts
  - src/entities/purchase-order/model/queries.ts
  - src/entities/tab/model/cartStore.test.ts
  - src/entities/tab/model/queries.ts
  - src/entities/tab/ui/CartItem.stories.tsx
  - src/entities/tab/ui/CartItem.test.tsx
  - src/features/add-item-to-tab/ui/ModifierSheet.stories.tsx
  - src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx
  - src/features/checkout-sale/model/useCheckoutSale.test.ts
  - src/features/manage-products/index.ts
  - src/features/manage-products/model/photo-file.test.ts
  - src/features/manage-products/model/photo-file.ts
  - src/features/manage-products/model/productDialogTabs.test.ts
  - src/features/manage-products/model/productDialogTabs.ts
  - src/features/manage-products/model/useProductPhotoUpload.ts
  - src/features/manage-products/ui/CatalogProductsTab.tsx
  - src/features/manage-products/ui/ProductDetailDialog.tsx
  - src/features/manage-products/ui/tabs/ProductDetailsTab.tsx
  - src/features/manage-products/ui/tabs/ProductLinksTab.tsx
  - src/features/manage-products/ui/tabs/ProductPhotoTab.tsx
  - src/features/physical-count/model/usePhysicalCount.test.ts
  - src/features/receive-shipment/ui/ReceiveShipmentForm.tsx
  - src/features/remove-tab-item/ui/RemoveTabItemDialog.test.tsx
  - src/shared/lib/domain-helpers.test.ts
  - src/shared/lib/domain.open-unit-schema.test.ts
  - src/shared/lib/domain.product-schema.test.ts
  - src/shared/lib/domain.test.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/groupOrderItems.test.ts
  - src/shared/lib/i18n/locales/en-US/featMgmt.json
  - src/shared/lib/i18n/locales/es-MX/featMgmt.json
  - src/shared/lib/mocks.ts
  - src/shared/lib/result.ts
  - src/shared/lib/supabase.types.ts
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx
  - src/widgets/PaymentModal/PaymentModal.test.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
  - supabase/migrations/20260907000001_product_photos_storage.sql
  - vite.config.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-09-08
**Depth:** standard
**Files Reviewed:** 39 (per `files_reviewed_list`; remaining `required_reading` entries were plain fixture/mock updates already covered by the sampling below)
**Status:** issues_found

## Summary

Reviewed the Phase 31 product-catalog-detail and photo-upload work: the new
Storage bucket + RLS migration, the reshaped `ProductDetailDialog` (Details /
Photo / Links vertical tabs), the resize→upload→link→cleanup pipeline in
`useProductPhotoUpload.ts`/`photo-file.ts`, the batch/single signed-URL
resolvers in `resolveProductImage.ts`, and the catalog table's inline-edit +
thumbnail work in `CatalogProductsTab.tsx`. The photo pipeline itself
(validation, resize, upload/link/cleanup ordering, RLS, error-code plumbing
through `result.ts`) is solid — every failure branch returns a distinguishable
`AppError` instead of throwing, the RLS migration and its e2e coverage match
the documented Decision B (open SELECT, gated mutations), and the
`result.ts` growth (photo error factories) is clean, non-duplicated, and
consistent with the file's existing factory pattern.

One genuine correctness bug was found in the newly-added "stock strip" header
of the reshaped dialog: it always displays zero on-hand / no threshold for
every existing product, because the query that feeds the Catalog dialog never
joins the `inventory` table the way the POS-facing product query does. Two
further issues degrade data fidelity in the new photo/inline-edit UI without
being outright crashes. Full findings below.

## Critical Issues

### CR-01: Product dialog's stock strip always shows 0 on-hand / no threshold, and its low-stock badge can never render

**File:** `src/entities/product/model/queries.ts:305-354` (also the create-mutation's post-insert refetch at `queries.ts:463-480`)
**Consumed by:** `src/features/manage-products/ui/ProductDetailDialog.tsx:391-419`

**Issue:** The Phase 31 dialog reshape added a read-only "stock strip"
(`data-testid="product-stock-strip"`) that renders
`initialProduct.quantityOnHand` and `initialProduct.lowStockThreshold`:

```tsx
<span className="... text-numeric">
  {initialProduct.quantityOnHand ?? 0}
  {initialProduct.lowStockThreshold != null &&
  (initialProduct.quantityOnHand ?? 0) <= initialProduct.lowStockThreshold ? (
    <Badge variant="warning">{t('...lowStock')}</Badge>
  ) : null}
</span>
```

`initialProduct` is sourced from `CatalogProductsTab`'s `products` array,
which comes from `useProductsForManagement()`. Unlike `useProducts()` (the
POS-facing query, `queries.ts:143-161`), which explicitly joins
`inventory(quantity_on_hand, low_stock_threshold)`, `useProductsForManagement`'s
select (`queries.ts:305-322`) has no `inventory(...)` join at all:

```ts
const res = await supabaseQuery(() =>
  supabase
    .from('products')
    .select(`*, category:categories(*), product_modifiers(modifier:modifiers(*))`)
    .order('name')
);
```

`mapProductRow` (`queries.ts:39-99`) reads `quantityOnHand`/`lowStockThreshold`
off `(row as { inventory?: ... }).inventory?...`, which is always `undefined`
here since the row never carries an `inventory` key. `ProductSchema`'s fields
are `optional()`, so this parses successfully to `undefined` rather than
throwing — the bug is silent, not a crash.

Net effect: for every existing product with real stock, the dialog's stock
strip always reads "0" on hand, "No threshold", and the `lowStockThreshold != null`
guard is always false so the "Low stock" warning badge can never render,
regardless of actual inventory state. A manager/admin opening the edit dialog
to check whether a product needs restocking is shown incorrect information
every time. The create-mutation's own post-insert refetch (`queries.ts:463-480`)
uses the identical select without the join, so even the create-then-stay
transition inherits this (harmlessly coincidental there, since a brand-new
product genuinely has 0 stock — but it's the same underlying bug).

The e2e coverage (`e2e/products/product-management.spec.ts` PM9/PM11) only
asserts the strip is *visible*, never that its numbers are correct, so this
shipped undetected.

**Fix:** Add the same `inventory(quantity_on_hand, low_stock_threshold)` join
to `useProductsForManagement`'s select (and the create mutation's post-insert
refetch) that `useProducts` already has:

```ts
.select(`
  *,
  category:categories(*),
  product_modifiers(modifier:modifiers(*)),
  inventory(quantity_on_hand, low_stock_threshold)
`)
```

## Warnings

### WR-01: `unitsPerPackage` input silently truncates non-integer entry instead of rejecting it

**File:** `src/features/manage-products/ui/ProductDetailDialog.tsx:267-277`

**Issue:**

```ts
let unitsPerPackage: number | null = null;
if (unitsPerPackageInput.trim() !== '') {
  const parsedUnits = Number.parseInt(unitsPerPackageInput.trim(), 10);
  if (!Number.isFinite(parsedUnits) || parsedUnits < 1) {
    applyFieldErrors({ unitsPerPackage: t('...unitsPerPackageMinError') });
    return;
  }
  unitsPerPackage = parsedUnits;
}
```

The `<Input type="number" min={1} step={1} .../>` in `ProductLinksTab.tsx`
does not block manual entry of a decimal (browsers only enforce `step` via
`checkValidity()`, not on keystroke), so a manager can type e.g. `2.5` or
`1e2`. `Number.parseInt` silently truncates these (`2.5` → `2`, `1e2` → `1`,
stopping at the first non-digit) rather than failing the
`!Number.isFinite(...)` guard, so the product is saved with a
different, wrong `unitsPerPackage` value and no validation error is ever
shown to the user.

**Fix:** Validate the raw string is a whole number before parsing, e.g.
`if (!/^\d+$/.test(unitsPerPackageInput.trim())) { applyFieldErrors(...); return; }`,
or use `Number(...)` plus `Number.isInteger(...)` instead of `parseInt` so a
decimal is rejected rather than truncated.

### WR-02: Catalog thumbnail conflates "signing failed" with "no photo uploaded"

**File:** `src/features/manage-products/ui/CatalogProductsTab.tsx:33-69`

**Issue:**

```ts
const showImage = !!url && !loadFailed;
const showSkeleton = !showImage && hasPhotoPath && isPending;
// ...
) : showSkeleton ? (
  <Skeleton .../>
) : (
  <div>...<ImageOff .../><span className="sr-only">{noPhotoLabel}</span></div>
)
```

Once the batch signing query resolves (`isPending` becomes `false`), a row
whose `photoPath` is set but whose per-row entry is missing from the
`photoUrls` map (e.g. `signProductPhotos` dropped it because Storage returned
a per-row error, per `resolveProductImage.ts:117-120`) falls straight to the
same "No photo" / `ImageOff` placeholder used for a product that genuinely
has no `photoPath` at all. These are different states — one is "no photo was
ever uploaded", the other is "a photo exists but failed to sign/load" — and
collapsing them means a staff member scanning the catalog for products that
still need a photo can't distinguish "needs a photo" from "has a broken
photo reference that needs re-uploading."

**Fix:** Thread `hasPhotoPath` into the terminal branch so a signing failure
renders a distinct (even if minimal) "photo unavailable" state instead of the
generic no-photo placeholder, e.g.:

```tsx
) : hasPhotoPath ? (
  <ImageOff .../> // "photo failed to load" copy
) : (
  <ImageOff .../> // "no photo" copy (current)
)
```

## Info

### IN-01: Client-side `MAX_UPLOAD_BYTES` (10 MB) is 5x the Storage bucket's `file_size_limit` (2 MB)

**File:** `src/features/manage-products/model/photo-file.ts:13` vs `supabase/migrations/20260907000001_product_photos_storage.sql:23`

`validatePhotoFile` accepts an original file up to 10 MB, but the bucket
itself (and the UI's own "10 MB max" formats hint) is capped at 2 MB
server-side. In practice `resizePhoto` downscales to ≤1200px WebP q0.8 before
upload, so this rarely surfaces — but a sufficiently high-entropy/dense image
near the 10 MB ceiling could still pass client validation and then fail at
the Storage `upload()` call with a generic `PHOTO_UPLOAD_FAILED`, which
doesn't tell the user why (the real cause — the 2 MB backstop — is
invisible to them, and the UI's own "10 MB max" copy is actively misleading
in that scenario). Worth tightening the client ceiling to match the bucket,
or surfacing the bucket's actual limit in the error copy, if this is ever
observed in practice.

### IN-02: `photoColumn`'s `cell` closure is rebuilt every render, resetting `CatalogThumbnailCell`'s local `loadFailed` state

**File:** `src/features/manage-products/ui/CatalogProductsTab.tsx:282-296`

The file contains an extensive, correct comment explaining why `stableColumns`
must be memoized (a fresh `cell` function identity each render makes
TanStack Table's `flexRender` unmount/remount the cell, dropping in-flight
input state). `photoColumn` is deliberately excluded from that memoization
and rebuilt every render, with the stated rationale that a thumbnail "carries
no focus or in-progress input to lose on remount." That's true for focus, but
`CatalogThumbnailCell` does hold local state (`loadFailed`, set via the
`<img>`'s `onError`) that resets to `false` on every unrelated table
re-render (e.g. any keystroke in any row's name/price draft), so a thumbnail
that already failed to load can silently flip back to attempting the image
load again on the next unrelated re-render. Purely cosmetic (an extra
network/cache request, momentary flicker), not a correctness issue — noted
for awareness, not required to fix.

---

_Reviewed: 2026-09-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
