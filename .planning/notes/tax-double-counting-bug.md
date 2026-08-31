---
title: Tax double-counting bug — prices already include tax
date: 2026-08-31
context: gsd-explore session, topic "how tax percentage is configured"
---

## Finding

Store's product prices already include tax (IVA). Checkout always applies tax **additively on
top** of the cart total regardless — every completed sale is currently overcharged by the tax
amount.

## Where

- Client: `src/widgets/PaymentModal/ui/PaymentForm.tsx:286-291` —
  `taxAmount = round(afterDiscount * taxRatePercent/100)`, `total = afterDiscount + taxAmount`.
- Server (authoritative, anti-tamper): `process_direct_sale_atomic` RPC, defined in
  `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:153-156` and duplicated
  in `20260818000003_process_direct_sale_atomic_cost_snapshot.sql:100-103`. Both independently
  recompute tax with the same additive formula and reject the sale if the client-submitted total
  doesn't match within 1 cent — so the server enforces the wrong math, not just the client.
- Config: `billing.taxRatePercent` (default 16), `BillingSettingsSchema` in
  `src/shared/lib/domain.ts:811-819`, edited via `BillingSettingsTab.tsx`. No inclusive/exclusive
  concept exists anywhere.

## No per-product/category tax control

`products` and `categories` tables (`supabase/migrations/20260414000003_products_and_categories.sql`)
have no tax field at all. Tax is a single global rate applied flat to every sale — confirmed no
per-item taxability distinction exists in this codebase.

## Fix tracked as

Phase 24 — Tax Configuration (Inclusive/Exclusive Toggle), requirements TAX-01..05 in
`REQUIREMENTS.md` (v1.10). Two duplicated server-side tax formulas is itself a smell worth
addressing in the same migration, not just the inclusive/exclusive branch.
