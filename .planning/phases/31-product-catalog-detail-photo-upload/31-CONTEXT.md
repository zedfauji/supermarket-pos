# Phase 31: Product Catalog Detail & Photo Upload - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Clicking a product in Inventory → Catalog opens the **existing** product add/edit dialog, reshaped
into a larger tabbed view+edit+photo layout, and a product can carry **one** photo stored in
Supabase Storage (not a base64/client-local data URL). Admin-side only.

**In scope:** the reshaped product dialog (`ProductForm` + its two host `Dialog`s in
`CatalogProductsTab`), a new Supabase Storage bucket with RLS-gated writes, a new `photo_url`
column on `products`, a shared image resolver consumed by existing product-image call sites, and
Playwright E2E covering open/edit/save round-trip, photo upload/replace/remove, and RBAC denial.

**Out of scope:** Phase 18's barcode-scan peek window at `/pos` (separate Tauri window, separate
code path — this phase must leave it working and prove that in E2E); brand and pack-weight fields
(Phase 32, which extends this same dialog); store name/logo branding (Phase 33, which reuses this
phase's upload pattern but not its code); multi-photo galleries; server-side image processing.

</domain>

<decisions>
## Implementation Decisions

### Dialog Layout & Shape

- **D-01:** The reshaped dialog uses a **vertical tab sidebar** — `src/shared/ui/vertical-tabs.tsx`
  (`VerticalTabsList` / `VerticalTabsTrigger` / `VerticalTabsGroupLabel`), the same pattern
  `src/widgets/SettingsTabsPanel/index.tsx` uses with `orientation="vertical"`. Rejected: a
  two-column no-tabs reshape, and horizontal `shared/ui/tabs.tsx` tabs.
- **D-02:** Three tabs: **Details** (name, category, base price, SKU, barcode, active) · **Photo**
  (the image) · **Links** (units-per-package, parent product, modifiers, suppliers). Rationale:
  everyday-edit fields on one screen, rarely-touched relational fields quarantined, and an obvious
  slot in Details for Phase 32's brand/pack-weight fields.
- **D-03:** **One component serves create and edit** (carries forward Phase 28 D-10), replacing
  today's two separate `Dialog`s (`max-w-md` create / `max-w-2xl` edit). On create the Photo tab
  renders but is disabled with a "save the product first" hint; after the first successful save the
  dialog stays open in edit mode and the tab unlocks. Rationale: a photo's storage path needs a real
  product id — this avoids temp-id paths, post-save moves, and orphaned objects from abandoned
  creates.
- **D-04:** **Clicking anywhere on the catalog row opens the dialog**, and the existing per-row Edit
  and Delete buttons both stay. Delete must stop event propagation so it never also opens the
  dialog. Rationale: zero regression risk for existing muscle memory and existing E2E selectors.
- **D-05:** **One persistent footer** (Save / Cancel) outside the tab panels; a single Save submits
  the whole product across all tabs, building one `ProductUpdate` payload exactly as `ProductForm`
  does today — the tab split stays purely visual and introduces no new save paths. The photo is the
  one exception: it commits at upload time, not on Save.
- **D-06:** If Save is pressed while a field on a hidden tab is invalid, the dialog **auto-switches
  to the first tab holding an error** and that tab's sidebar entry shows an error badge; the field
  error renders through the existing `FormField` `error` prop. Rationale: `ProductForm` already
  documents two separate incidents of silent, invisible validation failures (`categoryId` at
  L71-90, `stock_threshold` at L151-163) — a tab split makes that failure mode worse unless the
  error is navigated to.
- **D-07:** Closing the dialog (X, Esc, or click-outside) with unsaved edits runs a dirty check and
  prompts via `shared/ui/ConfirmDialog` (already used in `CatalogProductsTab` for delete) before
  discarding. Switching between tabs is always free — tabs are one form, not wizard steps.
- **D-08:** Dialog is `max-w-4xl` with height capped around `80vh`; the **tab panel is the only
  scroll region** so the sidebar and footer stay pinned. Below the `lg` breakpoint the vertical rail
  collapses to a horizontal tab strip — `SettingsTabsPanel` already implements this responsive
  collapse. Note: this supersedes `ProductForm`'s current
  `max-h-[min(70vh,560px)] overflow-y-auto` on the `<form>` element itself.

### Photo Capture & Processing

- **D-09:** Three ways in: **OS file picker, drag-and-drop onto the photo area, and clipboard paste
  (Ctrl+V)**. The `agent-chat` feature already implements a file-drop surface worth mirroring.
- **D-10:** The file is **downscaled and re-encoded client-side before upload** — canvas resize to a
  max edge of ~1200px, re-encode to WebP/JPEG at ~80% quality. **One stored size only** — no
  thumbnail pipeline, no edge function; the catalog table and the dialog render the same object.
- **D-11:** Accepted input formats are **JPEG, PNG, and WebP only**, with a **10 MB pre-resize
  cap**; anything else is rejected with a specific error naming the offending type (not a generic
  failure). HEIC/HEIF explicitly rejected — browsers can't decode it on canvas without a decoder
  library or a server-side convert step. The bucket's own `file_size_limit` is set tight (~2 MB,
  comfortably above the post-resize object) as a **server-side backstop against a bypassed client**,
  not as the primary check.
- **D-12:** A photo can be **removed outright** (same `manage_products` gate): Remove deletes the
  Storage object **and** clears the column. The empty state is a drop zone with a placeholder icon
  and add-a-photo copy. Rationale: PCAT-03 only mandates replace-on-upload, but a wrong photo with
  no way back to "no photo" is a dead end, and reference-only clearing accumulates orphaned objects
  nobody cleans up.

### Storage Model & the Existing `image_url` Field

**Scouting correction the exploration note missed:** `products.image_url` already exists — a
free-text URL `Input` at `src/features/manage-products/ui/ProductForm.tsx:360-372`, `UrlSchema.nullable()`
in `ProductSchema`, `image_url` in `supabase.types.ts`, and read today by the tab, inventory,
open-unit, and purchase-order queries. So the new column is a deliberate choice, not a greenfield add.

- **D-13:** Add a **new `photo_url` column**; **keep `image_url`** as the legacy free-text escape
  hatch. Rejected: reusing `image_url` for uploads (would have been free for existing consumers but
  conflates managed uploads with arbitrary URLs), and migrate-then-retire `image_url`.
  — **Reversibility:** one-way — adding the column is a forward migration and this repo has no DOWN
  scripts (CLAUDE.md convention); collapsing the two fields later means another forward migration
  plus touching every read site.
- **D-14:** Every consumer resolves through **one shared resolver** (e.g.
  `resolveProductImage(product)`): **uploaded photo wins, `image_url` is the fallback, placeholder
  when both are null.** The dialog, catalog table, cart items, inventory rows, PO lines, and the
  checkout grid all call it — "which field wins" is answered in exactly one place.
  — **Reversibility:** reversible — a single shared function; changing precedence is a one-file edit.
- **D-15:** The bucket is **private**; reads go through **signed URLs**. Writes
  (INSERT/UPDATE/DELETE) are RLS-restricted to an authenticated profile holding `manage_products`,
  per PCAT-03. Explicitly rejected: a public-read bucket (simpler and permanent-URL friendly, but
  the user chose to gate reads too), and any public-write configuration.
  — **Reversibility:** costly — flipping to public read later is a bucket setting plus removing the
  signing layer from the resolver and every cached list, but the stored object paths stay valid.
- **D-16:** Given D-15, the column stores a **stable object path**, not a URL — e.g.
  `products/{productId}/{uuid}.webp`. The D-14 resolver mints signed URLs on demand via
  `createSignedUrl` with a ~1h TTL, cached in TanStack Query keyed by path with `staleTime` below
  the TTL so it re-signs before expiry; **list surfaces use the batch `createSignedUrls` call** so a
  200-row catalog is one request, not 200. Rejected: persisting a long-lived signed URL in the
  column (silently 403s on expiry, and a leaked URL stays valid for its full lifetime), and
  signing only inside the dialog (would leave the catalog table and cart imageless, walking back
  D-14). **Naming note the user raised implicitly by picking this option:** the column holds a path,
  so `photo_path` reads truer than `photo_url` — planner should pick one name and use it
  consistently in migration, `domain.ts`, and generated types.
  — **Reversibility:** one-way for the stored value shape — switching between "path" and "URL"
  semantics later requires a data migration over every populated row.

### What "Full Detail" Shows

- **D-17:** The dialog shows a **compact read-only strip in its header**, above the tabs: stock on
  hand, low-stock threshold, and active/inactive state. `ProductSchema` already carries
  `quantityOnHand` and `lowStockThreshold` (joined from `inventory`, `src/shared/lib/domain.ts`), so
  this is display-only against data the catalog query can already fetch. Rejected: a fourth
  read-only Stock tab with expiry and `stock_movements` history — that duplicates the Inventory
  page's own Movements tab and pulls new queries into this phase.

### Claude's Discretion

The user chose "ready for context" over exploring these; researcher and planner decide, using these
defaults unless research contradicts them:

- **Bucket name and path convention** — a single bucket (e.g. `product-photos`) with
  `products/{productId}/{uuid}.<ext>` object paths, per D-16.
- **Replace semantics** — on replace, write a **new** uuid-keyed object then delete the old one
  (rather than overwriting the same key), so a cached signed URL for the old object can't serve
  stale bytes; the column update and the delete happen in that order so a failed delete leaves an
  orphan rather than a broken reference.
- **Offline behavior** — a binary upload does not fit `tabsStore.offlineQueue` (which replays
  mutations, not file bodies). Default: guard the upload with `isOnline()` from `@shared/lib/network`
  and block it with a clear message; text-field edits keep whatever offline behavior they have today.
- **RLS write-policy shape** — whether the `storage.objects` policy checks `profiles.role` directly
  or resolves through the `role_permissions` override table should match however `manage_products`
  is already enforced in existing RLS policies; do not invent a third pattern.
- **Catalog-table thumbnail** — whether the Catalog table row renders a small photo at all. If it
  does, it must use the batch signing path from D-16.
- **E2E shape** — including whether the reshaped dialog needs a new/updated visual-regression
  baseline in `e2e/visual/` alongside the functional specs PCAT-04 requires.
- **i18n** — new tab labels, photo copy, and error strings need `featMgmt` (and/or `common`)
  catalog entries in both `es-MX` and `en-US`; `i18next/no-literal-string` is an error in this layer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase intent & requirements
- `.planning/ROADMAP.md` § "Phase 31: Product Catalog Detail & Photo Upload" — goal, dependencies,
  and the explicit distinction from Phase 18's barcode-scan peek window.
- `.planning/REQUIREMENTS.md` lines 286-289 — PCAT-01..04 verbatim (the acceptance contract).
- `.planning/notes/product-catalog-branding-decisions.md` — the `/gsd-explore` decision record for
  Phases 31-33: dialog shape, one-photo/replace-on-upload, Storage-not-base64, and why Phase 33's
  branding fields are new rather than a reuse of receipt settings. **Note:** its "no supabase.storage
  usage in src/" finding still holds, but its assumption that `products` has no image field does
  not — see D-13.

### Code this phase reshapes
- `src/features/manage-products/ui/ProductForm.tsx` — the 476-line flat form being reshaped;
  read L71-90 and L151-163 for the two documented silent-validation-failure incidents that motivate D-06.
- `src/features/manage-products/ui/CatalogProductsTab.tsx` L339-408 — the two host `Dialog`s
  (create `max-w-md`, edit `max-w-2xl`) collapsing into one per D-03, plus the row/action wiring for D-04.
- `src/shared/lib/domain.ts` — `ProductSchema` / `ProductCreateSchema` / `ProductUpdateSchema`
  (`imageUrl`, `quantityOnHand`, `lowStockThreshold`); the single source of truth the new column must extend.

### Patterns to follow
- `src/shared/ui/vertical-tabs.tsx` + `src/widgets/SettingsTabsPanel/index.tsx` (L146-164) — the
  vertical-tab sidebar and its responsive collapse (D-01, D-08).
- `src/shared/ui/ConfirmDialog.tsx` — discard-confirmation primitive (D-07).
- `src/shared/lib/result.ts` (`Result`, `supabaseQuery`, `supabaseMutation`) and
  `src/shared/lib/network.ts` (`isOnline`) — mandatory error/offline conventions.
- `.planning/codebase/CONVENTIONS.md` — naming, FSD boundaries, `exactOptionalPropertyTypes`,
  Zod-first typing, i18n literal-string enforcement.
- `CLAUDE.md` § "Testing & Verification Policy" — automated Playwright only; `human_needed` is not a
  valid terminal state for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProductForm.tsx` — every field, Zod parse path, and error-flattening logic is reusable as-is; the
  work is re-hosting it in tab panels, not rewriting the form logic.
- `shared/ui/vertical-tabs.tsx`, `shared/ui/dialog.tsx`, `shared/ui/ConfirmDialog.tsx`,
  `shared/ui/FormField.tsx`, `shared/ui/ScrollArea.tsx`, `POSButton` — all primitives this phase needs already exist.
- `SettingsTabsPanel` — a working reference implementation of vertical tabs + responsive collapse.
- The `agent-chat` feature's file-drop surface — closest existing precedent for D-09's drop zone.

### Established Patterns
- FSD import direction is lint-enforced; the dialog lives in `features/manage-products/ui/`, so any
  shared image resolver (D-14) must sit in `shared/` or `entities/product/` to be legally importable
  by widgets and entities alike.
- All async work returns `Result<T>`; Supabase calls go through `supabaseQuery`/`supabaseMutation`.
  Storage calls are **new territory** — there is no existing `supabase.storage` usage anywhere in
  `src/`, so the Result-wrapping convention has to be extended to Storage responses.
- Server state is TanStack Query; the signed-URL cache in D-16 belongs there, not in a Zustand store.
- `exactOptionalPropertyTypes` is on — the new column's field must be declared
  `photoUrl: string | null`, never `photoUrl?: string`.

### Integration Points
- `products` table + a new Storage bucket + its RLS policies (one forward migration; no DOWN script,
  per repo convention).
- `src/shared/lib/supabase.types.ts` must be regenerated after the migration; until then the
  documented `const db = supabase as any` + file-level eslint-disable workaround applies.
- Existing image consumers to route through the D-14 resolver: `entities/tab` (cart items),
  `entities/inventory`, `entities/open-unit`, `entities/purchase-order`, and the checkout `ProductGrid`.
- `e2e/products/` is the home for the new functional specs; `e2e/visual/` holds the route × role
  visual baseline that a dialog reshape may invalidate.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wanted the **SettingsTabsPanel look** for this dialog — a sidebar rail, not
  tabs across the top.
- Clipboard paste was chosen over the recommended picker+drop pair — the user wants to screenshot or
  copy a supplier image and paste it straight in, so paste is a first-class input, not a nice-to-have.
- The user chose a **private bucket with signed URLs over the simpler public-read option**, and a
  **separate `photo_url` column over reusing `image_url`** — both times taking the stricter,
  more-isolated option over the cheaper one. Plan accordingly: don't "simplify" either back during
  execution.
- Existing Edit/Delete row buttons were deliberately **kept** rather than cleaned up, to avoid
  breaking existing E2E selectors and operator habits.

</specifics>

<deferred>
## Deferred Ideas

- **Read-only Stock tab** (near-expiry date, reorder point, `stock_movements` history inside the
  product dialog) — rejected in D-17 as duplicating the Inventory page's Movements tab. Revisit only
  if operators actually ask for it.
- **Multi-photo gallery** — PCAT-03 locks one photo per product; a gallery would be its own phase
  (ordering, multi-delete, primary-photo selection, different RLS shape).
- **HEIC/HEIF support** — rejected in D-11; would need a decoder library or a server-side convert
  step. Revisit if the store starts sourcing photos directly from an iPhone.
- **Thumbnail pipeline / server-side image processing** — rejected in D-10 in favor of one
  client-resized size. Revisit if the catalog grows large enough that table rendering suffers.
- **Retiring `image_url`** — D-13 keeps both columns. A later housekeeping phase could migrate
  remaining `image_url` values into the managed bucket and drop the column.

### Reviewed Todos (not folded)
- `rename-cargo-package-bar-pos` — matched only on the generic keyword "pos"; unrelated Tauri/Cargo
  housekeeping.
- `rotate-remote-supabase-db-password` — matched on "supabase"/"pos"; an ops credential task, not
  catalog work.

</deferred>

---

*Phase: 31-product-catalog-detail-photo-upload*
*Context gathered: 2026-09-07*
