---
phase: 17-e2e-suite-overhaul
plan: 05
subsystem: testing
tags: [playwright, e2e, supabase, payments, refund, split-payment]

# Dependency graph
requires:
  - phase: 17-e2e-suite-overhaul
    provides: "17-04's e2e/checkout/ direct-sale coverage (happy-path.spec.ts, atomic-rpc-guards.spec.ts) used as the comparison baseline for 05-payments.spec.ts's coverage overlap"
provides:
  - "e2e/payments/ — 5 rewritten, fully-green spec files (core-payments, payment-pane, edge-cases, refund, split-payment), zero bar-pos references, zero test.skip escape hatches"
  - "e2e/helpers/supabase.ts's resetTestState() actually resets inventory/products between tests (was a silent no-op for every prior E2E run in this repo's history)"
affects: [e2e-suite-overhaul, future-phases-relying-on-resetTestState]

# Actuals (#2632)
actuals:
  tokens: 16342
  tasks: 3
  commits: 8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PostgREST rejects bulk UPDATE with no WHERE clause (21000) — always use an always-true filter like .not('id', 'is', null) for 'reset every row' test helpers, and always check/await the result so a silent no-op surfaces."
    - "Conditional test.skip() guards that never fire in practice are dead code masking a regression path — replace the boolean-probe-then-skip pattern with a direct assertion so a real failure fails loud."

key-files:
  created:
    - e2e/payments/core-payments.spec.ts
    - e2e/payments/payment-pane.spec.ts
    - e2e/payments/edge-cases.spec.ts
    - e2e/payments/refund.spec.ts
    - e2e/payments/split-payment.spec.ts
  modified:
    - e2e/helpers/supabase.ts

key-decisions:
  - "05-payments.spec.ts's 8 permanently-skipped tests were confirmed fully superseded by 17-04's e2e/checkout/happy-path.spec.ts and atomic-rpc-guards.spec.ts — only one genuinely uncovered assertion (cash-tendered-above-total change-due check) was ported, into a new core-payments.spec.ts."
  - "split-payment.spec.ts's 3 tests exercise a SEPARATE mechanism from 17-04's checkout-split coverage: splitting an already-open tab via the dedicated process-split-payment edge function + process_split_payment_atomic RPC, not direct-sale checkout's built-in split."
  - "PaymentForm.tsx's split-payment flow only ever surfaces the first leg's receipt on screen (every leg still prints/opens the drawer) — the old 'Receipt 1 of 2' sequential-screens UX is gone; T1 was rewritten to match, not the app changed to match the stale test."

patterns-established:
  - "resetTestState()'s inventory/products reset calls now include an explicit always-true WHERE filter and this failure mode (silent PostgREST 21000 no-op) is documented inline for the next person touching that helper."

requirements-completed: [TEST-01, TEST-02]

coverage:
  - id: D1
    description: "e2e/payments/core-payments.spec.ts + payment-pane.spec.ts: direct-sale change-due check and payment-pane (nav/tab-list/PIN-gate/cash-payment/back-button/item-grouping) all green, zero bar-pos references"
    requirement: "TEST-01"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/payments/core-payments.spec.ts e2e/payments/payment-pane.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "e2e/payments/edge-cases.spec.ts + refund.spec.ts: exact-cash/underpayment/tip/discount edge cases, refund with D-11 double-refund guard, D-10 stock-movement assertions on both the restock and no-restock refund paths — zero test.skip escape hatches remaining"
    requirement: "TEST-01"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/payments/edge-cases.spec.ts e2e/payments/refund.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "e2e/payments/split-payment.spec.ts: the 3 previously-permanently-disabled split-payment tests (happy path, validation gate, add/remove row) un-skipped and passing for real against the live process-split-payment edge function + process_split_payment_atomic RPC"
    requirement: "TEST-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/payments/split-payment.spec.ts"
        status: pass
    human_judgment: false

duration: ~1h49m combined across two sessions (19min original 3 tasks + ~1h30m this cleanup pass, most of which was diagnosing shared-environment infrastructure, not test-code debugging)
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 05: Payments E2E Rewrite + Split-Payment Un-Skip Summary

**Rewrote e2e/payments/ (5 files, zero bar-pos refs, zero test.skip), un-skipped the 3 permanently-disabled split-payment tests, and fixed a silent PostgREST no-op in the shared resetTestState() helper that was the real cause of 8 of the 9 residual failures found when finishing this plan.**

## Performance

- **Duration:** ~19 min (original Tasks 1-3, prior session) + ~1h30m (this cleanup pass — see Issues Encountered for why)
- **Completed:** 2026-08-25
- **Tasks:** 3 plan tasks (all committed in a prior session) + this verification/fix pass
- **Files modified:** 6 (5 e2e/payments/ specs + e2e/helpers/supabase.ts)

## Accomplishments

- `e2e/payments/core-payments.spec.ts`, `payment-pane.spec.ts`, `edge-cases.spec.ts`, `refund.spec.ts`, `split-payment.spec.ts` created; `e2e/05-payments.spec.ts`, `17-payment-pane.spec.ts`, `23-payment-edge-cases.spec.ts`, `35-refund.spec.ts`, `41-split-payment.spec.ts` deleted (prior session).
- 05-payments.spec.ts's coverage comparison against 17-04's checkout specs: 7 of 8 skipped tests confirmed fully superseded; 1 assertion (cash-tendered-above-total → non-negative change due) had no equivalent and was ported into the new core-payments.spec.ts (prior session).
- pool-table badge test (payment-pane) and Rappi payment-method test (edge-cases) deleted per D-08 (prior session).
- D-10 stock-movement DB assertions added to the refund flow's restock and no-restock paths (prior session); this pass fixed the restock=true assertion by actually checking the "Restock" checkboxes it needed (see Deviations).
- The 3 previously-`test.skip('title', fn)`'d split-payment tests un-skipped and debugged to a real passing state (prior session `fd5d493`); this pass fixed a stale receipt-flow assertion so T1 passes for real (see Deviations).
- `npx playwright test e2e/payments/` passes with **0 failures, 0 skips, 23 passed** — confirmed stable across 3 consecutive full-suite runs after this pass's fixes.
- `grep -c "test.skip(" e2e/payments/split-payment.spec.ts` and `e2e/payments/edge-cases.spec.ts` both return 0 — no skip escape hatches remain anywhere in `e2e/payments/`.

## Task Commits

Prior session (already committed before this dispatch):
1. **Task 1: core-payments.spec.ts + payment-pane.spec.ts** — `2a3ed7c` (test)
2. **Task 2: edge-cases.spec.ts + refund.spec.ts (D-08 delete + D-10 assertions)** — `327113b` (test)
3. **Task 3: split-payment.spec.ts (un-skip and debug to green)** — `fd5d493` (test)
4. Follow-up fix from the same session — `b90721c` (fix: restore refunded product stock)

This dispatch (finishing the plan — SUMMARY was never written, and `npx playwright test e2e/payments/` was not actually green when this pass started):
5. **fix: add WHERE clause to resetTestState inventory/products reset** — `a7fdaeb` (fix)
6. **fix: check restock on T1-T4 refund items so D-10 assertion has data** — `540a284` (fix)
7. **fix: match split-payment T1 receipt assertion to single-receipt UI** — `4c48857` (fix)
8. **fix: remove stale test.skip escape hatches in edge-cases.spec.ts** — `5e5c9d8` (fix)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `e2e/payments/core-payments.spec.ts` — new; direct-sale cash-tendered-above-total change-due check
- `e2e/payments/payment-pane.spec.ts` — migrated from `17-payment-pane.spec.ts`, pool-table test deleted
- `e2e/payments/edge-cases.spec.ts` — migrated from `23-payment-edge-cases.spec.ts`, Rappi test deleted, `unlockPaymentForm` now asserts directly instead of skip-guarding, tip/discount locators fixed
- `e2e/payments/refund.spec.ts` — migrated from `35-refund.spec.ts` verbatim + D-10 assertions; T1-T4 now checks restock so its `assertStockMovement` call has real data
- `e2e/payments/split-payment.spec.ts` — migrated from `41-split-payment.spec.ts`, all 3 tests un-skipped; T1's receipt assertion rewritten to match the current single-receipt UI
- `e2e/helpers/supabase.ts` — `resetTestState()`'s inventory/products reset calls now carry a WHERE clause instead of silently no-op'ing

## Decisions Made

- **05-payments.spec.ts coverage disposition:** compared each of the 8 skipped tests against 17-04's `e2e/checkout/happy-path.spec.ts` and `atomic-rpc-guards.spec.ts`. 7 were confirmed superseded (cash/card payment completion, change calculation, exact-cash, underpayment). 1 had no equivalent (a specific non-negative-change-due assertion on cash-tendered-above-total) — ported into `core-payments.spec.ts` against the current scan/cart/pay UI rather than un-skipping the old tab-opening-flow test.
- **split-payment.spec.ts vs. 17-04's checkout split coverage:** confirmed these are two distinct mechanisms — direct-sale checkout's built-in split (`process_direct_sale_atomic`) vs. splitting an already-open tab via the separate `process-split-payment` edge function + `process_split_payment_atomic` RPC. Neither supersedes the other; both needed dedicated coverage.
- **Single-receipt split-payment UX is current, correct behavior, not a bug:** `PaymentForm.tsx`'s `handleSplitPrimary` intentionally shows only the first leg's receipt on screen (documented inline in the source as an explicit past refactor), while every leg is still sent through the print/cash-drawer path. The old test's "Receipt 1 of 2 → Done → Receipt 2 of 2 → Done" sequence was rewritten to expect one receipt + one Done click, not treated as an app regression to fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `resetTestState()`'s inventory/products reset silently no-op'd every run**
- **Found during:** Reproducing the reported 8 payments/ failures — actual run showed 23/23 failing, almost all `openCaja: no manager profile found` or downstream `0 items / $0.00` seeded tabs.
- **Issue:** `admin.from('inventory').update({quantity_on_hand: 100})` and the equivalent `products` call had no WHERE clause. PostgREST rejects unfiltered bulk UPDATEs (`21000 UPDATE requires a WHERE clause`), and since the call's result was never checked, both silently did nothing on every single test run across the whole suite's history — not just this dispatch. Inventory only ever monotonically drained until a test's `order_items` insert hit the `quantity_on_hand_non_negative` check constraint and silently zeroed out that seed's items.
- **Fix:** Added `.not('id', 'is', null)` (always-true, satisfies the WHERE-clause requirement) to both calls in `e2e/helpers/supabase.ts`.
- **Files modified:** `e2e/helpers/supabase.ts`
- **Verification:** Manual reset script confirmed 50/50 rows updated post-fix (vs. `21000` error pre-fix); full suite re-run went from 9 failed → 2 failed → (after the two remaining fixes below) 0 failed.
- **Committed in:** `a7fdaeb`

**2. [Rule 1 - Bug] T1-T4 refund test's D-10 assertion had no data to find**
- **Found during:** Re-running `refund.spec.ts` after the resetTestState fix — `assertStockMovement` failed with `got null`.
- **Issue:** `restock` defaults to `false` in `RefundSheet.tsx` (`restock: override?.restock ?? false`), and the DB trigger `restore_inventory_on_refund_item` correctly skips writing a `stock_movements` row when `NOT NEW.restock`. T1-T4 selected 2 items for refund but never checked their "Restock" checkboxes, so the `assertStockMovement(productId, 1, 'refund')` call added in the prior session's Task 2 (D-10) always found nothing — a test gap, not a trigger bug.
- **Fix:** Check the "Restock" checkboxes for the selected items before submitting, making T1-T4 the positive (restock=true) counterpart to T6's already-passing explicit restock=false case.
- **Files modified:** `e2e/payments/refund.spec.ts`
- **Verification:** `npx playwright test e2e/payments/refund.spec.ts` — all 4 tests pass.
- **Committed in:** `540a284`

**3. [Rule 1 - Bug] split-payment T1 asserted a UX that no longer exists**
- **Found during:** Re-running `split-payment.spec.ts` after the resetTestState fix — T1 progressed past item allocation but timed out waiting for "Receipt 1 of 2".
- **Issue:** `PaymentForm.tsx`'s split-payment submit handler (`handleSplitPrimary`) only ever shows the FIRST leg's receipt on screen — confirmed via an inline source comment documenting this as an intentional past change ("the first receipt is what's shown on screen, and every receipt in the array is still printed below"). The old ported test assumed sequential per-leg receipt screens (D-09's original intent) that no longer match the app.
- **Fix:** Rewrote the receipt-handling block to expect one "Receipt" heading, one "Done" click, and confirm the tab leaves the waiting-for-payment list. DB-level assertions (payment_group_id, split_index, cash+card methods proving both legs were recorded atomically) unchanged.
- **Files modified:** `e2e/payments/split-payment.spec.ts`
- **Verification:** `npx playwright test e2e/payments/split-payment.spec.ts` — all 3 tests pass.
- **Committed in:** `4c48857`

**4. [Rule 1 - Bug] edge-cases.spec.ts had 5 conditional test.skip escape hatches that never fired**
- **Found during:** Full-suite run after fixes 1-3 — 22 passed, 1 skipped (PE3, `'tip/discount UI not implemented'`).
- **Issue:** Investigated per this dispatch's explicit instruction to check whether these skip reasons were stale. All 4 "Tab not found in payments list" guards (PE1-PE4) and both "tip/discount UI not implemented" guards (PE3, PE4) were dead code: `unlockPaymentForm`'s tab lookup and PE4's discount toggle always succeed in practice (verified across 3 consecutive full-suite runs pre-fix); PE3's bare `getByLabel(/tip/i)`/`getByText(/tip/i)` matched ambiguously (the actual field is labeled "Custom tip", and the post-payment text matched the tab-name heading too), which its `.catch(() => false)` silently turned into a false "not implemented" skip.
- **Fix:** Changed `unlockPaymentForm` to assert the tab is visible directly instead of returning a boolean for callers to skip-guard on. Scoped PE3's tip locator to `/custom tip/i` and its post-payment assertion to the receipt's `<pre>` block. Removed PE4's discount-toggle skip guard, asserting visibility directly instead.
- **Files modified:** `e2e/payments/edge-cases.spec.ts`
- **Verification:** `grep -c "test.skip(" e2e/payments/edge-cases.spec.ts` returns 0; full suite passes 23/23 with 0 skips across 2 consecutive runs.
- **Committed in:** `5e5c9d8`

---

**Total deviations:** 4 auto-fixed (1 blocking shared-helper bug, 3 test-code bugs surfaced once the shared-helper bug was fixed)
**Impact on plan:** All four were necessary to make the plan's own `<verify>` block (`npx playwright test e2e/payments/` passes with 0 failures) actually true. None touched application source code — every fix was either a test-infrastructure bug (`resetTestState`) or a test file correctly following stale assumptions about UI/DB state. No scope creep beyond `e2e/payments/` and the one shared helper directly blocking it.

## Issues Encountered

- **Environment, not code:** most of this pass's wall-clock time went into diagnosing why `npx playwright test e2e/payments/` was returning 23/23 failures with "no manager profile found" / "fetch failed" errors that had nothing to do with the plan's test files. Root causes, in order encountered: (1) the worktree had no `node_modules`/`.env.local` (symlinked from the sibling checkout at `/mnt/ai/POS/supermarket-pos`); (2) the host's Docker daemon was down (`sudo systemctl start docker` — brought the pre-existing self-hosted Supabase compose stack back up via its restart policy); (3) `npx playwright install ffmpeg` fails outright on this Ubuntu release ("Playwright does not support ffmpeg on ubuntu26.04-x64") and the cached binary had vanished mid-session — worked around by symlinking the apt-installed system `ffmpeg` into Playwright's expected cache path. None of these three needed a code change and are called out here only so a future run isn't re-surprised by them.
- **The actual code-level root cause** (the `resetTestState()` silent no-op, deviation #1 above) was hiding behind all three environment issues and wasn't visible until Docker/Supabase were confirmed healthy and the suite could run to completion.

## User Setup Required

None - no external service configuration required. (The Docker/ffmpeg environment fixes above were host-level and are not part of this repo's setup scripts; if a future E2E run hits "no manager profile found" or "fetch failed" immediately, check `docker ps` / `systemctl status docker` first before assuming a code regression.)

## Next Phase Readiness

- `e2e/payments/` is fully green, zero bar-pos references, zero skip escape hatches — ready as-is for the next wave's phase-wide verification pass.
- `resetTestState()`'s fix benefits every other spec file in `e2e/`, not just payments — worth noting if other in-flight phase plans were also seeing unexplained inventory-related flakiness.

---
*Phase: 17-e2e-suite-overhaul*
*Completed: 2026-08-25*
