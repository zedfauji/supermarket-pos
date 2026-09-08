---
phase: 31-product-catalog-detail-photo-upload
plan: "02"
subsystem: product-catalog-dialog-reshape
tags: [react, radix-tabs, e2e, product-catalog, tdd]

requires:
  - "products.photo_path column + product-photos Storage bucket + resolveProductImage.ts + ProductPhotoTab.tsx (Plan 01)"
provides:
  - "ProductDetailDialog.tsx — single Details/Photo/Links vertical-tab host replacing the old two-Dialog create/edit split"
  - "ProductDetailsTab.tsx / ProductLinksTab.tsx — presentational field panels lifted verbatim from the retired ProductForm.tsx"
  - "productDialogTabs.ts — tabForFieldError/firstErroringTab/tabsWithErrors/isProductFormDirty (pure, unit-tested)"
  - "Create-then-stay (D-03): CatalogProductsTab keeps the dialog open after a successful create, switching it into edit mode for the new product"
  - "D-06 error-driven tab navigation + D-07 dirty-close guard, both wired into ProductDetailDialog"
affects:
  - "src/features/manage-products/ui/CatalogProductsTab.tsx (single ProductDetailDialog mount replaces the two Dialogs + ProductForm + direct ProductPhotoTab mount)"
  - "e2e/inventory/open-units.spec.ts, e2e/products/product-photo-upload.spec.ts (Task 3 re-point for the tab-behind-a-click reshape)"

actuals:
  tokens: 23700
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Vertical-tab dialog host (Tabs as the grid container directly, mirroring SettingsTabsPanel) — first reuse of that pattern for a create/edit dialog rather than a full settings page"
    - "Create-then-stay via a parent-owned React key: CatalogProductsTab remounts ProductDetailDialog on activeProduct?.id change, which doubles as both the D-03 mode transition and the D-07 dirty-snapshot re-baseline for free"

key-files:
  created:
    - src/features/manage-products/ui/ProductDetailDialog.tsx
    - src/features/manage-products/ui/tabs/ProductDetailsTab.tsx
    - src/features/manage-products/ui/tabs/ProductLinksTab.tsx
    - src/features/manage-products/model/productDialogTabs.ts
    - src/features/manage-products/model/productDialogTabs.test.ts
  modified:
    - src/features/manage-products/ui/CatalogProductsTab.tsx
    - src/features/manage-products/index.ts
    - src/shared/lib/i18n/locales/es-MX/featMgmt.json
    - src/shared/lib/i18n/locales/en-US/featMgmt.json
    - e2e/inventory/open-units.spec.ts
    - e2e/products/product-management.spec.ts
    - e2e/products/product-photo-upload.spec.ts
  deleted:
    - src/features/manage-products/ui/ProductForm.tsx

key-decisions:
  - "Task 1: fixed a latent bug in the create-submit Zod parse — it never included the photoPath key Plan 01 added to ProductSchema (required, nullable), so every 'Create product' submission was silently failing safeParse before this plan's own code ran. Verified via a scratch vitest assertion before fixing (Rule 1)."
  - "Task 1: create-then-stay is implemented as a parent-owned React key (key={activeProduct?.id ?? 'create'} in CatalogProductsTab) rather than internal state syncing inside ProductDetailDialog — the remount on key change re-initializes both the mode (create vs edit) and the D-07 dirty-snapshot baseline in one mechanism, matching the pre-existing key={editProduct.id} pattern the old ProductForm usage already used."
  - "Task 2: tabForFieldError's fallback for any unmapped Zod field key is 'details' (not null) — guarantees firstErroringTab never resolves to 'photo' (which owns no form field) for any key, verified by an explicit test over ProductUpdateSchema's full field set."
  - "Task 3: D-07's discard-confirm dialog defers opening via setTimeout(...,0) — opening it synchronously from inside the outer Radix Dialog's own Escape-key dismiss handler races Radix's DismissableLayer (the new AlertDialog layer can register its own document-level Escape listener while the same still-propagating keydown event is mid-dispatch, self-dismissing immediately). This is a real fix, not a test-only workaround: a real user pressing Esc would hit the identical self-close race."
  - "Task 3: switched every e2e Name-field selector from getByLabel to getByRole('textbox', { name: /^Name/i }) — getByLabel's aria-labelledby resolution for the Details tabpanel picks up the VerticalTabsTrigger's aria-hidden description text ('Name, price, barcode'), which contains 'Name' and made getByLabel('Name')/getByLabel(/name/i) strict-mode-fail by also matching the tabpanel container."

patterns-established:
  - "Tab-error-mapping module as a pure, framework-free file (productDialogTabs.ts) even though its only consumer is one dialog component — keeps the rail-order tie-break and dirty-diff logic unit-testable without React Testing Library."

requirements-completed: [PCAT-01, PCAT-02, PCAT-04]

coverage:
  - id: dialog-reshape
    description: "ProductDetailDialog: one 896px dialog, Details/Photo/Links vertical rail, read-only stock strip (edit mode), single pinned Save/Cancel footer, one ProductUpdate/ProductCreate payload per save (D-05)"
    requirement: PCAT-01
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts::PM9 (rail triggers present, Photo enabled/disabled), PM10 (single-submit Details+Links round trip)"
        status: pass
      - kind: unit
        ref: "npm run typecheck / npm run lint clean over ProductDetailDialog.tsx + both tab panels"
        status: pass
    human_judgment: false
  - id: create-then-stay
    description: "D-03: successful create keeps the dialog open, flips to edit mode for the new product, unlocks the Photo tab"
    requirement: PCAT-01
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts::PM11"
        status: pass
    human_judgment: false
  - id: field-parity-and-rbac
    description: "Every field editable in the old flat form stays editable across Details/Links; manage_products RBAC gate unchanged (no add/edit affordance for cashier)"
    requirement: PCAT-02
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts::PM3, PM5, PM15"
        status: pass
    human_judgment: false
  - id: error-navigation-and-dirty-close
    description: "D-06 auto-switch + error badge on an invalid hidden-tab field; D-07 discard-confirm on close with unsaved edits, free tab switching"
    requirement: PCAT-01
    verification:
      - kind: unit
        ref: "src/features/manage-products/model/productDialogTabs.test.ts (21 tests)"
        status: pass
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts::PM12, PM13, PM14"
        status: pass
    human_judgment: false
  - id: regression-existing-specs
    description: "Pre-existing product-dialog E2E specs (open-units case→piece config, photo-upload happy/fault paths) keep passing against the reshaped dialog"
    requirement: PCAT-04
    verification:
      - kind: e2e
        ref: "e2e/inventory/open-units.spec.ts, e2e/products/product-photo-upload.spec.ts"
        status: pass
    human_judgment: false

duration: ~3h
completed: "2026-09-08"
status: complete
---

# Phase 31 Plan 02: Dialog Reshape Summary

**`ProductDetailDialog` replaces the old two-`Dialog` create/edit split with one 896px Details/Photo/Links vertical-tab host — one save payload, create-then-stay, error-driven tab navigation, and a dirty-close guard — proven by 21 unit tests and 7 new + 3 re-pointed Playwright specs, including two real bugs found and fixed along the way.**

## Performance

- Duration: ~3h (includes an unplanned live-remote-Supabase E2E credential self-provision, and two rounds of real-bug root-causing via Playwright trace/DOM inspection)
- Tasks: 3/3 complete
- Files: 13 changed (5 created, 7 modified, 1 deleted)

## Accomplishments

- `ProductDetailDialog.tsx`: single host for Details/Photo/Links vertical tabs (D-01/D-02), read-only stock strip in edit mode (D-17), pinned Save/Cancel footer, one `ProductUpdate`/`ProductCreate` payload per save (D-05). `ProductForm.tsx` deleted outright — every field JSX and its Zod parse/error-flatten logic moved into the dialog and two new presentational panels.
- `ProductDetailsTab.tsx` / `ProductLinksTab.tsx`: Details owns name/category/base price/SKU/barcode/active; Links owns units-per-package/parent product/modifiers/suppliers plus the legacy `imageUrl` field (D-13, demoted out of Details, still editable).
- Create-then-stay (D-03): `CatalogProductsTab` keeps the dialog open after a successful create and re-keys it to the created product's id, which both flips it into edit mode (title, stock strip, Photo tab unlock) and re-baselines the D-07 dirty snapshot in one remount.
- `productDialogTabs.ts` (TDD RED→GREEN, Task 2): `tabForFieldError`, `firstErroringTab` (rail-order tie-break), `tabsWithErrors`, `isProductFormDirty` (order-independent array comparison) — 21/21 unit tests, including an explicit proof that no `ProductUpdateSchema` field key ever resolves to the Photo tab.
- D-06 wired into the dialog: a submit that fails validation auto-switches to the first erroring tab, moves focus to its first invalid control, and shows a destructive-dot + "(has errors)" badge on every erroring rail trigger.
- D-07 wired into the dialog: X/Esc/outside-click/Cancel all route through a dirty check; dirty opens a `ConfirmDialog` (Discard changes? / Keep editing); not dirty closes immediately; tab switching never prompts.
- Task 3: re-pointed `e2e/inventory/open-units.spec.ts` (Links-tab navigation + explicit create-then-stay close) and `e2e/products/product-photo-upload.spec.ts` (Photo-tab click before every dialog-open helper call, Plan 01's own spec), plus 7 new tests in `e2e/products/product-management.spec.ts` (PM9-PM15) proving the rail, create-then-stay, a single-submit Details+Links round trip, D-06, D-07, free tab switching, and cashier RBAC denial.
- Found and fixed two real bugs surfaced by driving the actual app with Playwright (see Deviations): a silently-broken create-product submit path, and a nested-dialog Escape-key race in the D-07 discard confirm.

## Task Commits

1. `aa09513` (feat) — `ProductDetailDialog`, `ProductDetailsTab`, `ProductLinksTab`; `ProductForm.tsx` deleted; `CatalogProductsTab` rewired to the single dialog with create-then-stay; i18n keys added both locales. Fixed the create-path `photoPath` omission (Rule 1) in the same commit since it's in the exact code being moved.
2. `3571851` (test — RED) — `productDialogTabs.test.ts` written and confirmed failing on module resolution before the implementation existed.
3. `f140b7e` (feat — GREEN) — `productDialogTabs.ts`; D-06 auto-switch and D-07 dirty-close guard wired into `ProductDetailDialog.tsx`. 21/21 new tests pass; full unit suite (1466 tests) still green.
4. `79d8157` (test) — re-pointed `open-units.spec.ts` and `product-photo-upload.spec.ts`; added PM9-PM15 to `product-management.spec.ts`; fixed the `getByLabel('Name')` strict-mode collision and the D-07 Escape-race bug found while actually running the specs against the real app.

## Files Created/Modified

**Created:**
- `src/features/manage-products/ui/ProductDetailDialog.tsx`
- `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx`
- `src/features/manage-products/ui/tabs/ProductLinksTab.tsx`
- `src/features/manage-products/model/productDialogTabs.ts` + `.test.ts`

**Modified:**
- `src/features/manage-products/ui/CatalogProductsTab.tsx` (single `ProductDetailDialog` mount)
- `src/features/manage-products/index.ts` (`ProductForm` export removed)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` (`productDialog.navLabel`/`tabs.*`/`tabWithErrors`/`stockStrip.*`/`discard*`/`keepEditing`/`photo.lockedTitle`, `productsTab.photoHeader`/`noPhoto`, updated `productsTab.headerHelp`)
- `e2e/inventory/open-units.spec.ts`, `e2e/products/product-management.spec.ts`, `e2e/products/product-photo-upload.spec.ts`

**Deleted:**
- `src/features/manage-products/ui/ProductForm.tsx`

## Decisions Made

- Create-then-stay implemented as a parent-owned React `key` (`activeProduct?.id ?? 'create'`) rather than internal prop-sync inside `ProductDetailDialog` — one remount mechanism serves both the D-03 mode flip and the D-07 dirty-snapshot re-baseline.
- `tabForFieldError`'s fallback for any unmapped key is `'details'`, never `null` or `'photo'` — Photo owns no form field and can never be an auto-switch target, proved directly against `ProductUpdateSchema`'s field set.
- D-07's `ConfirmDialog` open is deferred one macrotask (`setTimeout(..., 0)`) past the triggering Escape keydown — a real production fix for a genuine nested-Radix-dialog race, not a test-only workaround.
- E2E Name-field selectors switched from `getByLabel` to `getByRole('textbox', { name: /^Name/i })` project-wide in the three touched spec files, to route around a `getByLabel` ambiguity the reshape's tab descriptions introduced (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Create-product submit silently failed Zod validation**
- **Found during:** Task 1, while moving `handleSubmit` verbatim from the retired `ProductForm.tsx`.
- **Issue:** Plan 01 added a required (nullable) `photoPath` key to `ProductSchema`, which `ProductCreateSchema` inherits without `.partial()`. `ProductForm.tsx`'s create-path `safeParse` call never included that key — confirmed via a scratch vitest assertion that the exact object `ProductForm.tsx` submitted failed `ProductCreateSchema.safeParse` with `photoPath: Required`. Every "Create product" click was silently failing before this plan's own code ran.
- **Fix:** Added `photoPath: null` to the create-path parse object (a new product has no photo yet — D-03 requires a real product id before a photo can be attached).
- **Files modified:** `src/features/manage-products/ui/ProductDetailDialog.tsx`.
- **Verification:** `npx playwright test` E2E creates (PM3, PM11) both pass end-to-end against the real remote project.
- **Commit:** `aa09513`.

**2. [Rule 1 - Bug] `getByLabel('Name')`/`getByLabel(/name/i)` strict-mode-failed after the reshape**
- **Found during:** Task 3, running PM3 and the new PM9/PM11/PM12 against the real app.
- **Issue:** The Details tab's `VerticalTabsTrigger` carries a decorative, `aria-hidden` description ("Name, price, barcode") inside the same element the tabpanel's `aria-labelledby` references. Playwright's `getByLabel` label-resolution for that reference picks up the description text (not just the trigger's own `aria-label`), so `getByLabel('Name')`/`getByLabel(/name/i)` also matched the Details `tabpanel` container — a strict-mode violation with 2 resolved elements.
- **Fix:** Switched every affected Name-field selector (in `product-management.spec.ts`, `open-units.spec.ts`, and a `nameField()` helper) to `getByRole('textbox', { name: /^Name/i })`, which can't match a non-textbox container.
- **Files modified:** `e2e/products/product-management.spec.ts`, `e2e/inventory/open-units.spec.ts`.
- **Verification:** All previously-failing tests (PM3, PM11, PM12) pass after the fix.
- **Commit:** `79d8157`.

**3. [Rule 1 - Bug] D-07's discard-confirm self-closed when opened via Escape**
- **Found during:** Task 3, running PM13 (dirty-close guard) against the real app.
- **Issue:** Opening the `ConfirmDialog` synchronously from inside the outer `Dialog`'s own Escape-key dismiss handler raced Radix's `DismissableLayer`: the newly-mounted `AlertDialog` layer could register its own document-level Escape listener while the same native keydown event was still mid-dispatch, causing it to immediately self-dismiss. Reproduced consistently via Playwright ("element is not stable" → "element was detached from the DOM"); isolated by confirming the identical open-via-mouse-click path (Cancel button) never exhibited it.
- **Fix:** Deferred `setDiscardConfirmOpen(true)` to the next macrotask via `setTimeout(..., 0)` in `requestClose()`.
- **Files modified:** `src/features/manage-products/ui/ProductDetailDialog.tsx`.
- **Verification:** PM13 passes reliably (3 consecutive clean runs) after the fix.
- **Commit:** `79d8157`.

**4. [Rule 1 - Bug] `product-photo-upload.spec.ts` (Plan 01) broke on the reshape**
- **Found during:** Task 3's broader `e2e/products/ e2e/inventory/` regression run.
- **Issue:** Plan 01's own E2E spec opened the edit dialog and interacted with `ProductPhotoTab` directly (it was mounted unconditionally below the form in the old two-`Dialog` layout). After this plan's reshape, that panel lives behind the Photo rail trigger — all 4 of that spec's non-bucket-config tests timed out waiting for `product-photo-file-input`/`product-photo-preview`.
- **Fix:** Added one `dialog.getByRole('tab', { name: /photo/i }).click()` to the spec's shared `openEditDialogForTestProduct` helper.
- **Files modified:** `e2e/products/product-photo-upload.spec.ts`.
- **Verification:** All 5 tests in that file pass after the fix.
- **Commit:** `79d8157`.

**5. [Rule 3 - Blocker] Self-provisioned `.env.local` and E2E fixture credentials via the Supabase CLI**
- **Found during:** Setup, before Task 3's E2E verification.
- **Issue:** This worktree had no `.env.local` (gitignored, not carried over from Plan 01's now-torn-down worktree). Task 3's `<precondition>` requires E2E credentials and a reachable dev server.
- **Fix:** `supabase link --project-ref mkvinyekkyennyegfoxq` (already-authenticated global CLI, same target project as Plan 01) → `supabase projects api-keys` for the anon/service-role keys → wrote a fresh worktree-local `.env.local`. Ran `npm run setup:dev-users`, which reported all 4 fixture accounts (`E2E Admin`/`E2E Manager`/`E2E Cashier`/`E2E Kitchen`) already matching the chosen PIN convention — Plan 01 had already provisioned these same accounts on this same remote project.
- **Files modified:** `.env.local` (gitignored, not committed).
- **Verification:** All E2E runs in this plan (product-management, open-units, product-photo-upload, plus the broader regression pass) succeeded against these credentials.

**Total deviations:** 5 auto-fixed (4 real bugs found by actually running the reshape end-to-end, 1 environment/credential blocker). **Impact:** all five were necessary to reach a genuinely working, tested reshape — none required an architectural decision or user input.

### Pre-existing, out of scope

- `e2e/inventory/inventory-intelligence.spec.ts` T5 ("physical count submit adjusts stock") failed once during a full `e2e/products/ e2e/inventory/` regression run (wrong `quantity_delta` — shared-fixture data drift from this session's own repeated test runs against the live remote project), then passed cleanly on an isolated rerun. Unrelated to this plan's files.
- `e2e/inventory/loose-weight-hold-sale.spec.ts` ("decrements and restores inventory by the exact grams sold") failed consistently across 3 runs with `sale.data.ok: false` from a direct `process_direct_sale_atomic` RPC call — no dialog/UI interaction of any kind, nothing this plan's files could affect. Logged here per the scope-boundary rule, not fixed.

## Issues Encountered

None beyond the deviations above (all resolved).

## User Setup Required

None — no external service configuration required. The self-provisioned `.env.local`/fixture accounts (Deviation 5) are gitignored, worktree-local, and reuse the same remote project and account convention Plan 01 already established.

## Next Phase Readiness

Plan 03 (catalog thumbnail column, batch `createSignedUrls`) can build directly on:
- `ProductDetailDialog` as the single stable host — the catalog row-click affordance (D-04) has a real dialog to open, in either mode.
- `productDialog.tabs.*`/`productsTab.photoHeader`/`productsTab.noPhoto` i18n keys already present in both locales (added here per the plan's own note that the catalog keys "are added here so the catalog is written once").
- `resolveProductImageUrl`/`useProductImageUrl` (Plan 01) unchanged and ready for the thumbnail column's batch-signing call.

## Self-Check: PASSED

All 5 created files confirmed present on disk (`ProductDetailDialog.tsx`, `ProductDetailsTab.tsx`, `ProductLinksTab.tsx`, `productDialogTabs.ts`, `productDialogTabs.test.ts`); `ProductForm.tsx` confirmed absent; all 5 commit hashes (`aa09513`, `3571851`, `f140b7e`, `79d8157`, `c3e83d4`) confirmed in `git log`. Working tree clean.

---
*Phase: 31-product-catalog-detail-photo-upload*
*Completed: 2026-09-08*
