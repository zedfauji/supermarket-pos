---
phase: 16-purchase-orders-reordering
plan: 01
subsystem: database
tags: [postgres, rls, supabase, receive_shipment, purchase_orders, edge-function]

requires: []
provides:
  - "purchase_orders/purchase_order_items schema with FOR ALL RLS gated to manage_products (D-02: cashiers get zero rows, not just a hidden nav tile)"
  - "receive_shipment(p_staff_id, p_supplier_id, p_items, p_po_id) extended in place (D-04) — atomically closes a PO on receipt, PO_ALREADY_RECEIVED and PO_SUPPLIER_MISMATCH guards, old 3-arg signature dropped so the non-PO receiving flow is unbroken"
  - "shipments.po_id nullable back-reference for future 'movements from this PO' UI"
  - "poId wired through the receive-shipment Edge Function + client contract, ready for Wave 4's create/receive UI"
affects: [16-02, 16-03, 16-04]

actuals:
  tokens: 9200
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "receive_shipment RPC extension via signature promotion (DROP FUNCTION IF EXISTS old-arity, CREATE new-arity) rather than a parallel wrapper RPC — avoids Postgres overload ambiguity on the existing 3-arg call site"
    - "FOR ALL RLS (not a separate open SELECT USING(true) policy) when a table's read access must match its write access gate"

key-files:
  created:
    - supabase/migrations/20260823000001_purchase_orders.sql
    - supabase/migrations/20260823000002_receive_shipment_po.sql
    - src/features/receive-shipment/model/receive-po-shipment.integration.test.ts
    - src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts
  modified:
    - supabase/functions/receive-shipment/index.ts
    - src/shared/lib/edge-function-contracts.ts
    - src/shared/lib/supabase.types.ts

key-decisions:
  - "D-04 implemented as a straight signature extension: receive_shipment gained a 4th p_po_id uuid DEFAULT NULL parameter, with the old 3-arg overload explicitly DROPped first (Postgres would otherwise create a second overload and the 3-arg call site used by the existing ad-hoc Suppliers-page flow would start failing with 'function is not unique')."
  - "PO_SUPPLIER_MISMATCH is one combined guard for both 'PO not found' and 'PO belongs to a different supplier' — RESEARCH.md's Security Domain only calls for one mismatch-class code, not a separate not-found code."
  - "supabase.types.ts regenerated via a temporary docker run container attached to the supabase_default network (mounting the repo + docker.sock, passing --network-id supabase_default) — the local stack was started via raw docker compose, not `supabase start`, so `npx supabase gen types typescript --local` / --db-url against a host-resolvable address both failed; this is an environment workaround, not a repo convention change."

patterns-established:
  - "Integration tests using multiple same-process supabase-js clients (service-role + N signed-in sessions) must give each client a distinct auth.storageKey (and persistSession:false/autoRefreshToken:false) — supabase-js's default auth storage is keyed by project ref only, so a third client can silently clobber a service-role client's session, turning bypass-RLS setup calls into RLS-bound calls that fail with cryptic policy-violation errors."

requirements-completed: [PO-01, PO-03]

coverage:
  - id: D1
    description: "purchase_orders/purchase_order_items schema exists with status CHECK ('draft'|'received'), received_at set only on close, and both product/supplier FKs ON DELETE RESTRICT"
    requirement: "PO-01"
    verification:
      - kind: integration
        ref: "src/features/receive-shipment/model/receive-po-shipment.integration.test.ts#Test 1: atomic close"
        status: pass
    human_judgment: false
  - id: D2
    description: "receive_shipment(p_po_id) atomically closes the PO in the same transaction as the stock/cost/expiry mutation (D-04)"
    requirement: "PO-03"
    verification:
      - kind: integration
        ref: "src/features/receive-shipment/model/receive-po-shipment.integration.test.ts#Test 1: atomic close"
        status: pass
    human_judgment: false
  - id: D3
    description: "Double-receiving the same PO is rejected (PO_ALREADY_RECEIVED) with no second inventory mutation"
    requirement: "PO-03"
    verification:
      - kind: integration
        ref: "src/features/receive-shipment/model/receive-po-shipment.integration.test.ts#Test 2: double-receive guard"
        status: pass
    human_judgment: false
  - id: D4
    description: "A p_po_id belonging to a different supplier is rejected (PO_SUPPLIER_MISMATCH) before any mutation runs"
    requirement: "PO-03"
    verification:
      - kind: integration
        ref: "src/features/receive-shipment/model/receive-po-shipment.integration.test.ts#Test 3: supplier-mismatch guard"
        status: pass
    human_judgment: false
  - id: D5
    description: "The pre-existing non-PO receiving flow (3 named args, no p_po_id) still resolves to exactly one function — the old 3-arg overload was dropped, not left dangling"
    requirement: "PO-03"
    verification:
      - kind: integration
        ref: "src/features/receive-shipment/model/receive-po-shipment.integration.test.ts#Test 4: non-PO regression"
        status: pass
    human_judgment: false
  - id: D6
    description: "purchase_orders/purchase_order_items RLS excludes cashiers from read and write (D-02) — a real cashier-authenticated session gets zero rows from SELECT and is denied INSERT, while a manager session reads the seeded row"
    requirement: "PO-01"
    verification:
      - kind: integration
        ref: "src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts (4/4 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "poId wired end-to-end through the Edge Function BodySchema and the client-side ReceiveShipmentRequestSchema, ready for a future UI caller"
    verification:
      - kind: other
        ref: "npm run typecheck (clean); grep -n poId in both files"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-23
status: complete
---

# Phase 16 Plan 01: Purchase Orders Tracer (Schema/RLS + receive_shipment Extension) Summary

**purchase_orders/purchase_order_items schema with cashier-excluding RLS, plus receive_shipment extended in place with an atomic PO-close + double-receive/supplier-mismatch guards, proven by two green integration tests before any UI is built.**

## Performance

- **Duration:** ~20min
- **Completed:** 2026-08-23
- **Tasks:** 3/3 completed
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `purchase_orders`/`purchase_order_items` tables created with `FOR ALL` RLS gated to `manage_products` (not a separate open `SELECT USING(true)` policy like `suppliers` has) — D-02's "cashiers cannot see purchase orders at all" is enforced at the RLS layer, proven by a real cashier-authenticated session getting zero rows.
- `receive_shipment` extended in place to `(p_staff_id, p_supplier_id, p_items, p_po_id DEFAULT NULL)` per D-04 — receiving a PO atomically closes it (`status='received'`, `received_at=now()`) in the same transaction as the existing weighted-average-cost/earliest-expiry-wins stock mutation, never a second wrapper RPC.
- Double-receive (`PO_ALREADY_RECEIVED`) and supplier-mismatch (`PO_SUPPLIER_MISMATCH`) guards run before any mutation, and the old 3-arg `receive_shipment` overload was explicitly dropped so the existing ad-hoc Suppliers-page receiving flow still resolves to exactly one function.
- `poId` wired through the full client-to-Edge-Function-to-RPC chain, ready for Wave 4's create/receive UI to consume.

## Task Commits

1. **Task 1a: RED — failing integration test for the RPC extension** - `708f9e6` (test)
2. **Task 1b: GREEN — purchase_orders schema/RLS + receive_shipment PO extension** - `ab57b8b` (feat)
3. **Task 2: RLS integration test proving cashier exclusion** - `38408e9` (test)
4. **Task 3: wire poId through Edge Function + client contract** - `ab0588c` (feat)

_Task 1 (tdd="true", type="tracer") split naturally into a RED test commit and a GREEN implementation commit. Task 2 (tdd="true", type="auto") wrote and ran a proving test against Task 1's already-live implementation — it passed on first run against the schema/RLS, no separate implementation commit needed._

## Files Created/Modified

- `supabase/migrations/20260823000001_purchase_orders.sql` - `purchase_orders`/`purchase_order_items` tables, indexes, `updated_at` trigger, `shipments.po_id` column, RLS policies
- `supabase/migrations/20260823000002_receive_shipment_po.sql` - `receive_shipment` extended to 4 args with PO guards and atomic close
- `src/features/receive-shipment/model/receive-po-shipment.integration.test.ts` - 4-case integration test (atomic close, double-receive, supplier-mismatch, non-PO regression)
- `src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts` - 4-case RLS integration test (manager sanity, cashier SELECT denial, cashier INSERT denial, cashier PO-items SELECT denial)
- `supabase/functions/receive-shipment/index.ts` - `BodySchema.poId`, `admin.rpc(..., { p_po_id })`
- `src/shared/lib/edge-function-contracts.ts` - `ReceiveShipmentRequestSchema.poId`
- `src/shared/lib/supabase.types.ts` - regenerated with `purchase_orders`/`purchase_order_items` Row/Insert/Update/Relationships and the new `receive_shipment` 4-arg signature

## Decisions Made

- Extended `receive_shipment`'s signature via `DROP FUNCTION IF EXISTS receive_shipment(uuid, uuid, jsonb)` before `CREATE OR REPLACE FUNCTION receive_shipment(..., p_po_id uuid DEFAULT NULL)` — `CREATE OR REPLACE` alone does not replace a function whose argument-type list differs; it would have silently created a second overload and broken the existing 3-arg call site with a "function is not unique" error.
- `PO_SUPPLIER_MISMATCH` covers both "PO not found" and "PO belongs to a different supplier" as one guard query — matches RESEARCH.md's Security Domain, which calls for a single mismatch-class code.
- Regenerated `supabase.types.ts` via a temporary `docker run` container (mounting the repo + `docker.sock`, `--network supabase_default --network-id supabase_default`) rather than `npx supabase gen types typescript --local`, because this environment's Supabase stack was started via raw `docker compose`, not the `supabase` CLI's own `supabase start` — the CLI's `--local`/`--db-url` paths both failed to resolve the `supabase-db` container from the host network namespace. This is a one-off environment workaround for this session, not a change to the documented `npx supabase gen types typescript --local` project convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RLS integration test's service-role client silently ran as a cashier session**
- **Found during:** Task 2
- **Issue:** `src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts`'s three same-process `createClient(...)` calls (service-role `db`, `managerClient`, `cashierClient`) all used the default `auth.storageKey`. Once `managerClient`/`cashierClient` signed in, the `db` client's stored session was silently clobbered by the last-signed-in anon session, so subsequent `db` calls (e.g. seeding a `suppliers` row) ran as an authenticated cashier and were rejected by RLS instead of bypassing it — surfaced as `"new row violates row-level security policy for table suppliers"`.
- **Fix:** Gave each of the three clients a distinct `auth.storageKey` plus `persistSession: false, autoRefreshToken: false`, matching `src/shared/lib/supabase-test-client.ts`'s existing pattern for its single service-role client.
- **Files modified:** `src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts`
- **Verification:** Test rerun, 4/4 green.
- **Committed in:** `38408e9` (part of the test's initial commit — caught before commit, no separate fix commit needed)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Test-infrastructure bug only, caught and fixed before commit. No production code affected. No scope creep.

## Issues Encountered

The local Supabase stack in this environment was started via raw `docker compose` rather than the Supabase CLI's own `supabase start`, so `npx supabase gen types typescript --local` (and a direct `--db-url` from the host) both failed to resolve/reach the `supabase-db` container. Resolved by running the bundled `node_modules/supabase/bin/supabase` binary inside a temporary `docker run` container attached to the `supabase_default` network (with `docker.sock` mounted so the CLI's own internal pg-meta container spin-up also joins that network via `--network-id`). This is an environment-specific workaround for this session; the documented `npx supabase gen types typescript --local` command remains correct guidance for a stack started the standard way.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The schema/RLS/RPC foundation for Purchase Orders is proven and de-risked. Wave 2+ (create/edit PO UI, auto-draft reorder suggestions, receive-in-full UI) can build directly on `purchase_orders`/`purchase_order_items` and the extended `receive_shipment(p_po_id)` without further schema changes. No blockers.

---
*Phase: 16-purchase-orders-reordering*
*Completed: 2026-08-23*

## Self-Check: PASSED

All 7 files listed in Files Created/Modified confirmed present via `git ls-files`. All 4 task commits (`708f9e6`, `ab57b8b`, `38408e9`, `ab0588c`) confirmed present via `git log --oneline --all`.
