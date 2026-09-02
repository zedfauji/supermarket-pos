---
phase: 27-promotions-discount-management
plan: 03
subsystem: ui
tags: [react, zustand, tanstack-query, playwright, i18n]

requires:
  - phase: 27-promotions-discount-management (Plan 01)
    provides: promotions table, process_direct_sale_atomic's server-side promotion recompute, evaluateBestPromotion(), usePromotions()
provides:
  - Live, scan-time promotion-discounted pricing wired into cartStore.addItem/addWeightedItem
  - A cart-line "X% off" discount Badge + renamed Zap indicator on CartItem
  - A checkout-sale RPC-submission bug fix required for any promoted item to actually check out
  - Playwright E2E proof of PROMO-03 (product-scoped and category-scoped)
affects: [27-04, 27-05, 27-06, 27-07]

actuals:
  tokens: 8200
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Latest-ref pattern (resolveUnitPriceRef) to avoid a stale-closure trap on a mount-once Tauri event listener whose data depends on async React Query state resolved after mount."
    - "cartStore.item.unitPrice/lineTotal are display-only fields once a resolved (promotion) price can diverge from product.basePrice; RPC submission must always derive its own unit_price from the product's raw catalog price, never from the cart's display state."

key-files:
  created:
    - src/entities/tab/ui/CartItem.test.tsx
    - e2e/checkout/promotion-live-price.spec.ts
    - .planning/phases/27-promotions-discount-management/deferred-items.md
  modified:
    - src/entities/tab/model/cartStore.ts
    - src/entities/tab/model/cartStore.test.ts
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx
    - src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx
    - src/entities/tab/ui/CartItem.tsx
    - src/shared/lib/i18n/locales/en-US/entities.json
    - src/shared/lib/i18n/locales/es-MX/entities.json
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/features/checkout-sale/model/useCheckoutSale.test.ts

key-decisions:
  - "cartStore.item.unitPrice/lineTotal became genuinely dual-purpose the moment a discounted price could flow into them (this plan's Task 1) — display AND (via useCheckoutSale's cartItemsToRpcItems) RPC submission. Since process_direct_sale_atomic's PRICE_MISMATCH check validates the submitted unit_price against the product's undiscounted catalog price, cartItemsToRpcItems was fixed to always derive its own unit_price from product.basePrice (weight-adjusted via calcWeightedLineTotal), independent of whatever cartStore.item.unitPrice currently displays. This was not scoped in 27-03's files_modified but is a direct, checkout-breaking consequence of Task 1's own change (Rule 1)."
  - "ProductGrid.tsx's own local WeightEntryDialog render (mode=\"add\", no onConfirm — the direct grid-click path for a loose-weight product not routed through the Product Peek window) was left unwired: the plan's files_modified list and Task 1's <action> text explicitly scope the wiring to three call sites only (ProductGrid's onSelect prop owned by CheckoutPanel, and both branches of the peek window's ADD_TO_CART_EVENT listener), never ProductGrid.tsx itself. A cashier adding a promoted loose-weight product directly from the grid (not via barcode/peek) will not see the discount until a future plan wires ProductGrid.tsx the same way. Documented, not silently dropped."

patterns-established:
  - "Zap-icon promotion indicator: renamed cartItem.happyHourPrice -> cartItem.promotionApplied, recolored pos-warning -> pos-accent (near-expiry keeps pos-warning) — establishes pos-accent as the promotion-discount visual language across the cart line."

requirements-completed: [PROMO-03]

coverage:
  - id: D1
    description: "evaluateBestPromotion() wired into every add-to-cart path this plan owns: ProductGrid onSelect, and both branches (weighted/non-weighted) of the peek window's ADD_TO_CART_EVENT relay in CheckoutPanel — a qualifying product's cart line stores the discounted unitPrice/pricePerKg"
    requirement: "PROMO-03"
    verification:
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#addWeightedItem with pricePerKgOverride stores that per-kg price"
        status: pass
      - kind: unit
        ref: "src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx#mode=add, no onConfirm, pricePerKgOverride set: threads it through to addWeightedItem"
        status: pass
      - kind: e2e
        ref: "e2e/checkout/promotion-live-price.spec.ts#product-scoped promotion shows a live discount and charges the discounted total; unrelated product stays full price"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cart-line 'X% off' discount Badge + renamed/recolored Zap indicator, never rendering the promotion's name"
    requirement: "PROMO-03"
    verification:
      - kind: unit
        ref: "src/entities/tab/ui/CartItem.test.tsx#shows the Zap icon and a rounded X% off Badge when unitPrice is discounted"
        status: pass
      - kind: e2e
        ref: "e2e/checkout/promotion-live-price.spec.ts#category-scoped promotion applies via category_id alone, with no product-level promotion row"
        status: pass
    human_judgment: false
  - id: D3
    description: "process_direct_sale_atomic remains the sole checkout-time price authority — the client's discounted display price is never submitted as a trusted unit_price, and a real checkout with an active promotion actually completes and charges the discounted total"
    requirement: "PROMO-03"
    verification:
      - kind: unit
        ref: "src/features/checkout-sale/model/useCheckoutSale.test.ts#submits the product catalog basePrice as unit_price, not a discounted cart display price"
        status: pass
      - kind: e2e
        ref: "e2e/checkout/promotion-live-price.spec.ts#product-scoped promotion ... charges the discounted total (payments.amount assertion)"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-09-02
status: complete
---

# Phase 27 Plan 3: Live Promotion Price Display Summary

**Wired `evaluateBestPromotion()` into every cart-entry path this plan owns, added the cart-line "X% off" discount badge, and fixed a checkout-breaking RPC-submission bug (client display price vs. the RPC's undiscounted catalog-price validation) that Task 1's own change introduced — proven end-to-end with a real Playwright checkout against a live database.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-09-02T16:09:00Z (approx, first read)
- **Completed:** 2026-09-02T16:36:38Z
- **Tasks:** 3 (plus one Rule-1 bug-fix deviation between Task 2 and Task 3)
- **Files modified:** 12 (3 created, 9 modified — excluding this SUMMARY and deferred-items.md)

## Accomplishments
- `cartStore.addWeightedItem` gained a `pricePerKgOverride` parameter mirroring `addItem`'s existing `unitPrice` override; `updateWeightedItem` now reprices off the line's own resolved `unitPrice` instead of `product.basePrice`, so editing a discounted weighted line's weight no longer silently drops the discount
- `CheckoutPanel` resolves the live promotion/expiry-triggered price via `evaluateBestPromotion()` and applies it at the ProductGrid `onSelect` callback and both branches of the Product Peek window's `ADD_TO_CART_EVENT` relay, using a stable ref to avoid a stale-closure trap on the mount-once Tauri listener
- `CartItem` shows a renamed/recolored (`pos-accent`, not `pos-warning`) Zap indicator plus a compact, rounded "X% off" `Badge` for any discounted line — never the promotion's name
- **Critical bug fix (Rule 1):** `useCheckoutSale`'s `cartItemsToRpcItems` was submitting the cart's now-possibly-discounted `unitPrice`/`lineTotal` directly as the RPC's per-item `unit_price` — but `process_direct_sale_atomic`'s `PRICE_MISMATCH` check validates that field against the product's undiscounted catalog price and computes its own discount independently. Left unfixed, checkout would fail for every promoted item. Fixed to always derive `unit_price` from `product.basePrice` (weight-adjusted via `calcWeightedLineTotal`), confirmed by a real Playwright checkout that pays the discounted total
- `e2e/checkout/promotion-live-price.spec.ts`: two real, headless Playwright tests proving PROMO-03 end to end — a product-scoped promotion (cart-line discount indicator, checkout charges the discounted total, an unrelated product on the same cart is unaffected) and a category-scoped promotion (no product-level row) resolving through the same client path

## Task Commits

Each task was committed atomically; one additional bug-fix commit landed between Task 2 and Task 3:

1. **Task 1: Wire evaluateBestPromotion into every add-to-cart path** - `2e2e4a5` (feat)
2. **Task 2: Cart-line discount badge** - `c257d77` (feat)
3. **[Rule 1 bug fix] RPC unit_price must stay the raw catalog price** - `23f5704` (fix)
4. **Task 3: E2E proof of PROMO-03** - `2c7fd5c` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/entities/tab/model/cartStore.ts` - `addWeightedItem` gains `pricePerKgOverride`; `updateWeightedItem` reprices off `item.unitPrice`
- `src/entities/tab/model/cartStore.test.ts` - coverage for the override and the `updateWeightedItem` fix
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` - `resolveUnitPrice` helper + stable ref, wired into `onSelect` and the `ADD_TO_CART_EVENT` listener
- `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` - accepts `pricePerKgOverride` as a plain prop (stays a presentation component)
- `src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` - updated the pre-existing 2-arg `addWeightedItem` assertion for the new 3-arg signature, added an override-threading test
- `src/entities/tab/ui/CartItem.tsx` - discount detection, renamed/recolored Zap icon, "X% off" `Badge`
- `src/entities/tab/ui/CartItem.test.tsx` - new test file (none existed) covering discount/no-discount/rounding/no-name-leak
- `src/shared/lib/i18n/locales/{en-US,es-MX}/entities.json` - `cartItem.happyHourPrice` → `cartItem.promotionApplied`, new `cartItem.discountBadge`
- `src/features/checkout-sale/model/useCheckoutSale.ts` - `cartItemsToRpcItems` submits `product.basePrice` (weight-adjusted), not the display `unitPrice`/`lineTotal`
- `src/features/checkout-sale/model/useCheckoutSale.test.ts` - two regression tests for the fix (non-weighted and weighted items)
- `e2e/checkout/promotion-live-price.spec.ts` - PROMO-03 E2E proof
- `.planning/phases/27-promotions-discount-management/deferred-items.md` - logs a pre-existing, out-of-scope `HomeDashboard.test.tsx` failure discovered during the full-suite verification run

## Decisions Made
- Fixed `useCheckoutSale.ts`'s RPC submission (outside 27-03's declared `files_modified`) because it is a direct, checkout-breaking consequence of Task 1's own change — a Rule 1 auto-fix, not scope creep. See `key-decisions` in frontmatter for the full rationale.
- Left `ProductGrid.tsx`'s own local weight-entry dialog render unwired (direct grid-click on a loose-weight product, not via barcode/peek) — out of this plan's literal `files_modified`/`<action>` scope; documented as a known gap rather than silently expanding scope further.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useCheckoutSale`'s RPC submission used the discounted cart display price instead of the raw catalog price**
- **Found during:** Between Task 2 and Task 3, while reasoning through what Task 3's E2E checkout would actually submit to `process_direct_sale_atomic`
- **Issue:** `cartItemsToRpcItems` submitted `item.unitPrice`/`item.lineTotal` (now potentially promotion-discounted per Task 1) directly as the RPC's per-item `unit_price`. The RPC's `PRICE_MISMATCH` check compares that field against the product's own undiscounted catalog price (`products.base_price`, weight-adjusted) with only a 0.01 tolerance — it independently recomputes and applies any promotion server-side. Left as-is, any promoted item would fail checkout with `PRICE_MISMATCH`.
- **Fix:** `cartItemsToRpcItems` now always derives `unit_price` from `item.product.basePrice` (via `calcWeightedLineTotal` for weighted items), leaving `cartStore`'s `unitPrice`/`lineTotal` as pure display fields. The RPC's own independently-computed discounted total is still what gets compared against the submitted payment amount (T-27-07's trust boundary, untouched).
- **Files modified:** `src/features/checkout-sale/model/useCheckoutSale.ts`, `src/features/checkout-sale/model/useCheckoutSale.test.ts`
- **Verification:** Two new unit tests (non-weighted + weighted) asserting the RPC receives the catalog price, not the discounted display price; confirmed live by Task 3's E2E test actually completing a checkout with an active promotion and charging the discounted total.
- **Committed in:** `23f5704`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — without this fix, PROMO-03's entire feature would make every promoted-item checkout fail. No scope creep beyond the one file this bug lived in.

## Issues Encountered
- **Concurrent multi-session git activity on the shared working tree (not a code issue).** During this plan's execution, at least one other concurrent GSD/agent session on this machine performed `git checkout`, `cherry-pick`, and `reset` operations against this same physical working directory (not an isolated worktree — this plan ran in sequential/degraded mode per the orchestrator's fork-base guard). This repeatedly moved HEAD to an unrelated branch (`phase-26-02-tracer`) mid-task and once caused a task commit to land on that branch instead of `main`. Recovered each time by verifying `git branch --show-current`/`git log` before and after every commit, and cherry-picking the one misplaced commit (`c257d77`, cart-line badge) back onto `main` — no code or history was lost, but this added several extra verification round-trips. All 4 of this plan's task commits are confirmed present on `main`.
- **Pre-existing, unrelated test failure discovered during the full-suite verification run:** `HomeDashboard.test.tsx > gated buttons show lock icon for cashier` expects `8` locked buttons, actual is `9` — caused by Plan 27-02's `/promotions` nav tile (admin-gated), never touched by this plan's files. Logged to `.planning/phases/27-promotions-discount-management/deferred-items.md` and the `WINDOWS.md` ledger (entry #45), not fixed (out of scope).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 27-04 (payment-screen promotion application, `PaymentForm.tsx`/`PaymentModal` retirement of the old discount-scope UI) can build on this plan's `resolveUnitPrice` pattern and the now-correct `cartItemsToRpcItems` RPC contract.
- A cashier adding a promoted loose-weight product directly from the product grid (not via barcode scan → Product Peek) will not see the live discount until `ProductGrid.tsx`'s own local `WeightEntryDialog` render is wired the same way `CheckoutPanel`'s three call sites were — flagged in `key-decisions` above for whichever plan next touches `ProductGrid.tsx`.
- No blockers for Plan 27-04.

---
*Phase: 27-promotions-discount-management*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 3 created files verified present on disk (`CartItem.test.tsx`, `e2e/checkout/promotion-live-price.spec.ts`, `deferred-items.md`); all 4 task/deviation commit hashes (`2e2e4a5`, `c257d77`, `23f5704`, `2c7fd5c`) verified present in git history on `main`.
