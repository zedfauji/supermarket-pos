# Phase 32: Brand Entity & Pack-Weight Catalog Attributes - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Products can be assigned a **brand** (new `brands` table with its own CRUD sub-tab, same pattern
as existing Categories management) and a **catalog pack-size attribute** (`weight_amount` +
`weight_unit`: g/kg/lb/oz) — independent of the existing loose-weight-at-checkout/open-unit
system. Both are filterable in product search/catalog browsing, in **both** the admin Catalog
page and the POS checkout grid.

**In scope:** `brands` table + CRUD (dedicated sub-tab in Inventory→Catalog, mirroring
`CatalogCategoriesTab.tsx`), `products.brand_id` FK, `products.weight_amount`/`weight_unit`
columns, brand-select + weight fields added to Phase 31's `ProductDetailsTab`, brand/weight
dropdown filters in both `CatalogProductsTab.tsx` (admin) and the POS checkout `ProductGrid`
(alongside `CategoryTabs.tsx`), Playwright E2E per BRND-05.

**Out of scope:** brand logo/image (explicitly decided against, see D-01), reusing or altering
the existing loose-weight-at-checkout/open-unit system, multi-brand-per-product, weight-based
unit-price calculations (this is a display/filter attribute only, not a pricing input).

</domain>

<decisions>
## Implementation Decisions

### Brand Entity Shape & Delete Behavior

- **D-01:** Brand has **name only** — no logo, no sortOrder, no description. Rejected: name+logo
  (would reuse Phase 31's Storage/signed-URL pattern but adds scope not requested), name+sortOrder
  (Category has this for manual dropdown ordering; brand dropdown will just sort alphabetically).
- **D-02:** `products.brand_id` uses **`ON DELETE RESTRICT`**, same as `category_id`, even though
  `brand_id` is nullable (unlike `category_id` which is `NOT NULL`). Deleting a brand is blocked
  while any product references it — the admin must reassign/clear those products' brand first.
  Rejected: `ON DELETE SET NULL` (would have been more natural for a nullable FK, but the user
  chose the stricter, more-explicit-reassignment option, consistent with Phase 31's pattern of
  picking the stricter choice over the cheaper one).
  — **Reversibility:** costly — changing the FK action later requires a migration altering the
  constraint; no data loss risk either way, but any code written assuming "delete always succeeds"
  (SET NULL world) vs "delete can fail with a FK violation" (RESTRICT world) would need rework.
- **D-03:** Brand `name` has a **DB-level unique constraint on `lower(name)`** — case-insensitive
  uniqueness, same defensive pattern expected of catalog entities. Prevents "Nestle" / "nestle"
  duplicates from typos.

### Brand Management UI Placement

- **D-04:** Brand management is a **dedicated sub-tab** inside Inventory→Catalog, alongside the
  existing Products and Categories sub-tabs — a new component mirroring
  `CatalogCategoriesTab.tsx` structurally (full list/create/edit/delete table), not a lighter
  inline-only affordance. Rejected: inline-only "+ Add brand" from the product dialog's brand
  dropdown with no way to rename/delete later without DB access.
- **D-05:** The Brands sub-tab uses the **same `manage_products` RBAC gate** as the Products and
  Categories sub-tabs already do — no new permission action introduced.

### Weight Field UX & Validation

- **D-06:** `weight_amount` and `weight_unit` are **both-or-neither** — a Zod `.refine()` pair
  check rejects setting one without the other. Rejected: fully independent optional fields (would
  allow a meaningless "— kg" or a bare number with no unit).
- **D-07:** `weight_amount` uses **2 decimal places** (`z.number().positive()` with a
  `multipleOf(0.01)`-style precision constraint), matching the existing `MoneySchema` pattern in
  `domain.ts`. Supports "0.5 kg" or "1.25 lb", not just whole numbers.
- **D-08:** The weight fields sit **right after the Category field** in `ProductDetailsTab`,
  before base price/SKU/barcode/active — grouping brand+weight together as the two new "catalog
  attribute" fields near the top of the form. Rejected: appending at the end after Active, which
  would have avoided any visual reflow of existing fields but buries the new attributes.
- **D-09:** `weight_unit`'s UI default is **`'g'`** (pre-selected in the dropdown before the user
  touches anything) — most Indian grocery packaged goods (spices, snacks) are gram-denominated.
  **Planner must reconcile this with D-06's both-or-neither validation**: a defaulted-but-untouched
  unit value must NOT count as "set" for validation purposes until `weight_amount` also has a
  value, otherwise every product would fail-closed with a phantom "g, no amount" validation error
  on first load. Likely resolution: treat the unit default as a plain form-field initial value (not
  a submitted value) and only run the both-or-neither `.refine()` against the actual submitted
  payload — but the exact mechanism (e.g., unit resets to null if amount is cleared) is left to
  planning/research.

### Filter Scope — Where Brand/Weight Filters Surface

- **D-10:** Filtering by brand and weight unit is implemented in **both** the admin Catalog page
  (`CatalogProductsTab.tsx`) and the POS checkout grid — not just one. This is a larger surface
  than the minimum BRND-04 wording implies, but the user explicitly chose "both" over either
  single-surface option.
- **D-11:** In `CatalogProductsTab.tsx` (which today has only a text search box, no dropdown
  filters — inline per-row category editing is a separate mechanism), brand/weight-unit filters
  are **dropdown `<select>`s placed above the table**, filtering the same client-side list the
  search box already filters. No new filter-panel component or URL-query-param filtering.
- **D-12:** In the POS checkout grid, `CategoryTabs.tsx` **stays the primary category selector**
  (horizontal tab strip, unchanged). Brand and weight-unit become **secondary dropdown filters
  above `ProductGrid`**, narrowing further *within* the active category tab (AND logic — category
  tab selection and brand/weight dropdowns combine, they don't replace each other).

### Claude's Discretion

The user chose "ready for context" over exploring further; researcher and planner decide, using
these defaults unless research contradicts them:

- **Exact migration/column naming** — `brands` table shape (`id`, `name`, `created_at` at minimum,
  per D-01's name-only decision), `products.brand_id` FK column name, `weight_amount`/
  `weight_unit` column names/types (numeric + enum, matching the pattern of other enum columns in
  this schema).
- **Weight-unit enum representation** — Postgres enum type vs. text + CHECK constraint; whichever
  matches the existing convention for other bounded-choice columns in this schema (e.g. how
  `UomSchema` or `CategoryRoutingSchema` are backed).
- **The D-09 both-or-neither/default-unit reconciliation mechanism** — exact implementation left
  open (see D-09 note).
- **Filter dropdown component reuse** — whether the admin Catalog filters (D-11) and POS checkout
  filters (D-12) share one underlying `<Select>`/filter component or are independently built;
  standard FSD conventions apply (shared primitive in `shared/ui/` if the shape is truly
  identical).
- **Brand dropdown sort order** — given no `sortOrder` field (D-01), alphabetical by name is the
  implied default for both the product-dialog brand-select and any filter dropdown.
- **i18n** — new "Brand" labels, weight-unit labels (g/kg/lb/oz), sub-tab title, and filter
  copy need `featMgmt` (and/or `common`) catalog entries in both `es-MX` and `en-US`;
  `i18next/no-literal-string` is an error in this layer.
- **E2E shape** — BRND-05 mandates brand CRUD, RBAC denial, weight validation, and filter-by-
  brand/weight coverage; exact spec file organization (new `e2e/products/` file(s) vs. extending
  existing `product-management.spec.ts`) is left to planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase intent & requirements
- `.planning/ROADMAP.md` § "Phase 32: Brand Entity & Pack-Weight Catalog Attributes" — goal,
  dependency on Phase 31, plan count.
- `.planning/REQUIREMENTS.md` lines 300-304 — BRND-01..05 verbatim (the acceptance contract).
- `.planning/notes/product-catalog-branding-decisions.md` — the `/gsd-explore` decision record
  for Phases 31-33: brand-as-full-entity vs freeform text, weight-as-display-attribute
  independent of loose-weight-checkout, brand logo left "optional/undecided" (resolved here as
  D-01: no logo).

### Code this phase extends (Phase 31 output)
- `src/features/manage-products/ui/ProductDetailDialog.tsx` — the reshaped dialog (post-Phase-31)
  hosting the vertical-tab `Details`/`Photo`/`Links` structure; brand-select and weight fields
  land in the Details tab.
- `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx` — where the brand-select dropdown
  and weight_amount/weight_unit fields are added, positioned per D-08.
- `.planning/phases/31-product-catalog-detail-photo-upload/31-CONTEXT.md` D-02 — the tab layout
  decision that explicitly reserved "an obvious slot in Details for Phase 32's brand/pack-weight
  fields."

### Categories CRUD pattern to mirror (Brand entity, D-01/D-04)
- `src/features/manage-products/ui/CategoryForm.tsx` — the Category create/edit form; Brand's
  form is a simpler subset (name only, no color/sortOrder/happyHour fields).
- `src/features/manage-products/ui/CatalogCategoriesTab.tsx` — the Category management sub-tab
  inside Inventory→Catalog; structural template for the new Brands sub-tab (D-04).
- `src/entities/category/` (`model/types.ts`, `model/queries.ts`) — entity-layer pattern for the
  new `src/entities/brand/` equivalent.

### Schema & domain types to extend
- `src/shared/lib/domain.ts` `CategorySchema`/`CategoryCreateSchema`/`CategoryUpdateSchema`
  (~lines 171-209) — structural template for the new `BrandSchema` (name-only subset).
- `src/shared/lib/domain.ts` `ProductSchema` (~lines 234-296) — gains `brandId: UuidSchema.nullable()`
  and `weightAmount`/`weightUnit` fields; existing `unitsPerPackage: z.number().int().positive().nullable()`
  at line 264 is the nearest existing precedent for a nullable numeric catalog field.
- `supabase/migrations/20260414000003_products_and_categories.sql` line 28 —
  `category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT` — the exact FK pattern
  D-02 mirrors for `brand_id` (minus `NOT NULL`).

### Filter surfaces to extend
- `src/features/manage-products/ui/CatalogProductsTab.tsx` — admin Catalog table; currently has
  only a text `searchable`/`searchPlaceholder` prop and inline per-row category editing, no
  dropdown filters today (D-11 adds the first ones).
- `src/entities/product/ui/CategoryTabs.tsx` — POS checkout's existing category tab-strip filter;
  D-12's brand/weight dropdowns sit alongside this, not inside it.

### Conventions
- `.planning/codebase/CONVENTIONS.md` — naming, FSD boundaries, `exactOptionalPropertyTypes`,
  Zod-first typing, i18n literal-string enforcement.
- `CLAUDE.md` § "Testing & Verification Policy" — automated Playwright only; `human_needed` is
  not a valid terminal state for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CategoryForm.tsx` + `CatalogCategoriesTab.tsx` — the entire Category CRUD stack is a direct
  structural template for Brand (D-04), just dropping color/sortOrder/happyHour fields.
- `CategoryTreePicker` (`src/shared/ui/CategoryTreePicker/`) — not directly reused (brand has no
  hierarchy), but confirms the codebase's existing pattern for a searchable entity-select
  dropdown, relevant to the brand-select in `ProductDetailsTab`.
- `src/entities/category/` (`model/index.ts`, `model/queries.ts`, `model/types.ts`) — the
  TanStack Query entity-layer pattern (`useCategories`, mutations) to mirror for a new
  `src/entities/brand/`.

### Established Patterns
- FSD import direction is lint-enforced; brand entity logic belongs in `entities/brand/`,
  CRUD UI in `features/manage-products/ui/` (or a new `features/manage-brands/` — planner's call,
  following whatever the Category split does today).
- All async work returns `Result<T>`; Supabase calls go through `supabaseQuery`/`supabaseMutation`
  — no exception for the new `brands` table.
- `exactOptionalPropertyTypes` is on — `brandId: UuidSchema.nullable()` (never `brandId?:`),
  matching the existing `parentProductId: UuidSchema.nullable()` pattern at domain.ts line 266.
- No DOWN migration scripts anywhere in this repo (CLAUDE.md convention) — the new `brands`
  table + `products` column additions are a one-way forward migration, consistent with every
  other phase.

### Integration Points
- `products` table gains `brand_id`, `weight_amount`, `weight_unit` columns (one forward
  migration); new `brands` table with its unique-name constraint (D-03) and RESTRICT FK (D-02).
- `src/shared/lib/supabase.types.ts` must be regenerated after the migration; until then the
  documented `const db = supabase as any` + file-level eslint-disable workaround applies.
- `ProductDetailsTab.tsx` gains the brand-select and paired weight fields (D-08); the dialog's
  existing single Save/`ProductUpdate` payload path (Phase 31 D-05) absorbs these new fields
  without a new save path.
- `CatalogProductsTab.tsx` and the POS `ProductGrid`/`CategoryTabs.tsx` both gain filter dropdowns
  (D-10/D-11/D-12) — two separate but structurally similar filter UIs.
- `e2e/products/` is the home for BRND-05's new functional specs (brand CRUD, RBAC denial, weight
  validation, filter-by-brand/weight).

</code_context>

<specifics>
## Specific Ideas

- The user consistently picked the **stricter/more-explicit option** over the simpler one when
  given a choice: RESTRICT over SET NULL for brand delete (D-02), name-only over name+logo for
  Brand (D-01, avoiding scope creep into a second Storage integration), dedicated sub-tab over
  inline-only brand creation (D-04), and filtering in **both** admin and POS surfaces over picking
  just one (D-10) — mirrors the pattern noted in Phase 31's CONTEXT.md of the user favoring the
  more-isolated/more-complete option over the cheaper one.
- Weight fields are explicitly a **display/filter attribute describing pack size** ("500 g",
  "1 kg" printed on packaging) — not a pricing input and not connected to the existing
  loose-weight-at-checkout system. Do not let planning conflate the two.

</specifics>

<deferred>
## Deferred Ideas

- **Brand logo/image** — rejected in D-01. Revisit only if the owner explicitly asks for
  brand-logo display somewhere (e.g. a branded shelf tag or receipt line), which would likely
  reuse Phase 31's Storage/signed-URL pattern.
- **Brand `sortOrder` for manual dropdown ordering** — rejected in D-01 in favor of alphabetical;
  revisit if the brand list grows long enough that alphabetical ordering becomes unwieldy for a
  specific frequently-used-brands-first workflow.

### Reviewed Todos (not folded)
- `todo.match-phase` returned 0 matches above the fold threshold for Phase 32 (2 pending todos
  exist in the repo but neither scored high enough to surface as a candidate).

</deferred>

---

*Phase: 32-brand-entity-pack-weight-catalog-attributes*
*Context gathered: 2026-09-08*
