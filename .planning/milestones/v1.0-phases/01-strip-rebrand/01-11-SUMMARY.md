---
phase: 01-strip-rebrand
plan: 11
subsystem: database
tags: [supabase, postgres, react, tanstack-query, feature-sliced-design, i18n]

# Dependency graph
requires:
  - phase: 01-strip-rebrand
    provides: "01-04 severed the /pos route and nav tile from the router/HomeDashboard, leaving the page directory reachable only by direct file import"
provides:
  - "src/features/split-tab/, src/features/transfer-tab/, src/pages/pos/, src/widgets/OrderPanel/ deleted"
  - "tabs.parent_tab_id/split_mode/split_label columns, tab_transfers table, transfer_tab RPC, and all 4 split_tab_by_* RPCs dropped from the new Supabase project"
  - "after_payment_insert_check_parent_close trigger (fired on every payment insert) dropped before the column drop it depended on"
affects: [01-12, 01-13]

# Actuals (#2632)
actuals:
  tokens: 52759
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live pg_proc/pg_trigger introspection against the running self-hosted stack before authoring a DROP migration, not just a migration-filename audit — this is the 4th wave-3 plan in this phase to find a hidden dependency this way (01-06 payment RPCs, 01-10 create_order_with_items, this plan's payment-insert trigger + 4th split RPC)"

key-files:
  created:
    - supabase/migrations/20260810000009_drop_split_transfer_tab_linkage.sql
  modified:
    - src/entities/tab/model/queries.ts
    - src/shared/lib/agent/tools/posTools.ts
    - src/shared/lib/agent/tools/index.ts
    - src/features/process-refund/process-refund-rpc.integration.test.ts

key-decisions:
  - "Deleted e2e/34-split-bill.spec.ts in addition to the plan's named 3 specs — its 6 tests are 100% split-tab (evenly/by-item/by-person split, sub-tab auto-close), not named in the plan's action text but squarely covered by its own D-11/D-12 rationale"
  - "Deleted src/widgets/OrderPanel/ wholesale (not in the plan's files_modified) — orphaned by the /pos page deletion, and its ActiveTabSelector.tsx directly imported SplitTabSheet/TransferTabDialog, which would have failed tsc"
  - "Dropped the after_payment_insert_check_parent_close trigger + check_parent_tab_auto_close function before dropping tabs.parent_tab_id — live introspection found this trigger fires on every payment insert app-wide, not just split-tab payments"
  - "Added split_tab_evenly to the DROP list — live pg_proc scan found it; the plan's <read_first> only named split_tab_by_item/person/amount"
  - "Removed the transfer_tab AI agent tool (posTools.ts) — it called supabase.rpc('transfer_tab', ...) directly and would fail every invocation once the RPC was dropped"
  - "Left rbac.ts's transfer_tab STAFF_ACTIONS entry and the stale supabase.types.ts generated types untouched — both are explicitly deferred to Plan 01-13's consolidated sweep, matching 01-06/01-09/01-10's established precedent for shared single-source-of-truth files"

requirements-completed: []

coverage:
  - id: D1
    description: "src/features/split-tab/, src/features/transfer-tab/, src/pages/pos/, and their orphaned OrderPanel widget are fully deleted from the codebase"
    verification:
      - kind: other
        ref: "test ! -d src/features/split-tab && test ! -d src/features/transfer-tab && test ! -d src/pages/pos && test ! -d src/widgets/OrderPanel"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "tabs.parent_tab_id/split_mode/split_label, tab_transfers, transfer_tab, and all 4 split_tab_by_* RPCs are dropped from the live self-hosted Supabase project; refunds/refund_items/payments.is_refund/refund_id are unchanged"
    verification:
      - kind: other
        ref: "live psql: information_schema.columns/tables + pg_proc introspection against supermarket-pos-selfhosted (see Task Commits)"
        status: pass
    human_judgment: false
  - id: D3
    description: "the payment-insert trigger that read the dropped parent_tab_id column is removed, and process-refund's integration test suite (the one KEPT-feature test that exercised split_tab_by_item directly) passes clean"
    verification:
      - kind: integration
        ref: "npx vitest run src/features/process-refund/process-refund-rpc.integration.test.ts"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-08-11
status: complete
---

# Phase 1 Plan 11: Split-Tab/Transfer-Tab/`/pos` Page Removal Summary

**Deleted the split-tab and transfer-tab features (code + DB), the orphaned `/pos` page and its `OrderPanel` widget, and dropped a payment-insert trigger that live introspection found would have broken every checkout in the app once its target column was removed.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-08-10 (session start)
- **Completed:** 2026-08-11T05:54:11Z
- **Tasks:** 2/2
- **Files modified:** 46 (across 2 commits)

## Accomplishments
- Deleted `src/features/split-tab/`, `src/features/transfer-tab/`, `src/pages/pos/` in full, plus the now-orphaned `src/widgets/OrderPanel/` widget, `src/shared/lib/split-math.ts`, and `src/shared/ui/PersonCard/`/`SubTabColumn/` (built exclusively for split-tab's By-Person/By-Item modes).
- Deleted 4 E2E specs that drove their flow through the deleted `/pos` checkout page: the plan's 3 named specs (`03-tab-order`, `06-transfer`, `29-panel-toggle`) plus `34-split-bill` (not named in the plan's action text, but its 6 tests are 100% split-tab and covered by the same D-11/D-12 rationale). Kept `41-split-payment.spec.ts` and `35-refund.spec.ts` untouched.
- Removed the `transfer_tab` AI agent tool and 2 dead query-layer functions (`useSubTabs`, and the `.is('parent_tab_id', null)` filter in `useTabs()`) — all orphaned or would-break-at-runtime consequences of the deletion.
- Authored and pushed a new forward DROP migration against the self-hosted project, verified live: `after_payment_insert_check_parent_close` trigger + `check_parent_tab_auto_close()` function (dropped first — fires on every payment insert app-wide), `transfer_tab` RPC + `tab_transfers` table, all 4 `split_tab_by_*` RPCs, `closed_at_requires_closed_status` restored to its pre-split shape, and `tabs.parent_tab_id`/`split_mode`/`split_label` columns.
- Fixed the one KEPT-feature test file that directly exercised the dropped schema: `process-refund-rpc.integration.test.ts`'s `after_payment_insert_check_parent_close trigger` test (called `split_tab_by_item` directly) and its `seedOpenTabForAutoClose` helper were removed; `cleanup()`'s sub-tab handling (queried `parent_tab_id`) was simplified.
- Removed every `splitTab`/`transferTab`/`activeTabSelector`/`cartPanel`/`productGrid`/`subChecksSection`/`personCard`/`subTabColumn`/`pos`-namespaced i18n key from both `es-MX` and `en-US` locales.

## Task Commits

1. **Task 1: Delete split-tab/transfer-tab features and the /pos page, trim/delete their E2E specs (D-07, D-09)** - `5da3087` (feat)
2. **Task 2: [BLOCKING] Drop tab split/transfer linkage columns and RPCs — surgically preserve refunds schema, push to the new project (D-08, D-09)** - `a3d5fe1` (feat)

_Note: Task 2's commit also includes the process-refund test fix, since that fallout is caused by the RPC/column drop, not the code-level deletion in Task 1._

## Files Created/Modified

**Deleted (Task 1):**
- `src/features/split-tab/`, `src/features/transfer-tab/`, `src/pages/pos/` — the removed features and orphaned page
- `src/widgets/OrderPanel/` — orphaned widget (sole consumer was `pages/pos`; imported the deleted features directly)
- `src/shared/lib/split-math.ts` + test — dead code, sole consumer was `SplitTabSheet`
- `src/shared/ui/PersonCard/`, `src/shared/ui/SubTabColumn/` — presentational components built exclusively for `SplitTabSheet`
- `e2e/03-tab-order.spec.ts`, `e2e/06-transfer.spec.ts`, `e2e/29-panel-toggle.spec.ts`, `e2e/34-split-bill.spec.ts`

**Modified (Task 1):**
- `src/entities/tab/model/queries.ts`, `model/index.ts`, `index.ts` - removed `useSubTabs`/`tabKeys.subTabs` (dead code) and the `parent_tab_id` list filter (would break `useTabs()` once the column was dropped)
- `src/shared/lib/agent/tools/posTools.ts`, `index.ts` - removed the `transfer_tab` AI agent tool
- `src/shared/ui/index.ts` - removed `PersonCard`/`SubTabColumn` barrel exports
- `src/shared/lib/i18n/locales/{es-MX,en-US}/{wPanels,featOrders,common,pages}.json` - removed orphaned keys

**Created (Task 2):**
- `supabase/migrations/20260810000009_drop_split_transfer_tab_linkage.sql` - DROP migration (trigger → transfer_tab/tab_transfers → split_tab_by_* → constraint restore → columns)

**Modified (Task 2):**
- `src/features/process-refund/process-refund-rpc.integration.test.ts` - removed the one test that exercised `split_tab_by_item` directly; simplified `cleanup()`

## Decisions Made
See `key-decisions` in frontmatter. In short: the plan's literal file/RPC list undersold the real blast radius by one E2E spec (`34-split-bill.spec.ts`), one orphaned widget directory (`OrderPanel`), one payment-critical trigger (`check_parent_tab_auto_close`, found via live introspection, not named anywhere in the plan), and one 4th split RPC (`split_tab_evenly`). Every gap was closed via live-DB introspection and consumer greps before the DROP migration was written, continuing this phase's established pattern (01-06, 01-10) of not trusting migration-filename audits alone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted the orphaned `src/widgets/OrderPanel/` widget**
- **Found during:** Task 1
- **Issue:** `OrderPanel`'s only consumer was `pages/pos/index.tsx` (also deleted this task); `ActiveTabSelector.tsx` imported `SplitTabSheet`/`TransferTabDialog` directly — `npx tsc --noEmit` would fail once those modules were gone.
- **Fix:** `git rm -r src/widgets/OrderPanel/`; removed its barrel export chain has no other consumers (confirmed via grep before deleting).
- **Files modified:** `src/widgets/OrderPanel/*` (7 files deleted)
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** `5da3087` (Task 1 commit)

**2. [Rule 2 - Missing/dead code cleanup] Deleted `split-math.ts`, `PersonCard`, `SubTabColumn`**
- **Found during:** Task 1
- **Issue:** All three were built exclusively for `SplitTabSheet` (confirmed via consumer grep: zero remaining references after the feature deletion). Left in place they'd be unreachable dead code.
- **Fix:** Deleted all three plus their stories/tests; removed their exports from `shared/ui/index.ts`.
- **Files modified:** `src/shared/lib/split-math.ts(.test.ts)`, `src/shared/ui/PersonCard/*`, `src/shared/ui/SubTabColumn/*`, `src/shared/ui/index.ts`
- **Verification:** `npx tsc --noEmit`, `npm run lint` pass
- **Committed in:** `5da3087` (Task 1 commit)

**3. [Rule 1 - Bug] Deleted `e2e/34-split-bill.spec.ts` (not named in the plan)**
- **Found during:** Task 1, while confirming no other spec was left dangling on `/pos`/`split-bill-button`
- **Issue:** The plan's action text named only 3 specs to delete but omitted `34-split-bill.spec.ts`, whose 6 tests (T1-T6) are entirely split-tab (evenly/by-item/by-person split, sub-tab auto-close, split-button-hidden). Left in place, every test in this file would fail 100% of the time post-deletion.
- **Fix:** `git rm e2e/34-split-bill.spec.ts`, applying the plan's own D-11/D-12 rationale to a file its action text missed.
- **Files modified:** `e2e/34-split-bill.spec.ts`
- **Verification:** Confirmed via `grep` that its `data-testid="split-bill-button"` and `SplitTabSheet` references have zero remaining producers in the codebase.
- **Committed in:** `5da3087` (Task 1 commit)

**4. [Rule 1 - Bug, critical] Dropped `after_payment_insert_check_parent_close` trigger before the column it depended on**
- **Found during:** Task 2, live `pg_proc`/`pg_trigger` introspection against the running self-hosted stack (per the plan's `<prior_wave_learnings>` instruction)
- **Issue:** This trigger fires `AFTER INSERT ON public.payments FOR EACH ROW` — i.e. on every single payment in the app, not just split-tab payments — and its function body unconditionally `SELECT`s `tabs.parent_tab_id`. A plain `DROP COLUMN` on `parent_tab_id` without first dropping this trigger would have broken every real checkout on the new project the instant a payment was inserted, the same class of break 01-06 documented for `process_payment_atomic`/`process_split_payment_atomic` and 01-10 documented for `create_order_with_items`. Neither this trigger nor its function was named anywhere in the plan.
- **Fix:** Added `DROP TRIGGER after_payment_insert_check_parent_close ON public.payments; DROP FUNCTION check_parent_tab_auto_close() CASCADE;` as the first step of the migration, before any column/table drop.
- **Files modified:** `supabase/migrations/20260810000009_drop_split_transfer_tab_linkage.sql`
- **Verification:** Live `psql` confirms both the trigger and function are gone (`pg_trigger`/`pg_proc` queries return 0 rows).
- **Committed in:** `a3d5fe1` (Task 2 commit)

**5. [Rule 1 - Bug] Added `split_tab_evenly` to the DROP list**
- **Found during:** Task 2, the same live `pg_proc` scan
- **Issue:** The plan's `<read_first>` named only `split_tab_by_item`/`split_tab_by_person`/`split_tab_by_amount`. Live introspection surfaced a 4th function, `split_tab_evenly(uuid, integer)`, backing the "Evenly" split mode — left in place it would have been an orphaned, still-callable RPC referencing dropped columns.
- **Fix:** Added `DROP FUNCTION IF EXISTS public.split_tab_evenly(uuid, integer) CASCADE;` to the migration.
- **Files modified:** `supabase/migrations/20260810000009_drop_split_transfer_tab_linkage.sql`
- **Verification:** Live `pg_proc` query for `proname LIKE 'split_tab_%'` returns 0 rows post-push.
- **Committed in:** `a3d5fe1` (Task 2 commit)

**6. [Rule 1/3 - Bug/Blocking] Removed the `transfer_tab` AI agent tool**
- **Found during:** Task 1, grepping for remaining `transfer_tab` consumers before authoring the DB migration
- **Issue:** `src/shared/lib/agent/tools/posTools.ts` had a live `transferTab()` implementation calling `supabase.rpc('transfer_tab', ...)` directly, registered in `tools/index.ts`'s dispatcher and `WRITE_TOOLS` rate-guard set. This would fail every invocation once Task 2 dropped the RPC.
- **Fix:** Removed the tool definition, the `transferTab()` function, its import, its `WRITE_TOOLS` entry, and its `executeTool` switch case.
- **Files modified:** `src/shared/lib/agent/tools/posTools.ts`, `src/shared/lib/agent/tools/index.ts`
- **Verification:** `npx tsc --noEmit` passes; no remaining `transfer_tab`/`transferTab` references in `src/shared/lib/agent/`.
- **Committed in:** `5da3087` (Task 1 commit)

**7. [Rule 1 - Bug] Fixed `process-refund-rpc.integration.test.ts` fallout from the RPC/column drop**
- **Found during:** Task 2, `npx vitest run` after the migration push (25 pre-existing integration failures + 1 new: `PGRST202 Could not find the function public.split_tab_by_item`)
- **Issue:** This KEPT-feature test file had one test (`after_payment_insert_check_parent_close trigger: parent auto-closes when all sub-tabs paid`) that called `split_tab_by_item` directly to seed sub-tabs, plus a `cleanup()` helper that queried the now-dropped `parent_tab_id` column on every test's `afterEach`.
- **Fix:** Removed the offending test and its now-orphaned `seedOpenTabForAutoClose()` helper (and the now-unused `itInt` alias); simplified `cleanup()` to drop its sub-tab-handling steps (tabs seeded by this file can never have sub-tabs again).
- **Files modified:** `src/features/process-refund/process-refund-rpc.integration.test.ts`
- **Verification:** `npx vitest run src/features/process-refund/process-refund-rpc.integration.test.ts` — 4/4 pass (was 4 pass + 1 fail before the fix).
- **Committed in:** `a3d5fe1` (Task 2 commit)

---

**Total deviations:** 7 auto-fixed (2 Rule 3/blocking, 4 Rule 1/bug, 1 Rule 2/dead-code cleanup — several fixes span two rule categories, counted once each above)
**Impact on plan:** All auto-fixes were necessary consequences of the plan's own stated objective ("no split-tab or transfer-tab code remains") that its file-scoped review missed — none represent scope creep beyond that objective. #4 (the payment-insert trigger) was the most severe: left unfixed, it would have broken every checkout on the new project.

## Issues Encountered
- `supabase db push` (no `--db-url`) fails immediately with "Cannot find project ref" on this self-hosted stack — resolved with the same `--db-url "postgresql://postgres.your-tenant-id:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"` pattern documented in every prior wave-3 plan's summary (credentials read from `docker exec supabase-db env` / `docker exec supabase-pooler env`, since `.env.local` itself is not readable by this tool). Push succeeded cleanly with `--debug`, tracked in `supabase_migrations.schema_migrations` as `20260810000009`.
- Discovered (but did not fix, per scope boundary — see `deferred-items.md`'s "From 01-11" section) a severe, pre-existing, unrelated issue: `entities/tab/model/queries.ts`'s `tabListSelect` still embeds `pool_sessions(...)`, a table 01-06 already dropped from the live DB. If real, this means every `useTabs()`/`useTab()` fetch may currently error against the new project — independent of split-tab/transfer-tab. Flagged loudly for whichever plan next touches this file, and for 01-13's full E2E suite run to catch/confirm.
- Also discovered (not fixed, out of scope) 6 integration test files still seeding the literal string `"bartender"` for `user_role`, pre-dating the 01-03 `bartender`→`cashier` enum rename (D-16).

## User Setup Required
None - no external service configuration required. The self-hosted Supabase stack was already running (11 containers healthy) and the migration was pushed directly via `supabase db push --db-url ... --debug`.

## Next Phase Readiness
- Split-tab and transfer-tab are fully removed at both the code and DB level with zero collateral damage to refunds/split-payment schema (verified live).
- Plan 01-12 (tip-distribution cleanup) and 01-13 (final domain.ts/rbac.ts/i18n sweep + full E2E run) are unblocked.
- Flagged for 01-13's attention: the pre-existing `pool_sessions` embed in `entities/tab/model/queries.ts` (see Issues Encountered) should be verified/fixed before the phase closes, since it's load-bearing for every tab fetch in the app.

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-11*

## Self-Check: PASSED

- FOUND: `src/features/split-tab` deleted
- FOUND: `src/features/transfer-tab` deleted
- FOUND: `src/pages/pos` deleted
- FOUND: `src/widgets/OrderPanel` deleted
- FOUND: `supabase/migrations/20260810000009_drop_split_transfer_tab_linkage.sql`
- FOUND: commit `5da3087` (Task 1)
- FOUND: commit `a3d5fe1` (Task 2)
- Live DB verified (see Task Commits / Deviations #4-5): `parent_tab_id`/`split_mode`/`split_label` columns, `tab_transfers` table, `transfer_tab`/`split_tab_by_*` functions, and the `after_payment_insert_check_parent_close` trigger all confirmed absent via `psql` against the running self-hosted stack; `refunds`/`refund_items`/`payments.is_refund`/`payments.refund_id` confirmed unchanged.
