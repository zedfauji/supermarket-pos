# Phase 32: Brand Entity & Pack-Weight Catalog Attributes - Pattern Map

**Mapped:** 2026-09-08
**Files analyzed:** 12 (new + modified)
**Analogs found:** 12 / 12

> Correction inherited from RESEARCH.md (Pitfall 1): do NOT use `CatalogCategoriesTab.tsx` as the
> Brand CRUD template — it is dead code (unrendered, no delete UI). Use `CatalogModifiersTab.tsx`
> instead, which has the full list/create/edit/delete/`ConfirmDialog` shape Brand needs.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/<ts>_brands_and_product_weight.sql` | migration | CRUD (DDL) | `supabase/migrations/20260729000002_products_open_unit_columns.sql` (columns) + `20260510000001_rls_rewrite_phase13.sql` (RLS) + `20260415203455_allow_anon_read_catalog.sql` (anon policy) | exact |
| `src/shared/lib/domain.ts` (BrandSchema block) | model/schema | CRUD | `CategorySchema`/`CategoryCreateSchema`/`CategoryUpdateSchema` (lines 171-209) | exact |
| `src/shared/lib/domain.ts` (ProductSchema additions + refine) | model/schema | CRUD | `ProductSchema.unitsPerPackage` field (line 264) + `ProductCreateSchema`/`ProductUpdateSchema` (lines 281-292) | exact |
| `src/entities/brand/model/types.ts` | model | CRUD | `src/entities/category/model/types.ts` (re-export pattern) | exact |
| `src/entities/brand/model/queries.ts` | service (query hooks) | CRUD | `src/entities/category/model/queries.ts` (list+create+update) + `useMutationDeleteModifier` in `src/entities/product/model/queries.ts:594-612` (delete) | exact |
| `src/entities/brand/index.ts` | barrel | — | `src/entities/category/index.ts` | exact |
| `src/features/manage-products/ui/CatalogBrandsTab.tsx` | component (CRUD tab) | CRUD | `src/features/manage-products/ui/CatalogModifiersTab.tsx` (full file) | exact |
| `src/features/manage-products/ui/BrandForm.tsx` (if split out of the tab, optional) | component (form) | CRUD | `ModifierDialogForm` inside `CatalogModifiersTab.tsx` (lines 219-297) — simplified further, name-only | role-match |
| `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx` (modified) | component (form) | CRUD | itself, prior revision (category `<select>` block, lines 67-89; `unitsPerPackageInput` string-buffer pattern in `ProductDetailDialog.tsx` lines 89-91, 268+) | exact |
| `src/features/manage-products/ui/ProductDetailDialog.tsx` (modified) | component (dialog/state) | CRUD | itself, prior revision — `unitsPerPackageInput` state + submit-time parse (lines 89-154, 268-305) | exact |
| `src/features/manage-products/ui/CatalogProductsTab.tsx` (modified) | component (table + filter toolbar) | CRUD | itself, prior revision — `DataTable` usage (lines 459-469); `toolbar` prop definition in `src/shared/ui/DataTable.tsx` (lines 46-49, 100-102) | exact |
| `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx` (modified) | component (tab shell) | request-response | itself, prior revision — `TabsTrigger`/`TabsContent` wiring (lines 7, 29-47) | exact |
| `src/widgets/ProductGrid/ui/ProductGrid.tsx` (modified) | component (filter) | CRUD (client filter) | itself, prior revision — `activeCategory`/`matches` filter predicate (lines 36, 48-55, 94-101) | exact |
| `e2e/products/brands.spec.ts` | test (E2E) | request-response | `e2e/products/categories.spec.ts` | exact |
| `src/shared/lib/domain.product-schema.test.ts` (extended) | test (unit) | transform | itself, prior revision (existing file, add both-or-neither/precision cases) | exact |

## Pattern Assignments

### `supabase/migrations/<ts>_brands_and_product_weight.sql` (migration)

**Analogs:** `20260729000002_products_open_unit_columns.sql` (ADD COLUMN + CHECK + comment shape),
`20260510000001_rls_rewrite_phase13.sql:413-427` (4-policy RBAC shape),
`20260415203455_allow_anon_read_catalog.sql:12-16` (anon read policy),
`20260414000003_products_and_categories.sql:28` (RESTRICT FK precedent)

**Column/table shape (D-01/D-02/D-03):**
```sql
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX brands_lower_name_key ON brands (lower(name));

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS weight_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS weight_unit text;

ALTER TABLE products
  ADD CONSTRAINT weight_amount_positive CHECK (weight_amount IS NULL OR weight_amount > 0),
  ADD CONSTRAINT weight_unit_valid CHECK (weight_unit IS NULL OR weight_unit IN ('g','kg','lb','oz')),
  ADD CONSTRAINT weight_both_or_neither CHECK (
    (weight_amount IS NULL AND weight_unit IS NULL) OR
    (weight_amount IS NOT NULL AND weight_unit IS NOT NULL)
  );
```
(Existing `happy_hour_valid` both-or-neither CHECK at `20260414000003_products_and_categories.sql:16-19` is the direct precedent for `weight_both_or_neither`.)

**RLS pattern (Pattern 6 — exact policy set to mirror, `categories` → `brands`):**
```sql
-- Source: 20260510000001_rls_rewrite_phase13.sql:413-427
CREATE POLICY "brands_select_authenticated" ON brands
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "brands_insert_manager_admin" ON brands
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
CREATE POLICY "brands_update_manager_admin" ON brands
  FOR UPDATE TO authenticated
  USING (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
CREATE POLICY "brands_delete_manager_admin" ON brands
  FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));

-- Source: 20260415203455_allow_anon_read_catalog.sql:12-16 — DO NOT SKIP (Pitfall 5)
CREATE POLICY "anon_read_brands" ON public.brands
  FOR SELECT TO anon, authenticated USING (true);
```

---

### `src/shared/lib/domain.ts` — `BrandSchema` (new)

**Analog:** `CategorySchema`/`CategoryCreateSchema`/`CategoryUpdateSchema` (lines 171-209)

```typescript
// Structural template (drop color/sortOrder/happyHour/routing/parentId — D-01 name-only)
export const CategorySchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  color: HexColorSchema,
  sortOrder: z.number().int().nonnegative(),
  // ...
  createdAt: TimestampSchema,
});

export const CategoryCreateSchema = CategorySchema.omit({ id: true, createdAt: true });
export const CategoryUpdateSchema = CategorySchema.partial().required({ id: true });
```
→ `BrandSchema = z.object({ id: UuidSchema, name: z.string().min(1).max(100), createdAt: TimestampSchema })`,
`BrandCreateSchema`/`BrandUpdateSchema` via the identical `.omit`/`.partial().required` calls.

### `src/shared/lib/domain.ts` — `ProductSchema` additions + both-or-neither refine

**Analog (nullable numeric field precedent):** `ProductSchema.unitsPerPackage` (line 264)
```typescript
unitsPerPackage: z.number().int().positive().nullable(),
```
→ add plain nullable fields to base `ProductSchema` (NO refine on the base — Pitfall 4):
```typescript
brandId: UuidSchema.nullable(),
weightAmount: z.number().positive().multipleOf(0.01).nullable(),
weightUnit: z.enum(['g', 'kg', 'lb', 'oz']).nullable(),
```

**Analog (refine attach point — Create/Update, not base):** existing `.omit`/`.partial` derivation
(lines 281-292) plus the one existing `.refine()` precedent, `ProcessRefundInputSchema` (line
1480-1498, terminal schema — confirms refine must be the last chained call). Both-or-neither must
be attached separately to `ProductCreateSchema` AND `ProductUpdateSchema`:
```typescript
export const ProductCreateSchema = ProductSchema.omit({ id: true, category: true, modifiers: true })
  .refine(v => (v.weightAmount == null) === (v.weightUnit == null), {
    message: 'weightAmount and weightUnit must both be set or both be null',
    path: ['weightUnit'],
  });

export const ProductUpdateSchema = ProductSchema.omit({ category: true, modifiers: true })
  .partial()
  .required({ id: true })
  .refine(
    v => !('weightAmount' in v && !('weightUnit' in v)) &&
         !('weightUnit' in v && !('weightAmount' in v)) &&
         (v.weightAmount == null) === (v.weightUnit == null),
    { message: 'weightAmount and weightUnit must both be set or both be null', path: ['weightUnit'] }
  );
```
(Exact refine predicate is planner/executor's call — the load-bearing constraint is: attach to
Create/Update, never to base `ProductSchema`, and Update must tolerate both keys being *absent*.)

---

### `src/entities/brand/model/queries.ts` (new)

**Analog 1 — list + create + update (mirror verbatim structure):** `src/entities/category/model/queries.ts` (full file, 176 lines)
```typescript
// imports (lines 1-14)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryCreate, CategoryUpdate } from '@shared/lib/domain';
import { CategorySchema } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import { err, ok, supabaseMutation, supabaseQuery, unknownError, type Result } from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@shared/lib/supabase.types';

// query key + row mapper (lines 22-48)
const CATEGORY_QUERY_KEY = ['categories'] as const;
function mapCategoryRow(row: Tables<'categories'>): Result<Category> {
  try {
    return ok(CategorySchema.parse({ id: row.id, name: row.name, /* ... */ createdAt: new Date(row.created_at) }));
  } catch (e) { return err(unknownError(e)); }
}

// list query (lines 70-108)
export function useCategories() {
  const query = useQuery({
    queryKey: CATEGORY_QUERY_KEY,
    queryFn: async (): Promise<Result<Category[]>> => {
      const res = await supabaseQuery(() => supabase.from('categories').select('*').order('sort_order'));
      // ... map each row, return ok(categories) or first err
    },
    staleTime: 5 * 60 * 1000,
  });
  const r = query.data;
  return { ...query, data: r?.ok ? r.data : undefined, resultError: r && !r.ok ? r.error : undefined, /* ... */ };
}
```
For `useBrands()`: `.order('name')` (alphabetical, D-01/no-sortOrder) instead of `.order('sort_order')`.

**Analog 2 — delete mutation (verbatim, exact template):** `src/entities/product/model/queries.ts:594-612`
```typescript
export function useMutationDeleteModifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modifierId: string): Promise<Result<null>> => {
      const res = await supabaseMutation(() => supabase.from('modifiers').delete().eq('id', modifierId));
      if (!res.ok) {
        logger.error('modifiers.delete_failed', { message: res.error.message });
        return res;
      }
      return ok(null);
    },
    onSuccess: result => { if (result.ok) invalidateCatalogQueries(queryClient); },
  });
}
```
→ `useMutationDeleteBrand`: `.from('brands').delete().eq('id', brandId)`. No FK-violation
special-casing needed — `parseSupabaseError` (`src/shared/lib/result.ts:496-520`) already turns
Postgres `23503` into a generic `AppError` surfaced via `res.error.message` (Pitfall 3).

**Create/update mutations analog:** `useMutationCreateCategory`/`useMutationUpdateCategory`
(lines 114-175) — same `insertRow`/`row` partial-update-object shape, dropped down to just `name`.

**Cache invalidation:** mirror `invalidateCategoryQueries` (lines 54-59) — invalidate
`['brands']` plus `['products']`/`['products', 'management']` since brand is a product join field.

---

### `src/features/manage-products/ui/CatalogBrandsTab.tsx` (new)

**Analog:** `src/features/manage-products/ui/CatalogModifiersTab.tsx` (full file, 298 lines) — this
is the corrected template per RESEARCH.md Pitfall 1, NOT `CatalogCategoriesTab.tsx`.

**Imports pattern:**
```typescript
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { FormField } from '@shared/ui/FormField';
import { POSButton } from '@shared/ui/POSButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Input } from '@shared/ui/input';
```
(swap `@entities/product`'s modifier hooks for `@entities/brand`'s brand hooks; drop `MoneyDisplay`/`MoneyInput` — Brand has no price field)

**Core list/create/edit/delete pattern (lines 20-179):** identical shape — `useState` for
`createOpen`/`editX`/`deleteId`, sort via `useMemo` (alphabetical `a.name.localeCompare(b.name)`
instead of `sortOrder`), `<ul>` list with Pencil/Trash2 `POSButton`s per row, two dialog instances
(create/edit) + one `ConfirmDialog` for delete.

**Delete confirm pattern (lines 158-176, verbatim):**
```typescript
<ConfirmDialog
  open={deleteId != null}
  title={t('manageProducts.brandsTab.deleteBrandTitle')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={async () => {
    if (deleteId == null) return;
    const id = deleteId;
    const r = await deleteMutation.mutateAsync(id);
    setDeleteId(null);
    if (!r.ok) toast.error(r.error.message);
    else toast.success(t('manageProducts.brandsTab.brandDeleted'));
  }}
  onCancel={() => { setDeleteId(null); }}
/>
```

**Form dialog pattern (lines 181-297):** `BrandDialogForm` mirrors `ModifierDialogForm` — a single
`name` `Input` inside `FormField`, submit validates `name.trim() !== ''`, Cancel/Save `POSButton`s.
Drop `priceDelta`/`sortOrder` fields entirely.

---

### `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx` (modified)

**Analog:** itself, prior revision (full file, 142 lines)

**Category `<select>` pattern to mirror for brand-select (D-08, insertion point right after
Category field, lines 67-89):**
```typescript
<FormField
  label={t('manageProducts.productForm.categoryLabel')}
  required
  error={fieldErrors.categoryId ?? ''}
>
  <select
    className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs dark:bg-input/20"
    value={categoryId}
    onChange={e => { onCategoryIdChange(e.target.value); }}
    disabled={submitting || categories.length === 0}
  >
    {categories.length === 0 ? <option value="">{t('...noCategories')}</option> : null}
    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
</FormField>
```
→ brand `<select>` is identical shape but with an extra blank/"none" option (brand is nullable,
unlike category): `<option value="">{t('...noBrand')}</option>` always present, plus
`brands.map(...)` sorted alphabetically (D-01 discretion). Weight fields are two more `FormField`s
(a `Input inputMode="decimal"` for amount + a `<select>` for unit, defaulting to `'g'` per D-09)
placed immediately after the brand field, still before Base Price.

**Do NOT use** `shared/ui/select.tsx` (shadcn) — every sibling dropdown in this exact file uses
the plain native `<select>` shown above (RESEARCH.md Anti-Patterns).

---

### `src/features/manage-products/ui/ProductDetailDialog.tsx` (modified)

**Analog:** itself, prior revision — `unitsPerPackageInput` string-buffer state + submit-time
parse (lines 89-154, 268-305) is the exact D-09 resolution template.

**State init pattern (lines 89-94):**
```typescript
const [unitsPerPackageInput, setUnitsPerPackageInput] = useState(
  initialProduct?.unitsPerPackage != null ? String(initialProduct.unitsPerPackage) : ''
);
```
→ `weightAmountInput` follows identically: `useState(initialProduct?.weightAmount != null ? String(initialProduct.weightAmount) : '')`.
`weightUnit` state: `useState(initialProduct?.weightUnit ?? 'g')` — pre-selected default per D-09,
but its value is NEVER read into the payload unless `weightAmountInput.trim() !== ''` (Pitfall 2).

**Submit-time parse pattern (lines 268-305, the exact model for weight's both-or-neither
resolution):**
```typescript
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
→ weight payload construction:
```typescript
const weightAmount = weightAmountInput.trim() === '' ? null : Number(weightAmountInput.trim());
const payloadWeightUnit = weightAmount === null ? null : weightUnit;
```
This guarantees the payload's `weightUnit` is non-null **only when** `weightAmount` is also
non-null, regardless of the `<select>`'s pre-selected `'g'` state — satisfying the both-or-neither
refine on every save, including untouched-weight-field saves (Pitfall 2's regression to avoid).

**Dirty-snapshot pattern (lines 125-154):** `initialSnapshot`/`currentSnapshot` must gain
`weightAmountInput`/`weightUnit`/`brandId` fields alongside the existing ones, same shape.

---

### `src/features/manage-products/ui/CatalogProductsTab.tsx` (modified — brand/weight filter dropdowns)

**Analog:** itself, prior revision — `DataTable` usage (lines 459-469) + `toolbar` prop definition
in `src/shared/ui/DataTable.tsx` (lines 46-49, 100-102)

```typescript
// Current (no toolbar passed):
<DataTable<Product>
  columns={columns}
  data={products ?? []}
  isLoading={isLoading}
  searchable
  searchPlaceholder={t('manageProducts.productsTab.searchPlaceholder')}
  enableSorting
  onRowClick={openDetailDialog}
  getRowClassName={() => 'hover:bg-muted/50 transition-colors duration-150'}
/>
```
`DataTable`'s `toolbar?: React.ReactNode` prop (already exists, rendered above the search box —
`shared/ui/DataTable.tsx:49,100-102`) is the exact, no-new-component insertion point (D-11):
```typescript
<DataTable<Product>
  columns={columns}
  data={filteredByBrandAndWeight}   // pre-filter `products ?? []` by brandFilter/weightUnitFilter
  toolbar={
    <>
      <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
        <option value="">{t('...allBrands')}</option>
        {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select value={weightUnitFilter} onChange={e => setWeightUnitFilter(e.target.value)}>
        <option value="">{t('...allWeightUnits')}</option>
        {(['g','kg','lb','oz'] as const).map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </>
  }
  searchable
  searchPlaceholder={t('manageProducts.productsTab.searchPlaceholder')}
  enableSorting
  onRowClick={openDetailDialog}
/>
```
(`DataTable`'s own `searchable` text filter still applies on top of the pre-filtered array — same
combination the codebase already uses nowhere else, but structurally trivial: filter before handing
`data` to `DataTable`, same pattern `ProductGrid.tsx` uses for its own `matches` array below.)

---

### `src/widgets/ProductGrid/ui/ProductGrid.tsx` (modified — secondary brand/weight filters, D-12)

**Analog:** itself, prior revision — `activeCategory`/`matches` filter predicate

```typescript
// Source: ProductGrid.tsx:36, 48-55
const [activeCategory, setActiveCategory] = useState<string | null>(null);
// ...
const query = search.trim().toLowerCase();
const matches = products.filter(
  product =>
    (activeCategory === null || product.categoryId === activeCategory) &&
    (!query ||
      product.name.toLowerCase().includes(query) ||
      product.sku?.toLowerCase().includes(query) ||
      product.barcode?.toLowerCase().includes(query))
);
```
→ add `activeBrand`/`activeWeightUnit` state (same `useState<string | null>(null)` shape) and AND
them into the same predicate (D-12 — narrows *within* the active category, doesn't replace it):
```typescript
const matches = products.filter(
  product =>
    (activeCategory === null || product.categoryId === activeCategory) &&
    (activeBrand === null || product.brandId === activeBrand) &&
    (activeWeightUnit === null || product.weightUnit === activeWeightUnit) &&
    (!query || /* ...unchanged... */)
);
```

**Rendering placement (lines 92-101):** `CategoryTabs` stays untouched (D-12); render the two new
native `<select>`s (same markup as `ProductDetailsTab.tsx`'s category-select, styled consistently)
in a `<div>` directly below the `<CategoryTabs .../>` block and above the `matches`-rendering
scroll container, sourcing brand options from a `useBrands()` call already available at this level
(mirrors the existing `useCategories()` call at lines 43-46).

---

### `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx` (modified — 5th TabsTrigger)

**Analog:** itself, prior revision (lines 7, 29-47)

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
// ...
<TabsTrigger value="products">{t('productsSettingsTab.tabProducts')}</TabsTrigger>
<TabsTrigger value="categories">{t('productsSettingsTab.tabCategories')}</TabsTrigger>
<TabsTrigger value="modifiers">{t('productsSettingsTab.tabModifiers')}</TabsTrigger>
<TabsTrigger value="modifier-groups">{/* ... */}</TabsTrigger>
{/* ... */}
<TabsContent value="products">{/* ... */}</TabsContent>
<TabsContent value="categories">{/* ... */}</TabsContent>
<TabsContent value="modifiers">{/* ... */}</TabsContent>
<TabsContent value="modifier-groups">{/* ... */}</TabsContent>
```
→ add `<TabsTrigger value="brands">{t('productsSettingsTab.tabBrands')}</TabsTrigger>` +
`<TabsContent value="brands"><CatalogBrandsTab /></TabsContent>`, same RBAC gate already wrapping
this whole tab shell (`manage_products`, D-05 — no new gate needed, the shell-level check already
covers the new sub-tab).

---

### `e2e/products/brands.spec.ts` (new)

**Analog:** `e2e/products/categories.spec.ts` — structure, `loginAs(page, role)` helper usage from
`e2e/helpers/auth.ts`, and its RBAC-denial test (referenced in RESEARCH.md as "T8") to mirror for
the cashier-denied-Brands-tab case. Cover: create/edit/delete round-trip, `manage_products` RBAC
denial (cashier), case-insensitive duplicate-name rejection (D-03), and — per BRND-05 — weight
validation + filter-by-brand/weight (can live in this file or extend
`e2e/products/product-management.spec.ts`, planner's call per RESEARCH.md's Open Question 2/Wave 0
gaps).

---

## Shared Patterns

### Result<T> + supabaseQuery/supabaseMutation
**Source:** `src/shared/lib/result.ts`, consumed identically in `src/entities/category/model/queries.ts`
**Apply to:** `entities/brand/model/queries.ts` — every Supabase call wrapped in `supabaseQuery`/
`supabaseMutation`, every hook returns/propagates `Result<T>`, errors logged via `logger.error`
with a `<entity>.<action>_failed` event name (e.g. `brands.create_failed`).

### FK-violation error handling (no bespoke code)
**Source:** `src/shared/lib/result.ts:496-520` (`parseSupabaseError`)
**Apply to:** `useMutationDeleteBrand` — do not write custom `23503` handling; `res.error.message`
from `supabaseMutation` is already toast-ready (Pitfall 3).

### Native `<select>` for all dropdowns in this surface
**Source:** `ProductDetailsTab.tsx:72-88` (category), `CatalogProductsTab.tsx` inline category-editor
**Apply to:** brand-select, weight-unit-select, and both sets of filter dropdowns (admin + POS) —
never `shared/ui/select.tsx` (shadcn) in this surface (Anti-Pattern, RESEARCH.md).

### Client-side array filtering (no query-param/server filter layer)
**Source:** `ProductGrid.tsx:48-55` (`matches`), `CatalogProductsTab.tsx`'s `DataTable searchable` prop
**Apply to:** both new filter surfaces (D-11/D-12) — plain `useState` + `.filter()` predicate over
the already-fetched product list, no new fetch/query.

### i18n namespace + literal-string enforcement
**Source:** `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json`
**Apply to:** all new Brand/weight labels — `featMgmt` namespace (matches every other
`manageProducts.*` key already in `CatalogModifiersTab.tsx`/`ProductDetailsTab.tsx`); every literal
string in `shared/ui`, `entities`, `features`, `widgets`, `pages` layers must go through `t(...)`.

## Metadata

**Analog search scope:** `src/entities/category/`, `src/entities/product/`,
`src/features/manage-products/ui/`, `src/widgets/InventoryPagePanel/`, `src/widgets/ProductGrid/`,
`src/shared/lib/domain.ts`, `src/shared/ui/DataTable.tsx`, `supabase/migrations/`,
`e2e/products/categories.spec.ts`
**Files scanned:** 12 read in full or targeted ranges this session (plus RESEARCH.md's own 20
already-verified sources reused directly)
**Pattern extraction date:** 2026-09-08
