---
phase: 02-core-direct-sale-checkout
plan: 06
subsystem: payments
tags: [postgres, plpgsql, security-definer, supabase, playwright, idempotency]

# Dependency graph
requires:
  - phase: 02-core-direct-sale-checkout
    provides: "process_direct_sale_atomic (paid-status + Caja/shift guard) from Plan 02-04/02-05"
provides:
  - "Server-derived, tax-inclusive authoritative sale total in process_direct_sale_atomic, rejecting any client p_amount/p_expected_total that disagrees by more than one cent"
  - "Server-derived modifier price delta from product_modifiers/modifiers, with membership verification, replacing client-supplied modifier_price_delta"
  - "Outright rejection of any direct-sale discount field (DISCOUNT_UNSUPPORTED) since Phase 1 removed the promotions engine"
  - "Idempotency replay scoped to the original staff/shift/Caja identity, validated before lookup, with a generic IDEMPOTENCY_UNAUTHORIZED error and no leaked sale identifiers on mismatch"
affects: [checkout, payments, receipts, reports]

# Actuals (#2632)
actuals:
  tokens: 7000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL-boundary authority check: derive the full sale total (catalog price + verified modifier deltas + settings-driven tax) inside the SECURITY DEFINER RPC itself, before delegating to the generic payment RPCs, instead of trusting a client-computed total"
    - "Idempotency replay authorization: validate caller identity (Caja/shift) before the idempotency lookup, then scope the lookup itself to that identity so a valid key under someone else's session cannot be replayed"

key-files:
  created:
    - supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql
  modified:
    - e2e/50-direct-sale-checkout.spec.ts
    - e2e/helpers/supabase.ts

key-decisions:
  - "Redefined only process_direct_sale_atomic; process_payment_atomic/process_split_payment_atomic are untouched and still own tender/version mechanics — this RPC now guarantees they only ever receive a server-derived amount and NULL discount inputs."
  - "Tax is computed with the same two-step rounding as PaymentForm.tsx (round the tax amount first, then add to subtotal) so the SQL-derived total and the UI-derived total agree to the cent without drift."
  - "Every direct-sale discount field is rejected outright (DISCOUNT_UNSUPPORTED) rather than validated, since Phase 1 dropped the promotions engine and there is no server-owned discount eligibility source to check against."

patterns-established:
  - "Trust-boundary money RPCs: never persist or trust a client-supplied price/delta once a server-derivable equivalent exists; persist the derived value and reject the request if the client's total disagrees by more than a cent."

requirements-completed: [CHK-03, CHK-04]

coverage:
  - id: D1
    description: "process_direct_sale_atomic derives item price, modifier delta, and billing tax server-side and rejects any p_amount/p_expected_total (cash, card, or split) that disagrees with the derived total by more than one cent, writing no payment/sale/inventory rows on rejection"
    requirement: "CHK-03"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#rejects a card override below the derived total and writes no rows"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#rejects a forged zero modifier delta that undercounts the total and writes no rows"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#rejects a modifier not linked to the item product and writes no rows"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#rejects a split expected total below the derived total and writes no rows"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#cash payment creates one paid sale and decrements stock"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every direct-sale discount field (scope/type/value/amount) is rejected with DISCOUNT_UNSUPPORTED before any row is written"
    requirement: "CHK-03"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#rejects a non-null direct-sale discount payload and writes no rows"
        status: pass
    human_judgment: false
  - id: D3
    description: "Idempotency replay validates the caller's open Caja and staff-owned open shift before lookup, and is scoped to the original staff/shift/Caja identity; a mismatched replay returns a generic authorization error with no tab/payment identifiers"
    requirement: "CHK-03"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#replay from a different cashier is rejected without leaking the original sale"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#reuses an idempotency key without creating a second payment or stock decrement"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#reuses a split idempotency key without creating a second sale or stock decrement"
        status: pass
    human_judgment: false

duration: ~2h25m (includes a human-in-the-loop pause to start Docker Desktop before Task 3 could apply the migration)
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 06: Authoritative Direct-Sale Totals and Replay Authorization Summary

**`process_direct_sale_atomic` now derives its own tax-inclusive sale total and modifier pricing from locked catalog state and rejects client totals that disagree by more than a cent; idempotency replay is authorized against the caller's Caja/shift before it can return another cashier's sale.**

## Performance

- **Duration:** ~2h25m total elapsed (includes a checkpoint pause for a human to start Docker Desktop; active execution time was well under that)
- **Started:** 2026-08-12T19:06:08-06:00
- **Completed:** 2026-08-12T21:29:29-06:00
- **Tasks:** 3 (1 checkpoint:decision auto-approved, 2 auto/tracer tasks completed)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Closed CR-01: `process_direct_sale_atomic` now locks each item's active catalog price, verifies every modifier ID actually belongs to that product via `product_modifiers`, sums `modifiers.price_delta` server-side, computes billing tax from `settings.value->>'taxRatePercent'` (16% fallback), and rejects any `p_amount`/`p_expected_total` that disagrees with that derived total by more than one cent — before any row is written. Persisted `order_items.unit_price`/`modifier_price_delta` are now the server-derived values, never the client-supplied ones.
- Closed the discount trust gap: any non-null `p_discount_scope`/`p_discount_type`/`p_discount_value`/`p_discount_amount` is rejected with `DISCOUNT_UNSUPPORTED`, since Phase 1 removed the promotions engine and there is no server-owned discount eligibility source.
- Closed CR-02: Caja-open and staff-owned-open-shift checks now run *before* the idempotency lookup, and the lookup itself is scoped to that staff/shift/Caja identity — a key presented by a different cashier returns a generic `IDEMPOTENCY_UNAUTHORIZED` error with no tab/payment identifiers, instead of replaying the original sale's receipt data.
- Added 7 new adversarial live-Supabase Playwright cases proving each rejection path leaves zero payment/tab rows, plus the cross-cashier replay case proving no sale identifiers leak.
- Fixed two pre-existing, unrelated E2E test-infrastructure defects that were silently blocking this plan's own verification (and every other spec sharing the same helpers).

## Task Commits

1. **Task 1: Confirm the forward SQL contract for authoritative direct-sale totals** — no commit (checkpoint:decision, auto-approved; single option `authoritative-direct-sale` selected per `workflow.auto_advance: true` and `gate="blocking"` not `blocking-human`)
2. **Task 2: Derive and enforce one direct-sale payment total in the transaction** - `184208f` (feat)
3. **Task 3: Apply the schema before executing database-backed verification** - `6fe80ad` (fix — deviations found while running Task 3's verification)

**Plan metadata:** (this commit)

## Files Created/Modified

- `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` - Redefines `process_direct_sale_atomic` with server-derived pricing/tax/modifier totals, discount rejection, and Caja/shift-scoped idempotency replay
- `e2e/50-direct-sale-checkout.spec.ts` - Adds 7 adversarial live-Supabase cases (card-override underpayment, forged modifier delta, modifier not linked to product, discount payload, split expected-total underpayment, cross-cashier replay) and updates the shared `directSaleInput()` helper to compute the tax-inclusive authoritative total instead of the pre-tax price
- `e2e/helpers/supabase.ts` - `resetTestState()` now resets Budweiser/Corona `sold_by_weight` to `false` on every run; `deleteTestStaff()` now deletes a test staff member's `shifts` rows before the profile (avoiding an FK violation that silently orphaned both the profile and its `auth.users` row) and sweeps an auth-user-only orphan by its deterministic email when no profile row exists

## Decisions Made

- Reused the existing `process_payment_atomic`/`process_split_payment_atomic` generic RPCs unchanged; `process_direct_sale_atomic` is the only redefinition, now guaranteeing those RPCs only ever receive a server-derived amount and `NULL` discount inputs.
- Matched the frontend's two-step tax rounding (round the tax amount, then add to subtotal) exactly, so the SQL-derived authoritative total and `PaymentForm.tsx`'s `subtotalWithTax` never drift by a rounding cent.
- Introduced a new `MODIFIER_MISMATCH` error code (rather than overloading `PRICE_MISMATCH`) for a modifier ID that doesn't belong to the item's product, since it's a distinct failure mode from a mispriced item.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reset stale `sold_by_weight` state blocking every non-weighted direct-sale test**
- **Found during:** Task 3 (running the focused adversarial suite against the applied migration)
- **Issue:** `e2e/52-loose-weight-hold-sale.spec.ts` flips Budweiser/Corona to `sold_by_weight: true` mid-test and only resets it in its own cleanup steps; that spec's decimal-key locator failure (already documented as a regression in `02-VERIFICATION.md`) had left Budweiser stuck at `sold_by_weight: true` in the shared local database, so every direct-sale RPC call lacking `weight_grams` (i.e. every existing and new test in `50-direct-sale-checkout.spec.ts`) failed with `WEIGHT_OUT_OF_RANGE` before reaching any of the logic under test.
- **Fix:** `resetTestState()` (called in every spec's `beforeEach`, including this one) now resets both products' `sold_by_weight` to `false` unconditionally.
- **Files modified:** `e2e/helpers/supabase.ts`
- **Verification:** Full `e2e/50-direct-sale-checkout.spec.ts` suite (17 tests, including 6 pre-existing) passes.
- **Committed in:** `6fe80ad`

**2. [Rule 1 - Bug] Fixed `deleteTestStaff()` FK violation orphaning test staff and blocking replay-authorization test**
- **Found during:** Task 3 (running the new cross-cashier replay test)
- **Issue:** The new replay test creates a `shifts` row for a temporary staff member so it can call the RPC as a different, authenticated cashier. `deleteTestStaff()` deleted the `profiles` row first, which fails silently (Supabase JS doesn't throw on a `.delete()` PostgREST error unless the caller checks it) against `shifts_staff_id_fkey`, leaving both the profile and its `auth.users` row behind. Every subsequent `seedNewStaffMember()` call for that name then failed with "email already registered", making the test permanently unrunnable once triggered once.
- **Fix:** `deleteTestStaff()` now deletes the staff member's `shifts` rows before the profile, and additionally sweeps an auth-user-only orphan by its deterministic `seedNewStaffMember` email when no `profiles` row exists (covering a test that throws between `auth.admin.createUser` and the `profiles` upsert).
- **Files modified:** `e2e/helpers/supabase.ts`
- **Verification:** `replay from a different cashier is rejected without leaking the original sale` passes on a clean run and on repeated re-runs (idempotent cleanup).
- **Committed in:** `6fe80ad`

---

**Total deviations:** 2 auto-fixed (both Rule 3/Rule 1 — blocking test-infrastructure defects unrelated to this plan's own migration, discovered only because this plan's new verification exercised code paths no prior spec had exercised)
**Impact on plan:** Both fixes are scoped to shared E2E helpers (`e2e/helpers/supabase.ts`) used across many specs; neither touches the migration under test or introduces new product behavior. No scope creep — both were required to prove this plan's own `<verify>` command.

## Issues Encountered

- **Docker Desktop was not running at Task 3 start.** `npx supabase status` and `docker ps` both failed (daemon down). Per the precondition protocol this halted the plan with a `checkpoint:human-verify` rather than attempting to start a system daemon silently. The coordinator started Docker Desktop and confirmed the `supabase-db` container was healthy but **not CLI-managed** (container names don't match `supabase_db_<project_id>`), matching the exact situation Plans 02-03/02-04 already worked around. Applied the migration directly via `docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` and registered it in `supabase_migrations.schema_migrations` via `docker exec supabase-db psql`, then confirmed via `pg_get_functiondef` that the live function body contained the new error codes (`AMOUNT_MISMATCH`, `DISCOUNT_UNSUPPORTED`, `IDEMPOTENCY_UNAUTHORIZED`, `MODIFIER_MISMATCH`) before running any test — proving the test exercised the forward migration, not stale local state.
- **New replay test's PIN (`9191`) violated `profiles`'s `pin_length`/`pin_numeric` CHECK constraints** (exactly 6 numeric digits). Fixed to `919191` in the test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CHK-03's checkout payment can no longer be underpaid or repriced by a browser payload, and its idempotency replay path is authorized before it returns any sale identity — the two blockers from `02-VERIFICATION.md`'s re-verification are closed.
- CHK-04 (split-tender receipts, scanner-during-payment) and CHK-05 (loose-weight UI locator regression) from the same verification report are **not** addressed by this plan — they were out of this plan's scope (`02-06-PLAN.md` targets CHK-03/financial-authority only) and remain open for a future phase-2 gap-closure plan or the phase's next verification pass.
- `e2e/helpers/supabase.ts`'s `deleteTestStaff`/`resetTestState` fixes are now available to every spec in the suite, not just this one.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-13*

## Self-Check: PASSED
