---
phase: 24-tax-configuration-inclusive-exclusive-toggle
fixed_at: 2026-09-01T00:00:00Z
review_path: .planning/phases/24-tax-configuration-inclusive-exclusive-toggle/24-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-09-01T00:00:00Z
**Source review:** .planning/phases/24-tax-configuration-inclusive-exclusive-toggle/24-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03 — `critical_warning` scope; IN-01 excluded, info-only)
- Fixed: 3 (CR-01, WR-01, WR-03)
- Skipped: 1 (WR-02 — documented as a deferred limitation per REVIEW.md's own fallback suggestion)

**Verification:** all checks below ran in the isolated git worktree
`.claude/worktrees/rf-24-26483-1788301301` (branch `gsd-reviewfix/24-26483`, fast-forwarded onto
`main` at cleanup) — `npm run typecheck`, `npm run lint`, and `npm run test` (139 files / 1309
tests / 0 failures) were run there, not in the main checkout.

## Fixed Issues

### CR-01: Reprinted receipts drop the tax breakdown entirely, contradicting the original receipt for the same sale

**Files modified:** `src/entities/payment/model/queries.ts`, `src/entities/payment/model/receipt-reconstruction.integration.test.ts`
**Commits:** `929406c`, `0334d35`
**Applied fix:** `fetchReceiptDataForPayment` now fetches the `billing` settings row (alongside the
existing `general` row) and runs the summed leg amount through the same `decomposeTax` used by
`process-payment`/`process-direct-sale`, populating `subtotal`/`taxAmount`/`taxRatePercent`/
`taxInclusive` on the reprint receipt instead of leaving them unset. Reused the existing cross-tree
import pattern already established by `src/shared/lib/__tests__/edge-tax.test.ts`
(`allowImportingTsExtensions: true` in `tsconfig.json` makes `decomposeTax` importable directly
from `supabase/functions/_shared/tax.ts`, which has zero imports of its own). Updated the
`receipt-reconstruction.integration.test.ts` integration test (real local Supabase) to assert
`taxAmount` is now defined and `subtotal + taxAmount ≈ total` on both the single-tender and
split-tender reprint paths, deriving the expected split from the live `billing` settings row rather
than a hardcoded pre-tax-decomposition value.

### WR-01: `process-payment`/`process-split-payment` decompose tax for `rappi` payments even though the payment screen shows zero tax for `rappi`

**Files modified:** `supabase/functions/process-payment/index.ts`, `supabase/functions/process-split-payment/index.ts`, `supabase/functions/_shared/tax.ts`, `src/shared/lib/__tests__/edge-tax.test.ts`
**Commits:** `c39e1b4` (initial per-call-site fix), `99fe6e1` (root-cause consolidation + tests)
**Applied fix:** Both edge functions initially got an inline `method === 'rappi'` ternary mirroring
`PaymentForm.tsx`'s own zero-tax check (`c39e1b4`). Since the same branch was duplicated in two
call sites, it was then extracted into a single shared `decomposeTaxForMethod(method, chargedAmount,
taxRatePercent, taxInclusive)` helper in `supabase/functions/_shared/tax.ts` and both edge functions
were switched to call it (`99fe6e1`) — a Rappi payment now always reports `{subtotal: chargedAmount,
taxAmount: 0, total: chargedAmount}` on its receipt, matching what the cashier saw on the payment
screen; every other method still routes through the unmodified `decomposeTax`. Added unit tests to
`src/shared/lib/__tests__/edge-tax.test.ts` asserting rappi always yields zero tax regardless of
rate/mode, and that cash/card delegate unchanged to `decomposeTax`.

### WR-03: Toggling `taxInclusive` in Billing Settings has no confirmation and no visible warning about its store-wide effect

**Files modified:** `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx`, `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx`, `src/shared/lib/i18n/locales/en-US/wAdmin.json`, `src/shared/lib/i18n/locales/es-MX/wAdmin.json`
**Commit:** `2a6175d`
**Applied fix:** Added a `ConfirmDialog` (same component/pattern as `PINLoginForm.tsx`'s
opening-cash flow) gating the "Save Billing" click whenever `form.taxInclusive` differs from the
last-loaded `data.billing.taxInclusive` value; saving proceeds immediately (no dialog) when
`taxInclusive` is unchanged. Added new `billingSettingsTab.taxInclusiveConfirmTitle`/
`taxInclusiveConfirmDescription` i18n keys (both locales) explaining the store-wide price
reinterpretation before commit, reusing `common:actions.confirm`/`actions.cancel` for the dialog's
buttons (matching `PaymentForm.tsx`'s existing pattern for those labels). Updated the existing
"clicking the taxInclusive toggle then Save Billing…" unit test to assert the mutation does not
fire until the dialog is confirmed, and added a new test asserting cancel leaves the mutation
un-called.

## Skipped Issues

### WR-02: `process-split-payment`'s per-leg tax decomposition compounds the pre-existing "full basket, partial total" receipt mismatch

**File:** `supabase/functions/process-split-payment/index.ts:264-276,340-370`
**Reason:** REVIEW.md's own two proposed fixes both require a product/design decision beyond a
same-shape mechanical fix — (a) scaling `items[]` down to each leg's proportional share changes
what's printed on a customer-facing receipt, and (b) sourcing `subtotal`/`total` from the tab's full
amount plus a new "amount collected on this tender" field is a `ReceiptData` contract change
touching every receipt renderer (thermal print, PDF export, email). Per REVIEW.md's own fallback
suggestion, documented as a known limitation instead: see
`.planning/phases/24-tax-configuration-inclusive-exclusive-toggle/deferred-items.md`
(commit `9e26da5`) for the full write-up and suggested fix.
**Original issue:** Each split-payment leg's receipt still renders the tab's entire item list
while `subtotal`/`taxAmount`/`total` are decomposed from only that leg's amount — e.g. a $100 sale
split 50/50 cash+card shows $100 worth of item lines on both receipts, but each one's decomposed
subtotal+tax only sums to $50. Pre-existing to Phase 24 (documented "D-09" in the file's own header
comment); Phase 24's tax-decomposition change made the mismatch more visible without introducing it.

---

_Fixed: 2026-09-01T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
