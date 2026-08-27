---
phase: 07-backend-data-integrity
plan: 01
subsystem: backend-data-integrity
tags: [supabase, migration, receive-shipment, inventory, weighted-average, integration-test]
dependency-graph:
  requires: []
  provides:
    - "receive_shipment weighted-average cost + earliest-expiry merge (DATA-01)"
  affects:
    - "supabase/functions/receive-shipment/index.ts (unchanged, calls the patched RPC)"
    - "src/entities/tab/model/queries-reports.ts (unchanged, margin already immune via cost_price_snapshot)"
tech-stack:
  added: []
  patterns:
    - "SELECT ... FOR UPDATE row lock before a conditional merge inside a SECURITY DEFINER RPC's per-item loop"
    - "COALESCE(a,b), COALESCE(b,a) wrapped in LEAST() for NULL-safe 'real value wins over NULL, earliest wins if both real' merge semantics"
key-files:
  created:
    - "supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql"
    - "src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts"
  modified:
    - "src/entities/tab/model/product-sales-report.integration.test.ts"
decisions:
  - "Cast testDb to any (CLAUDE.md's documented 'Missing generated types workaround') in both new/modified test files, rather than block this plan on DATA-03's types regen (a separate plan, 07-03, in this phase) — suppliers/shipments/receive_shipment are not yet in generated Supabase types and inventory's Row type is stale (missing cost_price/expiry_date)."
metrics:
  duration: "35 min"
  completed: 2026-08-17
status: complete
actuals:
  tokens: 5790
  tasks: 3
  commits: 3
---

# Phase 7 Plan 1: Backend Data Integrity — receive_shipment weighted-average cost Summary

Fixed `receive_shipment`'s last-write-wins cost/expiry overwrite bug with a weighted-average-cost + earliest-expiry-wins merge, pushed live to the self-hosted Supabase stack and proven by 6 new integration tests (5 in a new suite, 1 regression test in the existing margin-report suite).

## What Was Built

- **`supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql`** — `CREATE OR REPLACE FUNCTION receive_shipment(...)`, same signature. The per-item loop now does `SELECT quantity_on_hand, cost_price, expiry_date ... FOR UPDATE` on the existing `inventory` row before merging: when the row doesn't exist or `quantity_on_hand = 0`, replace `cost_price`/`expiry_date` outright (D-02); otherwise `cost_price = ROUND((old_qty*old_cost + new_qty*new_cost)/(old_qty+new_qty), 2)` and `expiry_date = LEAST(COALESCE(old, new), COALESCE(new, old))` (D-01/D-03 — real date always wins over NULL, earliest wins if both real, NULL only if both NULL). REVOKE/GRANT footer and error handling copied byte-identical from the prior revision. Pushed live via `docker exec -i supabase-db psql ... < migration.sql` and registered in `supabase_migrations.schema_migrations`.
- **`src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts`** (new, 5 tests) — happy-path weighted average (RED before the migration push, GREEN after — confirmed both states), zero-stock replace-outright, and the full NULL-expiry truth table (real-then-NULL, NULL-then-real, both-NULL).
- **`src/entities/tab/model/product-sales-report.integration.test.ts`** (+1 test) — D-06 regression guard: snapshots the margin report before/after a `receive_shipment` call on a product with a prior sale, asserts `margin`/`costTotal`/`revenue` unchanged (cost 50 in the restock vs. snapshot 5, so an accidental live-cost read would be obvious). All 6 pre-existing tests in the file still pass unmodified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Missing/stale generated Supabase types for `suppliers`/`shipments`/`receive_shipment`/`inventory.cost_price`+`expiry_date`**
- **Found during:** Task 2 (`npx tsc --noEmit` after adding the branch-coverage tests)
- **Issue:** `src/shared/lib/supabase.types.ts` has no `suppliers`/`shipments` tables and no `receive_shipment` RPC entry, and its `inventory` Row type is stale (missing `cost_price`/`expiry_date`, added by an earlier migration). Calling `testDb.rpc('receive_shipment', ...)` and `testDb.from('suppliers'|'shipments')` as the plan's `<interfaces>` section specified does not type-check against the typed client.
- **Fix:** Cast `testDb` to `any` at the point of use (file-level in the new test file, scoped local `const db = testDb as any` in the modified test file), per CLAUDE.md's documented "Missing generated types workaround" — the same pattern already used elsewhere in the codebase (`src/entities/audit-log/model/queries.ts`, `src/features/toggle-permission/useMutationTogglePermission.ts`, etc.). DATA-03 (types regen, closing this cast) is a separate plan in this phase (07-03) — not duplicating that work here avoids two agents racing to regenerate the same generated file.
- **Files modified:** `src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts`, `src/entities/tab/model/product-sales-report.integration.test.ts`
- **Commits:** `1800b14`, `cd81751`

No other deviations — plan executed as written otherwise.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql`
- FOUND: `src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts`
- FOUND: commit `5ff7275` in `git log --oneline --all`
- FOUND: commit `1800b14` in `git log --oneline --all`
- FOUND: commit `cd81751` in `git log --oneline --all`
- Live function confirmed patched: `pg_get_functiondef('receive_shipment(uuid,uuid,jsonb)'::regprocedure)` shows the new `FOR UPDATE`/`ROUND`/`LEAST` branch.
- `git diff --stat supabase/migrations/20260817000002_receive_shipment_atomicity.sql` — no output (historical migration untouched).
- No orphaned `IT Weighted Avg%` / `IT Margin Regression%` rows remain in `products` after the test runs.
