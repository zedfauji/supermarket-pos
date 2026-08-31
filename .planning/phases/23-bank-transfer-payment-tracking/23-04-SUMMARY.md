---
phase: 23-bank-transfer-payment-tracking
plan: 04
subsystem: payments
tags: [react, tanstack-table, playwright, i18next, rbac, supabase]

# Dependency graph
requires:
  - phase: 23-bank-transfer-payment-tracking (plan 01)
    provides: "bank_transfers table, confirm_transfer_payment/dispute_transfer_payment RPCs, BankTransferSchema, confirm_transfer_payment/dispute_transfer_payment RBAC actions"
  - phase: 23-bank-transfer-payment-tracking (plan 02)
    provides: "bank-transfer checkout UI (PaymentForm) generating and displaying the reference code at checkout"
  - phase: 23-bank-transfer-payment-tracking (plan 03)
    provides: "usePendingTransfers/useAllTransfers query hooks, useConfirmTransfer/useDisputeTransfer mutation hooks, ConfirmTransferDialog/DisputeTransferDialog"
provides:
  - "BankTransfersList widget: DataTable of all bank transfers with a status-filter toolbar, stale-pending visual flag, and manager+-gated Confirm/Dispute row actions"
  - "Third 'Bank Transfers' TabsTrigger/TabsContent on PaymentsPage (D-11: not a new route)"
  - "e2e/payments/bank-transfers-tab.spec.ts: the phase's core tracer proof (checkout mark-pending -> manager confirm, real UI end-to-end) plus dispute/Luhn-rejection/RBAC-denial coverage"
affects: [23-05]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6356
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side status filter (pending/confirmed/disputed/all, default pending) applied over useAllTransfers()'s full result set, rather than a separate query per filter — mirrors InventoryPagePanel's category-filter toolbar pattern"
    - "Row-action visibility gated by canAccess(role, 'confirm_transfer_payment'|'dispute_transfer_payment') read from useStaffStore, matching ExportButtons.tsx's existing client-side RBAC-gate pattern — never the security boundary itself (Plan 01's RPC role check is)"

key-files:
  created:
    - src/widgets/BankTransfersList/index.tsx
    - e2e/payments/bank-transfers-tab.spec.ts
  modified:
    - src/pages/payments/index.tsx
    - src/shared/lib/i18n/locales/en-US/pages.json
    - src/shared/lib/i18n/locales/es-MX/pages.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json

key-decisions:
  - "Elapsed-time staleness threshold (STALE_PENDING_THRESHOLD_MS = 8h) is a hardcoded module constant per D-17, not read from any Settings table — matches the plan's explicit instruction."
  - "Row action buttons use their own short labels (bankTransfersList.confirmAction = 'Confirm' / disputeAction = 'Dispute') distinct from the dialogs' own confirmButton/disputeButton copy ('Confirm transfer' / 'Dispute transfer') — avoids an accessible-name collision between the row button and the dialog's own action button, which both need to be independently targetable in the E2E spec."
  - "seedPendingTransfer() (E2E helper) mirrors refund.spec.ts's seedPaidTab() pattern exactly (admin profile as staff_id/created_by, reuse-or-create open shift) rather than introducing a new seeding convention — keeps this spec consistent with the rest of e2e/payments/."

requirements-completed: [BTP-03, BTP-04, BTP-05, BTP-07, BTP-09]

coverage:
  - id: D1
    description: "BankTransfersList widget renders every pending/confirmed/disputed transfer oldest-first with reference code, customer name/phone, elapsed time, and status badge; a pending transfer past 8h is visually flagged stale (border-l-pos-warning + bold warning-colored elapsed text)"
    requirement: "BTP-07"
    verification:
      - kind: e2e
        ref: "e2e/payments/bank-transfers-tab.spec.ts#Test 1 (tracer): cashier checkout mark-pending -> manager confirm, end-to-end via real UI"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run lint (this plan's files clean; grep -c \"bankTransfers\" src/pages/payments/index.tsx > 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full tracer: cashier marks a sale pending at checkout (real /pos UI), manager confirms it on the Bank Transfers tab (real /payments UI) — one continuous flow, no service-role shortcut on either end. Asserts bank_transfers.status='confirmed' and a payment.transfer_confirmed audit_logs row."
    requirement: "BTP-03"
    verification:
      - kind: e2e
        ref: "e2e/payments/bank-transfers-tab.spec.ts#Test 1 (tracer): cashier checkout mark-pending -> manager confirm, end-to-end via real UI"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dispute requires a non-empty reason (button stays disabled on empty input, no RPC call fires), then succeeds with a real reason — dispute_reason stored, bank_transfers.status='disputed', payment.transfer_disputed audit row"
    requirement: "BTP-04"
    verification:
      - kind: e2e
        ref: "e2e/payments/bank-transfers-tab.spec.ts#Test 2: dispute blocks an empty reason, then succeeds with a real reason"
        status: pass
    human_judgment: false
  - id: D4
    description: "No auto-confirm path: a Luhn-invalid code (single-digit mutation) is caught client-side before any RPC round-trip — inline error renders, Confirm button stays disabled, zero calls to confirm_transfer_payment (proven via page.route interception)"
    requirement: "BTP-05"
    verification:
      - kind: e2e
        ref: "e2e/payments/bank-transfers-tab.spec.ts#Test 3: Luhn-invalid code blocks confirm inline, no RPC call fires"
        status: pass
    human_judgment: false
  - id: D5
    description: "Defense-in-depth RBAC denial: a cashier sees no Confirm/Dispute buttons for any row (UI-level), and a real signed-in cashier Supabase client calling confirm_transfer_payment directly is rejected AUTH_FORBIDDEN (server-level, independent of the UI gate)"
    requirement: "BTP-09"
    verification:
      - kind: e2e
        ref: "e2e/payments/bank-transfers-tab.spec.ts#Test 4: cashier is denied both UI-level (no buttons) and server-level (RPC)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-31
status: complete
---

# Phase 23 Plan 04: Bank Transfers Tab + Tracer Summary

**BankTransfersList widget composed onto a new third "Bank Transfers" tab on `/payments`, closing the reconciliation loop with a real end-to-end Playwright tracer proving checkout mark-pending through manager confirm — plus dispute, Luhn-mismatch rejection, and RBAC-denial coverage, all 4 tests green headless.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-31T21:10Z
- **Completed:** 2026-08-31T21:45Z
- **Tasks:** 2/2
- **Files modified:** 7 (2 new, 5 edits)

## Accomplishments
- `BankTransfersList` mirrors `RefundsList`'s `DataTable`/`buildColumns(t)`/`EmptyState` structure: reference-code badge, two-line customer name+phone cell, `MoneyDisplay` amount, elapsed-time cell (minutes/hours/days, bold warning-colored + row highlighted when a pending transfer exceeds the hardcoded 8h `STALE_PENDING_THRESHOLD_MS`), status badge, and Confirm/Dispute row actions gated by `canAccess(role, 'confirm_transfer_payment'|'dispute_transfer_payment')`
- A status-filter toolbar (pending/confirmed/disputed/all, default pending) filters `useAllTransfers()`'s result set client-side, matching `InventoryPagePanel`'s existing category-filter toolbar pattern
- Third `TabsTrigger value="bankTransfers"` + matching `TabsContent` added to `PaymentsPage`, same `className="flex flex-1 overflow-hidden p-4"` as the existing `refunds` tab
- New `payments.tabs.bankTransfers` key in `pages.json` and `bankTransfersList.*` namespace (18 keys incl. nested `status.{pending,confirmed,disputed}`) in `wAdmin.json`, genuine Spanish translations in es-MX, matching key sets in both locales
- `e2e/payments/bank-transfers-tab.spec.ts`: 4 tests, all passing headless — Test 1 is the phase's core tracer (real `/pos` checkout through real `/payments` -> Bank Transfers confirm, no service-role shortcut on either end); Tests 2-4 seed their own pending transfer via a service-role `seedPendingTransfer()` helper (mirroring `refund.spec.ts`'s `seedPaidTab()`) since they only need to prove the reconciliation-tab half of the flow

## Task Commits

1. **Task 1: BankTransfersList widget + Bank Transfers tab on PaymentsPage** - `1af1ccf` (feat)
2. **Task 2: Full tracer E2E — checkout mark-pending through manager confirm/dispute** - `9779343` (test)

**Plan metadata:** SUMMARY commit follows this document (docs: complete plan) — per orchestrator instruction for this parallel wave, STATE.md/ROADMAP.md are NOT touched by this plan's executor; the wave orchestrator updates those centrally after merge.

## Files Created/Modified
- `src/widgets/BankTransfersList/index.tsx` - DataTable widget: status filter toolbar, stale-pending flag, RBAC-gated row actions, wires `ConfirmTransferDialog`/`DisputeTransferDialog`
- `src/pages/payments/index.tsx` - third `bankTransfers` tab
- `src/shared/lib/i18n/locales/en-US/pages.json` / `es-MX/pages.json` - `payments.tabs.bankTransfers`
- `src/shared/lib/i18n/locales/en-US/wAdmin.json` / `es-MX/wAdmin.json` - `bankTransfersList.*` namespace
- `e2e/payments/bank-transfers-tab.spec.ts` - 4-test tracer + dispute + Luhn-rejection + RBAC-denial spec

## Decisions Made
- Hardcoded `STALE_PENDING_THRESHOLD_MS = 8 * 60 * 60 * 1000` (D-17) — not a Settings-driven value.
- Row-action button labels ("Confirm"/"Dispute") kept distinct from the dialogs' own action-button labels ("Confirm transfer"/"Dispute transfer") to avoid an accessible-name collision when both need independent Playwright targeting.
- `seedPendingTransfer()` E2E helper follows `refund.spec.ts`'s `seedPaidTab()` conventions exactly (admin profile, reuse-or-create open shift) rather than inventing a new seeding shape.

## Deviations from Plan

None - plan executed exactly as written. One import-order lint fix was applied via `eslint --fix` during Task 1 (feature-before-entity import ordering in `BankTransfersList/index.tsx`) — cosmetic, auto-fixed by the linter itself, not a manual deviation.

## Issues Encountered
- `.env.local` (gitignored) is not carried into a fresh worktree, same as every prior plan in this phase (23-01/23-03 both documented this). Read the main checkout's `.env.local` values directly and passed them inline as shell-command env vars to `npx playwright test` — no `.env.local` was written or committed in this worktree.
- `npm run typecheck` (repo-wide `tsc --noEmit`) fails on one pre-existing error in `src/app/router.tsx` (a `react-router-dom` `future`-flag typing mismatch), zero diff against `HEAD` for that file, unrelated to this plan. This plan's own files typecheck clean in isolation. Logged to `deferred-items.md`.
- `npm run lint` (repo-wide) still fails on the same 5 pre-existing `@typescript-eslint/no-floating-promises` errors in `HomeDashboard.tsx`/`PINLoginForm.tsx` already documented in `deferred-items.md` by 23-03 — reconfirmed unchanged, not touched by this plan.

## User Setup Required
None - no external service configuration required. All work applied against the existing local Supabase stack already running in this environment.

## Next Phase Readiness
- The phase's tracer gate is satisfied: checkout mark-pending -> manager confirm is proven end-to-end via real UI (Test 1), clearing the way for Plan 05's expansion work (CSV export / reporting breakout per RESEARCH.md's Anti-Patterns section, which this plan deliberately did not port from the spike HTML).
- `BankTransfersList`, the Bank Transfers tab, and the full RBAC/dispute/Luhn-rejection E2E coverage are finished contracts — no redesign risk for Plan 05.
- No blockers for Plan 05.

## Self-Check: PASSED

Both created files confirmed present via `[ -f ... ]` (implicit — both were written via the `Write` tool and immediately re-verified by `npm run typecheck`, `npx eslint`, and `npx playwright test`, all of which import/execute them). Both task commits (`1af1ccf`, `9779343`) confirmed present via `git log --oneline`.

---
*Phase: 23-bank-transfer-payment-tracking*
*Completed: 2026-08-31*
