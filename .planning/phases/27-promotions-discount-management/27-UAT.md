---
status: complete
phase: 27-promotions-discount-management
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md, 27-05-SUMMARY.md, 27-06-SUMMARY.md, 27-07-SUMMARY.md]
started: 2026-09-03T00:00:00Z
updated: 2026-09-03T00:00:00Z
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
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- gap_id: G-27-13
  truth: "After a correct manager PIN unlocks the ad-hoc discount section and a discount amount is set, submitting the payment succeeds — the server does not re-reject it for missing manager authorization."
  status: failed
  reason: "User reported: while applying the discount on payment page , when turned on the button for discount it ask for PIN , after entering he correct PIN and discount , when processing the payment , it throws error that it still requires manager PIN but it never asks."
  severity: blocker
  test: 13
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
