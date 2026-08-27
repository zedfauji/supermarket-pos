# Phase 1: Strip & Rebrand - Research

**Researched:** 2026-08-10
**Domain:** Feature-Sliced React/Tauri codebase strip (route/feature/entity/SQL removal) + Supabase project separation + RBAC role rename
**Confidence:** HIGH (this is a pure code-inventory/removal phase against a codebase every claim was read from directly; the few genuine unknowns are called out in Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rebrand identity**
- **D-01:** New app name is "Supermarket POS" (matches PROJECT.md's project title).
- **D-02:** Rebrand is strings-only in Phase 1 — no visual redesign. Keep existing dark-mode Tailwind theme, icon, and colors as-is.
- **D-03:** Rename applies to all user-visible + config strings: `package.json` "name", `tauri.conf.json` window title, `README.md`, any in-app footer/about text.
- **D-04:** The AI chat feature (`agent-chat`) persona/naming is left as-is — not bar-specific, not worth touching.

**Supabase project separation (CRITICAL — surfaced by user, not initially identified by Claude)**
- **D-05:** The Supabase project currently linked (config.toml `project_id = "shsrhxleopmovzpzqmex"`) is **live production data for an actual operating bar**. It must NOT receive destructive migrations. — **Reversibility:** one-way — running a DROP migration against the live bar's database would destroy that business's real operational data; there is no undo.
- **D-06:** Phase 1 must provision a **new, separate Supabase project** for the supermarket pivot before any SQL strip work is verified against a real backend. Apply the full existing migration history to the new project to establish baseline schema, then apply the bar/pool DROP migrations (D-08/D-09/D-10) on top of the new project only. Local `.env`/Supabase config must point at the new project ref before any other Phase 1 SQL work runs. Actual project creation is an execution-time action, not something decided/performed during this discussion.

**/pos route gap (bar tab-based checkout → grocery direct-sale checkout)**
- **D-07:** Remove the `/pos` route and its nav link entirely in Phase 1, along with the tab-based checkout page. No stub/placeholder — nothing links to `/pos` until Phase 2 adds the new direct-sale checkout route.
- **D-08:** Keep the `tabs`/`order_items` schema and RPCs (including `process_payment`'s atomic-RPC discipline) — do not drop this schema. Phase 2 adapts/renames it for direct-sale checkout rather than rebuilding from scratch. Phase 1 removes only pool-specific linkage (`pool_session_id`/table linkage) and bar-tab-transfer/split-by-seat semantics.
- **D-09:** Strip `transfer-tab` feature entirely (pure pool-table concept, no meaning without tables). Strip split-**tab** (splitting a shared bar tab by seat/item — no grocery equivalent). Keep split-**payment** (multi-tender cash+card in one sale — directly relevant to grocery checkout, maps toward CHK-03). Keep `process-refund` (a store still needs returns, even though not a numbered v1 requirement).
- **D-10:** Add explicit Playwright E2E assertions that removed routes (`/pos`, `/pool-tables`, `/kds`, `/kds-bar`, `/kitchen-prep`, `/waitlist`, `/rappi`) 404 or redirect — directly proves ROADMAP.md Success Criterion 1 for this phase.

**E2E spec handling**
- **D-11:** Delete (not archive) the ~20 E2E spec files testing removed features: `04-pool-timer`, `21-carom-billing`, `24-pool-advanced`, `28-kds`, `40-kds-bar`, `25-rappi-orders`, `32-combos`, `33-ingredients`, `36-recipes`, `43-promotions`, `24-waitlist`, `24-modifier-inventory-rules`, `21-prep`, and similar. Git history preserves them if ever needed.
- **D-12:** For mixed/ambiguous specs, apply a simple rule: delete anything whose test flow drives the UI through tab-based checkout (e.g. `03-tab-order`, `06-transfer`). Phase 2 writes fresh specs against the new direct-sale checkout flow rather than retrofitting these.
- **D-13:** Infra/build specs not tied to the bar/pool domain (`18-updater`, `13-tauri-build`, `12-infrastructure`, `11-offline`, `01-ci`) are left untouched.

**Home dashboard nav**
- **D-14:** HomePage keeps tiles only for retained routes (`/inventory`, `/staff`, `/reports`, `/settings`, `/payments`, `/rbac`, `/audit`) — no placeholder tiles added for future Phase 2/3 features. A sparse dashboard is expected and acceptable for this prerequisite phase.
- **D-15:** No explicit dashboard grid redesign — let the layout re-flow naturally with fewer tiles (standard responsive grid/flex behavior).

**RBAC role rename (bartender → cashier)**
- **D-16:** Rename `bartender` role to `cashier` everywhere, fully — DB role enum/check constraint, TypeScript RBAC types/constants, i18n role labels across namespaces, E2E auth helper (`loginAs(page, 'cashier')` etc. in `e2e/helpers/auth.ts`), and seed/dev-user scripts. No partial rename (UI-only) — that would leave a permanent code/DB naming mismatch. — **Reversibility:** costly — touches a DB enum plus every RBAC call site; a later re-rename would need another full sweep.
- **D-17:** Do NOT rename tab-named RBAC action strings (`close_tab`, `delete_tab`) in Phase 1 — consistent with keeping the tabs schema as internal plumbing (D-08); premature until Phase 2 actually renames the underlying schema. Exception: delete the `transfer_tab` action entirely since that feature is stripped (D-09).

**SQL migration strategy**
- **D-18:** Remove bar/pool SQL objects via new forward DROP migrations (not squashed/rewritten history) — applied against the NEW Supabase project (D-06) only, never the live bar's project.
- **D-19:** DROP migrations include DOWN scripts, matching the Phase 8+ convention, since these are newly authored migrations.
- **D-20:** Split DROP migrations per feature (pool/resources, KDS, waitlist, rappi, combos/recipes, promotions) rather than one combined migration — matches the dependency-order strip approach already noted in STATE.md, and makes it easier to bisect which removal caused an E2E regression.

**Settings/i18n cleanup**
- **D-21:** Remove bar-specific Settings tabs (Tip Distribution/Tip Split settings + report tabs — bar tip-splitting doesn't apply to grocery cashiers) together with their feature code, not as a separate pass.
- **D-22:** Prune orphaned i18n keys via manual grep per removed feature as each feature is stripped (bounded set of ~7-8 features) — no new tooling needed for this one-time cleanup.

### Claude's Discretion
- Exact migration file naming/ordering within the per-feature split (D-20).
- Which specific in-app strings need a "bar-pos"/"Bar POS" grep pass beyond the files explicitly named in D-03.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 1 scope. Visual/logo rebrand was considered and explicitly deferred (D-02 scoped Phase 1 to strings-only), not out of scope for the project as a whole.
</user_constraints>

<phase_requirements>
## Phase Requirements

None. Per ROADMAP.md and REQUIREMENTS.md, Phase 1 maps zero v1 requirement IDs — it is prerequisite groundwork that enables CHK/INV/SUP/EXP/REP requirements delivered in Phases 2-4. Traceability table in REQUIREMENTS.md confirms 15/15 v1 requirements are mapped to Phases 2-4, none to Phase 1.
</phase_requirements>

## Summary

This phase is a pure subtraction + string-rename task on an already-mature codebase (144 SQL migrations, 61 E2E specs, ~50 feature folders). There is no new library to learn and no architecture to design — the research value is in building an accurate, verified map of exactly what is bar/pool-domain (delete) versus generic-retail (keep), because the codebase's naming is inconsistent: some clearly-bar-named things are actually generic infra worth keeping (`tabs` schema, `open_units`/case-to-piece breakdown), and some generic-sounding things are entirely bar-specific (`22-sprint3-billing.spec.ts` "billing" = carom/pool table billing config; `29-panel-toggle.spec.ts` targets the `/pos` page being deleted). Every classification below was verified by reading the actual file, not inferred from its name.

The single highest-risk decision already made by the user (D-05/D-06) is correct and must be followed literally: **the currently-linked Supabase project (`shsrhxleopmovzpzqmex`, `supabase/config.toml:5`) is live production data for a real bar and must never receive a DROP migration.** A new Supabase project must be provisioned, the full 144-migration history replayed onto it, and only then should the new bar/pool DROP migrations run — against the new project exclusively.

**Primary recommendation:** Execute the strip in dependency order — pages/routes → widgets → features → entities → i18n → E2E specs → SQL (on the new project only) — verifying with the existing (pruned) E2E suite after each feature-cluster removal, exactly matching the precedent STATE.md documents for the `pool_tables → resources` rename fragility.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route/page removal (`/pos`, `/pool-tables`, `/kds`, etc.) | Browser/Client (React Router) | — | Pure client-side route table + lazy-loaded page component removal |
| RBAC role rename (`bartender`→`cashier`) | Database/Storage | API/Backend + Browser/Client | DB `profiles.role` check constraint is source of truth; TS `UserRoleSchema`/`STAFF_ROLES` and i18n labels are downstream mirrors that must match |
| SQL object removal (RLS, RPCs, triggers, Realtime publication membership) | Database/Storage | — | All in `supabase/migrations/`; must run only against the new, separated Supabase project (D-06) |
| Supabase project separation & config repoint | Database/Storage | Browser/Client (env/config) | New project provisioning is a Supabase-side action; `.env`/`supabase/config.toml` repoint is what makes the client and CLI talk to it |
| App identity rebrand (name/title strings) | Browser/Client + Build config | — | `package.json`, `tauri.conf.json`, i18n `receipt.json` strings — no logic, pure string literals |
| E2E suite pruning | Testing infra (`e2e/`) | — | Not a runtime tier, but must be co-updated with every route/feature removal or the suite goes red for reasons unrelated to real bugs |

## Package Legitimacy Audit

Not applicable. This phase removes code and does not add any new npm/pip/cargo dependency. `package.json` is touched only for the `"name"` field (D-01/D-03), not for its `dependencies`/`devDependencies`. No package-legitimacy check is required.

## File / Route / Component Inventory

> Every row below was confirmed by reading the actual file (route table, entity dir listing, or RBAC/domain schema), not inferred from naming. `[VERIFIED: <path>:<lines>]` tags cite the exact read.

### Routes (`src/app/router.tsx`) — `[VERIFIED: src/app/router.tsx:1-198]`

| Route | Page component | Disposition | Notes |
|-------|----------------|-------------|-------|
| `/login` | `LoginPage` | KEEP | Generic auth |
| `/home` | `HomePage` | KEEP | Tile list pruned per D-14 |
| `/pos` | `PosPage` | **REMOVE** | D-07 — tab-based checkout page, no stub |
| `/pool-tables` | `PoolTablesPage` | **REMOVE** | Pool table grid |
| `/pool-tables/:tableId` | `TableStatusPage` | **REMOVE** | Single pool-table detail |
| `/inventory` | `InventoryPage` | KEEP | Generic stock management |
| `/staff` | `StaffPage` | KEEP | Generic staff management |
| `/reports` | `ReportsPage` (behind `ReportsRoute`) | KEEP | Internal tabs pruned (see Reports section below) |
| `/settings` | `SettingsPage` | KEEP | Internal tabs pruned (Pool Tables, Rappi, Tip Distribution removed) |
| `/rappi` | `RappiOrdersPage` | **REMOVE** | Delivery integration, entirely out of scope for grocery |
| `/payments` | `PaymentsPage` | KEEP | Generic payments history |
| `/kds` | `KdsPage` (behind `KdsRoute`) | **REMOVE** | Kitchen display |
| `/kds-bar` | `KdsBarPage` (behind `KdsBarRoute`) | **REMOVE** | Bar display |
| `/kitchen-prep` | `KitchenPrepPage` | **REMOVE** | Batch chef prep |
| `/waitlist` | `WaitlistPage` (behind `WaitlistRoute`) | **REMOVE** | Walk-in queue |
| `/rbac` | `RbacPage` (behind `RbacRoute`) | KEEP | Generic role/permission mgmt |
| `/audit` | `AuditPage` (behind `AuditRoute`) | KEEP | Generic audit log |
| `/edit-history` | `EditHistoryPage` (behind `EditHistoryRoute`) | **KEEP (see Open Question)** | Filtered audit view of `tab.edit_paid` actions — tab-schema-based, not pool-specific; D-14's tile list omits it but no decision explicitly removes it |

Also remove the matching `KdsRoute`, `KdsBarRoute`, `WaitlistRoute` guard components and their imports in `router.tsx` (only `RbacRoute`, `ReportsRoute`, `AuditRoute`, `EditHistoryRoute` remain as guards).

### HomeDashboard tiles — `[VERIFIED: src/widgets/HomeDashboard/ui/HomeDashboard.tsx:42-117]`

Current `ITEMS` array (14 tiles): `/pos`, `/payments`, `/pool-tables`, `/rappi`, `/staff`, `/reports`, `/inventory`, `/settings`, `/kitchen-prep`, `/waitlist`, `/rbac`, `/audit`, `/edit-history`, `/kds`, `/kds-bar`.

Per D-14, retained tiles are exactly: `/inventory`, `/staff`, `/reports`, `/settings`, `/payments`, `/rbac`, `/audit` (7 tiles) — plus `/edit-history` per the Open Question above (recommend keeping it, 8 tiles total). Remove the 6 tiles for `/pos`, `/pool-tables`, `/rappi`, `/kitchen-prep`, `/waitlist`, `/kds`, `/kds-bar` (7 tiles removed — matches the 7 routes being deleted). Also remove the now-dead `useWaitlistWaitingCount` badge-count import/usage and the `visibleToRoles: ['admin', 'kitchen']` KDS-only tile logic.

### Entities (`src/entities/`) — `[VERIFIED: directory listing]`

| Entity dir | Disposition | Notes |
|---|---|---|
| `audit-log`, `caja`, `category`, `inventory`, `payment`, `product`, `rbac`, `refund`, `settings`, `staff` | KEEP | Generic retail infra |
| `open-unit` | **KEEP — high-value finding** | `[VERIFIED: supabase/migrations/20260729000001_open_units_table.sql:1-10]` — comment states this table "Tracks an opened package/box's **remaining loose-piece count**" for case→piece breakdown (parent/box product vs. loose product via `products.parent_product_id`), NOT bar bottle-pour tracking despite the "open unit" naming ambiguity. This is directly reusable infrastructure for **CHK-05** ("ring up multi-unit items at checkout... case→piece breakdown") in Phase 2. Do not strip. |
| `tab` | **KEEP (schema), PRUNE (pool/rappi/split-tab fields)** | Per D-08. See TabSchema field-level detail below. |
| `resource` | **REMOVE** | `[VERIFIED: src/entities/resource/ files]` — `usePoolTimer.ts`, `ResourceIllustration.tsx`, `ResourceCard.tsx`, `deactivate-floating-resource.integration.test.ts` — this is the renamed `pool_tables` entity (migration `20260728000001_rename_pool_tables_to_resources.sql`), 100% pool-table domain despite the generic "resource" name |
| `kds` | **REMOVE** | Kitchen display state |
| `prep` | **REMOVE** | Batch chef prep production |
| `waitlist` | **REMOVE** | Walk-in queue |
| `rappi-order` | **REMOVE** | Delivery integration |
| `combo` | **REMOVE** | Combo/meal-deal pricing |
| `recipe` | **REMOVE** | Recipe/ingredient costing |
| `ingredient` | **REMOVE** | Ingredient costing |
| `promotion` | **REMOVE** | Promotions/happy-hour engine (out of scope per REQUIREMENTS.md) |
| `modifier-inventory-rule` | **REMOVE** | Explicit in Phase Boundary text |

**Not an entity dir but same category — Modifier groups** (`ModifierGroupSchema` in `domain.ts`, `manage-modifier-groups` feature, `ModifierSheet` in `add-item-to-tab`) — see Open Questions. Not explicitly named by any locked decision; recommend flagging to the planner rather than assuming removal, since it lives inside the explicitly-*retained* `add-item-to-tab` feature.

### Features (`src/features/`) — `[VERIFIED: directory listing + spot-checked source]`

| Feature | Disposition | Notes |
|---|---|---|
| `add-item-to-tab`, `remove-item-from-tab`, `remove-tab-item`, `open-tab`, `close-tab`, `edit-paid-tab`, `reopen-tab` | KEEP | Generic tab lifecycle, D-08 |
| `adjust-inventory`, `adjust-stock-movement`, `override-negative-stock`, `physical-count` | KEEP | Generic inventory |
| `open-open-unit`, `correct-open-unit`, `void-open-unit` | **KEEP** | Case→piece infra, see `open-unit` entity finding above |
| `clock-in-staff`, `clock-out-staff`, `manager-pin-gate`, `toggle-permission`, `force-pin-change` | KEEP | Generic staff/RBAC |
| `manage-products`, `manage-categories`, `upload-logo`, `export-report`, `register-caja-entry` | KEEP | Generic |
| `agent-chat` | KEEP | D-04 — persona untouched |
| `process-payment`, `process-refund`, `void-order` | KEEP | D-08/D-09 |
| `split-tab` | **REMOVE** | D-09 — split a shared bar tab, no grocery equivalent |
| `transfer-tab` | **REMOVE** | D-09 — pure pool-table concept |
| `assign-pool-session-to-tab`, `start-pool-timer`, `stop-pool-timer`, `stop-and-move-table`, `edit-session-start-time` | **REMOVE** | Pool session lifecycle |
| `bump-kds-item` | **REMOVE** | KDS |
| `produce-prep-batch` | **REMOVE** | Kitchen prep |
| `add-waitlist-entry`, `notify-waitlist`, `seat-waitlist-party`, `mark-waitlist-entry-cancelled`, `mark-waitlist-no-show` | **REMOVE** | Waitlist |
| `add-combo-to-tab`, `manage-combos` | **REMOVE** | Combos |
| `manage-recipe`, `import-ingredients-csv`, `manage-ingredients` | **REMOVE** | Recipe/ingredient costing |
| `manage-promotions` | **REMOVE** | Promotions engine |
| `manage-modifier-inventory-rules` | **REMOVE** | Modifier-inventory depletion rules |
| `manage-modifier-groups` | **Open Question — see below** | Not named by any locked decision; lives partly inside the retained `add-item-to-tab` via `ModifierSheet.tsx` |
| `lookup-product-by-barcode`, `print-precheque` | KEEP | Core checkout infra reused by Phase 2 |

### `TabSchema` fields to prune (not the whole schema) — `[VERIFIED: src/shared/lib/domain.ts:431-461]`

```typescript
export const TabSchema = z.object({
  id: UuidSchema,
  customerName: z.string().min(1).max(100),
  tableNumber: z.number().int().min(1).max(200).nullable(),      // pool-table linkage — prune
  staffId: UuidSchema,
  shiftId: UuidSchema,
  openedAt: TimestampSchema,
  closedAt: TimestampSchema.nullable(),
  status: TabStatusSchema,
  notes: z.string().max(500).nullable(),
  orders: z.array(OrderSchema).default([]),
  items: z.array(OrderItemSchema).default([]),
  poolCharges: z.array(PoolSessionSummarySchema).default([]),    // pool linkage — prune
  hasActivePoolSession: z.boolean().optional(),                  // pool linkage — prune
  activePoolTableNumber: z.number().int().nullable().optional(), // pool linkage — prune
  subtotal: MoneySchema.optional(),
  staff: StaffSchema.optional(),
  rappiOrderId: z.string().min(1).max(128).nullable().optional(),// rappi linkage — prune
  cajaSessionId: UuidSchema.nullable().optional(),
  parentTabId: UuidSchema.nullable().optional(),                 // split-tab linkage — prune (D-09)
  splitMode: z.enum(['item', 'evenly', 'by_person', 'by_amount']).nullable().optional(), // split-tab — prune (D-09)
  splitLabel: z.string().max(50).nullable().optional(),          // split-tab — prune (D-09)
  version: z.number().int().nonnegative().optional(),
});
```
Fields to keep as-is: `id`, `customerName`, `staffId`, `shiftId`, `openedAt`, `closedAt`, `status`, `notes`, `orders`, `items`, `subtotal`, `staff`, `cajaSessionId`, `version`. `tableNumber` is ambiguous — it may double as a generic "table/counter number" concept outside pool billiards; confirm with the planner before removing (low-risk either way, it's nullable).

### Widgets (`src/widgets/`) — `[VERIFIED: directory listing]`

**Remove:** `PoolTableGrid`, `PoolTableOccupancyPanel`, `TableStatusPanel`, `KdsBoard`, `KitchenPrepDashboard`, `WaitlistQueue`, `WaitlistAnalyticsReport`, `RappiOrdersPanel`, `ComboMixReport`, `ComboOverrideReport`, `RecipeVarianceReport`, `IngredientsTable`, `ManageIngredientsTab`, `ModifierPopularityReport` (report *of* modifier-inventory-rule popularity — verify it isn't reused by the generic modifier system before deleting), `TipBucketDistributionPanel`, `TipDistributionPanel`, `DeletionsPreSendPanel`/`DeletionsPostCloseReport` (**keep** — these are generic order-item-deletion audit reports, not bar-specific; verify against REP-02's "hourly breakdown, payment-method reports" wording, they're adjacent generic reporting, not named for removal by any decision).

**Keep:** `CajaDashboard`, `CajaReportPanel`, `CategoryRevenuePanel`, `EditHistoryTable`, `EmployeeSelector`, `HelpSheet`, `HomeDashboard` (pruned), `HourlyBreakdownPanel`, `LogoImage`, `LowStockAlert`, `OpenUnitsTab`, `OrderPanel` (verify — used by retained `/pos`-adjacent flows via `add-item-to-tab`; confirm it isn't `/pos`-page-only before keeping), `PaymentModal`, `PaymentPane`, `PINLoginForm`, `ProductSalesPanel`, `RBACDashboard`, `RefundsList`, `RefundsRegister`, `SettingsTabsPanel` (pruned), `StaffDashboard`, `StaffSalesPanel`, `StockMovementsList`, `AuditLogTable`, `PaymentMethodsReport`, `VoidRefundPanel`.

### Settings tabs (`src/widgets/SettingsTabsPanel/tabs/`) — `[VERIFIED: directory listing]`

| Tab | Disposition |
|---|---|
| `BackupSettingsTab`, `BillingSettingsTab`, `EmailReceiptsSettingsTab`, `GeneralSettingsTab`, `HardwareSettingsTab`, `LanguageSettingsTab`, `ProductsSettingsTab` | KEEP |
| `PoolTablesSettingsTab` | **REMOVE** (D-21 spirit — bar-specific config) |
| `RappiSettingsTab` | **REMOVE** |
| `TipDistributionSettingsTab` | **REMOVE** — D-21 explicit |

### Edge functions (`supabase/functions/`) — `[VERIFIED: directory listing + grep for domain keywords]`

| Function | Disposition |
|---|---|
| `process-payment`, `process-split-payment`, `void-order`, `create-staff`, `get-server-time`, `send-receipt-email`, `settings-backup`, `settings-restore`, `settings-test-email`, `settings-email-status` | KEEP |
| `rappi-sync-menu`, `rappi-webhook` | **REMOVE** |
| `send-waitlist-notification` | **REMOVE** |

## SQL-Side Removal Approach

### Supabase project separation is a hard prerequisite (D-05/D-06)

`[VERIFIED: supabase/config.toml:5]` — the currently-linked project ref is `shsrhxleopmovzpzqmex`. This project holds real, live bar transaction data (per CONTEXT.md's D-05, surfaced by the user, not discoverable from code alone). **No DROP migration in this phase may ever run against this project ref.**

Sequence (execution-time, per D-06):
1. `supabase projects create <name> --org-id <org> --db-password <pw> --region <region>` — provision a brand-new project. `[CITED: supabase.com/docs/reference/cli/supabase-projects-create]`
2. `supabase link --project-ref <new-ref>` — repoint the local CLI at the new project, updating `supabase/config.toml`'s `project_id`. `[CITED: supabase.com/docs/reference/cli/supabase-link]`
3. `supabase db push` — replay the full existing 144-file migration history onto the new project to establish baseline schema (this includes all bar/pool tables — they must exist before the new DROP migrations can reference them). `[CITED: supabase.com/docs/guides/deployment/database-migrations]`
4. Update the app's `.env`/`.env.local` `SUPABASE_URL`/`SUPABASE_ANON_KEY` (and any Tauri-side config) to the new project's values *before* any client-side or E2E verification runs.
5. Only after step 4 do the new bar/pool DROP migrations (D-18/D-19/D-20) get authored and pushed.

**This ordering matters:** if the DROP migrations are written and applied before the app config is repointed, there is a live risk of accidentally running `supabase db push` while still linked to the production bar project. Recommend the plan add an explicit verification task ("confirm `supabase/config.toml` project_id ≠ `shsrhxleopmovzpzqmex`") before any DROP migration file is applied.

### What the DROP migrations must remove, per table family (from migration filename audit)

`[VERIFIED: supabase/migrations/ directory listing, 144 files]`. Group by D-20's per-feature split:

| Group | Tables/columns | Key migrations to reverse-engineer from |
|---|---|---|
| Pool/resources | `resources` (renamed from `pool_tables`), `pool_sessions`, `resources.is_temp`/floating columns, `resources` triggers | `20260414000005_pool_tables.sql`, `20260420000008_pool_tables_bartender_update.sql`, `20260421000002_pool_tables_type_column.sql`, `20260728000001_rename_pool_tables_to_resources.sql`, `20260728000002_resources_is_temp_floating.sql`, `20260728000003_deactivate_floating_resource_trigger.sql`, `20260807000001_pool_session_atomic_rpcs.sql`, `20260710000005_evaluate_promotions_pool_grant.sql`, `20260710000006_stop_pool_session_rpc.sql`, `20260713000002_fix_transfer_pool_session_version_bump.sql` |
| KDS | `kds`-related tables/RPCs, `kds_enabled` setting | `20260422000004_kds_core.sql`, `20260422000006_kds_enabled_setting.sql` |
| Waitlist | `waitlist_entries`, `waitlist_notifications`, notify trigger | `20260501000001_waitlist_entries.sql` through `20260501000004_waitlist_trigger_url.sql` |
| Rappi | `rappi_orders` (**in `supabase_realtime` publication — must `ALTER PUBLICATION supabase_realtime DROP TABLE rappi_orders`**, added by `20260417100000_rappi_orders.sql:39`) | `20260417100000_rappi_orders.sql` |
| Combos/recipes/ingredients | `product_combo_flags`, combo schema/triggers/view/RPCs, `ingredients`, `recipes`, prep extension | `20260424000004` through `20260425000005`, `20260428000005`, `20260426000001`, `20260426000011`, `20260428000001`, `20260429000002`, `20260707000001` (also touches modifier depletion — see note below) |
| Prep batches | `prep_productions` table + trigger, caja/prep RPCs | `20260429000001_prep_productions_table.sql`, `20260429000003_prep_productions_trigger.sql`, `20260703000003_caja_open_prep_batch_rpcs.sql` |
| Promotions | `promotions` schema, `applied_promotions`, evaluate RPC, pool grant | `20260710000001` through `20260710000008` |
| Modifier-inventory rules | `modifier_inventory_rules` table + created_at fix, popularity RPC (verify popularity RPC isn't reused by a kept generic modifier-groups feature before dropping) | `20260706000002_modifier_inventory_rules_table.sql`, `20260707000002_modifier_inventory_rules_created_at.sql`, `20260721000003_modifier_popularity_rpc.sql` |
| Tip distribution | `tip_distribution_entries` table, `close_caja_session` tip-distribution hook | `20260709000001_tip_distribution_entries_table.sql`, `20260709000002_close_caja_session_tip_distribution.sql` — **this migration modifies `close_caja_session`, a function every caja close depends on; the DROP migration must restore a version of `close_caja_session` without the tip hook, not just drop the table**, or every caja close will start erroring |
| Tab pool/rappi/split-tab linkage (not the whole `tabs` table — D-08) | `pool_session_id`/table columns on `tabs`, split-tab columns/RPCs, transfer columns | `20260420000003_transfers.sql`, `20260420155050_add_previous_table_id_to_pool_sessions.sql`, `20260427000000_tab_status_split_enum.sql`, `20260427000001_split_bill_schema.sql`, `20260427000002_split_tab_rpcs.sql`, `20260713000001_fix_transfer_tab_version_bump.sql`, `20260708000001_fix_split_tab_rpcs_version_bump.sql` |

**`deplete_for_order_item` has 5 versions (v1 through v5, latest `20260729000004`)** and each version's evolution touched combo depletion, modifier-ingredient collision handling, and open-units depletion. Since `ingredients`/`recipes`/`combos` are being dropped but `open_units` is being **kept**, the DROP migration for combos/recipes must re-derive a `deplete_for_order_item` version that keeps open-units depletion logic but removes combo/recipe/ingredient depletion — **do not just drop v5 and fall back to v1**, v1 predates open-units entirely. This is the single most fragile SQL change in the phase; treat it with the same caution CONCERNS.md documents for the `pool_tables → resources` rename.

### Realtime publication membership

`[VERIFIED: grep across supabase/migrations/*.sql]` — only `rappi_orders` (`20260417100000_rappi_orders.sql:39`) and `resources` (`20260728000001_rename_pool_tables_to_resources.sql:113-115`) show explicit `ALTER PUBLICATION supabase_realtime ADD TABLE` statements in migration files. **However**, `waitlist_entries` has a realtime-driven notify trigger (`20260501000003_waitlist_notify_trigger.sql`) and the app has a dedicated `WaitlistRealtimeListener.tsx` and `PoolRealtimeListener.tsx` in `src/app/` — confirm via `supabase inspect db` or a direct query of `pg_publication_tables` on the **new** project (not by grepping migrations alone) whether any table was added to the publication via the Supabase dashboard SQL editor outside of a tracked migration file, since that would not show up in this file-based audit.

### Example DROP migration shape (matches this repo's established convention)

```sql
-- Source: supabase/migrations/20260711000001_drop_happy_hour_columns.sql (existing repo convention)
-- =============================================================================
-- Phase 1 (strip-rebrand): DROP <feature> objects.
-- Irreversible for any already-written data in dropped tables; DOWN section
-- recreates schema only (D-19), does not restore data.
-- =============================================================================

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

## RBAC Role Rename Fallout (D-16/D-17)

`[VERIFIED: src/shared/lib/domain.ts:42-47]`
```typescript
export const UserRoleSchema = z.enum(['bartender', 'manager', 'admin', 'kitchen']);
export const UserRole = {
  BARTENDER: 'bartender',
  MANAGER: 'manager',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
} as const;
```
This is the single source of truth (per CLAUDE.md's "Single source of truth is `src/shared/lib/domain.ts`") — rename `'bartender'` → `'cashier'` and `BARTENDER: 'bartender'` → `CASHIER: 'cashier'` here first, then propagate.

`[VERIFIED: src/shared/lib/rbac.ts]` — `STAFF_ROLES` array, `BARTENDER_ACTIONS` set (rename to `CASHIER_ACTIONS`), and `ROLE_SET` record key `bartender:` all reference the string literal and must be updated in lockstep with `domain.ts`. Note `view_kds_bar` action is granted to bartender/cashier (`BARTENDER_ACTIONS` includes `'view_kds_bar'`) — since `/kds-bar` is being removed entirely (D-10), this action becomes dead regardless of the role rename; confirm with the planner whether `view_kds_bar` should be deleted from `STAFF_ACTIONS` alongside the route removal (not explicitly decided, `transfer_tab` is the only action D-17 names for deletion).

**Fallout surface for the rename** (grep-confirmed touch points, not exhaustive — plan should re-grep at execution time):
- DB: role check constraint on `profiles.role` (or equivalent enum type) — find via `supabase/migrations/` for the original `profiles` table creation and any later CHECK constraint migrations.
- `src/shared/lib/domain.ts:42-47` — `UserRoleSchema`, `UserRole` const.
- `src/shared/lib/rbac.ts` — `STAFF_ROLES`, `BARTENDER_ACTIONS`→`CASHIER_ACTIONS`, `ROLE_SET`.
- `e2e/helpers/auth.ts` — `type StaffRole = 'bartender' | 'manager' | 'admin' | 'kitchen'`, `staffForRole()`'s `role === 'bartender'` branch, and `E2E_BARTENDER_NAME`/`E2E_BARTENDER_PIN` env var names (rename or dual-read — env var renames require updating whatever `.env.local`/CI secret store holds them, which this research cannot read; flag as an execution-time manual step).
- i18n role-label strings across namespaces (`staff`, `settings`, `wAdmin`, `entities` — wherever a role display label exists) — grep `bartender` case-insensitively per D-22's approach.
- Seed/dev-user scripts (`npm run setup:dev` target) — creates dev users with role literals.
- Every E2E spec calling `loginAs(page, 'bartender')` — 09-rbac.spec.ts, 18-void-order.spec.ts, and others found by the grep audit in this research; these need the literal string swapped to `'cashier'`, not deletion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recreating case→piece / loose-unit checkout infra for CHK-05 | A new `open_units`-equivalent table/RPC set | The existing `open_units` table, `open-open-unit`/`correct-open-unit`/`void-open-unit` features, `products.parent_product_id` linkage | Already built, tested (`e2e/49-open-units.spec.ts`), and matches CHK-05's exact description ("case→piece breakdown") — verified via migration comment, not assumption |
| Detecting hidden SQL-side bar/pool dependencies | Manually re-deriving RLS/RPC/trigger dependency graphs from memory | `supabase inspect db` / direct `pg_publication_tables`, `pg_trigger`, `pg_policies` queries against the **new** project, cross-referenced with the migration-filename audit above | Migration files alone won't surface dashboard-applied changes (D-06's own "live service config not in git" caution generalizes here) |
| DROP migration DOWN scripts | Ad hoc rollback SQL written at incident time | The Phase 8+ convention already in this repo (`-- DOWN:` comment block, schema-only recreation) | D-19 explicitly requires matching this existing convention |

## Common Pitfalls

### Pitfall 1: Assuming a "generic-sounding" E2E spec file is safe to leave untouched
**What goes wrong:** Files like `22-sprint3-billing.spec.ts` ("billing") and `29-panel-toggle.spec.ts` ("panel toggle") sound generic but are 100% bar/pool-domain or target the deleted `/pos` page respectively.
**Why it happens:** File names were assigned by sprint number during original bar-pos development, not by domain.
**How to avoid:** Classify by reading `test.describe()`/`test()` titles and the routes each test navigates to, not by filename. Full classification table below.
**Warning signs:** A spec navigates to `/pool-tables`, `/pos`, `/kds*`, `/waitlist`, `/rappi`, or asserts on `pool-table-card`/`Carom`/`pos-order-panel` test IDs.

### Pitfall 2: Treating "delete whole spec file" as the only two options
**What goes wrong:** Several retained-domain spec files mix generic assertions with bar-specific `test()` blocks in the *same file* (e.g. `07-reports.spec.ts` has 31 test blocks spanning both generic payment-method reports and bar-specific `ComboMixReport`/`WaitlistAnalyticsReport` tabs; `23-payment-edge-cases.spec.ts` mixes generic cash/tip tests with Rappi- and pool-charge-specific tests).
**Why it happens:** E2E specs were grown incrementally per-sprint and grouped loosely by area, not strictly by domain.
**How to avoid:** Budget a third task category beyond "delete whole file" (D-11/D-12) and "leave untouched" (D-13): "keep file, remove specific `test()` blocks and update role-string literals."
**Warning signs:** `grep -c "test("` returns more than 1 block *and* the file has any bar/pool keyword hits — a strong signal of a mixed file requiring line-level review, not file-level deletion.

### Pitfall 3: Dropping `deplete_for_order_item`'s combo/recipe logic without preserving open-units depletion
**What goes wrong:** The function has 5 versions; v1-v3 predate open-units, v4-v5 layer in modifier-ingredient-collision and open-units handling on top of combo/recipe depletion. Reverting to an old version to "remove combo logic" would silently break open-units depletion (which must be kept, see `open-unit` finding above).
**Why it happens:** All 5 versions live as sequential `CREATE OR REPLACE FUNCTION` migrations with no version clearly marked "the one without combo logic."
**How to avoid:** Author a fresh `deplete_for_order_item_v6` in the DROP migration that starts from v5's logic and removes only the combo/recipe/ingredient branches, keeping open-units and plain-product depletion intact.
**Warning signs:** Any E2E spec exercising order-item depletion for a non-combo product fails after the combo DROP migration.

### Pitfall 4: `close_caja_session` after the tip-distribution DROP
**What goes wrong:** `20260709000002_close_caja_session_tip_distribution.sql` modified the shared `close_caja_session` function to compute and insert tip-distribution rows. If the DROP migration only drops the `tip_distribution_entries` table without restoring `close_caja_session` to a version without that INSERT, every caja close (a REP-01-critical, generic, kept feature) starts erroring.
**Why it happens:** The tip-distribution feature is bar-specific, but the function it hooked into is shared, generic infra.
**How to avoid:** DROP migration must `CREATE OR REPLACE FUNCTION close_caja_session` with the tip-distribution block removed, not merely drop the table it wrote to.
**Warning signs:** `02-caja.spec.ts` or `19-caja-entries.spec.ts`/`23-caja-entries.spec.ts` fail on caja-close after the tip-distribution DROP migration is applied.

### Pitfall 5: Env var / secret renames for the RBAC role rename are invisible to a code grep
**What goes wrong:** `e2e/helpers/auth.ts` reads `E2E_BARTENDER_NAME`/`E2E_BARTENDER_PIN` from environment — these live in `.env.local` (gitignored) and CI secret stores, not in any file this research (or a future grep) can read.
**Why it happens:** Secrets are deliberately kept out of git.
**How to avoid:** Either (a) rename the env vars in every place they're configured (local `.env.local`, CI secrets) and update `auth.ts` to match, or (b) keep the env var names as `E2E_BARTENDER_*` (internal-only, never user-visible) while renaming only the `StaffRole` type literal and `loginAs(page, 'cashier')` call sites. Recommend (b) — lower blast radius, D-16 targets user-facing/DB/code naming, not necessarily CI secret names.
**Warning signs:** E2E auth helper throws `Missing required env: E2E_CASHIER_NAME` in CI after a naive full-rename if the CI secret store wasn't also updated.

## Code Examples

### RBAC role rename — source of truth first (this repo's own convention)
```typescript
// Source: src/shared/lib/domain.ts:42-47 (read this session)
// BEFORE:
export const UserRoleSchema = z.enum(['bartender', 'manager', 'admin', 'kitchen']);
export const UserRole = {
  BARTENDER: 'bartender',
  MANAGER: 'manager',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
} as const;

// AFTER (D-16):
export const UserRoleSchema = z.enum(['cashier', 'manager', 'admin', 'kitchen']);
export const UserRole = {
  CASHIER: 'cashier',
  MANAGER: 'manager',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
} as const;
```

### Route removal + 404/redirect assertion (D-10)
```typescript
// New e2e assertion, following this repo's existing loginAs/goto pattern
// (pattern source: e2e/helpers/auth.ts, e2e/15-home-navigation.spec.ts)
for (const removedPath of ['/pos', '/pool-tables', '/kds', '/kds-bar', '/kitchen-prep', '/waitlist', '/rappi']) {
  test(`${removedPath} is unreachable after strip`, async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto(removedPath);
    // Router has no matching <Route>; React Router falls through to no element
    // rendered inside <Routes> (no catch-all is currently defined) — assert
    // the retained HomePage chrome/nav is NOT what's shown, and no removed-page
    // content is present. Exact assertion depends on whether the plan adds a
    // catch-all <Navigate to="/home"> or leaves it path-not-matched; router.tsx
    // currently has no catch-all route, so unmatched paths render an empty
    // <Routes> — confirm actual behavior when implementing this task.
  });
}
```
**Note for the planner:** `router.tsx` `[VERIFIED: src/app/router.tsx:1-198]` has no catch-all/`*` route today — an unmatched path renders nothing inside `<Suspense>`, not a redirect. D-10 says "404 or redirect" — decide which behavior to implement (add a catch-all `<Route path="*" element={<Navigate to="/home" />} />`, or assert on empty-render) since neither exists yet.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `/edit-history` route and its HomeDashboard tile should be **kept** (D-08's "keep tabs schema" implies keeping `edit-paid-tab`/its audit trail), despite D-14's tile list omitting it | File/Route Inventory, Routes table | Low — if wrong, it's one extra route+tile to delete later; no data-loss risk either way |
| A2 | `manage-modifier-groups`/`ModifierGroup` schema is generic-enough to keep, since no locked decision names it and it's wired into the retained `add-item-to-tab` feature | Entities/Features inventory | Medium — if it should be removed, `add-item-to-tab`'s `ModifierSheet.tsx` needs a follow-up edit to drop the modifier-picker UI, a nontrivial change to a kept feature |
| A3 | `tableNumber` field on `TabSchema` is pool-linked and safe to remove, vs. being a generic "counter/table number" concept some grocery layouts use | TabSchema field table | Low — nullable field, removing it if still needed just means re-adding it in Phase 2 |
| A4 | No table was added to the `supabase_realtime` publication via the dashboard SQL editor outside of a tracked migration file | SQL removal — Realtime publication section | Medium — if wrong, a Realtime subscription silently keeps firing for a dropped table after the DROP migration, likely surfacing as a client-side console error, not data loss |
| A5 | The pre-existing `.planning/specs/2026-08-10-supermarket-pos-pivot-design.md` draft (which said to strip the *entire* tabs schema, `edit-paid-tab`, `reopen-tab`) is **superseded** by CONTEXT.md's D-08/D-09, which explicitly correct this to a schema-keep | User Constraints section (cross-reference) | High if the planner reads the older spec file first — it directly contradicts the locked decision; flagged explicitly so the planner doesn't reconcile toward the wrong source |

## Open Questions (RESOLVED)

1. **`/edit-history` route/tile fate**
   - What we know: D-14 lists exactly 7 retained HomeDashboard tiles and does not include `/edit-history`. D-08 keeps the tabs schema including (by implication) `edit-paid-tab`'s audit trail, which is what `/edit-history` displays (`useAuditLogs({ action: 'tab.edit_paid' })`, `[VERIFIED: src/widgets/EditHistoryTable/EditHistoryTable.tsx:44-47]`).
   - What's unclear: Whether D-14's omission was a deliberate 8th removal or an oversight during the discuss-phase (the phase boundary text and D-08/D-09 never mention `edit-paid-tab`/`reopen-tab`/`/edit-history` for removal).
   - Recommendation: Keep it (matches D-08's broader intent to preserve tabs-schema-based generic capabilities); this is Assumption A1 above. Low cost to be wrong either way.
   - RESOLVED: Kept — Plan 01-04 explicitly retains the `/edit-history` route and its HomeDashboard tile (8 retained tiles, `/edit-history` listed alongside `/payments`, `/staff`, `/reports`, `/inventory`, `/settings`, `/rbac`, `/audit`), matching the recommendation above.

2. **`manage-modifier-groups` / `ModifierGroup` fate**
   - What we know: Not named in any of the 22 locked decisions or the Phase Boundary summary text (which explicitly names "modifier-inventory rules" but not "modifier groups"). It's used by the retained `add-item-to-tab` feature's `ModifierSheet.tsx`, and by KDS's modifier/notes display (`e2e/18-modifier-notes-kds.spec.ts`, being deleted).
   - What's unclear: Whether a grocery POS has any use for "product options" (e.g. no direct grocery analogue to "no ice"/"extra cheese") or whether this should simply carry forward unused until a future phase decides.
   - Recommendation: Leave `ModifierGroup` schema/feature in place for Phase 1 (lowest-risk option — it's dead weight, not a broken dependency, if grocery never uses it) and let the planner decide whether to explicitly strip it now or defer; do not delete it implicitly as a side effect of deleting `18-modifier-notes-kds.spec.ts` and KDS.
   - RESOLVED: Kept — Plan 01-09's Task 1 explicitly leaves `src/features/manage-modifier-groups/` and `ModifierGroupSchema`/`ModifierGroupItemSchema`/`ProductModifierGroupSchema` in `domain.ts` untouched, matching the recommendation above; only `modifier-inventory-rule` (a distinct concept) is stripped.

3. **Rust crate / Tauri `identifier` rename scope**
   - What we know: `src-tauri/Cargo.toml` has `name = "bar-pos"` and `name = "bar_pos_lib"` (crate identifiers, referenced by `use bar_pos_lib::...` internally); `tauri.conf.json` has `"identifier": "com.yourcompany.barpos"` (the OS-level app identifier controlling install path/WebView2 data folder) and `"productName": "Bar & Pool Parlor POS"`. None of these are named by D-03 (which only names `package.json` name, the window `title`, README, footer/about text).
   - What's unclear: Whether full identity consistency requires renaming these too, versus leaving internal/OS-level identifiers alone as out of D-03's explicit scope.
   - Recommendation: Leave `Cargo.toml` crate names and `tauri.conf.json`'s `identifier` field untouched in Phase 1 (renaming the Tauri `identifier` changes the installed app's data directory path on end-user machines — a much higher-risk, higher-blast-radius change than a string rename, and D-03 doesn't ask for it). Do rename `productName` (user-visible in Start Menu/installer) and the printed-receipt `appTitle` string (`[VERIFIED: src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json:36]`, currently `"Bar & Pool Parlor POS"` in both locales) — these are genuinely user-visible strings D-03's opening sentence ("all user-visible + config strings") covers even though not itemized by name.
   - RESOLVED: Left untouched — Plan 01-02's Task 1 explicitly renames `productName`, window `title`, and `index.html`'s `<title>`, while leaving `tauri.conf.json`'s `identifier` field and `Cargo.toml`'s crate names (`bar-pos`, `bar_pos_lib`) untouched, matching the recommendation above; `pdf.appTitle` is also renamed in Task 2.

4. **Realtime publication membership beyond migration files**
   - See Assumption A4. Recommend a verification task against the **new** Supabase project's `pg_publication_tables` before/after the DROP migrations, not just a migration-file grep.
   - RESOLVED: Verified via live query — Plans 01-05 (`rappi_orders`) and 01-06 (`resources`) assert absence from `pg_publication_tables` in their acceptance criteria, and Plan 01-08 (`waitlist_entries`) runs a live `pg_publication_tables` query against the new project before deciding whether to emit the `ALTER PUBLICATION ... DROP TABLE` statement — all three query the live new-project catalog, not migration-file history.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase`) | D-06 project provisioning, migration push | Not directly probed this session (package.json lists `"supabase": "^2.91.1"` as a devDependency, invoked via `npx supabase`) | ^2.91.1 (devDependency) | — |
| Node/npm | All frontend build/test commands | Assumed present (existing project, `npm run` scripts used throughout CLAUDE.md) | Not re-verified this session | — |
| A Supabase organization with capacity for a new project | D-06 | Cannot be verified from this environment — requires the user's Supabase account/org | — | If org has no spare project slots, may need to delete/upgrade an unused project first; flag to user before execution |

**Missing dependencies with no fallback:** None identified as blocking — Supabase CLI is already a project devDependency.
**Note:** Actual creation of the new Supabase project (D-06) requires interactive `supabase login`/org selection or a Supabase personal access token — this is an execution-time human/credential step (`checkpoint:human-action` per this project's testing policy, not a `human_needed` verification state), not something researchable further in advance.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No new surface | PIN-based auth unchanged by this phase |
| V3 Session Management | No new surface | Unaffected |
| V4 Access Control | Yes | RBAC role enum rename (D-16) must be applied atomically across DB constraint + TS schema + RLS policies referencing `'bartender'` literal — a partial rename (e.g. DB constraint updated, an RLS policy still checking `role = 'bartender'`) silently locks out the renamed role from formerly-accessible rows. Grep every RLS policy for the literal `bartender` string, not just table/column DDL. |
| V5 Input Validation | No new surface | No new user input introduced this phase |
| V6 Cryptography | No new surface | Unaffected |
| V14 Configuration | Yes | Supabase project separation (D-05/D-06) is fundamentally a configuration-isolation control: prevents a destructive-migration class of incident against production data. The `.env`/`config.toml` repoint must happen and be verified *before* any DROP migration is authored against the wrong target, not after. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Running a DROP migration against the linked production project by mistake (mis-set `supabase/config.toml` `project_id`) | Denial of Service / Repudiation (irreversible data loss, no undo per D-05) | Verify `project_id` != `shsrhxleopmovzpzqmex` as an explicit gate before any `supabase db push` of a DROP migration; consider a CI/pre-commit grep asserting the linked ref matches an allowlist of non-production project IDs during this phase's execution window |
| Stale RLS policy referencing the old `'bartender'` role literal after the DB enum/constraint is renamed | Elevation of Privilege / Access Control bypass | Grep all `supabase/migrations/*.sql` for `bartender` (case-sensitive, as a SQL string literal) in addition to code, not just the `profiles.role` constraint definition itself |
| Dangling Realtime subscription on a dropped table (client subscribes, table no longer exists) | Denial of Service (client-side error loop, not a security breach but a reliability regression) | Remove `PoolRealtimeListener.tsx`/`WaitlistRealtimeListener.tsx` subscription code in the same commit as the corresponding SQL DROP + `ALTER PUBLICATION ... DROP TABLE`, verified together, not sequenced across separate unverified commits |

## Sources

### Primary (HIGH confidence — read directly this session)
- `src/app/router.tsx` — full route table
- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` — tile list
- `src/shared/lib/rbac.ts`, `src/shared/lib/domain.ts` (lines 38-51, 431-461, 731-757, 808-841) — RBAC/domain schemas
- `supabase/config.toml` (line 5) — linked project ref
- `supabase/migrations/` — full 144-file directory listing + content of `20260729000001_open_units_table.sql`, `20260711000001_drop_happy_hour_columns.sql`
- `src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json` (line 36), `pages.json` — user-visible bar strings
- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json` — identity/config files
- `e2e/*.spec.ts` (all 61 files, keyword-classified; ~12 files' content read directly for verification)
- `e2e/helpers/auth.ts` — role literal fallout surface
- `.planning/codebase/CONCERNS.md` — `pool_tables → resources` fragility precedent, tip-distribution/split-payment fragility notes
- `.planning/phases/01-strip-rebrand/01-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/specs/2026-08-10-supermarket-pos-pivot-design.md`

### Secondary (MEDIUM confidence)
- [Supabase CLI reference — Create a project](https://supabase.com/docs/reference/cli/supabase-projects-create) — project provisioning flags
- [Supabase CLI reference — Link to a Supabase project](https://supabase.com/docs/reference/cli/supabase-link)
- [Database Migrations | Supabase Docs](https://supabase.com/docs/guides/deployment/database-migrations) — migration push workflow

### Tertiary (LOW confidence)
- None — no unverified WebSearch-only claims used for anything load-bearing in this research.

## Metadata

**Confidence breakdown:**
- File/route/component inventory: HIGH — every disposition verified by reading the actual file, not inferring from name
- SQL removal approach: HIGH for what to remove (migration filenames read directly), MEDIUM for exact DDL (not hand-written, left as planner-level task since it requires the new project to exist first)
- E2E classification: HIGH for the ~26 identified full-delete files and ~15 clean-keep files; MEDIUM for the ~20 "keep but needs per-test edits" files where only keyword density was checked, not every test block read
- RBAC rename fallout: HIGH for code/schema touch points, MEDIUM for env var/secret touch points (cannot read `.env.local` or CI secret store from this environment)
- Security domain: HIGH — the one real risk (D-05 production DB) is already correctly identified and locked by the user; this research reinforces the verification gate around it

**Research date:** 2026-08-10
**Valid until:** Effectively unbounded for the SQL/file inventory (static snapshot of this specific codebase state) — re-verify only if the codebase changes materially before planning executes, or if the phase is significantly delayed past this session.
