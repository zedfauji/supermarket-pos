---
phase: 32-brand-entity-pack-weight-catalog-attributes
plan: 01
subsystem: database, ui, catalog
tags: [supabase, postgres, rls, zod, react-19, tanstack-query, playwright]

requires: []
provides:
  - "brands table + RLS + CRUD UI (BRND-01)"
  - "products.brand_id nullable FK, ON DELETE RESTRICT (BRND-02)"
  - "products.weight_amount/weight_unit catalog pack-size attribute (BRND-03)"
  - "entities/brand/ (useBrands + CRUD mutations)"
  - "brand-select + weight fields in the product edit dialog"
affects: [32-02, product-catalog, checkout-grid-filters]

actuals:
  tokens: 78000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Flat-entity CRUD (Brand) mirroring entities/category + useMutationDeleteModifier's delete pattern"
    - "Both-or-neither Zod .refine() attached to Create/Update schemas only, never the base schema"
    - "String-buffered optional-numeric input (weightAmountInput) paired with a pre-selected-but-inert unit default"

key-files:
  created:
    - supabase/migrations/20260908000001_brands_and_product_weight.sql
    - src/entities/brand/model/types.ts
    - src/entities/brand/model/queries.ts
    - src/entities/brand/model/index.ts
    - src/entities/brand/index.ts
    - src/features/manage-products/ui/CatalogBrandsTab.tsx
    - e2e/products/brands.spec.ts
  modified:
    - src/shared/lib/domain.ts
    - src/shared/lib/supabase.types.ts
    - src/features/manage-products/index.ts
    - src/widgets/InventoryPagePanel/ui/CatalogTab.tsx
    - src/features/manage-products/ui/ProductDetailDialog.tsx
    - src/features/manage-products/ui/tabs/ProductDetailsTab.tsx
    - src/features/manage-products/ui/CatalogProductsTab.tsx
    - src/features/manage-products/model/productDialogTabs.ts
    - src/entities/product/model/queries.ts
    - e2e/products/product-management.spec.ts

key-decisions:
  - "Used CatalogModifiersTab.tsx (not the dead-code CatalogCategoriesTab.tsx) as the structural template for Brand CRUD — research-verified live pattern"
  - "Both-or-neither weightAmount/weightUnit refine attached separately to ProductCreateSchema and ProductUpdateSchema, never the base ProductSchema, to preserve .omit()/.partial() chaining"
  - "weightUnit UI default 'g' is a plain form-field initial value, never read into the submit payload unless weightAmountInput is also non-empty"

patterns-established:
  - "Brand entity: name-only flat catalog entity with DB-level case-insensitive unique constraint and RESTRICT delete"

requirements-completed: [BRND-01, BRND-02, BRND-03, BRND-05]

coverage:
  - id: D1
    description: "Admin/manager creates, renames, and deletes a brand from a dedicated Brands sub-tab in Inventory -> Catalog, gated by manage_products RBAC"
    requirement: "BRND-01"
    verification:
      - kind: e2e
        ref: "e2e/products/brands.spec.ts#B1: admin creates a brand — visible in list"
        status: pass
      - kind: e2e
        ref: "e2e/products/brands.spec.ts#B2: admin renames a brand — updated name visible"
        status: pass
      - kind: e2e
        ref: "e2e/products/brands.spec.ts#B3: admin deletes a brand — removed from list"
        status: pass
      - kind: e2e
        ref: "e2e/products/brands.spec.ts#B5: cashier sees no Brands tab on Inventory Catalog"
        status: pass
    human_judgment: false
  - id: D2
    description: "Case-insensitive duplicate brand name is rejected by a DB-level unique constraint, surfaced as a toast error"
    requirement: "BRND-01"
    verification:
      - kind: e2e
        ref: "e2e/products/brands.spec.ts#B4: case-variant duplicate brand name rejected"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deleting a brand still referenced by a product is blocked outright (ON DELETE RESTRICT), never silently orphaning the product"
    requirement: "BRND-02"
    verification:
      - kind: e2e
        ref: "e2e/products/brands.spec.ts#B6: delete blocked when a product references the brand"
        status: pass
    human_judgment: false
  - id: D4
    description: "Product edit dialog assigns a brand from a dropdown and sets a pack weight (amount + unit); both-or-neither validation holds at schema and DB level"
    requirement: "BRND-03"
    verification:
      - kind: unit
        ref: "src/shared/lib/domain.product-schema.test.ts (13/13, incl. 8 new weightAmount/weightUnit cases)"
        status: pass
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts#PM19 (BRND-02/03): brand + pack weight persist on a seeded product"
        status: pass
    human_judgment: false
  - id: D5
    description: "Leaving the weight fields untouched on save never writes a phantom unit (D-09 default-unit trap)"
    requirement: "BRND-03"
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts#PM20 (D-09): saving without touching weight fields never writes a phantom unit"
        status: pass
    human_judgment: false

duration: 95min
completed: 2026-09-08
status: complete
---

# Phase 32 Plan 1: Brand Entity & Pack-Weight Catalog Attributes Summary

**New `brands` table + RLS-gated CRUD UI, and `products.brand_id`/`weight_amount`/`weight_unit` wired into the reshaped product dialog with both-or-neither validation at the Zod and DB layers.**

## Performance

- **Duration:** ~95 min
- **Tasks:** 2
- **Files modified:** 47 (15 in Task 1, 33 in Task 2, 1 file — `src/shared/lib/domain.ts` — touched by both)

## Accomplishments

- New `brands(id, name, created_at, updated_at)` table (D-01, name-only) with a case-insensitive unique index on `lower(name)` (D-03) and a full 5-policy RLS set mirroring `categories`/`products` (`brands_select_authenticated`, `anon_read_brands`, `brands_insert/update/delete_manager_admin`).
- `products.brand_id` (nullable FK, `ON DELETE RESTRICT`, D-02), `products.weight_amount` (`numeric(10,2)`), `products.weight_unit` (`text`, `CHECK IN ('g','kg','lb','oz')`), plus a both-or-neither `CHECK` constraint mirroring the client Zod refine and the existing `happy_hour_valid` precedent.
- New `entities/brand/` (TanStack Query: `useBrands`, create/update/delete mutations) and `CatalogBrandsTab.tsx` (list/create/edit/delete + `ConfirmDialog`), wired as a 5th "Brands" sub-tab in `Inventory → Catalog`, gated by the existing `manage_products` RBAC wrapper.
- Product edit dialog (`ProductDetailsTab.tsx`) gained a brand `<select>` and paired weight-amount/weight-unit fields right after Category (D-08); the both-or-neither invariant is enforced by two separate `.refine()` calls on `ProductCreateSchema`/`ProductUpdateSchema` (never the base `ProductSchema`, per the plan's Pitfall 4 guardrail).
- `e2e/products/brands.spec.ts` (new, 6 tests: create/rename/delete round-trip, case-variant duplicate rejection, cashier RBAC denial, RESTRICT-blocked delete) and two new tests in `e2e/products/product-management.spec.ts` (PM19: brand+weight persist and reload correctly; PM20: an untouched save never writes a phantom weight unit).

## Task Commits

1. **Task 1: Brand entity end-to-end — schema, RLS, CRUD UI** - `603b7a6` (feat)
2. **Task 2: Wire brand + weight fields into the product dialog** - `13625e0` (feat)

_Both tasks were `tdd="true"`: Task 1's RED move was the full `e2e/products/brands.spec.ts` B1 test (confirmed failing — no Brands tab existed — before any implementation); Task 2's RED move was the 8 new `domain.product-schema.test.ts` cases added before the schema/dialog wiring._

**Plan metadata:** (this commit)

## Files Created/Modified

**Created:**
- `supabase/migrations/20260908000001_brands_and_product_weight.sql` — brands table, RLS, products columns/constraints
- `src/entities/brand/model/{types,queries,index}.ts`, `src/entities/brand/index.ts` — brand entity module
- `src/features/manage-products/ui/CatalogBrandsTab.tsx` — Brands CRUD sub-tab
- `e2e/products/brands.spec.ts` — B1–B6 brand entity E2E coverage

**Modified (Task 1):**
- `src/shared/lib/domain.ts` — `BrandSchema`/`BrandCreateSchema`/`BrandUpdateSchema`
- `src/shared/lib/supabase.types.ts` — regenerated cleanly from the applied local migration
- `src/features/manage-products/index.ts`, `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx` — barrel export + 5th tab wiring
- `src/shared/lib/i18n/locales/{es-MX,en-US}/{featMgmt,wAdmin}.json` — brand copy + `tabBrands`

**Modified (Task 2):**
- `src/shared/lib/domain.ts` — `ProductSchema.brandId/weightAmount/weightUnit` + both-or-neither refines
- `src/features/manage-products/ui/{ProductDetailDialog,tabs/ProductDetailsTab,CatalogProductsTab}.tsx`, `src/features/manage-products/model/productDialogTabs.ts` — brand/weight state, submit payload, dirty-close snapshot
- `src/entities/product/model/queries.ts` — `mapProductRow`/`productUpdateToRow`/`useMutationCreateProduct` round-trip the three new columns
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` — brand/weight product-form labels
- `e2e/products/product-management.spec.ts` — PM19/PM20

## Decisions Made

- Used `CatalogModifiersTab.tsx` (not the dead-code `CatalogCategoriesTab.tsx` cited in CONTEXT.md's canonical_refs) as the structural template for Brand CRUD, per RESEARCH.md's Pitfall 1 correction — the live "Categories" sub-tab actually renders `CategoryTreeEditor`, which has no delete UI Brand needs.
- Both-or-neither `weightAmount`/`weightUnit` validation is attached as two separate `.refine()` calls on `ProductCreateSchema` and `ProductUpdateSchema` — never on the base `ProductSchema` — to avoid breaking the existing `.omit()`/`.partial()` derivation chain (RESEARCH.md Pattern 3/Pitfall 4).
- `weightUnit`'s pre-selected `'g'` default (D-09) is a plain UI initial value; the submit payload only includes it when `weightAmountInput` is also non-empty, so an untouched product save never persists a phantom unit with no amount.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `mapInventoryRow` broke the entire `/inventory` list fetch**
- **Found during:** Task 2, full E2E regression run (`PM8: cashier on /inventory sees manager-only inventory controls disabled` failed with no inventory rows rendered at all)
- **Issue:** `entities/inventory/model/queries.ts`'s `mapInventoryRow` calls `ProductSchema.parse({...})` directly; `ProductSchema` now requires `brandId`/`weightAmount`/`weightUnit` present (nullable, not optional). The call site omitted them entirely, so `undefined` failed `.nullable()` validation and threw inside `mapInventoryRow`'s try/catch — poisoning the whole `/inventory` list on the very first row, exactly the failure mode an existing code comment at that call site warned about for `unitsPerPackage`/`parentProductId` in Phase 27.
- **Fix:** Added the same `(productRaw['field'] as T | null | undefined) ?? null` cast pattern for the three new fields.
- **Files modified:** `src/entities/inventory/model/queries.ts`
- **Verification:** `PM8` re-run green; full unit suite green.
- **Committed in:** `13625e0` (Task 2 commit)

**2. [Rule 1 - Bug] Three more `ProductSchema.parse()` call sites broken the same way**
- **Found during:** Task 2, proactive repo-wide grep for `ProductSchema.parse(` after finding the inventory bug above (not caught by `tsc` since these calls pass loosely-typed objects to `.parse(data: unknown)`)
- **Issue:** `entities/tab/model/queries.ts`, `entities/purchase-order/model/queries.ts`, and `entities/open-unit/model/queries.ts` each construct a `ProductSchema.parse({...})` payload without the three new fields — same runtime-throw risk on any order/PO/open-unit row carrying a joined product.
- **Fix:** Added `brandId`/`weightAmount`/`weightUnit` to all three call sites, using each file's existing cast convention (typed `Tables<'products'>` direct access for `purchase-order`, bracket-cast `Record<string, unknown>` for the other two).
- **Files modified:** `src/entities/tab/model/queries.ts`, `src/entities/purchase-order/model/queries.ts`, `src/entities/open-unit/model/queries.ts`
- **Verification:** `npm run typecheck` clean; full unit suite green; full E2E product-management + brands specs green (25/25).
- **Committed in:** `13625e0` (Task 2 commit)

**3. [Rule 3 - Blocking] `src/shared/lib/mocks.ts`'s shared test-fixture factories needed the new fields**
- **Found during:** Task 2, after fixing the above — `generateMockProduct` and four Storybook-scenario product factories (`productCorona`/`productTitos`/`productLime`/`productGuinness`) all call `ProductSchema.parse()` without the new required keys, which would break every Storybook story and any test importing these factories at runtime (not caught by `tsc` for the same reason as above).
- **Fix:** Added `brandId: null, weightAmount: null, weightUnit: null` to all 5 factory call sites.
- **Files modified:** `src/shared/lib/mocks.ts`
- **Verification:** `npm run typecheck` and full unit suite (1592 passing) confirm no fallout.
- **Committed in:** `13625e0` (Task 2 commit)

**4. [Rule 3 - Blocking] 15 test-fixture files needed the new required ProductSchema keys**
- **Found during:** Task 2, `npm run typecheck` after adding `brandId`/`weightAmount`/`weightUnit` to the base `ProductSchema`
- **Issue:** ~15 test/story files construct a `Product`-typed object literal directly (not through a factory), each missing the three new keys — a compile-time `tsc` failure (TS2739/TS2352), not a deviation from the plan's intended scope but a mechanical consequence of tightening the shared schema.
- **Fix:** Added `brandId: null, weightAmount: null, weightUnit: null` to each fixture, matching the existing `parentProductId: null` neighbor line.
- **Files modified:** see `git show 13625e0 --stat` — includes `domain.test.ts`, `domain.open-unit-schema.test.ts`, `entities/inventory/model/store.test.ts`, and 12 others.
- **Verification:** `npm run typecheck` clean; full unit suite green (1592 passing, only pre-existing unrelated environment failures remain).
- **Committed in:** `13625e0` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 2 Rule 3 blocking fixes)
**Impact on plan:** All four were mechanical, necessary consequences of adding required-but-nullable fields to the shared `ProductSchema` — the two Rule 1 fixes are genuine pre-existing-pattern bugs this plan's schema change exposed (both already had an in-code comment warning this exact failure mode had happened before, for `unitsPerPackage`/`parentProductId`). No scope creep; nothing here touches brand/weight business logic beyond making the schema change safe repo-wide.

## Issues Encountered

- While editing `src/shared/lib/mocks.ts`'s remaining 4 factories, an errant `Write` call briefly clobbered the file with placeholder content. Recovered immediately via `git show HEAD:src/shared/lib/mocks.ts` (the file's prior committed state, since these edits were not yet committed) and reapplied all intended changes — verified via `git diff` and a full re-typecheck before proceeding. No data loss; documented here per the "read fully before laziness" principle.

## User Setup Required

None — the local Supabase migration was applied directly (`npx supabase migration up --local`) and types regenerated cleanly (`npx supabase gen types typescript --local`); no `as any` workaround was needed. Local-vs-remote migration status: applied to the local dev database this project's E2E suite targets; not yet pushed to the linked remote project (out of scope for this plan — remote push happens at ship time per this project's usual workflow).

## Next Phase Readiness

- `brands` table, `products.brand_id`/`weight_amount`/`weight_unit`, and the product dialog's write path are all live — Plan 02 (BRND-04, filter-by-brand/weight in both admin Catalog and the POS checkout grid) can proceed without further schema work.
- `anon_read_brands` RLS policy is in place, so Plan 02's POS grid brand filter will be able to read brand names in every render path (Pitfall 5 from RESEARCH.md was explicitly not skipped).
- No blockers.

---
*Phase: 32-brand-entity-pack-weight-catalog-attributes*
*Completed: 2026-09-08*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`603b7a6`, `13625e0`) verified present in `git log`.
