---
phase: 16-purchase-orders-reordering
verified: 2026-08-24T00:50:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Receiving a PO in full via receive_shipment is atomic and its double-receive guard prevents concurrent double-mutation of inventory (ROADMAP SC3; 16-REVIEW.md CR-01)."
  gaps_remaining: []
  regressions: []
---

# Phase 16: Purchase Orders & Reordering Verification Report

**Phase Goal:** A manager can create, auto-draft, and receive purchase orders against a supplier without duplicating the existing goods-receiving logic.
**Verified:** 2026-08-24T00:50:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (previous run: gaps_found, 3/4)

## What Changed Since the Last Verification

The previous pass (`16-VERIFICATION.md`, `gaps_found`, 3/4) found that CR-01's fix (`FOR UPDATE` row lock + `v_po_status` re-check in `receive_shipment`) was correct in `supabase/migrations/20260823000002_receive_shipment_po.sql` on disk, but the migration had already been recorded as applied in `supabase_migrations.schema_migrations` *before* the file was edited, so editing it in place never caused a migration runner to re-execute it. A direct `pg_proc.prosrc` dump showed the live function still had the pre-fix body, and a genuinely concurrent (`Promise.all`) reproduction double-counted inventory (20 instead of 10).

Since then, per the orchestrator's summary: the migration was re-applied directly against the running Docker Supabase stack via `docker exec supabase-db psql`, and a new Test 5 (`Promise.all`-based genuine concurrency) was added to `receive-po-shipment.integration.test.ts`. This re-verification independently checked both claims rather than trusting them.

## Independent Re-Verification of CR-01

**1. Live function body — fresh `pg_proc` dump (not the SUMMARY's claim).**

```
docker exec supabase-db psql -U postgres -d postgres -c "SELECT prosrc FROM pg_proc WHERE proname='receive_shipment';"
```

Confirmed the live function body contains the fix: `DECLARE v_po_status text;`, then `SELECT status INTO v_po_status FROM purchase_orders WHERE id = p_po_id AND supplier_id = p_supplier_id FOR UPDATE;`, followed by `IF v_po_status = 'received' THEN RETURN ... 'PO_ALREADY_RECEIVED' ...`. This is byte-for-byte the fix drafted in `supabase/migrations/20260823000002_receive_shipment_po.sql:55-64`.

Also confirmed only **one** overload of `receive_shipment` exists (`pg_get_function_identity_arguments`: `p_staff_id uuid, p_supplier_id uuid, p_items jsonb, p_po_id uuid`) — no ambiguous old 3-arg signature left behind — and `supabase_migrations.schema_migrations` shows `20260823000002 | receive_shipment_po` recorded.

**2. Independent concurrent reproduction — raw SQL, not the app's test file, not the SUMMARY's claim.**

Built fresh fixtures directly in the DB (new UUIDs distinct from the integration test's fixtures, so this is a genuinely separate reproduction) and fired two `receive_shipment(...)` calls for the same `p_po_id` as two backgrounded `docker exec supabase-db psql` processes launched together and `wait`-ed on, mirroring the app's call pattern at the SQL level:

- **First trial:** call1 → `PO_ALREADY_RECEIVED`, call2 → `ok:true`. Inventory ended at **10** (not 20). PO status: `received`.
- **4 additional clean trials (independent fixtures each time)** — every trial produced exactly one `ok:true` and one `ok:false` / `PO_ALREADY_RECEIVED`, and inventory always ended at **10**, never 20. (One extra trial hit a leftover-fixture PK collision from my own first manual test and both calls failed before mutating anything — noise, not a false pass — excluded from the count above.)

This directly contradicts the previous pass's reproduction (which got `ok:true`/`ok:true` and inventory=20 against the un-fixed function) and confirms the row lock is genuinely serializing concurrent receives now.

**3. The project's own integration test, run directly (not taken on faith).**

```
npx vitest run src/features/receive-shipment/model/receive-po-shipment.integration.test.ts
```
→ **5/5 passed**, including the new Test 5 (`Promise.all`-based genuine concurrency: asserts exactly 1 success, 1 `PO_ALREADY_RECEIVED`, inventory ends at 10).

**Conclusion: CR-01 is genuinely fixed and live.** The gap from the previous verification pass is closed.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Manager+ can create a PO against a supplier with line items (product/qty/cost), selecting from existing suppliers/supplier_products entities | ✓ VERIFIED | Unchanged since previous pass — `PurchaseOrderForm.tsx` create path; `purchase_orders`/`purchase_order_items` schema; e2e Test A passes (re-run this pass, see below) |
| 2 | Manager+ can generate a draft PO in one action, pre-filled from low-stock/reorder-point list for a chosen supplier, then edit lines before saving | ✓ VERIFIED | Unchanged — `computeReorderQuantity` (D-07/D-08); e2e Test B passes (re-run this pass) |
| 3 | Manager+ can receive a PO in full via the existing `receive_shipment` RPC (extended with optional PO reference), not a duplicate receiving code path — atomically updating stock/cost/expiry and closing the PO, safe under concurrent receive attempts | ✓ VERIFIED | Single-receive path confirmed (e2e Test C, re-run). Concurrency-safety (CR-01) independently reproduced live against the DB — see above. `pg_proc` dump confirms fix deployed. |
| 4 | Receiving a PO marks it received/closed; a cashier without manager+ cannot create or receive POs, verified by an automated RBAC/RLS test | ✓ VERIFIED | Unchanged — RLS integration test 4/4 pass (re-run this pass); e2e Test D passes (re-run this pass) |

**Score:** 4/4 truths verified (0 present-behavior-unverified)

### Behavioral Spot-Checks (this pass, all executed directly)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live `receive_shipment` function body contains CR-01 fix | `docker exec supabase-db psql ... SELECT prosrc FROM pg_proc WHERE proname='receive_shipment'` | Body contains `v_po_status` + `FOR UPDATE` + `PO_ALREADY_RECEIVED` re-check | ✓ PASS |
| Only one `receive_shipment` overload live (no stale 3-arg signature) | `SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='receive_shipment'` | 1 row, 4-arg signature | ✓ PASS |
| Independent concurrent double-receive reproduction (raw psql, fresh fixtures, distinct from app test) | Two backgrounded `docker exec ... psql -c "SELECT receive_shipment(...)"` fired together via `wait`, 5 trials | Every valid trial: exactly 1 `ok:true` + 1 `PO_ALREADY_RECEIVED`; inventory always 10, never 20 | ✓ PASS |
| Integration test file (incl. new Test 5) | `npx vitest run receive-po-shipment.integration.test.ts` | 5/5 passed | ✓ PASS |
| RLS integration test | `npx vitest run purchase-orders-rls.integration.test.ts` | 4/4 passed | ✓ PASS |
| Typecheck | `npm run typecheck` | clean, exit 0 | ✓ PASS |
| Lint | `npm run lint` | exit 0 (0 errors; 1 informational eslint-plugin-boundaries notice, not a rule violation) | ✓ PASS |
| Full unit suite | `npm run test` | 1189/1189 passed, 15 todo | ✓ PASS |
| e2e phase suite (dev server started fresh for this pass) | `npx playwright test e2e/56-purchase-orders.spec.ts` | 4/4 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| PO-01 | Manager+ creates PO with line items from suppliers/supplier_products | ✓ SATISFIED | e2e Test A, schema, form guards |
| PO-02 | Manager+ generates draft PO pre-filled from low-stock list, edits before save | ✓ SATISFIED | e2e Test B, `computeReorderQuantity` tests |
| PO-03 | Manager+ receives PO in full via extended `receive_shipment`, no duplicate receiving path, safe under concurrency | ✓ SATISFIED | Single-receive path + independently reproduced concurrency-safety fix, both live in the DB |

No orphaned requirements — REQUIREMENTS.md maps only PO-01/02/03 to Phase 16, all three appear in plan frontmatter `requirements:` fields.

### Anti-Patterns Found

None (unchanged from previous pass — no phase-touched files re-scanned show new debt markers; the only file materially changed since the previous verification is the integration test file, which adds a real regression test, not a stub).

### Human Verification Required

None. All checks (RPC body inspection, independent concurrent reproduction, integration/unit/e2e suites, typecheck, lint) were run directly against the live database and codebase per this session's evidence, not taken from SUMMARY.md claims.

### Gaps Summary

None. All 4 ROADMAP Phase 16 success criteria are verified. The single blocking gap from the previous pass (CR-01's fix not being live on the database) is closed and independently confirmed via a fresh `pg_proc` dump and a from-scratch concurrent reproduction using different fixture data than both the previous verification pass and the project's own Test 5.

---

*Verified: 2026-08-24T00:50:00Z*
*Verifier: Claude (gsd-verifier)*
