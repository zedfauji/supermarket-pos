---
phase: 23-bank-transfer-payment-tracking
verified: 2026-08-31T22:45:00Z
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/11
  gaps_closed:
    - "CR-01 fix (netBalance includes bank-transfer sales) is live in the running database"
    - "WR-03 fix (server-side checkout-time-only enforcement on bank_transfer) is live in the running database"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 23: Bank Transfer Payment Tracking Verification Report

**Phase Goal:** Cashier marks a completed sale as awaiting bank transfer with a system-generated reference code; admin/manager manually confirms or disputes it against their own banking app on the `/payments` page. Replaces the paper name+phone reconciliation slip with a fully audited state machine — no auto-confirm path anywhere.

**Verified:** 2026-08-31
**Status:** passed
**Re-verification:** Yes — after gap closure (commit `64e191e`, following `ccfc4f6`)

## Goal Achievement

### Re-verification Method

Independently re-derived both gaps from the prior `gaps_found` report — did not trust SUMMARY.md/REVIEW-FIX.md/the orchestrator's dispatch narration. For each:

1. Ran `docker exec -e PGPASSWORD=postgres supabase_db_supermarket-pos-selfhosted psql -U supabase_admin -d postgres -c "select pg_get_functiondef(...)"` myself, directly against the live local Supabase container, to read the actual deployed function body — not the migration file.
2. Ran the new regression tests myself (`npx vitest run src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts`) rather than trusting the "8/8 pass" claim.
3. Started the dev server (`npm run dev`, port 1520) and ran the checkout E2E spec myself (`npx playwright test e2e/checkout/bank-transfer-checkout.spec.ts`) to confirm the WR-03 guard did not break the legitimate checkout-time bank-transfer path (a real risk: a guard that's too strict would silently reject the happy path along with the exploit path — nothing in the vitest regression suite exercises the full `process_direct_sale_atomic` → GUC → `process_payment_atomic` chain through a real HTTP/RPC round-trip the way the E2E spec does).
4. Stopped the dev server afterward.

### Gap 1: CR-01 — `netBalance` omits bank-transfer sales

**Status: ✓ CLOSED — VERIFIED**

Direct introspection of the live database:

```
docker exec -e PGPASSWORD=postgres supabase_db_supermarket-pos-selfhosted psql -U supabase_admin -d postgres \
  -c "select pg_get_functiondef('public.get_caja_report(uuid)'::regprocedure);"
```

Live function body now reads:

```sql
'netBalance', v_cash_sales + v_card_sales + v_rappi_sales + v_bank_transfer_sales + v_total_income - v_total_expenses
```

This is byte-identical to the corrected expression in `supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql:207`. The fix is live, not merely committed to a migration file.

**Regression test independently re-run (not trusted from claim):** `CR-01 regression: get_caja_report netBalance includes bank-transfer sales` in `src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts` — seeds an isolated closed caja session with a single bank-transfer sale (no cash/card/rappi/caja_entries), calls the live `get_caja_report` RPC, and asserts `netBalance === bankTransferSales`. This is not fixture-only reliance on a mock — it hits the real RPC against the real DB and would have failed before the fix (pre-fix, `netBalance` would read `0` while `bankTransferSales` correctly read the seeded amount). Ran it myself: **PASS**.

### Gap 2: WR-03 — checkout-time-only enforcement not live

**Status: ✓ CLOSED — VERIFIED**

Direct introspection of the live database:

```
docker exec -e PGPASSWORD=postgres supabase_db_supermarket-pos-selfhosted psql -U supabase_admin -d postgres \
  -c "select pg_get_functiondef('public.process_payment_atomic(uuid,uuid,numeric,text,text,numeric,text,text,text,text,numeric,numeric,integer,text)'::regprocedure);"
```

Live function body now contains the guard:

```sql
IF p_method = 'bank_transfer'
   AND current_setting('app.bank_transfer_checkout_context', true) IS DISTINCT FROM 'true'
   AND auth.role() IS DISTINCT FROM 'service_role' THEN
  RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bank transfer payments can only be marked at checkout time');
END IF;
```

Also confirmed `process_direct_sale_atomic` (the trusted caller) sets the GUC immediately before calling `process_payment_atomic`:

```sql
IF p_method = 'bank_transfer' THEN
  PERFORM set_config('app.bank_transfer_checkout_context', 'true', true);
END IF;
```

Both function bodies match `supabase/migrations/20260831000003_bank_transfers_schema.sql` verbatim. The exploit path described in the original finding (any active-shift staff member calling `process_payment_atomic(method='bank_transfer')` directly via PostgREST on an arbitrary pre-existing tab) is closed live, not just on disk.

**Regression test independently re-run:** `WR-03 regression: process_payment_atomic rejects bank_transfer outside the checkout-time context` — uses a real authenticated (non-service-role) manager JWT via `getAuthClient()`, calls `process_payment_atomic(method='bank_transfer')` directly (bypassing `process_direct_sale_atomic`), and asserts the RPC returns `FORBIDDEN` with zero rows written to `payments`. This exercises the actual denial path with a real JWT, not a mock. Ran it myself: **PASS**.

**Happy-path regression (not exercised by the vitest regression test, so checked separately):** Ran `e2e/checkout/bank-transfer-checkout.spec.ts` against a live dev server (`npm run dev`, port 1520) myself. Browser console log confirms the real flow: `payment.succeeded { tabId: "...", paymentMethod: "bank_transfer" }` — the legitimate checkout-time path (cashier → `useCheckoutSale` → `process_direct_sale_atomic` → GUC set → `process_payment_atomic`) still succeeds after the guard was applied. **1/1 PASS.** This confirms the guard is not over-broad (it does not accidentally block the intended path along with the exploit path).

### Full regression run

```
npx vitest run src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts --reporter=verbose
```

Result: **8/8 pass** (6 pre-existing cases + 2 new regression tests), run live against the real local Supabase instance, independently by this verifier — not read off SUMMARY.md.

### Observable Truths (BTP-01..10 + code-review fix truth)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BTP-01: `process_payment_atomic(method='bank_transfer')` generates a unique 7-digit Luhn code, stores it on `payments.reference_number`, creates a pending `bank_transfers` row | ✓ VERIFIED | Re-run live by this verifier: 8/8 pass (regression check, previously verified) |
| 2 | BTP-02: Cashier at `/pos` can select Bank Transfer, complete checkout, see the reference code; sale finalizes like cash/card | ✓ VERIFIED | E2E `e2e/checkout/bank-transfer-checkout.spec.ts` re-run live by this verifier against a real dev server: 1/1 pass, `payment.succeeded` with `paymentMethod: bank_transfer` confirmed in browser console |
| 3 | BTP-03: Manager/admin can confirm with the exact code; Luhn-invalid or non-matching code rejected before any state change | ✓ VERIFIED | Re-run live: integration test cases 3/4 pass (regression check, previously verified) |
| 4 | BTP-04: Manager/admin can dispute only with a non-empty reason | ✓ VERIFIED | Re-run live: integration test case 6 passes (regression check, previously verified) |
| 5 | BTP-05: No auto-confirm path anywhere; every confirm/dispute is an explicit manager+ tap | ✓ VERIFIED | Regression check — no code changed in this area since prior pass |
| 6 | BTP-06: Every state transition writes `record_audit()` with a pre-registered action string | ✓ VERIFIED | Regression check — no code changed in this area since prior pass |
| 7 | BTP-07: Bank Transfers tab on `/payments` lists pending/confirmed/disputed oldest-first with reference code, customer name/phone, elapsed time, stale flag | ✓ VERIFIED | Regression check — no code changed in this area since prior pass |
| 8 | BTP-08: Admin can export pending+confirmed transfers to CSV, reusing `rowsToCsv`/CWE-1236 guard, never a Blob | ✓ VERIFIED | Regression check — no code changed in this area since prior pass |
| 9 | BTP-09: Cashier denied `confirm_transfer_payment`/`dispute_transfer_payment` server-side, independent of UI | ✓ VERIFIED | Re-run live: integration test case 5 passes (regression check, previously verified) |
| 10 | BTP-10: A pending/disputed bank-transfer sale still counts toward `get_caja_report` revenue immediately, plus a `bankTransferPending` breakout; netBalance treats bank-transfer sales the same as cash/card/rappi | ✓ VERIFIED | Live `get_caja_report` netBalance formula confirmed to include `v_bank_transfer_sales` via direct `pg_get_functiondef`; the adjacency note from the prior report (netBalance understated) no longer applies |
| 11 | Code-review fixes (CR-01, WR-01..04) actually landed and are live, not merely committed to a migration file | ✓ VERIFIED | All 5/5 confirmed live: CR-01 and WR-03 via direct `pg_get_functiondef` introspection performed by this verifier (not the prior migration-file-only state); WR-01/WR-02/WR-04 confirmed live in prior pass (TS-only, no migration re-apply needed) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260831000002_bank_transfer_payment_method.sql` | Enum extension, own transaction | ✓ VERIFIED | Applied live (`20260831000002` in `schema_migrations`) |
| `supabase/migrations/20260831000003_bank_transfers_schema.sql` | Table, RLS, Luhn fns, RPCs, WR-03 checkout-time guard | ✓ VERIFIED | Base schema + WR-03 guard both confirmed live via `pg_get_functiondef`, independently by this verifier |
| `supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql` | Caja report breakout, CR-01 netBalance fix | ✓ VERIFIED | Breakout fields + CR-01 netBalance fix both confirmed live via `pg_get_functiondef`, independently by this verifier |
| `src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts` | Real RPC proof, including CR-01/WR-03 regression coverage | ✓ VERIFIED | Re-run live by this verifier: 8/8 pass, including the 2 new named regression tests |
| `src/shared/lib/bank-transfer-code.ts` | Client Luhn utility | ✓ VERIFIED | Regression check — unchanged since prior pass |
| `src/features/confirm-dispute-transfer/{model,ui}` | Mutation hooks + dialogs | ✓ VERIFIED | Regression check — unchanged since prior pass |
| `src/widgets/BankTransfersList/index.tsx` | Reconciliation table | ✓ VERIFIED | Regression check — unchanged since prior pass |
| `src/features/export-bank-transfers/model/useExportBankTransfersCsv.ts` | CSV export | ✓ VERIFIED | Regression check — unchanged since prior pass |
| `e2e/checkout/bank-transfer-checkout.spec.ts` | E2E tracer proof | ✓ VERIFIED | Re-run live by this verifier against a real dev server: 1/1 pass (upgraded from "structurally confirmed only" in the prior pass, since this pass specifically needed to rule out the WR-03 guard over-blocking the happy path) |
| `e2e/payments/bank-transfers-tab.spec.ts` | E2E tracer proof | ✓ VERIFIED (structurally) | Unchanged since prior pass; not re-run (no code in its path changed by the gap-closure commit) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `process_direct_sale_atomic` | `process_payment_atomic` | `set_config('app.bank_transfer_checkout_context', 'true', true)` then RPC call | ✓ WIRED | Confirmed live in both function bodies; confirmed functionally via live E2E run (checkout succeeds) |
| `process_payment_atomic` | WR-03 guard | `current_setting('app.bank_transfer_checkout_context', true)` / `auth.role()` | ✓ WIRED | Confirmed live; confirmed functionally via live regression test (non-checkout call rejected) |
| `get_caja_report` | CR-01 fix | `v_bank_transfer_sales` term in `netBalance` expression | ✓ WIRED | Confirmed live; confirmed functionally via live regression test (netBalance == bankTransferSales in isolated session) |
| (all other links from prior pass) | | | ✓ WIRED | Regression check — no code changed in this area since prior pass |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| BTP-01 | 23-01, 23-03 | ✓ SATISFIED | Live integration test re-run (regression) |
| BTP-02 | 23-01, 23-02 | ✓ SATISFIED | Live checkout wiring + E2E spec re-run |
| BTP-03 | 23-01, 23-03, 23-04 | ✓ SATISFIED | Live RPC re-run (regression) |
| BTP-04 | 23-01, 23-03, 23-04 | ✓ SATISFIED | Live RPC re-run (regression) |
| BTP-05 | 23-01, 23-04 | ✓ SATISFIED | Regression check |
| BTP-06 | 23-01 | ✓ SATISFIED | Regression check |
| BTP-07 | 23-04 | ✓ SATISFIED | Regression check |
| BTP-08 | 23-05 | ✓ SATISFIED | Regression check |
| BTP-09 | 23-01, 23-04 | ✓ SATISFIED | Live RPC re-run (regression) |
| BTP-10 | 23-01, 23-05 | ✓ SATISFIED | Breakout fields confirmed live; netBalance adjacency issue from prior pass now resolved (CR-01 closed) |

No orphaned requirements — all 10 BTP IDs appear in at least one plan's `requirements:` frontmatter and in `.planning/REQUIREMENTS.md` (lines 198-207, 321-330).

### Anti-Patterns Found

None in the gap-closure diff. Grepped the new test additions (`bank-transfer-rpc.integration.test.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` — zero hits. No production code was changed by the gap-closure commit (`64e191e`) — it added only test coverage; the two function fixes were applied live via `docker exec ... psql`, matching the already-reviewed migration file content exactly (confirmed byte-for-byte above).

### Non-blocking note (carried forward, informational only — not a gap)

The `20260831000004_caja_report_bank_transfer_breakout.sql` migration file is still registered in `supabase_migrations.schema_migrations` under a mismatched version/name (`20260831001057 concurrent_agent_placeholder`) rather than `20260831000004 caja_report_bank_transfer_breakout`, on this local self-hosted stack. This was already flagged as "worth reconciling before a real deploy" in the prior verification pass and remains true today — it does not affect the two gaps closed in this pass (the live function bodies were verified directly via `pg_get_functiondef`, which is authoritative regardless of migration-tracking bookkeeping), but a future push to a fresh/remote Supabase project via the tracked migration files should be double-checked against this mismatch before relying on `supabase db push` alone.

### Deferred Items (pre-existing, out of scope — see `deferred-items.md`)

Unrelated pre-existing failures in `rbac.test.ts` mirror-matrix (fixed separately in `ccfc4f6`, confirmed prior pass), `queries.clock.test.ts`, and `useCloseTab.test.ts` were already triaged as environmental/shared-DB cross-talk in `deferred-items.md` and are not re-flagged here per the dispatch instruction.

## Gaps Summary

None. Both gaps from the prior `gaps_found` pass are closed and independently confirmed live by this verifier via direct database introspection (not SUMMARY/REVIEW-FIX narration): CR-01 (`get_caja_report` netBalance now includes bank-transfer sales) and WR-03 (`process_payment_atomic` now rejects non-checkout-context `bank_transfer` calls). Both fixes were also confirmed functionally correct — not just present — via live regression tests this verifier ran itself, plus a live E2E checkout run confirming the WR-03 guard does not block the legitimate checkout path. All 10 BTP-01..10 requirements remain satisfied (unchanged from the prior pass), and all 5 code-review findings (CR-01, WR-01..04) are now confirmed live. No orphaned requirements, no anti-patterns, no human verification needed.

---

_Verified: 2026-08-31_
_Verifier: Claude (gsd-verifier)_
