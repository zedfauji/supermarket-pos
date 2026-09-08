# Phase 31: Product Catalog Detail & Photo Upload - Pattern Map

**Mapped:** 2026-09-07
**Files analyzed:** 12 new/modified
**Analogs found:** 11 / 12

All paths below are relative to `D:/Projects/Code/supermarket-pos/` and are git-tracked source.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/features/manage-products/ui/ProductDetailDialog.tsx` (NEW) | component (dialog host) | request-response (form submit) | `src/features/manage-products/ui/ProductForm.tsx` + `src/widgets/SettingsTabsPanel/index.tsx` | exact (composite of two) |
| `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx` (NEW) | component (form fields) | request-response | `ProductForm.tsx` L248-386 | exact (lift-and-shift) |
| `src/features/manage-products/ui/tabs/ProductLinksTab.tsx` (NEW) | component (form fields) | request-response | `ProductForm.tsx` L321-450 | exact (lift-and-shift) |
| `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx` (NEW) | component | file-I/O | `src/features/agent-chat/ui/FileDropZone.tsx` | role-match (drop only; no paste/canvas precedent) |
| `src/features/manage-products/model/useProductPhotoUpload.ts` (NEW) | hook (mutation) | file-I/O + CRUD | `src/entities/product/model/queries.ts` L486-518 (`useMutationUpdateProduct`) | role-match |
| `src/entities/product/model/resolveProductImage.ts` (NEW) | utility + query hook | request-response (batch) | `src/entities/product/model/queries.ts` (query/`Result` conventions) | partial — **no `supabase.storage` analog exists anywhere in `src/`** |
| `src/features/manage-products/ui/CatalogProductsTab.tsx` (MOD) | component (table host) | CRUD | itself (L181-301 columns, L339-408 dialogs) | exact |
| `src/entities/product/model/queries.ts` (MOD) | service (queries) | CRUD | itself (`mapProductRow`, `productUpdateToRow`) | exact |
| `src/shared/lib/domain.ts` (MOD) | model (Zod) | — | `ProductSchema` L229-263 | exact |
| `supabase/migrations/2026090700000X_product_photos_storage.sql` (NEW) | migration | — | `supabase/migrations/20260823000001_purchase_orders.sql` L35-43 | role-match (bucket INSERT is new) |
| `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` (MOD) | config (catalog) | — | existing `manageProducts.productForm.*` keys | exact |
| `e2e/products/product-photo-upload.spec.ts` (NEW) + `e2e/products/product-management.spec.ts` (MOD) | test | — | `e2e/products/product-management.spec.ts` L1-55 | exact |

## Pattern Assignments

### `ProductDetailDialog.tsx` (component, request-response)

**Analogs:** `src/widgets/SettingsTabsPanel/index.tsx` (rail), `ProductForm.tsx` (submit logic), `CatalogProductsTab.tsx` (dialog host).

**Vertical-tab rail** — copy from `SettingsTabsPanel/index.tsx:143-176`, with the one deliberate divergence UI-SPEC requires (`value`/`onValueChange` controlled instead of `defaultValue`, for D-06 auto-switch), and `lg:grid-cols-[13rem_...]` instead of `15rem`:

```tsx
<Tabs
  defaultValue={firstTab.key}          // ← becomes value={activeTab} onValueChange={setActiveTab}
  orientation="vertical"
  className="grid w-full gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
>
  <VerticalTabsList aria-label={t('navLabel')} className="self-start lg:sticky lg:top-0">
    {group.tabs.map(tab => (
      <VerticalTabsTrigger key={tab.key} value={tab.key} icon={tab.icon} label={tab.label} description={tab.description} />
    ))}
  </VerticalTabsList>
  <div className="min-w-0">
    {allTabs.map(tab => (
      <TabsContent key={tab.key} value={tab.key} className="min-h-[24rem] rounded-2xl border border-border bg-card p-6 shadow-xs">
        {tab.render()}
      </TabsContent>
    ))}
  </div>
</Tabs>
```
Note: the panel wrapper `<div className="min-w-0">` becomes `min-h-0 overflow-y-auto` — that div is the D-08 sole scroll region.

**Submit + Zod error flattening** — copy verbatim from `ProductForm.tsx:164-232`; do **not** rewrite. The only addition is mapping `next` keys → tab id before `setFieldErrors` (D-06):

```typescript
const parsed = ProductUpdateSchema.safeParse({
  id: initialProduct.id, name, categoryId, basePrice, happyHourPrice: null,
  sku: skuVal, isActive, imageUrl: imageVal, barcode: barcodeVal,
  unitsPerPackage, parentProductId,
  stock_threshold: initialProduct.stock_threshold ?? null,   // L177 — omitting this caused a silent failure incident
});
if (!parsed.success) {
  const flat = z.flattenError(parsed.error);
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat.fieldErrors)) {
    const first = Array.isArray(v) ? v[0] : undefined;
    if (first) next[k] = first;
  }
  if (Object.keys(next).length === 0 && parsed.error.issues[0]) next._form = parsed.error.issues[0].message;
  setFieldErrors(next);
  return;
}
```

**Two documented silent-failure guards to carry forward** (`ProductForm.tsx:81-90` and the `stock_threshold` comment at L151-163) — the `categoryId` backfill effect must move with the Details fields:

```typescript
useEffect(() => {
  const firstCategoryId = categories[0]?.id;
  if (categoryId === '' && firstCategoryId != null) {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategoryId(firstCategoryId);
  }
}, [categories, categoryId]);
```

**Footer** — today's inline footer (`ProductForm.tsx:452-473`) moves into `DialogFooter`; button props unchanged:
```tsx
<POSButton type="button" variant="outline" touchSize="default" disabled={submitting} onClick={onCancel}>
  {t('common:actions.cancel')}
</POSButton>
<POSButton type="submit" touchSize="default" disabled={submitting || categories.length === 0}>
  {submitting ? t('common:actions.saving') : isEdit ? t('manageProducts.productForm.saveProduct') : t('manageProducts.productForm.createProduct')}
</POSButton>
```

**Discard-confirm (D-07)** — copy the `ConfirmDialog` invocation shape from `CatalogProductsTab.tsx:410-428` (`open` / `title` / `description` / `confirmLabel` / `variant="destructive"` / `isLoading` / `onConfirm` / `onCancel`).

---

### `ProductDetailsTab.tsx` / `ProductLinksTab.tsx` (component, request-response)

**Analog:** `ProductForm.tsx` — the field JSX is lifted verbatim, only regrouped into `grid gap-4 lg:grid-cols-2`. Canonical field shape (`ProductForm.tsx:306-319`), including the E2E testid that must not be renamed:

```tsx
<FormField
  label={t('manageProducts.productForm.barcodeLabel')}
  hint={t('manageProducts.productForm.barcodeHint')}
  error={fieldErrors.barcode ?? ''}
>
  <Input data-testid="product-form-barcode" value={barcode}
    onChange={e => { setBarcode(e.target.value); }} disabled={submitting} />
</FormField>
```

Native `<select>` class string to reuse unchanged (`ProductForm.tsx:268`):
```
flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs dark:bg-input/20
```

Modifiers/suppliers checkbox wells (`ProductForm.tsx:388-450`) move to the Links tab unchanged, except `max-h-40` → `max-h-48` per UI-SPEC:
```tsx
<ScrollArea className="max-h-40 rounded-lg border border-border bg-card p-2">
  <ul className="space-y-2 pr-2">
    {sortedModifiers.length === 0
      ? <li className="text-muted-foreground text-sm">{t('manageProducts.productForm.noModifiersDefined')}</li>
      : sortedModifiers.map(m => (<li key={m.id} className="flex items-center gap-2"><Checkbox id={`mod-${m.id}`} … /></li>))}
  </ul>
</ScrollArea>
```

The legacy `imageUrl` `Input` (`ProductForm.tsx:360-372`) moves here as-is — keep `UrlSchema` semantics on it (Pitfall 3: the new path field must NOT reuse `UrlSchema`).

---

### `ProductPhotoTab.tsx` (component, file-I/O)

**Analog:** `src/features/agent-chat/ui/FileDropZone.tsx` — the only drag-and-drop precedent. Copy its drag state + handlers and its drag-over overlay markup (the UI-SPEC's brand tokens are already this file's):

```tsx
const [isDragOver, setIsDragOver] = useState(false);

const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
const handleDragLeave = useCallback(() => { setIsDragOver(false); }, []);
const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(false);
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (ACCEPTED_TYPES.includes(file.type)) onFileDrop(file);
  else logger.warn('agent.fileDrop.unsupportedType', { fileType: file.type });
}, [onFileDrop]);
```
```tsx
{isDragOver && (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-brand-soft/80">
    <span className="text-sm font-medium text-brand-strong">{t('agentChat.dropFileHere')}</span>
  </div>
)}
```

**Divergences the analog does not cover** (build fresh, per UI-SPEC): the `ACCEPTED_TYPES` list narrows to `['image/jpeg','image/png','image/webp']`; rejection must surface a user-visible `photo.errorUnsupportedType` toast + inline `role="alert"` (FileDropZone only `logger.warn`s — silent, unacceptable here per D-11); clipboard `onPaste` and the canvas resize have no analog in this repo.

---

### `useProductPhotoUpload.ts` (hook, file-I/O + CRUD)

**Analog:** `src/entities/product/model/queries.ts:486-518` (`useMutationUpdateProduct`) — the mandatory `Result<T>` + `supabaseMutation` + `logger.error` + invalidate shape:

```typescript
export function useMutationUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProductInput): Promise<Result<null>> => {
      const { id, modifierIds, supplierIds, ...patch } = input;
      const row = productUpdateToRow(patch);
      if (Object.keys(row).length > 0) {
        const upd = await supabaseMutation(() =>
          supabase.from('products').update(row).eq('id', id).select('id').single()
        );
        if (!upd.ok) { logger.error('products.update_failed', { message: upd.error.message }); return upd; }
      }
      return ok(null);
    },
    onSuccess: result => { if (result.ok) invalidateCatalogQueries(queryClient); },
  });
}
```

Storage calls are **new territory** (zero `supabase.storage` usage in `src/`) — wrap them by hand in the same `Result` shape rather than through `supabaseMutation` (which expects a PostgrestBuilder). Use RESEARCH.md § "Upload / replace flow" as the literal template, and keep the early-return-on-`!ok` chaining style above so the Pitfall-6 partial-failure states (upload-ok/link-failed, link-ok/delete-failed) each return their own distinguishable `AppError`.

---

### `resolveProductImage.ts` (utility, request-response batch)

**No analog.** FSD forces it into `entities/product/model/` (consumers in `entities/*` and `widgets/*` cannot import `features/`). Follow `queries.ts`'s file-level conventions: `import { supabase } from '@shared/lib/supabase'`, the `/* eslint-disable i18next/no-literal-string -- query-key namespace strings … */` block header (`queries.ts:14-16`) for query keys, and `Result`/`logger` on every failure path. Signed-URL cache is a TanStack `useQuery` keyed by path with `staleTime` < TTL (D-16); use RESEARCH.md's `resolveOne`/`resolveMany` sketches as the body.

---

### `CatalogProductsTab.tsx` (component, CRUD — modified)

**Analog:** itself. The two `Dialog`s at L339-408 collapse into one `ProductDetailDialog`; keep the mutation-callback shape verbatim:

```tsx
void createMutation.mutateAsync(input, {
  onSuccess: r => {
    if (!r.ok) toast.error(r.error.message);
    else {
      toast.success(t('manageProducts.productsTab.productCreated'));
      setCreateOpen(false);          // ← D-03: this line goes away; setActiveProduct(created) instead
    }
  },
});
```

Column cells needing `stopPropagation` before `onRowClick` is wired (Pitfall 1) — all four, not just the action buttons: `ProductNameCell` (L31-56), `ProductCategoryCell` (L58-88), `ProductBasePriceCell` (L90-114), and both `POSButton`s in the `actions` column (L276-296).

New thumbnail column follows the existing `ColumnDef` shape (L255-268 `active` column is the smallest example):
```tsx
{ id: 'active', header: t('…statusHeader'), cell: ({ row }) => { const p = row.original; return (<Badge variant={p.isActive ? 'default' : 'secondary'}>…</Badge>); } }
```

---

### `queries.ts` / `domain.ts` (service + model — modified)

`ProductSchema` (`domain.ts:229-263`) gains the path field. Follow the existing per-field JSDoc-phase-comment convention and, per Pitfall 3, **do not** reuse `UrlSchema`:
```typescript
imageUrl: UrlSchema.nullable(),            // unchanged (legacy free-text URL)
photoPath: z.string().min(1).max(500).nullable(),   // NEW — Storage object path, NOT a URL
```
`ProductCreateSchema`/`ProductUpdateSchema` derive from it automatically (`.omit`/`.partial`, L265-274) — no separate edit.

`queries.ts`: add `photoPath: row.photo_path` to `mapProductRow`'s `ProductSchema.parse({…})` (the `imageUrl: row.image_url` line, ~L80) and the matching snake_case key to `productUpdateToRow`. Until `supabase.types.ts` is regenerated, use the CLAUDE.md-documented `const db = supabase as any` + file-level eslint-disable workaround.

---

### Migration (migration)

**Analog:** `supabase/migrations/20260823000001_purchase_orders.sql:35-43` — the canonical `manage_products` predicate to reuse verbatim on `storage.objects`:

```sql
CREATE POLICY purchase_orders_manage ON purchase_orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
Bucket `INSERT INTO storage.buckets` has no in-repo analog — use RESEARCH.md § "Bucket creation + RLS migration" verbatim. Note this analog file *does* carry a `-- DOWN:` comment block; post-pivot migrations generally do not (CLAUDE.md) — either is acceptable, a comment-only DOWN note costs nothing.

---

### E2E specs (test)

**Analog:** `e2e/products/product-management.spec.ts:1-55` — the fixture/helper import block and service-client cleanup pattern the new spec must copy:

```typescript
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

async function cleanupTestData(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('products').delete().eq('name', TEST_PRODUCT);
}
```
Navigation to the dialog reuses this file's existing `navigateToProductsSettingsTab()` (L38-55: `/inventory` → `getByRole('tab', { name: 'Catalog' })` → `'Products'`). Visual-regression baseline: `e2e/visual/45-visual-baseline.spec.ts` is the sole existing spec in that folder — extend or mirror it, don't invent a new convention. RLS-denial assertions use `e2e/helpers/rls-clients.ts`.

## Shared Patterns

### Result / Supabase error handling
**Source:** `src/entities/product/model/queries.ts:486-518`, `src/shared/lib/result.ts`
**Apply to:** every new hook, the resolver, the photo mutation.
Every async returns `Result<T>`; failure logs via `logger.error('<domain>.<action>_failed', { message })` and returns the `Result` unchanged, never throws.

### Toast + mutation callback
**Source:** `CatalogProductsTab.tsx:164-177` (`runUpdate`) and L353-364
**Apply to:** save, photo upload, photo remove.
```typescript
onSuccess: r => { if (!r.ok) toast.error(r.error.message); else toast.success(successMessage); }
```

### ConfirmDialog for destructive actions
**Source:** `CatalogProductsTab.tsx:410-428`
**Apply to:** remove-photo (D-12) and discard-changes (D-07). Props: `open`, `title`, `description`, `confirmLabel`, `variant="destructive"`, `isLoading`, `onConfirm`, `onCancel`.

### i18n
**Source:** `ProductForm.tsx:44` (`useTranslation('featMgmt')`), keys namespaced `manageProducts.*`, `common:actions.*` for shared verbs. `i18next/no-literal-string` is an error in `features/` — the only sanctioned escape is a scoped `// eslint-disable-next-line i18next/no-literal-string -- <reason>` for non-copy strings (`ProductForm.tsx:411`, `FileDropZone.tsx:108`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `entities/product/model/resolveProductImage.ts` (Storage half) | utility | request-response | Zero `supabase.storage` usage anywhere in `src/` — signed-URL minting/caching and `upload`/`remove` have no in-repo precedent. Use RESEARCH.md § Code Examples (signatures verified against installed `storage-js`) as the source pattern. |
| Canvas resize/re-encode + clipboard `onPaste` (inside `ProductPhotoTab.tsx`) | utility | file-I/O | No image-processing or paste-handling code exists in the repo; `FileDropZone` covers drag-and-drop only. |

## Metadata

**Analog search scope:** `src/features/manage-products/`, `src/features/agent-chat/`, `src/widgets/SettingsTabsPanel/`, `src/entities/product/model/`, `src/shared/lib/domain.ts`, `supabase/migrations/`, `e2e/products/`, `e2e/visual/`, `e2e/helpers/`
**Files scanned:** 9 read, ~6 listed
**Pattern extraction date:** 2026-09-07
