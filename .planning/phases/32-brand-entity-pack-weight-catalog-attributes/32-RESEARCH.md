# Phase 32: Brand Entity & Pack-Weight Catalog Attributes - Research

**Researched:** 2026-09-08
**Domain:** Internal FSD pattern extension (new Supabase table + product columns + React CRUD/filter UI) — no new external technology
**Confidence:** HIGH (all core findings verified by reading the actual source files this session, not from training-data recall)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Brand has **name only** — no logo, no sortOrder, no description. Rejected: name+logo
  (would reuse Phase 31's Storage/signed-URL pattern but adds scope not requested), name+sortOrder
  (Category has this for manual dropdown ordering; brand dropdown will just sort alphabetically).
- **D-02:** `products.brand_id` uses **`ON DELETE RESTRICT`**, same as `category_id`, even though
  `brand_id` is nullable (unlike `category_id` which is `NOT NULL`). Deleting a brand is blocked
  while any product references it — the admin must reassign/clear those products' brand first.
  Rejected: `ON DELETE SET NULL`.
- **D-03:** Brand `name` has a **DB-level unique constraint on `lower(name)`** — case-insensitive
  uniqueness.
- **D-04:** Brand management is a **dedicated sub-tab** inside Inventory→Catalog, alongside the
  existing Products and Categories sub-tabs — a new component structurally mirroring the existing
  Category CRUD stack (full list/create/edit/delete table), not a lighter inline-only affordance.
- **D-05:** The Brands sub-tab uses the **same `manage_products` RBAC gate** as the Products and
  Categories sub-tabs already do — no new permission action introduced.
- **D-06:** `weight_amount` and `weight_unit` are **both-or-neither** — a Zod `.refine()` pair
  check rejects setting one without the other.
- **D-07:** `weight_amount` uses **2 decimal places** (`z.number().positive()` with a
  `multipleOf(0.01)`-style precision constraint), matching the existing `MoneySchema` pattern.
- **D-08:** The weight fields sit **right after the Category field** in `ProductDetailsTab`,
  before base price/SKU/barcode/active.
- **D-09:** `weight_unit`'s UI default is **`'g'`** (pre-selected before the user touches
  anything). Planner must reconcile this with D-06's both-or-neither validation: a
  defaulted-but-untouched unit value must NOT count as "set" until `weight_amount` also has a
  value.
- **D-10:** Filtering by brand and weight unit is implemented in **both** the admin Catalog page
  (`CatalogProductsTab.tsx`) and the POS checkout grid.
- **D-11:** In `CatalogProductsTab.tsx`, brand/weight-unit filters are **dropdown `<select>`s
  placed above the table**, filtering the same client-side list the search box already filters.
  No new filter-panel component or URL-query-param filtering.
- **D-12:** In the POS checkout grid, `CategoryTabs.tsx` stays the primary category selector.
  Brand and weight-unit become **secondary dropdown filters above `ProductGrid`**, narrowing
  further *within* the active category tab (AND logic).

### Claude's Discretion

- Exact migration/column naming — resolved by this research (see Standard Stack / Code Examples
  below): `brands(id, name, created_at, updated_at)`, `products.brand_id`, `products.weight_amount`,
  `products.weight_unit`.
- Weight-unit enum representation — **resolved**: `text NOT NULL CHECK (weight_unit IN
  ('g','kg','lb','oz'))`, not a Postgres `ENUM` type (see Code Examples — verified against the most
  recent bounded-choice-column precedent in this schema, Phase 27's `discount_type`).
- The D-09 both-or-neither/default-unit reconciliation mechanism — **resolved**: see Pitfall 2 and
  Code Examples below (mirrors the existing `unitsPerPackageInput` string-state pattern in
  `ProductDetailDialog.tsx`).
- Filter dropdown component reuse — **resolved**: no shared component needed: both surfaces already
  use plain native `<select>` (see Architecture Patterns), not the shadcn `Select` primitive.
- Brand dropdown sort order — alphabetical by name (per D-01, no `sortOrder` field). Confirmed no
  codebase precedent objects to this.
- i18n — new "Brand" labels, weight-unit labels (g/kg/lb/oz), sub-tab title, and filter copy need
  `featMgmt` (and/or `common`) catalog entries in both `es-MX` and `en-US`. Files:
  `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` (verified to exist).
- E2E shape — **new spec file recommended**: `e2e/products/brands.spec.ts` (CRUD + RBAC, mirroring
  `e2e/products/categories.spec.ts`'s structure) plus filter coverage either in that same file or
  appended to `e2e/products/product-management.spec.ts`.

### Deferred Ideas (OUT OF SCOPE)

- **Brand logo/image** — rejected in D-01. Revisit only if explicitly requested later.
- **Brand `sortOrder`** — rejected in D-01 in favor of alphabetical; revisit if the brand list
  grows long.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRND-01 | New `brands` table with create/edit/delete UI, `manage_products`-gated | Verified RLS pattern (categories), verified the *actual* live Categories-management delete-capable template is `CatalogModifiersTab.tsx`, not the CONTEXT.md-cited (dead-code) `CatalogCategoriesTab.tsx` — see Pitfall 1 |
| BRND-02 | `products.brand_id` nullable FK + brand-select in Phase 31's dialog | Verified `ProductDetailsTab.tsx`/`ProductDetailDialog.tsx` current shape; exact insertion point and state-plumbing pattern identified |
| BRND-03 | `products.weight_amount`/`weight_unit` catalog attribute | Verified `MoneySchema` precision precedent, verified enum-representation convention (text+CHECK), verified both-or-neither Zod-chaining pitfall |
| BRND-04 | Filter by brand/weight in both admin Catalog and POS grid | Verified `DataTable`'s `toolbar` prop and `ProductGrid.tsx`'s existing client-side `activeCategory` filter pattern — both are direct, no-new-component insertion points |
| BRND-05 | Playwright E2E: brand CRUD, RBAC denial, weight validation, filter-by-brand/weight | Verified existing `e2e/products/categories.spec.ts` structure/helpers to mirror; verified `manage_products` is manager+ (not admin-only) |
</phase_requirements>

## Summary

This phase is pure internal pattern extension — no new npm/pip packages, no new external service,
no new architectural layer. Everything needed already has a live precedent somewhere in this
codebase: a flat-entity CRUD table with delete (`CatalogModifiersTab.tsx` + its
`entities/product` mutations), a `text + CHECK` bounded-choice column convention (Phase 27's
`discount_type`), a client-side dropdown-filter toolbar (`DataTable`'s `toolbar` prop), and a
string-buffered optional-numeric-field pattern in the product dialog
(`unitsPerPackageInput`/`parentProductIdInput`).

**The single most important correction this research makes to CONTEXT.md's canonical refs:**
`CatalogCategoriesTab.tsx`, cited as the structural CRUD template for Brand (D-04), is **dead
code** — it is not imported or rendered anywhere; the live "Categories" sub-tab on
Inventory→Catalog renders `CategoryTreeEditor` (`features/manage-categories/`) instead, and
*neither* of those two Category components has a delete UI or delete mutation at all (verified by
reading both files in full). Since Brand explicitly needs delete (BRND-01, D-02's RESTRICT
semantics only matter if delete exists), the correct structural template is
`CatalogModifiersTab.tsx` + `useMutationDeleteModifier` — a flat list with create/edit/delete and
a `ConfirmDialog`, which is also a better fit than the tree editor since Brand has no hierarchy.

**Primary recommendation:** New `entities/brand/` (mirroring `entities/category/`'s TanStack Query
shape, plus a delete mutation modeled on `useMutationDeleteModifier`), a new
`features/manage-products/ui/CatalogBrandsTab.tsx` (mirroring `CatalogModifiersTab.tsx`'s
list/create/edit/delete/`ConfirmDialog` structure), wired as a fourth `TabsTrigger` in
`CatalogTab.tsx`. Product schema/dialog/filter changes follow the `unitsPerPackage`/`categoryId`
precedents already in the file, with the both-or-neither refine attached to
`ProductCreateSchema`/`ProductUpdateSchema` (not the base `ProductSchema` — see Pitfall 4).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Brand CRUD (create/edit/delete) | Frontend (React, `features/manage-products`) | Database (Postgres RLS + RESTRICT FK) | UI does the form/table work; DB is the enforcement authority for uniqueness (D-03) and delete-blocking (D-02) — RLS + constraints, not client logic |
| Brand-select on product dialog | Frontend (React) | — | Pure client-side dropdown population from a TanStack Query hook, same tier as the existing category-select |
| Weight validation (both-or-neither, precision) | Frontend (Zod, client-side parse before submit) | Database (`CHECK` constraint, defense-in-depth) | Client Zod refine gives immediate form feedback; a DB-level `CHECK` (both-null-or-both-set) should mirror it so a direct RPC/API bypass can't violate the invariant |
| Brand/weight filter — admin Catalog | Frontend (React, client-side array filter) | — | Existing `CatalogProductsTab.tsx` already fetches the full product list and filters client-side (search box); brand/weight join the same filter, no new query |
| Brand/weight filter — POS checkout grid | Frontend (React, client-side array filter) | — | `ProductGrid.tsx` already filters its fetched `products` array by `activeCategory`/search client-side; brand/weight join the same `matches` predicate |
| Brand data read (POS + admin) | Database (RLS `anon`+`authenticated` SELECT) | — | Mirrors `categories`'s existing `anon_read_categories` policy — the POS grid must be able to read brand names/ids regardless of session type, same as it reads categories today |

## Standard Stack

No new libraries. This phase is 100% additive use of already-installed dependencies:

| Concern | Already-installed tool | Why no new dependency |
|---------|------------------------|------------------------|
| Schema/validation | Zod v4 (`z.object`, `z.enum`/`z.string()` + refine) | Matches every other entity in `domain.ts` |
| Server state | TanStack Query v5 | Matches `entities/category`, `entities/product` |
| Table UI | `@tanstack/react-table` via `shared/ui/DataTable.tsx` | Already used by `CatalogProductsTab.tsx`; `toolbar` prop exists exactly for filter controls |
| Dropdown select | Native HTML `<select>` (no shadcn `Select` primitive) | Verified: both the category-select in `ProductDetailsTab.tsx` and the inline category-editor in `CatalogProductsTab.tsx` use a plain `<select className="...">`, never `shared/ui/select.tsx` |
| Confirm-before-delete | `shared/ui/ConfirmDialog.tsx` | Already used by `CatalogModifiersTab.tsx`'s delete flow — direct precedent |

**Installation:** none required.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new npm/pip/cargo packages. No registry lookups
required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Admin: Inventory → Catalog ───────────────────────────┐
│                                                                                     │
│  CatalogTab.tsx (Tabs: Products | Categories | Modifiers | Modifier Groups | ★Brands)
│           │                                                                        │
│           ▼ (new 5th TabsTrigger, D-04)                                            │
│  CatalogBrandsTab.tsx  ──uses──▶  entities/brand (useBrands, useMutationCreate/     │
│    (list + Create/Edit dialog        Update/DeleteBrand)  ──▶  Supabase `brands`    │
│    + ConfirmDialog delete,                                     table (RLS-gated:    │
│    mirrors CatalogModifiersTab)                                 manage_products)     │
│                                                                                     │
│  CatalogProductsTab.tsx                                                            │
│    DataTable(toolbar: [brand <select>, weight-unit <select>] + existing search) ───▶│
│    filters the already-fetched `products` client-side array (D-11)                 │
│                                                                                     │
│  ProductDetailDialog.tsx → ProductDetailsTab.tsx                                   │
│    [Name][Category ▾][★Brand ▾][★weight_amount][★weight_unit ▾][Base Price]...     │
│    (D-08: right after Category)                                                    │
│    onSubmit → ProductCreateSchema/ProductUpdateSchema.parse()                      │
│      (both-or-neither .refine() attached HERE, not on base ProductSchema)          │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────── POS: /pos checkout ──────────────────────────────────┐
│                                                                                     │
│  CheckoutPanel.tsx → ProductGrid.tsx                                               │
│    useProducts() [already joins category:categories(*); now also brandId/weight    │
│      scalar columns via `select('*')`] ──▶ Supabase `products` (anon/authenticated  │
│      read, RLS mirrors categories' `anon_read_categories`)                          │
│    CategoryTabs (primary, unchanged) + [★brand <select>][★weight-unit <select>]     │
│      (secondary, D-12) → `matches` predicate ANDs all three filters                 │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── entities/
│   └── brand/                          # NEW — mirrors entities/category/
│       ├── model/
│       │   ├── types.ts                # re-export Brand from domain.ts
│       │   └── queries.ts              # useBrands, useMutationCreate/Update/DeleteBrand
│       └── index.ts                    # barrel
├── features/
│   └── manage-products/
│       ├── ui/
│       │   ├── CatalogBrandsTab.tsx    # NEW — mirrors CatalogModifiersTab.tsx (has delete)
│       │   ├── BrandForm.tsx           # NEW — simpler subset of CategoryForm.tsx (name only)
│       │   ├── CatalogProductsTab.tsx  # MODIFIED — brand/weight <select> filters in `toolbar`
│       │   └── tabs/
│       │       └── ProductDetailsTab.tsx  # MODIFIED — brand-select + weight fields (D-08)
│       ├── ui/ProductDetailDialog.tsx  # MODIFIED — brandId/weightAmountInput/weightUnit state,
│       │                                 both-or-neither payload construction
│       └── index.ts                    # MODIFIED — export CatalogBrandsTab
├── shared/lib/domain.ts                # MODIFIED — BrandSchema + BrandCreate/UpdateSchema,
│                                          ProductSchema gains brandId/weightAmount/weightUnit,
│                                          both-or-neither .refine() on Create/Update schemas
├── widgets/
│   ├── InventoryPagePanel/ui/CatalogTab.tsx  # MODIFIED — 5th TabsTrigger "Brands"
│   └── ProductGrid/ui/ProductGrid.tsx        # MODIFIED — brand/weight-unit <select> filters
└── entities/product/
    └── ui/CategoryTabs.tsx              # UNCHANGED (D-12 — stays primary, untouched)

supabase/migrations/
└── 20260908000001_brands_and_product_weight.sql   # NEW (illustrative filename/date only —
                                                       planner picks actual timestamp)
```

### Pattern 1: Flat-entity CRUD with delete (Brand)

**What:** `entities/brand/model/queries.ts` — `useBrands()` (list), `useMutationCreateBrand`,
`useMutationUpdateBrand`, `useMutationDeleteBrand`, all following the exact
`supabaseQuery`/`supabaseMutation` → `Result<T>` → row-mapper pattern already used by
`entities/category/model/queries.ts` and the modifier mutations in `entities/product/model/queries.ts`.

**When to use:** Any new flat (non-hierarchical) catalog entity that needs full CRUD.

**Example — the delete mutation to model (verbatim, existing code):**
```typescript
// Source: D:/Projects/Code/supermarket-pos/src/entities/product/model/queries.ts:594-612
export function useMutationDeleteModifier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modifierId: string): Promise<Result<null>> => {
      const res = await supabaseMutation(() =>
        supabase.from('modifiers').delete().eq('id', modifierId)
      );
      if (!res.ok) {
        logger.error('modifiers.delete_failed', { message: res.error.message });
        return res;
      }
      return ok(null);
    },
    onSuccess: result => {
      if (result.ok) invalidateCatalogQueries(queryClient);
    },
  });
}
```
For Brand, the equivalent `useMutationDeleteBrand` needs no special FK-violation handling code —
`parseSupabaseError` (see Pitfall 3) already turns Postgres `23503` into a generic, toast-able
`AppError`.

**Example — the UI list+create+edit+delete shell to mirror (structure only, abbreviated from the
full file already read this session):**
```typescript
// Source: D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/CatalogModifiersTab.tsx:20-179
export function CatalogModifiersTab() {
  const { data: modifiers, isLoading, resultError } = useModifiers();
  const createMutation = useMutationCreateModifier();
  const updateMutation = useMutationUpdateModifier();
  const deleteMutation = useMutationDeleteModifier();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // ... <ul> list with Pencil (edit) + Trash2 (delete) POSButtons per row ...
  // ... two ModifierDialog instances (create/edit) ...
  <ConfirmDialog
    open={deleteId != null}
    variant="destructive"
    isLoading={deleteMutation.isPending}
    onConfirm={async () => {
      if (deleteId == null) return;
      const r = await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
      if (!r.ok) toast.error(r.error.message);
      else toast.success(/* i18n */);
    }}
  />
}
```

### Pattern 2: Product dialog optional-numeric-field with paired unit

**What:** `ProductDetailDialog.tsx` already has the exact pattern needed for D-09's
default-unit-doesn't-count-until-amount-is-set problem: `unitsPerPackageInput` is kept as a
**string** in component state (not the parsed number), starts `''`, and is only converted +
included in the submitted payload when non-empty.

**Example (verbatim, existing code — the pattern to replicate for `weightAmountInput`):**
```typescript
// Source: D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/ProductDetailDialog.tsx:267-287
let unitsPerPackage: number | null = null;
if (unitsPerPackageInput.trim() !== '') {
  const trimmedUnits = unitsPerPackageInput.trim();
  if (!/^\d+$/.test(trimmedUnits)) {
    applyFieldErrors({ unitsPerPackage: t('...unitsPerPackageMinError') });
    return;
  }
  const parsedUnits = Number.parseInt(trimmedUnits, 10);
  if (!Number.isFinite(parsedUnits) || parsedUnits < 1) {
    applyFieldErrors({ unitsPerPackage: t('...unitsPerPackageMinError') });
    return;
  }
  unitsPerPackage = parsedUnits;
}
```
**Resolution for D-09:** keep `weightAmountInput: string` (default `''`) and `weightUnit: string`
(default `'g'`, purely a UI pre-selection — the `<select>`'s value, never itself gating
submission). At submit time: `weightAmount = weightAmountInput.trim() === '' ? null :
Number(weightAmountInput)`, and `weightUnit` in the **payload** is `weightAmount === null ? null :
weightUnitState`. This means the dropdown can sit pre-selected at `'g'` all day with zero
validation error, because the payload's `weight_unit` is only ever non-null when
`weight_amount` is also non-null — the both-or-neither refine (Pattern 3) then always sees a
consistent pair.

### Pattern 3: Both-or-neither Zod refine — attach point matters

**What:** `ProductSchema` (`src/shared/lib/domain.ts:234-279`) is currently a **plain
`z.object(...)`** with no `.refine()`. `ProductCreateSchema` and `ProductUpdateSchema` are both
derived from it via `.omit(...)` (and `.partial().required(...)` for Update) — see
`src/shared/lib/domain.ts:281-292`, read in full this session.

**Why it matters:** Zod's `.refine()` (and `.superRefine()`) return an effects-wrapped schema that
does **not** expose `.omit()`/`.partial()`. If the both-or-neither check is attached to the base
`ProductSchema`, the existing `ProductCreateSchema = ProductSchema.omit({...})` and
`ProductUpdateSchema = ProductSchema.omit({...}).partial().required({id:true})` definitions break
(no `.omit`/`.partial` method on the refined type). This codebase has **zero existing precedent**
of chaining `.omit()`/`.partial()` after `.refine()` anywhere in `domain.ts` (verified — the one
existing `.refine()`, `ProcessRefundInputSchema` at line 1480-1498, is a terminal schema, never
further shaped).

**Correct attach point:** add `weightAmount`/`weightUnit` as plain nullable fields on the base
`ProductSchema` (no refine there), then attach **two separate** `.refine()` calls — one on
`ProductCreateSchema` and one on `ProductUpdateSchema` — each checking
`(weightAmount == null) === (weightUnit == null)`. `ProductUpdateSchema`'s check must additionally
account for its `.partial()` nature: an update payload that omits both keys entirely (neither key
present, not `null`) must also pass, since a partial update touching unrelated fields shouldn't be
forced to also touch weight.

### Pattern 4: Bounded-choice DB column — `text + CHECK`, not Postgres `ENUM`

**What:** This schema has used Postgres `CREATE TYPE ... AS ENUM` for its oldest columns
(`user_role`, `tab_status`, `payment_method` — `supabase/migrations/20260414000001_enums.sql:5-9`)
but its most recent bounded-choice-column additions use plain `text NOT NULL CHECK (col IN
(...))` instead:
```sql
-- Source: D:/Projects/Code/supermarket-pos/supabase/migrations/20260901000001_promotions_schema.sql:32,35
scope_type text NOT NULL CHECK (scope_type IN ('product', 'category')),
discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
```
```sql
-- Source: D:/Projects/Code/supermarket-pos/supabase/migrations/20260718000000_profiles_locale.sql:39
ALTER TABLE profiles ADD CONSTRAINT profiles_locale_check CHECK (locale IN ('es-MX', 'en-US'));
```
**Recommendation:** `weight_unit text CHECK (weight_unit IS NULL OR weight_unit IN ('g','kg','lb','oz'))`
— matches the newer, additive-migration-friendly convention (a Postgres `ENUM` type requires
`ALTER TYPE ... ADD VALUE` in its own transaction if a 5th unit is ever added later; a `CHECK`
constraint is a single `ALTER TABLE`).

### Pattern 5: Migration shape — additive `ALTER TABLE` + `CHECK` + comment, DOWN as a comment block

**Example (verbatim, existing code — the exact template for the `products` half of this phase's migration):**
```sql
-- Source: D:/Projects/Code/supermarket-pos/supabase/migrations/20260729000002_products_open_unit_columns.sql
-- UP:
BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS units_per_package int,
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES products(id);

ALTER TABLE products
  ADD CONSTRAINT units_per_package_positive
  CHECK (units_per_package IS NULL OR units_per_package > 0);

CREATE INDEX IF NOT EXISTS idx_products_parent_product_id
  ON products (parent_product_id);

COMMENT ON COLUMN products.units_per_package IS '...';

COMMIT;

-- =============================================================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS units_per_package_positive;
-- ...
-- COMMIT;
-- =============================================================================
```
This is also the template for `brands` table creation + its RLS policies (Pattern 6 below) — can
be one migration file or split into `..._brands_table.sql` + `..._products_brand_weight_columns.sql`;
either is consistent with existing practice (this repo mixes single- and multi-file phase
migrations).

### Pattern 6: RLS for a `manage_products`-gated catalog entity, readable by anon+authenticated

**Example (verbatim, existing code — the exact 4-policy shape to mirror for `brands`):**
```sql
-- Source: D:/Projects/Code/supermarket-pos/supabase/migrations/20260510000001_rls_rewrite_phase13.sql:413-427
CREATE POLICY "categories_select_authenticated" ON categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "categories_insert_manager_admin" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));

CREATE POLICY "categories_update_manager_admin" ON categories
  FOR UPDATE TO authenticated
  USING (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));

CREATE POLICY "categories_delete_manager_admin" ON categories
  FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
**Plus** the `anon` read policy (needed for the POS grid's brand filter, mirroring products/categories):
```sql
-- Source: D:/Projects/Code/supermarket-pos/supabase/migrations/20260415203455_allow_anon_read_catalog.sql:12-16
CREATE POLICY "anon_read_categories"
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (true);
```
Apply the same 5-policy set (`brands_select_authenticated`/`anon_read_brands`/`brands_insert_manager_admin`/
`brands_update_manager_admin`/`brands_delete_manager_admin`) to `brands`. Missing the `anon`
policy is the single easiest way to silently break the POS-grid brand filter in an anon/pre-auth
render path — see Pitfall 5.

### Anti-Patterns to Avoid

- **Reusing `CatalogCategoriesTab.tsx` as a literal copy-paste base:** it's dead code with no
  delete capability and its own known gaps (no sort-order reuse needed for Brand anyway, per
  D-01). Use `CatalogModifiersTab.tsx` instead (Pattern 1).
- **Chaining `.refine()` before `.omit()`/`.partial()`** on the product schemas (Pattern 3) —
  breaks the existing `ProductCreateSchema`/`ProductUpdateSchema` derivation.
- **Using the shadcn `Select` component** (`shared/ui/select.tsx`) for brand/weight-unit dropdowns
  — every sibling dropdown in this exact UI surface (category-select, inline category-editor
  cell) uses a plain native `<select>`; introducing `Select` here would be a visual/behavioral
  inconsistency with zero benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FK-violation-on-delete error message | Custom Postgres-error-code parsing in the new delete mutation | `parseSupabaseError` (`src/shared/lib/result.ts:496-520`) — already maps `23503` to a generic `AppError`, consumed automatically by `supabaseMutation` | Already wired end-to-end; a bespoke handler would just duplicate this and risk drifting from the shared error vocabulary |
| Confirm-before-delete dialog | A new modal/alert component | `shared/ui/ConfirmDialog.tsx` | Already the delete-confirmation primitive for modifiers, products (deactivate), promotions |
| Client-side product filtering by brand/weight | A URL-query-param filter framework or a new generic filter-panel component | Plain `useState` + array `.filter()` predicate, same as `activeCategory` in `ProductGrid.tsx` and the search box in `CatalogProductsTab.tsx`/`DataTable` | The existing filter surfaces are already 100% client-side over an already-fully-fetched list; a query-param/server-filter layer would be net-new infrastructure this phase's own CONTEXT.md (D-11) explicitly rejects |
| Brand entity-select searchable dropdown | `shared/ui/CategoryTreePicker/` (hierarchical picker) | Plain `<select>` (same as `categoryId` in `ProductDetailsTab.tsx`) | Brand is flat, unranked, name-only — a hierarchical/searchable picker component solves a problem Brand doesn't have |

**Key insight:** Every UI/data-access primitive this phase needs already exists in this codebase
and has at least one live call site to copy from. The main risk isn't "what library to use" — it's
correctly identifying *which* existing pattern is the live, current one (see Pitfall 1).

## Common Pitfalls

### Pitfall 1: The CONTEXT.md-cited Category CRUD template is dead code

**What goes wrong:** Building `CatalogBrandsTab.tsx` as a literal structural copy of
`CatalogCategoriesTab.tsx` (as CONTEXT.md's canonical_refs suggests) produces a component with no
delete capability, requiring it to be bolted on awkwardly, and mimics a component that isn't
actually wired into the live UI tree at all.

**Why it happens:** CONTEXT.md's canonical_refs were written before this research pass confirmed
`CatalogCategoriesTab.tsx` is neither exported from `features/manage-products/index.ts` nor
imported anywhere in `src/` except by itself (verified via full-repo grep). The live "Categories"
sub-tab (`CatalogTab.tsx:40`) renders `CategoryTreeEditor` from `features/manage-categories/`
instead — a hierarchical tree editor, also with no delete UI (its one `.delete(id)` call is a
`Set` operation for expand/collapse state, not a category-record delete — verified by reading the
full file).

**How to avoid:** Use `CatalogModifiersTab.tsx` (Pattern 1) as the structural base — it already has
list + create + edit + delete + `ConfirmDialog`, and Brand needs exactly that shape (flat, no
hierarchy, D-01/D-04).

**Warning signs:** If the plan references "mirror `CatalogCategoriesTab.tsx`" without independently
noting it's unused, that's a signal the plan inherited CONTEXT.md's stale pointer uncritically.

### Pitfall 2: D-09's default-unit trap is real and easy to get backwards

**What goes wrong:** If `weight_unit`'s state defaults to `'g'` AND that state value is included
in the submitted payload unconditionally (the naive `<select>` wiring), every product saved
without ever touching the weight fields will submit `{ weightAmount: null, weightUnit: 'g' }` —
violating both-or-neither and either (a) failing validation on every single product save
(fail-closed, breaks the happy path per CONTEXT.md's own warning) or (b) silently persisting a
phantom `weight_unit = 'g'` with no `weight_amount`.

**Why it happens:** The natural instinct is "the dropdown's `value` prop is also the payload
value" — true for `categoryId` (always required, no empty state) but false for `weightUnit`
(optional, paired, has a pre-selected-but-inert default).

**How to avoid:** Gate `weight_unit` inclusion in the payload strictly on
`weightAmountInput.trim() !== ''` (Pattern 2) — the dropdown's own state is irrelevant to whether
the field is "set" from the schema's point of view.

**Warning signs:** A Vitest test in `domain.product-schema.test.ts` (the existing file for this
kind of coverage) that creates a product with default field values and expects it to `safeParse`
successfully with `weightAmount: null, weightUnit: null` is the concrete regression guard —
Wave 0 should add this test before wiring the dialog.

### Pitfall 3: FK-violation delete error is generic, not brand-specific — that's fine, don't over-build

**What goes wrong:** Spending implementation time building a custom "N products reference this
brand" pre-check query before allowing delete, or a bespoke error message parser for the delete
mutation.

**Why it happens:** D-02's RESTRICT semantics naturally prompt "what does the error look like?"

**How to avoid:** `parseSupabaseError` (`result.ts:505-507`) already turns `23503` into `Invalid
reference to related record` — good enough for a `toast.error(r.error.message)`, identical to how
every other RESTRICT-guarded delete in this codebase (categories via products, suppliers via
supplier_products, etc.) already behaves. No brand-specific handling needed.

### Pitfall 4: Attaching the both-or-neither `.refine()` to the wrong schema breaks the type chain

See Pattern 3 above — this is listed again here because it is the single highest-risk mechanical
mistake in this phase (a build-breaking TypeScript error, not a runtime bug, so it will be caught
immediately by `npm run typecheck`, but is worth flagging in the plan itself to avoid churn).

### Pitfall 5: Missing the `anon` RLS read policy silently breaks the POS filter, not the admin one

**What goes wrong:** Writing only the four `manage_products`-gated policies (SELECT-authenticated,
INSERT/UPDATE/DELETE-manager-admin) for `brands` and forgetting the separate `anon, authenticated`
SELECT policy that `categories`/`products`/`modifiers` all carry
(`20260415203455_allow_anon_read_catalog.sql`). The admin Catalog page (always an authenticated
session) works fine either way; the POS grid's brand dropdown/filter — if it or any part of its
render path ever runs before/without an authenticated session — would silently return zero brands,
a hard-to-diagnose empty-dropdown bug since no error surfaces (RLS returns an empty set, not a
403).

**How to avoid:** Add the `anon_read_brands` policy in the same migration (Pattern 6).

## Code Examples

Already embedded inline under Architecture Patterns above (each tagged with its exact source path
and line range) — this section intentionally left without duplication.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Postgres `CREATE TYPE ... AS ENUM` for bounded-choice columns | `text NOT NULL CHECK (col IN (...))` | Visible from Phase 20's `category_routing` migration (still `ENUM`, guarded) through Phase 23's `profiles_locale_check` and Phase 27's `discount_type`/`scope_type` (both `text+CHECK`) — the newer convention | `weight_unit` should use `text+CHECK`, not a new `ENUM` type (Pattern 4) |
| Category management via a flat table (`CatalogCategoriesTab.tsx`) | Category management via a hierarchical tree editor (`CategoryTreeEditor`) | Some point after `parentId` nesting (max depth 3) was added to `CategorySchema` — the flat tab was superseded but never deleted | Don't copy the now-orphaned flat component; it predates a category feature Brand doesn't need anyway |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An `i18next/no-literal-string`-compliant new i18n key set for "Brand"/weight-unit labels belongs in `featMgmt.json` (not a new namespace) | Architecture Patterns / Claude's Discretion | Low — worst case is a namespace-placement bikeshed the linter will not catch either way, since both are valid FSD-layer namespaces already in use by this feature folder |
| A2 | The migration should be split as `brands` table + RLS in one file and `products` column additions in a second (or combined in one) — left to planner's judgment, not verified against an explicit repo convention either way | Recommended Project Structure | None — repo has precedent for both single- and multi-file phase migrations; either passes |

**Note:** every claim that touches an actual schema shape, RLS policy, migration pattern, or
existing component's behavior in this document was verified by reading the source file directly
this session (tagged `[VERIFIED: <path>:<lines>]` implicitly via the "Source:" comment on each code
block above) — none of the load-bearing findings here are `[ASSUMED]`.

## Open Questions

1. **Does `ProductSchema` need an embedded `brand: BrandSchema.optional()` join field (mirroring
   the existing `category: CategorySchema.optional()` field), or is brand *name* display (product
   cards, catalog table) out of scope for this phase?**
   - What we know: BRND-01..05 only require brand-select + brand *filtering*, not a documented
     brand-name display requirement on `ProductCard`/`CatalogProductsTab`'s table.
   - What's unclear: without a joined `brand` field or a client-side id→name lookup via
     `useBrands()`, the filter dropdown itself still works (options come straight from
     `useBrands()`, filtering compares raw `brandId` strings) — but any table/card column showing
     "which brand" would need one of these two data-access paths.
   - Recommendation: skip the join for now (BRND-04 only requires *filtering*, verified against
     REQUIREMENTS.md's exact wording); if the planner/UI wants a visible brand badge anywhere,
     resolve it via a `useBrands()`-backed `Map<id,name>` lookup in the consuming component rather
     than a new joined schema field — cheaper, and avoids a `mapProductRow` change purely for
     display.

2. **Exact migration filename/timestamp** — illustrative `20260908000001_...` used above; actual
   value is the planner's call, following the existing `YYYYMMDDHHMMSS_description.sql` convention
   (most recent real migration: `20260907000001_product_photos_storage.sql`).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright v1.59 (E2E) + Vitest v4 (unit) |
| Config file | `supermarket-pos/playwright.config.ts` (E2E), Vitest config via `package.json`/`vite.config.ts` (unit) |
| Quick run command | `npx playwright test e2e/products/brands.spec.ts` / `npx vitest run src/shared/lib/domain.product-schema.test.ts` |
| Full suite command | `npm run test:e2e` / `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRND-01 | Brand create/edit/delete round-trip | e2e | `npx playwright test e2e/products/brands.spec.ts` | ❌ Wave 0 — new file |
| BRND-01 | `manage_products` RBAC denial (cashier) for Brands sub-tab | e2e | same file, dedicated test (mirrors `categories.spec.ts` T8) | ❌ Wave 0 |
| BRND-02 | `brand_id` FK persists via product dialog brand-select | e2e | same file or `e2e/products/product-management.spec.ts` | ❌ Wave 0 (extend existing) |
| BRND-02 | `lower(name)` unique constraint (D-03) rejects case-variant duplicate | unit or e2e | `npx vitest run src/entities/brand/model/queries.test.ts` (new) OR e2e insert-twice assertion | ❌ Wave 0 |
| BRND-03 | Both-or-neither weight validation (D-06/D-09) | unit | `npx vitest run src/shared/lib/domain.product-schema.test.ts` | ✅ file exists, add cases |
| BRND-03 | `weight_amount` precision (2 decimals, positive) | unit | same file | ✅ file exists, add cases |
| BRND-04 | Filter-by-brand/weight in admin Catalog | e2e | `e2e/products/product-management.spec.ts` or new file | ❌ Wave 0 |
| BRND-04 | Filter-by-brand/weight in POS checkout grid | e2e | new: `e2e/checkout/` folder (product-grid filter) — planner's call on exact file | ❌ Wave 0 |
| BRND-05 | Full coverage umbrella | e2e | `npm run test:e2e` (phase gate) | — |

### Sampling Rate

- **Per task commit:** targeted `npx playwright test e2e/products/brands.spec.ts` and/or
  `npx vitest run src/shared/lib/domain.product-schema.test.ts`
- **Per wave merge:** `npm run test:e2e` scoped to `e2e/products/**` + `e2e/checkout/**`
- **Phase gate:** full `npm run test:e2e` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `e2e/products/brands.spec.ts` — new file, covers BRND-01/02/05 (CRUD + RBAC denial)
- [ ] Extend `domain.product-schema.test.ts` — covers BRND-03 (both-or-neither, precision)
- [ ] Extend `e2e/products/product-management.spec.ts` (or new file) — covers BRND-04 admin-side
      filter
- [ ] New POS-grid filter E2E coverage — covers BRND-04 POS-side filter (exact file TBD by
      planner; no existing `e2e/checkout/` spec currently exercises `CategoryTabs`+dropdown
      composition for brand/weight, only category+search per STATE.md's noted
      `barcode-scan-search.spec.ts` pre-existing flake, which is unrelated)

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (from `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth surface — reuses existing session |
| V3 Session Management | No | No change |
| V4 Access Control | Yes | `manage_products` RBAC gate on the new Brands sub-tab (D-05, client-side `ProtectedAction`/route gate) **and** RLS policies on `brands` (Pattern 6) — defense in depth, matching the existing `categories`/`modifiers` pattern exactly |
| V5 Input Validation | Yes | Zod schemas (`BrandCreateSchema`/`BrandUpdateSchema`, weight both-or-neither refine) on the client; `CHECK` constraints (`lower(name)` uniqueness, `weight_unit IN (...)`, weight-amount precision) on the DB as the authoritative boundary |
| V6 Cryptography | No | No new secrets/crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cashier-role client bypasses UI, calls Supabase `brands` insert/update/delete directly with a valid but under-privileged JWT | Elevation of Privilege | RLS policies (Pattern 6) — same `role_permissions`/`manage_products` check already proven for `categories`/`modifiers`; the client-side RBAC gate alone is not sufficient, RLS is the actual enforcement boundary |
| Case-variant duplicate brand names ("Nestle" vs "nestle") used to bypass a client-side "already exists" check | Tampering (data integrity) | DB-level `UNIQUE (lower(name))` constraint (D-03) — the authoritative boundary, not a client pre-check |
| A direct RPC/API write sets `weight_amount` without `weight_unit` (or vice versa), bypassing the client Zod refine | Tampering (data integrity) | Mirror the both-or-neither invariant as a DB `CHECK` constraint on `products` (both-null-or-both-not-null), not just the client-side Zod refine — defense in depth per the same pattern already used for `happy_hour_valid` (`(happy_hour_start IS NULL AND happy_hour_end IS NULL) OR (happy_hour_start IS NOT NULL AND happy_hour_end IS NOT NULL)`, verified at `supabase/migrations/20260414000003_products_and_categories.sql:16-19`) |

## Sources

### Primary (HIGH confidence — all read directly this session)

- `D:/Projects/Code/supermarket-pos/src/shared/lib/domain.ts` — CategorySchema, ProductSchema,
  MoneySchema, existing `.refine()` usage (or lack thereof) on chained schemas
- `D:/Projects/Code/supermarket-pos/src/entities/category/model/queries.ts` — CRUD-minus-delete
  pattern
- `D:/Projects/Code/supermarket-pos/src/entities/product/model/queries.ts` — `useModifiers`/delete
  mutation pattern, `mapProductRow`, `.select('*')` shape
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/CatalogCategoriesTab.tsx` — confirmed dead code
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/CatalogModifiersTab.tsx` — the actual CRUD-with-delete template
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/CategoryForm.tsx`
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/CatalogProductsTab.tsx` — DataTable `toolbar` usage site
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/tabs/ProductDetailsTab.tsx`
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/ProductDetailDialog.tsx`
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/model/productDialogTabs.ts`
- `D:/Projects/Code/supermarket-pos/src/features/manage-categories/ui/CategoryTreeEditor.tsx` — confirmed no delete UI
- `D:/Projects/Code/supermarket-pos/src/widgets/InventoryPagePanel/ui/CatalogTab.tsx` — the real live sub-tab wiring
- `D:/Projects/Code/supermarket-pos/src/widgets/ProductGrid/ui/ProductGrid.tsx` — POS filter insertion point
- `D:/Projects/Code/supermarket-pos/src/entities/product/ui/CategoryTabs.tsx`
- `D:/Projects/Code/supermarket-pos/src/shared/ui/DataTable.tsx` — `toolbar` prop
- `D:/Projects/Code/supermarket-pos/src/shared/lib/result.ts` — `parseSupabaseError`, 23503 handling
- `D:/Projects/Code/supermarket-pos/src/shared/lib/rbac.ts` — confirmed `manage_products` is manager+, not admin-only
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260414000003_products_and_categories.sql`
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260510000001_rls_rewrite_phase13.sql`
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260415203455_allow_anon_read_catalog.sql`
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260729000002_products_open_unit_columns.sql`
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260901000001_promotions_schema.sql`
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260718000000_profiles_locale.sql`
- `D:/Projects/Code/supermarket-pos/e2e/products/categories.spec.ts`
- `D:/Projects/Code/supermarket-pos/.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

### Secondary / Tertiary

None used — every finding in this document traces to a file read this session; no WebSearch or
training-data-only claims were needed since this is a pure internal-pattern-extension phase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, every primitive confirmed already in use
- Architecture: HIGH — every insertion point (entity queries, dialog, filter surfaces, migration
  shape, RLS policy shape) verified by reading the actual current source, including one material
  correction to CONTEXT.md's canonical_refs (Pitfall 1)
- Pitfalls: HIGH — all five pitfalls are grounded in specific, cited source reads, not general
  Zod/React folklore

**Research date:** 2026-09-08
**Valid until:** 30 days (stable internal codebase, no fast-moving external dependency)
