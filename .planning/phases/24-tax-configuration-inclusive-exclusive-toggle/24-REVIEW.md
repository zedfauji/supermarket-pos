---
phase: 24-tax-configuration-inclusive-exclusive-toggle
reviewed: 2026-09-01T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - e2e/checkout/atomic-rpc-guards.spec.ts
  - e2e/checkout/happy-path.spec.ts
  - e2e/checkout/tax-inclusive-mode.spec.ts
  - e2e/helpers/tax.ts
  - e2e/infra/offline.spec.ts
  - e2e/inventory/loose-weight-hold-sale.spec.ts
  - e2e/payments/split-payment.spec.ts
  - e2e/receipts/reprint.spec.ts
  - e2e/reports/report-tabs.spec.ts
  - e2e/soak/full-day-soak.spec.ts
  - e2e/tabs/reopen-closed-ticket.spec.ts
  - src/app/router.tsx
  - src/entities/payment/model/types.test.ts
  - src/entities/payment/model/types.ts
  - src/entities/settings/model/queries.ts
  - src/shared/lib/__tests__/edge-tax.test.ts
  - src/shared/lib/billing-settings.test.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/i18n/locales/en-US/receipt.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/receipt.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/shared/lib/receipt-format.test.ts
  - src/shared/lib/receipt-format.ts
  - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
  - src/widgets/PINLoginForm/PINLoginForm.tsx
  - src/widgets/PaymentModal/PaymentModal.test.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx
  - src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx
  - supabase/functions/_shared/tax.ts
  - supabase/functions/process-direct-sale/index.ts
  - supabase/functions/process-payment/index.ts
  - supabase/functions/process-split-payment/index.ts
  - supabase/migrations/20260831000005_tax_inclusive_mode.sql
  - supabase/seed.sql
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-09-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Phase 24 adds a `taxInclusive` toggle to billing settings and threads mode-aware tax
decomposition (`decomposeTax` in `supabase/functions/_shared/tax.ts`) through
`process_direct_sale_atomic`, `process-payment`, and `process-split-payment`. The core
math is sound: I traced the RPC's forward-rounding (`v_tax := ROUND(v_subtotal *
rate/100, 2)`) against `decomposeTax`'s inverse-rounding decomposition across 5M
synthetic subtotal/rate combinations (property-style, run outside the repo's own
fast-check suite) and found zero cent-level mismatches, so `TAX-02`/`TAX-03`'s
subtotal+tax=total invariant genuinely holds for the direct-sale path. Client
(`PaymentForm.tsx`) and server (`process_direct_sale_atomic`) computations for
tax-inclusive vs. exclusive mode are consistent, the `CREATE OR REPLACE` signature for
`process_direct_sale_atomic` is byte-for-byte unchanged (no accidental function
overload), and the e2e/unit test updates correctly propagate `taxInclusive` instead of
the old hardcoded `* 1.16` multiplier.

However, the tax-decomposition change (`TAX-05`: "receipts show a real decomposed
subtotal/tax/total split") was applied inconsistently across the receipt-producing code
paths that exist in this codebase:

- The **reprint** path (`fetchReceiptDataForPayment`, wired into every payment row via
  `ReprintButton`) was never touched by this phase and still hard-codes
  `subtotal = total = sum(leg.amount)` with no tax fields at all — a reprinted receipt
  for a sale will show a different (missing) tax breakdown than the receipt printed at
  the time of the original sale.
- `process-payment`/`process-split-payment` now call `decomposeTax` unconditionally for
  **every** payment method, including `rappi`, even though `PaymentForm.tsx` explicitly
  zeroes out tax for `rappi` during the payment screen (`if (method === 'rappi') return
  0;`). The receipt can therefore show a fabricated non-zero tax line for a method the
  UI told the cashier had none.
- `process-split-payment`'s per-leg receipts decompose tax from each leg's own amount
  while still rendering the *entire* basket's item list on every leg's receipt (a
  pre-existing D-09 quirk) — the new tax line makes this look authoritative while the
  numbers still don't reconcile against the printed items.

None of these three gaps are covered by the phase's own e2e specs (which only assert
`subtotal + taxAmount === total` on the *fresh* receipt, never the reprint path, and
never a rappi payment), nor are they listed in `deferred-items.md`.

## Critical Issues

### CR-01: Reprinted receipts drop the tax breakdown entirely, contradicting the original receipt for the same sale

**File:** `src/entities/payment/model/queries.ts:166,175-192` (via `src/features/reprint-receipt/ui/ReprintButton.tsx:42-45`)

**Issue:** `fetchReceiptDataForPayment` — the sole data source for the "Reprint" button
that renders unconditionally on every row in `/payments` — was not touched by Phase 24.
It still computes:

```ts
const subtotal = round2(legs.reduce((sum, leg) => sum + leg.amount, 0));
...
return ReceiptDataSchema.parse({
  ...
  subtotal,
  total: subtotal,   // no taxAmount / taxRatePercent / taxInclusive at all
  ...
});
```

It doesn't even fetch the `billing` settings row (only `general`), so there is no way
for it to compute a tax split. Since `receipt.taxAmount` is optional in
`ReceiptDataSchema`/`buildThermalReceiptText` (`if (receipt.taxAmount != null)`), this
doesn't crash — it silently omits the "Impuesto/Tax" line and shows `subtotal === total`
on every reprint, regardless of the store's configured `taxRatePercent`/`taxInclusive`.

Compare with `process-payment/index.ts` and `process-direct-sale/index.ts`, which this
phase updated to call `decomposeTax(...)` and populate `taxAmount`/`taxRatePercent`/
`taxInclusive` on the receipt returned at time of sale. The result: printing a receipt
immediately after a sale shows a real subtotal/tax/total split; reprinting the exact
same sale later from `/payments` shows a *different*, tax-less breakdown for the same
payment. This directly contradicts Phase 24's own TAX-05 goal ("receiptData now shows a
real decomposed subtotal/tax/total split") and is not called out anywhere in
`24-CONTEXT.md`/`deferred-items.md`/`24-UAT.md` as an intentional scope cut.
`e2e/receipts/reprint.spec.ts` only asserts that cash/card amounts appear in the printed
lines — it never asserts a tax line, so this gap ships untested.

**Fix:** Give `fetchReceiptDataForPayment` the same treatment as the three edge
functions — fetch the `billing` settings row and run the result through
`decomposeTax`:

```ts
const [{ data: tab }, { data: payments }, { data: orders }, { data: settingsRow }, { data: billingRow }] =
  await Promise.all([
    ...,
    db.from('settings').select('value').eq('key', 'general').maybeSingle(),
    db.from('settings').select('value').eq('key', 'billing').maybeSingle(),
  ]);
...
const billing = billingRow?.value as { taxRatePercent?: number; taxInclusive?: boolean } | null;
const { subtotal, taxAmount, total } = decomposeTax(
  round2(legs.reduce((sum, leg) => sum + leg.amount, 0)),
  billing?.taxRatePercent ?? 16,
  billing?.taxInclusive ?? true
);
```

(`decomposeTax` currently lives under `supabase/functions/_shared/tax.ts`, which has no
imports and is already directly imported from a Vitest test — it can be imported the
same way from `src/`, or duplicated/relocated to a shared client util if the cross-tree
import is undesirable.)

## Warnings

### WR-01: `process-payment`/`process-split-payment` decompose tax for `rappi` payments even though the payment screen shows zero tax for `rappi`

**File:** `supabase/functions/process-payment/index.ts:315-319`, `supabase/functions/process-split-payment/index.ts:335-341`, contrast with `src/widgets/PaymentModal/ui/PaymentForm.tsx:287-298`

**Issue:** `PaymentForm.tsx`'s `taxAmount` memo explicitly special-cases Rappi:

```ts
const taxAmount = useMemo(() => {
  if (method === 'rappi') return 0;
  ...
```

so a cashier processing a Rappi payment sees `$0.00` tax on screen and the amount sent
to `process_payment_atomic`/`process-payment` is the plain `afterDiscount` figure (no
tax added). But both edge functions now call `decomposeTax(body.amount, taxRatePercent,
taxInclusive)` (or `decomposeTax(legRow.amount, ...)` per leg) unconditionally for every
method, including `rappi`:

```ts
const { subtotal, taxAmount, total } = decomposeTax(body.amount, taxRatePercent, taxInclusive);
```

For a Rappi sale this decomposes the (already tax-free-by-design) amount as if it were a
tax-inclusive total, producing a non-zero `taxAmount` on the printed/emailed receipt that
was never shown to the cashier and was never actually itemized as tax. This is at minimum
a display inconsistency between the payment screen and the receipt for the same
transaction; if a store audits printed tax lines it could also misrepresent tax
collected on Rappi orders (which the code's own comments treat as collected/remitted
externally by Rappi, not by this POS). Rappi-order creation was removed from
supermarket-pos in Phase 1 per `CLAUDE.md`, so this path is effectively dormant on new
tabs today, but the `rappi` method/branch is still fully wired (payment button,
`isRappiTab`, `processRappiPayment`) and will fire the moment a `rappiOrderId` tab
exists (e.g. legacy/imported data, or if Rappi is ever re-enabled).

**Fix:** Skip the tax decomposition for `rappi` (mirroring `PaymentForm.tsx`'s own
`method === 'rappi'` check), e.g.:

```ts
const { subtotal, taxAmount, total } =
  paymentRow.method === 'rappi'
    ? { subtotal: body.amount, taxAmount: 0, total: body.amount }
    : decomposeTax(body.amount, taxRatePercent, taxInclusive);
```

### WR-02: `process-split-payment`'s per-leg tax decomposition compounds the pre-existing "full basket, partial total" receipt mismatch

**File:** `supabase/functions/process-split-payment/index.ts:264-276,340-370`

**Issue:** Each leg's receipt in `process-split-payment` still renders the *entire*
tab's `items[]` array (documented in the file's own header comment as "D-09: the untouched
generic per-leg process-split-payment receipts"), while `subtotal`/`total` are derived
from that single leg's amount only:

```ts
const receipts = (paymentRows as PaymentLegRow[]).map(legRow => {
  const { subtotal, taxAmount, total } = decomposeTax(Number(legRow.amount), taxRatePercent, taxInclusive);
  ...
  return { ..., items, subtotal, total, taxAmount, ... };
});
```

Before this phase, `subtotal === total === legRow.amount` was already inconsistent with
the full item list (a pre-existing quirk), but it was at least a single, undecorated
number. Now every leg's receipt additionally shows a plausible-looking `Subtotal` +
`Impuesto`/`Tax` + `Total` breakdown computed purely from that leg's slice of the
payment — e.g. a $100 sale split 50/50 cash+card would show item lines summing to $100
on *both* receipts, but each one's decomposed subtotal+tax will only add up to $50. The
new tax line increases the appearance of correctness/precision on a receipt that was
already known to be internally inconsistent, making the discrepancy more likely to be
mistaken for a computation bug by a customer or auditor reading a printed receipt built
from this path (used when repaying/splitting an already-open tab, e.g. via
`PaymentPane`).

**Fix:** Either (a) scale `items` down to the leg's share for `process-split-payment`
receipts, or (b) keep the full item list but set `subtotal`/`taxAmount`/`total` from the
tab's full charged amount and add a distinct "amount collected on this tender" field
instead of overloading `subtotal`/`total` with a per-leg figure. At minimum, flag this as
a known limitation in `deferred-items.md` since it's user-visible on every split-payment
reprint/receipt.

### WR-03: Toggling `taxInclusive` in Billing Settings has no confirmation and no visible warning about its store-wide effect

**File:** `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:121-141`

**Issue:** The `taxInclusive` toggle instantly reinterprets every existing catalog price
across the entire product list for every sale going forward — flipping it from
"included" to "added at checkout" (or vice versa) does not touch `products.base_price`,
so the *effective* charged price for every SKU changes the moment the setting is saved
(e.g. a $100 catalog price that used to be the full charged total becomes a $116
charged total at a 16% rate, with no re-entry of any product data). The UI only shows a
one-line description (`billingSettingsTab.taxInclusiveDescription`) next to the toggle
and saves via the same `Save Billing` button used for every other billing field — there
is no distinct confirmation step (unlike e.g. the manager-PIN gates used elsewhere in
this codebase for consequential actions), so an accidental toggle-then-save silently
changes checkout totals store-wide on the next sale.

**Fix:** Add a `ConfirmDialog` (already used elsewhere in this codebase, e.g.
`PINLoginForm.tsx`'s opening-cash flow) gating the save when `taxInclusive` has changed
from its last-loaded value, explaining the store-wide price-reinterpretation effect
before committing.

## Info

### IN-01: `decomposeTax`'s `taxInclusive` parameter doesn't change the numeric result, only the rounding order

**File:** `supabase/functions/_shared/tax.ts:22-35`

**Issue:** Decomposing a `chargedAmount` that already has tax embedded at `rate`
percent is the same arithmetic identity regardless of *how* that amount was originally
assembled (catalog-price-is-inclusive vs. tax-added-on-top) — `decomposeTax(x, r, true)`
and `decomposeTax(x, r, false)` produce identical `{subtotal, taxAmount}` for the same
`x`/`r` (verified empirically for rates 0–100 across 2M subtotal values with zero
divergence, matching the file's own `decomposeTax(116, 16, true)` and
`decomposeTax(116, 16, false)` test cases which assert the same output). The `taxInclusive`
parameter is effectively decorative for this function's actual output — it exists only
to document/select which of the two mathematically-equivalent rounding orders is used,
per the comment about avoiding "a 1-cent drift vs. total." Not a bug, but worth a code
comment noting the parameter doesn't branch the *result*, only the rounding path, so a
future reader doesn't assume the two modes can diverge for the same input (they were
observed not to, in this domain).

---

_Reviewed: 2026-09-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
