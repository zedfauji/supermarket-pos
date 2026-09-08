---
phase: 31-product-catalog-detail-photo-upload
verified: 2026-09-08T15:21:15Z
status: gaps_found
score: 6/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The reshaped dialog shows accurate 'full product detail' — specifically the D-17 read-only stock strip (quantity on hand, low-stock threshold, low-stock badge) — for every existing product, not just newly-created ones."
    status: failed
    reason: >
      `useProductsForManagement()` (src/entities/product/model/queries.ts:305-322), the query that
      feeds CatalogProductsTab/ProductDetailDialog, selects `*, category:categories(*),
      product_modifiers(modifier:modifiers(*))` with no `inventory(quantity_on_hand,
      low_stock_threshold)` join — unlike the POS-facing `useProducts()` (queries.ts:143-161), which
      does join it. `mapProductRow` reads `quantityOnHand`/`lowStockThreshold` off
      `row.inventory?.…`, which is always `undefined` here, and `ProductSchema`'s fields are
      `optional()` so this parses silently rather than throwing. Independently reproduced by reading
      the current query source (not just trusting 31-REVIEW.md's CR-01): the join is absent as of
      HEAD (6475cd4), no fix has landed on queries.ts since Plan 01's commits (b0e0325/54b3880 are
      the last two touching that file). Net effect: `ProductDetailDialog`'s stock strip
      (ProductDetailDialog.tsx:391-419) shows "0 on hand" / "No threshold" for every product that
      actually has stock, and the low-stock warning badge can never render. 31-CONTEXT.md's own D-17
      decision explicitly assumed this data was already fetched ("ProductSchema already carries
      quantityOnHand and lowStockThreshold (joined from inventory) ... this is display-only against
      data the catalog query can already fetch") — that assumption was wrong for the query this
      dialog actually uses. The create-mutation's post-insert refetch (queries.ts:463-480) shares the
      same unjoined select, so even create-then-stay inherits the bug (only coincidentally correct
      there, since a brand-new product genuinely has 0 stock). Existing E2E coverage
      (product-management.spec.ts PM9/PM11) only asserts the strip is *visible*, never that its
      numbers are correct, so this shipped and merged undetected by the phase's own automated gates.
    artifacts:
      - path: "src/entities/product/model/queries.ts"
        issue: "useProductsForManagement (lines 305-322) and the create-mutation's post-insert refetch (lines 463-480) select products without the inventory(quantity_on_hand, low_stock_threshold) join that useProducts() already has, so mapProductRow always maps quantityOnHand/lowStockThreshold to undefined for every row this dialog reads."
      - path: "src/features/manage-products/ui/ProductDetailDialog.tsx"
        issue: "Lines 391-419 render the D-17 stock strip directly from initialProduct.quantityOnHand/lowStockThreshold, which are always undefined given the unjoined source query — the strip is present and wired but its data is permanently wrong for existing stock."
    missing:
      - "Add `inventory(quantity_on_hand, low_stock_threshold)` to useProductsForManagement's select (and to the create-mutation's post-insert refetch select) in src/entities/product/model/queries.ts, matching useProducts()'s existing join."
      - "An E2E or unit assertion on the stock strip's actual rendered numbers against a seeded non-zero inventory row (not just strip visibility), so a regression of this join is caught in the future."
deferred:
  - truth: "A product's photo renders in Phase 18's barcode-scan peek window when only an uploaded photo (no legacy imageUrl) is set."
    addressed_in: "Not scheduled — explicitly out of D-14's this-phase scope"
    evidence: "31-05-SUMMARY.md '## Deferred': the peek window deliberately reads product.imageUrl directly and is not wired to resolveProductImage()/photo_path this phase (31-RESEARCH.md Pitfall 4); proven and documented via e2e/checkout/peek-window.spec.ts's two new tests, not silently absorbed."
  - truth: "The five other D-14 resolver consumers (cart items, inventory rows, open-unit, PO lines, checkout ProductGrid) render a product photo."
    addressed_in: "A future phase, whenever each surface first gains an <img> to feed"
    evidence: "31-01-SUMMARY.md '## Deferred': none of the five renders an image today (grep evidence recorded), so wiring the resolver into them now would be speculative; resolveProductImage.ts already exists and is ready for that future work."
---

# Phase 31: Product Catalog Detail & Photo Upload Verification Report

**Phase Goal:** Clicking a product in Inventory/Catalog opens the existing add/edit dialog reshaped
into a larger view+edit+photo layout (tabbed/sectioned) instead of the current small add/edit-only
form, and a product can carry one photo stored in Supabase Storage (not client-local/base64).
Distinct from Phase 18's separate barcode-scan-at-checkout peek window — different trigger, different
flow, unaffected by this phase.

**Verified:** 2026-09-08T15:21:15Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking a product in Catalog opens the reshaped dialog (Details/Photo/Links vertical tabs, larger `max-w-4xl` layout) in place of the old two-`Dialog` flat form (PCAT-01) | VERIFIED | `ProductDetailDialog.tsx` exists, mounted once in `CatalogProductsTab.tsx`; `ProductForm.tsx` confirmed deleted (`git ls-files` returns nothing, `npm run typecheck` clean); `onRowClick` wired (`grep -c "onRowClick"` = 1) with `stopPropagation` on all 3 inline editors + 2 action buttons; e2e/products/catalog-row-and-thumbnails.spec.ts and product-management.spec.ts (PM9-PM15) assert the rail, row-click, and inline-edit isolation. |
| 2 | Every existing editable field remains editable, gated by the unchanged `manage_products` RBAC action (PCAT-02) | VERIFIED | `ProductDetailsTab.tsx`/`ProductLinksTab.tsx` contain the full field set lifted verbatim from the retired `ProductForm.tsx` (confirmed present: name, category, price, sku, barcode, active, units-per-package, parent product, imageUrl, modifiers, suppliers). RBAC gate confirmed unchanged and unrelocated: `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx:21` still wraps the whole surface in `<ProtectedAction action="manage_products" ...>` — `CatalogProductsTab.tsx` itself never re-implements the check, so the reshape didn't touch the gate. |
| 3 | A product can carry one photo, uploaded to a private Supabase Storage bucket and referenced by `products.photo_path` (a bare object path, not a base64/data URL); re-upload replaces it; storage writes are RLS-restricted to `manage_products` holders (PCAT-03) | VERIFIED | Migration `supabase/migrations/20260907000001_product_photos_storage.sql` read directly: private bucket (`public: false`), 2097152-byte limit, 3-MIME allow-list, `products.photo_path text` column, 4 idempotent `storage.objects` policies — SELECT open to `authenticated` (Decision B), INSERT/UPDATE/DELETE gated on `role_permissions ... action = 'manage_products'`, none granted to `anon`. `photoPath: z.string().min(1).max(500).nullable()` confirmed in `domain.ts` (not `UrlSchema`). Upload/replace/remove sequence (`useProductPhotoUpload.ts`) confirmed writing a fresh uuid key and deleting the old one after the column write, never `upsert`. |
| 4 | Automated Playwright E2E proves the reshaped dialog's round-trip, photo upload/replace, RBAC/RLS denial, and that Phase 18's peek window is unaffected (PCAT-04) | VERIFIED | All named spec files exist and were exercised per-plan against the real remote project (per SUMMARY task-commit records and this verification's own unit/typecheck re-run): `e2e/products/product-photo-upload.spec.ts` (11 tests), `e2e/products/catalog-row-and-thumbnails.spec.ts` (7 tests), `e2e/products/product-photo-rls.spec.ts` (9 tests, cashier+anon denial with service-client ground truth and an admin positive control), `e2e/checkout/peek-window.spec.ts` (+2 tests), `e2e/visual/46-product-dialog-baseline.spec.ts` (4 UI-contract backstops). `git log` confirms zero commits under `src/widgets/ProductPeekWindow/` from this phase. |
| 5 | The dialog's D-17 stock strip (on-hand qty, low-stock threshold, low-stock badge) shows the real, accurate inventory state for an existing product — the phase goal's "full product detail" claim depends on this being correct, and D-17 (31-CONTEXT.md) explicitly assumed the data was "already" fetched by the catalog query | ✗ FAILED | `src/entities/product/model/queries.ts:305-322` (`useProductsForManagement`) and `:463-480` (create-mutation post-insert refetch) select products with **no** `inventory(quantity_on_hand, low_stock_threshold)` join — confirmed by reading the file directly at HEAD. `mapProductRow` maps both fields to `undefined` for every row this dialog reads, so `ProductDetailDialog.tsx:391-419`'s stock strip always renders "0 on hand" / "No threshold" and the low-stock badge can never appear, for every product with real stock. Documented and unresolved in `31-REVIEW.md` CR-01 (critical); no fix commit exists on `queries.ts` after Plan 01. |
| 6 | Storage write endpoints deny a role without `manage_products` (cashier) and an unauthenticated caller, proven from a real anon-key client, not just hidden in the UI | VERIFIED | Migration policies read directly confirm INSERT/UPDATE/DELETE require the `manage_products` `role_permissions` predicate and are granted `TO authenticated` only (no `anon` grant anywhere). `e2e/products/product-photo-rls.spec.ts` (9 tests) drives this from `createRoleScopedClient('cashier', ...)` and a bare anon client, each denial paired with a service-client ground-truth read, plus an admin positive control. |
| 7 | No debt markers, unresolved `TBD`/`FIXME`/`XXX`, and clean typecheck/lint across the phase's touched files | VERIFIED | `grep -rnE "TBD|FIXME|XXX"` across `src/features/manage-products/` and the photo/resolver files returns nothing. `npm run typecheck` clean. `npx eslint` on the same files clean (only a pre-existing, unrelated `boundaries/dependencies` config warning). `npx vitest run` on the three phase-specific unit-test files: 58/58 passing. |

**Score:** 6/7 truths verified (0 present-but-behavior-unverified)

### Deferred Items

Items not yet met but explicitly, deliberately scoped out of this phase with recorded evidence — not actionable gaps.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Phase 18 peek window renders an uploaded-only photo (no legacy `imageUrl`) | Not scheduled — future phase | 31-05-SUMMARY.md `## Deferred`; proven via 2 new peek-window E2E tests, not silently absorbed |
| 2 | 5 remaining D-14 resolver consumers (cart, inventory rows, open-unit, PO lines, checkout grid) render a photo | Future phase, per-surface | 31-01-SUMMARY.md `## Deferred`; grep evidence that none of the 5 renders any image today |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260907000001_product_photos_storage.sql` | Bucket + RLS + column, idempotent | ✓ VERIFIED | Read directly; matches Decision A/B exactly; `DROP POLICY IF EXISTS` + `ON CONFLICT DO NOTHING` + `ADD COLUMN IF NOT EXISTS` confirm idempotency |
| `src/entities/product/model/resolveProductImage.ts` | D-14 single + batch signed-URL resolver | ✓ VERIFIED | File exists; exports confirmed via SUMMARY/code-review file list; unit tests pass (part of the 58/58 run) |
| `src/features/manage-products/model/photo-file.ts` | Pure validate/resize/extract helpers | ✓ VERIFIED | File exists; 19 unit tests pass |
| `src/features/manage-products/model/useProductPhotoUpload.ts` | Upload/replace/remove mutation sequence | ✓ VERIFIED | File exists; distinguishable `AppErrorCode`s confirmed present in `result.ts` |
| `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx` | Full Photo-tab state matrix | ✓ VERIFIED | File exists; drag/drop, paste, replace, remove all present per code review with no critical findings |
| `src/features/manage-products/ui/ProductDetailDialog.tsx` | Single Details/Photo/Links host | ✓ VERIFIED | File exists; `ProductForm.tsx` deletion confirmed; stock strip present but **data-incorrect** (see Truth 5 / Gap) |
| `e2e/products/product-photo-upload.spec.ts`, `catalog-row-and-thumbnails.spec.ts`, `product-photo-rls.spec.ts`, `46-product-dialog-baseline.spec.ts` | Automated E2E proof, no manual UAT | ✓ VERIFIED | All 4 files exist with the described test counts per SUMMARYs and 31-REVIEW.md's file list |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CatalogProductsTab` row click | `ProductDetailDialog` | `DataTable`'s `onRowClick` prop | ✓ WIRED | `grep -c "onRowClick"` = 1 in `CatalogProductsTab.tsx`; propagation stops confirmed on 3 inline editors + 2 action buttons |
| `useProductPhotoUpload` | `products.photo_path` | Storage upload → column write → delete-old-object | ✓ WIRED | Confirmed sequence order in file; migration confirms the column exists and RLS gates the write |
| `ProductDetailDialog` stock strip | `products`/`inventory` tables | `initialProduct.quantityOnHand`/`lowStockThreshold` | ⚠️ HOLLOW | Wired to a prop, but the prop's source query (`useProductsForManagement`) never joins `inventory`, so the value is structurally disconnected from real data — see Gap above |
| `storage.objects` RLS policies | `manage_products` gate | `role_permissions` + `get_user_role()` | ✓ WIRED | Confirmed in migration text and proven by `product-photo-rls.spec.ts`'s cashier/anon denial + admin positive control |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ProductPhotoTab` preview | signed photo URL | `useProductImageUrl` → `signProductPhoto` → `createSignedUrl` on `photo_path` | Yes | ✓ FLOWING |
| Catalog thumbnail column | signed photo URL | `useProductImageUrls` → `signProductPhotos` → batch `createSignedUrls` | Yes | ✓ FLOWING |
| Stock strip "on hand" / "threshold" | `quantityOnHand` / `lowStockThreshold` | `useProductsForManagement` → `products` select with **no** `inventory` join | No — always `undefined`/0 | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-specific unit suite passes | `npx vitest run src/features/manage-products/model/photo-file.test.ts src/entities/product/model/resolveProductImage.test.ts src/features/manage-products/model/productDialogTabs.test.ts` | 58/58 passed | ✓ PASS |
| Full-project typecheck | `npm run typecheck` | clean, 0 errors | ✓ PASS |
| Phase-touched files lint clean | `npx eslint src/features/manage-products/ src/entities/product/model/resolveProductImage.ts --max-warnings 0` | clean (1 pre-existing unrelated config warning) | ✓ PASS |
| No debt markers in touched files | `grep -rnE "TBD\|FIXME\|XXX" src/features/manage-products/ ...` | no matches | ✓ PASS |
| RBAC gate for Catalog surface unchanged | `grep -rn "manage_products" src/widgets/InventoryPagePanel` | `CatalogTab.tsx:21` — `ProtectedAction action="manage_products"` | ✓ PASS |
| Migration content matches Decision A/B | direct file read of `20260907000001_product_photos_storage.sql` | bucket/column/4-policy shape matches SUMMARY claims exactly | ✓ PASS |
| Peek window untouched by this phase | `git log --oneline -- src/widgets/ProductPeekWindow` | 0 commits from phase-31 range | ✓ PASS |
| Stock-strip data source join | direct file read of `src/entities/product/model/queries.ts:305-322,463-480` | no `inventory(...)` join present | ✗ FAIL (confirms CR-01) |

Full `npm run test:e2e`/`npx playwright test` was not re-executed in this verification pass (requires a live dev server + remote Supabase E2E credentials not exercised here); relied instead on direct source inspection of every named spec file's existence/shape, the SUMMARYs' per-task commit records, and 31-REVIEW.md's independent line-by-line code review (which read all 7 spec files and found no defects in the tests themselves, only in application code).

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` convention or explicit probe declarations found in this phase's PLAN/SUMMARY files.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PCAT-01 | 31-02, 31-03 | Reshaped dialog opens on catalog click, larger tabbed layout | ✓ SATISFIED | Truths 1, 4; artifacts confirmed |
| PCAT-02 | 31-02 | Every field editable, unchanged `manage_products` gate | ✓ SATISFIED (with WR-01 quality note, see below) | Truth 2; RBAC gate confirmed unrelocated |
| PCAT-03 | 31-01, 31-04 | One photo, Supabase Storage, `photo_url`/`photo_path` column, RLS-restricted | ✓ SATISFIED | Truths 3, 6; migration read directly |
| PCAT-04 | 31-01..05 | Automated E2E: round-trip, photo upload/replace, RBAC denial, peek-window unaffected | ✓ SATISFIED | Truth 4; all spec files confirmed present with described coverage |

No orphaned requirements — REQUIREMENTS.md's Phase 31 section maps exactly PCAT-01..04, all 4 claimed across the 5 plans' `requirements:` frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/entities/product/model/queries.ts` | 305-322, 463-480 | Missing `inventory(...)` join present on the sibling `useProducts()` query but absent here | 🛑 Blocker | Stock strip silently wrong for every existing product (see Gap) |
| `src/features/manage-products/ui/ProductDetailDialog.tsx` | 267-277 | `Number.parseInt` silently truncates a manually-typed decimal (`2.5` → `2`) instead of failing validation | ⚠️ Warning | A manager can save a wrong `unitsPerPackage` with no error shown (31-REVIEW.md WR-01); does not block the phase goal but is a real correctness gap in "every field remains editable" (PCAT-02) |
| `src/features/manage-products/ui/CatalogProductsTab.tsx` | 282-296 | Thumbnail cell's `loadFailed` local state resets on every unrelated table re-render (unmemoized `photoColumn`) | ℹ️ Info | Cosmetic only (31-REVIEW.md IN-02) — occasional re-fetch/flicker, not a correctness issue |
| `src/features/manage-products/model/photo-file.ts` vs migration | 13 vs 23 | Client `MAX_UPLOAD_BYTES` (10 MB) is 5x the bucket's server-side `file_size_limit` (2 MB) | ℹ️ Info | Rarely surfaces post-resize (31-REVIEW.md IN-01); worth tightening but not a phase-goal blocker |

## Human Verification Required

None. This project's CLAUDE.md testing policy prohibits any `human_needed` terminal state; every check above was resolved by direct source inspection, automated test execution, or the prior independent code-review/security/UI audits already on file. The one blocking gap (stock-strip data) is a deterministic, code-level defect with a precise fix, not a judgment call.

## Gaps Summary

Phase 31 delivers a genuinely working, well-tested reshape and photo pipeline — the dialog opens correctly on row click, every field is editable behind the unchanged RBAC gate, the Storage architecture (bucket, RLS, column, resolver, upload/replace/remove) is sound and independently RLS-tested against real cashier/anon clients, and Phase 18's peek window is proven unaffected. Typecheck, lint, and the phase's own unit-test suite are all clean.

One blocking gap remains, already identified by the phase's own code-review pass (`31-REVIEW.md` CR-01) and independently reconfirmed here by reading the live query source: the dialog's D-17 stock strip — a deliberate, named feature of "full product detail" per both the roadmap goal and 31-CONTEXT.md's own D-17 decision — is wired but structurally disconnected from real inventory data, because the query feeding the dialog never joins the `inventory` table. It shows "0 on hand / No threshold" for every existing product regardless of actual stock, silently and with no error, since `ProductSchema`'s inventory fields are optional. This was not caught by any of this phase's own automated tests (which only assert the strip is visible, never that its numbers are correct) and remains unfixed as of the phase's final commit. This is exactly the class of "task complete, goal not achieved" gap this verification is designed to surface: the artifact exists, is wired into the UI, passes every existing test, and is still wrong.

Fix is narrow and low-risk: add the same `inventory(quantity_on_hand, low_stock_threshold)` join `useProducts()` already has to `useProductsForManagement`'s select and the create-mutation's post-insert refetch, plus one assertion on the strip's actual numbers against a seeded non-zero-stock fixture so a future regression is caught.

---

*Verified: 2026-09-08T15:21:15Z*
*Verifier: Claude (gsd-verifier)*
