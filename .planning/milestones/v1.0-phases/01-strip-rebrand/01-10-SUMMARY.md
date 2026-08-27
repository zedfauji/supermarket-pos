---
phase: 01-strip-rebrand
plan: 10
subsystem: database
tags: [promotions, i18n, postgres, rls, plpgsql, order-creation-rpc]

# Dependency graph
requires:
  - phase: 01-strip-rebrand (Plan 04)
    provides: Settings-tab registration and SettingsTabsPanel import for the promotions tab already severed
  - phase: 01-strip-rebrand (Plan 06)
    provides: "pool-promotions-rpc.integration.test.ts's expected same-wave failure (documented in 01-06-SUMMARY.md and this plan's own deferred-items.md entry), resolved by this plan's wholesale deletion of entities/promotion"
provides:
  - Promotions/happy-hour discount engine removed end-to-end — code (promotion entity, manage-promotions feature, HappyHourBanner, its ProductGrid.tsx consumer) and database (promotions/promotion_availability/applied_promotions tables, evaluate_promotions_for_item/is_promotion_available functions)
  - public.create_order_with_items (the KEPT, generic, payment-critical order-creation RPC) redefined without its promotion-evaluation loop — every add-item-to-tab call would otherwise have hard-failed once evaluate_promotions_for_item was dropped
affects: [Phase 1 Plan 13 (final sweep) — products.happyHourPrice field/i18n keys, domain.ts Promotion*/AppliedPromotion* schemas, and shared/lib/promotion-pricing.ts (now zero-consumer dead code) all deliberately deferred here]

# Actuals (#2632)
actuals:
  tokens: 44900
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Before dropping a function that a KEPT RPC calls via PERFORM, grep pg_proc's prosrc against the LIVE database (not just migration files) for the function name — plpgsql function bodies are opaque text at CREATE time, so DROP FUNCTION ... CASCADE does NOT cascade into a plpgsql caller's PERFORM statement the way it cascades into view/column dependents. This is the same class of miss 01-06-SUMMARY.md documented for process_payment_atomic's pool_sessions guard, now confirmed as a repeating pattern in this codebase's RPC layer."
    - "A rolled-back live DO-block call to the redefined RPC (INSERT test row -> CALL RPC -> RAISE EXCEPTION to force ROLLBACK) is a fast, debris-free way to smoke-test a payment-critical RPC redefinition against the live self-hosted stack without needing a UI path or committing test data."

key-files:
  created:
    - supabase/migrations/20260810000008_drop_promotions.sql
  modified:
    - src/widgets/OrderPanel/ProductGrid.tsx
    - src/shared/lib/i18n/locales/en-US/entities.json
    - src/shared/lib/i18n/locales/en-US/featMgmt.json
    - src/shared/lib/i18n/locales/en-US/settings.json
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/entities.json
    - src/shared/lib/i18n/locales/es-MX/featMgmt.json
    - src/shared/lib/i18n/locales/es-MX/settings.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "Redefined public.create_order_with_items via CREATE OR REPLACE (byte-for-byte identical body minus the promotion-evaluation loop, pulled via pg_get_functiondef immediately before authoring) BEFORE the DROP FUNCTION statements — a live pg_proc query surfaced that this KEPT, generic, payment-critical RPC unconditionally PERFORMed evaluate_promotions_for_item() for every inserted order item. Without this fix every real order-add (add-item-to-tab) would have failed at runtime the moment this migration's DROP FUNCTION lines ran, exactly the class of break 01-06-SUMMARY.md documented for process_payment_atomic/process_split_payment_atomic."
  - "Also dropped promotion_availability — a real table with an FK into promotions, not separately named in this plan's files_modified/must_haves. Same class of miss as 01-06's resource_transfers finding: RESEARCH.md's SQL removal table named only promotions/applied_promotions."
  - "Pruned the promotions/happy-hour-banner i18n namespaces (entities.promotion, wPanels.happyHourBanner, featMgmt.managePromotions, settings.tabs.promotions) from both locale catalogs per D-22 — each had zero remaining consumers after this plan's code deletion, confirmed via grep before removal."
  - "Left products.happyHourPrice (the field, its i18n keys in entities.json's cartItem namespace and receipt.json, and its CartItem.tsx/receipt-format.ts/ProductForm.tsx consumers), domain.ts's Promotion*/AppliedPromotion* Zod schemas, and shared/lib/promotion-pricing.ts untouched — all still compile cleanly, are a separate concern from the promotion entity/feature this plan's files_modified scoped to, and match 01-09's established precedent of deferring dormant-field/domain.ts cleanup to Plan 01-13's final sweep rather than preempting it here."
  - "Verified the create_order_with_items redefinition against the live DB with a rolled-back DO-block smoke test (insert a real tab row, call the RPC, assert the returned item's unit_price is exactly the client-supplied value with no server-side rewrite, then RAISE EXCEPTION to force ROLLBACK) rather than through e2e/03-tab-order.spec.ts — that spec's /pos route was already severed by Plan 01-04 (confirmed absent from router.tsx; the catch-all route redirects it to /home), a pre-existing, unrelated condition, not something this plan introduced or needs to fix."

requirements-completed: []

coverage:
  - id: D1
    description: "Promotions entity/feature/HappyHourBanner/ProductGrid.tsx consumer deleted; e2e/43-promotions.spec.ts deleted; orphaned i18n namespaces pruned; npx tsc --noEmit and npm run lint clean"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "npx eslint src/ --max-warnings 0"
        status: pass
      - kind: other
        ref: "test ! -d src/entities/promotion && test ! -d src/features/manage-promotions && test ! -f src/widgets/OrderPanel/HappyHourBanner.tsx && test ! -f e2e/43-promotions.spec.ts && ! grep -rq '@entities/promotion|useActivePromotions|HappyHourBanner' src/"
        status: pass
    human_judgment: false
  - id: D2
    description: "promotions, applied_promotions, promotion_availability tables and evaluate_promotions_for_item/is_promotion_available functions dropped from the self-hosted project; create_order_with_items redefined without its promotion-evaluation loop so real order-adds keep working"
    verification:
      - kind: other
        ref: "supabase db push --db-url ... --debug (applied cleanly, tracked in supabase_migrations.schema_migrations as 20260810000008)"
        status: pass
      - kind: other
        ref: "psql: SELECT table_name FROM information_schema.tables WHERE table_name IN ('promotions','applied_promotions','promotion_availability') — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosrc ILIKE '%PERFORM evaluate_promotions%' — 0 rows"
        status: pass
      - kind: other
        ref: "psql rolled-back DO-block: create_order_with_items(real tab, real product, unit_price=5.00) returns the item at unit_price=5.00 with no error; ROLLBACK confirmed via post-check row count = 0"
        status: pass
      - kind: unit
        ref: "npx vitest run — 1283 passed, 37 failed (all matching the pre-existing shifts_staff_id_fkey/process-refund baseline documented in deferred-items.md; 0 new failures)"
        status: pass
    human_judgment: false

# Metrics
duration: 55min
completed: 2026-08-10
status: complete
---

# Phase 01 Plan 10: Promotions/Happy-Hour Discount Engine Removal Summary

**Promotions/happy-hour discount engine removed end-to-end — code (promotion entity, manage-promotions feature, HappyHourBanner, its live ProductGrid.tsx consumer) and database (promotions/promotion_availability/applied_promotions tables, evaluate_promotions_for_item/is_promotion_available functions) — with public.create_order_with_items redefined first to drop its unconditional promotion-evaluation call, the payment-critical fallout catch this plan's own objective flagged as a risk.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2
- **Files modified:** 27 across 2 commits (17 deleted, 9 modified, 1 new SQL migration created)

## Accomplishments

- Deleted the `promotion` entity (7 files, including its already-failing `pool-promotions-rpc.integration.test.ts` flagged as expected same-wave fallout by 01-06-SUMMARY.md) and the `manage-promotions` feature (6 files) wholesale.
- Removed the live `useActivePromotions()`/`<HappyHourBanner>` consumer from `ProductGrid.tsx` — part of the retained, Phase-2-critical `OrderPanel` widget — and deleted `HappyHourBanner.tsx`/`.test.tsx` and `e2e/43-promotions.spec.ts`.
- Pruned 4 orphaned i18n namespaces (`entities.promotion`, `wPanels.happyHourBanner`, `featMgmt.managePromotions`, `settings.tabs.promotions`) from both locale catalogs after confirming zero remaining consumers.
- Authored and pushed a new forward DROP migration against the self-hosted project: `applied_promotions` → `promotion_availability` → `promotions` (CASCADE, FK-dependency order) and both promotion-evaluation functions — after first redefining `create_order_with_items` (the KEPT, generic, payment-critical order-creation RPC) via `CREATE OR REPLACE` to drop its unconditional `PERFORM evaluate_promotions_for_item(...)` loop, a critical fallout catch found via live `pg_proc` introspection before authoring the migration, matching this phase's documented `pool_tables->resources` fragility precedent and 01-06's payment-RPC finding.
- Verified the redefinition with a rolled-back live DO-block call (insert a real tab, call the RPC, confirm the item comes back at exactly its client-supplied `unit_price`, force `ROLLBACK`) since the UI path (`e2e/03-tab-order.spec.ts`) was unusable — `/pos` was already severed from `router.tsx` in Plan 01-04, a pre-existing, unrelated condition.

## Task Commits

1. **Task 1: Delete promotions entity/feature, remove its consumer in ProductGrid.tsx, delete its E2E spec** - `5817d0d` (feat)
2. **Task 2: [BLOCKING] Drop promotions, applied_promotions, promotion_availability, and their RPCs, push to the new project** - `c65cd75` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `supabase/migrations/20260810000008_drop_promotions.sql` - forward DROP migration (create_order_with_items redefinition → DROP FUNCTION evaluate_promotions_for_item/is_promotion_available → DROP TABLE applied_promotions/promotion_availability/promotions CASCADE), with a commented shape-only DOWN block
- `src/widgets/OrderPanel/ProductGrid.tsx` - removed the `useActivePromotions` import/call and `<HappyHourBanner>` render; removed two now-stale comments referencing the dropped `evaluate_promotions_for_item` function
- 8 i18n locale JSON files (en-US/es-MX × entities/featMgmt/settings/wPanels) - removed the 4 orphaned promotion/happy-hour-banner namespaces per D-22

## Decisions Made

See `key-decisions` in frontmatter. In short: the plan's own objective flagged `ProductGrid.tsx`'s live consumer as a known hidden dependency, and live-DB introspection (per the phase's prior-wave learnings) surfaced a second, more severe one — `create_order_with_items` itself, not just a UI widget, unconditionally called the function this plan drops. That redefinition was necessary for correctness (Rule 1 — every checkout add-item would otherwise break) and was applied before the DROP statements in the same migration transaction. `promotion_availability` was added to the DROP list as a Rule 2 fix (missing critical — the plan's own files_modified list only named `promotions`/`applied_promotions`). Cleanup of `products.happyHourPrice` and `domain.ts`'s `Promotion*` schemas was deliberately left out of scope, matching 01-09's precedent of deferring dormant-field/domain.ts cleanup to Plan 01-13.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `create_order_with_items` would break every real order-add**
- **Found during:** Task 2, live `pg_proc` query for `promotion`-referencing functions before authoring the DROP migration
- **Issue:** The KEPT, generic, payment-critical `create_order_with_items` RPC (every `add-item-to-tab` call goes through it) unconditionally `PERFORM`s `evaluate_promotions_for_item()` for every inserted order item. A plain `DROP FUNCTION ... CASCADE` does not cascade into this plpgsql call site — dropping the function without redefining the caller first would have broken every real order-add on the new project the moment the migration landed.
- **Fix:** `CREATE OR REPLACE FUNCTION create_order_with_items` (pulled via `pg_get_functiondef` immediately before authoring, so the rest is byte-for-byte identical), dropping only the promotion-evaluation loop, applied before the `DROP FUNCTION`/`DROP TABLE` statements in the same migration transaction.
- **Files modified:** `supabase/migrations/20260810000008_drop_promotions.sql`
- **Verification:** Post-push `pg_proc` query confirms zero `PERFORM evaluate_promotions%` references remain in `create_order_with_items`'s body; a rolled-back live DO-block call confirms the function still succeeds and returns the item at exactly its client-supplied `unit_price`.
- **Committed in:** `c65cd75` (Task 2 commit)

**2. [Rule 2 - Missing critical] `promotion_availability` table not named by this plan's files_modified**
- **Found during:** Task 2, live FK-dependency query against `promotions`
- **Issue:** `promotion_availability` is a real table with an FK into `promotions` (used by the now-deleted `usePromotionAvailabilityWindows` hook); the plan's `must_haves.artifacts` and `<action>` text named only `promotions`/`applied_promotions`.
- **Fix:** Added an explicit `DROP TABLE IF EXISTS promotion_availability CASCADE;` between `applied_promotions` and `promotions` in FK-dependency order.
- **Files modified:** `supabase/migrations/20260810000008_drop_promotions.sql`
- **Verification:** `information_schema.tables` query confirms `promotion_availability` is gone.
- **Committed in:** `c65cd75` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 - bug, 1 Rule 2 - missing critical)
**Impact on plan:** Both fixes were necessary for correctness — the `create_order_with_items` fix would otherwise have broken live, generic, KEPT, payment-critical functionality (every order-add) unrelated to promotions on their face. No scope creep beyond what the drop directly required; `products.happyHourPrice`/`domain.ts`'s `Promotion*` schemas/`shared/lib/promotion-pricing.ts` were left untouched as documented, deliberate deferrals to Plan 01-13.

## Issues Encountered

- `e2e/03-tab-order.spec.ts` (the obvious candidate for verifying `create_order_with_items` end-to-end) could not be used — all 9 of its tests fail identically at a `getByRole('button', { name: /new tab/i })` timeout because `/pos` redirects to `/home` via the catch-all route. Confirmed via direct `router.tsx` inspection that `/pos` was already absent (severed in Plan 01-04, pending Phase 2's rebuilt direct-sale checkout per `STATE.md`'s documented blocker) — pre-existing and unrelated to this plan. Verified the RPC directly against the live DB instead (see key-decisions).
- The plan's Task 2 `<action>` text referred to the functions to drop as "`evaluate_promotions_rpc`" and "`is_promotion_available_fn`" — these are migration filenames, not the actual function names (`evaluate_promotions_for_item` and `is_promotion_available`). Confirmed the correct names via live `pg_proc` introspection before authoring the migration; no functional ambiguity once verified against the live schema.

## User Setup Required

None - no external service configuration required. The self-hosted Supabase stack was already running (all 12 containers healthy) and the migration was pushed directly via `supabase db push --db-url ... --debug`.

## Next Phase Readiness

- Promotions/happy-hour discount engine is fully gone from code and the database; `npx tsc --noEmit`, `npm run lint`, and `npx vitest run` all pass clean with zero new failures beyond the documented pre-existing baseline.
- Plan 01-13 (final sweep) still owns pruning `products.happyHourPrice` (the field, its `entities.json`/`receipt.json` i18n keys, and its `CartItem.tsx`/`ProductForm.tsx`/`receipt-format.ts` consumers), `domain.ts`'s now-unused `PromotionDiscountTypeSchema`/`PromotionTargetTypeSchema`/`PromotionSchema`/`AppliedPromotionSchema` exports, and `shared/lib/promotion-pricing.ts` (now zero-consumer dead code outside its own test) — none of these were touched here since they were explicitly deferred and have zero broken imports today.
- `src/shared/lib/supabase.types.ts` still references the dropped `promotions`/`applied_promotions`/`promotion_availability` tables (generated types are stale) — regeneration (`npx supabase gen types typescript`) was not run in this plan, consistent with 01-06/01-09's precedent of not touching this generated file mid-phase.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260810000008_drop_promotions.sql`
- FOUND: `src/entities/promotion` deleted (directory absent)
- FOUND: `src/features/manage-promotions` deleted (directory absent)
- FOUND: `.planning/phases/01-strip-rebrand/01-10-SUMMARY.md`
- FOUND: commit `5817d0d` (Task 1)
- FOUND: commit `c65cd75` (Task 2)
- All self-check assertions re-verified via shell commands after SUMMARY.md creation — all passed.

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*
