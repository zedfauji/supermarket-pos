---
status: diagnosed
phase: 27-promotions-discount-management
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md, 27-05-SUMMARY.md, 27-06-SUMMARY.md, 27-07-SUMMARY.md]
started: 2026-09-03T00:00:00Z
updated: 2026-09-03T01:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Promotions schema + RLS + audit
expected: promotions table (product/category scope, percent/fixed, active date range) with RLS gated to manage_promotions (admin-only) and audit-trigger coverage on every CRUD op
result: pass
source: automated

### 2. Expiry-proximity auto-discount trigger
expected: flat threshold->discount, reuses settings.near_expiry.thresholdDays, new discountPercent field, default 14d/15%
result: pass
source: automated

### 3. Server-side sole price authority
expected: process_direct_sale_atomic recomputes the winning promotion discount server-side as sole authority (client-submitted unit_price still validated against undiscounted catalog price)
result: pass
source: automated

### 4. Best-price-wins pool
expected: Best-price-wins across product-scoped, category-scoped, and expiry-trigger candidates in one pool, tie-break by most-recently-created
result: pass
source: automated

### 5. Below-cost floor guard
expected: Below-cost floor guard blocks checkout without a manager override and succeeds with one, gated by a real server-side role re-check
result: pass
source: automated

### 6. entities/promotion model layer
expected: Promotion Zod type, usePromotions/mutation hooks, evaluateBestPromotion ready for downstream plans
result: pass
source: automated

### 7. /promotions route + dashboard tile
expected: /promotions route (admin-only, manage_promotions-gated) + Home dashboard tile, non-admin redirected to /home with a toast
result: pass
source: automated

### 8. Promotion Management UI (Create/Edit Dialog + Promotions Table)
expected: Create/Edit Promotion dialog supports product/category scope with percent/fixed discount (editable field, 0-100) and an active date range; Promotions DataTable lists/edits/deletes promotions with clear status
result: issue
reported: "New Promotion Dialoge is very basic. first of all it shouldn't be any dialoge , it should be a screen which gives more space to add more features and better layout , One Promtions could be applied to multiple products from multipe categories so a search options and multi select should be there , A promotion could be blank also just having discount ,a very generic one , such as Friends & Family Promotion applying 20% flat , Validaty options is serious out of logic , What is last 7 days i mean ? its not report its promotions for upcoming days , Time based Promotions should be also there , such as every day or someday or on selected days of week or month , promotions could be applied to lets say from 4PM to 6 PM , flat 20% Off , It shouldn't be on the same screen , it could be multiple screen and flow. a Wizard will do it i believe and on exit it should validate if everything s alright. percentage of discount text box is uneditable , 0 stays always. it needs to be rethinked and redesigned"
severity: major

### 9. NearExpirySettingsTab discount field
expected: discountPercent field (default 15) saves onto the same near_expiry settings row as thresholdDays, rejects out-of-range (0-100) saves
result: pass
source: automated

### 10. Live promotion evaluation on add-to-cart
expected: evaluateBestPromotion() wired into every add-to-cart path — ProductGrid onSelect and both branches of the peek window relay — a qualifying product's cart line stores the discounted price
result: pass
source: automated

### 11. Cart-line discount badge
expected: Cart-line 'X% off' discount Badge, never rendering the promotion's name
result: pass
source: automated

### 12. Checkout charges discounted total correctly
expected: process_direct_sale_atomic remains sole checkout-time price authority; a real checkout with an active promotion completes and charges the discounted total
result: pass
source: automated

### 13. Payment-screen ad-hoc discount (manager PIN flow)
expected: Toggling the ad-hoc discount section prompts for a manager PIN; a correct PIN reveals discount fields and lets the cashier set a discount; processing the payment with that discount succeeds without demanding the PIN again
result: issue
reported: "while applying the discount on payment page , when turned on the button for discount it ask for PIN , after entering he correct PIN and discount , when processing the payment , it throws error that it still requires manager PIN but it never asks."
severity: blocker

### 14. pool_only/consumptions_only discount scopes retired
expected: A single non-interactive 'all' label renders instead of the old scope buttons
result: pass
source: automated

### 15. Apply Promotion selector (no PIN required)
expected: A cashier can apply an existing active promotion at payment with no manager PIN; hidden when zero promotions are active; never overwrites ad-hoc discount fields
result: pass
source: automated

### 16. Below-cost override retry at payment
expected: A below-cost combination blocks the sale with UI-SPEC copy; a manager PIN retries the same payment attempt and completes at the allowed below-cost price
result: pass
source: automated

### 17. Historical discount badge on reopened/paid tab
expected: Reopened/paid tab's line-item list shows the discount actually charged, sourced from stored order_items fields, never a live re-evaluation
result: pass
source: automated

### 18. Refund reverses exact discounted amount
expected: A full refund reverses the exact discounted amount actually charged, never a re-derived list-price amount
result: pass
source: automated

### 19. Margin report correct against discounted price
expected: get_product_sales_report's margin formula is automatically correct against the discounted unit_price vs cost_price_snapshot, zero report-code changes
result: pass
source: automated

### 20. Offline cart-line promotion snapshot
expected: Cart line carries a promotion snapshot (promotionId, discountSnapshotAt) at add-to-cart time, independent of online/offline
result: pass
source: automated

### 21. Reconnect conflict flag
expected: On reconnect, a promotion-sourced cart line whose promotion changed or vanished is flagged, never silently re-priced or silently trusted
result: pass
source: automated

### 22. Flagged line blocks payment
expected: A flagged line blocks Process Payment until the cashier taps the indicator to accept the fresh price
result: pass
source: automated

### 23. Scope-overlap resolution
expected: Best-price-wins is discount-amount-driven, never scope-type-driven; zero-active-promotions baseline matches pre-Phase-27 undiscounted checkout
result: pass
source: automated

### 24. Store-local timezone date-range boundary
expected: ends_at computed from settings.general.timezone resolves correctly on both sides of the store-local midnight boundary
result: pass
source: automated

### 25. Promotion deleted mid-cart
expected: A promotion deleted while a discounted item sits in the cart is rejected server-side rather than silently charged; a reload recovers to the correct price
result: pass
source: automated

### 26. Loose-weight / open-unit promotion interaction
expected: A promotion on a loose-weight product discounts the weight-adjusted expected price, not the full per-kg list price; an open-unit child product's promotion is independent of its parent
result: pass
source: automated

### 27. Full project verification green
expected: Full project verification (typecheck, lint, unit, E2E) is green with Phase 27 included; no bar-pos-era enum/field leaked back into live source
result: pass
source: automated

## Summary

total: 27
passed: 25
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-27-8
  truth: "Promotion create/edit is a properly-scoped screen (not a cramped dialog): percent-discount field is editable, scope supports multi-select across multiple products/categories, a blank/generic promotion (e.g. flat 20% off, no target restriction) is a valid save, validity supports recurring day-of-week/time-of-day windows in addition to a date range with clear forward-looking semantics, and the flow (likely a multi-step wizard) validates completeness on exit."
  status: failed
  reason: "User reported: New Promotion Dialoge is very basic. first of all it shouldn't be any dialoge , it should be a screen which gives more space to add more features and better layout , One Promtions could be applied to multiple products from multipe categories so a search options and multi select should be there , A promotion could be blank also just having discount ,a very generic one , such as Friends & Family Promotion applying 20% flat , Validaty options is serious out of logic , What is last 7 days i mean ? its not report its promotions for upcoming days , Time based Promotions should be also there , such as every day or someday or on selected days of week or month , promotions could be applied to lets say from 4PM to 6 PM , flat 20% Off , It shouldn't be on the same screen , it could be multiple screen and flow. a Wizard will do it i believe and on exit it should validate if everything s alright. percentage of discount text box is uneditable , 0 stays always. it needs to be rethinked and redesigned"
  severity: major
  test: 8
  root_cause: |
    Two distinct causes:
    Part A (functional bug — percent field stuck at 0): PromotionFormDialog.tsx:58 holds
    discountValue as number-typed state (useState(0)), coerced via Number(e.target.value) on
    every keystroke with no string buffer. Clearing the field yields Number('')===0, which
    React redisplays as the literal "0"; new digits insert before the persistent 0 instead of
    replacing it (e.g. typing "20" produces "020"). NearExpirySettingsTab.tsx's sibling percent
    field (string state, coerce only at submit) does not exhibit this — confirms the pattern,
    not number inputs generally, is the defect.
    Part B (scope/architecture gaps — by design, not bugs):
    1. Scope cardinality: promotions.product_id/category_id are singular nullable FKs under an
       XOR CHECK (promotions_exactly_one_target) — no multi-select possible without schema change.
    2. Blank/unscoped promotion: same XOR CHECK actively rejects both NULL — a store-wide flat
       discount is currently impossible to save.
    3. Validity semantics: PromotionFormDialog reuses Reports' DateRangePicker, whose only
       presets (Today/Yesterday/Last 7 Days/This Month) all clamp `to` at today — zero
       forward-looking presets, hence "what is last 7 days" confusion.
    4. Time-of-day/day-of-week recurrence: promotions table has only starts_at/ends_at
       timestamptz — no recurrence columns or UI exist anywhere; net-new capability.
    5. Screen vs dialog: /promotions is a real routed page, but the create/edit form itself is
       a fixed-width Radix Dialog with every field in one non-paginated block, validated only
       on final Save — no wizard/step structure.
  artifacts:
    - path: "src/features/manage-promotions/ui/PromotionFormDialog.tsx"
      issue: "Part A: number-typed discountValue state (line 58) + per-keystroke Number() coercion (lines 272-281) causes the stuck-at-0 bug. Part B: single-value Select/CategoryTreePicker (lines 201-240, no multi-select), single non-paginated form validated only at Save (lines 106-320), DateRangePicker reused as-is with no forward-looking presets (lines 293-303)."
    - path: "supabase/migrations/20260901000001_promotions_schema.sql"
      issue: "promotions_exactly_one_target XOR CHECK (lines 47-49) blocks both multi-target and blank/unscoped promotions; product_id/category_id are singular FKs (lines 33-34), no recurrence columns."
    - path: "src/shared/lib/domain.ts"
      issue: "PromotionSchema (lines 1647-1675) mirrors the XOR scope constraint and has no recurrence fields."
    - path: "src/shared/ui/DateRangePicker.tsx"
      issue: "Presets (lines 20-57) are all backward-looking (Today/Yesterday/Last 7 Days/This Month); PromotionFormDialog is one of only two consumers, wired with zero promotion-appropriate presets added."
    - path: "src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx"
      issue: "Reference pattern for the Part A fix — string-state percent field (line 15), coerced to Number() only at save (line 49)."
  missing:
    - "String-buffered discount-value input (mirror NearExpirySettingsTab's pattern), coerce to Number only at submit/validation time"
    - "Multi-select product/category scope (schema: replace singular FK + XOR CHECK with a junction table or array column supporting 0..N products and 0..N categories)"
    - "Explicit 'no target restriction' / store-wide scope option, valid to save with zero products and zero categories"
    - "Forward-looking date-range presets and/or copy for promotion validity (distinct from the Reports DateRangePicker's backward-looking presets)"
    - "Recurring time-of-day and day-of-week promotion windows (new schema columns + UI — net-new capability, not a regression)"
    - "Multi-step wizard flow (screen, not dialog) with per-step and on-exit validation"
  debug_session: ".planning/debug/promotion-dialog-ux-and-scope-gaps.md"

- gap_id: G-27-13
  truth: "After a correct manager PIN unlocks the ad-hoc discount section and a discount amount is set, submitting the payment succeeds — the server does not re-reject it for missing manager authorization."
  status: failed
  reason: "User reported: while applying the discount on payment page , when turned on the button for discount it ask for PIN , after entering he correct PIN and discount , when processing the payment , it throws error that it still requires manager PIN but it never asks."
  severity: blocker
  test: 13
  root_cause: |
    ManagerPinDialog (src/features/manager-pin-gate/ui/ManagerPinDialog.tsx) matches the entered
    PIN against eligible staff but its onSuccess() callback is zero-argument — it never tells the
    caller WHICH staff member's PIN matched, only that some eligible PIN was entered. The actual
    payment RPC (process_direct_sale_atomic, via CheckoutPanel -> useCheckoutSale ->
    process-direct-sale edge function) always runs as the CURRENTLY LOGGED-IN cashier
    (p_staff_id resolved server-side from the session JWT), never as the manager who typed
    their PIN. The RPC's manager-override re-check
    (process_direct_sale_atomic_promotions.sql:127-133) checks role_permissions for
    'apply_custom_discount' against p_staff_id — the cashier's own id — and cashiers structurally
    never have that permission (rbac.ts: apply_custom_discount is MANAGER_EXTRA-only). The client
    faithfully sends managerOverride:true; the server still rejects, because no manager ever
    actually authorized the request from the server's point of view — only the cashier's own
    identity was ever checked. This is a pre-existing structural property of the ManagerPinDialog
    pattern (confirmed by 27-04-SUMMARY.md's own decisions log), not something Phase 27 introduced
    in isolation — every ManagerPinDialog consumer (refund, reopen_tab, edit_paid_tab, close_tab,
    apply_custom_discount) shares the same defect. Phase 27's own E2E suite sidesteps it by
    logging in AS a manager, so the realistic cashier-operates/manager-authorizes scenario was
    never exercised until this UAT pass.
    Secondary, independent finding (PaymentPane/reopened-tab path only): process-payment edge
    function's BodySchema never declares discount/managerOverride fields at all (Zod silently
    strips them), and process_payment_atomic/process_split_payment_atomic have no
    p_manager_override parameter or authorization check whatsoever, unlike
    process_direct_sale_atomic — a different failure mode (silent underpayment) on that screen,
    not the reported error, but should be closed in the same pass.
  artifacts:
    - path: "src/features/manager-pin-gate/ui/ManagerPinDialog.tsx"
      issue: "onSuccess() is zero-argument — discards the matched staff identity, the structural defect shared by every consumer of this dialog."
    - path: "supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql"
      issue: "Manager-override role re-check (lines 127-133) is keyed on p_staff_id (the acting cashier), not on any distinct authorizing-manager identity."
    - path: "src/shared/lib/rbac.ts"
      issue: "Confirms apply_custom_discount is MANAGER_EXTRA-only and absent from CASHIER_ACTIONS (lines 40-62) — cashiers can never pass the re-check regardless of PIN entry."
    - path: "supabase/functions/process-payment/index.ts"
      issue: "BodySchema never declares discountScope/discountType/discountValue/discountAmount/managerOverride — Zod silently strips them before the RPC call (secondary gap, PaymentPane path only)."
    - path: "supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql"
      issue: "process_payment_atomic/process_split_payment_atomic have no p_manager_override parameter or authorization check at all, unlike process_direct_sale_atomic (secondary gap, PaymentPane path only)."
  missing:
    - "ManagerPinDialog.onSuccess must surface the matched staff's identity (e.g. onSuccess: (staffId: string) => void) instead of discarding it"
    - "A distinct authorizing-manager parameter (e.g. p_manager_staff_id) threaded from the PIN dialog through to the RPC, checked instead of/alongside p_staff_id for the manager-override authorization"
    - "Scope decision: fix ManagerPinDialog's contract globally (affects refund/reopen_tab/edit_paid_tab/close_tab too) vs narrowly for apply_custom_discount only — needs an explicit call, not an assumption"
    - "process_payment_atomic/process_split_payment_atomic + process-payment edge function need the same discount+manager-override wiring process_direct_sale_atomic already has, to close the reopened-tab (PaymentPane) path gap"
  debug_session: ".planning/debug/adhoc-discount-manager-pin-rejected-after-entry.md"
