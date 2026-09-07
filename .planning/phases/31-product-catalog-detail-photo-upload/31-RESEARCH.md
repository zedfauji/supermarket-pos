# Phase 31: Product Catalog Detail & Photo Upload - Research

**Researched:** 2026-09-07
**Domain:** Supabase Storage (private bucket + signed URLs) integration into an existing React/FSD dialog; client-side image resize; RLS policy authoring
**Confidence:** HIGH (codebase findings, all read this session) / MEDIUM (Supabase Storage JS API, verified against installed package source) / LOW (none — no unverified external claims survive into the recommendations below)

## Summary

This phase has two independent halves that the plan should treat as separable workstreams: (1) reshaping `ProductForm`/`CatalogProductsTab`'s two `Dialog`s into one vertical-tabbed dialog, which is a UI refactor with zero new backend surface, and (2) wiring up Supabase Storage for the first time in this codebase, which is a genuinely new integration with no existing pattern to copy from `src/`. Both are scoped tightly by CONTEXT.md's 17 locked decisions (D-01..D-17) — this research does not revisit those, only fills in the concrete mechanics needed to execute them.

The Storage half is the higher-risk half. `@supabase/supabase-js@^2.103.0` is already installed and its `storage-js` sub-package (read directly from `node_modules` this session) exposes everything D-15/D-16 need: `upload()`, `createSignedUrl()`, `createSignedUrls()` (batch), and `remove()`, all scoped per-bucket via `supabase.storage.from(bucketId)`. Because the app only ever holds an anon-key client (CLAUDE.md forbids a service-role key in the renderer), bucket creation cannot happen via the client SDK's `createBucket()` — it must be a SQL migration (`INSERT INTO storage.buckets`), consistent with how every other schema change in this repo already ships. RLS on `storage.objects` follows the exact same `EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')` predicate already used for every other `manage_products`-gated table (verified from the live Phase 13 RLS-rewrite migration and its Phase-16 purchase_orders reuse) — this satisfies D-15's discretion note ("match however `manage_products` is already enforced ... do not invent a third pattern") exactly.

The reshape half's biggest real risk is not the tab split itself (the primitives all exist and are proven in `SettingsTabsPanel`) but two undocumented interaction conflicts inside `CatalogProductsTab` that D-04 doesn't fully resolve: the table already has inline-editable Name/Category/Price cells, and `DataTable` already supports an `onRowClick` prop that CatalogProductsTab currently leaves unused. Wiring `onRowClick` to open the dialog (D-04) will also fire when a user clicks into one of those inline-edit inputs unless those cells are also given `stopPropagation` — CONTEXT.md's decision only calls out the Edit/Delete action buttons for this treatment, not the inline cells. See Pitfall 1.

**Primary recommendation:** Ship the reshape (tab split + `onRowClick` wiring) and the Storage integration (bucket migration + RLS + resolver + upload UI) as separate plans/waves — the reshape has no dependency on Storage existing, and Storage's RLS/bucket work can be verified independently via a direct-SQL/service-role test before the Photo tab UI is built on top of it.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dialog Layout & Shape**
- **D-01:** The reshaped dialog uses a **vertical tab sidebar** — `src/shared/ui/vertical-tabs.tsx` (`VerticalTabsList` / `VerticalTabsTrigger` / `VerticalTabsGroupLabel`), the same pattern `src/widgets/SettingsTabsPanel/index.tsx` uses with `orientation="vertical"`. Rejected: a two-column no-tabs reshape, and horizontal `shared/ui/tabs.tsx` tabs.
- **D-02:** Three tabs: **Details** (name, category, base price, SKU, barcode, active) · **Photo** (the image) · **Links** (units-per-package, parent product, modifiers, suppliers).
- **D-03:** **One component serves create and edit** (carries forward Phase 28 D-10), replacing today's two separate `Dialog`s (`max-w-md` create / `max-w-2xl` edit). On create the Photo tab renders but is disabled with a "save the product first" hint; after the first successful save the dialog stays open in edit mode and the tab unlocks.
- **D-04:** **Clicking anywhere on the catalog row opens the dialog**, and the existing per-row Edit and Delete buttons both stay. Delete must stop event propagation so it never also opens the dialog.
- **D-05:** **One persistent footer** (Save / Cancel) outside the tab panels; a single Save submits the whole product across all tabs, building one `ProductUpdate` payload exactly as `ProductForm` does today — the tab split stays purely visual and introduces no new save paths. The photo is the one exception: it commits at upload time, not on Save.
- **D-06:** If Save is pressed while a field on a hidden tab is invalid, the dialog **auto-switches to the first tab holding an error** and that tab's sidebar entry shows an error badge; the field error renders through the existing `FormField` `error` prop.
- **D-07:** Closing the dialog (X, Esc, or click-outside) with unsaved edits runs a dirty check and prompts via `shared/ui/ConfirmDialog` before discarding. Switching between tabs is always free — tabs are one form, not wizard steps.
- **D-08:** Dialog is `max-w-4xl` with height capped around `80vh`; the **tab panel is the only scroll region** so the sidebar and footer stay pinned. Below the `lg` breakpoint the vertical rail collapses to a horizontal tab strip. Note: this supersedes `ProductForm`'s current `max-h-[min(70vh,560px)] overflow-y-auto` on the `<form>` element itself.

**Photo Capture & Processing**
- **D-09:** Three ways in: **OS file picker, drag-and-drop onto the photo area, and clipboard paste (Ctrl+V)**. The `agent-chat` feature's file-drop surface is worth mirroring.
- **D-10:** The file is **downscaled and re-encoded client-side before upload** — canvas resize to a max edge of ~1200px, re-encode to WebP/JPEG at ~80% quality. **One stored size only** — no thumbnail pipeline, no edge function.
- **D-11:** Accepted input formats are **JPEG, PNG, and WebP only**, with a **10 MB pre-resize cap**; anything else is rejected with a specific error naming the offending type. HEIC/HEIF explicitly rejected. The bucket's own `file_size_limit` is set tight (~2 MB) as a **server-side backstop against a bypassed client**, not as the primary check.
- **D-12:** A photo can be **removed outright** (same `manage_products` gate): Remove deletes the Storage object **and** clears the column. The empty state is a drop zone with a placeholder icon and add-a-photo copy.

**Storage Model & the Existing `image_url` Field**
- **D-13:** Add a **new `photo_url` column** (see naming note below); **keep `image_url`** as the legacy free-text escape hatch. Rejected: reusing `image_url` for uploads, and migrate-then-retire `image_url`. Reversibility: one-way (no DOWN scripts in this repo).
- **D-14:** Every consumer resolves through **one shared resolver** (e.g. `resolveProductImage(product)`): **uploaded photo wins, `image_url` is the fallback, placeholder when both are null.** The dialog, catalog table, cart items, inventory rows, PO lines, and the checkout grid all call it.
- **D-15:** The bucket is **private**; reads go through **signed URLs**. Writes (INSERT/UPDATE/DELETE) are RLS-restricted to an authenticated profile holding `manage_products`. Explicitly rejected: a public-read bucket, and any public-write configuration.
- **D-16:** Given D-15, the column stores a **stable object path**, not a URL — e.g. `products/{productId}/{uuid}.webp`. The D-14 resolver mints signed URLs on demand via `createSignedUrl` with a ~1h TTL, cached in TanStack Query keyed by path with `staleTime` below the TTL; **list surfaces use the batch `createSignedUrls` call**. Rejected: persisting a long-lived signed URL in the column, and signing only inside the dialog. **Naming note:** the column holds a path, so `photo_path` reads truer than `photo_url` — planner should pick one name and use it consistently in migration, `domain.ts`, and generated types. This research recommends `photo_path` (see Code Examples).

**What "Full Detail" Shows**
- **D-17:** The dialog shows a **compact read-only strip in its header**, above the tabs: stock on hand, low-stock threshold, and active/inactive state. `ProductSchema` already carries `quantityOnHand` and `lowStockThreshold`, so this is display-only against data the catalog query can already fetch.

### Claude's Discretion

- **Bucket name and path convention** — a single bucket (e.g. `product-photos`) with `products/{productId}/{uuid}.<ext>` object paths, per D-16.
- **Replace semantics** — on replace, write a **new** uuid-keyed object then delete the old one (rather than overwriting the same key), so a cached signed URL for the old object can't serve stale bytes; the column update and the delete happen in that order so a failed delete leaves an orphan rather than a broken reference.
- **Offline behavior** — a binary upload does not fit `tabsStore.offlineQueue` (which replays mutations, not file bodies). Default: guard the upload with `isOnline()` and block it with a clear message; text-field edits keep whatever offline behavior they have today.
- **RLS write-policy shape** — whether the `storage.objects` policy checks `profiles.role` directly or resolves through the `role_permissions` override table should match however `manage_products` is already enforced in existing RLS policies; do not invent a third pattern.
- **Catalog-table thumbnail** — whether the Catalog table row renders a small photo at all. If it does, it must use the batch signing path from D-16.
- **E2E shape** — including whether the reshaped dialog needs a new/updated visual-regression baseline in `e2e/visual/` alongside the functional specs PCAT-04 requires.
- **i18n** — new tab labels, photo copy, and error strings need `featMgmt` (and/or `common`) catalog entries in both `es-MX` and `en-US`; `i18next/no-literal-string` is an error in this layer.

### Deferred Ideas (OUT OF SCOPE)

- **Read-only Stock tab** (near-expiry date, reorder point, `stock_movements` history inside the product dialog) — rejected in D-17 as duplicating the Inventory page's Movements tab.
- **Multi-photo gallery** — PCAT-03 locks one photo per product.
- **HEIC/HEIF support** — rejected in D-11.
- **Thumbnail pipeline / server-side image processing** — rejected in D-10.
- **Retiring `image_url`** — D-13 keeps both columns.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PCAT-01 | Clicking a product opens the existing dialog, reshaped (larger, tabbed) to show/edit full detail + photo in one place | Architecture Patterns §Dialog Reshape; `DataTable`'s existing `onRowClick` prop (verified, unused today) is the wiring point |
| PCAT-02 | Every existing editable field stays editable inline, gated by unchanged `manage_products` | `ProductForm`'s field/Zod logic is reused as-is per D-05; RBAC gate unchanged (`rbac.ts` verified — `manage_products` already exists, no new action needed) |
| PCAT-03 | One photo per product, new Storage bucket, `photo_url`(→`photo_path`) column, RLS-restricted writes, replace-on-upload | Code Examples §Bucket + RLS migration, §Upload/replace flow; Package/API signatures verified against installed `@supabase/supabase-js` |
| PCAT-04 | Automated Playwright E2E: open/edit/save round-trip, photo upload/replace, RBAC denial, Phase 18 peek window unaffected | Validation Architecture; Pitfall 4 (peek window is a *separate* `imageUrl` consumer not in the D-14 resolver list — verify it explicitly, don't assume) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dialog tab layout / form fields | Frontend (features/manage-products) | — | Pure client UI, no new backend surface (D-05) |
| Client-side image resize/re-encode | Browser (Canvas API) | — | D-10 explicitly rejects a server-side/edge-function pipeline |
| Photo upload / replace / remove | Frontend (Storage client calls) + API/Backend (RLS enforcement) | Database/Storage | The client calls `supabase.storage`, but the *authorization* decision lives in Postgres RLS on `storage.objects` — client-side gating is UX only |
| Signed URL minting + caching | Frontend (TanStack Query cache) | API/Backend (Storage server signs) | Signing itself is a Storage-server operation; the app only caches the result client-side (D-16) |
| Bucket existence + RLS policies | Database/Storage (migration) | — | Bucket rows and RLS policies are Postgres/Storage schema, shipped as a forward SQL migration like every other schema change in this repo |
| `photo_path` column + resolver precedence | Database/Storage (column) + Frontend (resolver fn) | — | Column is schema; "which field wins" (D-14) is pure client logic, one function |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.103.0 (already installed — [VERIFIED: package.json:50]) | Storage client (`supabase.storage.from(bucket)`) | Already the project's sole Supabase client; Storage is a sibling namespace on the same client, no new dependency |
| Canvas API (`HTMLCanvasElement`, `canvas.toBlob`) | Native browser/WebView2/webkit2gtk API | Client-side resize/re-encode (D-10) | Native platform feature — no library needed for a single fixed-size resize; this repo has zero image-processing libraries installed today ([VERIFIED: package.json dependencies — no `image`/`compress`/`canvas`/`heic`/`sharp` match]) |

### Supporting
None — no new runtime dependency is required for this phase. `@tanstack/react-query` (already installed, v5) hosts the signed-URL cache per D-16; no new caching library needed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled canvas resize | `browser-image-compression` npm package | Not installed today; D-10 explicitly scopes this to "one stored size, no thumbnail pipeline" — a whole library is unwarranted for a single fixed-max-edge resize + `toBlob(type, quality)` call |
| `createSignedUrl` per row | `getPublicUrl` (no signing) | Only viable if the bucket were public — D-15 explicitly rejects public-read |
| SQL migration bucket creation | Client SDK `storage.createBucket()` | `createBucket()` requires elevated Storage-API permission the renderer's anon-key client does not have; CLAUDE.md forbids a service-role key in the renderer, so a migration is the only path that fits this repo's existing conventions anyway |

**Installation:** None required — everything is either already installed or a native browser API.

**Version verification:** `@supabase/supabase-js` version confirmed directly from `package.json` (^2.103.0) and its bundled `storage-js` sub-package's TypeScript source was read directly from `node_modules/@supabase/storage-js/src/packages/{StorageFileApi,StorageBucketApi}.ts` this session — this is the actual installed API surface, not training-data recollection.

## Package Legitimacy Audit

**Not applicable — this phase installs no new npm packages.** Canvas resize uses a native browser API; Storage uses the already-installed `@supabase/supabase-js`. If the planner later decides a resize/EXIF-strip library is warranted, run the Package Legitimacy Gate at that time.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  CatalogProductsTab (features/manage-products/ui)                    │
│  DataTable rows: onRowClick={p => setEditProduct(p)}  ← NEW wiring   │
│  (Edit/Delete buttons: onClick stops propagation — unchanged UX)     │
└───────────────────────────┬───────────────────────────────────────────┘
                             │ opens
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ProductDetailDialog (NEW — replaces the two existing Dialogs)       │
│  ┌─────────────┐  ┌───────────────────────────────────────────────┐ │
│  │ Vertical    │  │ Header: read-only stock/threshold/active strip │ │
│  │ tab rail    │  ├───────────────────────────────────────────────┤ │
│  │ Details     │  │ Tab panel (only scroll region, D-08)           │ │
│  │ Photo       │  │  - Details: reuses ProductForm field JSX       │ │
│  │ Links       │  │  - Photo: drop zone / paste / picker → resize  │ │
│  │             │  │  - Links: units/parent/modifiers/suppliers     │ │
│  └─────────────┘  └───────────────────────────────────────────────┘ │
│  Footer: Save / Cancel (single ProductUpdate payload, D-05)          │
└───────────────────────────┬───────────────────────────────────────────┘
                             │ Photo tab only: commits at upload time
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Client-side pipeline (Photo tab)                                    │
│  File/Blob (picker | drop | paste)                                   │
│   → validate type (jpeg/png/webp) + size (≤10MB) [D-11]              │
│   → draw to <canvas> at max edge 1200px → toBlob(webp/jpeg, 0.8)      │
│   → supabase.storage.from('product-photos').upload(newPath, blob)    │
│   → on success: update products.photo_path (versioned/plain UPDATE)  │
│   → delete old object path (if replacing) [after column update]      │
└───────────────────────────┬───────────────────────────────────────────┘
                             │ RLS-gated write
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  storage.objects (Postgres/Storage) — bucket 'product-photos'        │
│  INSERT/UPDATE/DELETE: EXISTS(role_permissions WHERE role=            │
│    get_user_role() AND action='manage_products')                      │
│  SELECT: same predicate (no anonymous/public read — D-15)             │
└───────────────────────────┬───────────────────────────────────────────┘
                             │ read path (any authenticated consumer)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  resolveProductImage(product) — shared/ or entities/product resolver │
│  photo_path set? → createSignedUrl/createSignedUrls (TanStack Query, │
│    keyed by path, staleTime < 1h TTL)                                 │
│  else image_url set? → use as-is                                     │
│  else → placeholder                                                   │
│  Consumers: dialog Photo tab, Catalog table (optional thumbnail),     │
│  entities/tab (cart), entities/inventory, entities/open-unit,         │
│  entities/purchase-order, checkout ProductGrid                        │
│  NOT wired by this phase (verify unaffected, don't touch):             │
│  widgets/ProductPeekWindow — reads product.imageUrl directly today    │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── features/manage-products/
│   ├── ui/
│   │   ├── ProductForm.tsx              # kept — field logic reused verbatim inside Details tab
│   │   ├── ProductDetailDialog.tsx       # NEW — replaces both Dialogs in CatalogProductsTab
│   │   ├── tabs/
│   │   │   ├── ProductDetailsTab.tsx     # NEW — hosts existing name/category/price/sku/barcode/active fields
│   │   │   ├── ProductPhotoTab.tsx       # NEW — drop zone, paste handler, resize, upload/replace/remove
│   │   │   └── ProductLinksTab.tsx       # NEW — units-per-package/parent/modifiers/suppliers
│   │   └── CatalogProductsTab.tsx        # modified — onRowClick wiring, renders ProductDetailDialog
│   └── model/
│       └── useProductPhotoUpload.ts      # NEW — upload/replace/remove mutation, Result<T>-wrapped
├── entities/product/
│   └── model/
│       ├── queries.ts                    # modified — select/write photo_path column
│       └── resolveProductImage.ts        # NEW — D-14 shared resolver (must be importable from entities+shared, not features)
└── shared/lib/
    └── domain.ts                         # modified — ProductSchema gains photoPath: z.string().nullable()

supabase/
└── migrations/
    └── 20260907000001_product_photos_storage.sql   # NEW — bucket + storage.objects RLS + products.photo_path column
```

**FSD boundary note (verified against `.planning`/CLAUDE.md import-direction rule):** `resolveProductImage` must live in `entities/product/` or `shared/`, not `features/manage-products/`, because `widgets/ProductGrid`, `entities/tab`, `entities/inventory`, `entities/open-unit`, and `entities/purchase-order` are all consumers per D-14, and none of them may import from `features/` (import direction is `app → pages → widgets → features → entities → shared`, lint-enforced). `entities/product/model/resolveProductImage.ts` is the correct home since every consumer is itself an `entities/*` or higher and already depends on `entities/product` for the `Product` type.

### Pattern 1: One-component create/edit dialog with a locked tab (D-03)

**What:** `ProductDetailDialog` takes an optional `initialProduct` exactly like today's `ProductForm`. On create (`initialProduct == null`), the Photo tab's `VerticalTabsTrigger` renders `disabled` with a hint tooltip; the dialog does **not** close after the first successful create — it flips into edit mode in place (store the returned/created product id in local state) so the Photo tab unlocks without a second dialog-open round-trip.

**When to use:** Any time a child resource (the photo) needs a parent id that doesn't exist yet.

**Example (state shape, not literal code):**
```typescript
// ProductDetailDialog.tsx — sketch, not exact
const [activeProduct, setActiveProduct] = useState<Product | null>(initialProduct);
const isCreateMode = activeProduct == null;

// after createMutation succeeds:
onSuccess: (created) => {
  setActiveProduct(created); // flips isCreateMode -> false, unlocks Photo tab
  // do NOT close the dialog here — that's the D-03 requirement
}
```

### Pattern 2: Vertical tabs with error-badge navigation (D-01, D-06)

**What:** `SettingsTabsPanel` (verified, `src/widgets/SettingsTabsPanel/index.tsx:143-177`) shows the exact `Tabs orientation="vertical"` + `VerticalTabsList`/`VerticalTabsTrigger` composition to copy. D-06 additionally requires: on submit, if `fieldErrors` contains a key belonging to a non-active tab, programmatically switch `Tabs`'s controlled `value` to that tab and pass a `badge` (e.g. a red dot) to that tab's `VerticalTabsTrigger`.

```tsx
// Source: src/widgets/SettingsTabsPanel/index.tsx:144-164 (verified, read this session)
<Tabs
  defaultValue={firstTab.key}
  orientation="vertical"
  className="grid w-full gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
>
  <VerticalTabsList aria-label={t('navLabel')} className="self-start lg:sticky lg:top-0">
    {groups.map(group => (
      <Fragment key={group.key}>
        <VerticalTabsGroupLabel>{t(`groups.${group.key}`)}</VerticalTabsGroupLabel>
        {group.tabs.map(tab => (
          <VerticalTabsTrigger key={tab.key} value={tab.key} icon={tab.icon} label={tab.label} />
        ))}
      </Fragment>
    ))}
  </VerticalTabsList>
  {/* ... */}
</Tabs>
```
For D-06's controlled switch, `Tabs` needs `value`/`onValueChange` (controlled) instead of `defaultValue` (uncontrolled) — `SettingsTabsPanel` uses uncontrolled `defaultValue` because it never needs to force-switch; `ProductDetailDialog` does, so this is a deliberate divergence from the copied pattern, not an oversight.

### Pattern 3: Row click open + stop-propagation for nested interactive cells (D-04)

**What:** `DataTable` already accepts `onRowClick` ([VERIFIED: `src/shared/ui/DataTable.tsx:39,204-209`] — `onRowClick?: (row: T) => void`, wired to `<TableRow onClick={() => onRowClick?.(row.original)}>`), unused today by `CatalogProductsTab`.

```tsx
// CatalogProductsTab.tsx — new wiring
<DataTable<Product>
  columns={columns}
  data={products ?? []}
  onRowClick={p => setEditProduct(p)}   // NEW
  // ...
/>
```
Every interactive cell nested inside a row (Edit button, Delete/Deactivate button, **and the existing inline Name/Category/Price editors** — see Pitfall 1) must call `e.stopPropagation()` in its own `onClick`/`onMouseDown`, or clicking into an inline-edit `Input` will also fire `onRowClick` and pop the big dialog open mid-edit.

### Anti-Patterns to Avoid
- **Persisting a signed URL instead of the object path:** D-16 explicitly rejects this — a stored signed URL degrades to a silent 403 after its TTL, and a leaked URL stays valid for its whole lifetime. Store the path; sign on read.
- **Overwriting the same object key on replace:** causes a cached signed URL (client-side TanStack Query cache, CDN edge cache, or a browser's own image cache) to keep serving the old bytes at the same signed URL until that cache entry expires. Always write a new uuid-keyed path on replace, then delete the old key (Claude's Discretion, confirmed above).
- **Skipping the bucket's own `file_size_limit`/`allowed_mime_types`:** D-11 is explicit that client-side validation is bypassable (devtools, direct API call) and the bucket-level limit is the real backstop, not a redundant nicety.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signed URL generation/expiry | A custom signing endpoint or edge function | `storage.from(bucket).createSignedUrl()`/`createSignedUrls()` (verified in installed `storage-js`) | Supabase Storage already signs URLs server-side with proper HMAC/token semantics; hand-rolling this is a security foot-gun (T-shaped access-control bugs) for zero benefit |
| Bucket-level file-type/size enforcement | App-level-only validation with no server backstop | `storage.buckets.file_size_limit` / `allowed_mime_types` columns, set at bucket-creation time | D-11 requires a server-side backstop; the bucket already has first-class support for exactly this, no custom check needed |
| RLS "does this role have this action" check | A bespoke `storage.objects` policy expression | The existing `EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')` predicate | This is the canonical, already-audited pattern used by every other `manage_products`-gated table in this codebase (Phase 13 rewrite + Phase 16 reuse, both verified) — a new/different predicate for Storage alone would be an unreviewed third pattern the codebase has explicitly moved away from |

**Key insight:** Nothing in this phase's Storage half needs a library or a custom backend endpoint — Supabase Storage's own primitives (bucket columns for limits, RLS for authorization, signed URLs for private reads) cover D-11/D-15/D-16 completely. The only genuinely new code is the client-side resize (native Canvas) and the resolver/cache wiring (plain TypeScript + TanStack Query, both already-used tools).

## Common Pitfalls

### Pitfall 1: `onRowClick` conflicts with existing inline-editable table cells
**What goes wrong:** `CatalogProductsTab`'s Name/Category/Price columns are already inline-editable (`ProductNameCell`/`ProductCategoryCell`/`ProductBasePriceCell`, verified in `CatalogProductsTab.tsx:31-114`). Wiring `onRowClick` per D-04 without also stopping propagation on these cells means clicking into any of them to make a quick inline edit will *also* pop open the full detail dialog.
**Why it happens:** D-04's CONTEXT.md decision only explicitly calls out the Edit/Delete action buttons needing `stopPropagation` — the inline-edit cells predate this phase's context and weren't in the discussion's field of view.
**How to avoid:** Add `stopPropagation` to the `onClick`/`onMouseDown` (or wrap in a `<div onClick={e => e.stopPropagation()}>`) for every interactive cell — not just Edit/Delete — before wiring `onRowClick`. Confirm with an E2E test that clicking into the inline price input does *not* also open the dialog.
**Warning signs:** E2E flake where a price-edit test intermittently also asserts a dialog is open; manual testing shows the dialog popping open every time an inline field is clicked.

### Pitfall 2: `DialogContent` has no scroll region of its own
**What goes wrong:** `ProductForm.tsx`'s own code comment (lines 239-245, verified) documents a real prior incident: `DialogContent` is `position: fixed` (verified `src/shared/ui/dialog.tsx:53-59`) with no built-in scroll container, so a `max-height` without `overflow-y-auto` lets content spill past the dialog's visual bounds with the submit button unreachable.
**Why it happens:** Radix's `Dialog.Content` doesn't scroll by default; only an element with explicit `overflow-y-auto` inside it does.
**How to avoid:** Per D-08, put `overflow-y-auto` on the **tab panel div only** (not the whole dialog, not the sidebar, not the footer) so the sidebar/footer stay pinned while tab content scrolls independently. Do not simply move today's `max-h-[min(70vh,560px)] overflow-y-auto` from the `<form>` element onto the new outer dialog wrapper — it needs to move to the inner tab-content container specifically.
**Warning signs:** Save button unreachable on a shorter viewport; sidebar scrolling along with content instead of staying pinned.

### Pitfall 3: `UrlSchema` cannot validate a Storage object path
**What goes wrong:** `UrlSchema` ([VERIFIED: `src/shared/lib/domain.ts:26-36`] — `z.string().regex(/^https?:\/\/.+/, ...)`) requires an `http(s)://` prefix and a valid `URL()` parse. Per D-16, the new column stores a bare object path like `products/{uuid}/{uuid}.webp`, which is not a URL and will always fail `UrlSchema`.
**Why it happens:** `imageUrl` (existing field) really is a URL; `photo_path` (new field) is deliberately not one — reusing the wrong existing schema is an easy copy-paste mistake.
**How to avoid:** Define a new schema for the path field, e.g. `const StoragePathSchema = z.string().min(1).max(500);` (no URL-shape constraint), and use it for the new field in `ProductSchema`/`ProductCreateSchema`/`ProductUpdateSchema`. Keep `imageUrl: UrlSchema.nullable()` unchanged.
**Warning signs:** Every product-photo upload fails Zod validation with an "Invalid URL" error the moment `ProductUpdateSchema.safeParse()` runs.

### Pitfall 4: `ProductPeekWindow` is a direct `imageUrl` consumer not in the D-14 resolver list
**What goes wrong:** `widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` renders `product.imageUrl` directly today ([VERIFIED: `ProductPeekWindow.tsx:253-254`] — `{product.imageUrl ? <img src={product.imageUrl} ... /> : ...}`). CONTEXT.md's Integration Points list (`entities/tab`, `entities/inventory`, `entities/open-unit`, `entities/purchase-order`, checkout `ProductGrid`) does not include it, and the phase boundary explicitly says the peek window is "unaffected by this phase." But if a product only has an uploaded `photo_path` and no `image_url`, the peek window will show the placeholder/no-image state even though the catalog dialog shows a real photo — a real, if scoped-as-acceptable, inconsistency.
**Why it happens:** Phase 18 (peek window) and Phase 31 were scoped independently; the peek window's own `imageUrl`-only render predates this phase.
**How to avoid:** Do not silently "fix" this by wiring the resolver into `ProductPeekWindow` — that would violate the explicit phase boundary ("this phase must leave it working and prove that in E2E"). Instead: (a) leave `ProductPeekWindow` untouched, (b) write the required PCAT-04 E2E assertion proving the peek window still renders/functions correctly for a product with only `image_url` set, and (c) file this inconsistency as a documented gap/follow-up (e.g. in STATE.md's Deferred Items) rather than silently absorbing it into this phase's scope.
**Warning signs:** A future bug report "product photo doesn't show on the barcode-scan peek window" — this is expected/scoped behavior for this phase, not a regression, provided it's documented.

### Pitfall 5: HEIC files fail silently (or with a cryptic error) on `<canvas>`
**What goes wrong:** D-11 requires rejecting HEIC/HEIF with a specific, named error — but browsers (including WebView2/webkit2gtk, this app's two runtime targets) cannot decode HEIC into an `<img>`/`<canvas>` at all without a decoder library. If the file-type check only inspects the `File.type` MIME string, a mislabeled or extension-spoofed HEIC file will pass the check and then fail opaquely inside the canvas-draw step.
**Why it happens:** `File.type` is browser-inferred from extension/magic bytes inconsistently across platforms; a `.heic` file sometimes reports `image/heic`, sometimes empty string, depending on OS file-association metadata.
**How to avoid:** Validate both `File.type` (fast path) **and** attempt the image decode (`new Image()`/`createImageBitmap()`) inside a try/catch before the canvas-resize step, surfacing D-11's "specific error naming the offending type" from whichever check actually catches it. Don't assume MIME-string checking alone is sufficient given D-11's explicit "browsers can't decode it on canvas" framing.
**Warning signs:** A user reports "upload just spins forever" or a generic unhandled-promise-rejection in the console for a `.heic` file that passed the initial type check.

### Pitfall 6: Offline guard must wrap the whole upload+column-update sequence, not just the network call
**What goes wrong:** `isOnline()` ([VERIFIED: `src/shared/lib/connectivity.ts:7-9`] — reads `navigator.onLine`) is a point-in-time check. If connectivity drops between the `storage.upload()` call succeeding and the `products.photo_path` column UPDATE, the object exists in Storage but the product row never points to it — an orphan, and (worse) if it drops between the *new* upload succeeding and the *old* object's delete, you get an orphaned old object, which the Claude's-Discretion ordering (column-update-then-delete) already anticipates and accepts as the safer failure mode.
**Why it happens:** A single `isOnline()` check before starting the sequence doesn't protect against a mid-sequence disconnect; Tauri's WebView network detection also has known latency between actual link-down and `navigator.onLine` flipping.
**How to avoid:** Gate the *start* of the upload flow on `isOnline()` (per Claude's Discretion — good enough to block obviously-offline attempts), but also treat the upload+update+delete sequence as a single logical operation whose partial-failure states (upload ok / column-update failed; column-update ok / old-delete failed) are both handled explicitly with a `Result<T>`-returning function and a specific, distinguishable error/toast for each — don't let a mid-sequence network drop silently leave the UI in the pre-upload state while Storage now has an orphaned object.
**Warning signs:** Storage bucket usage grows without a matching count of populated `photo_path` values; a "photo didn't save" report where the object actually is present in Storage.

## Code Examples

### Bucket creation + RLS migration (SQL)

```sql
-- Source: pattern verified against this repo's own Phase 13 RLS rewrite
-- (supabase/migrations/20260510000001_rls_rewrite_phase13.sql:432-446, read this
-- session) and Phase 16's reuse of the identical predicate
-- (supabase/migrations/20260823000001_purchase_orders.sql:39-43, read this session).
-- Bucket-column names (id, name, public, file_size_limit, allowed_mime_types) verified
-- against the installed @supabase/supabase-js's storage-js source
-- (node_modules/@supabase/storage-js/src/packages/StorageBucketApi.ts:213-216 — the
-- client SDK's createBucket() maps its camelCase options to exactly these snake_case
-- DB columns).

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  false,                              -- D-15: private bucket
  2097152,                            -- ~2MB backstop, bytes (D-11)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS photo_path text;   -- nullable; see Pitfall 3 re: not a UrlSchema value

CREATE POLICY "product_photos_select_manage_products" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')
  );

CREATE POLICY "product_photos_insert_manage_products" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')
  );

CREATE POLICY "product_photos_update_manage_products" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')
  )
  WITH CHECK (
    bucket_id = 'product-photos'
    AND EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')
  );

CREATE POLICY "product_photos_delete_manage_products" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')
  );

COMMIT;
-- No DOWN script — matches every migration after the Phase-1 pivot (CLAUDE.md convention).
```

**Note on `SELECT` policy scope:** granting `SELECT` on `storage.objects` to every authenticated role holding `manage_products` (manager/admin) — not to cashiers — matches D-15's "reads go through signed URLs" plus the same-gate-as-writes framing. If the plan wants cashier-facing surfaces (checkout `ProductGrid`, cart) to actually render photos too, the `SELECT` policy needs `TO authenticated USING (bucket_id = 'product-photos')` with no role predicate (any authenticated staff can *view* a photo; only `manage_products` holders can write it) — **this is a real open decision the planner must make explicitly**, since D-15's own wording ("Writes ... are RLS-restricted to staff holding `manage_products`") only speaks to writes, and PROMO/checkout-facing photo display would break under the manage_products-gated-SELECT variant above for a cashier-only terminal. See Open Questions.

### Upload / replace flow (TypeScript)

```typescript
// Source: method signatures verified directly from installed package source —
// node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:200-215 (upload),
// :631-648 (createSignedUrl), :733-753 (createSignedUrls), :1081-1090 (remove).
import { supabase } from '@shared/lib/supabase';
import { err, ok, type Result, supabaseError, unknownError } from '@shared/lib/result';

const BUCKET = 'product-photos';

async function uploadProductPhoto(
  productId: string,
  blob: Blob,
  ext: 'webp' | 'jpg'
): Promise<Result<{ path: string }>> {
  const path = `products/${productId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg',
    upsert: false, // always a new key per Claude's Discretion — never overwrite
  });
  if (error) return err(supabaseError(error.message, undefined, error));
  if (!data) return err(unknownError());
  return ok({ path: data.path });
}

async function deleteProductPhotoObject(path: string): Promise<Result<void>> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return err(supabaseError(error.message, undefined, error));
  return ok(undefined);
}
```

### Batch signed-URL resolver (D-14/D-16)

```typescript
// entities/product/model/resolveProductImage.ts — sketch
// createSignedUrls signature verified: (paths: string[], expiresIn: number) =>
// Promise<{ data: { error: string | null; path: string | null; signedUrl: string }[] } | { error }>
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h, per D-16
const SIGNED_URL_STALE_TIME_MS = 45 * 60 * 1000; // re-sign before the 1h TTL expires

// Single-product resolve (dialog Photo tab):
async function resolveOne(photoPath: string | null, imageUrl: string | null): Promise<string | null> {
  if (photoPath) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(photoPath, SIGNED_URL_TTL_SECONDS);
    if (data) return data.signedUrl;
  }
  return imageUrl ?? null; // D-14 fallback order: photo wins, then image_url, then null (placeholder)
}

// List resolve (Catalog table / ProductGrid) — ONE batched call, not N:
async function resolveMany(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && !row.error) map.set(row.path, row.signedUrl);
  }
  return map;
}
```

## State of the Art

No "old approach → new approach" drift applies here — this is a greenfield integration in this codebase (zero prior `supabase.storage` usage anywhere in `src/`, confirmed via a full-repo grep this session). The Supabase Storage JS API surface used above (`upload`/`createSignedUrl`/`createSignedUrls`/`remove`) is the current, stable API in the installed `^2.103.0` — no deprecated methods appear in the installed source.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `photo_path` (not `photo_url`) is the recommended column/field name | User Constraints (D-16 naming note), Code Examples | Low — D-16 explicitly leaves this to the planner; either name works as long as it's applied consistently across migration/`domain.ts`/generated types. Purely cosmetic if the planner picks `photo_url` instead. |
| A2 | The next migration filename should be dated `20260907...` (today) | Code Examples | Low — cosmetic; Supabase migrations only need to sort after `20260904000002`, any later timestamp works |
| A3 | Remote Supabase project's `product-photos` bucket does not already exist (no leftover from a prior spike/exploration) | Environment Availability | Medium — if a bucket with this name already exists remotely with different settings (public, wrong mime types), the `INSERT ... ON CONFLICT DO NOTHING` migration will silently no-op instead of configuring it as this phase needs; the executor must verify via the Supabase dashboard/CLI before assuming the migration alone is sufficient (see Environment Availability) |
| A4 | Cashier-role staff need read access to product photos on cashier-facing surfaces (checkout `ProductGrid`, cart) | Code Examples (SELECT policy note), Open Questions | Medium — if the plan restricts `SELECT` on `storage.objects` to `manage_products` holders only (mirroring the write gate), cashier-facing photo display would silently fail to resolve signed URLs (empty/placeholder) for the checkout grid consumer that D-14 explicitly lists |

## Open Questions

1. **Should the `storage.objects` SELECT policy be gated by `manage_products`, or open to any authenticated staff?**
   - What we know: D-15 explicitly scopes only *writes* to `manage_products` holders ("storage writes are restricted by RLS to staff holding `manage_products`" — PCAT-03 verbatim). D-14 lists checkout `ProductGrid` and cart (`entities/tab`) as resolver consumers, both of which render to cashiers, not just managers/admins.
   - What's unclear: Whether a cashier should be able to *view* a product photo (clearly yes, if it's shown at checkout) even though they cannot upload/replace/remove one.
   - Recommendation: Gate `SELECT` on `storage.objects` to `bucket_id = 'product-photos'` for any `authenticated` role (no `manage_products` predicate on SELECT), keep the `manage_products` predicate only on INSERT/UPDATE/DELETE. This is the interpretation consistent with D-14's consumer list; flag it for explicit confirmation in discuss-phase/plan review since CONTEXT.md's D-15 wording is technically silent on reads-by-non-managers.

2. **Does the remote Supabase project already have a Storage bucket from a prior exploration/spike?**
   - What we know: Local `supabase/config.toml`'s `[storage]` section has no bucket declared (only a commented-out example), and a full-repo grep found zero `supabase.storage` call sites — the *code* side is confirmed greenfield.
   - What's unclear: The remote project's actual Storage state was not directly queryable in this research session (no live Supabase MCP/CLI access was available to this researcher agent) — CONTEXT.md's own note ("Supabase Storage IS configured at the project-infrastructure level already") suggests something may already exist there, possibly unrelated to this phase.
   - Recommendation: Before running the bucket-creation migration against the remote project, the executor should run `supabase storage list-buckets` (or check the Studio dashboard) to confirm no `product-photos` bucket already exists with conflicting settings; if one does, reconcile via `UPDATE storage.buckets SET ...` in the migration instead of a bare `INSERT`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/supabase-js` (storage-js) | Upload/signed-URL/remove calls | ✓ | ^2.103.0 [VERIFIED: package.json:50] | — |
| Local Supabase Storage service | Local dev testing of upload/RLS | ✓ (config.toml `[storage] enabled = true`) | — | — |
| Remote Supabase project Storage | Production bucket/RLS | Not directly verifiable this session (no live remote DB access from this researcher agent) | — | Executor must confirm via `supabase storage list-buckets` or Studio dashboard before assuming the migration alone configures it correctly (see Open Question 2) |
| Canvas API (`HTMLCanvasElement`) | Client-side resize | ✓ — native to Chromium (agent-browser/Playwright), WebView2, and webkit2gtk, all of which this app already targets | — | — |
| Clipboard paste event (`ClipboardEvent.clipboardData`) | D-09 paste-to-upload | ✓ — standard DOM API, supported in both Tauri runtime targets | — | — |

**Missing dependencies with no fallback:** None — everything needed is either already installed or a native platform API.

**Missing dependencies with fallback:** Remote bucket state unverified this session; fallback is a pre-migration manual check (Open Question 2).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright v1.59 [VERIFIED: CLAUDE.md's stated stack table] |
| Config file | `supermarket-pos/playwright.config.ts` |
| Quick run command | `npx playwright test e2e/products/product-management.spec.ts` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PCAT-01 | Row click opens reshaped dialog; existing Edit button still opens it too | e2e | `npx playwright test e2e/products/product-management.spec.ts` | ❌ Wave 0 — new dialog-open assertions needed |
| PCAT-02 | Every existing field still editable/saveable; cashier denied `manage_products` | e2e | `npx playwright test e2e/products/product-management.spec.ts` | ✅ base RBAC-denial coverage exists (`product-management.spec.ts` already asserts cashier gating) — extend, don't replace |
| PCAT-03 | Upload/replace/remove photo; RLS denies a non-`manage_products` write | e2e | `npx playwright test e2e/products/product-photo-upload.spec.ts` (new file) | ❌ Wave 0 — new spec file |
| PCAT-04 | Full round-trip + peek-window-unaffected proof | e2e | `npx playwright test e2e/products/ e2e/checkout/` (peek window lives under a different existing spec — locate via `graphify query "peek window"` or grep for `ProductPeekWindow` spec references) | ❌ Wave 0 — cross-spec proof needed |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/products/`
- **Per wave merge:** `npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/products/product-photo-upload.spec.ts` — covers PCAT-03 (upload, replace writes new key + deletes old, remove clears both column and object, RLS-denial for a cashier attempting a direct Storage API call)
- [ ] Extend `e2e/products/product-management.spec.ts` — covers PCAT-01/02 (row-click open, tab navigation, D-06 error-tab auto-switch, D-07 dirty-close confirm)
- [ ] A locate-and-extend pass on whatever spec currently covers `ProductPeekWindow` (likely under `e2e/checkout/` per this repo's folder-by-subsystem convention) — covers PCAT-04's "peek window unaffected" proof
- [ ] Framework install: none — Playwright is already fully configured in this repo

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged — this phase adds no new auth surface |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | `storage.objects` RLS policies keyed on `role_permissions`/`get_user_role()`, mirroring every other `manage_products`-gated table (see Code Examples) |
| V5 Input Validation | yes | Client-side file-type/size validation (D-11) backstopped by bucket-level `file_size_limit`/`allowed_mime_types` (server-enforced, cannot be bypassed by a direct API call) |
| V6 Cryptography | no | Signed-URL token generation is entirely Supabase Storage-server-side; no custom crypto in app code |
| V12 File and Resource Handling (ASVS 4.0 grouping) | yes | Private bucket + signed URLs (no public write, no public read) is the standard mitigation for unrestricted file upload/arbitrary file read |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unrestricted file upload (arbitrary type/size, path traversal via filename) | Tampering, Elevation of Privilege | Bucket `allowed_mime_types`/`file_size_limit` (server-enforced) + app-generated `path` (never user-supplied filename used as the storage key — the code examples above always mint `products/{productId}/{uuid}.{ext}`, never trust `file.name`) |
| Broken object-level access control (any authenticated user reading/writing any bucket path) | Elevation of Privilege, Information Disclosure | RLS on `storage.objects` scoped by `bucket_id` + `role_permissions` predicate (Code Examples) — never a bucket-wide `USING (true)` write policy |
| Stale/leaked signed URL reused after content changes | Information Disclosure | Replace-with-new-key-then-delete-old (Claude's Discretion) ensures an old cached/leaked signed URL 404s against a deleted object rather than serving updated-but-different content under a URL a user thought they'd revoked access to by replacing the photo |
| Client-side-only validation bypass (devtools direct `fetch`/`storage.upload()` call with a spoofed `contentType`) | Tampering | Server-side bucket `allowed_mime_types` backstop (D-11) — the actual Storage-server upload endpoint enforces this regardless of what the client claims |

## Sources

### Primary (HIGH confidence — read directly this session)
- `D:/Projects/Code/supermarket-pos/.planning/phases/31-product-catalog-detail-photo-upload/31-CONTEXT.md` — all 17 locked decisions
- `D:/Projects/Code/supermarket-pos/.planning/REQUIREMENTS.md` lines 275-289 — PCAT-01..04 verbatim
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/ProductForm.tsx` — full file, current field/validation logic
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/ui/CatalogProductsTab.tsx` — full file, current dialog/table wiring
- `D:/Projects/Code/supermarket-pos/src/shared/ui/vertical-tabs.tsx`, `src/widgets/SettingsTabsPanel/index.tsx` — vertical-tab pattern
- `D:/Projects/Code/supermarket-pos/src/shared/ui/dialog.tsx`, `src/shared/ui/ConfirmDialog.tsx`, `src/shared/ui/DataTable.tsx` — dialog/confirm/table primitives
- `D:/Projects/Code/supermarket-pos/src/shared/lib/domain.ts` lines 229-281 — `ProductSchema`/`ProductCreateSchema`/`ProductUpdateSchema`
- `D:/Projects/Code/supermarket-pos/src/shared/lib/result.ts`, `src/shared/lib/connectivity.ts` — `Result<T>`/`isOnline()` conventions (note: actual file is `connectivity.ts`, not `network.ts` as CLAUDE.md/CONTEXT.md refer to it — same exported `isOnline` function, just a differently-named file; flagged so the planner doesn't waste time looking for a nonexistent `network.ts`)
- `D:/Projects/Code/supermarket-pos/src/shared/lib/rbac.ts` — confirms `manage_products` already exists, no new RBAC action needed
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260510000001_rls_rewrite_phase13.sql`, `20260823000001_purchase_orders.sql` — canonical `manage_products` RLS predicate
- `D:/Projects/Code/supermarket-pos/supabase/config.toml` lines 114-153 — confirms local Storage enabled, no bucket pre-declared
- `D:/Projects/Code/supermarket-pos/node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts` and `StorageBucketApi.ts` — actual installed API signatures for `upload`/`createSignedUrl`/`createSignedUrls`/`remove`/`createBucket`
- `D:/Projects/Code/supermarket-pos/src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` — confirms direct `imageUrl` consumption, not in D-14's listed consumer set
- `D:/Projects/Code/supermarket-pos/src/features/agent-chat/ui/FileDropZone.tsx` — drag/drop precedent to mirror per D-09
- Full-repo grep for `supabase.storage`/`createBucket`/`createSignedUrl` — zero matches, confirms greenfield claim

### Secondary (MEDIUM confidence — official docs, referenced not directly quoted)
- Supabase Storage Access Control guide (`supabase.com/docs/guides/storage/security/access-control`) — `storage.foldername()`/RLS policy shape (used to confirm the general pattern; this project's own migrations were the actual source of the exact predicate used)
- Supabase Storage Buckets Fundamentals guide (`supabase.com/docs/guides/storage/buckets/fundamentals`)

### Tertiary (LOW confidence — community sources, corroborated by primary source above)
- GitHub Discussions on `createSignedUrls` batch behavior and bucket-creation-via-migration pattern (used only to confirm community consensus; the actual method signature used in Code Examples comes from the installed package source, not these threads)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency; existing package version and its exact API confirmed from installed source, not documentation guesswork
- Architecture (dialog reshape): HIGH — every primitive (vertical-tabs, DataTable onRowClick, ConfirmDialog, DialogContent scroll behavior) read directly from source this session
- Architecture (Storage/RLS): HIGH for the RLS predicate shape (copied verbatim from this repo's own migrations) / MEDIUM for exact bucket-column SQL shape (corroborated by installed package source + community docs, not a Supabase-hosted-project live test)
- Pitfalls: HIGH — all 6 pitfalls derive from code actually read this session (inline-edit cells, DialogContent scroll, UrlSchema regex, ProductPeekWindow's direct imageUrl use, HEIC/canvas limitation is a well-known browser constraint, offline-sequence partial-failure is a straightforward reasoning-through of the stated upload/delete ordering)

**Research date:** 2026-09-07
**Valid until:** 30 days (stable stack; the only fast-moving risk is Open Question 2 — remote bucket state — which is time-sensitive to whenever the executor actually runs the migration, not to this research's age)
