# Phase 1: Strip & Rebrand - Pattern Map

**Mapped:** 2026-08-10
**Nature of phase:** deletion + surgical edit, not new-file creation. "Closest analog" framing only applies to the new DROP-migration files; everything else below is exact removal/edit points.

## File Classification

| File/Concern | Action | Role | Notes |
|---|---|---|---|
| `src/app/router.tsx` | EDIT (remove 7 routes + 3 guard imports) | route config | see Pattern Assignments |
| `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` | EDIT (prune `ITEMS` array + dead import) | component | see Pattern Assignments |
| `src/shared/lib/domain.ts` | EDIT (`UserRoleSchema`, `TabSchema` fields) | model/types | see Pattern Assignments |
| `src/shared/lib/rbac.ts` | EDIT (role rename, `transfer_tab`/`view_kds_bar` action removal) | model/rbac | see Pattern Assignments |
| `e2e/helpers/auth.ts` | EDIT (role literal, keep env var names per RESEARCH pitfall 5) | test helper | see Pattern Assignments |
| ~26 E2E spec files | DELETE whole file | test | D-11, list below |
| ~5-8 E2E spec files | EDIT (strip specific `test()` blocks) | test | D-12, mixed files below |
| `package.json`, `tauri.conf.json`, `index.html`, `receipt.json`×2 | EDIT (string literals) | config | see Rebrand Strings section |
| New `supabase/migrations/2026*_drop_*.sql` (7 files, D-20) | NEW | migration | analog below |
| `src/entities/{resource,kds,prep,waitlist,rappi-order,combo,recipe,ingredient,promotion,modifier-inventory-rule}/` | DELETE dir | entity | whole directories |
| `src/features/{split-tab,transfer-tab,assign-pool-session-to-tab,start-pool-timer,stop-pool-timer,stop-and-move-table,edit-session-start-time,bump-kds-item,produce-prep-batch,add-waitlist-entry,notify-waitlist,seat-waitlist-party,mark-waitlist-entry-cancelled,mark-waitlist-no-show,add-combo-to-tab,manage-combos,manage-recipe,import-ingredients-csv,manage-ingredients,manage-promotions,manage-modifier-inventory-rules}/` | DELETE dir | feature | whole directories |
| `src/pages/{pos,pool-tables,pool-table-status,kds,kds-bar,kitchen-prep,waitlist,rappi}/` | DELETE dir | page | whole directories (confirm exact page dir names against router.tsx lazy imports) |
| `src/widgets/{PoolTableGrid,PoolTableOccupancyPanel,TableStatusPanel,KdsBoard,KitchenPrepDashboard,WaitlistQueue,WaitlistAnalyticsReport,RappiOrdersPanel,ComboMixReport,ComboOverrideReport,RecipeVarianceReport,IngredientsTable,ManageIngredientsTab,TipBucketDistributionPanel,TipDistributionPanel}/` | DELETE dir | widget | whole directories |
| `src/widgets/SettingsTabsPanel/tabs/{PoolTablesSettingsTab,RappiSettingsTab,TipDistributionSettingsTab}` | DELETE + EDIT parent index | widget | remove tab, remove registration in `SettingsTabsPanel` tab-list array |
| `src/app/PoolRealtimeListener.tsx`, `src/app/WaitlistRealtimeListener.tsx` | DELETE + EDIT `src/app/` root (App.tsx or providers) | provider | remove mount + import, per Pitfall 3 (dangling Realtime subscription) |
| `supabase/functions/{rappi-sync-menu,rappi-webhook,send-waitlist-notification}/` | DELETE dir | edge function | whole directories |

## Pattern Assignments

### `src/app/router.tsx` (route config, request-response)

**Exact removal points** `[VERIFIED: src/app/router.tsx:8-198]`:
- Import lines to delete: `line 8: import { KdsBarRoute } from './kds-bar-route';`, `line 9: import { KdsRoute } from './kds-route';`, `line 12: import { WaitlistRoute } from './waitlist-route';`
- Lazy page imports to delete: `line 16: const PosPage = lazy(...)`, `line 17: const PoolTablesPage = lazy(...)`, `line 22: const RappiOrdersPage = lazy(...)`, `line 25: const KdsPage = lazy(...)`, `line 26: const KdsBarPage = lazy(...)`, `line 27: const KitchenPrepPage = lazy(...)`, `line 28: const WaitlistPage = lazy(...)`
- `<Route>` blocks to delete (by `path=` prop, each wrapped in `<ProtectedRoute>` and sometimes a feature-guard): `/pos` (~60-65), `/pool-tables` (~68-73), `/rappi` (~110-115), `/pool-tables/:tableId` (~118-123), `/kds` (~134-141, guarded by `<KdsRoute>`), `/kds-bar` (~144-151, guarded by `<KdsBarRoute>`), `/kitchen-prep` (~154-159), `/waitlist` (~162-169, guarded by `<WaitlistRoute>`)
- **Add per D-10/UI-SPEC backstop:** `<Route path="*" element={<Navigate to="/home" replace />} />` — router currently has NO catch-all; this is a net-new line, not a removal, required by the UI-SPEC's `removed-route-access` contract.
- Keep untouched: `/login`, `/`, `/home`, `/inventory`, `/staff`, `/reports` (+`ReportsRoute`), `/settings`, `/payments`, `/rbac` (+`RbacRoute`), `/audit` (+`AuditRoute`), `/edit-history` (+`EditHistoryRoute`).

### `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (component)

`[VERIFIED: HomeDashboard.tsx:42-117]` — `ITEMS` array currently has 14 entries. Remove the 7 entries for `/pos`, `/pool-tables`, `/rappi`, `/kitchen-prep`, `/waitlist`, `/kds`, `/kds-bar`. Also remove `useWaitlistWaitingCount` import + its usage (badge count) and the `visibleToRoles: ['admin', 'kitchen']` KDS-only tile-visibility branch if it becomes dead code after tile removal. Role badge at `HomeDashboard.tsx:152-154` needs no edit — renders raw `currentStaff.role` with `.capitalize`, will auto-display "Cashier" once domain.ts enum is renamed.

### `src/shared/lib/domain.ts` (model, request-response)

**Role enum** `[VERIFIED: domain.ts:42-47]`:
```typescript
// BEFORE
export const UserRoleSchema = z.enum(['bartender', 'manager', 'admin', 'kitchen']);
export const UserRole = {
  BARTENDER: 'bartender',
  MANAGER: 'manager',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
} as const;
// AFTER
export const UserRoleSchema = z.enum(['cashier', 'manager', 'admin', 'kitchen']);
export const UserRole = {
  CASHIER: 'cashier',
  MANAGER: 'manager',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
} as const;
```

**TabSchema field prune** `[VERIFIED: domain.ts:431-461]` — remove exactly these 6 fields, keep everything else:
```typescript
tableNumber: z.number().int().min(1).max(200).nullable(),      // pool-table linkage — REMOVE
poolCharges: z.array(PoolSessionSummarySchema).default([]),    // pool linkage — REMOVE
hasActivePoolSession: z.boolean().optional(),                  // pool linkage — REMOVE
activePoolTableNumber: z.number().int().nullable().optional(), // pool linkage — REMOVE
rappiOrderId: z.string().min(1).max(128).nullable().optional(),// rappi linkage — REMOVE
parentTabId: UuidSchema.nullable().optional(),                 // split-tab (D-09) — REMOVE
splitMode: z.enum(['item', 'evenly', 'by_person', 'by_amount']).nullable().optional(), // split-tab — REMOVE
splitLabel: z.string().max(50).nullable().optional(),          // split-tab — REMOVE
```
Also remove now-orphaned `PoolSessionSummarySchema` if unused elsewhere after this edit (grep first).

### `src/shared/lib/rbac.ts` (model/rbac)

`[VERIFIED: rbac.ts:6-103]`:
- `line 6-7`: `STAFF_ROLES` array — `'bartender'` → `'cashier'`
- `line 44-54`: `BARTENDER_ACTIONS` → rename const to `CASHIER_ACTIONS`; remove `'transfer_tab'` entry (line 52, D-09 feature stripped) and `'view_kds_bar'` entry (line 54, `/kds-bar` removed, RESEARCH.md flags this as dead-but-not-explicitly-decided — remove it, no route left to gate)
- `line 87`: `MANAGER_ACTIONS` spreads `...BARTENDER_ACTIONS` → update to `...CASHIER_ACTIONS`
- `line 91-92`: `ROLE_SET` record key `bartender:` → `cashier:`
- Also grep RLS policies in `supabase/migrations/` for literal `'bartender'` string (ASVS V4 note in RESEARCH.md) — must be updated in the same DB migration pass, not left stale.

### `e2e/helpers/auth.ts` (test helper)

Per RESEARCH.md Pitfall 5 / recommendation (b): rename `StaffRole` type literal `'bartender'` → `'cashier'` and any `role === 'bartender'` branch, and all `loginAs(page, 'cashier')` call sites across specs. **Do NOT rename `E2E_BARTENDER_NAME`/`E2E_BARTENDER_PIN` env vars** — keep reading those env var names internally, just map them to the `'cashier'` role literal in code, to avoid needing a CI secret-store update.

## Rebrand Strings (D-01/D-03, exact locations)

| File | Line | Current | New |
|---|---|---|---|
| `package.json` | 2 | `"name": "bar-pos"` | `"name": "supermarket-pos"` |
| `src-tauri/tauri.conf.json` | 3 | `"productName": "Bar &amp; Pool Parlor POS"` | `"productName": "Supermarket POS"` |
| `src-tauri/tauri.conf.json` | 15 | `"title": "Bar POS"` | `"title": "Supermarket POS"` |
| `src-tauri/tauri.conf.json` | 5 | `"identifier": "com.yourcompany.barpos"` | **leave untouched** — OS-level identifier, out of D-03 scope per RESEARCH Open Question 3 |
| `index.html` | 7 | `<title>Bar POS</title>` | `<title>Supermarket POS</title>` |
| `src/shared/lib/i18n/locales/es-MX/receipt.json` | 36 | `"appTitle": "Bar & Pool Parlor POS"` | `"appTitle": "Supermarket POS"` |
| `src/shared/lib/i18n/locales/en-US/receipt.json` | 36 | `"appTitle": "Bar & Pool Parlor POS"` | `"appTitle": "Supermarket POS"` |
| `src/shared/lib/i18n/locales/{es-MX,en-US}/wPanels.json` | — | `homeDashboard.managerLabels.bartender` key | DELETE key (only consumer was the removed `/kds-bar` tile) — D-22 |
| `README.md` | — | grep for `bar-pos`/`Bar POS`/`Bar & Pool Parlor` | replace per D-03 |
| `src-tauri/Cargo.toml` | — | `name = "bar-pos"`, `name = "bar_pos_lib"` | **leave untouched** — internal crate identifiers, out of scope per RESEARCH Open Question 3 |

## SQL Migration Analog (for the 7 new DROP migrations, D-20)

**Analog file:** `supabase/migrations/20260711000001_drop_happy_hour_columns.sql` — this repo's own existing DROP-migration convention (closest analog; same repo already has a prior "strip a bar-specific feature" precedent).

**Shape to copy** (already extracted in RESEARCH.md, reproduced here for the planner):
```sql
BEGIN;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS <table_in_publication>;
DROP FUNCTION IF EXISTS <feature>_rpc_name(...) CASCADE;
DROP TRIGGER IF EXISTS <trigger_name> ON <table>;
DROP TABLE IF EXISTS <feature>_table CASCADE;
COMMIT;
NOTIFY pgrst, 'reload schema';
-- DOWN:
-- BEGIN;
-- CREATE TABLE <feature>_table ( ... );  -- recreate schema shape only
-- COMMIT;
```
DOWN scripts required per D-19 (Phase 8+ convention — see `supabase/migrations/` files dated 2026-08+ for other DOWN-script examples if a second analog is needed).

**Two migrations require function-body surgery, not just DROP** (do not use the plain DROP shape for these — no clean analog exists in-repo for "re-derive a function minus one branch", this is bespoke):
1. `deplete_for_order_item` (combos/recipes/ingredients group) — author v6 = v5's body minus combo/recipe/ingredient branches, keeping open-units + plain-product depletion (Pitfall 3).
2. `close_caja_session` (tip-distribution group) — `CREATE OR REPLACE FUNCTION` restoring the pre-`20260709000002` body (drop the tip-distribution INSERT block), not just `DROP TABLE tip_distribution_entries` (Pitfall 4).

**Realtime publication removals** (exact tables, from migration grep): `rappi_orders` (added `20260417100000_rappi_orders.sql:39`), `resources` (added `20260728000001_rename_pool_tables_to_resources.sql:113-115`).

## E2E Spec Handling

### Delete whole file (D-11) — full-domain specs
`04-pool-timer`, `21-carom-billing`, `24-pool-advanced`, `28-kds`, `40-kds-bar`, `25-rappi-orders`, `32-combos`, `33-ingredients`, `36-recipes`, `43-promotions`, `24-waitlist`, `24-modifier-inventory-rules`, `21-prep`, `18-modifier-notes-kds`, `29-panel-toggle` (targets `/pos`), `22-sprint3-billing` (pool billing config despite generic name), plus any other spec RESEARCH.md's keyword audit flagged as 100% bar/pool (re-grep at execution time per RESEARCH.md's own caveat — its list was not exhaustively read test-block-by-test-block).

### Delete per D-12 rule (drives UI through tab-based checkout)
`03-tab-order`, `06-transfer`, and any other spec whose flow navigates `/pos`.

### Leave untouched (D-13)
`18-updater`, `13-tauri-build`, `12-infrastructure`, `11-offline`, `01-ci`.

### Mixed files — edit specific `test()` blocks, don't delete whole file (Pitfall 2)
`07-reports.spec.ts` (31 test blocks — remove blocks touching `ComboMixReport`/`WaitlistAnalyticsReport`/`RecipeVarianceReport`/`TipBucketDistributionPanel`/`ComboOverrideReport`, keep generic payment-method/hourly-breakdown/deletions-report blocks) and `23-payment-edge-cases.spec.ts` (remove Rappi- and pool-charge-specific blocks, keep generic cash/tip blocks). Use `grep -c "test("` per RESEARCH.md's detection heuristic to find any other mixed file before assuming file-level delete/keep is sufficient. Every remaining spec that calls `loginAs(page, 'bartender')` also needs the literal swapped to `'cashier'` (RBAC rename fallout) even if no test blocks are removed — e.g. `09-rbac.spec.ts`, `18-void-order.spec.ts`.

### New E2E assertions required (D-10)
Add a removed-route 404/redirect spec (new or appended to `15-home-navigation.spec.ts`) asserting `page.url()` resolves to `/home` for each of `/pos`, `/pool-tables`, `/pool-tables/:tableId`, `/kds`, `/kds-bar`, `/kitchen-prep`, `/waitlist`, `/rappi`, using the existing `loginAs`/`page.goto` pattern from `e2e/helpers/auth.ts` + `e2e/15-home-navigation.spec.ts`.

## Shared Patterns

### RBAC role literal — single source of truth first
Edit `src/shared/lib/domain.ts` (`UserRoleSchema`/`UserRole`) FIRST, then propagate to `rbac.ts`, DB check constraint, RLS policies, i18n role labels, `e2e/helpers/auth.ts`, seed scripts — matches CLAUDE.md's stated single-source-of-truth convention. Apply atomically (ASVS V4 note): a partial rename with a stale RLS policy silently locks out the renamed role.

### Deletion order (per RESEARCH.md's dependency-order recommendation, matches `pool_tables → resources` precedent in CONCERNS.md)
pages → widgets → features → entities → i18n → E2E specs → SQL (SQL only against the new Supabase project, D-06, never `shsrhxleopmovzpzqmex`).

### Supabase project safety gate
Before authoring/pushing ANY DROP migration: verify `supabase/config.toml`'s `project_id` != `shsrhxleopmovzpzqmex`. Treat as a blocking pre-condition task, not a suggestion.

## No Analog Found

| Concern | Reason |
|---|---|
| `deplete_for_order_item` v6 function body | No existing "subtract one branch from a 5-version function" example in this repo — bespoke, see SQL section above |
| `close_caja_session` tip-distribution removal | Same — bespoke `CREATE OR REPLACE` surgery, not a template DROP |
| New catch-all `<Route path="*">` | Router has no existing catch-all to copy; standard React Router `<Navigate>` pattern already used elsewhere in this same file for `/` → `/home` (`router.tsx:50`) is the closest in-file analog |

## Metadata

**Source documents:** 01-CONTEXT.md (22 decisions), 01-RESEARCH.md (full file/route/SQL inventory), 01-UI-SPEC.md (copy contract, UI states)
**Additional verification this pass:** `src/app/router.tsx`, `package.json`, `src-tauri/tauri.conf.json`, `index.html`, `receipt.json` (both locales), `src/shared/lib/rbac.ts` — grepped directly to pin exact line numbers beyond what RESEARCH.md already cited.
**Pattern extraction date:** 2026-08-10
