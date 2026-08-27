---
phase: 18-barcode-scan-product-peek-window
plan: 02
subsystem: ui
tags: [tauri, webviewwindow, react, i18n, product-detail]

requires:
  - phase: 18-01
    provides: "ensurePeekWindowShown/BARCODE_SCANNED_EVENT/ADD_TO_CART_EVENT constants, WeightEntryDialog onConfirm override, CheckoutPanel scan/relay wiring, productPeekPanel.windowTitle i18n key"
provides:
  - "?window=peek bootstrap branch in main.tsx mounting a dedicated PeekApp React tree"
  - "PeekApp.tsx provider shell (ErrorBoundary -> AppConfigProvider -> Toaster -> Providers -> ProductPeekWindow)"
  - "ProductPeekWindow widget: full fetch/loading/error/not-found/populated states, own barcode-scanner instance, piece and sold-by-weight commit paths both gated by getProductRiskFlag/useConfirmRiskyAdd"
  - "wPanels:productPeekPanel.{addToCart,notFoundBody,loadError,noPhoto,unitWeight,unitPiece,stockCount,skuLabel,barcodeLabel} i18n keys (en-US + es-MX)"
affects: ["18-03"]

actuals:
  tokens: 3600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Per-product-id React remount key (key={product.id}) to reset all local UI state on rescan instead of a manual useEffect reset"
    - "Shared PeekWindowShell layout component (scroll area + footer slot) reused across loading/error/not-found/populated states to avoid duplicating the window chrome four times"

key-files:
  created:
    - src/app/PeekApp.tsx
    - src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx
  modified:
    - src/main.tsx
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "Rendered the category color-dot/name row only when product.category is truthy (guard, not a hardcoded fallback category object) — useLookupProductByBarcode's .select() always embeds category:categories(*), so the guard is a defensive no-op in practice, not a designed empty state."
  - "The detail panel's Unit/size row has no separate row label — the unitWeight/unitPiece copy ('Sold by weight (kg)' / 'Sold by piece') is a self-contained sentence, unlike SKU/Barcode which need a preceding label to be legible alone. No new i18n key was needed for a 'Unit' label since UI-SPEC's Copywriting Contract never defined one."

requirements-completed: [PEEK-01, PEEK-02, PEEK-03, PEEK-04]

coverage:
  - id: D1
    description: "?window=peek in the URL mounts PeekApp (not App/Router) via a query-param branch in main.tsx"
    requirement: "PEEK-01"
    verification:
      - kind: other
        ref: "grep -n \"window=peek|isPeek\" src/main.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "ProductPeekWindow fetches the scanned (trimmed) barcode on mount and renders loading/error/not-found/populated states per 18-UI-SPEC.md, reusing StatusBadge/MoneyDisplay/EmptyState/CardSkeleton verbatim"
    requirement: "PEEK-01"
    verification:
      - kind: other
        ref: "npm run typecheck && npm run lint (both pass clean on src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx)"
        status: pass
    human_judgment: true
    rationale: "Visual rendering of the four UI states (loading/error/not-found/populated layout correctness) requires either a live Tauri window or Plan 18-03's Playwright E2E spec against the dev server — this plan's own <verify> step is typecheck+lint only, per its explicit deferral of visual confirmation to Plan 18-03."
  - id: D3
    description: "Both the piece-counted and sold-by-weight 'Add to Cart' commit paths call getProductRiskFlag/useConfirmRiskyAdd (imported verbatim from entities/product/model, never reimplemented) before emitting ADD_TO_CART_EVENT"
    requirement: "PEEK-02"
    verification:
      - kind: other
        ref: "grep -n \"getProductRiskFlag|useConfirmRiskyAdd\" src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Peek window never fetches or displays cost/supplier price — only product.basePrice via MoneyDisplay"
    requirement: "PEEK-01"
    verification:
      - kind: other
        ref: "grep -c \"cost_price|costPrice\" src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx == 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Populated detail subtree is keyed on product.id so a rescan resets local qty/weight-dialog state instead of carrying stale values"
    requirement: "PEEK-04"
    verification:
      - kind: other
        ref: "grep -n \"key={product.id}\" src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-26
status: complete
---

# Phase 18 Plan 02: Peek Window React Tree Summary

**`?window=peek` bootstrap branch (`main.tsx` -> `PeekApp.tsx`) plus the full `ProductPeekWindow` widget — fetch, own barcode-scanner instance, and both piece/sold-by-weight commit paths reusing `getProductRiskFlag`/`useConfirmRiskyAdd`/`WeightEntryDialog` verbatim.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-26
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `main.tsx` branches on `new URLSearchParams(window.location.search).get('window') === 'peek'` to mount `PeekApp` instead of `App`, keeping the `#root` null-check and shared `globals.css` import untouched.
- `src/app/PeekApp.tsx`: mirrors `App.tsx`'s provider order (`ErrorBoundary` -> `AppConfigProvider` -> `Toaster` -> `Providers`) minus `OfflineBanner`/`ClockDriftBanner`/`Router`, rendering `ProductPeekWindow` in `Router`'s place.
- Extended `wPanels:productPeekPanel` (en-US + es-MX) with `addToCart`, `notFoundBody`, `loadError`, `noPhoto`, `unitWeight`, `unitPiece`, `stockCount`, `skuLabel`, `barcodeLabel` alongside Plan 18-01's `windowTitle`.
- `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx`: reads `?barcode=` on mount, calls `useLookupProductByBarcode().lookup(code.trim())`, renders `LoadingStateView`/`ErrorStateView`/`NotFoundStateView`/populated `PeekProductDetail` per 18-UI-SPEC.md's layout (photo hero, category row, name, price, SKU/barcode/unit/stock detail panel, piece `QuantityControl`, footer). Runs its own `useBarcodeScanner` instance that both re-fetches locally (PEEK-04) and relays the code via `BARCODE_SCANNED_EVENT` (D-01/D-02). Both commit paths (piece stepper emitting `ADD_TO_CART_EVENT` directly; sold-by-weight opening `WeightEntryDialog` with the `onConfirm` override from Plan 18-01) first pass through `getProductRiskFlag`/`useConfirmRiskyAdd`, mirroring `ProductGrid.selectProduct` exactly. "Close" always calls `getCurrentWebviewWindow().hide()`, never `.close()`/`.destroy()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bootstrap branch — main.tsx, PeekApp.tsx, remaining productPeekPanel i18n copy** - `f5b09c7` (feat)
2. **Task 2: ProductPeekWindow — full widget** - `095e6cf` (feat)

**Plan metadata:** (this commit, made after this SUMMARY)

## Files Created/Modified

- `src/main.tsx` — `?window=peek` bootstrap branch
- `src/app/PeekApp.tsx` — new provider shell for the peek window
- `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` — new widget, the peek window's entire content (fetch, all UI states, scanner relay, risk-gated commit paths)
- `src/shared/lib/i18n/locales/en-US/wPanels.json`, `es-MX/wPanels.json` — remaining `productPeekPanel.*` copy keys

## Decisions Made

- Category color-dot/name row renders only when `product.category` is present (a guard, not a hardcoded `fallbackCategory` object like `ProductGrid.tsx` uses for its own different reason) — `useLookupProductByBarcode`'s `.select()` always embeds `category:categories(*)`, so this branch is defensive, not a designed empty state.
- The Unit/size detail-panel row has no separate row label — `unitWeight`/`unitPiece` copy ("Sold by weight (kg)" / "Sold by piece") reads as a complete sentence on its own, unlike SKU/Barcode which need a preceding label. UI-SPEC's Copywriting Contract never defined a distinct "Unit" label key, confirming this was the intended shape.
- Inlined a 3-line `productStockTier(product)` function (not exported/shared) rather than importing `InventoryRow.tsx`'s non-exported, `Inventory`-typed `stockTier()` — matches the plan's explicit `read_first` guidance; the three comparisons and tier names are identical so `StatusBadge` renders consistently with every other screen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed dependencies via `npm ci` (worktree had no `node_modules`)**
- **Found during:** Task 1 verification
- **Issue:** This worktree checkout had no `node_modules` directory at all — `npm run typecheck`/`npm run lint` could not run.
- **Fix:** Ran `npm ci --prefer-offline --no-audit --no-fund` to restore the exact dependency set from the committed `package-lock.json` (not a new package install — every dependency was already declared in the lockfile; excluded from the package-manager-install caveat in the deviation rules, which is scoped to adding a package not already in the lockfile).
- **Files modified:** none tracked (node_modules is gitignored)

**2. [Rule 1 - Lint] Fixed import-order and Tailwind shorthand violations via `npm run lint:fix`**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** `@tauri-apps/api/*` imports were ordered after `lucide-react` in `ProductPeekWindow.tsx`, and three Tailwind class pairs (`h-full w-full`, `h-10 w-10`, `h-3 w-3`) should be their shorthand equivalents (`size-full`, `size-10`, `size-3`).
- **Fix:** Ran `npm run lint:fix`, which reordered the imports and merged the Tailwind classes; re-ran `npm run lint` to confirm zero remaining errors.
- **Files modified:** `src/app/PeekApp.tsx`, `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx`
- **Committed in:** `f5b09c7`, `095e6cf` (the fixes landed in each task's own commit, since `lint:fix` ran before either commit was made)

---

**Total deviations:** 2 (1 blocking environment fix, 1 auto-fixable lint cleanup) — no scope creep, no production-code deviation from the plan's specified layout/behavior.
**Impact on plan:** None on scope. Both were necessary to run the plan's own `<verify>` commands (`npm run typecheck && npm run lint`) at all.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 18-03 can now write its Playwright E2E spec (`e2e/checkout/peek-window.spec.ts`) against a real `ProductPeekWindow` — every export it needs (`ensurePeekWindowShown`, `BARCODE_SCANNED_EVENT`/`ADD_TO_CART_EVENT` from Plan 18-01, and this plan's `PeekApp`/`ProductPeekWindow` mounted behind `?window=peek&barcode=<code>`) is real and committed.
- Visual/interaction confirmation of the four UI states (loading/error/not-found/populated) is explicitly deferred to Plan 18-03's Playwright work, per this plan's own `<verification>` section — flagged as `human_judgment: true` on coverage item D2 above for that reason, not because the code is unverified at the type/lint level.
- No blockers.

---
*Phase: 18-barcode-scan-product-peek-window*
*Completed: 2026-08-26*

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk; both task commits
(`f5b09c7`, `095e6cf`) confirmed present in `git log --oneline`.
