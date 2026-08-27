---
phase: 12-checkout-verification-scan-search-confirmation
verified: 2026-08-24T18:49:52Z
status: passed
score: 4/4 roadmap success criteria verified; 21/21 combined plan must-have truths verified (12 in 12-01, incl. 2 backstop, 9 in 12-02, incl. 1 backstop)
behavior_unverified: 0
overrides_applied: 0
---

# Phase 12: Checkout Verification (Scan & Search Confirmation) Verification Report

**Phase Goal:** Cashiers get an automatic, non-blocking confirmation only when a barcode scan or manual-search lookup resolves ambiguously (in practice: zero-price or low-stock, per CONTEXT.md D-01/D-02's narrowing of the literal "multiple products/inactive" wording), catching mismatches without slowing down the fast-checkout happy path.
**Verified:** 2026-08-24T18:49:52Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A barcode scan resolving to a single active, correctly-priced, adequately-stocked product adds it to the cart in one action, no confirmation UI | ✓ VERIFIED | `e2e/51-barcode-scan-search.spec.ts:25` "scan adds a catalog product to the cart" — passed in live run (11/12 suite). `useScanBarcodeToCart.ts`'s `handleScan` calls `commit()` directly when `getProductRiskFlag(product)` returns `null`. |
| 2 | A zero-price or low-stock product (the concrete VER-01 conditions, per D-01/D-02) surfaces a non-blocking confirm toast before add; item absent from cart until confirmed | ✓ VERIFIED | `getProductRiskFlag()` (`src/entities/product/model/productRiskFlag.ts`) — 5 Vitest cases pass live (`npx vitest run`, re-run by this verifier, 5/5 pass). E2E: "scanning a zero-price product shows a confirm toast..." and "scanning a low-stock product... shows a confirm toast" both pass live, asserting the item is absent from `aside` pre-confirm. |
| 3 | Manual-search tile shows the resolved product's name, price, and barcode before commit | ✓ VERIFIED | `ProductCard.tsx` renders `product.barcode` via `t('productCard.barcodeLabel', ...)` guarded by `product.barcode &&` (no blank-line stub). E2E "manual search shows the resolved product name, price, and barcode on the tile before it is added (VER-02)" passes live, asserting barcode text visible on the tile pre-click. |
| 4 | Confirming or dismissing the confirmation correctly adds or rejects the item, verified for both outcomes | ✓ VERIFIED | E2E "...confirming adds it to the cart at $0" and "...cancelling the confirm toast leaves the cart unchanged" both pass live (scan path); "selecting a zero-price product from manual search shows a confirm toast; confirming adds it" passes live (search path). Both Confirm and Cancel branches proven end-to-end. |

**Score:** 4/4 roadmap success criteria verified. 0 present-but-behavior-unverified.

### Plan-Level Must-Have Truths (12-01, scan path)

All 15 non-backstop truths in 12-01's `must_haves.truths` were checked against source and the live E2E/Vitest runs; all verified. Notable ones:

- Zero-price precedence over simultaneous low-stock: `getProductRiskFlag` checks `basePrice === 0` first, returns immediately — confirmed by source read (`productRiskFlag.ts:13`) and Vitest case 5.
- Fail-open on missing inventory row (`quantityOnHand === undefined` never flags low-stock): confirmed by source (`!== undefined` guards) and Vitest case 2.
- `soldByWeight` product confirmed before `WeightEntryDialog` opens: confirmed by source — `onWeightedProduct` is called only inside the `commit` closure in `useScanBarcodeToCart.ts`, which only runs after `confirmRiskyAdd`'s `onConfirm` fires or when `flag` is null (grep: single `onWeightedProduct(` call site).
- `duration: Infinity` + 44px button override: confirmed in `useConfirmRiskyAdd.ts:31,39,45`.
- Reads `inventory.low_stock_threshold` via `Product.lowStockThreshold`, never `products.stock_threshold`: confirmed — `productRiskFlag.ts` has zero references to `stock_threshold`; the field feeding it is `ProductSchema.lowStockThreshold` sourced from the `inventory(...)` PostgREST embed in both `queries.ts` and `useLookupProductByBarcode.ts`.
- 2 backstop-tier truths (sonner's native toast-stacking/max-visible behavior) are appropriately un-tested (no custom queue code was built, matching the plan's own "no code added" claim) — accepted as-is per `verification: backstop`.

### Plan-Level Must-Have Truths (12-02, search path + VER-02)

All 9 non-backstop truths verified:

- Every ProductCard with a non-null barcode renders "Barcode: {code}": confirmed by source (`ProductCard.tsx:56-60`) and E2E.
- Null/empty barcode renders nothing (guard, not ternary): confirmed by source (`product.barcode &&`, not `? :`).
- Barcode line reuses `truncate` class (no new overflow strategy): confirmed (`className="w-full truncate text-xs text-muted-foreground"`).
- Search-path selection reuses the identical `getProductRiskFlag`/`useConfirmRiskyAdd` mechanism, not a second implementation: confirmed — `ProductGrid.tsx` imports both from `@entities/product/model/*`, uses the identical `commit`/`flag`-gate shape as `useScanBarcodeToCart.handleScan`. No second toast/predicate implementation found anywhere in the touched files.
- Flagged, `soldByWeight` search selection confirmed before `WeightEntryDialog` opens: confirmed — `commit` in `ProductGrid.tsx`'s `onSelect` callback wraps both the `weightEntry.openFor` and `onSelect` branches, gated behind `flag`.
- `CheckoutPanel.tsx` left untouched (per the plan's documented wiring correction): confirmed — `git diff c9e2334 846e143 --stat` shows no `CheckoutPanel.tsx` entry, only `ProductCard.tsx` (+5) and `ProductGrid.tsx` (+15/-2).
- Clean search selection unaffected (no regression): confirmed by the live E2E run — pre-existing scan-path/search-path clean-match tests pass unmodified.
- 1 backstop-tier truth (list ordering unchanged) appropriately un-tested — no ordering logic touched by this plan.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/entities/product/model/productRiskFlag.ts` | Pure `getProductRiskFlag()` predicate | ✓ VERIFIED | Exists, exports `ProductRiskFlag`/`getProductRiskFlag`, matches plan's action block verbatim, zero I/O. |
| `src/entities/product/model/productRiskFlag.test.ts` | 5 Vitest cases | ✓ VERIFIED | Exists; `npx vitest run` (re-executed live by this verifier) — 5/5 pass. |
| `src/entities/product/model/useConfirmRiskyAdd.ts` | Shared sonner confirm-toast hook | ✓ VERIFIED | Exists, `toast.error`/`toast.warning` branch, `duration: Infinity`, 44px button overrides, i18n-driven copy. |
| `src/shared/lib/domain.ts` (`ProductSchema` fields) | `quantityOnHand`/`lowStockThreshold` optional | ✓ VERIFIED | Lines 258, 260 — `z.number().int().nonnegative().optional()`, matches `category.optional()` precedent. |
| `src/entities/product/model/queries.ts` (`inventory(...)` embed) | New PostgREST embed + `mapProductRow` mapping | ✓ VERIFIED | `.select()` includes `inventory(quantity_on_hand, low_stock_threshold)`; `mapProductRow` maps via inline cast, `?? undefined` fallback. |
| `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` | Same embed | ✓ VERIFIED | Identical embed string present in `.select()`. |
| `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` | Wired to risk gate | ✓ VERIFIED | Imports `getProductRiskFlag`/`useConfirmRiskyAdd`; `handleScan` gates `commit` behind the flag check. |
| `src/entities/product/ui/ProductCard.tsx` | Barcode line | ✓ VERIFIED | New guarded `<span>` line present, styled per UI-SPEC. |
| `src/widgets/ProductGrid/ui/ProductGrid.tsx` | Risk-gate wiring in `onSelect` | ✓ VERIFIED | `commit`/`flag` closure mirrors the scan-path shape exactly. |
| i18n keys (`entities:productRiskConfirm.*`, `entities:productCard.barcodeLabel`) | en-US + es-MX | ✓ VERIFIED | Both locale files carry all 7 + 1 keys, with `_one`/`_other` plural suffixes for low-stock title. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `useScanBarcodeToCart.handleScan` | `getProductRiskFlag` → `useConfirmRiskyAdd` → `commit` | Direct import + closure | ✓ WIRED | Confirmed by source read; single `onWeightedProduct(` call site inside `commit`. |
| `ProductGrid`'s `ProductCard onSelect` | `getProductRiskFlag` → `useConfirmRiskyAdd` → `commit` | Direct import + closure (identical shape) | ✓ WIRED | Confirmed by source read; `CheckoutPanel.tsx` untouched (diff-verified). |
| `useProducts()`/`useLookupProductByBarcode()` `.select()` | `inventory(quantity_on_hand, low_stock_threshold)` embed | PostgREST single-object embed | ✓ WIRED | Both files' `.select()` strings contain the exact embed; `mapProductRow` (shared by both) reads `row.inventory?.quantity_on_hand`/`.low_stock_threshold`. |
| `ProductCard` | `product.barcode` | Direct render, no new fetch | ✓ WIRED | `product.barcode` already present on every fetched `Product` (unchanged fetch), only its rendering is new. |

### Behavioral Spot-Checks / Live Test Execution (run by this verifier, not taken from SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck (whole project) | `npm run typecheck` | Clean, 0 errors | ✓ PASS |
| Lint (whole `src/`) | `npm run lint` (max-warnings 0) | Clean, 0 errors/warnings (only a boundaries-plugin informational notice, non-blocking) | ✓ PASS |
| `getProductRiskFlag` unit coverage | `npx vitest run src/entities/product/model/productRiskFlag.test.ts` | 5/5 passed | ✓ PASS |
| Full phase E2E suite | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | 11 passed, 1 failed | ⚠️ 1 failure investigated below |

**Investigation of the 1 E2E failure ("category tabs compose with search and show the empty state"):**

This test fails with a `TimeoutError` clicking `getByRole('button', { name: 'Filter by Beer' })` — a click-interception loop where the search `<Input>` and its parent containers repeatedly intercept the pointer event. Independently verified (not trusting 12-02-SUMMARY.md's own before/after claim) via:

1. `git log --oneline --follow -- e2e/51-barcode-scan-search.spec.ts` — this exact test was added in commit `598f191` ("feat(02-02): browse products by category"), i.e. **Phase 2** of this project, ~10 phases before Phase 12. It is not new test coverage introduced by 12-01/12-02.
2. `git log --oneline -3 -- src/entities/product/ui/CategoryTabs.tsx` — last touched in `f5d5516` (a directory-rename chore, pre-dating Phase 12 entirely). `CategoryTabs.tsx`, the component whose button the test clicks, has zero changes from this phase.
3. `git diff c9e2334^ 846e143 --stat -- src/entities/product/ui/ProductCard.tsx src/widgets/ProductGrid/ui/ProductGrid.tsx` — this phase's entire diff to the two touched UI files is `+5/-0` (`ProductCard.tsx`, a single conditional barcode `<span>` inside each card, not near the search input) and `+15/-2` (`ProductGrid.tsx`, hook imports + an inline `commit`/`flag` closure inside the existing `onSelect` callback — no JSX/layout change).

None of this phase's changes touch the `CategoryTabs`/`Input` layout region where the click interception occurs. Combined with the test predating this phase by ~10 phases, this is conclusively a pre-existing environment/layout flake (unrelated to Phase 12's diff), not a regression introduced by this phase. **Verdict: not a blocker for Phase 12; worth a separate, unrelated E2E-infra investigation ticket.**

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VER-01 | 12-01, 12-02 | Non-blocking confirmation on zero-price/low-stock scan or search match; clean match unaffected | ✓ SATISFIED | Live E2E (4 tests) + Vitest (5 cases) all pass; source wiring confirmed on both paths. |
| VER-02 | 12-02 | Cashier sees name/price/barcode on manual-search tile before commit | ✓ SATISFIED | `ProductCard.tsx` barcode line + live E2E "VER-02" test passes. |

No orphaned requirements found — REQUIREMENTS.md maps only VER-01/VER-02 to Phase 12, both claimed and satisfied.

**Minor documentation note (non-blocking):** REQUIREMENTS.md's VER-01 wording (line 12) still reads "multiple products for one barcode, or a product flagged inactive/zero-price" — the literal pre-planning wording. CONTEXT.md D-01/D-02 explain the actual, narrower implemented scope is {zero-price, low-stock} (the "multiple products" case is DB-schema-impossible per the `products.barcode` unique index; "inactive" already routes to the pre-existing "not found" toast, not a new confirmation). CONTEXT.md phrased updating REQUIREMENTS.md wording as optional ("if useful for traceability"), so this is not treated as a gap — flagging for awareness only.

### Anti-Patterns Found

None. Grepped all 8 touched source files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented` — the single hit (`ProductGrid.tsx:79`, `placeholder={t(...)}`) is a legitimate HTML input `placeholder` attribute, not a debt marker.

### Human Verification Required

None. All must-haves resolved to VERIFIED via live-executed automated checks (per this repo's CLAUDE.md mandatory-automated-testing policy — no `human_needed` terminal states are valid here).

### Gaps Summary

No gaps found. Both plans' merged code delivers the phase goal exactly as scoped by CONTEXT.md's D-01 through D-06: a shared, entities-layer risk predicate (`getProductRiskFlag`) and confirm hook (`useConfirmRiskyAdd`) gate both the barcode-scan and manual-search add-to-cart paths identically for zero-price and low-stock products, with `duration: Infinity` non-auto-dismissing toasts, 44px touch targets, correct i18n pluralization, and a `ProductCard` barcode line satisfying VER-02. Typecheck, lint, unit tests, and 11/12 E2E tests all pass under live execution by this verifier (not merely cited from SUMMARY.md). The one E2E failure is independently confirmed pre-existing and unrelated to this phase's diff.

---

_Verified: 2026-08-24T18:49:52Z_
_Verifier: Claude (gsd-verifier)_
