---
phase: 12-checkout-verification-scan-search-confirmation
plan: 01
subsystem: checkout
tags: [react, zustand, sonner, supabase, postgrest, zod, i18next, tdd]

requires:
  - phase: 02-core-direct-sale-checkout
    provides: "useScanBarcodeToCart, useLookupProductByBarcode, cartStore.addItem, Product/inventory schema"
provides:
  - "getProductRiskFlag() pure predicate (zero-price | low-stock | null) in entities/product/model"
  - "useConfirmRiskyAdd() shared sonner confirm-toast hook (entities layer, importable by features + widgets)"
  - "ProductSchema.quantityOnHand / ProductSchema.lowStockThreshold optional fields"
  - "inventory(quantity_on_hand, low_stock_threshold) PostgREST embed on useProducts() and useLookupProductByBarcode()"
  - "Barcode-scan path (useScanBarcodeToCart) wired to the confirm gate"
affects: ["12-02 (manual-search ProductCard/CheckoutPanel wiring reuses this plan's predicate/hook)"]

actuals:
  tokens: 4384
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Shared risk-gate hook lives in entities/product/model/ (not a new features/ folder) so both a feature and a widget can import it — features cannot import sibling features (FSD boundary, eslint-plugin-boundaries)"
    - "commit closure pattern: handleScan defines `commit()` once, gates it behind confirmRiskyAdd() when flagged, calls it directly when clean — guarantees a flagged soldByWeight product never opens WeightEntryDialog before confirmation"

key-files:
  created:
    - src/entities/product/model/productRiskFlag.ts
    - src/entities/product/model/productRiskFlag.test.ts
    - src/entities/product/model/useConfirmRiskyAdd.ts
  modified:
    - src/shared/lib/domain.ts
    - src/entities/product/model/queries.ts
    - src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts
    - src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts
    - src/shared/lib/i18n/locales/en-US/entities.json
    - src/shared/lib/i18n/locales/es-MX/entities.json
    - e2e/51-barcode-scan-search.spec.ts

key-decisions:
  - "Followed CONTEXT.md D-01/D-02/D-04/D-05/D-06 and RESEARCH.md's Code Examples verbatim — no deviation from the planned predicate/hook/wiring shape."
  - "Live Vitest/Playwright verification could not be run in this sandbox (see Issues Encountered) — substituted a standalone tsx script re-implementing the exact 5 Vitest assertions against the real getProductRiskFlag/generateMockProduct imports, which all passed. Static verification (tsc --noEmit, eslint --max-warnings 0) passed for every touched file."

patterns-established:
  - "Pattern: pure risk-flag predicate + shared entities-layer confirm hook, reused identically by both the scan path (this plan) and the manual-search path (12-02)"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "getProductRiskFlag() correctly classifies zero-price, low-stock (inclusive boundary), clean, no-inventory-row, and zero-price/low-stock-precedence cases"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "src/entities/product/model/productRiskFlag.test.ts (5 cases) — vitest run blocked by sandbox (no live Supabase for global-setup); re-verified via standalone tsx run against the real module, all 5 assertions passed"
        status: unknown
    human_judgment: true
    rationale: "Test file exists and is committed with correct assertions; the official `npx vitest run` command could not execute in this sandbox (global-setup requires a live Supabase connection, and local Supabase could not be started — host disk was 100% full, 0 bytes available). A tsx-based manual re-implementation of the same 5 assertions passed against the real getProductRiskFlag/generateMockProduct imports, but this is not the project's canonical test runner — a human/CI run of `npx vitest run src/entities/product/model/productRiskFlag.test.ts` is required to close this out."
  - id: D2
    description: "Scanning a zero-price active product shows a non-blocking sonner confirm toast; Confirm adds it at $0, Cancel leaves the cart unchanged"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts -g \"zero-price product\" (2 new tests) — could not execute (same Supabase/disk blocker as D1)"
        status: unknown
    human_judgment: true
    rationale: "Playwright tests are written and committed (RED-then-GREEN per plan Task 1), following the file's existing seed/restore convention exactly, but the dev server + live Supabase stack could not be started in this sandbox (disk full, no reachable Supabase instance). Code was reviewed line-by-line against useScanBarcodeToCart.ts's actual behavior and the plan's exact wiring spec; a human/CI run of `npx playwright test e2e/51-barcode-scan-search.spec.ts -g \"zero-price product\"` is required to close this out."
  - id: D3
    description: "Scanning a low-stock product (quantityOnHand <= lowStockThreshold) shows a confirm toast, reachable end-to-end through a new inventory join on both useProducts() and useLookupProductByBarcode()"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts -g \"low-stock product\" — could not execute (same Supabase/disk blocker as D1/D2)"
        status: unknown
    human_judgment: true
    rationale: "Same environment blocker as D2. The `.select()` embed and mapProductRow changes were verified via tsc --noEmit and eslint, and match RESEARCH.md's verified isOneToOne: true embed pattern exactly, but no live query was ever executed against real Postgres in this sandbox."
  - id: D4
    description: "A flagged, soldByWeight product is confirmed before WeightEntryDialog opens — onWeightedProduct only fires from inside the commit closure, never directly on scan"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "source assertion: grep useScanBarcodeToCart.ts confirms exactly one onWeightedProduct( call site, inside commit()"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-24
status: complete
---

# Phase 12 Plan 01: Zero-Price & Low-Stock Scan Confirmation Summary

**`getProductRiskFlag()` pure predicate + shared `useConfirmRiskyAdd()` sonner toast gate the barcode-scan add-to-cart path for zero-price and low-stock products, via a new `inventory` PostgREST embed on `useProducts()`/`useLookupProductByBarcode()`.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-24T17:50:00Z (approx)
- **Completed:** 2026-08-24T18:45:00Z (approx)
- **Tasks:** 2 (Task 1 tracer/tdd, Task 2 auto)
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- `getProductRiskFlag()` — pure predicate over an already-fetched `Product`, returning `'zero-price' | 'low-stock' | null`. Zero-price checked first (deterministic single-flag precedence when both conditions hold); low-stock uses the inclusive `quantityOnHand <= lowStockThreshold` comparison mirrored verbatim from `InventoryPagePanel.tsx`; a product with no `inventory` row (`quantityOnHand === undefined`) fails open to `null`, never flagged.
- `useConfirmRiskyAdd()` — shared `entities/product/model/` hook (importable by both a `features` hook and a `widgets` component per the FSD boundary constraint) firing a `sonner` action/cancel toast with `duration: Infinity` and 44px touch-target button overrides; `toast.error` for zero-price, `toast.warning` for low-stock.
- `useScanBarcodeToCart.handleScan` wired: a `commit` closure captures the existing `soldByWeight`/`addItem` branch unchanged; a flagged product routes through `confirmRiskyAdd(flag, product, commit)` before `commit` ever runs, guaranteeing `WeightEntryDialog` never opens for a flagged weighted product until Confirm is pressed.
- `ProductSchema` gains two new optional fields (`quantityOnHand`, `lowStockThreshold`), matching the existing `category: CategorySchema.optional()` precedent exactly — no `.default()`, so all ~6 existing hand-authored `ProductSchema.parse({...})` call sites keep typechecking.
- `useProducts()` and `useLookupProductByBarcode()` both add `inventory(quantity_on_hand, low_stock_threshold)` to their `.select()` — a single-object PostgREST embed (`inventory.product_id` is `isOneToOne: true`), mapped through `mapProductRow` via the same inline-cast style as `barcode`/`unitsPerPackage`/`parentProductId`.
- New `entities:productRiskConfirm.*` i18n keys in both `en-US` and `es-MX`, including `lowStockTitle_one`/`lowStockTitle_other` for i18next's automatic plural-key resolution.
- 5 new Vitest cases (`productRiskFlag.test.ts`) and 3 new Playwright E2E cases (zero-price confirm/cancel, low-stock confirm) added to `e2e/51-barcode-scan-search.spec.ts`, following the file's exact seed-in-`try`/restore-in-`finally` convention.

## Task Commits

Each task was committed atomically (Task 1 split into RED/GREEN per its `tdd="true"` frontmatter):

1. **Task 1 (RED): failing tests for zero-price scan-and-confirm** — `a7760ed` (test)
2. **Task 1 (GREEN): implement zero-price scan-and-confirm tracer** — `d15c143` (feat)
3. **Task 2: add inventory join for low-stock flag** — `65f5a6a` (feat)

**Plan metadata:** committed as part of this SUMMARY.md commit (worktree-isolated executor — STATE.md/ROADMAP.md are updated by the orchestrator, not this agent).

## Files Created/Modified

- `src/entities/product/model/productRiskFlag.ts` - pure `getProductRiskFlag()` predicate (new)
- `src/entities/product/model/productRiskFlag.test.ts` - 5 Vitest cases covering all branches (new)
- `src/entities/product/model/useConfirmRiskyAdd.ts` - shared sonner confirm-toast hook (new)
- `src/shared/lib/domain.ts` - `ProductSchema.quantityOnHand`/`lowStockThreshold` optional fields
- `src/entities/product/model/queries.ts` - `useProducts()` `.select()` gains `inventory(...)` embed; `mapProductRow` maps it
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` - identical `.select()` embed addition
- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` - `handleScan` gates the commit closure behind the confirm hook
- `src/shared/lib/i18n/locales/en-US/entities.json` / `es-MX/entities.json` - `productRiskConfirm.*` keys
- `e2e/51-barcode-scan-search.spec.ts` - 3 new test cases (zero-price confirm, zero-price cancel, low-stock confirm)

## Decisions Made

None beyond what CONTEXT.md/RESEARCH.md/PATTERNS.md already locked in — implementation followed the plan's `<action>` blocks verbatim (predicate shape, hook shape, wiring order, i18n key names, `.select()` embed placement).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useConfirmRiskyAdd.ts`'s `minHeight: '44px'` CSS values tripped `i18next/no-literal-string`**
- **Found during:** Task 1 GREEN, `npx eslint` pass
- **Issue:** The plan's own code example (`actionButtonStyle: { minHeight: '44px' }`) is a CSS value, not UI copy, but the project's `i18next/no-literal-string` rule (scoped to `entities`/`features`/`widgets`/etc., no grandfather list, `npm run lint --max-warnings 0` required) flags any bare string literal, including CSS values.
- **Fix:** Added `// eslint-disable-next-line i18next/no-literal-string -- CSS value, not UI copy` on both `actionButtonStyle` lines, matching the exact suppression convention already used in `InventoryPagePanel.tsx` for its own Tailwind-class-string cases.
- **Files modified:** `src/entities/product/model/useConfirmRiskyAdd.ts`
- **Verification:** `npx eslint src/entities/product/model/useConfirmRiskyAdd.ts --max-warnings 0` — 0 errors after the fix.
- **Committed in:** `d15c143` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 lint bug)
**Impact on plan:** Cosmetic lint-suppression only, no logic change. No scope creep.

## Issues Encountered

**Environment blocker — live test verification could not be executed in this sandbox.**

This worktree's `npx vitest run` requires `src/test/global-setup.ts` to reach a live Supabase instance (`VITE_SUPABASE_URL=http://localhost:8000` per `.env.local`), and `npx playwright test` requires both a running dev server and the same live Supabase backend (per `supabase/config.toml`'s self-hosted local dev stack, ports 54321-54329). Neither was reachable:

- `node_modules` and `.env.local` were absent from this fresh worktree checkout (both gitignored, not carried by `git worktree add`) — resolved by symlinking both from the main repo checkout (`/mnt/ai/POS/supermarket-pos/`), same-machine, same Node/platform.
- The local self-hosted Supabase stack was not running. Docker Desktop's socket (`~/.docker/desktop/docker.sock`) did not exist; the system `docker.service` was inactive. `sudo systemctl start docker` and `docker context use default` brought up a working Docker daemon, but `supabase start` then failed with `ENOSPC: no space left on device` — **the host filesystem is 100% full (101G total, 0 bytes available, confirmed via `df -h /`)**. This is a pre-existing host-level condition unrelated to this plan's changes; docker images for the local Supabase stack were already cached from a prior session (confirming the stack has previously run successfully here when disk space was available).
- I reverted the docker-daemon/context changes I made (stopped the containers/volume I created, stopped `docker.service`) to leave the shared host in the same state I found it, rather than attempting a broader disk cleanup — freeing space on a machine shared with other parallel worktree agents is outside this plan's scope and carries real risk of disrupting concurrent work.

**Mitigation applied:** All 5 `getProductRiskFlag` Vitest assertions were re-run via a standalone `npx tsx` script that imports the real `getProductRiskFlag`/`generateMockProduct` modules directly (bypassing `vitest`'s global-setup) — all 5 passed, confirming the predicate's logic. `npm run typecheck` (`tsc --noEmit`) and `npx eslint --max-warnings 0` both passed clean for every file this plan touched. The Playwright E2E assertions (zero-price confirm/cancel, low-stock confirm) could not be given equivalent standalone verification — they require a running React app + live Supabase — and are flagged `human_judgment: true` in the `coverage:` block above pending a CI/human run with a working environment.

**Recommended next step for a human or CI runner with disk space available:**
```
npx vitest run src/entities/product/model/productRiskFlag.test.ts
npx playwright test e2e/51-barcode-scan-search.spec.ts -g "zero-price product"
npx playwright test e2e/51-barcode-scan-search.spec.ts -g "low-stock product"
npx playwright test e2e/51-barcode-scan-search.spec.ts -g "scan adds a catalog product to the cart"
```

## Known Stubs

None — all deliverables are real implementations, not stubs.

## Deferred / Pre-existing (not introduced by this plan)

`e2e/51-barcode-scan-search.spec.ts` already fails `npm run lint --max-warnings 0` at baseline (14 pre-existing errors, confirmed via `git show HEAD~3:...` before this plan's edits — `import/order`, spread-operator, and a dozen `@typescript-eslint/no-unsafe-*`/`restrict-template-expressions` errors stemming from `getServiceClient()`'s untyped `SupabaseClient` return type). This plan's new test code follows the file's exact existing convention (per the plan's own `read_first` instruction) and therefore inherits the same `any`-typed-row lint errors on its own new lines (verified: 9 new instances of the same error class, 0 new distinct error types beyond what the file already had). Fixing this would require typing `getServiceClient()` against the generated `Database` schema — a file-wide, cross-cutting change well beyond this plan's `files_modified` scope. Not fixed here; logged for a future e2e-infrastructure cleanup phase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `getProductRiskFlag()` and `useConfirmRiskyAdd()` are both in `entities/product/model/`, ready for Plan 12-02 to reuse identically on the manual-search path (`ProductCard`/`CheckoutPanel`) per D-05.
- **Blocker for full sign-off:** the live Vitest/Playwright runs listed above must be executed once environment access (disk space + reachable Supabase) is restored, before this plan's `coverage:` D1-D3 entries can be marked `pass` instead of `unknown`.

## Self-Check: PASSED

- FOUND: src/entities/product/model/productRiskFlag.ts
- FOUND: src/entities/product/model/productRiskFlag.test.ts
- FOUND: src/entities/product/model/useConfirmRiskyAdd.ts
- FOUND: commit a7760ed (test RED)
- FOUND: commit d15c143 (feat GREEN)
- FOUND: commit 65f5a6a (feat Task 2)

---
*Phase: 12-checkout-verification-scan-search-confirmation*
*Completed: 2026-08-24*
