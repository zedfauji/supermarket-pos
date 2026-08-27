---
phase: 01-strip-rebrand
plan: 09
subsystem: database
tags: [supabase, postgres, plpgsql, react, typescript, i18n, fsd]

# Dependency graph
requires:
  - phase: 01-strip-rebrand (Plan 04)
    provides: routes/nav tiles/Settings tabs already severed from combo/recipe/ingredient/modifier-rule UI entry points
  - phase: 01-strip-rebrand (Plan 07)
    provides: KDS/prep removal deliberately left recipes.prep_ingredient_id untouched, explicitly deferred to this plan
provides:
  - Combo, recipe, ingredient-costing, and modifier-inventory-rule depletion removed end-to-end — 4 entities, 6 features, 5 widgets, 4 E2E specs, 1 orphaned integration test in code; combo schema (3 tables, 2 trigger functions, 1 RPC, 1 availability function, 2 reporting views), modifier_inventory_rules, recipes (+recipe_items+prep_ingredient_id), ingredients, and the orphaned ingredient-exclusive record_stock_movement RPC in the database
  - deplete_for_order_item v6 — plain-product resolution and open-unit depletion preserved verbatim, recipe-loop and modifier-rule-loop branches removed
affects: [Phase 1 Plan 13 (final sweep) — owns domain.ts Zod schema removal for Combo*/Recipe*/Ingredient*/ModifierInventoryRule* families and the now-dead useComboMixReport/useComboOverrides hooks + export-report combo/recipe branches this plan deliberately left untouched, Phase 2 (checkout rebuild) — deplete_for_order_item v6's open-unit branch and CHK-05's dependency on it are unaffected]

# Actuals (#2632)
actuals:
  tokens: 98122
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live pg_proc/pg_views introspection (ILIKE sweep across all function/view source) before authoring a DROP migration catches load-bearing generic RPCs with dormant domain-specific branches — evaluate_promotions_for_item, process_payment_atomic, and every split_tab_by_* function read products.is_combo/order_items.parent_order_item_id/combo_slot_id; deliberately NOT dropping those 5 columns (left permanently dormant instead) avoided rewriting 6 payment-critical RPCs that were entirely out of this plan's scope"
    - "DROP TABLE ... CASCADE only drops FK *constraints* on referencing tables, not the referencing tables themselves — recipe_items survived both `DROP TABLE recipes CASCADE` and `DROP TABLE ingredients CASCADE` and needed its own explicit DROP, caught only by post-push information_schema verification, not by reading the CASCADE notice alone"
    - "A migration-filename-based deletion plan can encode a wrong table name — `20260424000004_product_combo_flags.sql` never created a `product_combo_flags` table, it ALTERed columns directly onto `products`; verified against information_schema before writing the DROP statement instead of trusting the filename"
    - "A DROP FUNCTION signature must match the function's CURRENT live signature, not its original CREATE migration — record_stock_movement gained a trailing p_terminal_id param in a later migration (20260703000002) that wasn't in this plan's read_first list; the first DROP FUNCTION attempt silently no-opped under IF EXISTS and was only caught by post-push pg_proc verification"

key-files:
  created:
    - supabase/migrations/20260810000006_drop_combos_recipes_ingredients_modifier_rules.sql
    - supabase/migrations/20260810000007_deplete_for_order_item_v6.sql
  modified:
    - src/widgets/OrderPanel/ProductGrid.tsx
    - src/features/manage-products/ui/CatalogProductsTab.tsx
    - src/features/manage-products/ui/CatalogModifiersTab.tsx
    - src/shared/ui/index.ts

key-decisions:
  - "Deleted 6 orphaned fallout files/dirs beyond the plan's own <files> list, all with zero remaining consumers as a DIRECT consequence of this plan's deletions: src/features/adjust-stock-movement/ + src/widgets/StockMovementsList/ (only consumer was the deleted ManageIngredientsTab), src/shared/ui/ComboBadge.tsx + ComboUnavailableBadge.tsx + ComboSlotCard/ (only consumer was ProductGrid's combo branch, removed) + IngredientAutocomplete/ (only consumers were the deleted manage-recipe/manage-modifier-inventory-rules features) — same class of fix as 01-07's orphaned-route-file precedent"
  - "Surgically removed combo/recipe/modifier-rule code from 3 consumer files NOT in the plan's <files> list that had broken imports after Task 1's deletions (Rule 3): ProductGrid.tsx (combo routing/availability/badges), CatalogProductsTab.tsx (recipe tab), CatalogModifiersTab.tsx (modifier-ingredient-rules dialog) — all verified via tsc --noEmit"
  - "Deliberately did NOT touch domain.ts Zod schemas (ComboSlot*/Ingredient*/Recipe*/ModifierInventoryRule*/StockMovementReason families), entities/tab/model/queries-reports.ts's useComboMixReport/useComboOverrides hooks, or export-report's combo/recipe branches (useExportReport.ts, ExportButtons.tsx, exporters/excel.ts, exporters/pdf.tsx) — confirmed via 01-13-PLAN.md's own file inventory that Plan 01-13 explicitly owns this domain.ts sweep; touching it here would duplicate that plan's work and risk conflicting edits"
  - "Deliberately did NOT drop products.is_combo/combo_eligible/combo_price_override or order_items.parent_order_item_id/combo_slot_id columns, despite the plan's action text implying a full combo-column purge — live pg_proc introspection showed evaluate_promotions_for_item (combo-exclusion branch) and every split_tab_by_*/process_payment_atomic function read these columns; rewriting 6 payment-critical RPCs to accommodate the drop is a materially different, higher-risk change than this strip-rebrand plan's scope. Left permanently dormant instead (nothing can set is_combo=true or a non-null combo_slot_id again once add_combo_to_tab is gone) — inert, not broken"
  - "Fixed the plan's own DROP-statement bug rather than following it literally: `product_combo_flags` was never a real table (confirmed via information_schema before writing the migration) — the migration adds columns to `products` directly instead, which are the 5 columns deliberately left in place per the decision above"
  - "record_stock_movement RPC dropped as ingredient-exclusive orphaned fallout (hard-coded against the `ingredients` table, zero remaining callers after this plan's Task 1 client deletion + Task 2's deplete_for_order_item v6 rewrite) — the generic, shared `stock_movements` table itself and its other 3 callers (decrement_inventory_on_order_item, edit_paid_tab, restore_inventory_on_order_item_delete) are untouched"
  - "Deleted src/entities/tab/model/depletion.integration.test.ts (I1-I7) as fallout after a full `npx vitest run` post-push — every test in the file exercised deplete_for_order_item's recipe-loop or modifier-rule-loop, both removed by v6; this is the same class of 'test for removed functionality' as the plan's 4 named E2E specs, just a Vitest integration test the plan's file list missed"

requirements-completed: []

coverage:
  - id: D1
    description: "combo, recipe, ingredient, and modifier-inventory-rule entities/features/widgets/E2E-specs deleted from code; 6 orphaned fallout files (adjust-stock-movement, StockMovementsList, ComboBadge/ComboUnavailableBadge/ComboSlotCard, IngredientAutocomplete) and 1 orphaned integration test deleted; 3 consumer files (ProductGrid, CatalogProductsTab, CatalogModifiersTab) surgically fixed; ModifierPopularityReport confirmed untouched"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "npm run lint (eslint src --max-warnings 0)"
        status: pass
      - kind: other
        ref: "test ! -d src/entities/combo && test ! -d src/entities/recipe && test ! -d src/entities/ingredient && test ! -d src/entities/modifier-inventory-rule && test -d src/widgets/ModifierPopularityReport && test ! -f e2e/32-combos.spec.ts && test ! -f e2e/24-modifier-inventory-rules.spec.ts"
        status: pass
      - kind: unit
        ref: "npx vitest run — 22 failed files / 1306 passed (byte-identical to the documented pre-existing baseline in deferred-items.md; 0 new failures after deleting depletion.integration.test.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "combo/recipe/ingredient/modifier_inventory_rules schema (tables, trigger functions, views, RPCs) dropped from the self-hosted project; deplete_for_order_item rewritten as v6 with recipe/modifier branches removed and open-unit + plain-product resolution preserved verbatim; get_modifier_popularity_report confirmed untouched"
    verification:
      - kind: other
        ref: "supabase db push --db-url ... (both migrations applied; live psql confirmed via supabase_migrations.schema_migrations)"
        status: pass
      - kind: other
        ref: "psql: SELECT table_name FROM information_schema.tables WHERE table_name IN ('product_combo_flags','combo_slots','combo_slot_options','combo_availability','modifier_inventory_rules','recipes','recipe_items','ingredients') — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT viewname FROM pg_views WHERE viewname IN ('product_combo_usage','combo_mix_daily','recipe_variance_daily') — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT proname FROM pg_proc WHERE proname IN ('add_combo_to_tab','is_combo_available','check_combo_slot_option_not_nested','check_combo_slot_option_eligible','record_stock_movement','update_recipes_updated_at') — 0 rows; SELECT proname FROM pg_proc WHERE proname='get_modifier_popularity_report' — 1 row (preserved)"
        status: pass
      - kind: other
        ref: "psql: pg_get_functiondef(deplete_for_order_item) contains 'consume_open_unit' and zero references to recipes/recipe_items/modifier_inventory_rules"
        status: pass
    human_judgment: false

# Metrics
duration: ~50min
completed: 2026-08-10
status: complete
---

# Phase 01 Plan 09: Combo/Recipe/Ingredient/Modifier-Rule Removal Summary

**Combos, recipe-based ingredient costing, and modifier-inventory depletion removed end-to-end — 4 entities, 6 features, 5 widgets, and a from-scratch `deplete_for_order_item` v6 rewrite that keeps plain-product and open-unit depletion while dropping the recipe/modifier-rule branches, with 6 additional orphaned fallout files and a stale integration test found and removed along the way.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2 (both completed)
- **Files modified:** 78 in Task 1's commit, 2 in Task 2's schema commit, 1 in the test-fallout commit

## Accomplishments

- Deleted `src/entities/combo/`, `src/entities/recipe/`, `src/entities/ingredient/`, `src/entities/modifier-inventory-rule/`; `src/features/add-combo-to-tab/`, `manage-combos/`, `manage-recipe/`, `import-ingredients-csv/`, `manage-ingredients/`, `manage-modifier-inventory-rules/`; `src/widgets/ComboMixReport/`, `ComboOverrideReport/`, `RecipeVarianceReport/`, `IngredientsTable/`, `ManageIngredientsTab/`; and the 4 named E2E specs.
- Confirmed `ModifierPopularityReport`/`get_modifier_popularity_report` are generic (join `modifiers`/`order_items`/`orders`, never `modifier_inventory_rules`) and left both completely untouched.
- Found and fixed 3 consumer files with broken imports after Task 1's deletions: `ProductGrid.tsx` (removed combo routing, availability check, unavailable-combo dialog, manager-PIN override, `ComboAwareProductCard`), `CatalogProductsTab.tsx` (removed the "Recipe" tab, simplified back to a single `ProductForm`), `CatalogModifiersTab.tsx` (removed the ingredient-rules dialog button).
- Found and deleted 6 further orphaned files/dirs whose only consumers were removed above: `adjust-stock-movement` feature + `StockMovementsList` widget (ManageIngredientsTab was their only caller), `ComboBadge`/`ComboUnavailableBadge`/`ComboSlotCard`/`IngredientAutocomplete` shared/ui components.
- Removed combo/recipe/ingredient/modifier-inventory-rule i18n keys from both locales (D-22), keeping every `modifierPopularity`/`modifierGroup` key untouched.
- Ran a live `pg_proc`/`pg_views` introspection sweep against the self-hosted DB before authoring the DROP migration (per prior-wave learnings) — found the plan's literal `product_combo_flags` table name was wrong (it's `products` columns, not a table), found `evaluate_promotions_for_item`/`process_payment_atomic`/`split_tab_by_*` read the combo columns being considered for removal, and confirmed the exact 3-table + 2-view + 4-function combo/modifier-rule blast radius before writing any DDL.
- Authored and pushed `20260810000006_drop_combos_recipes_ingredients_modifier_rules.sql`: drops `combo_slots`/`combo_slot_options`/`combo_availability`, their 2 trigger functions, `add_combo_to_tab`, `is_combo_available`, `product_combo_usage` + `combo_mix_daily` views, `modifier_inventory_rules`, the orphaned `record_stock_movement` RPC, `recipes` (+`recipe_items`+`prep_ingredient_id` — resolves 01-07's deferred cleanup), and `ingredients` (+`recipe_variance_daily` view via CASCADE).
- Authored and pushed `20260810000007_deplete_for_order_item_v6.sql`: starts from v5's body, removes the recipe-loop and modifier-inventory-rule-loop entirely, keeps order-item resolution and the open-unit branch (`consume_open_unit`) verbatim.
- Caught and fixed 2 live-signature bugs in the first migration attempt via post-push `information_schema`/`pg_proc` verification: `record_stock_movement`'s DROP FUNCTION was missing a trailing `p_terminal_id` param added by a later migration, and `recipe_items` needed its own explicit DROP (CASCADE only drops FK constraints on referencing tables, not the tables themselves) — both fixed in the same uncommitted migration file before it was ever committed.
- Ran a full `npx vitest run` after the DB push and found one more piece of fallout: `depletion.integration.test.ts` (I1-I7) tested only recipe/modifier-rule depletion behavior and was deleted, restoring the exact 22-failed-file pre-existing baseline documented in `deferred-items.md`.

## Task Commits

1. **Task 1: Delete combo/recipe/ingredient/modifier-rule entities/features/widgets and their E2E specs** - `1882167` (feat)
2. **Task 2: Drop combo/recipe/ingredient/modifier-rule SQL schema and rewrite deplete_for_order_item as v6** - `0fdbad2` (feat)
3. **Task 2 fallout: delete depletion integration test for removed functionality** - `2850288` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `supabase/migrations/20260810000006_drop_combos_recipes_ingredients_modifier_rules.sql` - forward DROP migration for the entire combo/recipe/ingredient/modifier-inventory-rule schema
- `supabase/migrations/20260810000007_deplete_for_order_item_v6.sql` - `deplete_for_order_item` rewritten to drop recipe/modifier-rule branches, keep plain-product + open-unit depletion
- `src/widgets/OrderPanel/ProductGrid.tsx` - removed combo routing/availability/badges (fallout fix)
- `src/features/manage-products/ui/CatalogProductsTab.tsx` - removed the Recipe tab (fallout fix)
- `src/features/manage-products/ui/CatalogModifiersTab.tsx` - removed the ingredient-rules dialog (fallout fix)
- `src/shared/ui/index.ts` - removed the `IngredientAutocomplete` barrel export
- (Task 1) 15 entity/feature/widget dirs + 4 E2E specs + 6 orphaned fallout files/dirs deleted wholesale; combo/recipe/ingredient/modifier-inventory-rule i18n keys removed from both locales
- (fallout commit) `src/entities/tab/model/depletion.integration.test.ts` - deleted, tested only removed recipe/modifier-rule depletion behavior

## Decisions Made

See `key-decisions` in frontmatter. In short: fixed every genuine compile/runtime blocker caused directly by this plan's own deletions (3 consumer files, 6 orphaned shared files, 1 stale integration test, 2 live-signature bugs in the migration itself), while deliberately staying out of two adjacent but out-of-scope areas — domain.ts Zod schema cleanup (explicitly owned by 01-13's own file inventory) and the 5 dormant combo columns on `products`/`order_items` (touching them would require rewriting 6 payment-critical RPCs, a materially different and far riskier change than this plan's scope).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 3 consumer files had broken imports after Task 1's deletions**
- **Found during:** Task 1, pre-deletion grep sweep for external consumers of the deleted directories
- **Issue:** `ProductGrid.tsx`, `CatalogProductsTab.tsx`, `CatalogModifiersTab.tsx` imported from `@entities/combo`, `@features/add-combo-to-tab`, `@features/manage-recipe`, `@features/manage-modifier-inventory-rules` — none were in the plan's `<files>` list
- **Fix:** Surgically removed only the combo/recipe/modifier-rule-specific code paths from each file, keeping all other functionality
- **Files modified:** `src/widgets/OrderPanel/ProductGrid.tsx`, `src/features/manage-products/ui/CatalogProductsTab.tsx`, `src/features/manage-products/ui/CatalogModifiersTab.tsx`
- **Verification:** `npx tsc --noEmit` clean, `npm run lint` clean
- **Committed in:** `1882167` (Task 1 commit)

**2. [Rule 2 - Missing critical] 6 orphaned shared/ui and feature files with zero remaining consumers**
- **Found during:** Task 1, post-fix grep sweep for direct-path imports (not caught by the barrel-export check)
- **Issue:** `adjust-stock-movement` feature + `StockMovementsList` widget (only consumer: deleted `ManageIngredientsTab`); `ComboBadge`/`ComboUnavailableBadge`/`ComboSlotCard`/`IngredientAutocomplete` (only consumers: `ProductGrid`'s removed combo branch and the deleted `manage-recipe`/`manage-modifier-inventory-rules` features)
- **Fix:** `git rm` all 6, plus removed the `IngredientAutocomplete` barrel export from `src/shared/ui/index.ts`
- **Files modified:** see key-files
- **Verification:** grep confirmed zero remaining importers before deletion; `npx tsc --noEmit` clean after
- **Committed in:** `1882167` (Task 1 commit)

**3. [Rule 1 - Bug] Plan's literal DROP TABLE statement targeted a nonexistent table**
- **Found during:** Task 2, live `information_schema` check before authoring the migration
- **Issue:** The plan's action text said `DROP TABLE IF EXISTS product_combo_flags CASCADE;`, but `product_combo_flags` was never a table — `20260424000004_product_combo_flags.sql` adds `combo_eligible`/`is_combo` columns directly to `products`
- **Fix:** Did not write that statement; instead made the deliberate decision (see key-decisions) to leave those product/order_items combo columns in place entirely, since dropping them would require rewriting 6 payment-critical RPCs found via live introspection
- **Verification:** `information_schema.tables` query confirmed no such table exists, before and after
- **Committed in:** `0fdbad2` (Task 2 commit)

**4. [Rule 1 - Bug] record_stock_movement DROP FUNCTION signature mismatch**
- **Found during:** Task 2, post-push `pg_proc` verification
- **Issue:** First DROP attempt used the original 6-arg signature from `20260426000003`; the live function has a 7th `p_terminal_id` arg added by `20260703000002_wire_transfer_tab_stock_movement_audit.sql`, so `DROP FUNCTION IF EXISTS` silently no-opped
- **Fix:** Corrected the migration file to the live 7-arg signature before committing; manually applied the corrective DROP against the already-pushed DB to reconcile state
- **Files modified:** `supabase/migrations/20260810000006_drop_combos_recipes_ingredients_modifier_rules.sql`
- **Verification:** `pg_proc` query confirmed zero rows for `record_stock_movement` after
- **Committed in:** `0fdbad2` (Task 2 commit, fixed before commit — never shipped the buggy version)

**5. [Rule 1 - Bug] recipe_items table survived two CASCADE drops**
- **Found during:** Task 2, post-push `information_schema` verification
- **Issue:** `DROP TABLE recipes CASCADE` and `DROP TABLE ingredients CASCADE` both only drop the FK *constraint* on `recipe_items`, not the `recipe_items` table itself — it remained live after both statements ran
- **Fix:** Added an explicit `DROP TABLE IF EXISTS recipe_items CASCADE;` to the migration file; manually applied against the already-pushed DB
- **Files modified:** `supabase/migrations/20260810000006_drop_combos_recipes_ingredients_modifier_rules.sql`
- **Verification:** `information_schema.tables` query confirmed `recipe_items` gone after
- **Committed in:** `0fdbad2` (Task 2 commit, fixed before commit)

**6. [Rule 1 - Bug] Stale integration test for removed functionality**
- **Found during:** Post-Task-2 full `npx vitest run`
- **Issue:** `src/entities/tab/model/depletion.integration.test.ts` (7 tests) exclusively exercised `deplete_for_order_item`'s recipe-loop and modifier-rule-loop, both removed by v6 — it was the only file to regress against the documented pre-existing failure baseline
- **Fix:** `git rm` the file
- **Files modified:** `src/entities/tab/model/depletion.integration.test.ts`
- **Verification:** re-ran `npx vitest run`, confirmed 22 failed files / 1306 passed — byte-identical to the pre-existing baseline
- **Committed in:** `2850288`

---

**Total deviations:** 6 auto-fixed (2 Rule 2/3 - missing critical/blocking fallout in TS code, 4 Rule 1 - bugs in the migration authoring, 2 caught pre-commit and 2 caught post-push)
**Impact on plan:** All auto-fixes necessary for correctness (broken imports, dangling DROP FUNCTION references, an orphaned table, a stale test). No scope creep — domain.ts cleanup and the 5 dormant combo columns were deliberately left for their correct owners (01-13 and "never", respectively).

## Issues Encountered

- **`supabase db push` (no `--db-url`) requires the same workaround as every prior wave-3 plan:** this self-hosted stack has no cloud project to `supabase link` against. Resolved using `--db-url "postgresql://postgres.your-tenant-id:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"`, credentials read from `docker exec supabase-db env` / `docker exec supabase-pooler env`. The initial push (with `--debug`) succeeded and applied both migrations; two subsequent re-verification attempts (without `--debug`) hit a transient `tls error (server refused TLS connection)` from the CLI's pooler connection — the underlying database and pooler containers were confirmed healthy throughout (`docker ps`, direct `psql` via `docker exec` all succeeded), and both migrations are confirmed applied in `supabase_migrations.schema_migrations` plus verified end-to-end via direct `psql` introspection against every acceptance criterion. Treated as a CLI-only flake, not a migration or DB-state problem.

## User Setup Required

None - no external service configuration required. The self-hosted Supabase stack was already running (11 containers) and both migrations were pushed directly via `supabase db push --db-url ... --debug`.

## Next Phase Readiness

- Combos, recipes, ingredient costing, and modifier-inventory-rule depletion are fully gone from code and the database; `npx tsc --noEmit`, `npm run lint`, and `npx vitest run` (22 pre-existing failures, 0 new) all pass clean.
- `deplete_for_order_item` v6 correctly depletes plain-product and open-unit sales/refunds with zero reference to the dropped tables — Phase 2's CHK-05 open-unit dependency is unaffected.
- Plan 01-13 (final sweep) still owns: domain.ts Zod schema removal for the Combo*/Recipe*/Ingredient*/ModifierInventoryRule*/StockMovementReason families (confirmed via 01-13-PLAN.md's own file inventory, which already lists these exact schemas at their approximate line numbers); the now-fully-dead `useComboMixReport`/`useComboOverrides` hooks in `entities/tab/model/queries-reports.ts`; and the combo/recipe branches inside `useExportReport.ts`/`ExportButtons.tsx`/`exporters/excel.ts`/`exporters/pdf.tsx` (unreachable now that their only widget consumers are deleted, but still valid TypeScript — not a blocker for any other phase).
- 5 columns remain permanently dormant by design: `products.is_combo`/`combo_eligible`/`combo_price_override`, `order_items.parent_order_item_id`/`combo_slot_id` — still read by `evaluate_promotions_for_item`, `process_payment_atomic`, and every `split_tab_by_*` function, all of which continue to work correctly since nothing can ever populate these columns again. If a future phase wants to remove them, it must first rewrite those 6 RPCs — flagged here so it isn't attempted as a "quick cleanup."

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260810000006_drop_combos_recipes_ingredients_modifier_rules.sql`
- FOUND: `supabase/migrations/20260810000007_deplete_for_order_item_v6.sql`
- FOUND: `src/entities/combo` deleted (directory absent)
- FOUND: `src/entities/recipe` deleted (directory absent)
- FOUND: `src/entities/ingredient` deleted (directory absent)
- FOUND: `src/entities/modifier-inventory-rule` deleted (directory absent)
- FOUND: `src/widgets/ModifierPopularityReport` still exists, unmodified
- FOUND: `.planning/phases/01-strip-rebrand/01-09-SUMMARY.md`
- FOUND: commit `1882167` (Task 1)
- FOUND: commit `0fdbad2` (Task 2)
- FOUND: commit `2850288` (Task 2 fallout)

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*
