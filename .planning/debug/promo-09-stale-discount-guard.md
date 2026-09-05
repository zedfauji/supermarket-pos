---
status: investigating
trigger: "Investigate PROMO-09 stale-discount guard not rejecting payments"
created: 2026-09-05
updated: 2026-09-05
---

## Symptoms

**Expected behavior:** PROMO-09 contract — the server (`process_direct_sale_atomic` RPC) is the sole price authority and must REJECT a payment whose line price came from a promotion that has since been deleted (stale discounted amount).

**Actual behavior:** `npx playwright test e2e/promotions/promotion-deleted-mid-cart.spec.ts --reporter=line` fails at `expect(page.getByTestId('payment-error-alert')).toBeVisible()`. The Playwright error-context snapshot shows checkout reached the Receipt step ("Done" button visible), with the line charged at the stale discounted price $44.00 — i.e. the RPC ACCEPTED the payment instead of rejecting it.

**Error messages:** Assertion failure — `payment-error-alert` testid never appeared (expected visible, actual: checkout succeeded to Receipt step).

**Timeline:** Observed 2026-09-05, from branch `ui-redesign-fable` (worktree `.claude/worktrees/ui-redesign-astra-6bcac4`). No Supabase migration/function and no checkout/payment business logic differs between that branch and `main`, so suspected causes are (a) a regression in the RPC/DB on the shared Supabase project (recent v1.2.8-era work touched promotion/discount authorization and `days_of_week`), or (b) test-DB drift — NOT a code difference on this branch.

**Reproduction:**
```
cd D:\Projects\Code\supermarket-pos
npx playwright test e2e/promotions/promotion-deleted-mid-cart.spec.ts --reporter=line
```
First reproduce on `main` (repo root — package.json, src/, e2e/, supabase/ live there; branch: main).

## Investigation directives from user

- Compare `supabase/migrations/*promotion*` against the deployed RPC body: `pg_get_functiondef('process_direct_sale_atomic'::regproc)` via Supabase MCP `execute_sql`.
- Check whether the promotion-snapshot / price-recompute branch inside the RPC still raises when the promotion row no longer exists (deleted mid-cart).
- Report root cause before proposing any migration. Do NOT push a migration without explicit user approval.

## Current Focus

- bug_class: Bohrbug (suspected) — a deterministic assertion failure on a scripted E2E; not yet confirmed reproducible on `main`.
- hypothesis: H1 — the client (cashier tab) recovers the correct undiscounted total before submitting, so the RPC legitimately accepts a correct $55.00 sale; the "stale discounted payment" the spec intends to provoke is never actually submitted, making the guard untested rather than broken.
- test: reproduce on `main` with the RPC request/response captured, and read the `p_amount` / `unit_price` actually transmitted.
- expecting: if `p_amount` = 55.00 the RPC is behaving correctly and the SPEC is at fault (H1); if `p_amount` = 44.00 and the RPC returned ok:true, the RPC guard is genuinely broken (H2).
- next_action: "run `npx playwright test e2e/promotions/promotion-deleted-mid-cart.spec.ts --reporter=line` on main with a network capture of the process_direct_sale_atomic RPC call"

## Evidence

- timestamp: 2026-09-05 (phase 0)
  checked: `.planning/debug/knowledge-base.md` for a matching prior pattern.
  found: `discount-payment-page-no-pin` matches the CLASS (server disagreeing with the UI over a discount) and its recurrence guard says to check deployed-artifact freshness on all tiers BEFORE reading source.
  implication: deployment skew is a live candidate; check the *deployed* RPC body first, not just the migration source.

- timestamp: 2026-09-05 (phase 1)
  checked: E2E target environment — `VITE_SUPABASE_URL` in `.env.local`, plus `docker ps`.
  found: E2E runs against a LOCAL Supabase stack (`http://127.0.0.1:54321`, container set `supabase_*_supermarket-pos-selfhosted`, all up), NOT the remote prod project `mkvinyekkyennyegfoxq`.
  implication: the prod edge-function/desktop-release skew from the KB entry cannot explain this failure. Only local DB drift or a genuine code defect can.

- timestamp: 2026-09-05 (phase 1)
  checked: deployed local RPC body vs. migration source — `pg_get_functiondef('process_direct_sale_atomic'::regproc)` and `pg_proc` overload count.
  found: `rpc_has_promotion_targets=true`, `rpc_has_days_of_week=true`, `rpc_overloads=1`. The deployed body matches HEAD's `20260904000001_promotion_targets_recurrence.sql` (junction-table candidate pool + recurrence AND-filter), single overload — no stale 17-arg/18-arg overload shadowing it.
  implication: ELIMINATES the user's suspected cause (a), "RPC/DB regression / migration not applied". The deployed price authority is the current source.

- timestamp: 2026-09-05 (phase 1)
  checked: the data that could produce a $44.00 line — `settings.near_expiry`, the product row, and its inventory row.
  found: `Haldiram's Aloo Bhujia 200g` base_price=55.00 (so $44.00 is exactly 20% off), cost=4.25, expiry_date=2026-10-25. `near_expiry = {"thresholdDays": 21, "discountPercent": 15}`. `promotions` table currently holds 0 rows.
  implication: the expiry-proximity auto-discount candidate CANNOT fire for this product — 2026-10-25 is far beyond `CURRENT_DATE + 21` (2026-09-26) — and it is 15% not 20% anyway. So a surviving server-side discount cannot come from the near-expiry trigger.

- timestamp: 2026-09-05 (phase 1)
  checked: every `order_items` row ever recorded for this product, plus recent `payments`.
  found: all rows are `unit=55.00, discount_amount=null, discount_rate=null, promotion_id=null`. No sale at $44.00, and no sale with a server-applied discount, exists in the DB.
  implication: no evidence the RPC has ever accepted a discounted price for this product. Shifts suspicion from the RPC toward the client's submitted amount / the spec's assumptions.

## Eliminated

- hypothesis: The deployed `process_direct_sale_atomic` is stale/regressed relative to the promotion migrations (user-suspected cause (a)).
  evidence: `pg_get_functiondef` on the local E2E DB shows the HEAD body (promotion_targets + days_of_week) with exactly 1 overload.
  timestamp: 2026-09-05

- hypothesis: The surviving 20% discount comes from the expiry-proximity auto-discount candidate rather than the deleted promotion.
  evidence: product expiry 2026-10-25 vs. threshold `CURRENT_DATE + 21` = 2026-09-26 — the `v_expiry_date <= CURRENT_DATE + v_near_expiry_threshold` branch cannot fire; and `discountPercent` is 15, not the observed 20.
  timestamp: 2026-09-05

## Resolution
- root_cause:
- fix:
- verification:
- files_changed:
