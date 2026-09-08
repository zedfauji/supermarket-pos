---
phase: 32-brand-entity-pack-weight-catalog-attributes
plan: 02
subsystem: ui, catalog
tags: [react-19, tanstack-query, playwright, i18next]

requires:
  - phase: 32-brand-entity-pack-weight-catalog-attributes/01
    provides: "brands table + RLS + useBrands(); products.brandId/weightUnit live on Product"
provides:
  - "brand/weight-unit filter dropdowns on the admin Catalog product table (BRND-04)"
  - "brand/weight-unit secondary filter dropdowns on the POS checkout grid, AND-composed with the active category tab (BRND-04, D-12)"
  - "e2e/checkout/product-grid-brand-weight-filters.spec.ts (new)"
affects: [product-catalog, checkout-grid-filters]

actuals:
  tokens: 5000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Client-side array .filter() composed with DataTable's toolbar prop / an existing activeCategory predicate — no new filter-panel component, no server-side query param (D-11/D-12)"

key-files:
  created:
    - e2e/checkout/product-grid-brand-weight-filters.spec.ts
  modified:
    - src/features/manage-products/ui/CatalogProductsTab.tsx
    - src/widgets/ProductGrid/ui/ProductGrid.tsx
    - src/shared/lib/i18n/locales/es-MX/featMgmt.json
    - src/shared/lib/i18n/locales/en-US/featMgmt.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - e2e/products/product-management.spec.ts

key-decisions:
  - "Brand/weight-unit filter option text for the POS grid's weight-unit dropdown uses the raw unit code (g/kg/lb/oz) rather than the longer productForm translation strings (\"Gram (g)\"), matching the terser convention filter UIs use elsewhere; disabled via eslint-disable with a unit-code justification comment, mirroring this file's existing Tailwind-classname disable precedent."
  - "CatalogProductsTab's DataTable now receives filteredProducts (pre-filtered by brand/weight) as data, with DataTable's own searchable text filter still applying on top — same layering ProductGrid already used for activeCategory + query."

patterns-established: []

requirements-completed: [BRND-04, BRND-05]

coverage:
  - id: D1
    description: "Admin/manager narrows the Catalog -> Products table by brand and by weight unit via two new dropdowns above the table, composing with the existing text search"
    requirement: "BRND-04"
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts#PM21 (BRND-04/05): the admin Catalog table narrows to one brand via the brand filter dropdown"
        status: pass
    human_judgment: false
  - id: D2
    description: "A cashier/manager on /pos narrows the product grid by brand and weight unit, AND-composed with the active category tab (never replacing it); CategoryTabs itself is unmodified"
    requirement: "BRND-04"
    verification:
      - kind: e2e
        ref: "e2e/checkout/product-grid-brand-weight-filters.spec.ts#brand filter narrows within the active category, category tab stays selected (AND-composition, D-12)"
        status: pass
      - kind: e2e
        ref: "e2e/checkout/product-grid-brand-weight-filters.spec.ts#weight-unit filter narrows independently of the brand filter"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-08
status: complete
---

# Phase 32 Plan 2: Brand Entity & Pack-Weight Catalog Attributes Summary

**Brand/weight-unit filter dropdowns added to both the admin Catalog product table and the POS checkout grid, client-side filtering over Plan 01's brand/weight data, composing with (not replacing) each surface's existing search/category mechanism.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 8 (7 modified, 1 created)

## Accomplishments

- `CatalogProductsTab.tsx` gained a `toolbar` on its `DataTable` (D-11) with two native `<select>`s (brand, weight unit) that pre-filter the `products` array before it reaches `DataTable`, so the table's own `searchable` text search still applies on top.
- `ProductGrid.tsx` gained two secondary `<select>`s rendered directly below `CategoryTabs`, AND-composed into the existing `matches` predicate alongside `activeCategory` and the search query (D-12) — `CategoryTabs.tsx` itself received zero changes, verified via `git diff --name-only` on every task.
- New `e2e/checkout/product-grid-brand-weight-filters.spec.ts` (2 tests): proves a same-category, different-brand sibling product disappears when the brand filter is applied while the category tab stays `aria-selected`, and that the weight-unit dropdown narrows independently of the brand dropdown.
- New PM21 test in `e2e/products/product-management.spec.ts`: seeds two brands/products, proves selecting a brand narrows the admin table to that brand's row and hides the sibling, and vice versa.
- i18n: `brandFilterLabel`/`allBrands`/`weightUnitFilterLabel`/`allWeightUnits` added to both `featMgmt.manageProducts.productsTab` and `wPanels.checkoutPanel`, in both `es-MX`/`en-US`.

## Task Commits

1. **Task 1: Brand/weight-unit filter dropdowns on the admin Catalog table** - `f5ca23d` (feat)
2. **Task 2: Brand/weight-unit filter dropdowns on the POS checkout grid** - `2b3fe7f` (feat)

## Files Created/Modified

**Created:**
- `e2e/checkout/product-grid-brand-weight-filters.spec.ts` — POS grid AND-composition + independent weight-unit narrowing coverage

**Modified:**
- `src/features/manage-products/ui/CatalogProductsTab.tsx` — `brandFilter`/`weightUnitFilter` state, `filteredProducts`, `DataTable` `toolbar` prop
- `src/widgets/ProductGrid/ui/ProductGrid.tsx` — `activeBrand`/`activeWeightUnit` state, AND-composed into `matches`, two `<select>`s below `CategoryTabs`
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` — admin filter copy
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wPanels.json` — POS grid filter copy
- `e2e/products/product-management.spec.ts` — PM21 (admin brand filter E2E)

## Decisions Made

- Weight-unit filter option text uses the raw unit code (`g`/`kg`/`lb`/`oz`) rather than the longer `productForm` translation strings ("Gram (g)") used in the product edit dialog — appropriate for a compact filter dropdown; suppressed via `eslint-disable` with a unit-code justification comment (mirrors this file's existing Tailwind-classname disable precedent).
- No shared filter-dropdown component was extracted between the two surfaces — CONTEXT.md left this to discretion, and the two surfaces' rendering contexts (`DataTable` `toolbar` prop vs. a plain `<div>` below `CategoryTabs`) are different enough that a shared primitive would add indirection without reducing the actual duplicated logic (two `<select>`s + an "all" sentinel each).

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-4 deviations encountered; Plan 01 already made `brandId`/`weightUnit` required-but-nullable on `Product` and fixed every call site, so this plan's read-only filter predicates needed no schema or mapper changes.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BRND-04 and BRND-05 (filter-by-brand/weight-unit on both surfaces, E2E coverage) are both complete. This was the last plan (wave 2 of 2) in Phase 32 — phase-level verification/completion is the orchestrator's next step, not this plan's.
- No blockers.

---
*Phase: 32-brand-entity-pack-weight-catalog-attributes*
*Completed: 2026-09-08*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`f5ca23d`, `2b3fe7f`) verified present in `git log`.
