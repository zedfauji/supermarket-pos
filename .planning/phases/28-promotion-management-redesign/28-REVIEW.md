---
phase: 28-promotion-management-redesign
reviewed: 2026-09-04T00:00:00Z
depth: standard
files_reviewed: 60
files_reviewed_list:
  - e2e/checkout/promotion-live-price.spec.ts
  - e2e/errors/promotion-floor-guard.spec.ts
  - e2e/infra/close-tab-rpc-hardening.spec.ts
  - e2e/infra/offline-promotion-conflict.spec.ts
  - e2e/infra/offline.spec.ts
  - e2e/payments/apply-promotion-and-custom-discount.spec.ts
  - e2e/payments/promotion-snapshot-refund-reopen.spec.ts
  - e2e/payments/refund-manager-pin-identity.spec.ts
  - e2e/promotions/loose-weight-open-unit-interaction.spec.ts
  - e2e/promotions/migrated-review-flag.spec.ts
  - e2e/promotions/multi-target-scope.spec.ts
  - e2e/promotions/percent-field-input.spec.ts
  - e2e/promotions/promotion-deleted-mid-cart.spec.ts
  - e2e/promotions/recurrence-timezone.spec.ts
  - e2e/promotions/scope-overlap-resolution.spec.ts
  - e2e/promotions/timezone-boundary.spec.ts
  - e2e/promotions/wizard-step-validation.spec.ts
  - e2e/reports/report-tabs.spec.ts
  - e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts
  - e2e/tabs/reopen-closed-ticket.spec.ts
  - e2e/tabs/reopen-manager-pin-identity.spec.ts
  - src/app/router.tsx
  - src/entities/promotion/index.ts
  - src/entities/promotion/model/promotion-pricing.ts
  - src/entities/promotion/model/queries.ts
  - src/entities/promotion/model/types.ts
  - src/entities/tab/ui/CartItem.tsx
  - src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts
  - src/features/edit-paid-tab/model/useEditPaidTab.test.ts
  - src/features/edit-paid-tab/model/useEditPaidTab.ts
  - src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx
  - src/features/manage-promotions/model/usePromotionWizardState.test.ts
  - src/features/manage-promotions/model/usePromotionWizardState.ts
  - src/features/manage-promotions/ui/PromotionWizardPage.tsx
  - src/features/manage-promotions/ui/wizard/StepReview.tsx
  - src/features/manage-promotions/ui/wizard/StepScope.tsx
  - src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx
  - src/features/process-refund/model/useProcessRefund.test.ts
  - src/features/process-refund/model/useProcessRefund.ts
  - src/features/process-refund/process-refund-rpc.integration.test.ts
  - src/features/process-refund/ui/RefundSheet.tsx
  - src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts
  - src/features/reopen-tab/model/useReopenTab.test.ts
  - src/features/reopen-tab/model/useReopenTab.ts
  - src/features/reopen-tab/ui/ReopenTabDialog.tsx
  - src/pages/promotions/index.tsx
  - src/shared/lib/domain.ts
  - src/shared/lib/i18n/locales/en-US/common.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/common.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/shared/lib/supabase.types.ts
  - src/shared/lib/test-setup.ts
  - src/shared/ui/DateRangePicker.presets.ts
  - src/shared/ui/DateRangePicker.tsx
  - src/shared/ui/MultiSelectPicker/MultiSelectPicker.stories.tsx
  - src/shared/ui/MultiSelectPicker/MultiSelectPicker.test.tsx
  - src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx
  - src/shared/ui/MultiSelectPicker/index.ts
  - src/shared/ui/StatusBadge.tsx
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - supabase/migrations/20260904000001_promotion_targets_recurrence.sql
  - supabase/migrations/20260904000002_manager_pin_identity_audit.sql
findings:
  critical: 1
  warning: 6
  info: 0
  total: 7
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-09-04
**Depth:** standard
**Files Reviewed:** 60 (listed above)
**Status:** issues_found

## Summary

Reviewed the promotion_targets/recurrence schema migration, the manager-PIN
identity-audit hardening migration (process_refund/reopen_tab/edit_paid_tab/
close_tab), the new 4-step promotion wizard, the shared MultiSelectPicker/
DateRangePicker primitives, and the client-side promotion pricing mirror
(`promotion-pricing.ts`) against its SQL source of truth in
`process_direct_sale_atomic`.

The SQL migrations themselves are solid: the junction-table CHECK
constraints, partial unique indexes, `needs_review` backfill, and the
per-item recurrence AND-filter in `process_direct_sale_atomic` all match
their documented intent, and the manager-PIN re-key on `process_refund`/
`reopen_tab`/`edit_paid_tab` correctly derives the authorizing staff member
from `p_manager_pin` (not the caller's own session role) with a consistent
fail-closed pattern. However, one of the four RPCs hardened in the same
migration (`close_tab`) was hardened with a weaker, inconsistent check than
its three siblings, and the promotion wizard's edit-mode save path has a
real silent-scope-widening gap. The client-side `evaluateBestPromotion`
mirror of the SQL pricing logic also diverges from its SQL source in two
edge cases (recurrence-array semantics, and time-of-day granularity) that
can produce real (if narrow) checkout-time discrepancies.

## Critical Issues

### CR-01: Promotion wizard's edit-mode Save bypasses Scope/Validity step validation, silently widening an intentionally-narrow promotion to store-wide

**Status: FIXED** — commit `e4217ef` (`fix(28): block promotion save when Scope step is left invalid (CR-01)`). `handleSave()` now calls `wizard.isScopeStepValid()` and `wizard.isValidityStepValid()` before `wizard.save()`, bouncing an invalid state back to that step with its error shown, exactly as `goToStep()`/`handleNext()` already did. Regression test added:
`e2e/promotions/wizard-step-validation.spec.ts` — "edit mode blocks Save when the admin leaves Scope in an invalid state, does not silently wipe an existing scope to store-wide" (fails without the fix, passes with it).

**File:** `src/features/manage-promotions/ui/PromotionWizardPage.tsx:51-76, 100-112`
**Issue:**
`goToStep()` (lines 51-76) only re-validates Basics/Scope/Validity when
`!isEditMode` — by design (D-10), edit mode allows jumping to any tab,
including Review, with zero forward-gating (proven by
`e2e/promotions/wizard-step-validation.spec.ts`'s "edit mode allows
immediate navigation to any step" test). `handleSave()` (lines 100-112)
then calls **only** `wizard.validateBasics()` before persisting — it never
calls `wizard.isScopeStepValid()` or `wizard.isValidityStepValid()`.

Combine this with `usePromotionWizardState.ts`'s `save()` (lines 306-313):

```ts
const targets = storeWide
  ? []
  : [
      ...selectedProductIds.map(id => ({ productId: id, categoryId: null })),
      ...selectedCategoryIds.map(id => ({ productId: null, categoryId: id })),
    ];
```

If an admin edits an existing narrowly-scoped promotion, unchecks
"Store-wide" on the Scope step, then (without selecting any product/
category — an invalid state that `isScopeStepValid()` would normally
reject) navigates straight to Review and clicks Save, `targets` evaluates
to `[]` — **identical to a genuine store-wide promotion** — with no error,
no confirmation, and no validation message at all. The admin's screen never
showed the "select at least one product or category" error because that
error is gated behind `scopeAttempted`, which is only set inside the
`!isEditMode` branch of `goToStep()`/`handleNext()`.

The same gap applies to the Validity step: an invalid time window (e.g.
`startTime` set but `endTime` left null, or `endTime <= startTime`) can
reach `save()` unvalidated; that specific case is at least caught by the DB
CHECK constraints (`promotions_recurrence_both_or_neither` /
`promotions_recurrence_same_day`) and surfaces as an ugly raw Postgres
error — but the scope-widening case has **no backstop at any layer**: it
is valid input as far as the DB (and `promotion_targets` schema) is
concerned, so it silently persists a materially different (and strictly
broader/more expensive) promotion than what the admin configured.

**Fix:** Call the full step-validity gate before saving, regardless of
edit mode:
```ts
async function handleSave() {
  if (!wizard.validateBasics()) {
    wizard.setCurrentStep('basics');
    return;
  }
  if (!wizard.isScopeStepValid()) {
    wizard.setCurrentStep('scope');
    setScopeAttempted(true);
    return;
  }
  if (!wizard.isValidityStepValid()) {
    wizard.setCurrentStep('validity');
    setValidityAttempted(true);
    return;
  }
  const result = await wizard.save();
  // ...
}
```

## Warnings

### WR-01: `close_tab`'s new role gate omits the `is_active` check its sibling-hardened RPCs all have

**File:** `supabase/migrations/20260904000002_manager_pin_identity_audit.sql:663-674`
**Issue:** This same migration re-keys `process_refund` (line 79),
`reopen_tab` (line 224), and `edit_paid_tab` (line 411) onto
`p.pin = p_manager_pin AND p.is_active = true AND rp.action = ...`. But
`close_tab`'s new gate (added in the same migration) is:

```sql
SELECT id INTO v_staff_id FROM profiles
WHERE id = auth.uid() AND role IN ('manager', 'admin');
```

— no `is_active` check at all. Per CLAUDE.md, `profiles.is_active` and
Supabase Auth's own session validity are two independent stores (a
deactivated staff member's JWT/session can remain valid after an admin
flips `is_active = false` on their profile, since only GoTrue's own token
store — not `profiles` — controls session revocation). This means a
manager/admin whose account has just been deactivated, but who still holds
a live browser session, can continue to call `close_tab` directly (it is a
plain `GRANT EXECUTE ... TO authenticated` RPC) to force a tab's status —
exactly the class of gap this migration exists to close for the other
three RPCs.
**Fix:**
```sql
SELECT id INTO v_staff_id FROM profiles
WHERE id = auth.uid() AND role IN ('manager', 'admin') AND is_active = true;
```

### WR-02: `close_tab` performs no tab-status state-machine validation — any manager/admin can force any status transition

**File:** `supabase/migrations/20260904000002_manager_pin_identity_audit.sql:648-711`
**Issue:** Unlike `reopen_tab` (which gates on current status, reopen
count, and a 24h window) and `edit_paid_tab` (which gates on current
status), `close_tab`'s only guard is the role check (WR-01) plus an
optimistic-version check. There is no restriction on `p_status` relative
to the tab's current status — a manager/admin can call
`close_tab(tabId, 'voided')` on a `'paid'` tab, or `close_tab(tabId,
'open')` on a `'voided'` tab, entirely bypassing `process_refund`'s
over-refund guard, `reopen_tab`'s reopen-cap/window, and any offsetting
caja-entry bookkeeping those dedicated RPCs perform. The migration's own
comment acknowledges this RPC currently has zero UI callers, which limits
exposure today, but the function is a live `GRANT EXECUTE ... TO
authenticated` endpoint reachable by any manager/admin session (proven
reachable in `e2e/infra/close-tab-rpc-hardening.spec.ts`), with no
caja-reconciliation side effect when it silently reverses a `'paid'` tab's
revenue.
**Fix:** At minimum, restrict `p_status` transitions to a known-safe
allowlist (e.g. reject `'paid' -> 'voided'`/`'open'` transitions that skip
`process_refund`'s bookkeeping), or record an offsetting `caja_entries` row
whenever this RPC reverses a revenue-bearing status the same way
`reopen_tab` does.

### WR-03: `evaluateBestPromotion`'s time-of-day comparison uses minute granularity while the SQL source of truth uses second granularity

**File:** `src/entities/promotion/model/promotion-pricing.ts:128-137`
**Issue:**
```ts
const start = promo.startTime.slice(0, 5);
const end = promo.endTime.slice(0, 5);
if (hhmm < start || hhmm > end) continue;
```
`hhmm` is built from `Intl.DateTimeFormat`'s `hour`/`minute` parts only
(no seconds), so this comparison is minute-granular. The SQL it's supposed
to mirror (`20260904000001_promotion_targets_recurrence.sql:324`) is
`(now() AT TIME ZONE v_store_tz)::time BETWEEN p.start_time AND
p.end_time` — second-granular, using `time` values that typically carry
`:00` seconds when authored via the wizard's `<input type="time">` (e.g.
`end_time = '18:00:00'`).

Concretely: for a promotion window ending at `18:00`, the SQL rejects the
promotion as soon as the wall clock passes `18:00:00` (i.e. at `18:00:01`),
but the client's `hhmm` stays `"18:00"` (equal to `end`, not greater) for
the entire `18:00:00`–`18:00:59` minute, so the client keeps showing the
discount as active for up to 59 seconds after the server has already
stopped applying it. Because `unit_price` sent to
`process_direct_sale_atomic` is always the undiscounted catalog price
(confirmed in `cartItemsToRpcItems`, `useCheckoutSale.ts:56-79`) the price
itself can never be wrong, but `p_amount`/`p_expected_total` (the payment
total) IS derived from the client's discounted cart total
(`item.lineTotal`, itself seeded from `evaluateBestPromotion` at
add-to-cart time) — so a checkout that straddles this boundary window can
legitimately fail `AMOUNT_MISMATCH` every single day at the same
boundary minute for any time-windowed promotion.
**Fix:** Include seconds in the client-side comparison (or truncate the
DB's `start_time`/`end_time` to whole minutes consistently on both sides),
e.g. compare `HH:MM:SS` end-to-end instead of slicing to `HH:MM`.

### WR-04: `evaluateBestPromotion` treats an empty (non-null) `daysOfWeek` array as "no restriction", inverse of the SQL/DB semantics

**File:** `src/entities/promotion/model/promotion-pricing.ts:120-122`
**Issue:**
```ts
const needsRecurrenceCheck =
  (promo.daysOfWeek !== null && promo.daysOfWeek.length > 0) ||
  (promo.startTime !== null && promo.endTime !== null);
```
When `daysOfWeek === []` (empty array, not `null`), `needsRecurrenceCheck`
is `false` for the day-of-week half of the filter, so the promotion is
treated as valid every day. The SQL recurrence filter
(`20260904000001_promotion_targets_recurrence.sql:323`) is
`p.days_of_week IS NULL OR EXTRACT(DOW ...) = ANY(p.days_of_week)` — for a
non-null empty array, `x = ANY('{}')` is always `false`, so the SQL
filter **never** matches (the exact opposite reading). The DB's own CHECK
constraint (`promotions_days_of_week_valid`,
`20260904000001_promotion_targets_recurrence.sql:118-120`) explicitly
permits an empty array (`'{}' <@ ARRAY[0..6]` is vacuously true), so this
is a reachable DB state, not merely a type-level impossibility.

Today's wizard `save()` path normalizes an empty selection back to `null`
before persisting (`usePromotionWizardState.ts:299`), so this specific
divergence isn't reachable through the current UI — but it is a latent
trap for any other write path (direct SQL, a future bulk-import feature,
or a future edit affordance) that leaves `days_of_week = '{}'`: the client
preview would show the promotion as always-applicable while the server
would never apply it, or vice versa if the fallback logic is ever changed.
**Fix:** Match the SQL's literal semantics —
`const needsDaysCheck = promo.daysOfWeek !== null;` and, when
`promo.daysOfWeek.length === 0`, reject the candidate outright (mirrors
`x = ANY('{}')` being always false) rather than falling through to "every
day".

### WR-05: `PaymentForm`'s manual "Apply Promotion" dropdown omits the recurrence filter, letting a manager pick a currently-inapplicable promotion with no feedback

**File:** `src/widgets/PaymentModal/ui/PaymentForm.tsx:303-309`
**Issue:**
```ts
const activePromotionOptions = useMemo(() => {
  const now = new Date();
  return (allPromotions ?? []).filter(p => p.active && now >= p.startsAt && now <= p.endsAt);
}, [allPromotions]);
```
This only checks the overall active-date-range window, never the
day-of-week/time-of-day recurrence fields. A promotion restricted to
e.g. "weekdays 9am-5pm" remains selectable in this dropdown on a Sunday
or at 8pm. Selecting it feeds into `effectiveItems`
(`PaymentForm.tsx:316-344`), which correctly calls
`evaluateBestPromotion` and correctly returns no match outside the
window — but the UI gives **zero feedback**: the manager sees the
promotion apparently "selected" in the dropdown, yet every line item's
price and the order total remain completely unchanged, with no
explanation of why. This is a real UX/quality defect around the exact
promotion-pricing surface this phase adds.
**Fix:** Either filter `activePromotionOptions` through the same
recurrence check `evaluateBestPromotion` uses (extract
`getStoreLocalDowAndTime`-based matching into a small reusable
predicate), or render an inline "not currently in its active window"
hint next to a selected-but-non-matching promotion.

### WR-06: Manager-PIN-gated RPCs record only the PIN-owning manager as actor, never the actual authenticated caller

**File:** `supabase/migrations/20260904000002_manager_pin_identity_audit.sql:111-114, 148-158, 313-316, 575-582`
**Issue:** All three re-keyed RPCs (`process_refund`, `reopen_tab`,
`edit_paid_tab`) now derive `v_staff_id` exclusively from `p_manager_pin`,
and use that single value for every downstream record: `refunds.created_by`,
the negative `payments.processed_by`, `caja_entries.staff_id`, and the
`record_audit(...)` before/after snapshots. There is no capture anywhere
of `auth.uid()` — the actual signed-in session that invoked the RPC (which,
per the whole point of this migration, may be a cashier, not the manager
whose PIN was entered). If a manager's PIN is later found to have been
shared/compromised, none of the audit trail across these three RPCs can
distinguish "the manager personally performed this" from "a cashier
performed this with the manager's PIN typed in" — every row attributes
the action solely to the manager. This mirrors the pre-existing G-27-13
pattern for `process_direct_sale_atomic` and is consistent by design, but
it is worth flagging now that it has been extended to three more
high-impact operations (refunds, reopens, paid-tab edits).
**Fix:** Thread `auth.uid()` alongside `v_staff_id` into `record_audit`'s
details payload (e.g. `jsonb_build_object('authorizedBy', v_staff_id,
'invokedBy', auth.uid())`) so the two identities are both recoverable
from the audit log without changing the existing `created_by`/
`processed_by`/`caja_entries.staff_id` columns' semantics.

---

_Reviewed: 2026-09-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
