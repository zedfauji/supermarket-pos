---
phase: 13-receipt-delivery-resilience-print-reprint-retry-pdf
plan: 02
subsystem: payments
tags: [react-query, supabase, rls, receipt, printReceipt, playwright]

requires:
  - phase: 13-01
    provides: printReceipt() retry/toast behavior (inherited automatically by ReprintButton — no extra wiring)
provides:
  - fetchReceiptDataForPayment(tabId)/useReceiptDataForPayment(tabId) — read-only, RLS-gated ReceiptData reconstruction from durable payments/tabs/orders/order_items/profiles/settings rows
  - ReprintButton — leftmost PaymentPane row action, no dialog, no PIN gate
  - e2e/60-reprint-receipt.spec.ts — split-sale reprint + data-fetch-failure coverage
affects: [payments, receipt-delivery]

actuals:
  tokens: 7600
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Client-side RLS-gated Supabase join mirrors an edge function's field-derivation shape (buildSaleReceipt) without calling the edge function or any payment RPC — pure SELECT reconstruction, grouped by tabId so every payments leg lands in one tenders[] array."

key-files:
  created:
    - src/entities/payment/model/receipt-reconstruction.integration.test.ts
    - src/features/reprint-receipt/ui/ReprintButton.tsx
    - src/features/reprint-receipt/index.ts
    - e2e/60-reprint-receipt.spec.ts
  modified:
    - src/entities/payment/model/queries.ts
    - src/entities/payment/model/index.ts
    - src/entities/payment/index.ts
    - src/widgets/PaymentPane/ui/PaymentPane.tsx
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "Used the locally-seeded manager-test@test.local / 100002 account for the integration test's authenticated session instead of jamie@barpos.dev / 567890 (the plan's suggested account) — jamie@barpos.dev does not exist in this environment's local Supabase instance; manager-test@test.local is present and its auth password is documented to equal its profiles.pin (scripts/setup-dev-users.ts)."
  - "Test 2's E2E data-fetch-failure scenario breaks the sale reference by deleting the payments row (not the tabs row as the plan's prose literally suggested) — payments.tab_id is ON DELETE RESTRICT against tabs(id), so deleting tabs while a payments row still references it would fail with an FK violation. Deleting the payments row instead drives fetchReceiptDataForPayment into the exact same fail-closed branch (payments.length === 0) and is the correct way to simulate 'this sale's data is now gone' without violating a database constraint."

requirements-completed: [RCP-01]

coverage:
  - id: D1
    description: "fetchReceiptDataForPayment/useReceiptDataForPayment reconstruct a full, correctly-grouped ReceiptData from durable rows alone, proven under a real authenticated session (single-tender, split-tender grouping, voided-order exclusion, unknown-tab rejection)."
    requirement: "RCP-01"
    verification:
      - kind: integration
        ref: "src/entities/payment/model/receipt-reconstruction.integration.test.ts — all 4 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "ReprintButton renders as the leftmost, ungated PaymentPane row action and reprints a completed sale's full receipt through the shared printReceipt() call."
    requirement: "RCP-01"
    verification:
      - kind: e2e
        ref: "e2e/60-reprint-receipt.spec.ts — 'reprinting a split sale prints one receipt with both tender legs, not one leg's amount'"
        status: pass
    human_judgment: false
  - id: D3
    description: "A reprint data-fetch failure shows a distinct toast and never attempts to print."
    requirement: "RCP-01"
    verification:
      - kind: e2e
        ref: "e2e/60-reprint-receipt.spec.ts — 'a reprint data-fetch failure shows a distinct toast and does not attempt to print'"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-25
status: complete
---

# Phase 13 Plan 02: Reprint Receipt Summary

**Read-only ReceiptData reconstruction (`fetchReceiptDataForPayment`) plus a leftmost, ungated `ReprintButton` on every `PaymentPane` row, both proven against a live Supabase project and a real split-sale checkout.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-24T23:43:00Z
- **Completed:** 2026-08-25T00:38:16Z
- **Tasks:** 3
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- `fetchReceiptDataForPayment(tabId)` / `useReceiptDataForPayment(tabId)` in `src/entities/payment/model/queries.ts` reconstruct a full `ReceiptData` from `payments`/`tabs`/`orders`/`order_items`/`profiles`/`settings` — a pure RLS-gated `SELECT`, mirroring `buildSaleReceipt()`'s field shapes, never replaying `process_direct_sale_atomic` or any payment RPC.
- Split-sale grouping is correct by construction: every `payments` row sharing a `tabId` is grouped into ONE `tenders[]` array (`subtotal`/`total` summed across all legs), closing the exact CR-03 regression class (RESEARCH.md Pitfall 4) — proven by a dedicated split-tender integration test and a real split cash+card checkout driven through Playwright.
- `ReprintButton` (`src/features/reprint-receipt/`) is the leftmost row action in `PaymentPane`'s "Recent Payments" list, renders unconditionally (no `isRefund`/`status` gate), has no dialog and no PIN gate, and inherits Plan 01's `printReceipt` retry/toast behavior automatically — no extra wiring needed.
- A reprint data-fetch failure (broken/missing sale reference) shows a distinct `reprintDataFailed` toast and never reaches `printReceipt` — proven both by the integration test's unknown-tab case and a dedicated E2E test that breaks a real seeded sale's reference mid-test.

## Task Commits

1. **Task 1: fetchReceiptDataForPayment — read-only ReceiptData reconstruction, proven against a live DB** - `ecde3d6` (feat)
2. **Task 2: ReprintButton — first row action in PaymentPane, no dialog, no PIN gate** - `af9c7f0` (feat)
3. **Task 3: E2E — reprint reproduces a split sale's full receipt, not one leg's amount** - `8257b1d` (test)

_No plan-metadata commit — this is a parallel worktree executor; STATE.md/ROADMAP.md updates are owned by the orchestrator after all wave agents complete._

## Files Created/Modified

- `src/entities/payment/model/queries.ts` - `paymentReceiptKeys`, `fetchReceiptDataForPayment`, `useReceiptDataForPayment`
- `src/entities/payment/model/index.ts` / `src/entities/payment/index.ts` - re-export the new reprint read
- `src/entities/payment/model/receipt-reconstruction.integration.test.ts` - integration test (live Supabase, real authenticated session)
- `src/features/reprint-receipt/ui/ReprintButton.tsx` / `src/features/reprint-receipt/index.ts` - the new row-action component and its barrel
- `src/widgets/PaymentPane/ui/PaymentPane.tsx` - wires `ReprintButton` as the first row action
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wPanels.json` - `paymentPane.reprint`/`reprinting`/`reprintDataFailed`
- `e2e/60-reprint-receipt.spec.ts` - split-sale reprint + data-fetch-failure E2E coverage

## Decisions Made

- **Authenticated test account substitution:** the plan's `read_first` pointed at `jamie@barpos.dev`/`567890` as "a seeded manager account already used by every sibling report-integration test" — but that account is not present in this worktree's local Supabase instance (verified via a direct `profiles` query). Used `manager-test@test.local`/`100002` instead (password documented in `scripts/setup-dev-users.ts` to equal the profile's `pin`), which is present and authenticates successfully. No production code depends on this account; it is test-fixture-only.
- **E2E "broken reference" simulation:** the plan's Task 3 prose said to delete the tab's `tabs` row to simulate a broken reference. `payments.tab_id` is `ON DELETE RESTRICT` against `tabs(id)` (`supabase/migrations/20260414000006_payments.sql`), so that literal delete would fail with an FK violation while a `payments` row for that tab still exists. Deleted the `payments` row instead — this drives `fetchReceiptDataForPayment` into its documented fail-closed branch (`payments.length === 0`) and produces the identical observable behavior (toast, no print attempt) without violating a database constraint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` and copied `.env.local` into the worktree**
- **Found during:** Task 1, before writing any test
- **Issue:** This git worktree had no `node_modules` and no `.env.local` (gitignored, not copied by `git worktree add`) — `npm run typecheck`/`vitest`/`playwright` could not run at all.
- **Fix:** `ln -s <main-repo>/node_modules node_modules` (identical `package-lock.json`, verified via `diff`) and `cp <main-repo>/.env.local .env.local`.
- **Files modified:** none tracked by git (both are gitignored paths; no commit contains them).
- **Verification:** `npm run typecheck`, `npx vitest run ...`, and `npx playwright test ...` all ran successfully afterward.

**2. [Rule 1 - Bug] Removed redundant `Number(...)` conversions and a forbidden non-null assertion flagged by ESLint's type-aware rules**
- **Found during:** Task 1, first lint pass
- **Issue:** `@typescript-eslint/no-unnecessary-type-conversion` fired because the reconstructed row types (`ReceiptOrderRow`/`ReceiptPaymentRow`) already type the DB columns as `number`, making the edge function's `Number(...)` wrapping (copied verbatim from `buildSaleReceipt()`, which operates on untyped `any` rows) redundant here; `@typescript-eslint/no-non-null-assertion` forbade `legs[0]!`.
- **Fix:** Dropped the redundant `Number()` calls; replaced `legs[0]!` with a checked `const firstLeg = legs[0]; if (!firstLeg) throw ...`.
- **Files modified:** `src/entities/payment/model/queries.ts`
- **Verification:** `npx eslint src/entities/payment/model/queries.ts` clean; `npm run typecheck` clean; integration test still green.
- **Committed in:** `ecde3d6` (part of Task 1 commit)

**3. [Rule 1 - Bug] Playwright `webServer` config reuses whatever is already listening on port 1520, which was a sibling parallel-worktree agent's dev server, not this worktree's code**
- **Found during:** Task 3, verifying the new E2E spec actually passes
- **Issue:** `playwright.config.ts`'s `webServer.reuseExistingServer: true` + `vite.config.ts`'s hardcoded `strictPort: true` port 1520 meant running `npx playwright test` would either fail to start `npm run dev` (port already bound by a sibling worktree's own dev server) or, worse, silently test against that sibling's checked-out code instead of this worktree's changes.
- **Fix:** For local verification only, temporarily pointed `playwright.config.ts`'s `baseURL`/`webServer.url`/`webServer.command` at port 1522 (`npx vite --port 1522 --strictPort`), ran the new spec, confirmed both tests pass, then reverted `playwright.config.ts` via `git checkout --` before committing (`git status --short` confirmed no diff remained).
- **Files modified:** none in the final commit — `playwright.config.ts` was restored to its original committed state.
- **Verification:** `git diff playwright.config.ts` empty after revert; `git status --short` shows only the new `e2e/60-reprint-receipt.spec.ts` file.

---

**Total deviations:** 3 auto-fixed (1 blocking-environment, 1 lint/type-safety bug, 1 blocking-environment). No scope creep — all three were necessary to execute and verify the plan; none touched production behavior beyond what the plan specified.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RCP-01 is fully closed: reprint reconstructs and reprints any completed sale's full receipt from `/payments`, proven by integration test (data reconstruction) and E2E (real split sale + failure path).
- `printReceipt`'s call signature (`printReceipt(data, settings)`) is unchanged from this plan's perspective — `ReprintButton` calls it with exactly the same 2 arguments every other call site uses, so Plan 13-01's retry-loop addition (an optional third `onRetry` parameter) composes with zero changes needed here.
- No blockers for other Wave 1 plans in this phase.

## Self-Check: PASSED

All created files verified present on disk (integration test, `ReprintButton.tsx` + barrel, E2E spec, this SUMMARY). All three task commit hashes (`ecde3d6`, `af9c7f0`, `8257b1d`) verified present in git log.

---
*Phase: 13-receipt-delivery-resilience-print-reprint-retry-pdf*
*Completed: 2026-08-25*
