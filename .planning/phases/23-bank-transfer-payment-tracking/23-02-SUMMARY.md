---
phase: 23-bank-transfer-payment-tracking
plan: 02
subsystem: payments
tags: [react, zod, i18n, playwright, edge-function, supabase]

# Dependency graph
requires:
  - phase: 23-bank-transfer-payment-tracking (plan 01)
    provides: "payment_method enum value 'bank_transfer', process_payment_atomic/process_direct_sale_atomic accepting p_customer_phone and generating the server-side reference code, bank_transfers table"
provides:
  - "ProcessDirectSaleRequestSchema (client + edge function) widened to accept method='bank_transfer' + customerPhone, required via superRefine at both layers"
  - "useCheckoutSale.processors.processBankTransferPayment — checkout-time bank-transfer processor returning { paymentId, referenceCode, receiptData }"
  - "PaymentForm.tsx Bank Transfer method option, gated to only render when the optional PaymentProcessors.processBankTransferPayment field is supplied (CheckoutPanel only, never PaymentPane)"
  - "Reference-code display on the receipt step (monospace, copyable) with SPEI referencia numérica / concepto guidance"
  - "e2e/checkout/bank-transfer-checkout.spec.ts — real Playwright proof of the checkout-time half of the tracer"
affects: [23-03, 23-04, 23-05]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6490
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional processor field on PaymentProcessors (processBankTransferPayment?) as the client-side capability gate — a payment method only appears in the UI when its processor is supplied by the caller, not behind a boolean flag"
    - "Reference code surfaced to the cashier by reading receiptData.terminalReference (the pre-existing generic reference-number carrier), not a new field threaded through component state"

key-files:
  created:
    - e2e/checkout/bank-transfer-checkout.spec.ts
  modified:
    - src/shared/lib/edge-function-contracts.ts
    - supabase/functions/process-direct-sale/index.ts
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/features/checkout-sale/model/useCheckoutSale.test.ts
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/shared/lib/i18n/locales/en-US/featOrders.json
    - src/shared/lib/i18n/locales/es-MX/featOrders.json

key-decisions:
  - "New checkout-flow copy (button label, phone/name inputs, reference-code heading) added to featOrders.json's checkoutSale section per plan, even though PaymentForm.tsx's default useTranslation namespace is 'wPanels' — all namespaces are eagerly loaded in i18n/index.ts, so explicit t('featOrders:checkoutSale.*') calls resolve correctly, and this keeps the new strings co-located with the existing checkoutSale-scoped keys useCheckoutSale.ts already uses."
  - "Introduced a SplitPayMethod = Exclude<PayMethod, 'bank_transfer'> type for split-payment rows, since split legs don't support bank_transfer this phase (plan scope) — keeps the split-row reducer/UI untouched while still widening the top-level PayMethod."
  - "referenceCode is read from receiptData.terminalReference directly for display, not threaded separately through PaymentForm state — mirrors how cash/card processors already only propagate receiptData end to end."
  - "Edge function's own BodySchema (the real trust boundary, per the plan's own threat model) was widened and given the same customerPhone-required-for-bank_transfer superRefine check as the client schema, even though the plan's action prose only spelled this out for the client-side schema — without it the edge function rejects every bank_transfer request regardless of client changes."

requirements-completed: [BTP-02]

coverage:
  - id: D1
    description: "useCheckoutSale exposes processBankTransferPayment, returning { paymentId, referenceCode, receiptData } on success, reading the code from receiptData.terminalReference"
    requirement: "BTP-02"
    verification:
      - kind: unit
        ref: "src/features/checkout-sale/model/useCheckoutSale.test.ts#processBankTransferPayment returns ok with paymentId/referenceCode/receiptData on success"
        status: pass
      - kind: unit
        ref: "src/features/checkout-sale/model/useCheckoutSale.test.ts#processBankTransferPayment forwards customerName/customerPhone into the request"
        status: pass
    human_judgment: false
  - id: D2
    description: "A cashier at /pos can select Bank Transfer, enter the customer's phone, complete the sale, and see the generated 7-digit reference code on screen — the sale finalizes exactly like a cash/card sale (receipt prints, tab reaches paid, inventory decrements)"
    requirement: "BTP-02"
    verification:
      - kind: e2e
        ref: "e2e/checkout/bank-transfer-checkout.spec.ts#cashier completes a bank-transfer checkout end-to-end"
        status: pass
    human_judgment: false
  - id: D3
    description: "PaymentPane's generic tab-payment flow never offers Bank Transfer — it never supplies a processors prop to PaymentForm, so it always uses defaultProcessors, which has no processBankTransferPayment field, so PaymentForm's conditional render never shows the button there"
    requirement: "BTP-02"
    verification:
      - kind: other
        ref: "grep -n 'PaymentForm\\|processors' src/widgets/PaymentPane/ui/PaymentPane.tsx — confirms no `processors=` prop is passed, and grep -n 'PaymentForm|processors|useCheckoutSale' src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx confirms CheckoutPanel is the sole `processors={processors}` (from useCheckoutSale) call site"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-08-31
status: complete
---

# Phase 23 Plan 02: Bank Transfer Checkout UI Summary

**Bank Transfer wired into `/pos` checkout end-to-end: widened `ProcessDirectSaleRequestSchema` (client + edge function), a new `processBankTransferPayment` checkout processor, a capability-gated "Bank Transfer" button in `PaymentForm.tsx` that only ever appears from `CheckoutPanel`, and a green real-DB Playwright proof.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-08-31T17:24:00Z (worktree base commit)
- **Completed:** 2026-08-31T17:48:00Z
- **Tasks:** 3/3
- **Files modified:** 7 modified, 1 created

## Accomplishments
- `ProcessDirectSaleRequestSchema` (client) and the `process-direct-sale` edge function's own `BodySchema` (the actual trust boundary) both widened to accept `method: 'bank_transfer'` + `customerPhone`, each with a `superRefine` requiring `customerPhone` when the method is `bank_transfer`
- Edge function forwards `p_customer_phone` to `process_direct_sale_atomic` alongside the existing params
- `useCheckoutSale.processors.processBankTransferPayment` mirrors `processCardPayment`'s shape (plus `customerName`/`customerPhone`), returning `{ paymentId, referenceCode, receiptData }` — RED then GREEN proven via two new unit tests
- `PaymentForm.tsx` gains an optional `processBankTransferPayment` field on `PaymentProcessors`; the "Bank Transfer" method button only renders when it's present, which is only ever true when `CheckoutPanel` (via `useCheckoutSale`) supplies it — `PaymentPane`'s generic tab-payment flow keeps its unmodified `defaultProcessors` and never shows the option (D-16 client-side scoping)
- Customer Name (optional, falls back to the existing default) and Customer Phone (required, gates submit) inputs collected only for the `bank_transfer` method; split-payment rows narrowed to a `SplitPayMethod` type excluding `bank_transfer` since legs aren't supported this phase
- Reference code shown prominently (large monospace, copy-to-clipboard) on the receipt step, with SPEI `referencia numérica`-first / `concepto`-fallback guidance (D-03), sourced from `receiptData.terminalReference`
- New copy added to `featOrders.json` (en-US genuine translation, es-MX genuine Spanish) under the existing `checkoutSale` key group
- Real Playwright spec drives a full cashier checkout through Bank Transfer and asserts `payments.method='bank_transfer'`, `reference_number` matches `/^\d{7}$/` and equals the on-screen code, `bank_transfers.status='pending'` with the entered phone, `tabs.status='paid'`, and the stock movement — proving the RPC layer actually ran

## Task Commits

1. **Task 1: Extend the checkout contract — edge function schema + useCheckoutSale processor** - `ef6a8f5` (feat)
2. **Task 2: Add the Bank Transfer method option to PaymentForm.tsx** - `8ab2088` (feat)
3. **Task 3: E2E proof — cashier completes a bank-transfer checkout end-to-end** - `434a7b6` (test)

**Plan metadata:** SUMMARY commit follows this document (docs: complete plan) — per orchestrator instruction for this parallel wave, STATE.md/ROADMAP.md are NOT touched by this plan's executor; the wave orchestrator updates those centrally after merge.

_Note: Task 1 carried `tdd="true"`. RED was verified (both new test cases failed with `processBankTransferPayment is not a function` before implementation) and GREEN was verified (all 10 tests pass after), but committed as a single `feat(...)` commit rather than a separate `test(...)` → `feat(...)` pair — see Issues Encountered._

## Files Created/Modified
- `src/shared/lib/edge-function-contracts.ts` - `ProcessDirectSaleRequestSchema` widened (`method` enum + `customerPhone`, `superRefine` requiring phone for bank_transfer)
- `supabase/functions/process-direct-sale/index.ts` - `BodySchema` mirrors the same widening + validation (real trust boundary); forwards `p_customer_phone`; `SaleReceiptPayment.method` type widened
- `src/features/checkout-sale/model/useCheckoutSale.ts` - `submit()` accepts `method: 'bank_transfer'` + `customerName`/`customerPhone`; new `processBankTransferPayment` processor
- `src/features/checkout-sale/model/useCheckoutSale.test.ts` - 2 new test cases (RED then GREEN)
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - `PayMethod`/`SplitPayMethod` types, optional `processBankTransferPayment` on `PaymentProcessors`, method button, customer name/phone inputs, reference-code display on receipt step
- `src/shared/lib/i18n/locales/en-US/featOrders.json` / `es-MX/featOrders.json` - new `checkoutSale.*` keys (button label, input labels/placeholder, reference-code heading/instructions, copy button, guard message)
- `e2e/checkout/bank-transfer-checkout.spec.ts` - new E2E spec (real DB assertions, not UI-only)

## Decisions Made
See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Widened the edge function's own `BodySchema`, not just the client-side contract**
- **Found during:** Task 1
- **Issue:** The plan's action prose for Task 1 only described widening `ProcessDirectSaleRequestSchema` (the client-side Zod schema) and forwarding `p_customer_phone` in the RPC call, but the edge function (`supabase/functions/process-direct-sale/index.ts`) has its own separate `BodySchema` that is the actual server-side trust boundary — without widening it too, every `bank_transfer` request would be rejected with `Invalid enum value` regardless of client changes (confirmed live: this exact 400 was reproduced during Task 3's E2E run before the fix).
- **Fix:** Widened `BodySchema.method` to include `'bank_transfer'`, added `customerPhone`, and added the same `customerPhone`-required-for-`bank_transfer` `superRefine` check as the client schema, plus forwarded `p_customer_phone` and widened `SaleReceiptPayment.method`.
- **Files modified:** `supabase/functions/process-direct-sale/index.ts`
- **Verification:** E2E spec (Task 3) passes end-to-end against the live local edge function after this fix.
- **Committed in:** `ef6a8f5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — server-side validation)
**Impact on plan:** Necessary for the feature to function at all; the plan's `<done>` criterion for Task 1 already named this outcome ("the edge function ... accept and forward method='bank_transfer' + customerPhone"), so this fills in what the action prose omitted rather than adding out-of-plan scope.

## Issues Encountered
- **Broken worktree `node_modules`:** the worktree had no `node_modules` at all; the main repo checkout's `node_modules` existed but was missing `.bin` entirely (`vitest`/other CLIs unresolvable — likely a prior non-npm copy that dropped the `.bin` symlinks). Fixed by running `npm install` in the main repo (completing the existing, already-declared dependency set — not adding a new package) and creating an NTFS junction from the worktree's `node_modules` to the main repo's, mirroring 23-01's precedent. Also copied the gitignored `.env.local` into the worktree for live-DB test access.
- **Edge function bind-mount gotcha:** the local self-hosted Supabase stack's `supabase_edge_runtime_supermarket-pos-selfhosted` container bind-mounts `supabase/functions/` from the **main repo checkout path**, not the worktree — editing the file only inside the worktree has zero effect on the running edge function until the same file is copied to the main repo path and the container is restarted (`docker restart supabase_edge_runtime_supermarket-pos-selfhosted`). This is the same class of environment gotcha 23-01 documented for its DB migrations; future plans touching `supabase/functions/` in a worktree need this same copy+restart step before their E2E `<verify>` will reflect the change.
- **TDD commit granularity:** Task 1's `tdd="true"` RED→GREEN cycle was executed and verified (test run failing, then passing) but committed as one `feat(...)` commit instead of a separate `test(...)`/`feat(...)` pair. Functionally equivalent (both states were actually run, not skipped), but noted for commit-history completeness.
- **Pre-existing unrelated test failures:** `npm run test` (full suite, run as an extra regression check beyond the plan's own `<verification>`) surfaced 3 failing tests in 2 files this plan never touched (`src/entities/staff/model/queries.clock.test.ts`, `src/features/close-tab/tests/useCloseTab.test.ts`) — both are integration-style unit tests hitting the real local Supabase instance with hardcoded seed IDs, plausibly disturbed by Task 3's `resetTestState()`/`openCaja()` calls against the same shared local DB. Logged to `.planning/phases/23-bank-transfer-payment-tracking/deferred-items.md` per the scope-boundary rule rather than fixed (out of scope for this plan's diff).

## User Setup Required
None - no external service configuration required. All work applied against the existing local Supabase stack already running in this environment.

## Next Phase Readiness
- The checkout-time half of the bank-transfer tracer is fully proven end to end (backend from 23-01, checkout UI from this plan) — the next plan's confirm/dispute UI on `/payments` has a real, working `pending` `bank_transfers` row to reconcile against.
- BTP-02 is now fully closed (backend half from 23-01 + UI half from this plan).
- No blockers for the next plan in this phase.

## Self-Check: PASSED

All 8 modified/created files confirmed present via `[ -f ... ]`. All 3 task commits (`ef6a8f5`, `8ab2088`, `434a7b6`) confirmed present via `git log --oneline --all`.

---
*Phase: 23-bank-transfer-payment-tracking*
*Completed: 2026-08-31*
