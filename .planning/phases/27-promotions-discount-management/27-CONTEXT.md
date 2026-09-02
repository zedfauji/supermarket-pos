# Phase 27: Promotions & Discount Management - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Promotions/discounts scoped to a product, a category, or a subcategory (a category row with
`parentId` set), multiple promotions may qualify on one line item resolved by a single uniform
best-price-wins rule, and one condition-based trigger — expiry proximity — auto-applies off a
product's existing `inventory.expiry_date`. A qualifying item shows its discounted price live at
scan time; `process_direct_sale_atomic` remains the sole price authority, extended to recompute
server-side. At payment, a cashier can apply an existing active promotion; an ad-hoc/custom discount
requires a manager PIN. Every applied promotion is snapshotted per line item for audit/refund/margin
correctness. No combination of discounts may sell below recorded cost. Batch/lot-level expiry
precision is explicitly out of scope (see `.planning/seeds/batch-lot-expiry-tracking.md`).
Requirements PROMO-01..09 are already locked in `.planning/REQUIREMENTS.md` (captured via
`/gsd-explore` 2026-09-01) — this discussion clarifies HOW to implement them, not whether.

</domain>

<decisions>
## Implementation Decisions

### Expiry-discount trigger (PROMO-02)
- **D-01:** Flat threshold, not tiered/escalating — one `days_threshold` → one `discount_%`, no
  step-up as expiry nears. User initially picked tiered defaults (14d/10% → 7d/20% → 3d/35%) but on
  a conflict check confirmed they actually want the flat/single-value shape — the tiered numbers
  were dropped, not the shape. — **Reversibility:** reversible — a single-row config vs. a small
  table is a schema-shape choice; migrating flat→tiered later is additive, not destructive.
- **D-02:** Global rate — one flat threshold/discount applies to every product's expiry-proximity
  trigger, not per-category. Store sells mostly packaged/shelf-stable Indian grocery goods; decay
  urgency doesn't vary enough across categories to justify per-category config yet.
- **D-03:** Admin-editable in Settings, not hardcoded — mirrors the existing near-expiry-alert
  threshold already being admin-configurable (`useNearExpiryAlerts`, default 14 days,
  `src/entities/inventory/model/queries.ts:233-267`).
- **D-04:** Default values: **14 days → 15% off**. Reuses the existing near-expiry-alert default
  (14 days) as the discount trigger point too — one number the admin already understands, not a new
  concept.

### Multi-promotion resolution (PROMO-04)
- **D-05:** Best price always wins, uniformly — across product-level, category-level, AND the
  expiry-proximity auto-discount, all in one pool. No scope-specificity override (a product-level
  promo does NOT automatically beat a bigger category-level discount) and no special priority for
  the expiry trigger over manually-created promotions. One rule, no exceptions, simplest to
  implement and to explain to the store owner.
- **D-06:** Tie-break (identical scope, identical discount amount): **most recently created
  promotion wins**. No explicit admin-priority/ordering field — deliberately deferred as
  unnecessary complexity for a rare edge case; revisit only if it actually causes confusion in
  practice.

### Floor guard (PROMO-07)
- **D-07:** When combined discounts would drop a line item below recorded cost, **checkout blocks**
  and requires a **manager PIN override** to proceed — does NOT silently cap the discount at cost
  and does NOT silently drop the promotion. Mirrors the existing manager-PIN-gate pattern used for
  refunds (`process_refund`) and ad-hoc discounts (PROMO-05) — one consistent "below-cost or
  custom-override needs a manager" mental model across the whole payment screen, not a special case.
  — **Reversibility:** costly — once cashiers are trained on "below-cost always needs a manager,"
  changing to silent-cap later is a UX/training change, not just a code change.
- **D-08:** Floor is exactly cost — **0% margin**, not a configurable minimum-margin percentage. No
  settings surface for this; the store hasn't asked for a margin-above-cost floor, so don't build
  one speculatively (PROJECT.md scope-discipline constraint: inventory/pricing machinery stays
  lean).

### Promotion management UI (PROMO-01, PROMO-05)
- **D-09:** New standalone route, `/promotions`, not a Settings tab and not an `/inventory`
  sub-section. Gets its own route guard component (mirror `AuditRoute`/`ReportsRoute` pattern —
  admin-only, per PROMO-01's RBAC decision), and its own nav tile on the Home dashboard's big-box
  nav (admin-only visibility), alongside `/inventory`, `/suppliers`, `/staff`.
- **D-10:** At payment, applying an existing promotion **coexists** with the existing whole-sale
  `discountType`/`discountValue` field on `PaymentSchema` — it does NOT overwrite/reuse that field.
  The existing field remains the "ad-hoc/custom, manager-PIN" path (PROMO-05's custom-discount
  case); a new field/relation captures which specific promotion(s) were applied (auto or
  manually-selected), preserving per-promotion identity for the PROMO-06 audit/refund-restore
  snapshot. Collapsing the two into one field was explicitly rejected because it would lose which
  specific promotion applied, weakening PROMO-06.

### Claude's Discretion
- Exact DB schema/table naming for the new promotion entity (e.g. `promotions` table shape,
  scope-type enum values) — no precedent exists in the current schema (the bar-pos-era
  `promotions` table was dropped and is not a reference; see canonical refs below). Planner's call.
- Exact route-guard component name (e.g. `PromotionsRoute`) — follow the existing
  `AuditRoute`/`ReportsRoute` naming convention.
- Exact wording/copy for the new `/promotions` page, the below-cost manager-override dialog, and
  the Settings field for the expiry-discount threshold/rate — follow existing i18n namespace
  conventions (`wAdmin` for admin-only management surfaces, `wPanels` for payment-screen additions),
  not locked by discussion.
- Whether the new promotion-selection field on a sale lives as new columns on `order_items` /
  `payments`, or a new join table — PROMO-06's snapshot requirement is locked, but the exact schema
  shape is an implementation choice like Phase 23's bank-transfer table-vs-column precedent (see
  `23-CONTEXT.md` D-15..17 discretion pattern).
- Whether the shared discount/promotion-evaluation math lives in one exported TS function reused by
  both client display and referenced 1:1 by the SQL RPC logic (mirroring Phase 24's
  `decomposeTax()`-centralization lesson — a live overcharge bug came from duplicated tax math
  drifting across call sites) — strongly recommended given this repo's own prior incident, but the
  exact function/module shape is the planner's call.

### Reviewed Todos (not folded)
- **Rename Cargo package (bar-pos→supermarket-pos)** — infra/branding, unrelated to promotions
  logic; not folded.
- **Rotate remote Supabase database password** — infra credential rotation, unrelated; not folded.
- **Fix CI tauri-build broker order** — CI/build infra, unrelated; not folded.
- **Migrate .env.production to GitHub Environment** — deployment infra, unrelated; not folded.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning.**

### Requirements & exploration record
- `.planning/REQUIREMENTS.md` §v1.11 (PROMO-01..09) — locked requirements this phase must satisfy
- `.planning/ROADMAP.md` "### Phase 27: Promotions & Discount Management" — phase goal statement
- `.planning/seeds/batch-lot-expiry-tracking.md` — why batch/lot precision is explicitly deferred,
  and what the future upgrade path looks like if it's ever picked up
- `.planning/notes/promotions-prior-art-and-dead-fields.md` — why the bar-pos-era `promotions`
  engine (dropped Phase 1, combo/pool-coupled) must NOT be reused as a schema reference, and the
  stale `happyHourStart/End/Price` / `isCombo`/`comboEligible`/`comboPriceOverride` dead-field trap
  in `domain.ts` to avoid anchoring on
- `.planning/PROJECT.md` "Out of Scope" — confirms "Batch-level FEFO auto-allocation ... one active
  expiry per product is sufficient" as standing project scope discipline, consistent with D-01..D-04

### Prior-phase precedent to mirror
- `.planning/phases/24-tax-configuration-inclusive-exclusive-toggle/24-CONTEXT.md` — the
  `decomposeTax()` centralization lesson (single shared function across client + all RPCs, to make
  formula drift structurally impossible) directly informs the discount/promotion math discretion
  item above
- `.planning/phases/22-admin-pin-reset-server-side-recovery-path/22-CONTEXT.md` — `ManagerPinDialog`
  reuse pattern (D-03 there) for the below-cost override gate (D-07 here) and the ad-hoc-discount
  manager-PIN gate (PROMO-05)
- `.planning/phases/23-bank-transfer-payment-tracking/23-CONTEXT.md` — precedent for leaving exact
  new-table-vs-column schema shape to the planner (D-15..17 discretion pattern there)

### Existing code — product/category/expiry/checkout (from `/gsd-explore` codebase research, 2026-09-01)
- `src/shared/lib/domain.ts:170-192` — `CategorySchema`, hierarchy via `parentId` (max depth 3) —
  subcategory scoping (PROMO-01) is just a category row with `parentId` set, no new schema needed
- `src/shared/lib/domain.ts:228-263` — `ProductSchema` (`categoryId`, `basePrice`, `soldByWeight`,
  `unitsPerPackage`/`parentProductId` for case↔piece)
- `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:38,94-99` — `inventory.expiry_date`
  single-column, overwritten on each receiving (grounds D-01..D-04 and the batch-tracking deferral)
- `src/entities/inventory/model/queries.ts:233-267` — `useNearExpiryAlerts()`, existing
  admin-configurable threshold (default 14 days) — reuse this same setting/pattern per D-03/D-04
- `process_direct_sale_atomic` (`supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql`,
  cost-snapshot variant `20260818000003_process_direct_sale_atomic_cost_snapshot.sql`) — server-side
  authoritative price calc; PROMO-03 extends this, does not bypass it
- `src/shared/lib/domain.ts:457-484` — `PaymentSchema.discountScope`/`discountType`/`discountValue`/
  `discountAmount` — existing manual whole-sale discount field; D-10 keeps it separate from the new
  promotion-selection mechanism; bar-pos-only `discountScope` values (`pool_only`,
  `consumptions_only`) are retired per PROMO-05
- `supabase/migrations/20260818002_order_items_cost_price_snapshot.sql` /
  `20260818000003_process_direct_sale_atomic_cost_snapshot.sql` — existing cost-price snapshot
  pattern on `order_items`; PROMO-06 mirrors this exact pattern for the discount/promotion snapshot
- `src/shared/lib/rbac.ts` — `cashier < manager < admin` hierarchy; closest existing precedent for
  the new `manage_promotions` action (admin-only, PROMO-01) is `manage_settings`'s admin-only gate,
  not `manage_products`'s manager+ gate
- `src/app/router.tsx` — where the new `/promotions` route + its guard component register (mirror
  `AuditRoute`/`ReportsRoute`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useNearExpiryAlerts()` pattern and its admin-configurable threshold — direct precedent for the
  new expiry-discount threshold setting (D-03/D-04)
- `ManagerPinDialog` (`src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`) — reuse for the
  below-cost override gate (D-07) and the ad-hoc-discount gate (PROMO-05), same as Phase 22's D-03
- `rowsToCsv` / audit-log (`recordAudit`) patterns — likely relevant if promotions need
  list/export or audit-trail coverage beyond the per-line snapshot

### Established Patterns
- Server-side RPCs independently recompute authoritative totals and reject client-submitted totals
  on mismatch (anti-tamper) — PROMO-03's server-side promotion recompute must follow this exactly,
  same caution Phase 24 called out for tax math
- Zod schema in `domain.ts` is the single source of truth (CLAUDE.md convention) — new `Promotion`
  entity type goes there first
- RBAC actions enforced server-side inside edge functions/RPCs, not just client-side gating (Phase
  22 precedent) — `manage_promotions` admin-only gate (D-09/PROMO-01) needs the same server-side
  enforcement, not just route hiding

### Integration Points
- New `/promotions` route + Home dashboard nav tile (D-09)
- `process_direct_sale_atomic` extension point for server-side promotion recompute (PROMO-03)
- `PaymentPane`/payment screen for manual promotion selection + the coexisting custom-discount field
  (D-10)
- `order_items` for the per-line promotion snapshot (PROMO-06)
- Settings for the new expiry-discount threshold/rate field (D-03)

</code_context>

<specifics>
## Specific Ideas

No UI mockups given. The flat expiry-threshold shape (D-01) was reached through an explicit
conflict-check with the user after an initial contradictory pair of answers — the flat/single-value
shape is confirmed, not a default assumption.

</specifics>

<deferred>
## Deferred Ideas

- **Per-category expiry-discount rates** — deferred per D-02; revisit if the store's category mix
  proves decay urgency actually varies meaningfully (e.g. if fresh/dairy items are added later).
- **Tiered/escalating expiry discount** — the shape the user initially gestured at before the
  conflict-check resolved to flat; could resurface as a future enhancement once the flat version is
  in daily use and proves too coarse.
- **Explicit admin-priority/ordering field for promotion tie-breaks** — deferred per D-06 as
  unnecessary complexity for a rare edge case.
- **Configurable minimum-margin floor (above cost)** — deferred per D-08; current floor is exactly
  cost, not configurable.
- Batch/lot-level expiry tracking — already tracked as its own seed,
  `.planning/seeds/batch-lot-expiry-tracking.md`, not repeated here as new.

### Reviewed Todos (not folded)
- **Rename Cargo package (bar-pos→supermarket-pos)** (`.planning/todos/pending/rename-cargo-package-bar-pos.md`) —
  infra/branding, unrelated to promotions logic.
- **Rotate remote Supabase database password** (`.planning/todos/pending/rotate-remote-supabase-db-password.md`) —
  infra credential rotation, unrelated.
- **Fix CI tauri-build broker order** (`.planning/todos/pending/fix-ci-tauri-build-broker-order.md`) —
  CI/build infra, unrelated.
- **Migrate env-production to GitHub Environment** (`.planning/todos/pending/migrate-env-production-to-github-environment.md`) —
  deployment infra, unrelated.

</deferred>

---

*Phase: 27-promotions-discount-management*
*Context gathered: 2026-09-01*
