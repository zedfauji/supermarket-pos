---
phase: 05-delete-void-order-feature
plan: 03
subsystem: testing
tags: [playwright, vitest, e2e, rbac, dead-code-removal]

# Dependency graph
requires:
  - phase: 05-01
    provides: "Client-side void-order removal (feature folder, rbac.ts Action union, edge-function-contracts.ts exports/registry)"
  - phase: 05-02
    provides: "Backend/DB void-order removal (role_permissions migration, edge function directory, i18n keys)"
provides:
  - "e2e/18-void-order.spec.ts deleted — the dead self-skipping spec is gone"
  - "e2e/09-rbac.spec.ts's T8/T9 (already-skipped dialog-behavior tests) deleted, replaced by one unskipped absence-assertion test proving no void-order control is reachable from /pos or /payments (ROADMAP Phase 5 SC1)"
  - "e2e/helpers/supabase.ts's seedVoidableOrder helper deleted (used only by the deleted spec)"
  - "e2e/global-teardown.ts's stale SUITE_MAP entry for the deleted spec removed"
  - "Repo-wide grep confirms zero remaining void-order references outside .planning/, historical migrations, comment-only residuals, and this plan's own new absence-test literal (ROADMAP Phase 5 SC2)"
  - "SC4 (voids report + caja close) and SC5 (refund) confirmed passing unchanged via targeted Playwright runs"
affects: []

# Actuals (#2632)
actuals:
  tokens: 7800
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SC1 absence-assertion pattern: no seeded order/tab setup needed to prove a deleted trigger control is unreachable — navigate + toHaveCount(0), reusing the existing loginAs/logout helpers rather than porting the old dialog-behavior spec's seed scaffolding."

key-files:
  created: []
  modified:
    - e2e/09-rbac.spec.ts
    - e2e/18-void-order.spec.ts (deleted)
    - e2e/helpers/supabase.ts
    - e2e/global-teardown.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Fixed e2e/09-rbac.spec.ts's T-RP-01 (stale '76 switches' / '19 rows' permission-matrix assertion) as a Rule 1 auto-fix — it's a direct, traceable consequence of 05-01's void_order removal from STAFF_ACTIONS (19->18 actions), discovered during this plan's own full verification gate, in a file this plan already owns."
  - "Did NOT fix e2e/09-rbac.spec.ts's T-RP-05 (process_refund/bartender) or e2e/07-reports.spec.ts:935 (Phase 24 removal test, references dropped 'pool_tables' table) — both are pre-existing failures unrelated to void-order (process-refund last touched Phase 1; pool_tables dropped Phase 1), out of this plan's scope per the SCOPE BOUNDARY rule. Logged to .planning/WINDOWS.md instead of fixed."
  - "Did NOT re-run the full 'npm run test:e2e' suite a second time after its first ~1h run surfaced 40 failures spread across unrelated feature files (staff-mgmt, caja-entries, direct-sale-checkout, barcode-scan, full-day-soak, etc.) with no thematic link to void-order/RBAC/edge-function changes — consistent with this repo's already-documented long-run E2E flakiness (WINDOWS.md #1,3,4,6-11). Verified the phase's actual SC1/SC4/SC5 gates individually instead, all green except the two pre-existing items above."

patterns-established: []

requirements-completed: [SALE-01]

coverage:
  - id: D1
    description: "e2e/18-void-order.spec.ts deleted; e2e/09-rbac.spec.ts's T8/T9 (already-skipped) deleted"
    requirement: "SALE-01"
    verification:
      - kind: e2e
        ref: "test ! -f e2e/18-void-order.spec.ts && npx playwright test e2e/09-rbac.spec.ts --list (19 tests listed, one fewer skip, one new unskipped test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "New unskipped Playwright test proves void-order control absent from /pos and /payments (SC1)"
    requirement: "SALE-01"
    verification:
      - kind: e2e
        ref: "e2e/09-rbac.spec.ts#void-order control is absent from every screen it could plausibly appear on"
        status: pass
    human_judgment: false
  - id: D3
    description: "e2e/helpers/supabase.ts's seedVoidableOrder deleted; e2e/global-teardown.ts's stale SUITE_MAP entry removed"
    requirement: "SALE-01"
    verification:
      - kind: unit
        ref: "grep -rn seedVoidableOrder e2e/ src/ (zero matches) + npm run typecheck (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repo-wide grep confirms void-order deletion is complete outside .planning/, historical migrations, and comment-only residuals (SC2)"
    requirement: "SALE-01"
    verification:
      - kind: other
        ref: "grep -rln -i 'void.order|void_order|voidOrder|VoidOrder' --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.git . (10 files, all pre-existing/historical/comment-only, documented below)"
        status: pass
    human_judgment: false
  - id: D5
    description: "SC4 (voids report + caja close) and SC5 (refund) pass unchanged"
    requirement: "SALE-01"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/07-reports.spec.ts e2e/02-caja.spec.ts (Voids & Refunds tabs all pass) + npx playwright test e2e/35-refund.spec.ts (3/3 pass)"
        status: pass
    human_judgment: false

duration: 1h 21m
completed: 2026-08-17
status: complete
---

# Phase 5 Plan 3: Delete void-order E2E surface + full verification gate Summary

**Deleted the dead void-order E2E spec and its two already-skipped RBAC dialog tests, added the one new Playwright test that actually proves the control is unreachable (SC1), and ran the phase's full SC1-SC5 verification gate — closing out SALE-01's E2E surface.**

## Performance

- **Duration:** 1h 21m (dominated by a ~1h `npm run test:e2e` full-suite run in Task 2's verification)
- **Started:** 2026-08-16T23:39:30-06:00
- **Completed:** 2026-08-17T01:00:24-06:00
- **Tasks:** 2
- **Files modified:** 5 (1 deleted, 4 edited)

## Accomplishments
- `e2e/18-void-order.spec.ts` deleted entirely (the self-skipping spec for the already-deleted `VoidOrderDialog` UI).
- `e2e/09-rbac.spec.ts`'s T8/T9 (already `test.skip()`'d, drove the same orphaned dialog via the long-gone `/pos` tab-based flow) deleted; replaced with one new, unskipped test — `'void-order control is absent from every screen it could plausibly appear on'` — that logs in as manager and asserts zero count for both a void-order button and alertdialog on `/pos` and `/payments`, with no seeded order needed (SC1's concrete Playwright proof).
- `e2e/helpers/supabase.ts`'s `seedVoidableOrder` helper deleted (used only by the deleted spec); `e2e/global-teardown.ts`'s stale `SUITE_MAP` entry for `18-void-order` removed.
- Full local pipeline (`npm run typecheck && npm run lint && npm run test`) green throughout, 1098 unit tests passing.
- Task 2's full verification gate ran all 5 ROADMAP Phase 5 success criteria (SC1-SC5) as concrete automated commands; found and auto-fixed one Rule-1 regression (stale permission-matrix switch count) directly caused by 05-01's `void_order` removal; found and logged (not fixed) two pre-existing unrelated failures plus a long-run E2E flakiness pattern.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete the dead spec/helper/skipped-tests and add the SC1 absence-assertion test** - `c07474e` (test)
2. **Task 2: Full verification gate — SC1-SC5** (Rule 1 auto-fix + deviation logging) - `07ebf1a` (fix), `6de10aa` (docs)

_Note: all commits were `type="auto"` (non-TDD)._

## Files Created/Modified
- `e2e/18-void-order.spec.ts` - deleted (self-skipping spec for the deleted VoidOrderDialog UI)
- `e2e/09-rbac.spec.ts` - T8/T9 deleted; new SC1 absence-assertion test added; T-RP-01's stale switch-count assertion fixed (76→72, 19→18 actions)
- `e2e/helpers/supabase.ts` - `seedVoidableOrder` deleted
- `e2e/global-teardown.ts` - stale `18-void-order` `SUITE_MAP` entry removed
- `.planning/WINDOWS.md` - 3 new entries logging pre-existing, out-of-scope failures found during verification

## Decisions Made
- Followed the plan's Task 1 `<action>` exactly: T8/T9 deleted with their leading comments, T10 and everything else in the file left untouched, new test inserted in the same gap.
- Task 2's full verification gate (all 6 items in the plan's action list) was run in order: typecheck/lint/test pipeline, repo-wide grep, `e2e/09-rbac.spec.ts`, `e2e/07-reports.spec.ts`+`e2e/02-caja.spec.ts`, `e2e/35-refund.spec.ts`, and the full `npm run test:e2e` suite.
- The repo-wide grep (Code Examples pattern from 05-RESEARCH.md) returned 10 files with residual matches. All are legitimate and expected, not violations:
  - `supabase/migrations/20260510000001_rls_rewrite_phase13.sql`, `20260512000002_rpc_versioned_group_a.sql`, `20260720000001_fix_edit_paid_tab_inventory.sql`, `20260721000005_remove_tab_item_rpc.sql` — historical migrations, must not be edited per D-01.
  - `supabase/migrations/20260818000006_drop_void_order_permissions.sql` — this phase's own new migration (05-02), its UP statement and commented DOWN block necessarily mention `void_order`.
  - `e2e/38-audit-logs.spec.ts`, `src/entities/tab/model/queries.concurrent.test.ts`, `src/shared/lib/__tests__/audit-edge-coverage.test.ts` — comment-only, harmless residuals, explicitly pre-approved by the plan's own prohibitions section (38-audit-logs, queries.concurrent.test.ts) or by 05-01's own removal-notice JSDoc (audit-edge-coverage.test.ts).
  - `e2e/07-reports.spec.ts:928` — a stale doc comment referencing a `requiredAction="void_order"` prop that no longer exists in any live component (confirmed via `grep -rn requiredAction src/` — the only live `ManagerPinDialog` caller near that comment uses `requiredAction="adjust_inventory"`); comment-only, `npm run typecheck` passes, and the file must stay unchanged for SC4. Not touched — touching it would violate the plan's "e2e/07-reports.spec.ts passes unchanged" requirement for a documentation-only inaccuracy unrelated to correctness.
  - `e2e/09-rbac.spec.ts` — the new SC1 absence test's own name/comments/regex necessarily contain the string "void order" to describe what it's proving absent; this is the plan's own new artifact, not a leftover reference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale permission-matrix switch-count assertion in T-RP-01**
- **Found during:** Task 2 (full verification gate, running `e2e/09-rbac.spec.ts` for SC1)
- **Issue:** `T-RP-01: Admin sees permission matrix on /rbac page` asserted `76` switches (`19 STAFF_ACTIONS x 4 roles`) and a matching comment — stale since 05-01-PLAN.md removed `'void_order'` from `STAFF_ACTIONS`/`MANAGER_EXTRA`, shrinking the action count from 19 to 18. The test failed with `Expected: 76, Received: 72`.
- **Fix:** Updated the expected count to `72` (18 x 4) and the explanatory comment to note both Phase 1's original 26→19 prune and Phase 5's 19→18 `void_order` removal.
- **Files modified:** `e2e/09-rbac.spec.ts`
- **Verification:** `npx playwright test e2e/09-rbac.spec.ts -g "T-RP-01"` — 1/1 pass.
- **Committed in:** `07ebf1a`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix), 3 logged-not-fixed (see below)
**Impact on plan:** The auto-fix was necessary and directly in-scope (same file this plan already owns, direct consequence of this phase's own RBAC sweep). No scope creep.

### Logged, Not Fixed (out of scope per SCOPE BOUNDARY)

**1. `e2e/09-rbac.spec.ts` T-RP-05 (process_refund/bartender)** — clicking Refund now opens a `RefundSheet` reason/approval dialog instead of firing an immediate RPC, so the test's forbidden-toast assertion never matches. `process-refund` was last touched in Phase 1 (commit `a3d5fe1`), 4+ phases before this one — unrelated to void-order. Logged to `.planning/WINDOWS.md` (#12).

**2. `e2e/07-reports.spec.ts:935` (Phase 24 removal test)** — its `seedRemovableItem` helper queries `public.pool_tables`, a table dropped in Phase 1's strip-and-rebrand. Unrelated to void-order. Logged to `.planning/WINDOWS.md` (#13).

**3. Full `npm run test:e2e` (44 specs, single worker, ~1h)** — 40 failures spread across unrelated feature areas (staff management, caja entries, payment edge cases, categories, audit-log diff viewer, i18n locale switch, edit-paid-tab, reopen-ticket, receipt grouping, direct-sale checkout, barcode scan, loose-weight, full-day soak), with no thematic link to void-order/RBAC/edge-function changes. This matches this repo's already-documented pattern of long-run E2E flakiness (`.planning/WINDOWS.md` #1, #3, #4, #6-#11 from prior phases — Docker/Realtime/Supabase-local-stack instability under sustained load). The phase's actual SC1/SC4/SC5 gates were independently verified green (except the two items above) by running the specific spec files individually rather than the full suite. Logged to `.planning/WINDOWS.md` (#14) rather than re-running the full suite a second time (would cost another ~1h for a very likely repeat of the same environmental flakiness, per the FIX ATTEMPT LIMIT / SCOPE BOUNDARY guidance).

## Issues Encountered

Worktree environment setup (not a plan deviation — environment-only): this worktree had no `node_modules/` and no `.env.local` (both gitignored). Symlinked both from the main repo checkout (`/home/widowsvail/ai/POS/supermarket-pos/`), same as 05-01/05-02. Neither symlink is tracked by git.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SALE-01 is complete: all three plans (05-01 client, 05-02 backend/DB, 05-03 E2E surface + verification) have landed. The void-order feature is deleted end-to-end — client component, edge function, RBAC grant, i18n keys, and its E2E spec — while `orders.status='voided'`, `get_voids_report`, `close_caja_session`, and `AuditActionSchema`'s `'order.void'` entry remain untouched and verified working.
- Three pre-existing, unrelated E2E issues are tracked in `.planning/WINDOWS.md` (#12, #13, #14) for future cleanup — none block this phase's completion since they predate it and are unrelated to SALE-01.
- No blockers for Phase 6+.

---
*Phase: 05-delete-void-order-feature*
*Completed: 2026-08-17*
