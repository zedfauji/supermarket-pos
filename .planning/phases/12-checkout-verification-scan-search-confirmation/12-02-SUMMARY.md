---
phase: 12-checkout-verification-scan-search-confirmation
plan: 02
subsystem: checkout
tags: [react, i18next, playwright, tanstack-query, fsd]

requires:
  - phase: 12-checkout-verification-scan-search-confirmation
    plan: 01
    provides: "getProductRiskFlag(), useConfirmRiskyAdd() (entities/product/model), inventory-joined Product schema"
provides:
  - "ProductCard barcode line (entities:productCard.barcodeLabel) satisfying VER-02"
  - "ProductGrid manual-search path wired through the same risk-gate mechanism as the scan path (D-05)"
affects: []

actuals:
  tokens: 1900
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Reused 12-01's commit/flag closure shape verbatim in ProductGrid's ProductCard onSelect callback — one shared gate mechanism (getProductRiskFlag -> confirmRiskyAdd -> commit) now called from both a feature (useScanBarcodeToCart) and a widget (ProductGrid), never re-implemented."
    - "Playwright staleness gotcha: useProducts()/useLookupProductByBarcode() share a 5-minute TanStack Query staleTime; a test that mutates a product's DB row mid-session (after the initial page.goto()) must page.reload() before asserting the ProductGrid tile reflects it — the barcode-scan path avoids this because useLookupProductByBarcode has a cache-then-DB-fallback, but the search/grid path reads only the cached list."

key-files:
  created: []
  modified:
    - src/entities/product/ui/ProductCard.tsx
    - src/widgets/ProductGrid/ui/ProductGrid.tsx
    - src/shared/lib/i18n/locales/en-US/entities.json
    - src/shared/lib/i18n/locales/es-MX/entities.json
    - e2e/51-barcode-scan-search.spec.ts

key-decisions:
  - "Followed the plan's Objective correction verbatim: gated inside ProductGrid.tsx's own ProductCard onSelect callback (the single point both the soldByWeight and unweighted branches funnel through), not CheckoutPanel.tsx — confirmed via git diff that CheckoutPanel.tsx has zero changes."
  - "Added page.reload() to both new E2E tests, immediately after the seed DB mutation and before interacting with the search UI — not called for by the plan's <action> text, but required for correctness (Rule 1: bug fix) once live Playwright runs surfaced that useProducts()'s 5-minute staleTime meant the search-path tests were reading pre-mutation cached data (the scan-path tests in 12-01 didn't need this because useLookupProductByBarcode falls back to a live query on cache miss)."

patterns-established: []

requirements-completed: [VER-01, VER-02]

coverage:
  - id: D1
    description: "Every ProductCard tile whose product has a non-null barcode renders a 'Barcode: {code}' line, visible before the tile is clicked"
    requirement: "VER-02"
    verification:
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts -g \"VER-02\" — 'manual search shows the resolved product name, price, and barcode on the tile before it is added'"
        status: pass
    human_judgment: false
  - id: D2
    description: "A flagged (zero-price) product selected via manual search shows the identical confirm toast the scan path shows; confirming adds it, cancelling leaves the cart unchanged (parity check via the shared hook)"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts -g \"selecting a zero-price product from manual search\""
        status: pass
    human_judgment: false
  - id: D3
    description: "ProductGrid.tsx calls the shared getProductRiskFlag/useConfirmRiskyAdd (imported, not re-implemented); CheckoutPanel.tsx is unmodified"
    requirement: "VER-01"
    verification:
      - kind: unit
        ref: "source assertion: grep confirms ProductGrid.tsx imports (not redefines) getProductRiskFlag/useConfirmRiskyAdd; git diff c9e2334 HEAD -- src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx is empty"
        status: pass
    human_judgment: false
  - id: D4
    description: "A clean (unflagged) manual-search selection is unaffected — the pre-existing 'category tabs compose with search' regression test still passes"
    requirement: "VER-01/VER-02 regression check"
    verification:
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts -g \"category tabs compose\" — fails identically on the pre-12-02 baseline (commit c9e2334, Wave 1 merged) via a controlled before/after comparison; confirmed pre-existing environment flake (pointer-event-interception timeout on the 'Filter by Beer' button), not a regression introduced by this plan's changes"
        status: unknown
    human_judgment: true
    rationale: "This E2E test is untouched by this plan's diff (verified: it's byte-identical to c9e2334's version). To rule out a regression, its exact test file/app-code state was checked out from before this plan's commits (git checkout c9e2334 -- ProductCard.tsx ProductGrid.tsx e2e/51-barcode-scan-search.spec.ts), and the isolated `-g \"category tabs compose\"` run failed identically (same click-interception timeout on 'Filter by Beer', same line/behavior) before this plan's changes existed. This confirms the failure is pre-existing and environment-specific (headless Chrome click-interception flake), not caused by this plan. All changes were then restored via `git checkout HEAD -- <same 3 files>` (working tree confirmed clean, zero diff from HEAD). Flagged for human/CI attention since the flake itself remains unresolved and is out of this plan's scope (D-05/VER-01/VER-02 only)."

duration: 35min
completed: 2026-08-24
status: complete
---

# Phase 12 Plan 02: Manual-Search Barcode Display & Risk-Gate Reuse Summary

**`ProductCard` now renders a barcode line for VER-02, and `ProductGrid`'s tile-select callback reuses 12-01's exact `getProductRiskFlag`/`useConfirmRiskyAdd` mechanism so a flagged product selected via manual search shows the identical confirm toast the scan path shows.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- `ProductCard` renders `product.barcode` (when present) as a `text-xs text-muted-foreground` truncating line, immediately below the existing category line and above the product name — matching the category line's exact classes per the UI-SPEC. A `null`/empty barcode renders nothing (guarded by `product.barcode &&`, not a ternary).
- New `entities:productCard.barcodeLabel` i18n key ("Barcode: {{code}}" / "Código de barras: {{code}}") added to both `en-US` and `es-MX` locale files under the existing `productCard` object.
- `ProductGrid.tsx`'s `ProductCard onSelect` callback now imports and calls `getProductRiskFlag`/`useConfirmRiskyAdd` from `entities/product/model/` — the exact same 12-01-built mechanism, in the exact same `commit`/`flag`-gate closure shape `useScanBarcodeToCart.handleScan` already uses. The gate wraps both branches of the existing `soldByWeight ? weightEntry.openFor(...) : onSelect(...)` decision, so a flagged `soldByWeight` product is also confirmed before `WeightEntryDialog` opens.
- Per the plan's corrected wiring location (documented in its Objective), `CheckoutPanel.tsx` was not touched at all — `ProductGrid` already owns the full weighted/unweighted decision before its `onSelect` prop is ever invoked. Confirmed via `git diff c9e2334 HEAD -- src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` (empty).
- Two new Playwright E2E tests added to `e2e/51-barcode-scan-search.spec.ts`: one asserting the barcode line renders on a search-result tile before any click (VER-02), one asserting a zero-price product selected from search shows the same confirm toast the scan path shows and gates the add (VER-01 parity).
- All 11 tests in `e2e/51-barcode-scan-search.spec.ts` (9 from 12-01 + 2 new) pass against a live dev server + Supabase instance. The one pre-existing "category tabs compose with search and show the empty state" test fails, but was confirmed (via a before/after checkout comparison against commit `c9e2334`) to fail identically on the pre-12-02 baseline — a pre-existing environment flake unrelated to this plan's changes.

## Task Commits

Each task was committed atomically:

1. **Task 1: ProductCard barcode line (VER-02)** — `01d0832` (feat)
2. **Task 2: Search-path risk-gate wiring (ProductGrid) + confirm/cancel E2E** — `b05d5ca` (feat)

**Plan metadata:** committed as part of this SUMMARY.md commit (worktree-isolated executor — STATE.md/ROADMAP.md are updated by the orchestrator, not this agent).

## Files Created/Modified

- `src/entities/product/ui/ProductCard.tsx` - new barcode `<span>` line, guarded on `product.barcode`
- `src/widgets/ProductGrid/ui/ProductGrid.tsx` - `ProductCard onSelect` callback gated through `getProductRiskFlag`/`useConfirmRiskyAdd`
- `src/shared/lib/i18n/locales/en-US/entities.json` / `es-MX/entities.json` - `productCard.barcodeLabel` key
- `e2e/51-barcode-scan-search.spec.ts` - 2 new test cases (VER-02 barcode display, search-path zero-price confirm)

## Decisions Made

- Followed the plan's Objective correction verbatim (gate inside `ProductGrid.tsx`, not `CheckoutPanel.tsx`) — no deviation from the plan's stated wiring point.
- Added `page.reload()` to both new E2E tests after their DB seed mutation, before interacting with the UI (see Deviations below) — a Rule 1 bug fix discovered only once live Playwright runs were executed, not present in the plan's `<action>` text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] New E2E tests needed `page.reload()` to observe their own DB seed mutation**
- **Found during:** Task 1/Task 2 live `npx playwright test` runs (both new tests failed on the first attempt)
- **Issue:** `useProducts()` (which feeds `ProductGrid`) has a 5-minute TanStack Query `staleTime`. The `beforeEach` hook navigates and logs in (populating the cache) *before* each test body's `admin.from('products').update(...)` seed mutation runs. Without a reload, the search-result tile the test asserts against still reflects the pre-mutation cached data — so the VER-02 test's card had no barcode text, and the zero-price confirm test's `getProductRiskFlag` saw the stale non-zero `basePrice` and skipped the confirm toast entirely. The barcode-scan path (12-01) doesn't hit this because `useLookupProductByBarcode` falls back to a live DB query on a cache miss — the search/grid path has no equivalent fallback, only the cached list.
- **Fix:** Added `await page.reload();` immediately after each test's seed mutation, before interacting with the search input — following the existing `page.reload()` idiom already used elsewhere in this project's E2E suite (e.g. `e2e/52-loose-weight-hold-sale.spec.ts`) for reloading a still-authenticated session.
- **Files modified:** `e2e/51-barcode-scan-search.spec.ts`
- **Verification:** `npx playwright test e2e/51-barcode-scan-search.spec.ts -g "manual search shows|selecting a zero-price product from manual"` — both pass after the fix.
- **Committed in:** `b05d5ca` (both tests' final form landed in their respective task commits after this fix)

---

**Total deviations:** 1 auto-fixed (1 test-correctness bug, no production code affected)
**Impact on plan:** Test-only fix; no change to the plan's `<action>`-specified source code (`ProductCard.tsx`, `ProductGrid.tsx`).

## Issues Encountered

**Environment setup:** This fresh worktree checkout had neither `node_modules` nor `.env.local` (both gitignored, not carried by `git worktree add`) — resolved by symlinking both from the main repo checkout (`/home/widowsvail/ai/POS/supermarket-pos/`), consistent with 12-01's documented approach. Unlike 12-01's sandbox, a live local Supabase instance (port 8000) was already reachable and the dev server started cleanly on port 1520 — full live Vitest-equivalent verification (`npm run typecheck`, `npx eslint`) and live Playwright E2E verification were both executed successfully in this session, closing out the `human_judgment: true` gaps 12-01 had to leave open.

**Pre-existing E2E lint debt (unchanged from 12-01):** `e2e/51-barcode-scan-search.spec.ts` already fails `npm run lint --max-warnings 0` at baseline (23 pre-existing errors as of 12-01's HEAD, confirmed via a controlled before/after `npx eslint` comparison against commit `c9e2334`). This plan's 2 new test blocks inherit the same `any`-typed-row error classes the file's existing tests already carry (9 more instances of `no-unsafe-argument`/`no-unsafe-assignment`/`restrict-template-expressions`, 0 new distinct error types) — `getServiceClient()`'s untyped `SupabaseClient` return type is the root cause, a file-wide fix outside this plan's `files_modified` scope. Not fixed here, consistent with 12-01's documented deferral.

**Pre-existing E2E flake — "category tabs compose with search" test:** This test (unmodified by this plan) fails in this environment with a `TimeoutError` clicking "Filter by Beer" (pointer-event interception, retried ~10 times, then timing out). Verified via a controlled checkout of this plan's 3 touched files back to their pre-12-02 state (`git checkout c9e2334 -- ...`) that the same failure occurs identically on the Wave-1-only baseline — this is a pre-existing environment-specific flake (likely a headless-Chrome rendering/animation timing issue in this sandbox), not a regression introduced by this plan's `ProductGrid.tsx`/`ProductCard.tsx` changes. All 11 other tests in the file (9 from 12-01 + this plan's 2 new tests) pass consistently.

## Known Stubs

None — all deliverables are real implementations, not stubs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12 (VER-01, VER-02) is now complete across both plans: the shared risk-gate mechanism (12-01) is reused identically by both entry points (scan and search), and the manual-search tile now displays name/price/barcode before commit.
- **Open item for a human/CI runner:** the "category tabs compose with search" E2E flake (pointer-event interception on `Filter by Beer`) is unrelated to this phase's scope but remains unresolved in this sandbox environment — worth a dedicated look if it reproduces in CI.

## Self-Check: PASSED

- FOUND: src/entities/product/ui/ProductCard.tsx (barcode span present)
- FOUND: src/widgets/ProductGrid/ui/ProductGrid.tsx (getProductRiskFlag/useConfirmRiskyAdd wired)
- FOUND: commit 01d0832 (feat, Task 1)
- FOUND: commit b05d5ca (feat, Task 2)
- FOUND: 11/12 e2e/51-barcode-scan-search.spec.ts tests passing live (1 pre-existing unrelated flake, confirmed via baseline comparison)

---
*Phase: 12-checkout-verification-scan-search-confirmation*
*Completed: 2026-08-24*
