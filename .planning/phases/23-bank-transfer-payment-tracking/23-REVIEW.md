---
phase: 23-bank-transfer-payment-tracking
reviewed: 2026-08-31T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/entities/bank-transfer/index.ts
  - src/entities/bank-transfer/model/queries.ts
  - src/entities/bank-transfer/model/types.ts
  - src/features/checkout-sale/model/useCheckoutSale.test.ts
  - src/features/checkout-sale/model/useCheckoutSale.ts
  - src/features/confirm-dispute-transfer/index.ts
  - src/features/confirm-dispute-transfer/model/useConfirmTransfer.test.ts
  - src/features/confirm-dispute-transfer/model/useConfirmTransfer.ts
  - src/features/confirm-dispute-transfer/model/useDisputeTransfer.ts
  - src/features/confirm-dispute-transfer/ui/ConfirmTransferDialog.tsx
  - src/features/confirm-dispute-transfer/ui/DisputeTransferDialog.tsx
  - src/features/export-bank-transfers/model/useExportBankTransfersCsv.ts
  - src/features/export-report/model/useExportReport.test.ts
  - src/features/export-report/ui/ExportButtons.test.tsx
  - src/pages/payments/index.tsx
  - src/shared/lib/audit-actions.ts
  - src/shared/lib/bank-transfer-code.test.ts
  - src/shared/lib/bank-transfer-code.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/exporters/excel.test.ts
  - src/shared/lib/exporters/pdf.test.ts
  - src/shared/lib/rbac.ts
  - src/shared/lib/supabase.types.ts
  - src/widgets/BankTransfersList/index.tsx
  - src/widgets/CajaReportPanel/CajaReportPanel.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - supabase/functions/process-direct-sale/index.ts
  - supabase/migrations/20260831000002_bank_transfer_payment_method.sql
  - supabase/migrations/20260831000003_bank_transfers_schema.sql
  - supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql
  - e2e/checkout/bank-transfer-checkout.spec.ts
  - e2e/payments/bank-transfers-tab.spec.ts
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-08-31
**Depth:** standard
**Files Reviewed:** 32 (listed above; some required-reading test files pointed at not-yet-modified sibling source files, which were pulled in for cross-checking)
**Status:** issues_found

## Summary

Phase 23 adds a `bank_transfer` payment method: cashier-side "mark pending" at checkout with a server-generated Luhn-checksummed 7-digit reference code, a manager-gated confirm/dispute reconciliation flow, a Bank Transfers tab with CSV export, and a Caja-report revenue breakout. The RBAC wiring (`confirm_transfer_payment`/`dispute_transfer_payment` manager+-only, both client-side `canAccess` gates and server-side `auth.uid()` role checks in the RPCs), the Luhn client/server code parity, and the idempotency/authorization guards in `process_direct_sale_atomic`/`process_payment_atomic` are all solid and well-tested (unit + E2E).

The one blocking defect is in the `get_caja_report` RPC: the new `bank_transfer_sales` aggregate was added to `totalRevenue` and its own breakout field, but was never added to the `netBalance` formula, so a day with bank-transfer sales silently understates the Net Balance figure shown on the Caja Report panel relative to what `totalRevenue` (and the other three payment methods) report. Several lower-severity data-integrity and completeness gaps are also documented below.

## Critical Issues

### CR-01: `netBalance` in `get_caja_report` omits bank-transfer sales

**File:** `supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql:207`
**Issue:** This migration adds `v_bank_transfer_sales` to the payment-method aggregate query (alongside cash/card/rappi) and to the JSON summary (`bankTransferSales`), and the migration's own header comment states `v_total_revenue`'s unconditional sum already includes bank-transfer amounts. However the `netBalance` expression at the bottom of the function was copied forward unchanged from the pre-existing migrations and still reads:

```sql
'netBalance', v_cash_sales + v_card_sales + v_rappi_sales + v_total_income - v_total_expenses
```

`v_bank_transfer_sales` is never added in. Every other payment method (cash, card, rappi) contributes to `netBalance`; bank-transfer sales — a real payment method now processed through the same `payments` table — do not. `CajaReportPanel.tsx:222` displays `report.summary.netBalance` directly to managers as the day's net balance, so any Caja session with confirmed/pending bank-transfer sales will show a `netBalance` that is understated by exactly the bank-transfer total, while `totalRevenue` (shown in the same panel, line 146) correctly includes it. This is a financial-reporting correctness bug in a payment-reconciliation feature.
**Fix:**
```sql
'netBalance', v_cash_sales + v_card_sales + v_rappi_sales + v_bank_transfer_sales + v_total_income - v_total_expenses
```
(Confirm with product/finance whether `netBalance` is meant to represent "money the business can currently count as collected" — if bank-transfer-*pending* amounts should be excluded until confirmed, use a variant that adds only the confirmed portion, e.g. `v_bank_transfer_sales - v_bank_transfer_pending`, but as written today it adds nothing at all, which is provably inconsistent with how the other three methods are treated.)

## Warnings

### WR-01: `mapTransferRow` casts nullable DB columns to non-nullable Zod-typed fields without validation

**File:** `src/entities/bank-transfer/model/queries.ts:36,39`
**Issue:** `payments.reference_number` and `tabs.customer_name` are both `string | null` in the generated `supabase.types.ts` (confirmed at `supabase.types.ts:744` and `:1636`). `mapTransferRow` does:
```ts
referenceCode: payment['reference_number'] as string,
...
customerName: tab['customer_name'] as string,
```
These are unchecked type assertions, not `BankTransferSchema.parse()` calls — the exported `BankTransferSchema` (which requires `referenceCode` to match `/^\d{7}$/` and `customerName` to be a non-empty string) is never actually applied to data coming back from Supabase in this file. The current RPC (`process_payment_atomic`) always sets `reference_number` for a `bank_transfer` payment and `process_direct_sale_atomic` always sets `customer_name` (defaulting to `'Walk-in'`), so in the paths wired up today this won't trip — but `process_payment_atomic` is a general-purpose RPC reachable for any existing `tab_id`, and `tabs.customer_name`/`payments.reference_number` are nullable at the schema level with no `NOT NULL` constraint tying them to `bank_transfers` rows. A future caller, a manually-created tab, or a regression elsewhere that leaves either column `null` will silently produce `customerName: null` / `referenceCode: null` typed as `string`, which then renders as literal `"null"` (or breaks the `/^\d{7}$/` assumption) in `BankTransfersList`, `ConfirmTransferDialog`, and the CSV export, with no error surfaced anywhere.
**Fix:** Either call `BankTransferSchema.parse(...)` on the mapped object (letting Zod fail loudly on unexpected nulls, consistent with the project's "Zod is the single source of truth" convention), or explicitly fall back the same way `customerPhone`/`confirmedBy` already do elsewhere in this file:
```ts
referenceCode: (payment['reference_number'] as string | null) ?? '',
customerName: (tab['customer_name'] as string | null) ?? 'Walk-in',
```

### WR-02: Caja Excel/PDF exports omit the new bank-transfer breakout fields

**File:** `src/shared/lib/exporters/excel.test.ts`, `src/shared/lib/exporters/pdf.test.ts` (source: `src/shared/lib/exporters/excel.ts`, `src/shared/lib/exporters/pdf.tsx`)
**Issue:** The diff for this phase only touches the two exporter *test* files (adding `bankTransferSales: 0, bankTransferPending: 0` to satisfy the now-widened `CajaReportSummarySchema`); `excel.ts` and `pdf.tsx` themselves were not modified (`git diff --stat` confirms zero changes to the source files), and neither file references `bankTransfer` anywhere. `CajaReportPanel.tsx` shows the new breakout on-screen (lines 150-157), but a manager who exports the same Caja report to Excel or PDF for bookkeeping/reconciliation gets a Summary sheet/page that is silently missing both new figures — undermining the stated purpose of this phase's reconciliation/export tooling (D-15/BTP-10 is specifically about the revenue breakout).
**Fix:** Add `Bank Transfer Sales` / `Bank Transfer Pending` rows to `cajaReportToWorkbook`'s Summary sheet and to `cajaReportToPdfBytes`'s summary section, mirroring how `cashSales`/`cardSales`/`rappiSales` are already rendered there.

### WR-03: "Checkout-time only" restriction on `bank_transfer` is enforced only client-side

**File:** `supabase/migrations/20260831000003_bank_transfers_schema.sql:128-346` (`process_payment_atomic`), `src/widgets/PaymentModal/ui/PaymentForm.tsx:121-136`
**Issue:** `PaymentForm.tsx`'s own comment states the absence of `processors.processBankTransferPayment` on `defaultProcessors` is "the sole client-side gate" restricting bank-transfer marking to the direct-sale checkout flow (D-16). `process_payment_atomic`, however, accepts `p_method = 'bank_transfer'` for *any* `p_tab_id` the caller can address — there is no server-side check distinguishing a freshly-created direct-sale tab from a pre-existing/regular tab. Since this RPC is reachable directly via PostgREST by any authenticated staff member with an active shift (not only through the UI), the "checkout-time only" business rule documented in D-16 has no enforcement at the layer that actually matters for a determined or scripted caller.
**Fix:** If "checkout-time only" is a real business requirement (not just a UI simplification), add a guard in `process_payment_atomic`/`process_direct_sale_atomic` — e.g., only allow `p_method = 'bank_transfer'` when called from `process_direct_sale_atomic` (a freshly-inserted tab in the same transaction), or pass and check an explicit flag — rather than relying solely on which button the UI renders.

### WR-04: `BankTransfersList` resolution column shows raw UUID fragments instead of staff names

**File:** `src/widgets/BankTransfersList/index.tsx:139,146`, `src/entities/bank-transfer/model/queries.ts:41,43,45`
**Issue:** `confirmedBy`/`disputedBy` are stored and surfaced only as raw UUIDs (`transfer.confirmedBy?.slice(0, 8)`), unlike the rest of the reporting surface in this codebase (e.g. `get_caja_report`'s `opened_by_name`/`closed_by_name`, `RefundRegisterRow.operatorName`) which consistently joins to `profiles.name` for a human-readable staff name. `TRANSFER_SELECT` in `queries.ts` doesn't join `profiles` for `confirmed_by`/`disputed_by`, so a manager reconciling transfers sees an 8-character hex fragment instead of a colleague's name — inconsistent with every other "who did this" column in the app and harder to audit at a glance.
**Fix:** Extend `TRANSFER_SELECT` with `confirmed_by_profile:profiles!bank_transfers_confirmed_by_fkey(name)` / `disputed_by_profile:profiles!bank_transfers_disputed_by_fkey(name)` (or a similar embed) and surface the name instead of the UUID prefix, consistent with the rest of the reporting UI.

## Info

### IN-01: Redundant disputed-row filtering (double-filtered before export)

**File:** `src/widgets/BankTransfersList/index.tsx:202-205`, `src/features/export-bank-transfers/model/useExportBankTransfersCsv.ts:51`
**Issue:** `BankTransfersList` computes `exportableRows` by filtering out `status === 'disputed'` before calling `exportBankTransfersCsv(exportableRows)`, and `useExportBankTransfersCsv` independently re-filters `transfers.filter(tr => tr.status !== 'disputed')` on the rows it's handed. Harmless (idempotent), but the duplicated business rule (D-13: "a disputed transfer never becomes real revenue") now lives in two places that must be kept in sync if it ever changes.
**Fix:** Keep the filter in exactly one place — either have the widget pass all rows and let the hook be the sole authority, or keep the hook trusting its input and drop the widget's redundant filter (already effectively true for `exportableRows`, so the hook's own filter is the one that's genuinely dead code today).

---

_Reviewed: 2026-08-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
