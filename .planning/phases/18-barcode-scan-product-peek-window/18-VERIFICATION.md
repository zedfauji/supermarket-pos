---
phase: 18-barcode-scan-product-peek-window
verified: 2026-08-27T03:36:00Z
status: gaps_found
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Existing e2e/checkout/ automated coverage continues to pass after Phase 18's changes (this project's CLAUDE.md 'Testing & Verification Policy' explicitly bans accepting any non-passing E2E state as a phase end state, and treats existing suite breakage as backlog that must be closed, not left as debt)"
    status: failed
    reason: "Plan 18-01 intentionally changed CheckoutPanel.tsx's onScan behavior (scan now only populates search + opens the peek window; it no longer adds directly to the cart or shows inline 'Product not found'). e2e/checkout/barcode-scan-search.spec.ts still asserts the old, now-removed direct-scan-to-cart UX and was never updated or retired. Independently re-ran `npx playwright test e2e/checkout/barcode-scan-search.spec.ts` against the live dev server: 9 of 12 tests fail with real timeouts/assertion failures (not flakiness) — confirms the SUMMARY/deferred-items.md claim rather than merely trusting it. No later roadmap phase (checked ROADMAP.md Phase 19, the only proposed later phase — Store-Local Durable Printing, unrelated) addresses this, so it does not qualify as a Step 9b deferred item."
    artifacts:
      - path: "e2e/checkout/barcode-scan-search.spec.ts"
        issue: "9 of 12 tests fail: 'scan adds a catalog product to the cart', both zero-price scan tests, the low-stock scan test, the sold-by-weight scan test, both weight/receipt-screen scan-discard tests, 'unknown scan is shown and audited', the inactive-barcode test, and 'category tabs compose with search' — all assert cart/DOM state from the pre-Phase-18 direct-add UX that CheckoutPanel.tsx no longer implements."
    missing:
      - "Update or retire the 9 stale assertions in e2e/checkout/barcode-scan-search.spec.ts to match the new scan-opens-peek-window UX (the actual add-to-cart/guard assertions now belong in e2e/checkout/peek-window.spec.ts, which already covers them for the new flow) — a follow-up plan was proposed in deferred-items.md but never executed within this phase."
deferred: []
human_verification: []
---

# Phase 18: Barcode Scan Product Peek Window Verification Report

**Phase Goal:** Scanning a barcode on `/pos` opens a separate Tauri OS window showing full product detail with a qty/weight input, letting the cashier inspect and choose to add-or-skip before it touches the cart.
**Verified:** 2026-08-27T03:36:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criteria) | Status | Evidence |
|---|---|---|---|
| 1 | Scanning a barcode on `/pos` opens a separate Tauri window (window-count/label assertion) showing name, size/unit, photo, price, inventory, SKU, barcode | ✓ VERIFIED | `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` renders photo (or `noPhoto` fallback), category, name, `MoneyDisplay` price, SKU/barcode/unit-type/`StatusBadge` stock detail panel. `ensurePeekWindowShown` (`src/features/open-product-peek-window/model/useProductPeekWindow.ts`) opens a real second `WebviewWindow('peek', ...)`. Independently re-ran `npx playwright test e2e/checkout/peek-window.spec.ts` myself (not trusting SUMMARY): all 10 tests pass, including `scanning a barcode and opening the peek window shows full product detail (PEEK-01)` which asserts `context.pages().length === 2` and every listed field against live Supabase data. |
| 2 | The window has a qty/weight input matching the product's unit type, and reuses the existing out-of-stock/near-expiry guard components rather than new ones | ✓ VERIFIED | Piece products render `QuantityControl` (shared/ui); sold-by-weight products render `WeightEntryDialog` with a new optional `onConfirm` override (verified in source, zero change to the two pre-existing callers `ProductGrid.tsx`/`CheckoutPanel.tsx`'s edit-weight usage — confirmed by reading both call sites). Both commit paths call `getProductRiskFlag`/`useConfirmRiskyAdd` imported from `@entities/product/model/` — confirmed via grep this is the *same* module `ProductGrid.tsx` imports (`src/widgets/ProductGrid/ui/ProductGrid.tsx:6-7`), not a reimplementation. E2E tests `a zero-price product still gates through the risky-add confirm toast` and `a sold-by-weight product opens WeightEntryDialog and relays a weighted line` pass (re-run confirmed). |
| 3 | "Add to Cart" adds the entered amount to the active `/pos` cart and closes the window; "Close" dismisses without any cart change | ✓ VERIFIED | `PeekProductDetail.commit()`/`WeightEntryDialog.onConfirm` emit `ADD_TO_CART_EVENT` then call `onClose()`; `CheckoutPanel`'s listener applies `addWeightedItem`/looped `addItem` to the real `cartStore`. `handleClose` only calls `getCurrentWebviewWindow().hide()`, never emits `ADD_TO_CART_EVENT`. E2E tests `Add to Cart with an adjusted quantity relays to the real main-window cart` and `Close dismisses with zero cart mutation` both re-run and pass. |
| 4 | Scanning a second barcode while the window is open replaces its content with the new product, and the main `/pos` window's own scan-to-search listener still fires on that same scan | ✓ VERIFIED (with a Critical fix confirmed applied) | Code review (18-REVIEW.md, CR-01) found this was originally **dead code** — `ensurePeekWindowShown`'s reuse path emitted an event nothing listened for. Read the current source directly: `useProductPeekWindow.ts` now defines a distinct `PEEK_WINDOW_REFRESH_EVENT` and `ProductPeekWindow.tsx` now has a `listen(PEEK_WINDOW_REFRESH_EVENT, ...)` effect (lines 288-298) that calls `loadProduct` — confirmed present, not just claimed. E2E regression test `a rescan relayed while the peek window is already open refreshes its displayed product (CR-01 regression)` and the pre-existing `rescanning a different barcode replaces peek content and relays to main, while main's own independent scan still fires (PEEK-04)` both re-run and pass. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### Code Review Critical Fixes — Independently Re-Verified

| ID | Issue | Fix claimed | Verified in source? | Verified by test? |
|----|-------|-------------|---------------------|--------------------|
| CR-01 | Reusing an open peek window never updated displayed product (dead refresh path) | Added `PEEK_WINDOW_REFRESH_EVENT` + listener in `ProductPeekWindow.tsx` | ✓ Read source, confirmed present (`useProductPeekWindow.ts:15`, `ProductPeekWindow.tsx:288-298`) | ✓ Re-ran `peek-window.spec.ts` — CR-01 regression test passes |
| CR-02 | Peek window's scanner stayed active while `WeightEntryDialog` was open, corrupting weight entry | `useBarcodeScanner({ enabled: !weightDialogOpen, ... })` in `ProductPeekWindow.tsx`, mirroring `CheckoutPanel`'s existing `scannerEnabled` gate | ✓ Read source, confirmed present (`ProductPeekWindow.tsx:272-278`) | ✓ Re-ran `peek-window.spec.ts` — CR-02 regression test passes |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/open-product-peek-window/model/useProductPeekWindow.ts` | `ensurePeekWindowShown`, event constants/payload types | ✓ VERIFIED | Exists, exports match plan exactly; `isTauri()` guard added in 18-03 (correct — prevents throwing outside a real Tauri runtime) |
| `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` | Full fetch/loading/error/not-found/populated UI states, own scanner, risk-gated commit paths | ✓ VERIFIED | All states present; reuses `CardSkeleton`/`EmptyState`/`MoneyDisplay`/`StatusBadge`/`QuantityControl` from `shared/ui`, not reimplemented |
| `src/app/PeekApp.tsx` | Provider shell for the peek window | ✓ VERIFIED | Mirrors `App.tsx` minus `OfflineBanner`/`ClockDriftBanner`/`Router` |
| `src/main.tsx` | `?window=peek` bootstrap branch | ✓ VERIFIED | `isPeek` query-param branch renders `PeekApp` vs `App` |
| `src-tauri/capabilities/default.json` | `windows: ["main","peek"]` + exactly 5 new minimum permissions | ✓ VERIFIED | Confirmed by direct read: `core:webview:allow-create-webview-window`, `core:window:allow-close/hide/show/set-focus` — exactly 5, no broader `core:webview:default`/`core:window:default` grant (WR-02 from code review — a further least-privilege split into a dedicated `peek.json` capability file — was **not** applied; left as an accepted Warning per the review, not a Critical) |
| `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` | Optional `onConfirm` override, zero change to existing callers | ✓ VERIFIED | Read source: `confirm()` branches `onConfirm ?? (edit ? updateWeightedItem : addWeightedItem)`; both pre-existing call sites unchanged |
| `e2e/checkout/peek-window.spec.ts` | E2E proof of PEEK-01..04 | ✓ VERIFIED | 10 tests, independently re-run, all pass (39.9s) |
| i18n `productPeekPanel.*` (en-US, es-MX) | Full copy set | ✓ VERIFIED | Both locale files read directly — all 10 keys present and populated in both |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CheckoutPanel.onScan` | `ensurePeekWindowShown` | direct call, additive to existing `setSearch` | ✓ WIRED | Read source; unchanged local behavior + new call, gated by existing `scannerEnabled` |
| `ensurePeekWindowShown` | `WebviewWindow` | `getByLabel` → construct-or-reuse | ✓ WIRED | Race-free per source read; unit-tested (3 cases, re-run pass) |
| `ProductPeekWindow` commit paths | `CheckoutPanel` cart | `emit(ADD_TO_CART_EVENT)` → `listen(...)` → `addItem`/`addWeightedItem` | ✓ WIRED | Confirmed both sides in source; E2E-proven with live cart-state assertions |
| `ProductPeekWindow` scanner/relay | `CheckoutPanel` search box | `emit(BARCODE_SCANNED_EVENT)` → `listen(...)` → `setSearch` | ✓ WIRED | Confirmed both sides; E2E-proven (PEEK-04 test) |
| Main-window rescan while peek is open | `ProductPeekWindow` refresh | `emit(PEEK_WINDOW_REFRESH_EVENT)` → `listen(...)` → `loadProduct` | ✓ WIRED (CR-01 fix) | Confirmed both sides in source; E2E regression test re-run, passes |

### Behavioral Spot-Checks / E2E Execution (independently re-run, not trusted from SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full peek-window suite (PEEK-01..04 + CR-01/CR-02 regressions + session-restore) | `npx playwright test e2e/checkout/peek-window.spec.ts --reporter=list` | 10 passed (39.9s) | ✓ PASS |
| Unit coverage for touched modules | `npx vitest run src/widgets/ProductPeekWindow src/features/open-product-peek-window src/features/add-loose-weight-item src/widgets/CheckoutPanel` | 3 files, 14 tests, all pass | ✓ PASS |
| Type safety | `npm run typecheck` | clean, exit 0 | ✓ PASS |
| Lint | `npm run lint` | clean, exit 0 (only a non-blocking eslint-plugin-boundaries "legacy selector syntax" info notice, no rule violations) | ✓ PASS |
| **Pre-existing scan-to-cart E2E suite regression check** | `npx playwright test e2e/checkout/barcode-scan-search.spec.ts --reporter=list` | **9 of 12 tests FAIL** | ✗ FAIL — see Gaps |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| PEEK-01 | 18-02, 18-03 | Separate Tauri OS window with full product detail | ✓ SATISFIED | Source read + E2E re-run |
| PEEK-02 | 18-01, 18-02, 18-03 | Qty/weight input + reused guards | ✓ SATISFIED | Source read (shared `getProductRiskFlag`/`useConfirmRiskyAdd`) + E2E re-run |
| PEEK-03 | 18-01, 18-02, 18-03 | Add to Cart / Close semantics | ✓ SATISFIED | Source read + E2E re-run |
| PEEK-04 | 18-01, 18-02, 18-03 | Rescan-replaces-content + main window's independent scan | ✓ SATISFIED (CR-01 fix confirmed) | Source read + E2E re-run |

No orphaned requirements — REQUIREMENTS.md's v1.4 section maps exactly PEEK-01..04 to this phase, and all four appear in at least one plan's `requirements:` frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `e2e/checkout/barcode-scan-search.spec.ts` | multiple (9 tests) | Stale assertions against removed direct-scan-to-cart UX, caused by this phase's `CheckoutPanel.tsx` change, never updated/retired | 🛑 Blocker (regression to existing automated coverage, in direct conflict with this project's CLAUDE.md "Testing & Verification Policy" which explicitly forbids accepting any non-passing E2E state as a phase end state) | See Gaps below |
| `src-tauri/capabilities/default.json` | 5-22 | Peek window shares the full main-window capability set rather than a scoped-down `peek.json` (WR-02 from code review) | ⚠️ Warning (not fixed, but explicitly triaged as non-blocking by the review; exactly-5-minimum-permissions constraint from the plan's own threat model was met) | Least-privilege improvement, not a functional gap |
| `useProductPeekWindow.ts` / `CheckoutPanel.tsx` / `ProductPeekWindow.tsx` | various `emit`/`listen` call sites | Fire-and-forget IPC calls without `.catch()` (WR-03); `loadProduct` has no request-generation guard against out-of-order rescans (WR-04); TOCTOU window-creation race window (WR-01) | ⚠️ Warning (unfixed, explicitly triaged as non-blocking by 18-REVIEW.md) | Real but lower-probability edge cases; not reproduced by any test |
| Phase files (all) | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers | — | ℹ️ Info — clean |

### Human Verification Required

None. Every roadmap Success Criterion and the code review's Critical fixes were confirmed through direct source reading and by independently re-executing (not trusting SUMMARY claims) both the Vitest unit suite and the Playwright E2E suite for this phase's own files.

### Gaps Summary

The four roadmap Success Criteria for Phase 18 are all genuinely met — verified by reading the actual source (not SUMMARY prose) and by independently re-running every relevant automated test myself rather than trusting the SUMMARY.md/18-REVIEW.md claims of "10 tests, all passing." Both Critical bugs from the code review (CR-01 dead refresh path, CR-02 scanner-not-gated-during-weight-entry) are confirmed fixed in the actual committed code and covered by new regression tests that I re-ran and confirmed pass.

However, one real, independently-confirmed regression was found and is not resolved: Plan 18-01 changed `CheckoutPanel.tsx`'s `onScan` behavior (scanning now only populates the search box and opens the peek window; it no longer adds directly to the cart) as an intentional part of this phase's design. `e2e/checkout/barcode-scan-search.spec.ts` still asserts the old, removed behavior and was never updated or retired to match. Re-running it directly against the live dev server confirms 9 of its 12 tests now fail — this is not flaky/pre-existing-unrelated debt (unlike the `atomic-rpc-guards.spec.ts` `Margarita`-fixture failures and the unrelated staff/close-tab unit test failures, both of which are genuinely unrelated pre-existing debt correctly logged in `deferred-items.md`). This file is broken specifically *because of* this phase's change to a file this phase owns, was documented by the executor as "a follow-up plan should retire/rewrite these assertions," but that follow-up was never done and no later ROADMAP.md phase addresses it.

Given this project's CLAUDE.md "Testing & Verification Policy" — which explicitly states test/verification debt is "backlog to close, not accepted end states" and that every scenario must be automated and passing — this qualifies as a blocking gap on phase completion, even though the phase's own four Success Criteria are independently proven true. Recommended fix (small, mechanical): update or retire `e2e/checkout/barcode-scan-search.spec.ts`'s 9 stale assertions to reflect the new scan-opens-peek-window UX (the underlying add-to-cart/guard behavior they used to test is already comprehensively covered by the new `peek-window.spec.ts`).

---

_Verified: 2026-08-27T03:36:00Z_
_Verifier: Claude (gsd-verifier)_
