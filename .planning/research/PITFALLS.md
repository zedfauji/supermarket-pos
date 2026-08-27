# Pitfalls Research

**Domain:** Adding receipt-template/design customization, purchase-order/reorder workflows, and inventory valuation/shrinkage/turnover reporting to an existing single-store grocery POS
**Researched:** 2026-08-19
**Confidence:** HIGH (grounded in this codebase's own architecture/decisions + general ESC/POS and retail-inventory literature); MEDIUM on exact reorder/valuation formulas since no accounting requirements were specified in PROJECT.md

## Critical Pitfalls

### Pitfall 1: Receipt designer's WYSIWYG preview lies about what the printer will actually produce

**What goes wrong:**
A screen-based (HTML/CSS) template editor lets the owner drag/resize/style freely, but the physical 80mm ESC/POS printer is a fixed 48-character monospace grid (42 usable columns is the safe budget once margins are counted) with no arbitrary font sizing, no CSS layout, and a fixed image dot-width (576 dots for 80mm paper). A design that looks correct in the browser preview truncates, wraps mid-word, or misaligns columns on the real receipt — undetectable until someone prints one.

**Why it happens:**
It's much faster to build a preview with the DOM/CSS the rest of the app already uses than to build a second, ESC/POS-accurate renderer. The gap only surfaces at print time, which nobody exercises during UI development unless the printer is on the desk.

**How to avoid:**
Render the *actual* preview from the same character-budget/line-wrap logic that generates the ESC/POS byte stream (single source of truth: one `receipt-format.ts`-style module producing structured lines, consumed by both the on-screen preview and the print/PDF paths — this repo already has a `receipt-format.ts` per v1.2's Phase 13 plan; reuse it, don't fork a second formatter for the designer). Enforce the 42-char budget in the editor itself (reject/warn on custom field combinations that overflow), not just at print time.

**Warning signs:**
Preview is a free-form HTML canvas; designer allows arbitrary font-size/column-width numbers without validating against a fixed character budget; no test that renders a template through the real ESC/POS byte-encoder and asserts line lengths.

**Phase to address:**
Receipt Designer phase — success criteria should include an automated test that takes a saved template, runs it through the actual print-formatting code, and asserts every line fits the physical column budget (and that logo images resolve to a valid dot-width).

---

### Pitfall 2: Non-ASCII/locale characters print as garbage because codepage isn't handled

**What goes wrong:**
This app is bilingual (es-MX default, en-US) and already ships accented characters (á, é, í, ó, ú, ñ) throughout the UI. ESC/POS printers use single-byte codepages, not UTF-8, by default. A receipt designer that lets the owner type free-text branding fields (store name, footer message, promo text) in Spanish will print mojibake unless the printer is explicitly switched to the correct codepage (or a UTF-8-capable codepage/mode) before those bytes are sent.

**Why it happens:**
Developers test with ASCII-only sample data ("Test Store", "Thank you"); the bug only appears once a real Spanish-language store name or footer ("Gracias por su compra") is entered, which may not happen until the customer configures it themselves after launch.

**How to avoid:**
Explicitly set/verify the printer codepage (or use the printer's UTF-8 mode command if the hardware supports it) once, in the shared printer-service init, not per-template. Add a Playwright/unit test round-tripping a template with Spanish accented characters through the byte-encoder and asserting the expected codepage bytes, not just that a print call was made.

**Warning signs:**
Existing E2E receipt specs (`08-settings-receipt`, `49-receipt-category-grouping`) only use ASCII fixture data; no test exercises accented characters through the actual print path.

**Phase to address:**
Receipt Designer phase — add an explicit accented-character print-path test alongside the layout-budget test from Pitfall 1.

---

### Pitfall 3: New receipt-template table skips the RLS/migration discipline this project already learned the hard way

**What goes wrong:**
`receipt_settings` already exists as a store-wide singleton and needed a *retroactive* fix in v1.1 (SEC-02) to get migration-tracked RLS and a DB-enforced singleton constraint — without it, any manager could insert a second row and silently break every `.maybeSingle()` read app-wide. A receipt designer that stores templates in a new table (or a JSON blob column) without applying that same lesson from day one repeats the exact failure mode this codebase already paid down once.

**Why it happens:**
Under schedule pressure, "just add a `template` jsonb column to the existing table" or "create a quick new table, wire up RLS later" both feel like reasonable shortcuts — but this project's own history shows "later" doesn't reliably happen without a dedicated hardening pass.

**How to avoid:**
Any new receipt-template table gets migration-tracked RLS (cashier read-only, manager+admin write) and an explicit singleton-or-multi-template invariant enforced at the DB level from the first migration, mirroring the v1.1 SEC-02 fix — not bolted on later. Decide up front: is this store-wide singleton (like `receipt_settings`) or does it support multiple named templates (e.g., one default + seasonal variants)? That decision changes the constraint shape and should not be discovered mid-implementation.

**Warning signs:**
A migration adds a table/column with `ENABLE ROW LEVEL SECURITY` but no policies yet ("will add policies in a follow-up"); no unique constraint enforcing the intended cardinality (singleton vs. multi-template).

**Phase to address:**
Receipt Designer phase — schema/RLS should be part of the first plan in the phase, not deferred.

---

### Pitfall 4: Reorder suggestions computed in the wrong unit of measure produce nonsensical POs

**What goes wrong:**
This store already tracks multi-unit stock — case↔piece breakdown via `open-unit`, and kg/g/ml/L for loose-weight items. A naive reorder-point calculation ("current stock < reorder point → suggest ordering the difference") that operates in the *base* stock unit (pieces, or grams) instead of the supplier's *ordering* unit (cases, cartons, bulk sacks) produces a PO line like "order 37 pieces" when the supplier only sells 12-piece cases — someone then has to manually reinterpret every suggested line before it's usable, defeating the point of the feature.

**Why it happens:**
`inventory.reorder_point` and current stock are naturally stored/queried in the base unit the rest of the app already uses (pieces/grams); it's the easy join. Converting to the supplier's pack size/MOQ requires pulling in `supplier_products` (unit cost, pack size) data that may be incomplete or missing for some products.

**How to avoid:**
Reorder suggestions must round up to the supplier's case/pack size using `supplier_products` data, and must clearly flag products where that data is missing (can't produce a sane suggestion, fall back to base-unit quantity with a visible "unverified" flag) rather than silently suggesting a fractional-case quantity. Treat suggestions as a *starting point for staff review*, never an auto-submitted order — this matches the project's explicit "no automatic PO generation" scope boundary (see PROJECT.md Out of Scope).

**Warning signs:**
Reorder-suggestion query joins only `inventory`/`products`, never `supplier_products`; suggested quantities aren't rounded to pack multiples; a "Create PO" button that submits without a staff review/edit step.

**Phase to address:**
Purchase Orders phase — success criteria should include a test asserting suggested quantities round to the correct pack/case size and that a product missing supplier pack-size data is visibly flagged, not silently miscalculated.

---

### Pitfall 5: A second "receive stock" code path is built for POs instead of reusing `receive_shipment`

**What goes wrong:**
This codebase already has a battle-tested atomic receiving RPC (`receive_shipment`) that updates stock, weighted-average cost, and expiry together — and had a real cost/expiry-overwrite bug found and fixed in it (v1.1, DATA). If the PO feature is built with its own separate "receive against PO" mutation instead of routing through (or extending) `receive_shipment`, the codebase now has two divergent places that mutate cost/expiry/stock on receipt, and a future bug fix applied to one won't apply to the other — reintroducing exactly the class of bug v1.1 just closed.

**Why it happens:**
PO receiving has extra concerns the ad-hoc flow doesn't (matching against ordered quantities, partial receipt, PO status transitions), which tempts a from-scratch implementation rather than threading PO context through the existing RPC.

**How to avoid:**
Extend `receive_shipment` (or a thin wrapper that calls into the same core logic) to optionally accept a `purchase_order_id` and reconcile ordered vs. received quantities, rather than writing a parallel stock-mutation path. Any new receiving code must reuse the same weighted-average-cost + earliest-expiry-wins logic already decided for this project, not reintroduce a different costing rule for PO-linked receipts.

**Warning signs:**
A new RPC/edge function name like `receive_purchase_order` that itself contains `UPDATE inventory SET cost = ...` logic duplicated from `receive_shipment` rather than calling it; product cost/expiry differs depending on whether stock arrived via ad-hoc receiving vs. a PO.

**Phase to address:**
Purchase Orders phase — plan should explicitly reference `receive_shipment` and require the PO-receiving path to call into (not duplicate) it.

---

### Pitfall 6: Inventory valuation reports use a different cost figure than the rest of the app, so numbers don't reconcile

**What goes wrong:**
The Product Sales report already computes margin from a "historical-cost-snapshot" (cost at time of sale, not current cost) per existing project conventions. A new inventory-valuation report that instead uses *current* weighted-average cost for all historical stock movements — or, worse, introduces a second costing calculation (e.g., last-purchase-cost instead of weighted-average) — will produce a valuation total that doesn't match what the Inventory page or Product Sales report imply, and the owner (a non-accountant) has no way to know which number is "right." This erodes trust in the whole reporting feature.

**Why it happens:**
Valuation-at-a-point-in-time and margin-at-time-of-sale are subtly different problems, and it's easy to reach for whatever cost field is simplest to query (current `products.cost` or `inventory.avg_cost`) without checking it's the same source of truth already used elsewhere.

**How to avoid:**
Valuation reports should state clearly which cost basis they use (current weighted-average cost × current quantity-on-hand — this is standard "current inventory valuation," distinct from historical margin) and must NOT silently mix in the historical-cost-snapshot mechanism used for margin reporting; those are different questions (valuation = today's value of stock, margin = profit at time of past sales) and conflating them produces numbers nobody can explain. Document the formula in the report UI itself (a tooltip/footnote), since the owner is not an accountant.

**Warning signs:**
Two reports showing "cost" for the same product on the same day disagree; no single documented formula for "inventory value"; a report join pulls `products.cost` in one place and `inventory_log.unit_cost` in another for the same metric.

**Phase to address:**
Inventory Reporting phase — spec should pin down exactly one cost-basis definition per report type before implementation starts.

---

### Pitfall 7: Shrinkage/waste reporting double-counts or miscategorizes existing audited adjustments

**What goes wrong:**
This system already has a manual stock-adjustment flow with a *required reason* and full audit trail (`adjust-inventory`), plus refund-driven inventory reversals and expiry write-offs. A shrinkage report built as a fresh calculation ("expected stock per sales math minus actual counted stock") rather than one that reuses the existing adjustment-reason taxonomy risks two failure modes: (a) it re-derives "loss" from raw movement deltas and double-counts adjustments that were already reason-coded as shrinkage, or (b) it lumps legitimate reasons (refund reversal, correction of a prior data-entry mistake, planned promotional giveaway) in with genuine theft/damage/spoilage, making the shrinkage number meaningless for decision-making.

**Why it happens:**
"Shrinkage" sounds like it should be a report, but it's really just a *filtered view* over data the audit trail already has (adjustment reason = damage/theft/spoilage/expired, and physical-count variances). Building a separate calculation is more work and produces a number that doesn't tie back to anything auditable.

**How to avoid:**
Shrinkage/waste report = a filtered aggregation over the *existing* `inventory_log`/audit-log reason taxonomy (physical-count variances + adjustment reasons tagged as loss categories) plus expired/write-off events, not an independently reverse-engineered "expected vs. actual" calculation. If the current reason taxonomy doesn't cleanly distinguish "shrinkage-worthy" reasons from routine ones, extend the enum — don't build parallel logic around it.

**Warning signs:**
Report computes loss from `qty_sold` vs. `qty_received` deltas instead of querying tagged adjustment reasons; shrinkage total doesn't match the sum of audit-logged loss-reason adjustments for the same period; refunds/returns show up as "shrinkage."

**Phase to address:**
Inventory Reporting phase — verify the adjustment-reason taxonomy is sufficient before building the report; extend it first if needed.

---

### Pitfall 8: Expiry-loss report implies batch/lot-level tracking the system deliberately doesn't have

**What goes wrong:**
PROJECT.md explicitly decided against batch-level FEFO/lot tracking — this system tracks one active expiry date per product, not per received batch. An "expiry-loss report" that presents itself as showing "which batch expired and cost how much" is promising a level of traceability the data model cannot actually support (if two shipments of the same product arrived with different expiry dates, the earlier-expiry-wins rule already overwrote the older date; the system cannot tell you which *specific units* sold vs. expired). Building the report's UI/copy around batch-level claims sets up a support conversation ("why doesn't this match my physical count of what I threw out from that one bad delivery?") the system can't answer.

**Why it happens:**
"Expiry-loss report" sounds like it should track lots because that's how expiry loss is usually described in inventory literature; the temptation is to make the report look more sophisticated than the underlying data actually is.

**How to avoid:**
Scope the report honestly: it reports on *write-off events* (stock manually adjusted out with an "expired" reason, or flagged from the near-expiry alert flow and subsequently zeroed) at the product level, valued at the weighted-average cost at time of write-off — not a batch/lot cost reconstruction. State this scope explicitly in the report's own UI copy so the owner's expectations match what's actually measurable.

**Warning signs:**
Report UI or copy uses words like "batch," "lot," or "which shipment" when the underlying schema has no batch/lot identifier; feature request creep toward "track expiry per received shipment" mid-phase (this is explicitly out of scope per PROJECT.md).

**Phase to address:**
Inventory Reporting phase — pin report scope/wording to what the current one-active-expiry-per-product model can actually support before UI work starts.

---

### Pitfall 9: Turnover ratio uses point-in-time stock value as the denominator instead of a period average

**What goes wrong:**
Inventory turnover (COGS ÷ average inventory value) is highly sensitive to *when* you sample inventory value if you use a snapshot instead of a period average — especially for a small single store with lumpy purchasing (large supplier deliveries every few weeks rather than smooth daily restocking). Computing turnover with "current stock value" as the denominator instead of an average across the reporting period systematically distorts the ratio right after a big delivery (turnover looks artificially low) or right before one (looks artificially high), making the metric useless for the exact "am I overstocking or reordering too late" decision it's meant to inform.

**Why it happens:**
Averaging inventory value across a period requires either periodic snapshots or integrating over the movement log — both more work than querying "current value," which is one query against current stock × current cost.

**How to avoid:**
Compute average inventory value from the movement log (or periodic snapshots taken at report-generation time going forward, accepting that historical averaging is only as good as data collected from here on) rather than a single current-value read. Document in the report which averaging method is used and its limitation for periods before the feature shipped (no retroactive daily snapshots exist).

**Warning signs:**
Turnover formula literally reads `COGS / current_inventory_value`; the metric swings wildly week-to-week correlated with delivery dates rather than sales trends.

**Phase to address:**
Inventory Reporting phase — pin the averaging method in the spec before implementation; flag as needing deeper research if periodic-snapshot infrastructure doesn't already exist.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Build receipt-designer preview as plain HTML/CSS instead of reusing the ESC/POS formatter | Faster, more flexible-looking editor UI | Preview lies about real print output (Pitfall 1) | Never — reuse the shared formatter from day one |
| Store receipt templates as an unstructured JSON blob with no schema validation | Fast to ship, flexible for future fields | Corrupt/invalid templates crash printing at point-of-sale, hard to migrate later | Only if validated through a Zod schema at write time, matching `domain.ts` convention already used everywhere else |
| Auto-generate and auto-submit POs from reorder points with no staff review step | Saves a click, feels "smart" | Contradicts the project's own explicit "no automatic PO generation" decision; a bad supplier-pack-size assumption silently orders the wrong quantity | Never for this project — decided out of scope |
| Compute shrinkage/valuation reports from raw movement-log deltas instead of the existing reason-taxonomy/cost-basis conventions | Faster to build a first version | Numbers don't reconcile with Inventory page / Product Sales report, erodes trust (Pitfalls 6, 7) | Only as a throwaway prototype, never shipped |
| Skip RLS on a new PO/receipt-template table "for now" | Ships the feature faster | Repeats the exact SEC-02 gap this project already found and fixed once | Never — this project has direct precedent for the cost of this shortcut |

## Integration Gotchas

Common mistakes when connecting new features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|------------------|---------------------|
| Receipt printing (existing ESC/POS print path, `receipt-format.ts`) | Fork a second formatter for the designer's preview/output | Reuse the same line-building logic for preview, print, and (per v1.2 Phase 13) PDF — one source of truth |
| `receive_shipment` RPC | Write a parallel `receive_purchase_order` mutation with its own cost/expiry-overwrite logic | Extend `receive_shipment` to accept optional PO context; reuse weighted-average-cost + earliest-expiry-wins logic |
| `supplier_products` (existing pack size/unit cost data) | Reorder-suggestion logic ignores it and suggests raw base-unit quantities | Join `supplier_products` for pack-size rounding; flag products with missing data instead of guessing |
| `inventory_log` / audit adjustment reasons | Shrinkage report re-derives loss independently instead of querying tagged reasons | Extend the existing reason taxonomy if needed; aggregate from it, don't parallel-compute |
| `receipt_settings` singleton pattern / RLS precedent (v1.1 SEC-02) | New receipt-template table ships without migration-tracked RLS or a cardinality constraint | Apply the same RLS + DB-enforced-constraint pattern from day one |
| Existing offline mutation queue (`tabsStore.offlineQueue`) | PO creation/receipt-template edits silently assumed to work offline like checkout does | Explicitly decide PO/template management is online-only (low-frequency admin actions) rather than half-integrating with a queue built for checkout |
| i18n namespace scheme (10 existing namespaces, `no-literal-string` lint gate) | New PO/reporting/designer UI strings hardcoded, discovered only when `npm run lint` fails at the end of the phase | Add strings to the correct existing namespace (`wAdmin`/`wPanels`/`receipt`) as UI is built, not as lint cleanup afterward |
| `supabase.types.ts` regeneration | New PO/template tables developed against a stale generated-types file, `as any` casts left in permanently | Regenerate types as soon as a migration lands, per the project's own documented workaround discipline |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Valuation/shrinkage/turnover reports scan full `inventory_log`/audit history with no date bounds | Reports slow down noticeably as historical data accumulates over months | Require a date-range filter on every new report query; index on `(product_id, created_at)` if not already present | Not urgent at 1-2 terminal single-store scale, but noticeable after 1-2 years of accumulated log rows if unindexed |
| Reorder-suggestion query joins every product against every supplier on every Inventory-page load | Page load lag once catalog grows past a few hundred SKUs | Compute suggestions as an on-demand action (button/page) rather than an always-on dashboard widget; paginate | Low risk given single-store SKU count, but avoid making it a default-rendered widget on a hot page |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| New receipt-template table allows cashier-role write access (copying an over-permissive default instead of the manager+/admin-only pattern used for `receipt_settings`) | A cashier could alter store branding/legal footer text (e.g., tax ID, return policy) printed on every receipt | Mirror the existing RLS role split: cashier read-only, manager+admin write, exactly as `receipt_settings` already does |
| PO creation/approval has no role gate, or uses a looser check than `manage_settings`/`adjust_inventory` | Any staff member could commit the store to supplier orders | Gate PO creation/approval behind an appropriate RBAC action (new or reused), consistent with how `adjust_inventory`/`manage_settings` already gate sensitive mutations |
| Free-text fields in receipt templates (footer message, custom branding text) rendered into a PDF/HTML export without sanitization | Stored-content injection into an exported PDF/print pipeline if a future path renders it as HTML before converting to PDF | Treat template free-text the same as any other user input at a trust boundary — sanitize/escape before any HTML-to-PDF rendering step |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Receipt designer shows a polished on-screen preview that doesn't match the physical receipt (Pitfall 1) | Owner configures branding, prints a batch of real receipts, discovers wrapping/truncation only after customers have them in hand | Print-accurate preview + a one-click "test print" action gated behind having a printer connected |
| PO reorder suggestions presented as if pre-approved/ready-to-send | Owner accidentally sends a supplier an order with wrong quantities because the "suggestion" looked final | Suggestions always land in an editable draft state requiring explicit review/confirm before any supplier-facing action |
| Valuation/shrinkage/turnover numbers shown without stating their formula or cost basis | Owner (not an accountant) can't reconcile numbers across reports, loses trust in the whole reporting feature (Pitfall 6) | Each report states its formula/cost-basis inline (tooltip or subtitle), consistent across all inventory reports |
| Expiry-loss report implies batch-level granularity the system can't provide (Pitfall 8) | Owner expects to trace a specific bad delivery and can't, files it as a bug | Report copy explicitly scopes itself to product-level write-off events, not batch/lot traceability |

## "Looks Done But Isn't" Checklist

- [ ] **Receipt designer:** Often missing an actual print-path round-trip test — verify a saved template renders correctly through the real ESC/POS byte-encoder (line lengths, codepage, logo dot-width), not just that the preview component renders.
- [ ] **Receipt designer:** Often missing accented-character (es-MX) coverage — verify a template with ñ/á/é/í/ó/ú prints correctly, not just ASCII fixtures.
- [ ] **Purchase orders:** Often missing pack-size/MOQ rounding — verify suggested quantities round to the supplier's actual ordering unit, not raw base-unit deltas.
- [ ] **Purchase orders:** Often missing the "receive against PO" path reusing `receive_shipment`'s cost/expiry logic — verify PO-linked receiving produces identical weighted-average-cost and earliest-expiry-wins results as ad-hoc receiving.
- [ ] **Purchase orders:** Often missing a review/edit step before any supplier-facing action — verify no path auto-submits a PO without staff confirmation.
- [ ] **Inventory reports:** Often missing a single documented cost-basis per report — verify valuation, margin, and turnover reports don't silently disagree on the same product/period.
- [ ] **Inventory reports:** Often missing reconciliation with the existing audit-log reason taxonomy — verify shrinkage totals tie back to tagged adjustment reasons, not an independently re-derived number.
- [ ] **All three features:** Often missing RLS/migration discipline on new tables — verify every new table has migration-tracked RLS policies and correct cardinality constraints from its first migration, not a follow-up.
- [ ] **All three features:** Often missing i18n coverage — verify new UI strings exist in both `es-MX` and `en-US` catalogs and pass the `i18next/no-literal-string` lint gate, not patched in at the end.
- [ ] **All three features:** Often missing Playwright E2E coverage for the parts that *can* be automated (data assertions, print-job payload assertions, PO state transitions, report totals) with an explicit, reasoned note for the physical-hardware-only parts that can't (per this project's testing policy carve-out).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|--------------------|
| Receipt preview/print divergence discovered after templates are in use | LOW | Swap the preview renderer to consume the shared formatter; re-render existing saved templates against it to catch any that now fail validation; no data migration needed since templates are just config |
| Two divergent stock-mutation paths for PO receiving vs. ad-hoc receiving | MEDIUM | Consolidate into one code path behind `receive_shipment`; audit historical PO-received rows for cost/expiry discrepancies against what ad-hoc receiving would have produced, correct via the existing adjustment-reason mechanism |
| Valuation/shrinkage report numbers don't reconcile across reports | LOW–MEDIUM | Pin one cost-basis definition, update the divergent report's query, add the formula note to the UI; no schema change needed if cost is already tracked correctly at the source |
| RLS gap discovered on a new receipt-template/PO table after ship | LOW–MEDIUM | Add the missing migration-tracked RLS policies and DB constraint immediately (this project has a direct playbook for this from v1.1 SEC-02) — low cost if caught before real customer data accumulates in the table |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|------------------|
| Preview/print divergence (P1) | Receipt Designer phase | Automated test rendering a saved template through the real ESC/POS encoder, asserting line-length budget |
| Codepage/accented-character garbling (P2) | Receipt Designer phase | Automated test round-tripping Spanish accented text through the print byte-encoder |
| Missing RLS/constraint discipline on new template table (P3) | Receipt Designer phase | Migration review checklist item; automated RLS-policy test mirroring the v1.1 SEC-02 pattern |
| Reorder suggestions in wrong unit of measure (P4) | Purchase Orders phase | Automated test asserting pack-size rounding and missing-data flagging |
| Duplicate receive-stock logic for POs (P5) | Purchase Orders phase | Automated test asserting PO-linked and ad-hoc receiving produce identical cost/expiry results for equivalent inputs |
| Valuation report cost-basis mismatch (P6) | Inventory Reporting phase | Spec review pinning one cost-basis definition before implementation; automated test cross-checking valuation vs. Inventory-page totals |
| Shrinkage double-counting/miscategorization (P7) | Inventory Reporting phase | Automated test asserting shrinkage totals equal the sum of tagged loss-reason adjustments for a period |
| Expiry-loss report overpromising batch traceability (P8) | Inventory Reporting phase | Spec/copy review before UI work; explicit scope statement in report UI |
| Turnover ratio using point-in-time instead of period-average value (P9) | Inventory Reporting phase | Spec review pinning averaging method; flagged for deeper research if no snapshot infrastructure exists yet |

## Sources

- [Thermal Printer Templates — WCPOS](https://docs.wcpos.com/receipts/thermal-templates) — character-budget (42/48-column), dot-width (384/576), and codepage/UTF-8 handling for 80mm/58mm ESC/POS printers
- [Common Inventory Mistakes Retailers Make (& How POS Fixes Them)](https://floridapayments.com/common-inventory-mistakes-retailers-pos-solutions/) — over-ordering/stockout root causes
- [Reorder Point Formula for Inventory Management — Bloomreach](https://www.bloomreach.com/en/blog/how-to-solve-the-reorder-point-formula-inventory-management-strategy) — outdated demand data, ignored seasonality, MOQ/pack-size mismatches
- [Auto-Generate POs from Reorder Points — US Tech Automations](https://ustechautomations.com/resources/blog/ecommerce-generate-purchase-orders-from-reorder-points-recipe-2026) — MOQ/pack-size rounding pitfalls in automated PO suggestion
- [Inventory Shrinkage: Complete Guide — Descartes Finale](https://www.finaleinventory.com/guides/inventory-shrinkage/) — phantom inventory, shrinkage-vs-adjustment categorization, financial impact
- [Inventory Costing Methods: FIFO, LIFO, and Weighted Average — Descartes Finale](https://www.finaleinventory.com/accounting-and-inventory-software/inventory-costing-methods) — weighted-average cost-basis conventions and reconciliation risk
- This project's own decision history (`.planning/PROJECT.md` Key Decisions, v1.1 SEC-02 `receipt_settings` RLS retrofit, `receive_shipment` cost/expiry-overwrite bug fix, weighted-average-cost + earliest-expiry-wins scope decision, "no automatic PO generation" and "no batch-level FEFO" Out of Scope items) — the strongest source for this milestone, since it documents pitfalls this exact codebase has already hit once.

---
*Pitfalls research for: Receipt Designer + Purchase Orders/Reordering + Inventory Valuation/Shrinkage/Turnover Reporting (supermarket POS, v1.3 milestone)*
*Researched: 2026-08-19*
