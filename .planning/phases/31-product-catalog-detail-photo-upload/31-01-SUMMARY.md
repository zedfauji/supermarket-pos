---
phase: 31-product-catalog-detail-photo-upload
plan: "01"
subsystem: product-photo-storage
tags: [supabase-storage, rls, product-catalog, tdd, tracer]

requires: []
provides:
  - "products.photo_path column + product-photos Storage bucket + 4 storage.objects RLS policies"
  - "resolveProductImage.ts (D-14 resolver): PRODUCT_PHOTO_BUCKET, SIGNED_URL_TTL_SECONDS, SIGNED_URL_STALE_TIME_MS, signProductPhoto, pickProductImage, resolveProductImageUrl, useProductImageUrl"
  - "photo-file.ts: ACCEPTED_PHOTO_MIME_TYPES, MAX_UPLOAD_BYTES, validatePhotoFile, targetDimensions, photoObjectPath, resizePhoto"
  - "useProductPhotoUpload.ts upload/replace mutation"
  - "ProductPhotoTab.tsx mounted in the existing edit dialog"
  - "invalidateCatalogQueries exported from entities/product for feature-layer reuse"
affects:
  - "src/entities/product/model/queries.ts (mapProductRow/productUpdateToRow gain photoPath)"
  - "src/shared/lib/domain.ts (ProductSchema gains required photoPath field)"
  - "~20 test/story files that construct a Product literal (photoPath fixup)"

actuals:
  tokens: 18940
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Supabase Storage private bucket + signed URLs (first usage in this codebase)"
    - "Canvas-based client-side image resize/re-encode (WebP with JPEG fallback)"
    - "TanStack Query signed-URL cache keyed by [id, photoPath, imageUrl] — no manual invalidation needed on replace"

key-files:
  created:
    - supabase/migrations/20260907000001_product_photos_storage.sql
    - src/entities/product/model/resolveProductImage.ts
    - src/entities/product/model/resolveProductImage.test.ts
    - src/features/manage-products/model/photo-file.ts
    - src/features/manage-products/model/photo-file.test.ts
    - src/features/manage-products/model/useProductPhotoUpload.ts
    - src/features/manage-products/ui/tabs/ProductPhotoTab.tsx
    - e2e/products/product-photo-upload.spec.ts
  modified:
    - src/shared/lib/domain.ts
    - src/shared/lib/result.ts
    - src/entities/product/model/queries.ts
    - src/entities/product/model/index.ts
    - src/entities/product/index.ts
    - src/entities/tab/model/queries.ts
    - src/entities/purchase-order/model/queries.ts
    - src/entities/open-unit/model/queries.ts
    - src/entities/inventory/model/queries.ts
    - src/features/manage-products/ui/CatalogProductsTab.tsx
    - src/shared/lib/i18n/locales/es-MX/featMgmt.json
    - src/shared/lib/i18n/locales/en-US/featMgmt.json
    - src/shared/lib/mocks.ts
    - "~20 additional test/story files (photoPath: null literal fixups)"

key-decisions:
  - "Task 1 Decision A: column named photo_path (not photo_url), TS field photoPath, stores a bare Storage object path — never a URL."
  - "Task 1 Decision B: storage.objects SELECT policy open to any authenticated role for bucket_id='product-photos' (no manage_products predicate); INSERT/UPDATE/DELETE keep the manage_products predicate. Forward-looking bet — zero display benefit this phase since no cashier-facing surface renders a photo yet."
  - "Environment fact (Task 1): target project mkvinyekkyennyegfoxq had zero Storage buckets before this migration — clean first-insert, re-verified via storage.getBucket before writing the migration."
  - "[Rule 1 bug] ProductPhotoTab does not trust the parent's `product` prop for photoPath after upload — CatalogProductsTab's `editProduct` is a plain useState set once at dialog-open and never resynced after invalidateCatalogQueries refetches the catalog. Fixed by tracking the just-uploaded path in local component state."

patterns-established:
  - "New Supabase Storage integrations: bucket + RLS via forward migration (client SDK createBucket() is unavailable to an anon-key renderer client), signed URLs never persisted, replace-with-new-key-then-delete-old ordering."
  - "AppErrorCode additions for a new failure domain: one code per distinguishable failure stage (PHOTO_TOO_LARGE, PHOTO_DECODE_FAILED, PHOTO_UPLOAD_FAILED, PHOTO_LINK_FAILED) rather than overloading a generic VALIDATION_ERROR for everything."

requirements-completed: [PCAT-03]

coverage:
  - id: photo-storage-migration
    description: "Private product-photos bucket (2097152-byte limit, jpeg/png/webp only) + products.photo_path column + 4 storage.objects RLS policies, idempotent re-run"
    requirement: PCAT-03
    verification:
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts::bucket configuration"
        status: pass
      - kind: manual
        ref: "supabase db push --dry-run (no pending migrations)"
        status: pass
    human_judgment: false
  - id: upload-happy-path
    description: "Admin picks a file → resize → Storage upload → products.photo_path link → signed-URL preview renders"
    requirement: PCAT-03
    verification:
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts::admin uploads a photo"
        status: pass
      - kind: unit
        ref: "src/features/manage-products/model/photo-file.test.ts (13 tests)"
        status: pass
    human_judgment: false
  - id: resolver-precedence
    description: "D-14 resolver: photo wins, legacy imageUrl fallback, null when both absent, signer-error falls through"
    requirement: PCAT-03
    verification:
      - kind: unit
        ref: "src/entities/product/model/resolveProductImage.test.ts (10 tests)"
        status: pass
    human_judgment: false
  - id: partial-failure-hardening
    description: "Distinguishable errors for upload-failed / link-failed / decode-failed / offline; old-object delete failure is a logged orphan, not a user-facing error"
    requirement: PCAT-03
    verification:
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts::link failure, unsupported type, double upload"
        status: pass
      - kind: unit
        ref: "photo-file.test.ts resizePhoto decode-failure test"
        status: pass
    human_judgment: false

duration: ~3h
completed: "2026-09-08"
status: complete
---

# Phase 31 Plan 01: Product Photo Storage Architecture Summary

**Private Supabase Storage bucket with RLS-gated writes, an app-minted object-path column, a client-side canvas resize pipeline, a shared signed-URL resolver, and a working Photo panel in today's product edit dialog — proven end to end by a real Playwright upload round-trip, including three partial-failure branches.**

## Performance

- Duration: ~3h (includes CLI credential self-provisioning, live debugging of one production bug found via E2E)
- Started: 2026-09-08 (worktree base 8521bb479b74)
- Completed: 2026-09-08
- Tasks: 3/3 complete
- Files: 40 changed (8 created, ~32 modified)

## Accomplishments

- Migration `20260907000001_product_photos_storage.sql` applied to the remote project: private `product-photos` bucket (2097152-byte limit, `image/jpeg`/`image/png`/`image/webp` only), `products.photo_path` column, and four `storage.objects` RLS policies (select/insert/update/delete), all idempotent on re-run.
- `photo-file.ts`: pure, framework-free `validatePhotoFile`, `targetDimensions`, `photoObjectPath`, `resizePhoto` (canvas decode → downscale to a 1200px longest edge → re-encode WebP with a JPEG fallback).
- `resolveProductImage.ts`: the D-14 shared resolver — `signProductPhoto`, `pickProductImage`, `resolveProductImageUrl`, and the `useProductImageUrl` TanStack Query hook, keyed by `[id, photoPath, imageUrl]` so a replace produces a fresh query automatically.
- `useProductPhotoUpload.ts`: the full upload/replace sequence (`isOnline` guard → validate → resize → Storage upload → link → delete previous object last), each stage returning its own distinguishable `AppErrorCode`.
- `ProductPhotoTab.tsx` mounted below `ProductForm` in `CatalogProductsTab`'s existing edit-only dialog — empty-state drop zone, populated preview with Skeleton/ImageOff fallbacks, uploading overlay, inline `role="alert"` errors.
- `e2e/products/product-photo-upload.spec.ts`: 5 tests, all green against the real remote project — bucket configuration, the happy path, an intercepted-PATCH link failure, an unsupported-type rejection, and a double-upload replace proof.
- Found and fixed a real bug via the E2E spec's own debugging (see Deviations).

## Task Commits

1. `ec81b37` (feat) — product-photos Storage bucket, RLS policies, `photo_path` column; migration applied to remote; `supabase.types.ts` regenerated.
2. `b0e0325` (feat) — `ProductSchema.photoPath`; wired through `mapProductRow`/`productUpdateToRow` and every other `ProductSchema.parse()` call site; ~20 test/story literal fixups; all 1421 unit tests pass.
3. `6e716a1` (test — RED) — failing tests for `photo-file.ts` and `resolveProductImage.ts`, plus the new `AppErrorCode` entries they assert against. Verified RED locally (module-not-found) before committing.
4. `54b3880` (feat — GREEN) — implementations for both files; 23/23 tests pass.
5. `d9eb03b` (feat) — `useProductPhotoUpload`, `ProductPhotoTab`, dialog mount, i18n keys (both locales).
6. `576c251` (feat) — E2E happy-path + bucket-config spec; found and fixed the stale-`editProduct`-prop bug (see Deviations).
7. `1d8b299` (test) — Task 3 hardening: decode-failure unit test, 3 E2E fault-injection tests (link failure, unsupported type, double upload).

## Files Created/Modified

**Created:**
- `supabase/migrations/20260907000001_product_photos_storage.sql`
- `src/entities/product/model/resolveProductImage.ts` + `.test.ts`
- `src/features/manage-products/model/photo-file.ts` + `.test.ts`
- `src/features/manage-products/model/useProductPhotoUpload.ts`
- `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx`
- `e2e/products/product-photo-upload.spec.ts`

**Modified (core):**
- `src/shared/lib/domain.ts` (`ProductSchema.photoPath`)
- `src/shared/lib/result.ts` (`PHOTO_TOO_LARGE`, `PHOTO_DECODE_FAILED`, `PHOTO_UPLOAD_FAILED`, `PHOTO_LINK_FAILED` + factories)
- `src/entities/product/model/queries.ts` (`photoPath` mapping both directions; `invalidateCatalogQueries` exported)
- `src/entities/product/model/index.ts`, `src/entities/product/index.ts` (barrel re-exports)
- `src/entities/tab/model/queries.ts`, `src/entities/purchase-order/model/queries.ts`, `src/entities/open-unit/model/queries.ts`, `src/entities/inventory/model/queries.ts` (every other `ProductSchema.parse()` site now maps `photo_path`)
- `src/features/manage-products/ui/CatalogProductsTab.tsx` (mounts `ProductPhotoTab`)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` (`manageProducts.productDialog.photo.*`)
- `src/shared/lib/mocks.ts` + ~20 test/story files (`photoPath: null` literal fixups — see Deviations)

## Decisions Made

Recorded verbatim from Task 1 (`checkpoint:decision`, already resolved before this executor started per the retry instructions):

- **Decision A (column name / value shape):** `photo_path` (DB) / `photoPath` (TS), a bare Storage object path (`products/{productId}/{uuid}.webp`) — never a URL. `UrlSchema` is not reused (Pitfall 3): `photoPath: z.string().min(1).max(500).nullable()`.
- **Decision B (SELECT policy scope):** open to any `authenticated` role for `bucket_id = 'product-photos'`, no `manage_products` predicate. INSERT/UPDATE/DELETE keep the `manage_products` predicate (copied verbatim from `20260823000001_purchase_orders.sql:39-43`). This is a deliberate forward-looking bet — no cashier-facing surface renders a photo this phase, so the looser read scope buys nothing today; it avoids a second migration whenever a cashier-facing surface first needs to display a photo.
- **Environment fact:** the target remote project (`mkvinyekkyennyegfoxq`) had zero Storage buckets before this migration ran — re-verified via `storage.getBucket('product-photos')` returning empty before the push and the correct config after. The bucket insert was a clean first-insert, not a config overwrite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Self-provisioned Supabase credentials via the CLI instead of a copied `.env.local`**
- **Found during:** Setup, before Task 2.
- **Issue:** This worktree had no `.env.local`; retry instructions explicitly forbade copying the main checkout's file.
- **Fix:** `supabase link --project-ref mkvinyekkyennyegfoxq` (already-authenticated global CLI), then `supabase projects api-keys` for the anon/service-role keys and the project URL, written into a fresh worktree-local `.env.local`. Also created 4 dedicated E2E fixture staff accounts (`E2E Admin`/`E2E Manager`/`E2E Cashier`/`E2E Kitchen`) via `npm run setup:dev-users` rather than reusing the two real production profiles ("Vinty Owner"/"Alex Cashier") already in that database, to avoid any risk of mutating real production login state.
- **Files modified:** `.env.local` (gitignored, not committed).
- **Verification:** `supabase storage ls`/`db push`/E2E login all succeeded using these self-provisioned credentials.

**2. [Rule 3 - Blocker] `ProductSchema.photoPath` fixup scope was much larger than the plan's files_modified list**
- **Found during:** Task 2, step 5 (typecheck-driven literal fixups).
- **Issue:** The plan named 4 files for the "one-line null fixup" pass (`mocks.ts`, `CartItem.stories.tsx`, `ModifierSheet.stories.tsx`, `ReceiveShipmentForm.tsx`). `npm run typecheck` after adding the required `photoPath` field enumerated ~20 files, and a follow-up grep of every `ProductSchema.parse(...)` call site found 4 more (`entities/tab`, `entities/purchase-order`, `entities/open-unit`, `entities/inventory` queries) that typecheck could not catch — `.parse()` accepts `unknown`, so these would have thrown a runtime Zod error on every product read through those entities the moment `photoPath` became required.
- **Fix:** Added `photoPath: null` (or the mapped `row.photo_path`) to every site; verified via full-project `npm run typecheck` (clean) and `npm run test` (1421→1445 tests, all passing across the phase).
- **Files modified:** listed under key-files.modified above.
- **Commit:** `b0e0325`.

**3. [Rule 1 - Bug] `ProductPhotoTab` showed the empty state forever after a successful upload**
- **Found during:** Task 2's own E2E happy-path test, while debugging why `product-photo-preview` never appeared despite the "Photo saved" toast firing and the DB row/Storage object both being correct.
- **Issue:** `CatalogProductsTab.editProduct` is a plain `useState<Product | null>` set once when the Edit button is clicked. `invalidateCatalogQueries` (called on upload success) refetches the catalog list, but nothing resyncs `editProduct` to the refetched row — so `ProductPhotoTab`'s `product` prop stayed frozen at its dialog-open value (`photoPath: null`) for the rest of the session, even though the upload had genuinely succeeded.
- **Fix:** `ProductPhotoTab` now tracks `localPhotoPath` in its own `useState`, seeded from `product.photoPath` and updated directly from the mutation's `onSuccess` result — it no longer depends on the parent re-passing a fresh `product` object.
- **Files modified:** `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx`.
- **Verification:** Confirmed via a temporary diagnostic E2E spec (ARIA-snapshot dump) before and after the fix, then via the real spec's `product-photo-preview` assertion passing.
- **Commit:** `576c251`.

**Total deviations:** 3 auto-fixed (1 blocker/environment, 1 blocker/mechanical-scope, 1 real bug found by the tracer's own verification). **Impact:** all three were necessary to reach a genuinely working, tested slice — none required an architectural decision or user input.

### Pre-existing, out of scope

- `e2e/products/categories.spec.ts` T5 ("4th-level creation blocked in UI") flaked once during the full `e2e/products/` verification run (failed, then passed on Playwright's automatic retry). Unrelated to this plan's files — logged here per the scope-boundary rule, not fixed.

## Issues Encountered

None beyond the deviations above (all resolved).

## User Setup Required

None — no external service configuration required. The Storage bucket and RLS are entirely migration-managed; no manual dashboard steps.

## Deferred

Restating the RECORDED DEFERRAL from this plan's `must_haves.truths` verbatim per the plan's own `<output>` instruction:

D-14 named six resolver consumers: the product dialog, the catalog table, cart items, inventory rows, PO lines, and the checkout grid. This phase wires exactly two — `ProductPhotoTab` in the product dialog (this plan) and the catalog thumbnail column (Plan 03) — both behind `manage_products`. The other four are deferred, individually:

1. `entities/tab` cart items
2. `entities/inventory` rows
3. `entities/open-unit`
4. `entities/purchase-order` PO lines
5. the checkout `ProductGrid` widget (widgets/, not an entity, but named in D-14's consumer list)

**Reason, with evidence:** none of the five renders an image today, so none has an `<img>` for a resolver to feed. `grep -rn "imageUrl" src --include=*.tsx` returns exactly one render site in the entire app — `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx:253-254` — and that one is separately out of scope (Phase 18, guarded by Plan 05 Task 2). `grep -rln "<img" src/entities/tab src/entities/inventory src/entities/open-unit src/entities/purchase-order src/widgets/ProductGrid` returns nothing. Wiring a resolver into five surfaces with nothing to render is speculative; authoring the missing `<img>` markup for each is a UI change no phase-31 requirement (PCAT-01..04) and no 31-UI-SPEC.md section asks for. Each of the five gets its `resolveProductImageUrl`/`useProductImageUrl` call in the same future change that first gives it an image to display.

The resolver (`src/entities/product/model/resolveProductImage.ts`, re-exported from both `entities/product` barrels) exists now and is ready for those five call sites whenever their turn comes.

## Next Phase Readiness

Plan 02 (dialog reshape into vertical tabs) and Plan 03 (catalog thumbnail column, batch `createSignedUrls`) can now build directly on:
- `resolveProductImage.ts`'s full public API (resolver + hook), including the not-yet-used batch-signing note in RESEARCH.md.
- `ProductPhotoTab.tsx` as the Photo-tab content to relocate into the new vertical-tab layout (D-01/D-02) — its drop-zone/preview/error markup is production-quality already; Plan 02 only needs to add drag-and-drop, clipboard paste, and Replace/Remove buttons (explicitly out of scope for this plan).
- `useProductPhotoUpload`'s `previousPath` parameter, already wired for a real Replace flow once a Replace button exists.

## Self-Check: PASSED

All 8 named artifact files confirmed present on disk; all 7 commit hashes confirmed in `git log`.

---
*Phase: 31-product-catalog-detail-photo-upload*
*Completed: 2026-09-08*
