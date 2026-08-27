---
phase: 02-core-direct-sale-checkout
plan: 09
subsystem: checkout
tags: [zustand, zod, persist, playwright, vitest]

# Dependency graph
requires:
  - phase: 02-core-direct-sale-checkout
    provides: "Single-slot held-cart hold/resume/discard lifecycle and CheckoutPanel's isHeld-driven Hold-button gate (Plans 02-05, 02-08)"
provides:
  - "Versioned zustand persist middleware on cartStore, serializing only heldCart under a dedicated direct-sale-held-cart localStorage key (partialize) — the active items cart, actions, and payment-attempt state never survive a restart"
  - "CartItemSchema-validated normalizer applied on every hydration: missing, malformed, or obsolete-version persisted payloads resolve to no held cart rather than a partial one"
  - "Store-level D-01 one-slot guard: holdCart() no-ops when heldCart is already occupied, independent of CheckoutPanel's existing Hold-button disabled state"
  - "Playwright reload/restart proof for a weighted held sale, including the second-hold-resisted and no-pre-payment-effect assertions"
affects: [checkout, e2e-suite]

# Actuals (#2632)
actuals:
  tokens: 8025
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "zustand persist `merge` (not just `migrate`) is the single validation point for a persisted slice — `migrate` only fires on a version mismatch, so a same-version but tampered/malformed payload must still be schema-validated inside `merge` or it silently re-enters live state"
    - "Capture the literal rendered text (not a recomputed expected value) when an E2E assertion needs to prove a client-formatted value survived a state transition unchanged — avoids hardcoding locale/currency-symbol formatting assumptions the test has no other reason to know"

key-files:
  created: []
  modified:
    - src/entities/tab/model/cartStore.ts
    - src/entities/tab/model/cartStore.test.ts
    - e2e/52-loose-weight-hold-sale.spec.ts

key-decisions:
  - "CheckoutPanel.tsx required no code change: its Hold-button disabled={items.length === 0 || isHeld} guard (reading heldCart !== null) already existed from Plan 02-05, satisfying this plan's UI requirement as-is. Only the store-level holdCart() guard was missing and is now added as the authoritative check."
  - "Fixed cartStore.test.ts's pre-existing mockProduct.categoryId placeholder ('cat-1') to a real UUID — CartItemSchema's ProductSchema.categoryId is UuidSchema-validated, and this plan's persistence tests are the first to round-trip that fixture through CartItemSchema."
  - "The reload E2E test captures the actual rendered price text (via a currency-symbol regex) before Hold and asserts the identical string reappears after Resume, rather than recomputing an expected formatted amount — sidesteps needing to know the cashier E2E account's locale/currency-symbol (cashier is not one of the four locale-pinned E2E accounts)."

patterns-established:
  - "Any future addition to CartState that must survive a restart goes through the same partialize/merge/migrate triad on cartStore's persist config, not a second ad-hoc localStorage read/write."

requirements-completed: [CHK-05]

coverage:
  - id: D1
    description: "A held cart (including a sold-by-weight line's product, modifiers, quantity, weightGrams, unitPrice, lineTotal, and notes) survives a fresh store hydration exactly, while the active items cart never becomes restart state"
    requirement: "CHK-05"
    verification:
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > rehydrates a held weighted-cart snapshot exactly across a fresh store hydration"
        status: pass
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > persists only heldCart, never the active items array"
        status: pass
    human_judgment: false
  - id: D2
    description: "A missing, malformed, or obsolete-version persisted held-cart payload hydrates to no held cart rather than a partial/incomplete one"
    requirement: "CHK-05"
    verification:
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > hydrates to no held cart when the persisted payload is missing"
        status: pass
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > hydrates to no held cart when the persisted payload is malformed"
        status: pass
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > hydrates to no held cart when the persisted payload is an obsolete version"
        status: pass
    human_judgment: false
  - id: D3
    description: "resumeHeld() and discardHeld() clear the persisted held slot; holdCart() is a no-op while a held sale already exists, preserving both the existing held cart and the current active cart (D-01 one-slot guard)"
    requirement: "CHK-05"
    verification:
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > writes no held slot after resumeHeld()"
        status: pass
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > writes no held slot after discardHeld()"
        status: pass
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#held cart restart persistence > holdCart() is a no-op while heldCart is already occupied (D-01 one-slot guard)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A weighted held sale survives a full document reload with its exact weight and price, resists a second Hold while occupied, resumes/swaps the original slot correctly, and clears manually on discard"
    requirement: "CHK-05"
    verification:
      - kind: e2e
        ref: "e2e/52-loose-weight-hold-sale.spec.ts#a weighted held sale survives a document reload, resists a second hold, and clears on discard"
        status: pass
    human_judgment: false
  - id: D5
    description: "Before any payment, the full hold/reload/resume/discard sequence leaves inventory and order/payment/stock-movement counts unchanged (D-04, proven by absence rather than a new reservation model)"
    requirement: "CHK-05"
    verification:
      - kind: e2e
        ref: "e2e/52-loose-weight-hold-sale.spec.ts#a weighted held sale survives a document reload, resists a second hold, and clears on discard"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 09: Held-Sale Restart Persistence Summary

**cartStore's one held-cart slot now survives an app restart via a versioned, CartItemSchema-validated zustand `persist` layer that serializes only `heldCart`, with a store-level D-01 one-slot guard on `holdCart()` and a Playwright reload proof for a weighted line.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-13T22:09:00Z (approx.)
- **Completed:** 2026-08-13T22:35:00Z (approx.)
- **Tasks:** 2 (1 tracer + tracer feedback gate, 1 auto)
- **Files modified:** 3

## Accomplishments

- `cartStore.ts` now wraps its zustand store in `persist`, with `partialize` limiting the serialized payload to `{ heldCart }` under a dedicated `direct-sale-held-cart` key (versioned `1`) — `items`, actions, and derived selectors are session-only.
- A `PersistedHeldCartSchema` (`z.array(CartItemSchema).nullable()`) validates every hydration inside `merge`: a missing, malformed, or tampered payload resolves to `null` (no held cart) instead of a partial cart. `migrate` applies the same fallback for an obsolete store version.
- `holdCart()` gained the authoritative D-01 guard: it is now a no-op (with a `cart.held.blocked_slot_occupied` warn log) whenever `heldCart !== null`, leaving both the existing held cart and the current active cart untouched — regardless of caller, not just the already-existing CheckoutPanel Hold-button `disabled` state from Plan 02-05.
- `CheckoutPanel.tsx` required no code change: its `isHeld`-driven Hold-button disable already satisfied this plan's UI requirement.
- Added 8 colocated Vitest cases proving exact weighted-line rehydration (product/modifiers/quantity/weightGrams/unitPrice/lineTotal/notes), no-items-leakage, missing/malformed/obsolete-payload safety, resume/discard clearing the persisted slot, and the store-level one-slot guard.
- Added one focused Playwright scenario to `e2e/52-loose-weight-hold-sale.spec.ts`: hold a 1.250 kg Budweiser line, reload the document (the WebView-restart-equivalent boundary), confirm the held badge and empty-cart state survive, start a second (Corona) active cart and prove Hold stays disabled while the slot is occupied, resume to confirm the original weighted line and its exact price text return intact while Corona swaps into the held slot, resume again and manually discard, then reload once more to confirm no held banner remains — with inventory and orders/payments/stock_movements row counts asserted unchanged throughout (D-04).

## Task Commits

Each task was committed atomically (TDD RED → GREEN for Task 1; Task 2 is test-only coverage of already-implemented behavior):

1. **Task 1: Persist and safely rehydrate one complete held-cart snapshot** - `6fbcb14` (test, RED) + `689cc53` (feat, GREEN)
2. **Task 2: Prove reload, weighted resume, manual clear, and no-reservation behavior** - `a697b8a` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/entities/tab/model/cartStore.ts` - Wraps the store in zustand `persist` (partialize/merge/migrate on `heldCart` only); adds the D-01 one-slot `holdCart()` guard
- `src/entities/tab/model/cartStore.test.ts` - 8 new held-cart restart-persistence tests; fixed `mockProduct.categoryId` to a real UUID
- `e2e/52-loose-weight-hold-sale.spec.ts` - New reload/second-hold-resisted/resume/discard/no-reservation Playwright scenario

## Decisions Made

- Left `CheckoutPanel.tsx` untouched — its `isHeld`-gated Hold button (from Plan 02-05) already implements this plan's UI-side requirement; only the underlying store guard was missing.
- Fixed `cartStore.test.ts`'s `mockProduct.categoryId` placeholder (`'cat-1'`) to a real UUID, since `CartItemSchema`'s `ProductSchema.categoryId` is `UuidSchema`-validated and this plan's tests are the first in this file to round-trip the fixture through that schema.
- The reload E2E test asserts price preservation by capturing and comparing the literal rendered money text, not a recomputed expected amount — avoids needing to know the cashier E2E account's locale/currency-symbol formatting (cashier is not one of the four locale-pinned accounts `resetTestState` documents).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Test-authoring bug caught during RED→GREEN**, not a deviation: the first draft of the "fresh store hydration" test reset in-memory state via `useCartStore.setState(...)` to simulate a restart, but zustand's `persist` middleware also re-persists on every `setState` call — silently overwriting the just-held cart in `localStorage` with the reset value before `rehydrate()` ran. Fixed by capturing the persisted envelope from `localStorage` before the reset and restoring it afterward, correctly modeling "in-memory state is gone, disk state survives."
- **Pre-existing, out-of-scope flake reconfirmed**, not caused by this plan: running the full `e2e/52-loose-weight-hold-sale.spec.ts` file still shows the documented intermittent strict-mode failure in `holds, resumes, and discards one in-memory sale while another sale completes` (flagged in Plan 02-08's summary). This test is not in Task 2's `<verify>` filter and untouched by this plan's diff; the two targeted tests (`survives.*reload`, `resuming a held sale swaps`) and all other tests in the file pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CHK-05's held-sale restart-persistence gap is closed: the one held slot survives a restart with its full weighted-cart data, remains single/manual-only, and produces no order/payment/inventory effect before an actual payment.
- This is the last plan in Phase 02's gap-closure sequence (02-06 → 02-07/02-08 → 02-09). Phase-level re-verification against `02-VERIFICATION.md`'s remaining gaps (CHK-03/CHK-04 financial authority, replay authorization, split-receipt truthfulness — owned by 02-06/02-07) is an orchestrator-level next step, not part of this plan.
- The pre-existing `holds, resumes, and discards one in-memory sale while another sale completes` intermittent flake (see Issues Encountered) remains unresolved and should be picked up in a future pass.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-13*

## Self-Check: PASSED
