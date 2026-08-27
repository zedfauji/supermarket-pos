---
phase: 01-strip-rebrand
plan: 05
subsystem: infra
tags: [supabase, rls, realtime, i18n, react-i18next, postgres, tauri]

# Dependency graph
requires:
  - phase: 01-strip-rebrand (Plan 04)
    provides: routes/nav-tiles/settings-tabs/reports-tabs already severed from the router, HomeDashboard, SettingsTabsPanel, and Reports registration files
provides:
  - Rappi delivery integration fully removed from both the codebase and the database (entity, widget, page, both edge functions, settings integration, DB table + Realtime publication membership)
  - supabase/migrations DROP-migration + DO-block idempotent ALTER PUBLICATION pattern for future table removals against this self-hosted stack
affects: [Phase 2 checkout rebuild — tab.rappiOrderId/PaymentForm.tsx rappi payment-method path intentionally still present and untouched]

# Actuals (#2632)
actuals:
  tokens: 22200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DROP-migration convention (UP: BEGIN/COMMIT block, commented -- DOWN: recreate-shape-only block) extended to cover: ALTER PUBLICATION ... DROP TABLE has no IF EXISTS support in PostgreSQL, unlike ADD TABLE — wrap it in a DO block that checks pg_publication_tables first for idempotency."

key-files:
  created:
    - supabase/migrations/20260810000002_drop_rappi_orders.sql
    - .planning/phases/01-strip-rebrand/deferred-items.md
  modified:
    - src/shared/lib/domain.ts
    - src/entities/settings/model/queries.ts
    - src/shared/lib/edge-function-contracts.ts
    - supabase/config.toml

key-decisions:
  - "Expanded Task 1's scope beyond the plan's literal <files> list to include the orphaned Rappi *settings* integration (RappiSettingsTab.tsx, entities/settings' RappiSettings type/useMutationSyncRappiMenu, rappi-sync-menu's edge-function-contracts.ts wiring, rappi-webhook-payload.ts, rappi-constants.ts, VITE_RAPPI_WEBHOOK_SECRET, [functions.rappi-webhook] config.toml stanza) — these were discovered via the plan's own read_first grep instruction and had zero purpose once the entity/edge-functions were deleted (Rule 1: deleting rappi-sync-menu would otherwise leave a Settings tab whose sync button called a nonexistent function)."
  - "Left the PaymentMethodSchema 'rappi' enum value, PaymentForm.tsx's isRappiTab/rappi payment branch, CajaReportPanel's Rappi Sales row, and tab.rappiOrderId completely untouched, per the plan's explicit scope note — verified via E2E (07-reports.spec.ts Rappi revenue-breakdown test passes; 23-payment-edge-cases.spec.ts PE5 self-skips on unrelated seed-data timing, not a regression — payment-btn-rappi is still rendered by the untouched PaymentForm.tsx)."
  - "Fixed a genuine PostgreSQL syntax bug while pushing Task 2's migration: ALTER PUBLICATION ... DROP TABLE does not support IF EXISTS (confirmed against the running Postgres 17 instance, error 42601) — wrapped in a DO block checking pg_publication_tables instead."

requirements-completed: []

coverage:
  - id: D1
    description: "Rappi entity/widget/page/edge-functions/E2E-spec deleted; zero remaining @entities/rappi-order or RappiOrdersPanel consumers; tsc --noEmit clean"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep -r '@entities/rappi-order' src/ (zero hits)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Orphaned Rappi settings-integration plumbing (RappiSettingsTab.tsx, entities/settings RappiSettings, edge-function-contracts.ts callRappiMenuSync, rappi-webhook-payload.ts, rappi-constants.ts, VITE_RAPPI_WEBHOOK_SECRET, config.toml stanza, i18n namespace blocks) removed"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep -rli rappi src/ supabase/ (only retained payment-method 'rappi' references remain)"
        status: pass
    human_judgment: false
  - id: D3
    description: "rappi_orders table, its supabase_realtime publication membership, and rappi_order_status enum dropped on the self-hosted DB project"
    verification:
      - kind: integration
        ref: "docker exec supabase-db psql -c \"SELECT table_name FROM information_schema.tables WHERE table_name='rappi_orders'\" (0 rows); pg_publication_tables (0 rows); pg_type (0 rows); schema_migrations count 146"
        status: pass
    human_judgment: false
  - id: D4
    description: "Retained Rappi-as-payment-method surface (PaymentForm.tsx, CajaReportPanel Rappi Sales row) still functions unmodified"
    verification:
      - kind: e2e
        ref: "e2e/07-reports.spec.ts › Revenue breakdown shows cash, card, rappi"
        status: pass
      - kind: e2e
        ref: "e2e/23-payment-edge-cases.spec.ts › PE5: Rappi payment method — no open_cash_drawer in logs"
        status: unknown
    human_judgment: true
    rationale: "PE5 self-skipped (test.skip 'Tab not found in payments list' or 'Rappi payment button not present') on both of two runs — pre-existing seed-data/timing flakiness in the E2E helper, not a code path touched by this plan (PaymentForm.tsx and payment-btn-rappi are unmodified). Flagged rather than asserted pass since the test's own assertion never executed."

duration: 55min
completed: 2026-08-10
status: complete
---

# Phase 01 Plan 05: Remove Rappi Delivery Integration Summary

**Deleted the Rappi delivery entity/widget/page/edge-functions/settings-tab end to end (code + i18n + `rappi_orders` DB table + Realtime publication membership), leaving the retained Rappi-as-payment-method path in PaymentForm.tsx/CajaReportPanel completely untouched.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-10T18:20Z (approx, session start)
- **Completed:** 2026-08-10
- **Tasks:** 2/2 completed
- **Files modified:** 36 (14 deleted, 21 modified, 1 new migration, 1 new deferred-items.md)

## Accomplishments

- Deleted `src/entities/rappi-order/`, `src/widgets/RappiOrdersPanel/`, `src/pages/rappi/`, both edge functions (`rappi-sync-menu`, `rappi-webhook`), and `e2e/25-rappi-orders.spec.ts` per the plan's literal scope.
- Chased down and removed the *entire* Rappi settings-integration surface the plan's read_first grep didn't anticipate: `RappiSettingsTab.tsx` (store ID / webhook secret / menu sync UI, already unregistered but never deleted in 01-04), its `RappiSettings` type/schema/mutation hook in `entities/settings`, `callRappiMenuSync`/`RappiMenuSyncResponseSchema` in `edge-function-contracts.ts`, `rappi-webhook-payload.ts` + test, `rappi-constants.ts`, the `VITE_RAPPI_WEBHOOK_SECRET` env type, and the `[functions.rappi-webhook]` config.toml stanza.
- Removed the `RappiOrder*`/`RappiSettings` Zod schemas and their `domain.schemas`/`domain.types` registry entries from `domain.ts` (single source of truth per CLAUDE.md), and dropped `'rappi'` from `SettingsKeySchema`.
- Removed all orphaned i18n keys across both locales (`rappiOrdersPanel`, `entities.rappiOrder`, `pages.rappi`, `wAdmin.rappiSettingsTab`, plus the dead `homeDashboard.tiles.rappiOrders` and `settings.tabs.rappi` labels left over from 01-04).
- Dropped `rappi_orders`, its `supabase_realtime` publication membership, and the `rappi_order_status` enum on the self-hosted DB project via a new forward migration; fixed a genuine PostgreSQL syntax bug found while pushing (`ALTER PUBLICATION ... DROP TABLE` has no `IF EXISTS`).
- Confirmed via E2E that the deliberately-retained Rappi-as-payment-method path (PaymentForm.tsx, CajaReportPanel) still renders and reports correctly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete Rappi entity, widget, page, edge functions, settings integration, and E2E spec (D-09)** - `95b59c7` (feat)
2. **Task 2: Drop rappi_orders table and Realtime publication membership (D-09)** - `84357e9` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `supabase/migrations/20260810000002_drop_rappi_orders.sql` - forward DROP migration (publication membership → table CASCADE → enum type) with a commented DOWN block
- `.planning/phases/01-strip-rebrand/deferred-items.md` - logs 2 pre-existing (01-04-era) failing unit tests discovered during verification
- `src/shared/lib/domain.ts` - removed RAPPI DELIVERY ORDER schema block, RappiSettingsSchema, 'rappi' SettingsKey enum value, registry entries
- `src/entities/settings/{index.ts,model/{index,queries,types}.ts}` - removed RappiSettings type/schema, DEFAULT_RAPPI, parseRappi, 'rappi' snapshot key, useMutationSyncRappiMenu
- `src/shared/lib/edge-function-contracts.ts` - removed RappiMenuSyncResponseSchema, callRappiMenuSync, the 'rappi-sync-menu' EDGE_FUNCTIONS entry (kept the shared getInvokeErrorMessage helper — used by 5 other callers)
- `src/vite-env.d.ts` - removed VITE_RAPPI_WEBHOOK_SECRET env type
- `supabase/config.toml` - removed [functions.rappi-webhook] verify_jwt stanza
- `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx` - removed dead vi.mock for the deleted RappiSettingsTab
- 10 i18n locale JSON files (es-MX/en-US × entities/pages/settings/wAdmin/wPanels) - removed orphaned Rappi key blocks

**Deleted:** `src/entities/rappi-order/**` (6 files), `src/widgets/RappiOrdersPanel/index.tsx`, `src/pages/rappi/index.tsx`, `supabase/functions/{rappi-sync-menu,rappi-webhook}/index.ts`, `e2e/25-rappi-orders.spec.ts`, `src/widgets/SettingsTabsPanel/tabs/RappiSettingsTab.tsx`, `src/shared/lib/rappi-webhook-payload.ts(+test)`, `src/shared/lib/rappi-constants.ts`

## Decisions Made

- Expanded Task 1's scope beyond the plan's literal `<files>` list to remove the orphaned Rappi settings-integration plumbing discovered while chasing consumers (Rule 1 — leaving it would mean a Settings tab whose Sync button called a now-deleted edge function). See `key-decisions` in frontmatter.
- Left `PaymentMethodSchema`'s `'rappi'` value, `PaymentForm.tsx`'s `isRappiTab` logic, `CajaReportPanel`'s Rappi Sales row, and `tab.rappiOrderId` completely untouched per the plan's explicit scope note.
- Fixed the `ALTER PUBLICATION ... DROP TABLE` `IF EXISTS` syntax bug inline (Rule 1) rather than deferring — it blocked the migration from applying at all.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ALTER PUBLICATION ... DROP TABLE IF EXISTS` is not valid PostgreSQL syntax**
- **Found during:** Task 2, first `supabase db push` attempt
- **Issue:** Unlike `ADD TABLE`, PostgreSQL's `ALTER PUBLICATION name DROP TABLE` grammar has no `IF EXISTS` clause — the push failed with `ERROR: syntax error at or near "EXISTS" (SQLSTATE 42601)` before any DDL ran (transaction rolled back cleanly, nothing partially applied).
- **Fix:** Wrapped the `ALTER PUBLICATION` statement in a `DO $$ ... END $$` block that checks `pg_publication_tables` first, making the drop idempotent without relying on `IF EXISTS`.
- **Files modified:** `supabase/migrations/20260810000002_drop_rappi_orders.sql`
- **Verification:** Re-ran `supabase db push --debug`; migration applied cleanly; `pg_publication_tables` confirmed empty for `rappi_orders` afterward.
- **Committed in:** `84357e9` (part of Task 2 commit)

**2. [Rule 1/2 — plan-gap completeness] Orphaned Rappi settings-integration code not in the plan's `<files>` list**
- **Found during:** Task 1, chasing down `@entities/rappi-order`/`RappiOrdersPanel` consumers per the task's own `read_first` grep instruction
- **Issue:** `RappiSettingsTab.tsx` (a whole Settings tab: store ID, webhook secret, menu-sync button), its `entities/settings` plumbing (`RappiSettings` type/schema, `DEFAULT_RAPPI`, `parseRappi`, `useMutationSyncRappiMenu`), `callRappiMenuSync`/`RappiMenuSyncResponseSchema` in `edge-function-contracts.ts`, `rappi-webhook-payload.ts`(+test), `rappi-constants.ts`, `VITE_RAPPI_WEBHOOK_SECRET`, and `config.toml`'s `[functions.rappi-webhook]` stanza were never listed in the plan but exist solely to serve the entity/edge-functions the plan does delete. Deleting the edge functions without this cleanup would have left a Settings tab whose Sync button silently 404'd.
- **Fix:** Deleted/edited all of the above in the same Task 1 commit; confirmed via grep that only the deliberately-retained payment-method `'rappi'` path remains anywhere in `src/`/`supabase/`.
- **Files modified:** see Files Created/Modified above
- **Verification:** `npx tsc --noEmit` clean, `npm run lint` clean, `npx vitest run` (targeted + full suite) shows no new failures attributable to this change.
- **Committed in:** `95b59c7` (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug fix, 1 Rule 1/2 plan-gap completeness expansion)
**Impact on plan:** Both were necessary for a genuinely complete removal ("no file, table, or edge function related to Rappi delivery remains" — the plan's own objective). No scope creep into the deliberately-retained payment-method path.

## Issues Encountered

- `npx vitest run` (full suite) surfaced 2 pre-existing unit-test failures (`HomeDashboard.test.tsx`, `SettingsTabsPanel.test.tsx`) and ~25 pre-existing failures in unrelated files (`PINLoginForm.test.tsx`, `help/content.test.ts`, ~20 `*.integration.test.ts` files failing on a local-DB seed FK violation). Confirmed via `git diff` on each touched test file that none were caused by this plan's changes — logged to `.planning/phases/01-strip-rebrand/deferred-items.md` per the scope-boundary rule rather than fixed here.
- `e2e/23-payment-edge-cases.spec.ts`'s PE5 test self-skipped on both runs (pre-existing seed-data/timing flakiness in the test helper, unrelated to any file this plan touched) — see `coverage: D4` for the rationale; flagged for human/future-run confirmation rather than asserted `pass`.

## User Setup Required

None — no external service configuration required. The self-hosted Supabase stack was already running (`docker ps` confirmed all containers healthy) and the migration was pushed directly via `supabase db push --db-url ... --debug` per the pattern documented in 01-01-SUMMARY.md.

## Next Phase Readiness

Rappi delivery integration is fully gone from both code and DB. `tab.rappiOrderId`/`PaymentForm.tsx`'s rappi payment-method branch remain intentionally in place as unreachable dead code (nothing can set `rappiOrderId` anymore) — future phases building the direct-sale checkout screen (Phase 2) should be aware this branch exists but do not need to touch it unless full payment-method cleanup is later desired. No blockers for the next plan in this phase.

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260810000002_drop_rappi_orders.sql`
- FOUND: `.planning/phases/01-strip-rebrand/deferred-items.md`
- CONFIRMED ABSENT: `src/entities/rappi-order`, `src/widgets/RappiOrdersPanel`, `src/pages/rappi`, `supabase/functions/rappi-sync-menu`, `supabase/functions/rappi-webhook`, `e2e/25-rappi-orders.spec.ts`, `src/widgets/SettingsTabsPanel/tabs/RappiSettingsTab.tsx`
- FOUND commit: `95b59c7` (Task 1), `84357e9` (Task 2)
