---
phase: 08-sale-payment-workflow-wiring-cleanup
plan: 01
subsystem: payments
tags: [checkout, offline, react-i18next, playwright, result-pattern]

# Dependency graph
requires: []
provides:
  - "isOnline() fail-fast guard in useCheckoutSale.submit() (NETWORK_OFFLINE before any fetch())"
  - "AppErrorCode threaded through PaymentForm.runPayment()'s three legs (cash/card/rappi) instead of being discarded"
  - "Dedicated ConfirmDialog-based offline dialog in PaymentForm (Try Again / Cancel), distinct from OfflineBanner/toast"
  - "wPanels.json paymentForm.offlineTitle/offlineBody i18n keys (en-US + es-MX)"
  - "4 new Playwright tests: offline-before-submit, retry-after-reconnect, cancel-no-side-effects, split-payment-offline"
affects: [checkout-sale, PaymentModal, PaymentPane, direct-sale-checkout e2e suite]

actuals:
  tokens: 3421
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Client-side network guard before a money-moving RPC: isOnline() checked as the very first statement in submit(), before local session-state checks (CAJA_CLOSED), so a stale/local error never masks the real reason (no network)."
    - "AppErrorCode passthrough on narrowed Result types: when a component narrows a processor's Result<T, E> to a smaller local error shape, thread `code` through explicitly rather than dropping it, so callers can branch on specific failure modes."

key-files:
  created: []
  modified:
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json
    - e2e/50-direct-sale-checkout.spec.ts

key-decisions:
  - "Cast r.error.code to AppErrorCode at PaymentForm's three runPayment() error sites: PaymentProcessors' default type comes from payment-processor.ts, which imports a legacy, loosely-typed AppError (code: string) from supabase-contracts.ts — not result.ts's AppErrorCode-typed AppError. At runtime the direct-sale processors (useCheckoutSale.ts) populate `code` from the real AppErrorCode union, so the cast reflects actual behavior; comparing the resulting value against the 'NETWORK_OFFLINE' literal is safe either way."
  - "Repaired local dev-user seed data (`npm run setup:dev-users`) before running E2E: the pinned E2E cashier account's `profiles.locale` had drifted to es-MX (pre-existing environment issue, not caused by this plan — the exact same failure reproduced on the unmodified 'cash payment' test), which broke every English-text-matching locator in the suite. This is a data-only fix via the project's own documented repair script, not a code change."

patterns-established: []

requirements-completed: [SALE-04]

coverage:
  - id: D1
    description: "useCheckoutSale.submit() fails fast with NETWORK_OFFLINE before attempting fetch() when offline"
    requirement: "SALE-04"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#offline before checkout submit shows blocking dialog instead of hanging"
        status: pass
    human_judgment: false
  - id: D2
    description: "PaymentForm shows a dedicated ConfirmDialog-based offline dialog (not OfflineBanner, not toast) with Try Again / Cancel, for both single-method and split-payment paths"
    requirement: "SALE-04"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#offline before checkout submit shows blocking dialog instead of hanging"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#offline blocking dialog also appears when submitting a split payment"
        status: pass
    human_judgment: false
  - id: D3
    description: "Try Again re-invokes the same submit path and completes the sale once reconnected"
    requirement: "SALE-04"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#Try Again after reconnecting completes the sale"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cancel closes the dialog with no side effects — no sale held/queued/discarded, entered fields preserved"
    requirement: "SALE-04"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#Cancel on offline dialog returns to cart without submitting"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-18
status: complete
---

# Phase 08 Plan 01: Offline Checkout Guard Summary

**`useCheckoutSale.submit()` fails fast on `isOnline()` before any fetch(), and `PaymentForm` shows a dedicated blocking dialog (Try Again/Cancel) instead of hanging or discarding the `NETWORK_OFFLINE` error code.**

## Performance

- **Duration:** 45 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `useCheckoutSale.submit()` now returns `err(networkOfflineError())` immediately when offline, before the `CAJA_CLOSED` check and before building the RPC payload — the legacy tab-based `callProcessPayment`/`callProcessSplitPayment` path is untouched.
- `PaymentForm.runPayment()` preserves `AppErrorCode` across all three legs (cash/card/rappi) instead of discarding it into a bare `{ message }` object.
- `handlePrimary()` and `handleSplitPrimary()` both branch on `code === 'NETWORK_OFFLINE'` to show a `ConfirmDialog`-based offline dialog (title/body from new `wPanels.json` keys, Try Again/Cancel from existing `common.json` keys) instead of the inline error banner.
- 4 new Playwright tests prove: the guard fires within 5s with no `fetch()` attempted; Try Again (after reconnecting) completes the sale; Cancel returns to the cart with entered fields intact and no RPC call; and the same offline branch fires for the split-payment path.

## Task Commits

1. **Task 1: Offline guard + error-code plumbing + blocking dialog, wired end-to-end** - `e8ce255` (feat)
2. **Task 2: Retry-after-reconnect, Cancel-no-side-effects, and split-payment path coverage** - `11b2b2f` (test)

_Note: both tasks were `type="tracer" tdd="true"`; Task 1 included its own new failing→passing test as part of the same commit (tracer feedback gate run inline, verified before Task 2 started)._

## Files Created/Modified

- `src/features/checkout-sale/model/useCheckoutSale.ts` - Added `isOnline()` fail-fast guard as the first statement in `submit()`
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - Widened `runPayment()`'s error type to carry `code`, added `showOfflineDialog` state + inline `ConfirmDialog`, branched `handlePrimary()`/`handleSplitPrimary()` on `NETWORK_OFFLINE`
- `src/shared/lib/i18n/locales/en-US/wPanels.json` - Added `paymentForm.offlineTitle`/`offlineBody`
- `src/shared/lib/i18n/locales/es-MX/wPanels.json` - Added Spanish translations for the same keys
- `e2e/50-direct-sale-checkout.spec.ts` - 4 new tests (offline-before-submit, retry-after-reconnect, cancel-no-side-effects, split-payment-offline)

## Decisions Made

- Cast `r.error.code as AppErrorCode` at `PaymentForm.runPayment()`'s three error sites rather than widening `PaymentProcessors`' shared type. `payment-processor.ts` imports a legacy, loosely-typed `AppError` (`code: string`) from `supabase-contracts.ts`, distinct from `result.ts`'s `AppErrorCode`-typed `AppError`. Changing the shared `PaymentProcessors` interface's error type would have rippled into the untouched legacy tab-based path (out of this plan's scope, D-06 prohibition), so a local cast at the point of use was the minimal, correctly-scoped fix. At runtime the direct-sale processors (`useCheckoutSale.ts`) populate `code` from the real `AppErrorCode` union, so the cast reflects actual behavior.
- Ran `npm run setup:dev-users` before E2E verification to repair the pinned E2E cashier account's `profiles.locale`, which had drifted to `es-MX` in this local Supabase instance (confirmed pre-existing by reproducing the identical failure on the unmodified "cash payment" test). This is the project's own documented idempotent repair path (`scripts/setup-dev-users.ts`), not a code change — it only re-pins the 4 fixed E2E login accounts to `en-US` per the existing `331e1b6` convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `r.error.code` typed as bare `string`, not `AppErrorCode`, via `PaymentProcessors`' legacy contract**
- **Found during:** Task 1 (typecheck after wiring `code` through `runPayment()`'s three legs)
- **Issue:** The plan's action text assumed `r.error.code` was already `AppErrorCode`-typed. `payment-processor.ts` (the source of `PaymentProcessors`' default/structural type) imports `AppError` from `supabase-contracts.ts` — a legacy, loosely-typed shape (`code: string`) explicitly documented there as distinct from `result.ts`'s real `AppError`/`AppErrorCode`. `tsc` correctly rejected assigning `string` to `code?: AppErrorCode`.
- **Fix:** Cast `r.error.code as AppErrorCode` at the three `if (!r.ok)` sites in `runPayment()`, with an inline comment explaining why the cast is safe (the direct-sale processors actually populate this field from the real `AppErrorCode` union at runtime).
- **Files modified:** `src/widgets/PaymentModal/ui/PaymentForm.tsx`
- **Verification:** `npm run typecheck` passes; `handlePrimary()`'s `code === 'NETWORK_OFFLINE'` branch fires correctly per the passing E2E tests.
- **Committed in:** `e8ce255` (Task 1 commit)

**2. [Rule 3 - Blocking, environment] Pinned E2E cashier account's locale had drifted to es-MX**
- **Found during:** Task 1 (first E2E run — `getByRole('button', { name: /checkout/i })` timed out because the button rendered as "Cobro", the es-MX translation)
- **Issue:** This local Supabase instance's `profiles` row for the "Bartender Test" (cashier-role) E2E fixture account had `locale: 'es-MX'` instead of the documented `en-US` pin (`setup-dev-users.ts`, `331e1b6`). Reproduced identically on the pre-existing, unmodified "cash payment creates one paid sale" test, confirming this was not caused by this plan's changes.
- **Fix:** Ran `npm run setup:dev-users` (the project's own idempotent seed-repair script), which logged `repaired: Bartender Test (cashier)`.
- **Files modified:** None (data-only fix against the local Supabase instance, not a code/commit change)
- **Verification:** All 4 offline tests plus the full `e2e/50-direct-sale-checkout.spec.ts` suite (26 tests) subsequently ran; 25 passed on first attempt, 1 pre-existing unrelated test (`replay from a different cashier is rejected without leaking the original sale`) was flaky and passed on Playwright's automatic retry — consistent with shared-local-Supabase contention from concurrent sibling worktree agents, not this plan's changes.
- **Committed in:** N/A (no code change)

---

**Total deviations:** 2 auto-fixed (2 blocking — 1 type-system, 1 environment/data)
**Impact on plan:** Both were required to complete verification as specified; neither touched scope outside this plan's files (the environment fix touched no files at all). No scope creep.

## Issues Encountered

- Worktree lacked `.env.local` and `node_modules` (both gitignored, not copied by `git worktree add`). Copied `.env.local` from the main checkout and symlinked `node_modules` to the main checkout's install, both purely local to this worktree's filesystem and not part of any commit.
- The full-suite Playwright run (26 tests, ~3.2 min) exceeded the 120s foreground command timeout and was moved to background automatically; confirmed completion via the background task's output file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SALE-04 is fully addressed: the offline guard, error-code plumbing, and blocking dialog are wired end-to-end for both single-method and split-payment direct-sale checkout paths.
- The legacy tab-based `callProcessPayment`/`callProcessSplitPayment` path (used outside direct-sale checkout) is untouched, per D-06.
- No blockers for sibling 08-xx plans in this wave; this plan's two touched files (`useCheckoutSale.ts`, `PaymentForm.tsx`) are not listed in any other 08-xx plan's `files_modified`.

---
*Phase: 08-sale-payment-workflow-wiring-cleanup*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: src/features/checkout-sale/model/useCheckoutSale.ts
- FOUND: src/widgets/PaymentModal/ui/PaymentForm.tsx
- FOUND: src/shared/lib/i18n/locales/en-US/wPanels.json
- FOUND: src/shared/lib/i18n/locales/es-MX/wPanels.json
- FOUND: e2e/50-direct-sale-checkout.spec.ts
- FOUND commit: e8ce255 (Task 1)
- FOUND commit: 11b2b2f (Task 2)
