# Phase 27: Promotions & Discount Management - Research

**Researched:** 2026-09-01
**Domain:** In-repo feature extension — new domain entity (promotions) + server-side atomic-RPC pricing extension. No new external libraries.
**Confidence:** HIGH (all core claims verified by reading the actual source files this session — this phase is 95% "extend our own code," not third-party integration)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flat threshold, not tiered/escalating — one `days_threshold` → one `discount_%`, no
  step-up as expiry nears. (User initially picked tiered defaults but a conflict check confirmed
  the flat/single-value shape.)
- **D-02:** Global rate — one flat threshold/discount applies to every product's expiry-proximity
  trigger, not per-category.
- **D-03:** Admin-editable in Settings, not hardcoded — mirrors the existing near-expiry-alert
  threshold (`useNearExpiryAlerts`, default 14 days, `src/entities/inventory/model/queries.ts:233-267`).
- **D-04:** Default values: **14 days → 15% off**. Reuses the existing near-expiry-alert default
  (14 days) as the discount trigger point too.
- **D-05:** Best price always wins, uniformly — across product-level, category-level, AND the
  expiry-proximity auto-discount, all in one pool. No scope-specificity override, no special
  priority for the expiry trigger.
- **D-06:** Tie-break (identical scope, identical discount amount): most recently created
  promotion wins. No explicit admin-priority/ordering field.
- **D-07:** When combined discounts would drop a line item below recorded cost, checkout **blocks**
  and requires a **manager PIN override** — does NOT silently cap or drop the promotion. Mirrors
  the existing manager-PIN-gate pattern used for refunds.
- **D-08:** Floor is exactly cost — 0% margin, not a configurable minimum-margin percentage.
- **D-09:** New standalone route `/promotions`, own route guard (mirror `AuditRoute`/`ReportsRoute`
  pattern, admin-only), own Home dashboard nav tile (admin-only visibility).
- **D-10:** Applying an existing promotion at payment **coexists** with the existing whole-sale
  `discountType`/`discountValue` field on `PaymentSchema` — does NOT overwrite/reuse it. The
  existing field remains the ad-hoc/custom manager-PIN path; a new field/relation captures which
  specific promotion(s) applied.

### Claude's Discretion
- Exact DB schema/table naming for the new promotion entity (e.g. `promotions` table shape,
  scope-type enum values) — no precedent exists in the current schema (bar-pos-era `promotions`
  table was dropped, not a reference).
- Exact route-guard component name (e.g. `PromotionsRoute`) — follow `AuditRoute`/`ReportsRoute`.
- Exact wording/copy for `/promotions`, the below-cost override dialog, and the Settings field for
  the expiry-discount threshold/rate — follow i18n namespace conventions (`wAdmin` for admin
  management surfaces, `wPanels` for payment-screen additions).
- Whether the promotion-selection field on a sale lives as new columns on `order_items`/`payments`,
  or a new join table — schema shape is an implementation choice (Phase 23's bank-transfer
  table-vs-column precedent).
- Whether the shared discount/promotion-evaluation math lives in one exported TS function reused
  by both client display and mirrored in SQL — strongly recommended (Phase 24's `decomposeTax()`
  lesson), exact module shape is the planner's call. **Research finding below: this cannot be
  literally "one function" across the TS/plpgsql boundary — see Pitfall 1.**

### Deferred Ideas (OUT OF SCOPE)
- Per-category expiry-discount rates (D-02).
- Tiered/escalating expiry discount (the shape the user initially gestured at).
- Explicit admin-priority/ordering field for promotion tie-breaks (D-06).
- Configurable minimum-margin floor above cost (D-08).
- Batch/lot-level expiry tracking (`.planning/seeds/batch-lot-expiry-tracking.md`) — `inventory.expiry_date`
  stays a single column, overwritten on each receiving; a promotion's expiry-proximity trigger
  reads that one column, not a per-lot value.
- Bar-pos-era `promotions` engine (dropped Phase 1) is NOT a schema reference — it was combo/pool
  coupled and explicitly must not be resurrected (`.planning/notes/promotions-prior-art-and-dead-fields.md`).
- `CategorySchema.happyHourStart/End/Price`, `ProductSchema.happyHourPrice`, `isCombo`/
  `comboEligible`/`comboPriceOverride` in `domain.ts` are dead vestigial fields from that dropped
  engine — do not read/write them, do not anchor new promotion logic on their shape. A separate
  cleanup pass to physically drop them is out of scope for this phase.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROMO-01 | Promotion scoped to product/category/subcategory, `percent`/`fixed` type, active date range (store-local time); new `manage_promotions` RBAC action, admin-only | See "New `promotions` Table" and "RBAC: `manage_promotions`" below |
| PROMO-02 | Auto-trigger off `expiry_date` proximity — **flat threshold→discount** (CONTEXT.md D-01, overrides REQUIREMENTS.md's stale "tier table" wording), reusing the existing near-expiry threshold | See "Expiry-Proximity Trigger" — reuses `settings.near_expiry` |
| PROMO-03 | Live discounted price in cart at scan/add time (client display); `process_direct_sale_atomic` extended to recompute server-side as sole authority | See "process_direct_sale_atomic Extension Point" |
| PROMO-04 | Best-price-wins across all qualifying promotions on one line item | See "Best-Price-Wins Resolution" |
| PROMO-05 | Cashier applies existing promotion at payment; ad-hoc/custom discount needs manager PIN (mirrors refund gate); retire bar-pos-only `discountScope` values | See "Manager-PIN-Gate Pattern" and "PaymentSchema.discountScope Retirement" |
| PROMO-06 | Per-line-item snapshot (promotion id, rate, computed amount) mirroring `order_items.cost_price_snapshot`; refund/reopen restores historical discount; margin report uses discounted price | See "Cost-Price-Snapshot Pattern to Mirror" |
| PROMO-07 | Floor guard: no combination of discounts drops a line below recorded cost | See "Floor-Guard Implementation" |
| PROMO-08 | Offline discount snapshotted at add-to-cart time; promotion-changed-before-sync is flagged, not silently re-priced | See "Offline Queue Interaction" (Pitfall 4) |
| PROMO-09 | Playwright E2E coverage per mandatory-automated-testing policy | See "Validation Architecture" |

</phase_requirements>

## Summary

This phase adds one new domain entity (`promotions`) and extends the one RPC that is already the
sole price authority for every sale (`process_direct_sale_atomic`, verified live at
`supabase/migrations/20260831000005_tax_inclusive_mode.sql` — the most recent migration touching
it, confirmed by its own header comment declaring the 17-parameter signature "UNCHANGED from the
live definition"). There is no new library to add: Zod for the new schema, the existing
`role_permissions`/RLS/SECURITY-DEFINER-RPC pattern for authorization, the existing
`ManagerPinDialog` for the PIN gate, and the existing `settings` key/value table for the
expiry-discount config are all sufficient.

Three structural facts drive most of the plan's shape. First,
`process_direct_sale_atomic` **currently hard-rejects any discount** on a direct sale
(`IF p_discount_scope IS NOT NULL OR ... THEN RETURN ... 'DISCOUNT_UNSUPPORTED' ...` — verified,
same file) — this gate exists because "direct sale" replaced the old tab/bar checkout where
discounts made sense, and nobody has needed them here until now. Lifting this gate is itself a
task, not just adding new promotion logic alongside it. Second, this RPC is **not** directly
callable by an authenticated client — it's `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC, anon,
authenticated`, `GRANT ... TO service_role` only, invoked exclusively through the
`process-direct-sale` Edge Function (verified,
`supabase/functions/process-direct-sale/index.ts`). Any promotion-evaluation logic that needs to
run "at checkout" server-side has exactly one authoritative home: inside this plpgsql function's
existing per-item loop, right where `v_expected_price` is derived — there is no sensible place to
put it in the Edge Function's TS layer (that layer only forwards params and re-validates shape; the
DB is still where cost-price rows are locked `FOR UPDATE`). Third, the codebase's own precedent for
"one shared function, both boundaries" (`decomposeTax` in `supabase/functions/_shared/tax.ts`,
imported directly into a Vitest client-side test and into `entities/payment/model/queries.ts`
verbatim via a relative import that reaches outside `src/`) only works because that function has
**zero imports** and both call sites are TypeScript/Deno-compatible runtimes. The actual
authoritative promotion pricing math still has to be written twice — once in TS for the client's
live cart display, once in plpgsql inside the RPC — because plpgsql cannot import a TS module. See
Pitfall 1 for how to keep those two implementations from drifting.

**Primary recommendation:** Add a `promotions` table (RLS via `role_permissions`/`manage_promotions`,
same pattern as `suppliers`), extend `settings.near_expiry`'s JSON value with a `discountPercent`
field (reusing the existing `thresholdDays`, not a new settings key), lift the `DISCOUNT_UNSUPPORTED`
gate in `process_direct_sale_atomic` to allow a **new, distinct** set of RPC parameters for
promotion-application (leaving the existing `p_discount_scope/type/value/amount` params as the D-10
ad-hoc/custom path, now finally wired up instead of always rejected), and evaluate best-price-wins
+ the floor guard inside the existing per-item loop before the subtotal accumulation line.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Promotion CRUD (create/edit/deactivate a promotion) | API/Backend (Supabase RLS + table) | Frontend Server/Browser (`/promotions` page, admin-only) | Simple CRUD on a new table — no RPC needed for writes if RLS `WITH CHECK` on `manage_promotions` is sufficient (mirrors `suppliers_manage` policy), same as products/categories management today |
| Live discounted price at scan/add-to-cart | Browser/Client | — | Explicitly "client display only" per CONTEXT.md — a pure TS pricing function run against already-fetched `promotions`/`products`/`inventory` query data, no round-trip needed |
| Authoritative discount computation at checkout | API/Backend (`process_direct_sale_atomic`, plpgsql) | — | Sole price authority per PROMO-03; already the pattern for tax, cost-price snapshot, catalog-price validation — promotions must slot into the same trust boundary |
| Ad-hoc discount manager-PIN gate | Browser/Client (PIN entry via `ManagerPinDialog`) | API/Backend (RPC re-validates role via `get_user_role()`) | Mirrors `process_refund`'s exact two-layer pattern: client PIN check is UX-only, server independently re-checks role — never trust the client gate alone |
| Below-cost floor-guard override | API/Backend (RPC blocks/raises) | Browser/Client (dialog surfaces the block, re-submits with manager auth) | The floor check needs `cost_price` locked `FOR UPDATE` in the same transaction as the sale — this is a server invariant, not a UI validation |
| Promotion/discount snapshot for refund/reopen/margin | Database/Storage (`order_items` columns) | API/Backend (written once, inside `process_direct_sale_atomic`) | Exact mirror of the existing `cost_price_snapshot` column pattern — same table, same "written once at sale time, read forever after" lifecycle |
| Expiry-proximity threshold/rate config | Database/Storage (`settings` table, `near_expiry` key) | Frontend Server (Settings tab, admin-only) | Reuses the existing `settings` key/value JSON pattern (`NearExpirySettingsSchema`) rather than a new table |

## Standard Stack

No new external packages. This phase is implemented entirely with what's already installed:

| Library | Version (installed) | Purpose | Why no new package |
|---------|---------|---------|--------------|
| Zod | 4.5.4 [VERIFIED: package.json] | New `Promotion`/`PromotionCreate`/`PromotionUpdate` schemas in `domain.ts` | Single source of truth for domain types, per CLAUDE.md — same pattern as every other entity |
| Supabase JS / postgres RLS | already in use | `promotions` table CRUD, RPC extension | No client library gap — this is app-level SQL + RLS policies |
| `@tanstack/react-query` | ^5.99.0 [VERIFIED: package.json] | `usePromotions()`, mutation hooks | Same pattern as `useCategories`/`useNearExpiryAlerts` |
| Playwright | ^1.59.1 [VERIFIED: package.json] | E2E coverage (PROMO-09) | New `e2e/promotions/` folder, same harness |

## Package Legitimacy Audit

**Not applicable — this phase installs zero new external packages.** Every dependency needed
already exists in `package.json` and is used elsewhere in the codebase for the identical purpose
(Zod schemas, TanStack Query hooks, Supabase RPC/RLS, Playwright E2E). No `npm install` step
belongs in this phase's plan.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────── BROWSER (client display only) ───────────────────────────────┐
│                                                                                                 │
│  ProductGrid / barcode scan                                                                    │
│        │  scan/select product                                                                  │
│        ▼                                                                                        │
│  evaluatePromotions(product, activePromotions, nearExpirySettings)  ◄── new pure TS fn         │
│        │  { bestDiscount, promotionId, discountedUnitPrice }                                    │
│        ▼                                                                                        │
│  cartStore.addItem(product, modifiers, discountedUnitPrice)   ◄── EXISTING param, unused today │
│        │  (unitPrice override — verified: cartStore.ts:21, "e.g. happy hour resolved price")   │
│        ▼                                                                                        │
│  Cart line shows discounted price live (PROMO-03)                                              │
│        │                                                                                         │
│        ▼                                                                                         │
│  PaymentPane: cashier optionally "apply existing promotion" (new field) OR                      │
│               "ad-hoc discount" → ManagerPinDialog (existing component, D-07/PROMO-05)          │
│        │  submit()                                                                              │
└────────┼─────────────────────────────────────────────────────────────────────────────────────┘
         │ POST /functions/v1/process-direct-sale  (Bearer JWT)
         ▼
┌──────────────────────────── EDGE FUNCTION (process-direct-sale) ─────────────────────────────┐
│  Zod-validate body → forward to RPC via service-role client (unchanged shape, new params added)│
└────────┼───────────────────────────────────────────────────────────────────────────────────────┘
         │ admin.rpc('process_direct_sale_atomic', {...})
         ▼
┌───────────────────────── DATABASE (process_direct_sale_atomic, SECURITY DEFINER) ────────────┐
│  FOR EACH item:                                                                                 │
│    lock products/inventory FOR UPDATE → v_catalog_price, v_cost_price                          │
│    [NEW] evaluate qualifying promotions (product_id / category_id / expiry-proximity)          │
│          → v_best_discount_amount (best-price-wins, D-05/PROMO-04)                              │
│    [NEW] v_line_price := v_expected_price - v_best_discount_amount                              │
│    [NEW] IF v_line_price < v_cost_price AND NOT p_manager_override THEN                        │
│              RETURN 'BELOW_COST_REQUIRES_OVERRIDE'  (PROMO-07/D-07)                             │
│    accumulate v_subtotal from v_line_price (not v_expected_price)                                │
│    v_derived_items += promotion_id, discount_rate, discount_amount  (PROMO-06 snapshot)         │
│  tax computed on discounted subtotal (mode-aware, existing taxInclusive logic unchanged)         │
│  INSERT order_items (..., promotion_id, discount_amount)  ◄── mirrors cost_price_snapshot        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── entities/
│   └── promotion/                       # NEW entity, mirrors entities/inventory shape
│       ├── model/
│       │   ├── types.ts                 # re-export Promotion* types from domain.ts
│       │   ├── queries.ts               # usePromotions(), useMutationCreate/Update/DeactivatePromotion
│       │   └── promotion-pricing.ts     # pure TS: evaluateBestPromotion(product, promotions, nearExpirySettings)
│       └── ui/
│           └── PromotionCard.tsx        # (if a list/table needs a row component — planner's call)
├── features/
│   ├── manage-promotions/               # NEW — CRUD form/dialog, admin-only
│   └── apply-promotion-at-payment/      # NEW — payment-screen "apply existing promotion" selector
├── pages/
│   └── PromotionsPage.tsx               # NEW — thin route container
├── app/
│   ├── router.tsx                       # register /promotions + PromotionsRoute
│   └── promotions-route.tsx             # NEW — mirrors audit-route.tsx exactly
└── widgets/
    ├── SettingsTabsPanel/tabs/
    │   └── NearExpirySettingsTab.tsx    # EXTEND — add discountPercent field to the same tab
    └── PaymentPane/ui/PaymentPane.tsx   # EXTEND — new "apply promotion" control alongside existing discount field

supabase/
├── migrations/
│   └── <timestamp>_promotions_schema.sql        # table + RLS + role_permissions row + settings extension
│   └── <timestamp>_process_direct_sale_atomic_promotions.sql  # CREATE OR REPLACE, byte-identical signature style
└── functions/
    └── process-direct-sale/index.ts     # EXTEND BodySchema + forwarded params only
```

### Pattern 1: SECURITY DEFINER RPC with `role_permissions` authorization check

**What:** Every write-capable RPC that isn't a straightforward RLS-covered CRUD op declares
`SECURITY DEFINER SET search_path = public`, checks the caller's role via `role_permissions` (or
`get_user_role()` for the simpler two-role gates), and returns a `jsonb_build_object('ok', false,
'code', ..., 'message', ...)` envelope rather than raising for expected/validation failures —
raising (`RAISE EXCEPTION`) is reserved for actually-unexpected states or ones that must propagate
a Postgres error code (e.g. optimistic-concurrency `P0V01`).

**When to use:** Any new promotion-management RPC, or the extension to `process_direct_sale_atomic`.

**Example (verified, `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:69-73`):**
```sql
PERFORM 1 FROM profiles p JOIN role_permissions rp ON rp.role = p.role
  WHERE p.id = p_staff_id AND rp.action = 'adjust_inventory';
IF NOT FOUND THEN
  RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to receive shipments');
END IF;
```

**Simpler two-role variant (verified, `supabase/migrations/20260831000003_bank_transfers_schema.sql:544-551`,
used by `confirm_transfer_payment`):**
```sql
SELECT id INTO v_staff_id FROM profiles
WHERE id = auth.uid() AND role IN ('manager', 'admin');
IF NOT FOUND THEN
  RAISE EXCEPTION 'AUTH_FORBIDDEN: manager or admin role required';
END IF;
```
For `manage_promotions` (admin-only per PROMO-01), the equivalent check is
`role_permissions WHERE role = get_user_role() AND action = 'manage_promotions'` with only an
`('admin', 'manage_promotions')` row inserted (no `manager`/`cashier` row) — verified pattern at
`supabase/migrations/20260510000001_rls_rewrite_phase13.sql:330-333`, where `manage_settings`,
`manage_staff`, `delete_tab`, `view_all_shifts` appear ONLY under the admin block, never under
manager, to admin-gate an action.

### Pattern 2: RLS table policy pair (`_select_authenticated` + `_manage`)

**What:** A new table gets one `FOR SELECT TO authenticated USING (true)` policy (everyone can
read) and one `FOR ALL`/`FOR INSERT`+`FOR DELETE` policy gated on `role_permissions`.

**Example (verified, `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:45-48`):**
```sql
CREATE POLICY suppliers_select_authenticated ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_manage ON suppliers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'))
  WITH CHECK (EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products'));
```
Apply identically to `promotions`, swapping `action = 'manage_products'` for the new
`action = 'manage_promotions'`.

### Pattern 3: `settings` key/value extension, not a new settings key

**What:** `NearExpirySettingsSchema` (verified, `src/shared/lib/domain.ts:831-835`) is currently
`{ thresholdDays: number }` stored under `settings.key = 'near_expiry'`. D-03/D-04 explicitly say
"reuse the existing near-expiry-alert threshold... one number the admin already understands," so
the discount rate should be added as a **new field on the same schema/settings row**
(`discountPercent`), not a second settings key — this keeps "the expiry threshold" a single source
of truth for both the near-expiry alert badge and the auto-discount trigger.

**Example (extend, don't duplicate):**
```typescript
// src/shared/lib/domain.ts — extend existing schema
export const NearExpirySettingsSchema = z.object({
  thresholdDays: z.number().int().min(1).max(365).default(14),
  discountPercent: z.number().min(0).max(100).default(15), // NEW, PROMO-02/D-04
});
```
And the RPC's expiry-proximity check reads the same `settings WHERE key = 'near_expiry'` row it
would otherwise need a second lookup for.

### Pattern 4: Route guard component (`XxxRoute`)

**What:** A one-function component wrapping `usePermissions().can()`, redirecting to `/home` with
a toast on denial.

**Example (verified in full, `src/app/audit-route.tsx`):**
```typescript
export function AuditRoute({ children }: AuditRouteProps) {
  const { can } = usePermissions();
  if (!can('view_audit_log')) {
    toast.error('This page is restricted to managers and admins.');
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
```
`PromotionsRoute` is this exact shape with `can('manage_promotions')`.

### Pattern 5: Home dashboard admin-only tile

**What:** `ITEMS` array entries carry `requiredAction` (RBAC gate) and `managerLabelKey` (badge
copy shown when the current user doesn't have the action — `'homeDashboard.managerLabels.admin'`
vs `'.manager'`).

**Example (verified, `src/widgets/HomeDashboard/ui/HomeDashboard.tsx:68-74`, the `/settings` tile
— the closest admin-only precedent):**
```typescript
{
  path: '/settings',
  labelKey: 'homeDashboard.tiles.settings',
  icon: Settings,
  requiredAction: 'manage_settings',
  managerLabelKey: 'homeDashboard.managerLabels.admin',
},
```
Add an identical entry for `/promotions` with `requiredAction: 'manage_promotions'`.

### Anti-Patterns to Avoid

- **Reusing/repurposing `PaymentSchema.discountScope`/`discountType`/`discountValue` for
  promotion-application:** D-10 explicitly requires these stay the ad-hoc/custom path. A new field
  (column or join table) is needed for "which specific promotion(s) applied," or PROMO-06's
  refund-restore snapshot loses promotion identity.
- **Anchoring on the bar-pos-era `promotions`/`applied_promotions`/`evaluate_promotions_rpc`
  schema:** dropped Phase 1, combo/pool-coupled, explicitly flagged as not-a-reference in
  `.planning/notes/promotions-prior-art-and-dead-fields.md`.
- **Writing to `happyHourPrice`/`happyHourStart`/`happyHourEnd`/`isCombo`/`comboEligible`/
  `comboPriceOverride`:** dead vestigial columns from the dropped engine; always null today, and
  reintroducing writes to them would resurrect logic nothing else expects to run.
- **Computing the promotion discount only client-side and trusting it at checkout:** PROMO-03 is
  explicit that `process_direct_sale_atomic` remains the sole authority — the existing
  `PRICE_MISMATCH`/`AMOUNT_MISMATCH` anti-tamper checks in that RPC are the template; a promotion
  discount needs the identical "server recomputes and rejects on mismatch" treatment, not a
  passed-through discount amount trusted from the client.
- **Recursively applying a category promotion to child subcategories:** PROMO-01 says subcategory
  scoping is "a category row with `parentId` set — no new hierarchy needed." This reads as: a
  promotion's `category_id` matches products by exact `products.category_id = promotions.category_id`
  equality — it does NOT mean a promotion on a parent category auto-applies to every child
  subcategory's products. If roll-up-to-children behavior is actually wanted, that is a new
  requirement, not implied by PROMO-01's existing wording — flag as an open question for
  discuss-phase/plan-phase rather than assuming either direction.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Manager PIN verification UI | A new PIN dialog for promotions | `ManagerPinDialog` (`src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`) with a new `requiredAction` value | Already handles PIN entry, eligible-staff lookup, error states, and the open/close reset-state bug fix documented inline (lines 36-55) — a new dialog would have to rediscover that fix |
| Server-side role re-validation | A bespoke check in a new function | `get_user_role() NOT IN ('manager','admin')` (or the `role_permissions` join for admin-only) — same pattern `process_refund` and `confirm_transfer_payment` already use | Consistent, already-audited pattern; a bespoke check risks missing the "client PIN check is UX-only" defense-in-depth lesson this codebase already learned |
| Store-local timezone date-range comparison (PROMO-09 requirement) | A custom date-math helper | Check for an existing timezone utility first (`settings.general.timezone` already exists per `GeneralSettingsSchema`, verified `domain.ts:787-793`) — likely just a `date >= start_date AND date <= end_date` comparison against `CURRENT_DATE AT TIME ZONE <configured tz>` in SQL, not a new JS date library | The project doesn't have a date library dependency (no `date-fns`/`dayjs`/`luxon` in package.json observed) — introducing one for pure date-range comparison would be the over-engineered path; native `Date`/SQL `date`/`timestamptz` arithmetic is sufficient for whole-day boundaries |
| Cross-boundary pricing-math duplication tracking | Nothing to build — but DO write the property test | A parity test between the TS `evaluateBestPromotion()` and a fixture of expected SQL outputs, mirroring `src/shared/lib/__tests__/edge-tax.test.ts`'s `fc.property` pattern | This codebase already hit a live overcharge bug (Phase 24 tax) from duplicated math drifting between client and server — the fix there was rigorous parity testing, not a shared runtime (impossible across the TS/plpgsql boundary) |

**Key insight:** Nothing in this phase requires new infrastructure. Every mechanism needed
(RLS+role_permissions authorization, SECURITY DEFINER RPCs, settings key/value config, manager-PIN
gate, cost-price snapshot columns, route guards, admin-only nav tiles) already exists in this exact
codebase for a near-identical prior use case. The work is disciplined reuse, not invention.

## Common Pitfalls

### Pitfall 1: "One shared function" cannot literally cross the TS/plpgsql boundary
**What goes wrong:** The discretion note (and Phase 24's `decomposeTax()` lesson) suggests "one
function, no drift possible." A promotion-evaluation function CAN be shared between the client
cart display and... nothing else, because the RPC that must be the actual authority is written in
plpgsql, which cannot import a TypeScript module.
**Why it happens:** `decomposeTax` achieves cross-boundary sharing only because both its call sites
(client `entities/payment/model/queries.ts` and the `process-direct-sale` Edge Function) are
TypeScript/Deno-compatible runtimes reachable by a relative import (verified,
`entities/payment/model/queries.ts:17-20`, importing `../../../../supabase/functions/_shared/tax.ts`
directly). The authoritative pricing computation for promotions, however, has to happen inside
`process_direct_sale_atomic` itself (plpgsql) — not in the Edge Function's TS layer — because only
the RPC holds the `FOR UPDATE` row locks on `products`/`inventory` needed to prevent a race between
reading cost/catalog price and someone else changing it mid-transaction.
**How to avoid:** Accept that the algorithm exists in two languages. Keep it as simple as possible
(a `MAX()` over a small candidate list — not complex enough to justify a shared runtime), write one
canonical TS implementation (`entities/promotion/model/promotion-pricing.ts`, zero imports so it's
independently testable) for client display, and mirror the same logic in the RPC's plpgsql body.
Add a property-based parity test (`fast-check`, already a dependency) that runs a large random
matrix of {promotions, product, cost, expiry} inputs through the TS function and asserts the result
matches what a same-shaped SQL fixture/integration test returns from the RPC — this is the
practical equivalent of "structurally impossible to drift" here, following the same rigor Phase 24
applied to tax.
**Warning signs:** A cart shows one discount amount and the printed receipt shows a different one
for the same sale.

### Pitfall 2: `DISCOUNT_UNSUPPORTED` gate blocks direct-sale discounts by design, today
**What goes wrong:** A naive read of `process_direct_sale_atomic` might assume the existing
`p_discount_scope/type/value/amount` parameters already work for direct sales and only need a new
promotion parameter added alongside them. They do not — verified, the RPC unconditionally rejects
ANY of those four params being non-null:
```sql
IF p_discount_scope IS NOT NULL OR p_discount_type IS NOT NULL
   OR p_discount_value IS NOT NULL OR p_discount_amount IS NOT NULL THEN
  RETURN jsonb_build_object('ok', false, 'code', 'DISCOUNT_UNSUPPORTED', 'message', 'Direct-sale discounts are not supported');
END IF;
```
(verified, `supabase/migrations/20260831000005_tax_inclusive_mode.sql:67-70`, the current live body).
**Why it happens:** This RPC evolved from the original tab-based checkout where discounts were a
generic tab-level feature; when "direct sale" replaced tabs as the checkout UI, this gate was added
because nothing in the direct-sale flow used discounts yet.
**How to avoid:** This gate must be deliberately removed/reworked as its own task, not silently
bypassed. D-10 means: the ad-hoc/custom discount (PROMO-05) SHOULD now use these exact existing
params (finally wired up, gated by the same manager-PIN mirror pattern as `process_refund`), while
promotion-application needs distinct new params (e.g. `p_applied_promotions` or similar) so the two
paths don't collide. Both need the floor-guard check (PROMO-07) applied uniformly.
**Warning signs:** Any test asserting an ad-hoc discount on a direct sale returns
`DISCOUNT_UNSUPPORTED` after this phase ships is a sign the gate wasn't actually reworked.

### Pitfall 3: `process_direct_sale_atomic` is `service_role`-only — a promotion CRUD RPC likely isn't
**What goes wrong:** Copying `process_direct_sale_atomic`'s `REVOKE ALL ... GRANT ... TO
service_role` pattern for a new promotion-management RPC would force routing simple admin CRUD
through a new Edge Function unnecessarily.
**Why it happens:** Not every RPC in this codebase is `service_role`-only — `process_refund` and
`confirm_transfer_payment`/`dispute_transfer_payment` are `GRANT EXECUTE ... TO authenticated`
(verified, `supabase/migrations/20260510000002_rpc_role_guards.sql:315` and
`20260831000003_bank_transfers_schema.sql:594,654`), relying on `get_user_role()`/`auth.uid()` for
authorization instead of the service-role trust boundary. The `service_role`-only pattern is
reserved for RPCs that need to bypass RLS to touch multiple tables atomically in ways a normal
authenticated JWT's RLS policies wouldn't allow (like inserting into `tabs`/`orders`/`payments` in
one transaction).
**How to avoid:** Promotion CRUD is simple single-table writes gated by `manage_promotions` — this
likely doesn't need an RPC at all (plain RLS-protected `INSERT`/`UPDATE` via `supabase.from('promotions')`,
same as `useMutationCreateCategory`/`useMutationUpdateCategory`). Only the
`process_direct_sale_atomic` extension needs the `service_role`/Edge Function path, because that's
where the promotion recompute actually happens.
**Warning signs:** A plan that routes "create a promotion" through a new Edge Function when direct
RLS-gated table writes would do.

### Pitfall 4: Offline queue replay could apply a promotion that no longer exists (PROMO-08)
**What goes wrong:** `OfflineQueueProcessor` (Zustand `tabsStore.offlineQueue`) replays queued
mutations on reconnect. If a promotion is deleted/edited between an offline add-to-cart and
reconnect, a naive replay would either silently apply the stale discount or silently drop it.
**Why it happens:** The offline queue was designed for simple mutation replay (add item, adjust
stock), not for revalidating a snapshot against server state that may have since changed.
**How to avoid:** PROMO-08 explicitly requires the conflict be **flagged for review**, not silently
resolved either direction. This likely means: the offline-queued cart item carries its
client-computed discount snapshot (promotion id, rate, amount, computed-at timestamp); on replay,
`process_direct_sale_atomic` independently re-evaluates promotions server-side as it always does
(Pitfall 1/PROMO-03) and, if the server's authoritative discount differs from what the client
queued, this needs a payment-side flag/toast the cashier sees ("promotion changed since this was
added — review before completing") rather than the sale either failing outright or completing
silently with server-recomputed numbers the cashier never saw.
**Warning signs:** No test exercises "promotion deleted while an item sits offline in cart" —
PROMO-09 explicitly requires this scenario be covered.

### Pitfall 5: `CREATE OR REPLACE FUNCTION` on `process_direct_sale_atomic` must match the live signature byte-for-byte
**What goes wrong:** If the new migration's function signature doesn't match the 17-parameter
signature currently live (verified in full at
`supabase/migrations/20260831000005_tax_inclusive_mode.sql:18`), Postgres registers a second
overload instead of replacing the live one — silently leaving two versions of the function where
callers may hit either one non-deterministically.
**Why it happens:** Postgres function identity includes the parameter list; `CREATE OR REPLACE`
only replaces an exact signature match. This exact pitfall is already documented inline in the
tax-inclusive migration's own header comment (verified,
`20260831000005_tax_inclusive_mode.sql:5-9`: "Signature is UNCHANGED... CREATE OR REPLACE FUNCTION
is safe here and MUST match that signature byte-for-byte, or Postgres registers a second overload").
**How to avoid:** If new parameters are needed (e.g. `p_applied_promotions jsonb DEFAULT NULL`,
`p_manager_override boolean DEFAULT false` for the floor-guard bypass), append them at the end with
defaults, copy the exact existing 17-parameter list verbatim, and verify via
`\df process_direct_sale_atomic` (or an integration test) that exactly one overload exists after
migrating.
**Warning signs:** A migration that only lists "new" parameters instead of the full existing list;
two rows for the function in `pg_proc` after migrating.

## Code Examples

### Existing manager-PIN-gate wiring (mirror for below-cost override / ad-hoc discount)
```typescript
// Source: src/features/manager-pin-gate/ui/ManagerPinDialog.tsx (verified, full file read)
export interface ManagerPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredAction: StaffAction;   // new value needed, e.g. 'apply_custom_discount' or reuse 'process_refund'
  onSuccess: () => void;
}
```
The planner must decide whether the below-cost override and the ad-hoc discount gate reuse an
existing `StaffAction` (e.g. `process_refund`, since both are "manager-authorizes-an-exception"
actions) or need a new one added to `STAFF_ACTIONS` in `src/shared/lib/rbac.ts` — CONTEXT.md's
Claude's Discretion section doesn't lock this; recommend a new explicit action name for clarity in
audit logs (e.g. `override_below_cost_discount`), since conflating it with `process_refund` would
make audit-log entries ambiguous about which manager-gated action actually happened.

### Existing cost-price-snapshot column pattern to mirror (PROMO-06)
```sql
-- Source: supabase/migrations/20260818000002_order_items_cost_price_snapshot.sql (verified, full file)
ALTER TABLE order_items ADD COLUMN cost_price_snapshot numeric(10,2);
```
PROMO-06's promotion snapshot is the same shape: `ALTER TABLE order_items ADD COLUMN promotion_id
uuid REFERENCES promotions(id) ON DELETE SET NULL, ADD COLUMN discount_rate numeric, ADD COLUMN
discount_amount numeric(10,2)` (nullable — most line items won't have a promotion). Using
`ON DELETE SET NULL` (not `RESTRICT`/`CASCADE`) is important: PROMO-06 requires the discount amount
survive the promotion itself being deleted later — the FK must not block or cascade-delete
historical `order_items` when a `promotions` row is removed.

### Existing `cartStore.addItem` unit-price override (reuse for live discount display, PROMO-03)
```typescript
// Source: src/entities/tab/model/cartStore.ts (verified, lines 19-21, 65-66, 138)
/**
 * Pass unitPrice to override the base price (e.g. happy hour resolved price).
 */
addItem: (product: Product, modifiers: Modifier[], unitPrice?: number) => void;
// ...
const resolvedUnitPrice = unitPrice ?? product.basePrice;
```
This override parameter already exists and is unused today (its only comment references the dead
happy-hour system) — it is exactly the seam needed to pass a client-computed promotion-discounted
price into the cart at scan/add time. The stale "happy hour" comment should be updated to reference
promotions instead of removed, since the parameter itself is live and generically useful.

### Existing Home-dashboard admin-only tile registration (D-09)
```typescript
// Source: src/widgets/HomeDashboard/ui/HomeDashboard.tsx (verified, lines 68-74)
{
  path: '/settings',
  labelKey: 'homeDashboard.tiles.settings',
  icon: Settings,
  requiredAction: 'manage_settings',
  managerLabelKey: 'homeDashboard.managerLabels.admin',
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Bar-pos `promotions`/`applied_promotions`/`evaluate_promotions_rpc`, combo/pool-coupled | Dropped entirely | Phase 1 pivot, 2026-08-10 | No promotions engine exists today; this phase builds one fresh, not a revival |
| `PaymentSchema.discountScope` values `pool_only`/`consumptions_only` | Retired, only `'all'` remains meaningful | This phase (PROMO-05 explicitly retires them) | `DiscountScopeSchema` in `domain.ts:148` should drop these two enum values as part of this phase's schema work |
| Tab-based checkout with generic discount support | Direct-sale checkout (`process_direct_sale_atomic`) with discounts explicitly disabled | Phase 2 (direct-sale rewrite) | This phase re-enables discounts on direct sale, deliberately and for the first time since the rewrite |

**Deprecated/outdated:**
- `happyHourStart`/`happyHourEnd`/`happyHourPrice` fields in `domain.ts` — always null, vestigial,
  not to be reused or extended by this phase (a future cleanup phase drops them physically).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A promotion's category scope matches products by exact `category_id` equality only (no roll-up from parent category to child subcategories) | Anti-Patterns, "recursively applying a category promotion" | If the store actually wants roll-up behavior, line-item promotion matching and the E2E test matrix (PROMO-09's "product/category scope overlap resolution") would need to cover the recursive case too — flag for discuss-phase/plan-phase confirmation before locking the RPC's matching query |
| A2 | The below-cost override and ad-hoc-discount manager gate should be a NEW `StaffAction` (e.g. `override_below_cost_discount`), not a reuse of `process_refund` | Code Examples, manager-PIN-gate wiring | Low risk either way — this is a naming/audit-log-clarity choice, not a functional blocker; the planner can choose either and it will still work |
| A3 | Promotion CRUD does not need a new RPC — plain RLS-gated table writes suffice (Pitfall 3) | Don't Hand-Roll, Pitfall 3 | If the store later needs cross-table invariants at promotion-creation time (e.g. validating a `category_id` exists and belongs to no more than 3 levels deep), a lightweight `CHECK`/RLS-`WITH CHECK` clause is enough — an RPC would only be needed for something more complex than is currently specified |
| A4 | "Store-local time" date-range comparison (PROMO-01/PROMO-09) can be done with native SQL `date`/`timestamptz` arithmetic against `settings.general.timezone`, no new date library needed | Don't Hand-Roll table | If the store's timezone ever needs DST-aware edge-case handling beyond whole-day boundaries, this may need revisiting — but for a single-store retail promotion with day-granularity active ranges, this is very likely sufficient |

**Risk-weighted note:** All four assumptions are LOW risk to the phase's viability — none block
planning, and each has a clear, cheap resolution path if wrong (schema flexibility, naming-only
change, or an additive RPC later).

## Open Questions

1. **Does a category-scoped promotion apply to a parent category's child subcategories, or only
   the exact category row selected?**
   - What we know: PROMO-01's wording ("a category row with `parentId` set — no new hierarchy
     needed") suggests exact-match only (subcategory scoping IS category scoping, not a distinct
     recursive behavior).
   - What's unclear: Whether the store's actual mental model expects "discount the whole Spices
     category" to also discount "Spices > Whole Spices" (a subcategory) automatically.
   - Recommendation: Plan for exact-match (`products.category_id = promotions.category_id`) as the
     locked behavior per A1 above, and surface this as an explicit confirmation point in
     discuss-phase or the plan itself rather than silently picking one interpretation.

2. **Which existing/new `StaffAction` gates the below-cost override and the ad-hoc discount?**
   - What we know: Must mirror the `process_refund` manager-PIN pattern exactly (client PIN check
     + server `get_user_role()` re-check).
   - What's unclear: Whether to add one new action for both cases, two distinct new actions, or
     reuse `process_refund`.
   - Recommendation: Add one new action, `apply_custom_discount` (or similar), covering both the
     ad-hoc discount AND the below-cost override — CONTEXT.md's D-07 explicitly frames both as "one
     consistent... mental model," so one action name for both cases matches that intent better than
     splitting them or reusing `process_refund`.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependencies. Supabase, Node,
Playwright, and all other tooling this phase touches are already verified working in this repo (see
CLAUDE.md's documented dev commands); no new dependency is introduced by this research.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.4 [VERIFIED: package.json] (unit) + Playwright ^1.59.1 [VERIFIED: package.json] (E2E) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| Quick run command | `npx vitest run src/entities/promotion/model/promotion-pricing.test.ts` |
| Full suite command | `npm run test && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROMO-01 | Promotion CRUD, product/category/subcategory scope, RBAC admin-only | unit + E2E | `npx playwright test e2e/promotions/promotion-crud.spec.ts` | ❌ Wave 0 |
| PROMO-02 | Expiry-proximity auto-trigger, flat threshold→discount, reuses `near_expiry` setting | unit | `npx vitest run src/entities/promotion/model/promotion-pricing.test.ts` | ❌ Wave 0 |
| PROMO-03 | Live cart display + server-side authoritative recompute | E2E | `npx playwright test e2e/checkout/promotion-live-price.spec.ts` | ❌ Wave 0 |
| PROMO-04 | Best-price-wins across overlapping promotions | unit (property-based, `fast-check`) | `npx vitest run src/entities/promotion/model/promotion-pricing.test.ts` | ❌ Wave 0 |
| PROMO-05 | Apply existing promotion vs. ad-hoc manager-PIN discount | E2E | `npx playwright test e2e/payments/apply-promotion-and-custom-discount.spec.ts` | ❌ Wave 0 |
| PROMO-06 | Snapshot survives promotion edit/delete; refund/reopen restores it; margin report uses discounted price | E2E | `npx playwright test e2e/payments/promotion-snapshot-refund-reopen.spec.ts` | ❌ Wave 0 |
| PROMO-07 | Floor guard blocks below-cost, manager override proceeds | E2E | `npx playwright test e2e/errors/promotion-floor-guard.spec.ts` | ❌ Wave 0 |
| PROMO-08 | Offline snapshot + changed-promotion conflict flag | E2E | `npx playwright test e2e/infra/offline-promotion-conflict.spec.ts` | ❌ Wave 0 |
| PROMO-09 | Full scenario matrix incl. loose-weight/open-unit interaction, store-local timezone boundaries | E2E | `npx playwright test e2e/promotions/` (whole new folder) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed test file>` + relevant single Playwright spec
- **Per wave merge:** `npm run test` (full unit suite) + the new `e2e/promotions/` folder
- **Phase gate:** `npm run test:e2e` full suite green before `/gsd-verify-work`, per this repo's
  CLAUDE.md mandatory-automated-testing policy — no `human_needed`/manual UAT is a valid terminal
  state for this phase.

### Wave 0 Gaps
- [ ] New folder `e2e/promotions/` — no existing coverage for promotion CRUD, scope resolution, or
      the expiry-proximity trigger.
- [ ] `src/entities/promotion/model/promotion-pricing.test.ts` — unit + `fast-check` property tests
      for `evaluateBestPromotion()` (best-price-wins, tie-break by creation date, floor-guard
      boundary at exactly cost).
- [ ] Extend `e2e/payments/` with the ad-hoc-discount-vs-applied-promotion coexistence scenario
      (D-10) and the below-cost manager-override dialog.
- [ ] Extend `e2e/infra/` (or `e2e/checkout/`) with the offline-then-promotion-changed conflict
      flag (PROMO-08) — this repo's offline queue tests currently live under `e2e/infra/`.
- [ ] A parity test (Pitfall 1) asserting the TS `evaluateBestPromotion()` output matches the
      RPC's plpgsql computation for the same input matrix — new, no existing precedent file beyond
      the `edge-tax.test.ts` pattern to imitate structurally.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Existing Supabase Auth / staff PIN session, untouched by this phase |
| V3 Session Management | no (unchanged) | — |
| V4 Access Control | yes | New `manage_promotions` RBAC action enforced BOTH client-side (route guard, `ProtectedAction`) AND server-side (RLS `role_permissions` check on the `promotions` table) — client-only gating is explicitly the anti-pattern this codebase's Phase 22 precedent warns against |
| V5 Input Validation | yes | Zod schema (`PromotionCreateSchema`) validates shape/ranges client-side; the RPC/RLS independently re-validates (discount percent 0-100, date range well-formed, scope target exists) — same "defense-in-depth, RPC is sole authority" pattern as `ProcessRefundInputSchema` |
| V6 Cryptography | no | Not applicable — no new secrets/crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-submitted discount amount trusted at checkout | Tampering | `process_direct_sale_atomic` independently recomputes the promotion discount server-side and rejects on mismatch — same pattern as the existing `PRICE_MISMATCH`/`AMOUNT_MISMATCH` checks for catalog price and tax |
| Direct PostgREST call bypassing the manager-PIN UI to apply a below-cost discount | Elevation of Privilege | Server-side role re-check (`get_user_role()`) independent of the client's PIN dialog — mirrors `process_refund`'s existing two-layer defense; the client PIN gate alone is UX only, never the actual authorization boundary |
| Deleting a promotion to hide it from an audit trail after abuse | Repudiation | PROMO-06's snapshot on `order_items` (promotion id, rate, amount) persists independent of the `promotions` row's lifecycle — `ON DELETE SET NULL` on the FK preserves the numeric snapshot even if the promotion row itself is later deleted, and `record_audit()` should be called on every promotion CRUD op and every applied-promotion-at-checkout event (mirrors `PERFORM record_audit('shipment.receive', ...)` pattern) |
| Race condition between promotion evaluation and a concurrent promotion edit/deactivation mid-checkout | Tampering (TOCTOU) | The RPC already locks `products`/`inventory` rows `FOR UPDATE` per item — the new promotion lookup inside that same loop should also read within the same transaction (default READ COMMITTED snapshot is sufficient here since promotions aren't being mutated by the same transaction; a `FOR UPDATE`/`FOR SHARE` on the matched `promotions` row is only needed if a promotion-editing RPC in this same phase also needs row-level locking — recommend at minimum reading `promotions` inside the transaction, not via a separate pre-fetched client-side list, for the authoritative RPC path) |

## Sources

### Primary (HIGH confidence — verified this session by reading the actual file)
- `D:/Projects/Code/supermarket-pos/.planning/phases/27-promotions-discount-management/27-CONTEXT.md`
- `D:/Projects/Code/supermarket-pos/.planning/REQUIREMENTS.md` (PROMO-01..09, lines 239-247, 358-366)
- `D:/Projects/Code/supermarket-pos/.planning/notes/promotions-prior-art-and-dead-fields.md`
- `D:/Projects/Code/supermarket-pos/.planning/seeds/batch-lot-expiry-tracking.md`
- `src/shared/lib/domain.ts` (CategorySchema, ProductSchema, PaymentSchema, DiscountScopeSchema,
  NearExpirySettingsSchema, NearExpiryAlertSchema, GeneralSettingsSchema, SettingsKeySchema)
- `src/shared/lib/rbac.ts` (STAFF_ACTIONS, ROLE_SET, canAccess)
- `src/entities/inventory/model/queries.ts:233-267` (`useNearExpiryAlerts`)
- `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` (full file)
- `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (full file)
- `src/features/process-refund/model/useProcessRefund.ts` (full file)
- `src/features/checkout-sale/model/useCheckoutSale.ts` (full file)
- `src/shared/lib/edge-function-contracts.ts:660-742` (`callProcessDirectSale`)
- `src/shared/lib/payment-processor.ts:1-40` (`DiscountInfo`)
- `src/entities/tab/model/cartStore.ts` (`addItem` unit-price override)
- `src/entities/category/model/queries.ts` (full file — `parent_id` mapping)
- `src/app/audit-route.tsx` (full file)
- `src/app/router.tsx:6,10,80-82,124-126`
- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (ITEMS array, tile-registration pattern)
- `supabase/migrations/20260831000005_tax_inclusive_mode.sql` (full file — current live
  `process_direct_sale_atomic`)
- `supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql` (full file)
- `supabase/migrations/20260818000002_order_items_cost_price_snapshot.sql` (full file)
- `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` (full file — `receive_shipment`)
- `supabase/migrations/20260831000003_bank_transfers_schema.sql` (full file — RLS/RPC patterns,
  `confirm_transfer_payment`/`dispute_transfer_payment`)
- `supabase/migrations/20260510000002_rpc_role_guards.sql` (grep — `process_refund` grant/role check)
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql:300-339` (`role_permissions` seed rows)
- `supabase/functions/process-direct-sale/index.ts` (full file)
- `src/shared/lib/__tests__/edge-tax.test.ts`, `src/entities/payment/model/queries.ts:14-22`
  (`decomposeTax` cross-boundary import pattern)
- `.planning/config.json` (workflow flags: `nyquist_validation: true`, `security_enforcement: true`,
  `security_asvs_level: 1`)
- `package.json` (verified installed versions: zod 4.5.4, `@playwright/test` ^1.59.1, vitest ^4.1.4)

### Secondary (MEDIUM confidence — general industry pattern, not project-specific)
- [Inside Retail POS Pricing Engines: MVP, Promotions, and Discount Stacking](https://medium.com/@rajeshkumar1980/inside-retail-pos-pricing-engines-how-mvp-promotions-and-discount-stacking-work-in-enterprise-8f8829e28b3a) — corroborates "best price wins" and MVP/floor-guard as established retail POS patterns, consistent with D-05/D-07/D-08 (not used to override any locked decision, purely confirmatory)
- [NetSuite: Stacking Rules for Promotion Interactions](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1497967237.html) — general reference for promotion-stacking governance concepts

### Tertiary (LOW confidence)
- None — all claims in this document are either verified against this session's file reads or
  tagged `[ASSUMED]` in the Assumptions Log above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; every pattern verified against actual installed
  `package.json` versions and existing source files.
- Architecture: HIGH — the exact RPC/edge-function/RLS chain was read in full for the primary
  extension point (`process_direct_sale_atomic`), not inferred from partial context.
- Pitfalls: HIGH for Pitfalls 2, 3, 5 (each verified against actual code/migration content); MEDIUM
  for Pitfalls 1 and 4 (architecturally sound reasoning from verified constraints, but the exact
  test/implementation shape is a design choice for the planner, not something to verify further at
  research time).

**Research date:** 2026-09-01
**Valid until:** 30 days (stable internal codebase, no external API/library version drift risk)
