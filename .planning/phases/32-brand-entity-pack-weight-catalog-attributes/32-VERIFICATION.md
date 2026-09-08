---
phase: 32-brand-entity-pack-weight-catalog-attributes
verified: 2026-09-08T22:08:22Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 32: Brand Entity & Pack-Weight Catalog Attributes Verification Report

**Phase Goal:** Add a brand entity (flat, name-only) and a catalog pack-weight attribute (weight_amount/weight_unit) to the product catalog, with a full brand CRUD UI, RLS enforcement, and brand/weight-unit filtering on both the admin Catalog table and the POS checkout grid.
**Verified:** 2026-09-08T22:08:22Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin/manager can create, rename, delete a brand from a dedicated Brands sub-tab in Inventory→Catalog, gated by `manage_products`; cashier never sees it | ✓ VERIFIED | `e2e/products/brands.spec.ts` B1/B2/B3/B5 — re-ran live: **6/6 passed** against the running dev server (see Behavioral Spot-Checks). `CatalogTab.tsx` line 35/49-51 wires a 5th `TabsTrigger`/`TabsContent value="brands"` inside the existing `ProtectedAction action="manage_products"` wrapper. |
| 2 | Case-insensitive duplicate brand name is rejected by a DB-level unique constraint, surfaced as a toast error | ✓ VERIFIED | DB: `brands_lower_name_key UNIQUE btree (lower(name::text))` confirmed live via `psql \d+ brands`. E2E B4 re-run passed; assertion now matches the real `AppError.message` ("already exists") after the CR-01 fix (commit `e7850d4`), confirmed by reading the current `brands.spec.ts:192` and a live pass. |
| 3 | Deleting a brand referenced by ≥1 product is blocked by `ON DELETE RESTRICT`, never silently orphaning | ✓ VERIFIED | DB: `products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT` confirmed live. E2E B6 re-run passed; assertion matches real message ("invalid reference"), plus service-client check that `brand_id` is unchanged. |
| 4 | Product edit dialog lets admin/manager assign a brand from an alphabetical dropdown, or leave unassigned (nullable) | ✓ VERIFIED | `ProductDetailsTab.tsx:108-121` renders brand `<select>` with `noBrand` sentinel + `brands.map`; `useBrands()` orders `.order('name')` (`entities/brand/model/queries.ts:62`). PM19 E2E (part of the 20-passed `product-management.spec.ts` run) proves brand persists. |
| 5 | Product edit dialog lets admin/manager set pack weight (amount+unit) right after Category (D-08); untouched fields persist NULL/NULL, never a phantom unit (D-09) | ✓ VERIFIED | `ProductDetailsTab.tsx:129-157` renders the weight fields immediately after Category. `ProductDetailDialog.tsx:313`: `payloadWeightUnit = weightAmount === null ? null : weightUnit` — the pre-selected `'g'` default is provably excluded from the payload unless amount is also set. PM20 E2E (passed) asserts `brand_id`/`weight_amount`/`weight_unit` are all NULL after an untouched save via the service client. |
| 6 (backstop) | A direct DB write setting `weight_amount` without `weight_unit` (or vice versa) is rejected by a CHECK constraint independent of client validation | ✓ VERIFIED | Live `psql` INSERT directly against the local Postgres (bypassing all app code) with `weight_amount=1.5, weight_unit` omitted → `ERROR: violates check constraint "weight_both_or_neither"`. Zero-amount insert (`weight_amount=0, weight_unit='g'`) → `ERROR: violates check constraint "weight_amount_positive"`. Both confirmed by direct SQL, not inferred from application code. |
| 7 | Admin Catalog→Products table filters by brand and weight unit via dropdowns above the table (D-11), composing with existing text search | ✓ VERIFIED | `CatalogProductsTab.tsx:190-195` (`brandFilter`/`weightUnitFilter` state + `.filter()`), `:474-503` (`toolbar` prop on `DataTable` with the two `<select>`s). PM21 E2E (passed, part of the 20-passed run) asserts exactly one row visible after selecting a brand. |
| 8 | POS checkout grid (/pos) shows brand/weight-unit dropdown filters below `CategoryTabs`, AND-composed with the active category (D-12) | ✓ VERIFIED | `ProductGrid.tsx:40-58` (`activeBrand`/`activeWeightUnit` state AND'd into the `matches` predicate alongside `activeCategory`), rendered below `<CategoryTabs>`. `e2e/checkout/product-grid-brand-weight-filters.spec.ts` re-run live: **2/2 passed**, proving AND-composition (same-category sibling disappears) and independent weight-unit narrowing. |
| 9 | `CategoryTabs` itself is untouched by this phase (D-12) | ✓ VERIFIED | `git log --oneline -- src/entities/product/ui/CategoryTabs.tsx` shows its last modification predates every Phase 32 commit; `git diff --name-only <pre-phase-commit> -- src/entities/product/ui/CategoryTabs.tsx` prints nothing. |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260908000001_brands_and_product_weight.sql` | brands table, RLS, products columns/CHECKs | ✓ VERIFIED | Applied to local DB (`supabase migration list --local` shows `20260908000001` local=remote). Content matches plan exactly: `brands` table, `lower(name)` unique index, 5 RLS policies, `brand_id` FK RESTRICT, 3 weight CHECK constraints, index on `brand_id`. |
| `src/entities/brand/model/queries.ts` | `useBrands`/create/update/delete mutations | ✓ VERIFIED | All 4 hooks present, mirror `entities/category` pattern, invalidate `['brands']`+`['products']` on success. |
| `src/features/manage-products/ui/CatalogBrandsTab.tsx` | Brand CRUD sub-tab UI | ✓ VERIFIED | Full list/create/edit/delete + `ConfirmDialog`, wired into `CatalogTab.tsx` as 5th tab. |
| `e2e/products/brands.spec.ts` | B1-B6 coverage | ✓ VERIFIED | 6 tests, **live re-run: 6/6 passed** (CR-01 fix confirmed working, not just claimed). |
| `src/features/manage-products/ui/CatalogProductsTab.tsx` (brand/weight toolbar) | admin filter dropdowns | ✓ VERIFIED | `toolbar` prop used on `DataTable`, `filteredProducts` computed and passed as `data`. |
| `src/widgets/ProductGrid/ui/ProductGrid.tsx` (brand/weight secondary filters) | POS grid filter dropdowns | ✓ VERIFIED | Two `<select>`s below `CategoryTabs`, AND-composed predicate. |
| `e2e/checkout/product-grid-brand-weight-filters.spec.ts` | POS filter coverage | ✓ VERIFIED | 2 tests, **live re-run: 2/2 passed**. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `products.brand_id` | `ProductDetailDialog` submit handler | `brandIdVal = brandId === '' ? null : brandId` → `ProductCreateSchema`/`UpdateSchema` payload → `mapProductRow`/`productUpdateToRow` | ✓ WIRED | `ProductDetailDialog.tsx:308,337,378`; `entities/product/model/queries.ts` round-trips `brand_id`. |
| `products.weight_amount`/`weight_unit` | same round trip, gated by both-or-neither refine | `ProductCreateSchema`/`ProductUpdateSchema.refine()` (`domain.ts:323-341`) | ✓ WIRED | Unit tests (13/13 passing) directly exercise both refine paths; DB CHECK independently confirmed live. |
| `useBrands()` (Plan 01) | Plan 02's two filter dropdowns | direct import `@entities/brand` in `CatalogProductsTab.tsx`/`ProductGrid.tsx` | ✓ WIRED | Both files import and call `useBrands()`; options populate from live data (not hardcoded). |
| `anon_read_brands` RLS | POS grid brand filter data availability | RLS policy on `brands` table | ✓ WIRED | Confirmed live via `psql \d+ brands` — policy present, `TO anon, authenticated`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `CatalogBrandsTab` brand list | `sorted` (from `brands`) | `useBrands()` → live Supabase `brands` table query | Yes | ✓ FLOWING |
| Brand `<select>` (product dialog) | `brands` prop | `CatalogProductsTab`'s `useBrands()` threaded down | Yes | ✓ FLOWING |
| Admin Catalog brand/weight filters | `filteredProducts` | `.filter()` over live `products` query result | Yes | ✓ FLOWING |
| POS grid brand/weight filters | `matches` | `.filter()` over live `products` + `useBrands()` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Brand CRUD + RBAC + duplicate-reject + RESTRICT-delete E2E (re-run against live dev server, not trusting SUMMARY claims) | `npx playwright test e2e/products/brands.spec.ts --reporter=line` | `6 passed (1.5m)` | ✓ PASS |
| POS grid brand/weight filter AND-composition E2E (re-run) | `npx playwright test e2e/checkout/product-grid-brand-weight-filters.spec.ts --reporter=line` | `2 passed (22.3s)` | ✓ PASS |
| Full product-management regression incl. PM19/PM20/PM21 (re-run) | `npx playwright test e2e/products/product-management.spec.ts --reporter=line` | `20 passed, 1 skipped (6.0m)` | ✓ PASS |
| Zod schema unit tests (re-run) | `npx vitest run src/shared/lib/domain.product-schema.test.ts` | `13 passed (1 file)` | ✓ PASS |
| `npm run typecheck` | `npm run typecheck` | clean exit | ✓ PASS |
| `npm run lint` | `npm run lint` (max-warnings 0) | clean exit (only a pre-existing eslint-boundaries legacy-selector info warning, no errors) | ✓ PASS |
| DB CHECK constraint enforced independent of client (backstop must-have) | direct `psql` INSERT bypassing all app code | Both violation attempts rejected with the expected constraint names | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BRND-01 | 32-01 | `brands` table + CRUD UI, `manage_products`-gated | ✓ SATISFIED | Migration + `CatalogBrandsTab.tsx` + E2E B1-B3/B5 live-passing. |
| BRND-02 | 32-01 | nullable `brand_id` FK + product dialog assignment | ✓ SATISFIED | Migration FK + `ProductDetailsTab.tsx` brand select + PM19. |
| BRND-03 | 32-01 | `weight_amount`/`weight_unit` catalog attribute, independent of loose-weight system | ✓ SATISFIED | Migration columns/CHECKs + Zod schema/refine + PM19/PM20. Independence confirmed — grepped `soldByWeight`/`unitsPerPackage`/loose-weight checkout code paths, none reference `weightAmount`/`weightUnit`. |
| BRND-04 | 32-02 | filter by brand/weight-unit on both catalog surfaces | ✓ SATISFIED | `CatalogProductsTab.tsx` toolbar + `ProductGrid.tsx` secondary filters, PM21 + checkout filter spec live-passing. |
| BRND-05 | 32-01/32-02 | Automated Playwright E2E: CRUD, RBAC denial, weight validation, filter-by-brand/weight | ✓ SATISFIED | `brands.spec.ts` (6), `product-management.spec.ts` PM19-21, `product-grid-brand-weight-filters.spec.ts` (2) — all re-run live and green. |

No orphaned requirements found — REQUIREMENTS.md lines 300-304 map exactly to BRND-01..05, all claimed by plan frontmatter (`requirements:` fields in both PLAN.md files) and all satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/migrations/20260908000001_brands_and_product_weight.sql` | 28-32 | Redundant RLS SELECT policy (`brands_select_authenticated` fully subsumed by `anon_read_brands`) | ℹ️ Info (WR-01, code review, not fixed) | Not a security bug (both policies are OR-combined and equally permissive today); a latent trap if either is edited independently later. Non-blocking, already documented in 32-REVIEW.md as accepted open debt. |
| `src/features/manage-products/ui/CatalogBrandsTab.tsx` | 214 | Hardcoded `error=""` on the name `FormField` — no inline validation error, toast-only feedback | ℹ️ Info (WR-02, code review, not fixed) | UX rough edge, not a functional defect (toast still surfaces the error). Non-blocking, already documented as accepted open debt. |
| `src/entities/inventory/model/queries.ts`, `entities/tab/model/queries.ts` | ~95-110 | Stale "not in supabase.types.ts yet" comments on casts that are no longer needed | ℹ️ Info (IN-01, code review, not fixed) | Pre-existing pattern, not a regression. Non-blocking cosmetic debt. |
| `src/features/manage-products/ui/ProductDetailDialog.tsx` | 312 | `Number(weightAmountInput.trim())` assumes `.`-decimal, not locale-aware for es-MX comma decimals | ℹ️ Info (IN-02, code review, not fixed) | Matches existing `MoneyInput` precedent elsewhere in the codebase; rejected cleanly by Zod (no crash), not a new inconsistency. Non-blocking. |

No `TBD`/`FIXME`/`XXX` debt markers found in any Phase 32 file. WR-01/WR-02/IN-01/IN-02 were explicitly called out by the orchestrator's task brief as "remain open as documented non-blocking debt" — confirmed still present and still non-blocking on independent review; none affect any must-have truth.

### Human Verification Required

None. All must-haves are automatable and were verified via live re-run (not merely inferred from SUMMARY.md), consistent with this project's CLAUDE.md mandatory-automated-testing policy.

### Gaps Summary

None. All 9 derived observable truths (roadmap goal + PLAN frontmatter must-haves, merged) are VERIFIED with live evidence — migration applied to the local DB reachable by the E2E suite, RLS policies and CHECK constraints confirmed via direct SQL bypassing application code, brand CRUD/RBAC/duplicate-reject/RESTRICT-delete E2E re-run 6/6 passing (including the CR-01 toast-assertion fix), both catalog-browsing surfaces' filters re-run passing (2/2 checkout + 20/21 product-management, 1 pre-existing unrelated skip), unit tests 13/13, typecheck and lint clean. CR-01 (the one critical code-review finding) is confirmed fixed in the source and validated by a live green re-run, not merely trusted from the review/SUMMARY claim. WR-01/WR-02/IN-01/IN-02 remain as documented non-blocking debt, matching the orchestrator's stated expectation exactly.

---

_Verified: 2026-09-08T22:08:22Z_
_Verifier: Claude (gsd-verifier)_
