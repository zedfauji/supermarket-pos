# Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) - Research

**Researched:** 2026-08-19
**Domain:** Read-only reporting/aggregation over existing `inventory`/`stock_movements`/`order_items` data; one small capture-UI addition (reason picker); one narrow DB migration (new enum value + reused CHECK-constraint pattern).
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add a reason-picker to the existing manual-adjust dialog (`InventoryPagePanel`'s batch-adjust flow, currently hardcoded to `InventoryAdjustReason.MANUAL_ADJUSTMENT`). Expose the **full enum** as selectable options: `waste`, `expired` (new value — not yet in `InventoryAdjustReasonSchema`/`StockMovementReasonSchema`), `delivery`, `correction`, `manual_adjustment`, `physical_count`. — **Reversibility:** costly — `expired` becomes a permanent enum member once real rows reference it; removing it later requires a data migration for any row tagged `expired`.
- **D-02:** Pre-Phase-14 adjustment rows (all recorded as `manual_adjustment` today, since no reason picker existed) are **not** reclassified or guessed at. Shrinkage/Waste report shows them under a separate "unclassified adjustments" line, explicitly not attributed to waste or expiry. Report UI notes that fine-grained classification only became available as of this feature.
- **D-03:** Valuation report prices on-hand stock at **current weighted-average cost** (`inventory.costPrice`) per the roadmap's success criteria. This is a different, legitimately-divergent basis from Product Sales' margin calc, which uses `costPriceSnapshot` (cost captured at time of sale). Each report states its own formula inline (already required by success criteria #5) **plus** the Valuation report carries an explicit note/tooltip explaining why its numbers won't match Product Sales margins if the owner cross-compares them directly.
- **D-04:** Turnover's "average inventory value" and Valuation's stock value are both **reconstructed from the `stock_movements` log** as of a point in time, rather than using only the live current-state snapshot. This means Valuation and Turnover share the same underlying "stock value as of date X" reconstruction logic — build it once, reuse for both.
- **D-05:** The Reports page's shared `DateRangePicker` applies to Valuation as **"as of end date"** — i.e. Valuation reconstructs on-hand value at the end of the selected range, not always "right now." Shrinkage/Expiry/Turnover use the date range as a normal from/to filter over `stock_movements` rows.
- **D-06:** All four reports live under a **single combined "Inventory Analytics" tab** on the existing Reports page (not four separate top-level tabs), with internal sub-sections for Valuation / Shrinkage-Waste / Expiry-Loss / Turnover on one scrollable page. Matches the existing `Tabs` + grouped-`TabsList` pattern in `src/pages/reports/index.tsx`, added as a new group (or subsection within an existing group) alongside "Sales" and "Staff & Tips."

### Claude's Discretion

- Breakdown-level UI details (product vs. category toggle/grouping, table vs. chart presentation) not explicitly discussed — user opted to proceed with sensible defaults. Default to product-level rows with a category subtotal/rollup and a store-wide total, consistent with how `ProductSalesPanel` already breaks down data.
- Exact reason-picker UI copy/labels, and whether `delivery`/`physical_count` remain selectable in the dropdown vs. shown as system-set/disabled — user confirmed "full enum exposed" so all six values should be pickable, but exact widget layout (dropdown vs. radio, ordering) is Claude's call.

### Deferred Ideas (OUT OF SCOPE)

- Category-level shrinkage/turnover breakdown as the *default* view — already tracked in REQUIREMENTS.md v2 Requirements as deferred until store-level reports ship and the owner asks for it.
- Trend view (week-over-week/month-over-month) for valuation/shrinkage/turnover — already deferred in REQUIREMENTS.md v2 Requirements until point-in-time reports have been used for at least a month.
- A dedicated "write off expired stock" action wired to the near-expiry-alert flow (distinct from the generic manual-adjust dialog) — not discussed/requested; D-01's minimal reason-picker on the existing dialog covers the capture gap without adding a new workflow.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INVR-01 | Owner can view an inventory valuation report (on-hand qty × current weighted-average cost, by product/category, store total) | `## Architecture Patterns` (shared as-of-date reconstruction helper), `## Code Examples` (weighted-avg-cost SQL confirmed verbatim in `receive_shipment`), `## Runtime State Inventory` (schema confirms no per-movement cost snapshot exists — valuation must use *current* cost, not historical) |
| INVR-02 | Owner can view a shrinkage/waste report rolled up from `inventory_log`/`stock_movements` adjustment reason codes | `## Don't Hand-Roll` (Pitfall 7 — filtered view, not re-derived expected-vs-actual), D-01/D-02 in User Constraints, `## Package Legitimacy Audit` (n/a — no new packages) |
| INVR-03 | Owner can view an expiry-loss report filtered from the same adjustment data as INVR-02 | Pitfall 8 (no batch/lot claims), D-01 (`expired` reason code addition), `## Common Pitfalls` |
| INVR-04 | Owner can view a turnover/sell-through report combining units-sold (Product Sales) with average inventory value (Valuation) | `## Code Examples` (verbatim `useProductSalesReport` units-sold aggregation to reuse), D-04 (shared reconstruction logic), `## Common Pitfalls` (period-average limitation) |
</phase_requirements>

## Summary

This phase is pure read-only aggregation over data structures that already exist and are already well-understood in this codebase — no new tables, no new RPCs beyond what's needed for the one capture-gap fix (D-01's `expired` reason code), and no new npm/cargo dependencies. The four reports differ only in *which* existing rows they aggregate and *how* they present the total, not in their data-access pattern: all four should live as new files under `src/entities/inventory/model/queries-analytics.ts` (or similarly named, parallel to the existing `src/entities/tab/model/queries-reports.ts`) and a new `InventoryAnalyticsPanel` widget with four sub-sections, wired into `src/pages/reports/index.tsx` as a single new tab per D-06.

The single non-trivial technical piece is D-04: reconstructing "stock value as of date X" from the `stock_movements` ledger rather than reading the live `inventory` table directly. This is straightforward arithmetic (current `quantity_on_hand` minus the sum of `quantity_delta` for all movements strictly after the cutoff date, per product) but **must be built once as a shared helper** and reused by both Valuation (as-of end-of-range) and Turnover (average of start/end reconstructions), per D-04. Critically, `stock_movements` has **no cost-price column** — there is no historical cost snapshot per movement — so the *quantity* is reconstructed as of a date, but the *cost basis* applied to that quantity is always the product's **current** `inventory.costPrice` (D-03). This must be stated explicitly in the report's UI copy so the owner understands "value at date X" really means "quantity as of date X, priced at today's weighted-average cost," not a true historical valuation.

Shrinkage/Waste and Expiry-Loss are simpler: both are `GROUP BY reason` filters over `stock_movements` rows with negative `quantity_delta`, valued at `inventory.costPrice` (current cost — no per-movement cost exists to value them at). The DB has an existing (currently `NOT VALID`, unenforced) CHECK constraint `stock_movements_reason_check` listing 11 reason values including several bar-pos-era ones (`prep_production`, `combo_component`, etc.) that must **not** be exposed in the new picker. Adding `expired` requires a migration following the exact `add_physical_count_reason.sql`/`20260424000001_stock_movements.sql` pattern (drop + re-add the CHECK, `NOT VALID` to skip scanning historical rows) plus a Zod schema update in `domain.ts` to **both** `InventoryAdjustReasonSchema` (used by `InventoryLogSchema`, which is what `useInventoryLog`/`useMutationAdjustInventory` actually parse against) and `StockMovementReasonSchema`.

**Primary recommendation:** Build one shared `computeInventoryValueAsOf(movements, currentInventory, asOfDate)` pure function reused by Valuation and Turnover; build Shrinkage/Waste and Expiry-Loss as simple `GROUP BY reason` filters over the same `stock_movements` date-range query; add `expired` to both reason enums plus a `NOT VALID` CHECK-constraint migration; extract all four reports' math into pure, unit-testable functions (mirroring the existing `computePctTotals`/`fillMissingHours` pattern in `queries-reports.test.ts`) so success criterion #5's fixture-pinned tests don't require mocking Supabase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Valuation report (qty × current cost, by product/category, store total) | API/Backend (Supabase query + client-side aggregation) | Browser/Client (React table rendering) | Aggregation math runs client-side via TanStack Query, same pattern as `useProductSalesReport` — no need for a DB view/RPC since the row count (one row per product with stock) is small for a single store |
| Shrinkage/Waste report (filtered `stock_movements` rollup) | API/Backend | Browser/Client | Same — filtered SELECT + `GROUP BY reason` done client-side after fetch, consistent with existing reports |
| Expiry-loss report (same data, `reason = 'expired'` filter) | API/Backend | Browser/Client | Shares the exact same fetch as Shrinkage/Waste — one query, two filtered views |
| Turnover/sell-through report | API/Backend | Browser/Client | Combines two existing query results (`useProductSalesReport` units-sold + new valuation-reconstruction helper) client-side |
| Reason-picker capture UI (D-01) | Browser/Client | API/Backend (RPC/insert validation via DB CHECK constraint) | UI-only addition to an existing dialog; the DB CHECK constraint is the actual enforcement boundary, not client validation alone |
| `expired` reason code + CHECK constraint | Database/Storage | — | Schema-owned; must be added via migration before any UI can select it |

## Standard Stack

### Core

No new libraries. This phase is entirely additive React/TypeScript/Zod/Supabase code using the project's existing stack (React 19, TanStack Query v5, Zod v4, Tailwind/shadcn `Tabs`/`DataTable`, `date-fns` — already a dependency at `package.json:62`, `^4.1.0`). `[VERIFIED: package.json]`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^4.1.0 (already installed) | Date-range boundary math for the "as of end date" reconstruction (D-05) | If the reconstruction helper needs date comparison/formatting beyond native `Date` — optional, native `Date` comparisons are also sufficient here |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side aggregation (TanStack Query + JS reduce, matching `useProductSalesReport`) | A new Postgres view/RPC (`inventory_valuation_view`) | A DB view would centralize the math and could be reused by a future PDF/Excel export, but every other report in this codebase (`queries-reports.ts`) does aggregation client-side after a single Supabase `select()`; introducing a DB view here breaks the established pattern for no proven need (single-store row counts are small) |

**Installation:** None — no new packages.

## Package Legitimacy Audit

Not applicable. This phase introduces zero new external dependencies (npm, pip, or cargo). All work is new TypeScript/SQL files using already-installed packages.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐
│ InventoryPagePanel           │
│ (existing batch-adjust dialog)│
│  D-01: add reason <select>   │
└───────────┬───────────────────┘
            │ reason: InventoryAdjustReasonSchema (now incl. 'expired')
            ▼
┌─────────────────────────────┐
│ useMutationAdjustInventory    │──insert──▶ stock_movements (DB CHECK
│ (existing, entities/inventory)│            constraint enforces valid   │
└─────────────────────────────┘             reason incl. 'expired')     │
                                                        │
                                                        │ SELECT (date-range filtered)
                                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ New: src/entities/inventory/model/queries-analytics.ts                  │
│                                                                         │
│  useInventoryValuationReport(asOfDate)                                  │
│    → fetch current `inventory` (qty, cost) + `stock_movements`          │
│      (movements after asOfDate, per product)                            │
│    → computeInventoryValueAsOf(...)  [pure fn, unit-tested]             │
│                                                                         │
│  useShrinkageWasteReport(from, to)                                      │
│    → fetch stock_movements WHERE reason IN (waste, correction, ...)     │
│      AND created_at BETWEEN from/to                                     │
│    → groupByReason(...) [pure fn]  — pre-Phase-14 rows bucketed as      │
│      'unclassified' per D-02                                            │
│                                                                         │
│  useExpiryLossReport(from, to)                                          │
│    → same fetch, filtered to reason = 'expired'                         │
│                                                                         │
│  useTurnoverReport(from, to)                                            │
│    → useProductSalesReport(from, to)  [REUSE, entities/tab]             │
│    → computeInventoryValueAsOf(from) + computeInventoryValueAsOf(to)     │
│    → turnover = unitsSold / averageInventoryValue                       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ New: src/widgets/InventoryAnalyticsPanel/InventoryAnalyticsPanel.tsx     │
│  (4 sub-sections: Valuation / Shrinkage-Waste / Expiry-Loss / Turnover)  │
│  each renders its own formula string + DataTable, per success crit #5   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│ src/pages/reports/index.tsx  — D-06: new "Inventory Analytics" tab      │
│  (existing Tabs/TabsList group pattern, existing DateRangePicker)        │
└───────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── entities/inventory/model/
│   ├── queries.ts                  # existing — untouched aggregation logic
│   ├── queries-analytics.ts        # NEW — 4 report queries + shared reconstruction helper
│   └── queries-analytics.test.ts   # NEW — fixture-pinned unit tests (success criterion #5)
├── widgets/InventoryAnalyticsPanel/
│   ├── InventoryAnalyticsPanel.tsx # NEW — composes 4 sub-sections
│   ├── ValuationSection.tsx        # NEW (or inline sub-component)
│   ├── ShrinkageWasteSection.tsx   # NEW
│   ├── ExpiryLossSection.tsx       # NEW
│   ├── TurnoverSection.tsx         # NEW
│   └── index.ts
├── features/adjust-inventory/      # currently a .gitkeep stub — D-01 populates it,
│   │                                # OR the reason-picker stays inline in InventoryPagePanel.tsx
│   │                                # (existing dialog is already inline; extending in place
│   │                                # avoids inventing a new FSD feature folder for one <select>)
├── shared/lib/domain.ts            # EDIT — add 'expired' to InventoryAdjustReasonSchema
│                                    # AND StockMovementReasonSchema
└── pages/reports/index.tsx         # EDIT — add "Inventory Analytics" tab (D-06)

supabase/migrations/
└── <timestamp>_add_expired_reason.sql  # NEW — CHECK constraint migration (see Code Examples)
```

### Pattern 1: Shared "value as of date" reconstruction (D-04)

**What:** A single pure function that, given the current `inventory` rows (qty + cost) and the `stock_movements` rows created *after* a cutoff date, reconstructs what `quantity_on_hand` was *as of* that cutoff — then values it at the product's **current** cost (not a historical cost, since none is stored per movement).

**When to use:** Valuation (as-of end of selected range, D-05) and Turnover (average of as-of-start and as-of-end, D-04) both call this same function — do not write two separate reconstruction implementations.

**Example:**
```typescript
// Source: derived from existing pattern in src/entities/tab/model/queries-reports.ts
// (useProductSalesReport's client-side aggregation over a single Supabase select())

type MovementForReconstruction = { productId: string; quantityDelta: number; createdAt: Date };
type CurrentStock = { productId: string; quantityOnHand: number; costPrice: number | null };

/**
 * Reconstructs on-hand quantity as of `asOfDate` by subtracting all movements
 * that happened strictly AFTER asOfDate from the current quantity_on_hand.
 * Values the reconstructed quantity at CURRENT cost (D-03) — stock_movements
 * has no per-movement cost snapshot, so there is no historical cost to use.
 */
export function computeInventoryValueAsOf(
  current: CurrentStock[],
  movementsAfterCutoff: MovementForReconstruction[],
  asOfDate: Date
): Array<{ productId: string; quantityAsOf: number; costPrice: number | null; value: number | null }> {
  const deltasByProduct = new Map<string, number>();
  for (const m of movementsAfterCutoff) {
    if (m.createdAt <= asOfDate) continue; // defensive; caller should pre-filter
    deltasByProduct.set(m.productId, (deltasByProduct.get(m.productId) ?? 0) + m.quantityDelta);
  }
  return current.map(row => {
    const laterDelta = deltasByProduct.get(row.productId) ?? 0;
    const quantityAsOf = row.quantityOnHand - laterDelta;
    const value = row.costPrice === null ? null : Math.round(quantityAsOf * row.costPrice * 100) / 100;
    return { productId: row.productId, quantityAsOf, costPrice: row.costPrice, value };
  });
}
```

### Pattern 2: Reason-filtered shrinkage/expiry rollup (avoids Pitfall 7)

**What:** `GROUP BY reason` over `stock_movements` rows with negative `quantity_delta`, not a re-derived expected-vs-actual calculation.

**Example:**
```typescript
// Pattern mirrors useProductSalesReport's Map-based aggregation
// (src/entities/tab/model/queries-reports.ts:256-305)
const LOSS_REASONS = ['waste', 'expired', 'correction'] as const; // 'expired' pending D-01 migration
// pre-Phase-14 rows (created before the reason picker existed) are ALL
// 'manual_adjustment' — D-02 requires these bucketed separately, not guessed at.
const UNCLASSIFIED_REASON = 'manual_adjustment';

function groupShrinkageByReason(
  movements: Array<{ reason: string; quantityDelta: number; productId: string; costPrice: number | null; createdAt: Date }>
) {
  const byReason = new Map<string, { units: number; value: number }>();
  for (const m of movements) {
    if (m.quantityDelta >= 0) continue; // shrinkage is loss = negative deltas only
    const bucket = LOSS_REASONS.includes(m.reason as (typeof LOSS_REASONS)[number])
      ? m.reason
      : m.reason === UNCLASSIFIED_REASON
        ? 'unclassified_adjustments' // D-02
        : null; // 'sale', 'refund', 'delivery' etc. are not shrinkage — excluded entirely
    if (bucket === null) continue;
    const existing = byReason.get(bucket) ?? { units: 0, value: 0 };
    existing.units += Math.abs(m.quantityDelta);
    existing.value += m.costPrice === null ? 0 : Math.abs(m.quantityDelta) * m.costPrice;
    byReason.set(bucket, existing);
  }
  return byReason;
}
```

### Anti-Patterns to Avoid

- **Re-deriving "expected vs. actual" stock loss from sale/receiving deltas:** Pitfall 7 — always filter the existing tagged `reason` column, never reconstruct loss independently from raw movement math (that produces a number that can't reconcile with the audit trail).
- **Claiming batch/lot-level expiry traceability in report copy:** Pitfall 8 — the system tracks one active expiry date per product; UI copy must say "product-level write-off events," never "which shipment" or "which batch."
- **Valuing reconstructed historical quantities at a reconstructed historical cost:** There is no historical cost per movement in this schema — don't invent one. Always value at current `inventory.costPrice` and say so explicitly in the report (D-03).
- **Silently reclassifying pre-feature `manual_adjustment` rows as waste/expiry:** D-02 forbids this — they must render in an explicit "unclassified adjustments" bucket.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Units-sold-per-product aggregation for Turnover | A second sales-aggregation query | `useProductSalesReport` from `src/entities/tab/model/queries-reports.ts` `[VERIFIED: src/entities/tab/model/queries-reports.ts:225-331]` | Already computes units/revenue/margin per product for a date range with the exact cost-basis semantics this codebase uses; Turnover's REQ (INVR-04) explicitly says "combining ... existing Product Sales report" |
| CSV export of new report rows | A new export mechanism | `src/features/export-report` (`rowsToCsv`, CSV-injection-safe) + extend `ExportType` union | Existing pattern already handles CSV-formula-injection safety (CWE-1236); reinventing it for 4 new report types duplicates security-relevant code |
| Reason-code taxonomy for loss classification | A new "loss reason" concept/table | Existing `InventoryAdjustReasonSchema`/`StockMovementReasonSchema` (`waste`, `correction`, + new `expired`) | Pitfall 7 — a parallel taxonomy fragments the audit trail and defeats reconciliation |

**Key insight:** Every piece of data this phase needs already exists in `inventory` and `stock_movements`. The engineering work is entirely in the aggregation/presentation layer, not new persistence — resist any temptation to add new tables (e.g., a "snapshots" table for period-average turnover) beyond what D-04's movement-log reconstruction already covers.

## Runtime State Inventory

> Included because D-01 adds a new enum value (`expired`) that becomes a permanent, hard-to-reverse schema member once real rows reference it.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `stock_movements.reason` is `text` typed with an existing but currently **`NOT VALID`** CHECK constraint `stock_movements_reason_check` (added `20260424000001_stock_movements.sql:26-40`, `[VERIFIED: supabase/migrations/20260424000001_stock_movements.sql:26-40]` — verbatim: `CHECK (reason IN ('sale','manual_adjustment','waste','delivery','correction','physical_count','prep_production','prep_consumption','combo_component','refund','void')) NOT VALID`). `expired` is not in this list — inserting a row with `reason='expired'` today would violate the constraint. | New migration: `ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_reason_check; ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check CHECK (reason IN (..., 'expired')) NOT VALID;` following the exact pattern of `20260422000003_add_physical_count_reason.sql` |
| Stored data — pre-existing rows | All pre-Phase-14 manual adjustments are recorded as `manual_adjustment` (no reason picker existed before) — per D-02, code edit only, no data migration to reclassify these | Code edit: Shrinkage report buckets these under "unclassified adjustments," never reclassifies them |
| Live service config | None — this phase touches no external services (no n8n/Datadog/Tailscale/etc. in this codebase's stack) | None |
| OS-registered state | None — no OS-level task registration involved | None |
| Secrets/env vars | None — no new secrets, env vars, or edge functions | None |
| Build artifacts | None — `expired` is a Zod enum literal in `domain.ts`, not a build-time code-generated artifact; `supabase.types.ts` types `reason` as loose `string` already `[VERIFIED: src/shared/lib/supabase.types.ts:1323,1335,1347]` so no type-regen is strictly required, though running `npx supabase gen types typescript` after the migration is still good practice |

**Nothing found in "OS-registered state," "Secrets/env vars," "Live service config," "Build artifacts" categories** — verified by reading `CLAUDE.md`'s architecture section and confirming this codebase has no such external-state surfaces relevant to an inventory-reporting phase.

## Common Pitfalls

### Pitfall 1: Shrinkage report re-derives loss instead of filtering tagged reasons (Pitfall 7 from milestone research)

**What goes wrong:** Building a fresh "expected stock (from sales) vs. actual stock" calculation instead of filtering `stock_movements` by reason.
**Why it happens:** "Shrinkage report" sounds like it needs its own math; the existing tagged data is easy to miss.
**How to avoid:** `GROUP BY reason` over `stock_movements`, filtered to negative-delta rows tagged `waste`/`expired`/(pre-feature `manual_adjustment` bucketed separately per D-02). Never compute `qty_sold - qty_received - qty_on_hand`.
**Warning signs:** Report total doesn't match `SUM(ABS(quantity_delta) * cost_price)` for the same tagged rows.

### Pitfall 2: Expiry-loss report implies batch/lot traceability (Pitfall 8 from milestone research)

**What goes wrong:** Report copy uses "batch," "lot," or "which shipment" language the underlying one-active-expiry-per-product schema can't support.
**Why it happens:** Industry-standard "expiry loss" reporting usually assumes lot tracking; this system deliberately doesn't have it (PROJECT.md).
**How to avoid:** Scope copy to "product-level write-off events" only.
**Warning signs:** UI copy review finds "batch"/"lot"/"shipment" language anywhere in the Expiry-Loss section.

### Pitfall 3: Turnover's "average inventory value" silently becomes a made-up historical-cost reconstruction

**What goes wrong:** Trying to value the as-of-start-date reconstructed quantity at a *historical* cost that doesn't exist in the schema, or worse, computing a fake historical cost by working the weighted-average formula backward through the movement log (which is unreliable — `stock_movements` doesn't record the delivery cost per movement, only `product_id`/`quantity_delta`/`reason`).
**Why it happens:** "Average inventory value over a period" sounds like it wants period-accurate valuation.
**How to avoid:** Per D-03/D-04, always value reconstructed quantities at the product's *current* `inventory.costPrice`. State this limitation explicitly in the report: "Average inventory value uses today's cost applied to reconstructed historical quantities, not period-accurate historical costs" (per project blocker note in STATE.md: "no periodic-snapshot infrastructure exists yet for accurate period-average inventory value").
**Warning signs:** Code references a "historical cost" field that doesn't exist on `stock_movements`; turnover numbers for past periods change every time `inventory.costPrice` changes (this is actually *expected* behavior given the design, but must be documented as a known limitation, not silently hidden).

### Pitfall 4: Adding `expired` to only one of the two reason enums

**What goes wrong:** `domain.ts` has **two** parallel schemas — `InventoryAdjustReasonSchema` (6 values, used by `InventoryLogSchema`, which is what `useInventoryLog`/`useMutationAdjustInventory` actually `.parse()` against at `src/entities/inventory/model/queries.ts:369,469`) and `StockMovementReasonSchema` (11 values, used by `StockMovementSchema`, not currently wired into the inventory query file). Adding `expired` to only `StockMovementReasonSchema` (the "obviously extended" one) leaves `InventoryLogSchema.parse()` throwing a Zod validation error the moment a real `expired` row is read back by `useInventoryLog` or returned from `useMutationAdjustInventory`, silently breaking the entire inventory change-log UI (it fails inside a try/catch that returns a generic error, per the pattern at `queries.ts:466-481`).
**Why it happens:** The two-schema split isn't obvious from a glance at the picker UI code path alone — `StockMovementReasonSchema` looks like "the extended one" and is the natural target, but the actual runtime `.parse()` call sites use `InventoryLogSchema`/`InventoryAdjustReasonSchema`.
**How to avoid:** Add `expired` to **both** `InventoryAdjustReasonSchema` and `StockMovementReasonSchema` in the same edit `[VERIFIED: src/shared/lib/domain.ts:97-141]`.
**Warning signs:** `useInventoryLog()` throws/returns an error result as soon as one `expired`-tagged row exists; e2e test for the reason picker passes on write but the change-log table silently stops rendering rows.

### Pitfall 5: Exposing bar-pos-era reason values in the new picker

**What goes wrong:** `StockMovementReasonSchema` is a superset including `prep_production`, `prep_consumption`, `combo_component`, `refund`, `void` — dead/removed-domain values from the stripped bar-pos codebase. A naive "map the full enum to `<option>`s" implementation would surface these nonsensical choices to a supermarket cashier.
**Why it happens:** D-01 says "expose the full enum," which — read against the wrong schema (`StockMovementReasonSchema` instead of the 6-value `InventoryAdjustReasonSchema` plus `expired`) — over-includes.
**How to avoid:** The picker's option list is the 6 values named explicitly in D-01 (`waste, expired, delivery, correction, manual_adjustment, physical_count`) — not a blind `Object.values(StockMovementReasonSchema.options)` spread.
**Warning signs:** Picker dropdown shows "Prep Production" or "Combo Component" as selectable reasons.

## Code Examples

### Weighted-average cost formula (D-03's cost basis, confirmed verbatim from the live RPC)

```sql
-- Source: supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql:66-69
-- [VERIFIED: supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql:66-69]
v_new_cost := ROUND(
  (v_old_qty * v_old_cost + v_quantity * v_cost_price) / (v_old_qty + v_quantity),
  2
);
```
This is what `inventory.costPrice` already holds — Valuation report does **not** recompute this; it reads `inventory.costPrice` directly per product.

### Adding `expired` — migration pattern to follow exactly

```sql
-- Source pattern: supabase/migrations/20260422000003_add_physical_count_reason.sql:43-49
-- and supabase/migrations/20260424000001_stock_movements.sql:16-17,25-40
-- [VERIFIED: supabase/migrations/20260422000003_add_physical_count_reason.sql:43-49]
BEGIN;
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_reason_check
  CHECK (reason IN (
    'sale', 'manual_adjustment', 'waste', 'delivery', 'correction', 'physical_count',
    'prep_production', 'prep_consumption', 'combo_component', 'refund', 'void',
    'expired'
  )) NOT VALID;
COMMIT;
```
`NOT VALID` skips scanning existing rows (matches the established pattern — this table's constraint has never been validated against historical data, consistent with prior migrations).

### Domain.ts edit — both enums, one change

```typescript
// Source: src/shared/lib/domain.ts:97-141 — [VERIFIED: src/shared/lib/domain.ts:97-141]
// current (before this phase):
export const InventoryAdjustReasonSchema = z.enum([
  'sale', 'manual_adjustment', 'waste', 'delivery', 'correction', 'physical_count',
]);
export const StockMovementReasonSchema = z.enum([
  'sale', 'manual_adjustment', 'waste', 'delivery', 'correction', 'physical_count',
  'prep_production', 'prep_consumption', 'combo_component', 'refund', 'void',
]);
// required edit: add 'expired' to BOTH z.enum([...]) arrays (and both const objects, EXPIRED: 'expired')
```

### Existing units-sold aggregation to reuse for Turnover (verbatim)

```typescript
// Source: src/entities/tab/model/queries-reports.ts:225-246
// [VERIFIED: src/entities/tab/model/queries-reports.ts:225-331]
export function useProductSalesReport(from: Date, to: Date) {
  return useQuery({
    queryKey: ['reports', 'product-sales', from.toISOString(), to.toISOString()] as const,
    queryFn: async (): Promise<Result<ProductSalesRow[]>> => {
      const { data, error } = await db
        .from('order_items')
        .select(`
          quantity, unit_price, modifier_price_delta, cost_price_snapshot, weight_grams,
          products(id, name, categories(name)),
          orders!inner(status, tabs!inner(created_at))
        `)
        .neq('orders.status', 'voided')
        .gte('orders.tabs.created_at', from.toISOString())
        .lte('orders.tabs.created_at', to.toISOString());
      // ... groups by productId, computes units/revenue/margin
    },
  });
}
```
Turnover's units-sold side is `useProductSalesReport(from, to).data.units`, joined client-side against the new valuation-reconstruction result — no new sales query needed.

### Existing batch-adjust dialog to extend with the reason picker (D-01)

```typescript
// Source: src/widgets/InventoryPagePanel.tsx:189-212 — [VERIFIED: src/widgets/InventoryPagePanel.tsx:189-212]
// current hardcoded call:
const res = await adjustMutation.mutateAsync({
  productId: batchProductId,
  quantityDelta: delta,
  reason: InventoryAdjustReason.MANUAL_ADJUSTMENT,  // ← D-01 replaces this with picker state
  staffId,
});
```
`useMutationAdjustInventory`'s `mutationFn` already accepts `reason: string` untyped at the call boundary (`src/entities/inventory/model/queries.ts:295-305`) and inserts it directly into `stock_movements` — the DB CHECK constraint is the actual validation gate once `expired` is added, but the picker should still constrain the `<select>` to exactly the 6 D-01 values client-side.

## State of the Art

No frameworks or approaches have materially changed here — this is a same-codebase pattern extension, not a new-technology adoption. N/A.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New report queries/widget should live at `src/entities/inventory/model/queries-analytics.ts` and `src/widgets/InventoryAnalyticsPanel/` (exact file/folder names) — not explicitly mandated by CONTEXT.md, inferred from the existing `queries-reports.ts`/`*Panel` naming convention | Recommended Project Structure | Low — planner/executor can freely rename; convention-following only, no behavioral risk |
| A2 | The reason-picker (D-01) should be added inline to `InventoryPagePanel.tsx`'s existing dialog rather than moved into the empty `src/features/adjust-inventory/` FSD stub folder | Recommended Project Structure | Low-medium — if the project prefers strict FSD (feature = 1 mutation hook + 1 UI component in its own folder), this should move into `features/adjust-inventory/`; either is a valid FSD reading since the mutation hook already lives in `entities/inventory` and the dialog is currently inline in a widget |

**A1 and A2 are low-risk naming/organization assumptions, not factual claims about behavior — everything else in this document (schema shapes, existing formulas, RBAC gates, CHECK constraint state) is `[VERIFIED]` by directly reading the source file.**

## Open Questions

1. **Should Turnover's "average inventory value" use (start + end)/2, or a movement-count-weighted average?**
   - What we know: D-04 says reconstruct from the movement log; STATE.md's blocker note says "no periodic-snapshot infrastructure exists yet... compute from the movement log going forward and document the limitation."
   - What's unclear: Whether a simple two-point average `(valueAsOf(from) + valueAsOf(to)) / 2` is acceptable, or whether the owner expects something closer to a true time-weighted average (which would require reconstructing value at every movement event within the range, not just the two endpoints).
   - Recommendation: Start with the two-point average (cheapest, matches "no snapshot infra" constraint) and document the formula inline in the report per success criterion #5 — this is exactly the kind of formula-transparency requirement the phase's own success criteria anticipates. If the owner finds two-point averaging too coarse in practice, a movement-weighted version is a pure-function upgrade with no schema change needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth surface — reuses existing session |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | Reports gated by existing `view_reports` RBAC action (manager+) via `ReportsRoute` `[VERIFIED: src/shared/lib/rbac.ts:20,45-55]`; reason-picker gated by existing `adjust_inventory` action (manager+, `ProtectedAction` wrapper already present at `InventoryPagePanel.tsx:259,271`) — no new RBAC action needed |
| V5 Input Validation | Yes | Zod (`InventoryAdjustReasonSchema` with the new `expired` literal) validates client-side; DB `CHECK` constraint (`stock_movements_reason_check`) is the server-side enforcement boundary — both must be updated together (Pitfall 4) |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV formula injection in exported reports | Tampering | Reuse existing `rowsToCsv` (`src/shared/lib/exporters/csv.ts`) which already neutralizes CWE-1236 by prefixing risky leading characters — do not hand-roll a new CSV serializer for the 4 new report types |
| Privilege escalation via reason-picker (a cashier writing an `expired`/`waste` adjustment without manager review) | Elevation of Privilege | Already mitigated — the entire batch-adjust dialog is wrapped in `ProtectedAction action="adjust_inventory"` (manager+); the new picker adds no new privilege surface, it only adds options within an already-gated action |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit) + React Testing Library v16 + Playwright v1.59 (E2E) `[VERIFIED: CLAUDE.md "Actual Stack" table]` |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E, `channel: 'chrome'`, `headless: true`) |
| Quick run command | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts` |
| Full suite command | `npm run test` (unit), `npm run test:e2e` (E2E) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INVR-01 | `computeInventoryValueAsOf` reconstructs qty × current cost correctly against fixture movements | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t valuation` | ❌ Wave 0 |
| INVR-02 | `groupShrinkageByReason` buckets waste/correction correctly, excludes sale/refund, buckets pre-feature `manual_adjustment` as unclassified (D-02) | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t shrinkage` | ❌ Wave 0 |
| INVR-03 | Expiry-loss filter isolates `reason='expired'` rows only, once `expired` reason exists | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t expiry` | ❌ Wave 0 |
| INVR-04 | Turnover combines `useProductSalesReport` units with valuation-reconstruction average correctly | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t turnover` | ❌ Wave 0 |
| Success criterion 5 (each formula auditable/reconciles) | Formula string renders in each report's UI; report totals reconcile with tagged `stock_movements` sums for known fixture data | E2E + unit | `npx playwright test e2e/<new-spec>.spec.ts` (seed known movements via `getServiceClient`/`resetTestState` helpers per existing `e2e/07-reports.spec.ts` pattern) + fixture-pinned unit assertions | ❌ Wave 0 |
| D-01 (reason picker) | Picker exposes exactly 6 values, excludes bar-pos-era reasons, `expired` persists and reads back correctly | E2E | `npx playwright test e2e/10-inventory.spec.ts` (extend existing spec) or new spec | Existing spec at ❌/✅ — verify during planning whether `e2e/10-inventory.spec.ts` already covers the batch-adjust dialog and extend in place |

### Sampling Rate
- **Per task commit:** `npx vitest run src/entities/inventory/model/queries-analytics.test.ts`
- **Per wave merge:** `npm run test` (full unit suite) + `npm run typecheck` + `npm run lint`
- **Phase gate:** `npm run test:e2e` (or targeted spec files) green before `/gsd-verify-work`, per this repo's CLAUDE.md mandatory-automated-testing policy (no `human_needed` terminal states)

### Wave 0 Gaps
- [ ] `src/entities/inventory/model/queries-analytics.ts` — the 4 report queries + shared `computeInventoryValueAsOf` helper (does not exist yet)
- [ ] `src/entities/inventory/model/queries-analytics.test.ts` — fixture-pinned unit tests for all 4 formulas, mirroring the existing pure-function-extraction pattern in `src/entities/tab/model/queries-reports.test.ts` (`computePctTotals`, `fillMissingHours`, etc.)
- [ ] `supabase/migrations/<timestamp>_add_expired_reason.sql` — new CHECK constraint migration
- [ ] E2E coverage for the reason picker (D-01) and the new report tab (D-06) — check whether `e2e/10-inventory.spec.ts` and/or `e2e/07-reports.spec.ts` are the right extension points before creating new spec files (this repo's convention favors extending existing numbered specs over new files when the surface is closely related)

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `src/shared/lib/domain.ts:97-141,509-518,560-634` — reason enums, `InventorySchema`, `InventoryLogSchema`, `StockMovementSchema`
- `src/entities/inventory/model/queries.ts:1-495` — `useInventory`, `useMutationAdjustInventory`, `useInventoryLog` (confirms which schema is actually used at runtime — Pitfall 4)
- `src/widgets/InventoryPagePanel.tsx:1-441` — existing batch-adjust dialog to extend (D-01)
- `src/entities/tab/model/queries-reports.ts:220-334` — `useProductSalesReport` (reused for Turnover's units-sold side)
- `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx:1-176` — margin-unavailable fallback UI pattern
- `src/pages/reports/index.tsx:1-177` — existing Tabs/TabsList/DateRangePicker structure (D-06 target)
- `supabase/migrations/20260424000001_stock_movements.sql`, `20260422000003_add_physical_count_reason.sql`, `20260819000003_receive_shipment_weighted_avg_cost.sql`, `20260817000001_suppliers_receiving_expiry.sql` — CHECK constraint pattern, weighted-average-cost formula
- `src/shared/lib/supabase.types.ts:1315-1368` — `stock_movements` table shape (confirms no cost column)
- `src/shared/lib/rbac.ts:1-55` — `view_reports`/`adjust_inventory` RBAC gates (manager+)
- `package.json:62` — `date-fns ^4.1.0` already installed
- `.planning/research/PITFALLS.md:123-157,227,236-240` — Pitfall 7, Pitfall 8, phase-specific checklist items

### Secondary (MEDIUM confidence)
- `.planning/phases/14-.../14-CONTEXT.md` — user decisions D-01..D-06 (already locked, copied verbatim above)
- `.planning/STATE.md` Blockers/Concerns — turnover-averaging-gap note, cost-basis-pinning note

### Tertiary (LOW confidence)
- None — this phase required no external/web research; all findings are in-repo verified reads.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing/installed
- Architecture: HIGH — directly read every file the new code touches or extends
- Pitfalls: HIGH — Pitfall 7/8 sourced from prior milestone research; Pitfall 4/5 (dual-enum trap, bar-pos-era value leakage) discovered by directly reading `domain.ts` and `queries.ts` this session

**Research date:** 2026-08-19
**Valid until:** 30 days (stable, in-repo-only research; re-verify if `domain.ts` reason enums or `stock_movements` schema change before planning begins)
