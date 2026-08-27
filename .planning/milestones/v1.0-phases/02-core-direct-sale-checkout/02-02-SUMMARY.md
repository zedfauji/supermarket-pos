---
phase: 02-core-direct-sale-checkout
plan: 02
subsystem: checkout
tags: [react, supabase, barcode, tanstack-query, zustand, playwright]
requires:
  - phase: 02-core-direct-sale-checkout
    provides: direct-sale checkout panel and cart from Plan 02-01
provides:
  - USB-HID barcode scans that add catalog products to the cart
  - Audit logging and feedback for unmatched barcode scans
  - Category tabs composed with text search in the checkout product grid
affects: [02-03 multi-unit checkout, product catalog, checkout]
actuals:
  tokens: 11544
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - Full barcode fallback rows share the product query mapper
    - Scanner handling is mounted once at the checkout-panel level
key-files:
  created:
    - src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts
    - e2e/51-barcode-scan-search.spec.ts
  modified:
    - src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/widgets/ProductGrid/ui/ProductGrid.tsx
    - src/entities/product/model/queries.ts
key-decisions:
  - "Use the existing CategoryTabs null sentinel for the all-categories state."
  - "Map a full fallback product row rather than relying on a second cache lookup."
patterns-established:
  - "Unmatched scanner input is audit-logged without affecting cart state."
requirements-completed: [CHK-01, CHK-02]
coverage:
  - id: D1
    description: "Known barcode scans add one catalog product to the cart, while unknown scans show feedback and request audit logging."
    requirement: CHK-01
    verification:
      - kind: e2e
        ref: e2e/51-barcode-scan-search.spec.ts
        status: unknown
    human_judgment: false
  - id: D2
    description: "Category tabs compose with product search and show the product-grid empty state."
    requirement: CHK-02
    verification:
      - kind: e2e
        ref: e2e/51-barcode-scan-search.spec.ts#category-tabs-compose-with-search-and-show-the-empty-state
        status: unknown
    human_judgment: false
duration: 8min
completed: 2026-08-12
status: complete
---

# Phase 02 Plan 02: Barcode Scanning and Category Browsing Summary

**Checkout now scans current catalog barcodes into the cart, audit-logs misses, and lets cashiers browse categories alongside text search.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-12T17:32:23Z
- **Completed:** 2026-08-12T17:40:27Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added a checkout-level USB-HID scanner composition hook that uses the catalog cache fast path and a full fallback row query.
- Added localized unmatched-scan feedback and `barcode.scan_failed` audit calls without creating catalog data or changing the cart.
- Added controlled category browsing that composes with search plus loading, error, and empty states using existing components.

## Task Commits

1. **Task 1: Barcode lookup, scanner, and audit logging (RED)** - `a68bd26` (test)
2. **Task 1: Barcode lookup, scanner, and audit logging (GREEN)** - `0340fcf` (feat)
3. **Task 2: Category-browsable product grid** - `598f191` (feat)

## Files Created/Modified

- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` - Scanner-to-cart composition with unmatched-scan audit logging.
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` - Full, mapped database fallback for cache misses.
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` - Single scanner mount above all checkout focus states.
- `src/widgets/ProductGrid/ui/ProductGrid.tsx` - Category/search composition and existing loading/error rendering.
- `e2e/51-barcode-scan-search.spec.ts` - Scanner, audit, and category/search coverage.

## Decisions Made

- Reused `CategoryTabs` unchanged with its existing `null` all-categories contract.
- Reused the catalog row mapper so scanner fallback products have the same full shape as `useProducts()` results.

## TDD Gate Compliance

- **RED:** `a68bd26` adds scanner behavior coverage before implementation.
- **GREEN:** `0340fcf` implements the scanner behavior after the RED commit.

## Deviations from Plan

None - plan implementation followed the prescribed scanner, audit, mapping, and category-tab approach.

## Issues Encountered

- `npx playwright test e2e/51-barcode-scan-search.spec.ts` timed out during the shared `beforeEach` in `resetTestState()` / `openCaja()` before any plan assertion ran. The unrun verify is recorded in `.planning/WINDOWS.md` and `deferred-items.md`.
- `npm run lint` remains red only in pre-existing Plan 02-01 checkout files (`useCheckoutSale.ts` and `PaymentForm.tsx`); the touched files pass targeted ESLint and `npm run typecheck` passes.
- `npx tsc --noEmit -p e2e/tsconfig.json` has unrelated existing errors across legacy E2E specs and helpers.

## User Setup Required

None - no new external configuration is required.

## Next Phase Readiness

- Plan 02-03 can build on the same cart and scanner flow for loose-weight and multi-unit products.
- Restore the local Supabase E2E setup to execute the recorded barcode/category assertions end-to-end.

## Self-Check: PASSED

- Task commits `a68bd26`, `0340fcf`, and `598f191` exist.
- Scanner hook, product grid, lookup hook, and barcode/category E2E spec exist.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-12*
