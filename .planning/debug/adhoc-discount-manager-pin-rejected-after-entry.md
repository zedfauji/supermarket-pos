---
status: diagnosed
trigger: "gap_id G-27-13 (27-UAT.md test 13): 'while applying the discount on payment page , when turned on the button for discount it ask for PIN , after entering he correct PIN and discount , when processing the payment , it throws error that it still requires manager PIN but it never asks.'"
created: 2026-09-03T00:00:00Z
updated: 2026-09-03T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — ManagerPinDialog's PIN match resolves an eligible staff member client-side but discards that identity; every RPC call re-derives authorization from the CURRENTLY LOGGED-IN staff (the session JWT), not the PIN-holder. process_direct_sale_atomic's manager-override role re-check is therefore keyed to the acting cashier's own role_permissions row, which does not include apply_custom_discount (manager+-only) — so a cashier-operated till that gets a manager's PIN typed into the dialog is rejected server-side with FORBIDDEN/DISCOUNT_REQUIRES_MANAGER even though the dialog already reported success.
test: n/a — root cause confirmed via direct code trace, not a runtime experiment (goal: find_root_cause_only)
expecting: n/a
next_action: none — investigation complete, returning ROOT CAUSE FOUND to caller

## Symptoms

expected: After a correct manager PIN unlocks the ad-hoc discount section and a discount amount is set, submitting the payment succeeds — the server does not re-reject it for missing manager authorization.
actual: "while applying the discount on payment page , when turned on the button for discount it ask for PIN , after entering he correct PIN and discount , when processing the payment , it throws error that it still requires manager PIN but it never asks."
errors: process_direct_sale_atomic returns `FORBIDDEN` ("Not authorized to apply a manager override") when p_manager_override=true is claimed but the calling p_staff_id's role lacks apply_custom_discount, or `DISCOUNT_REQUIRES_MANAGER` ("Ad-hoc discount requires manager authorization") if managerOverride never reached the RPC as true at all. Both surface as errorMessage on PaymentForm (result.error.message shown verbatim in the payment-error-alert).
reproduction: Log in as a cashier (the realistic day-to-day checkout operator — cashiers have close_tab but NOT apply_custom_discount per src/shared/lib/rbac.ts:40-47/61). On CheckoutPanel (direct sale) or PaymentPane (reopened tab), toggle the ad-hoc discount section, have a MANAGER type their own PIN into ManagerPinDialog (matches an eligible staff member, dialog reports success), set a discount value, submit payment. Server rejects.
started: Phase 27 Plan 04 (PIN-gating added, commit dab6da7) — the flow was never reachable/functional before this plan, so this is a first-exposure bug, not a regression.

## Eliminated

- hypothesis: CR-01's "gate Apply-Promotion selector to processors.processBankTransferPayment presence" fix (commit e99af80) accidentally also gated or broke the ad-hoc discount section.
  evidence: Read current PaymentForm.tsx (lines 770-894) — the "Apply Promotion" section (lines 770-802) and the ad-hoc "Discount" section (lines 804-894) are two separate, independently-rendered `<section>` blocks. CR-01's `processors.processBankTransferPayment &&` gate is only on the Apply-Promotion section's condition (line 771); the discount-toggle section's render condition is unchanged (`method !== 'rappi'`, line 804) and renders identically on both PaymentPane and CheckoutPanel.
  timestamp: 2026-09-03T00:05:00Z

- hypothesis: PaymentForm.tsx's client-side discountInfoArg construction drops/loses managerOverride before it reaches the processor call.
  evidence: Read runPayment() (lines 403-517) and handleSplitPrimary() (lines 573-608) in full. Both correctly compute `effectiveManagerOverride = overrideManagerOverride ?? managerOverride` and include `managerOverride: effectiveManagerOverride` in discountInfoArg whenever `discountAmount > 0 || effectiveManagerOverride`. managerOverride state is set true synchronously in ManagerPinDialog's onSuccess handler (line 1378) before discountExpanded flips true, so by the time a user sets a discount value and submits, the flag is already true. No client-side loss found.
  timestamp: 2026-09-03T00:12:00Z

- hypothesis: payment-processor.ts's processCashPayment/processCardPayment/processSplitPayment drop the managerOverride field for one call path (asymmetric wiring per plan hints).
  evidence: Read payment-processor.ts in full (186 lines). Every one of processCashPayment/processCardPayment/processSplitPayment/processRappiPayment forwards `managerOverride: discountInfo?.managerOverride` into callProcessPayment/callProcessSplitPayment identically (only processRappiPayment omits it, but Rappi is out of scope — the discount section is hidden for method==='rappi'). No asymmetry found.
  timestamp: 2026-09-03T00:15:00Z

- hypothesis: The direct-sale edge function (process-direct-sale) or its request-schema fails to forward managerOverride to process_direct_sale_atomic's p_manager_override parameter.
  evidence: Read supabase/functions/process-direct-sale/index.ts in full. BodySchema declares `managerOverride: z.boolean().optional()` (line 44) and the RPC call explicitly sets `p_manager_override: body.data.managerOverride ?? false` (line 317). This path is correctly wired end-to-end at the transport layer.
  timestamp: 2026-09-03T00:20:00Z

## Evidence

- timestamp: 2026-09-03T00:25:00Z
  checked: src/features/manager-pin-gate/ui/ManagerPinDialog.tsx (full file, 106 lines)
  found: "handlePinComplete(enteredPin) does `const match = eligibleStaff.find(s => s.pin === enteredPin); if (match) { onSuccess(); }` — `onSuccess` is a zero-argument callback (`onSuccess: () => void` in the props interface, line 22). The matched staff member's identity (`match.id`, `match.role`) is computed, used only for the boolean truthy check, then discarded. No caller in the codebase receives or threads through which staff's PIN was actually entered."
  implication: Every consumer of ManagerPinDialog (PaymentForm, RefundSheet, PaymentPane's close_tab gate, etc.) can only know "some eligible staff member's PIN was entered correctly" — never WHO. Any RPC authorization that needs to know which staff authorized the action has no way to receive that identity from this component as currently designed.

- timestamp: 2026-09-03T00:30:00Z
  checked: src/widgets/PaymentModal/ui/PaymentForm.tsx lines 1369-1389 (ManagerPinDialog usage) and 168-175 (staffId prop origin)
  found: onSuccess only calls `setManagerOverride(true)` / `setDiscountExpanded(true)` / triggers a below-cost retry — never captures `match` from ManagerPinDialog (impossible anyway, since onSuccess takes no args). The `staffId` prop PaymentForm receives (used nowhere in the discount flow itself, but the RPC call always authenticates via the cached Supabase session token, not this prop) traces back to the CURRENTLY LOGGED-IN staff (`useStaffStore().currentStaff`), set once at login and unrelated to ManagerPinDialog.
  implication: The payment RPC call is always made under the currently-logged-in staff's own identity/session, regardless of which staff's PIN was typed into the dialog.

- timestamp: 2026-09-03T00:35:00Z
  checked: supabase/functions/process-direct-sale/index.ts lines 267-286 (auth resolution + RPC call)
  found: `p_staff_id: authUser.id` where `authUser` is resolved by verifying the request's Bearer JWT against `/auth/v1/user` — i.e., whoever is authenticated in the browser session making the HTTP call (the logged-in cashier at the till), not any identity derived from the PIN entered into ManagerPinDialog.
  implication: Confirms the server-side authorization check (next finding) is evaluated against the cashier's own account, not the PIN-matched manager's account.

- timestamp: 2026-09-03T00:40:00Z
  checked: supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql lines 121-143 (manager-override re-check)
  found: |
    ```sql
    IF p_manager_override THEN
      PERFORM 1 FROM profiles p JOIN role_permissions rp ON rp.role = p.role
        WHERE p.id = p_staff_id AND rp.action = 'apply_custom_discount';
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to apply a manager override');
      END IF;
    END IF;

    IF p_discount_scope IS NOT NULL OR p_discount_type IS NOT NULL
       OR p_discount_value IS NOT NULL OR p_discount_amount IS NOT NULL THEN
      IF NOT p_manager_override THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DISCOUNT_REQUIRES_MANAGER', 'message', 'Ad-hoc discount requires manager authorization');
      END IF;
      ...
    ```
    The role join is keyed on `p.id = p_staff_id` — the CALLER's own profile row, not any staff identified by the client-side PIN match. The migration's own header comment (lines 20-24) documents this as deliberate: "Whenever p_manager_override=true is claimed, the caller's role is independently re-checked against role_permissions('apply_custom_discount') ... mirrors process_refund's two-layer pattern."
  implication: If the caller (the currently logged-in staff processing the sale) does not themselves hold apply_custom_discount, this check fails with FORBIDDEN regardless of managerOverride being true and regardless of which staff's PIN unlocked the client-side dialog.

- timestamp: 2026-09-03T00:45:00Z
  checked: src/shared/lib/rbac.ts lines 40-47, 49-62
  found: CASHIER_ACTIONS = {create_order, view_own_tabs, view_all_tabs, clock_in, clock_out, close_tab} — does NOT include apply_custom_discount. apply_custom_discount is only granted via MANAGER_EXTRA (manager+ only), with an explicit comment: "ad-hoc discount + below-cost floor-guard override — manager+ only (Phase 27, PROMO-05/07)".
  implication: Cashiers — the role that actually operates day-to-day checkout per this codebase's own RBAC comment ("cashiers can process payments via PIN verification") — categorically cannot pass the RPC's role re-check under their own p_staff_id, no matter what PIN was entered into ManagerPinDialog. The feature is structurally non-functional for its stated purpose (letting a cashier get a manager's sign-off without a full re-login) whenever the till is logged in as a cashier.

- timestamp: 2026-09-03T00:48:00Z
  checked: .planning/phases/27-promotions-discount-management/27-04-SUMMARY.md key-decisions / tech-stack.patterns
  found: "E2E specs that reach ManagerPinDialog's authorized branch must be logged in AS the eligible role (manager/admin) — the RPC's server-side role re-check is keyed off the currently logged-in staff's own p_staff_id, not the staff whose PIN was entered in the dialog. ... This matches every other manager-PIN-gated E2E spec already in this codebase."
  implication: This is a KNOWN, previously-documented behavior of the ManagerPinDialog pattern across the whole codebase (refund, reopen_tab, edit_paid_tab, etc.), not something newly introduced by Phase 27 in isolation — Phase 27's E2E coverage (apply-promotion-and-custom-discount.spec.ts) explicitly logs in as manager specifically because it would fail otherwise, which is exactly why this UAT gap was never caught by automated tests: the tests sidestep the real-world cashier-operates / manager-authorizes scenario entirely.

- timestamp: 2026-09-03T00:52:00Z
  checked: supabase/functions/process-payment/index.ts (full file, reopened-tab / PaymentPane path) and supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql (process_payment_atomic / process_split_payment_atomic definitions)
  found: Independent, secondary finding (not the cause of the reported "requires manager PIN" error, but a related gap on the OTHER payment screen the hints asked to check). process-payment/index.ts's BodySchema (lines 6-40) does not declare discountScope/discountType/discountValue/discountAmount/managerOverride at all — Zod strips them silently before the RPC call at line 149, which itself only passes p_tab_id/p_staff_id/p_amount/p_method/p_idempotency_key/p_tendered_amount/p_reference_number/p_rappi_order_id/p_expected_version, no discount fields whatsoever. process_payment_atomic and process_split_payment_atomic (as CREATEd in 20260902000001) DO accept p_discount_scope/type/value/amount as parameters (used by the payments-row INSERT) but have NO p_manager_override parameter and NO role-check/DISCOUNT_REQUIRES_MANAGER/FORBIDDEN gate anywhere in their bodies.
  implication: On PaymentPane (reopened tab), the ad-hoc discount toggle+PIN dialog is pure client-side theater end-to-end for TWO independent reasons: (1) whatever discount fields PaymentForm sends never reach process_payment_atomic at all (edge function schema silently drops them), and (2) even if they did, that RPC has no server-side authorization check to reject or accept. This does not produce the reported "still requires manager PIN" error — it would instead silently accept the payment at the reduced client-computed amount with no discount ever recorded (a silent-underpayment variant of the already-known CR-01 gap), OR leave the tab open per the "fully covered" check (v_discount_recorded stays 0 since discount_amount was never actually passed through). Flagged for the fix step since the hints explicitly asked to check this path, but it is not what a cashier hitting "still requires manager PIN" is experiencing — that error text can only come from process_direct_sale_atomic's FORBIDDEN/DISCOUNT_REQUIRES_MANAGER codes (direct-sale/CheckoutPanel path), confirmed above.

## Resolution

root_cause: |
  ManagerPinDialog (src/features/manager-pin-gate/ui/ManagerPinDialog.tsx) authenticates a PIN
  against the list of staff eligible for the requested action, but its onSuccess() callback carries
  no information about WHICH staff member's PIN matched — every caller (PaymentForm included) can
  only observe "an eligible PIN was entered," never the matched staff's identity. Because of this,
  the actual payment RPC (process_direct_sale_atomic, reached via CheckoutPanel -> useCheckoutSale ->
  process-direct-sale edge function) is always invoked as the CURRENTLY LOGGED-IN staff (resolved
  server-side from the session's own JWT, `p_staff_id: authUser.id`) — never as the manager who typed
  their PIN into the dialog. The RPC's own manager-override re-check
  (20260901000002_process_direct_sale_atomic_promotions.sql:127-133) queries role_permissions keyed
  on that same p_staff_id, i.e. the acting cashier's own role — and apply_custom_discount is
  manager+-only (src/shared/lib/rbac.ts:40-62), so a cashier's own account never passes this check no
  matter whose PIN was entered client-side. The dialog reports success (a real manager's PIN did
  match), the client faithfully sends managerOverride:true, but the server rejects with
  FORBIDDEN ("Not authorized to apply a manager override") — which reads to the cashier exactly like
  "it still requires manager PIN" despite one having just been entered, because from the server's
  point of view no manager ever actually authorized anything; the cashier is still the sole acting
  identity. This is a structural, pre-existing property of the ManagerPinDialog pattern (documented
  in 27-04-SUMMARY.md's own decisions as matching "every other manager-PIN-gated E2E spec"), first
  exposed by Phase 27 because it was the first manager-PIN-gated flow whose own E2E suite tested
  logged-in-as-manager only, so the real cashier-operates/manager-authorizes scenario was never
  exercised until this UAT pass.

  Secondary, independent finding (same UAT symptom area, PaymentPane/reopened-tab path only, does
  NOT itself produce "requires manager PIN" — flagged per the debug hints): process-payment's edge
  function schema and process_payment_atomic/process_split_payment_atomic RPCs never learned any
  discount fields (schema silently drops them before the RPC call) and process_payment_atomic has no
  manager-override authorization check at all, unlike process_direct_sale_atomic. This is a gap that
  should be closed alongside the fix, but it is not the cause of the specific rejection reported.

fix: (not applied — goal: find_root_cause_only)
verification: (not applicable — goal: find_root_cause_only)
files_changed: []
