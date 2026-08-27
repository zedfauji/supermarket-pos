# Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Four read-only reports layered on existing `inventory` / `stock_movements` (aka `inventory_log`) / `Product Sales` data:

1. **Valuation** — on-hand qty × current weighted-average cost, by product/category + store total.
2. **Shrinkage/Waste** — dollar value of non-sale stock loss, rolled up from `inventory_log` adjustment reason codes.
3. **Expiry-Loss** — dollar value of stock written off specifically due to expiry, filtered from the same adjustment data as #2.
4. **Turnover/Sell-through** — product/category-level, combining units-sold (Product Sales report) with average inventory value (#1).

One small, justified capture-UI addition is in scope alongside the reports (see D-01): without it, #2 and #3 have no real data to aggregate. No other new schema or capabilities. This phase depends on nothing and is sequenced first (lowest risk) ahead of Phase 15/16.

</domain>

<decisions>
## Implementation Decisions

### Data capture gap (shrinkage/expiry reason codes)
- **D-01:** Add a reason-picker to the existing manual-adjust dialog (`InventoryPagePanel`'s batch-adjust flow, currently hardcoded to `InventoryAdjustReason.MANUAL_ADJUSTMENT`). Expose the **full enum** as selectable options: `waste`, `expired` (new value — not yet in `InventoryAdjustReasonSchema`/`StockMovementReasonSchema`), `delivery`, `correction`, `manual_adjustment`, `physical_count`. — **Reversibility:** costly — `expired` becomes a permanent enum member once real rows reference it; removing it later requires a data migration for any row tagged `expired`.
- **D-02:** Pre-Phase-14 adjustment rows (all recorded as `manual_adjustment` today, since no reason picker existed) are **not** reclassified or guessed at. Shrinkage/Waste report shows them under a separate "unclassified adjustments" line, explicitly not attributed to waste or expiry. Report UI notes that fine-grained classification only became available as of this feature.

### Cost basis reconciliation
- **D-03:** Valuation report prices on-hand stock at **current weighted-average cost** (`inventory.costPrice`) per the roadmap's success criteria. This is a different, legitimately-divergent basis from Product Sales' margin calc, which uses `costPriceSnapshot` (cost captured at time of sale). Each report states its own formula inline (already required by success criteria #5) **plus** the Valuation report carries an explicit note/tooltip explaining why its numbers won't match Product Sales margins if the owner cross-compares them directly.

### Turnover & valuation date-range behavior
- **D-04:** Turnover's "average inventory value" and Valuation's stock value are both **reconstructed from the `stock_movements` log** as of a point in time, rather than using only the live current-state snapshot. This means Valuation and Turnover share the same underlying "stock value as of date X" reconstruction logic — build it once, reuse for both.
- **D-05:** The Reports page's shared `DateRangePicker` applies to Valuation as **"as of end date"** — i.e. Valuation reconstructs on-hand value at the end of the selected range, not always "right now." Shrinkage/Expiry/Turnover use the date range as a normal from/to filter over `stock_movements` rows.

### Report placement
- **D-06:** All four reports live under a **single combined "Inventory Analytics" tab** on the existing Reports page (not four separate top-level tabs), with internal sub-sections for Valuation / Shrinkage-Waste / Expiry-Loss / Turnover on one scrollable page. Matches the existing `Tabs` + grouped-`TabsList` pattern in `src/pages/reports/index.tsx`, added as a new group (or subsection within an existing group) alongside "Sales" and "Staff & Tips."

### Claude's Discretion
- Breakdown-level UI details (product vs. category toggle/grouping, table vs. chart presentation) not explicitly discussed — user opted to proceed with sensible defaults. Default to product-level rows with a category subtotal/rollup and a store-wide total, consistent with how `ProductSalesPanel` already breaks down data.
- Exact reason-picker UI copy/labels, and whether `delivery`/`physical_count` remain selectable in the dropdown vs. shown as system-set/disabled — user confirmed "full enum exposed" so all six values should be pickable, but exact widget layout (dropdown vs. radio, ordering) is Claude's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` §INVR-01..04 — locked requirement text, v2-deferred items (category-level breakdown, locale-aware fields, trend views), Out of Scope table (no FIFO/FEFO engine, no AI shrinkage classification, no live/realtime dashboards)
- `.planning/ROADMAP.md` §"Phase 14" — goal, success criteria (5 items), depends-on note

### Research (this milestone)
- `.planning/research/PITFALLS.md` Pitfall 7 (shrinkage report must be a filtered view over existing/extended reason taxonomy, not a re-derived expected-vs-actual calc) and Pitfall 8 (expiry-loss report must NOT imply batch/lot-level traceability — this system tracks one active expiry date per product, not per shipment; scope report copy to product-level write-off events only)
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/FEATURES.md` — general milestone research

### Project-level decisions
- `.planning/PROJECT.md` — weighted-average-cost + earliest-expiry-wins scope decisions; explicit exclusion of FIFO/FEFO costing engines and batch/lot tracking
- `.planning/STATE.md` Blockers/Concerns (Phase 14 entries) — cost-basis pinning requirement and turnover-averaging gap, both resolved by D-03/D-04 above

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/pages/reports/index.tsx` — existing Reports page: `DateRangePicker` + grouped `Tabs`/`TabsList` pattern (groups: "Sales", "Staff & Tips") to extend with an "Inventory Analytics" tab.
- `src/widgets/ProductSalesPanel/ProductSalesPanel.tsx` — existing pattern for cost/margin display, including a "Margin unavailable — no recorded cost for this period" fallback state; model for how Valuation/Turnover should degrade gracefully on missing cost data.
- `src/widgets/InventoryPagePanel.tsx` (`handleBatchSubmit`, ~line 186-212) — the manual-adjust dialog to extend with the D-01 reason picker; currently hardcodes `reason: InventoryAdjustReason.MANUAL_ADJUSTMENT`.
- `src/features/export-report` — existing CSV export pattern (`rowsToCsv`, CSV-injection-safe) likely reusable for exporting the new reports.

### Established Patterns
- `InventoryAdjustReasonSchema` / `StockMovementReasonSchema` in `src/shared/lib/domain.ts` (lines ~97-138) — Zod enums backing `inventory_log`/`stock_movements.reason`; `StockMovementReasonSchema` is already a superset including bar-pos-era values (`prep_production`, `combo_component`, etc.) that should NOT be exposed in the new picker (dead/removed-domain values).
- `stock_movements` table (`src/shared/lib/supabase.types.ts` ~line 1314) has a `notes` free-text column already — available if the picker needs a supplementary note, not required by any decision above.
- Cost fields: `inventory.costPrice` (current weighted-average) vs. `orders.order_items.costPriceSnapshot` (point-in-time snapshot at sale) — the two bases behind D-03.
- Reports page uses `toDateStr`/`fromDateStr` local helpers for date-range state — reuse rather than reinventing.

### Integration Points
- New Valuation/Turnover "as of date" reconstruction logic will need to query `stock_movements` (ordered by `created_at`) per product, likely via a new read-only query/RPC in `src/entities/inventory/model/queries.ts` — no new schema, aggregation only.
- Reason picker (D-01) touches `src/features/adjust-inventory` (currently a stub — only a `.gitkeep`) or wherever `handleBatchSubmit`'s mutation call lives; also requires adding `expired` to both `InventoryAdjustReasonSchema` and `StockMovementReasonSchema` in `domain.ts`, plus a Supabase migration if the DB has a matching CHECK constraint/enum on `stock_movements.reason` (currently typed as loose `string` in `supabase.types.ts`, but verify DB-side constraint during planning/research).

</code_context>

<specifics>
## Specific Ideas

No UI mockups or exact wording specified — user deferred remaining presentation details to Claude's discretion (see "Claude's Discretion" above). The one hard constraint volunteered was: full reason enum should be exposed in the picker, not just a curated subset.

</specifics>

<deferred>
## Deferred Ideas

- Category-level shrinkage/turnover breakdown as the *default* view — already tracked in REQUIREMENTS.md v2 Requirements as deferred until store-level reports ship and the owner asks for it. Not re-opened here.
- Trend view (week-over-week/month-over-month) for valuation/shrinkage/turnover — already deferred in REQUIREMENTS.md v2 Requirements until point-in-time reports have been used for at least a month.
- A dedicated "write off expired stock" action wired to the near-expiry-alert flow (distinct from the generic manual-adjust dialog) — not discussed/requested; D-01's minimal reason-picker on the existing dialog covers the capture gap without adding a new workflow. Could be proposed as a future phase if the owner finds the generic dialog clunky for this specific case.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope in `cross_reference_todos`.

</deferred>

---

*Phase: 14-Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover)*
*Context gathered: 2026-08-19*
