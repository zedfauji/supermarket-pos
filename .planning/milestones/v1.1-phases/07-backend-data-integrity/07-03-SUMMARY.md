---
phase: 07-backend-data-integrity
plan: 03
subsystem: database
tags: [supabase, typescript, generated-types, suppliers, receipt_settings, receive_shipment]

requires:
  - phase: 07-01
    provides: "receive_shipment weighted-average cost + earliest-expiry merge (schema surface this regen captures)"
provides:
  - "Regenerated supabase.types.ts including suppliers, supplier_products, shipments, receipt_settings tables and the receive_shipment RPC"
  - "receipt_settings and suppliers/supplier_products call sites now use the plain typed supabase client, no as any workaround cast"
affects: ["phase 08 (any future consumer of suppliers/shipments/receipt_settings types)"]

actuals:
  tokens: 4441
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "ReceiptSettingsRow narrowed as Pick<Tables<'receipt_settings'>, ...> instead of a hand-maintained mirror type, so future column renames are caught by typecheck"
    - "Loosely-typed row-builder helper (row()) output cast to TablesInsert<'X'>/TablesUpdate<'X'> at the call site once real generated types exist, rather than typing the builder itself"

key-files:
  created: []
  modified:
    - "src/shared/lib/supabase.types.ts"
    - "src/entities/settings/model/queries.ts"
    - "src/entities/supplier/model/queries.ts"

key-decisions:
  - "Used a temporary socat proxy container (alpine:3.22, network=supabase_default, binds 127.0.0.1:55432 only, --rm-free but explicitly docker rm'd afterward) to bridge the host to supabase-db:5432, since the self-hosted stack does not publish that port"
  - "ReceiptSettingsRow redefined as a Pick<> of the generated Tables<'receipt_settings'> Row type rather than deleted outright, since mapReceiptRow/toReceiptPayload need a snake_case subset independent of the extra id/updated_at/updated_by columns"
  - "Left the as any casts in the two Plan 07-01 integration test files (receive-shipment-weighted-avg.integration.test.ts, product-sales-report.integration.test.ts) untouched — PLAN.md's files_modified frontmatter locks scope to exactly 3 files and none of Tasks 1-3 name these test files; cleaning them up would be scope creep beyond what this plan asked for"

patterns-established:
  - "Full-schema types regen against a self-hosted (non-`supabase start`) Postgres stack: short-lived socat proxy container on the same docker network, npx supabase gen types typescript --db-url against the proxied port, explicit docker stop+rm after"

requirements-completed: [DATA-03]

coverage:
  - id: D1
    description: "supabase.types.ts regenerated to include suppliers, supplier_products, shipments, receipt_settings tables and the receive_shipment RPC signature"
    requirement: "DATA-03"
    verification:
      - kind: other
        ref: "grep -c 'suppliers:|shipments:|receipt_settings:|receive_shipment:' src/shared/lib/supabase.types.ts (= 4)"
        status: pass
      - kind: other
        ref: "npm run typecheck (repo-wide, tsc --noEmit)"
        status: pass
    human_judgment: false
  - id: D2
    description: "receipt_settings as any cast removed from entities/settings/model/queries.ts (useReceiptSettings, useMutationUpdateReceiptSettings)"
    requirement: "DATA-03"
    verification:
      - kind: other
        ref: "grep -n 'as any' src/entities/settings/model/queries.ts (no matches)"
        status: pass
      - kind: unit
        ref: "npm run test (1107 passed, 15 todo, 116 files) — no regression in dependent suites"
        status: pass
    human_judgment: false
  - id: D3
    description: "suppliers/supplier_products as any cast removed from entities/supplier/model/queries.ts (file-level eslint-disable + db-as-unknown escape hatch deleted)"
    requirement: "DATA-03"
    verification:
      - kind: other
        ref: "grep -rn 'as any|as unknown as' src/entities/supplier/model/queries.ts (no matches)"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run lint (repo-wide, both exit 0)"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-08-17
status: complete
---

# Phase 7 Plan 3: Backend Data Integrity — supabase.types.ts regeneration (DATA-03) Summary

Regenerated `supabase.types.ts` from the live self-hosted Supabase schema via a temporary socat proxy container, then removed the `as any` workaround casts for `receipt_settings` and `suppliers`/`supplier_products` at their two call sites, with a full repo-wide `typecheck`/`lint`/`test` pass confirming nothing else broke.

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `src/shared/lib/supabase.types.ts` now includes `suppliers`, `supplier_products`, `shipments`, `receipt_settings` table types and the `receive_shipment` RPC signature (none existed before this plan)
- `useReceiptSettings()`/`useMutationUpdateReceiptSettings()` in `entities/settings/model/queries.ts` use the plain typed `supabase` client — no cast, no `eslint-disable`
- `entities/supplier/model/queries.ts` dropped its file-level `eslint-disable` block and the `const db = supabase as unknown as {...}` escape hatch — every `suppliers`/`supplier_products` call site is now plainly typed
- `npm run typecheck && npm run lint` pass repo-wide (zero errors); `npm run test` — 1107 tests passed, 15 todo, 116 files, no regressions

## Task Commits

1. **Task 1: [BLOCKING] Regenerate supabase.types.ts against the live self-hosted DB** - `2b93b1f` (feat)
2. **Task 2: Remove the receipt_settings as any cast in entities/settings/model/queries.ts** - `15f71d7` (refactor)
3. **Task 3: Remove the suppliers/supplier_products as any cast in entities/supplier/model/queries.ts, full typecheck/lint** - `a9739ad` (refactor)

_This is a tracer plan: Task 1 was executed and verified end-to-end (grep count = 4, typecheck clean) before Tasks 2-3 proceeded, per the tracer feedback gate — `workflow.auto_advance: true` in config.json meant the gate ran autonomously rather than pausing for a checkpoint._

## Files Created/Modified
- `src/shared/lib/supabase.types.ts` - Regenerated in place; adds `suppliers`, `supplier_products`, `shipments`, `receipt_settings` and `receive_shipment` to the `Database` type
- `src/entities/settings/model/queries.ts` - `receipt_settings` cast removal; `ReceiptSettingsRow` now `Pick<Tables<'receipt_settings'>, ...>` instead of a hand-mirrored type; dropped now-unused `PostgrestError` import
- `src/entities/supplier/model/queries.ts` - `suppliers`/`supplier_products` cast removal; `row()`'s output cast to `TablesInsert<'suppliers'>`/`TablesUpdate<'suppliers'>` at the two mutation call sites; `useSupplierProductIds`/`useProductSupplierIds` guard on the possibly-undefined id param with an early return instead of a non-null assertion (needed once the file-level `no-non-null-assertion` disable was removed); added a not-found guard on the create-supplier insert response since the typed client now surfaces `data` as possibly `null`

## Decisions Made
- Types regen mechanism: a short-lived `alpine:3.22` container running `socat`, attached to the `supabase_default` docker network, publishing `127.0.0.1:55432->5432` to bridge the host (which cannot reach `supabase-db:5432` directly) to the live DB. `npx supabase gen types typescript --db-url postgresql://supabase_admin:<pwd>@localhost:55432/postgres --schema public` produced the new file. Container explicitly `docker stop` + `docker rm`'d afterward — no `pg-typegen-proxy` container remains.
- `ReceiptSettingsRow` in `entities/settings/model/queries.ts` kept as a local type (not deleted) but redefined as `Pick<Tables<'receipt_settings'>, ...>` of the newly-generated Row type, so `mapReceiptRow`/`toReceiptPayload`'s snake_case field mapping stays independent of the row's extra `id`/`updated_at`/`updated_by` columns while still being tied to the real schema for future-proofing.
- `entities/supplier/model/queries.ts`'s `row()` helper (loosely-typed `Record<string, unknown>` builder used for both insert and update payloads) was left as-is per the plan's explicit guidance not to re-derive its manual field mapping; its output is cast to `TablesInsert<'suppliers'>`/`TablesUpdate<'suppliers'>` at each of the two call sites instead, since Supabase's generated insert/update overloads reject excess/mismatched properties on a bare `Record<string, unknown>`.
- Left the `as any` casts in `src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts` and `src/entities/tab/model/product-sales-report.integration.test.ts` (added by 07-01's executor, per that plan's own SUMMARY) untouched. This plan's `files_modified` frontmatter locks scope to exactly 3 files, and Tasks 1-3 never name these test files — cleaning them up now would be scope creep beyond what 07-03-PLAN.md actually asked for, even though the regen technically unlocks it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Fresh worktree checkout had no `node_modules`**
- **Found during:** Task 1 verification (`npm run typecheck` before touching call sites)
- **Issue:** `tsc: not found` — this worktree had never run `npm ci`, so none of `typecheck`/`lint`/`test` could run to verify anything.
- **Fix:** Ran `npm ci` (1338 packages installed, matches `package-lock.json`, no lockfile changes).
- **Files modified:** None (installs into gitignored `node_modules/`, no diff).

**2. [Rule 1 - Bug] TS2769 overload-resolution failure on the strict-typed `suppliers` insert/update calls**
- **Found during:** Task 3, first `npm run typecheck` pass after removing the `db.from()` escape hatch
- **Issue:** `row()`'s `Record<string, unknown>` return type doesn't satisfy Supabase's generated `RejectExcessProperties<...>` insert/update overloads once the client is properly typed; also `r.data` on the create-supplier mutation became possibly `null` (previously masked by `any`), and TS narrowed a subsequent `r.data.id` access to `never` under plain generic inference.
- **Fix:** Cast `row(fields)`'s output to `TablesInsert<'suppliers'>` / `TablesUpdate<'suppliers'>` at each call site; explicitly typed `supabaseMutation<Tables<'suppliers'>>(...)` on the create path to fix the `never`-narrowing; added an explicit `if (r.data === null) return err(notFoundError('Supplier'));` guard.
- **Files modified:** `src/entities/supplier/model/queries.ts`
- **Verification:** `npm run typecheck` passes repo-wide.
- **Committed in:** `a9739ad` (Task 3 commit)

**3. [Rule 1 - Bug] Two forbidden non-null assertions surfaced by removing the file-level eslint-disable**
- **Found during:** Task 3, first `npm run lint` pass
- **Issue:** `useSupplierProductIds`/`useProductSupplierIds` used `supplierId!`/`productId!` inside their `queryFn`, previously silenced by the file-level `@typescript-eslint/no-non-null-assertion` disable that this task deleted.
- **Fix:** Replaced each assertion with an early `if (!supplierId) return ok([]);` / `if (!productId) return ok([]);` guard inside `queryFn` (both hooks already gate the query itself with `enabled: !!id`, so this is a no-op in practice, just satisfies the type narrower).
- **Files modified:** `src/entities/supplier/model/queries.ts`
- **Verification:** `npm run lint` passes repo-wide (0 errors, 0 warnings).
- **Committed in:** `a9739ad` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking/environment, 2 bugs surfaced by the stricter typed client)
**Impact on plan:** All three were necessary to reach a clean repo-wide `typecheck`/`lint` as the plan's own acceptance criteria required. No scope creep — no file outside the plan's locked `files_modified` set was touched.

## Issues Encountered
- The first attempt to start the socat proxy container (`docker run -d --rm ... sh -c "apk add ... && socat ..."`) exited immediately and self-removed (the `--rm` flag deleted it before logs could be inspected). Root cause: without `exec` before `socat`, the shell's own process tree behavior under `-d` caused the container's main process to exit once the backgrounded `socat` was launched. Fixed by adding `exec` (`sh -c "apk add --no-cache socat >/dev/null 2>&1 && exec socat ..."`) so `socat` replaces the shell as PID 1 and the container stays up. This is an executor debugging step, not a plan deviation — the working command is captured above for future regens.

## Next Phase Readiness
- ROADMAP Phase 7 Success Criterion #4 (types regen + no remaining `as any` for suppliers/shipments/receipt_settings/receive_shipment) is fully met.
- No new client code calls `receive_shipment` directly (still edge-function-only), so its RPC type addition is inert for now but available to any future direct caller.
- `src/entities/inventory/model/queries.ts`'s own pre-existing `cost_price`/`expiry_date` casts (out of this plan's explicit scope per PLAN.md) and the two test-file `as any` casts noted above remain as known follow-up cleanup, not blockers.

## Self-Check: PASSED

- FOUND: `src/shared/lib/supabase.types.ts`
- FOUND: `.planning/phases/07-backend-data-integrity/07-03-SUMMARY.md`
- FOUND: commit `2b93b1f` in `git log --oneline`
- FOUND: commit `15f71d7` in `git log --oneline`
- FOUND: commit `a9739ad` in `git log --oneline`
- FOUND: commit `ab01add` in `git log --oneline`

---
*Phase: 07-backend-data-integrity*
*Completed: 2026-08-17*
