# Feature Research

**Domain:** Small-retail/grocery POS — receipt branding, purchase-order/reordering, inventory analytics
**Researched:** 2026-08-19
**Confidence:** MEDIUM (web sources cross-checked across multiple vendors/blogs; codebase findings HIGH — read directly from source)

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Logo on printed receipt | Every commercial POS (Square, Lightspeed, Loyverse, Toast) prints a store logo; a receipt with no branding reads as "unfinished" | MEDIUM | `receipt_settings.logoDataUrl` and the upload UI (`upload-logo` feature) already exist and render in-app (`LogoImage` widget), but the **physical thermal print path does not use it** — `print_receipt` (Rust, `src-tauri/src/commands/printer.rs`) only ESC/POS-encodes a `Vec<String>` of pre-formatted text lines, no raster/bit-image command (`GS v 0`) exists yet. Printing the logo on paper is new Rust work (dither PNG→monochrome, chunk to printer width), not just a UI toggle. |
| Editable header text (store name, address, phone, GSTIN/tax ID) | Legally/practically expected on any retail receipt; also already half-built here (`headerLine2`) | LOW | Extend `ReceiptSettingsSchema` with a couple more header lines; already flows through `buildThermalReceiptText`. |
| Editable footer message (return policy, "thank you", promo line) | Universal — every reviewed POS (Lightspeed, Storeconnect, Microsoft Dynamics Commerce) supports this | LOW | `footerText` field already exists, 480-char cap. Likely just needs a proper editor UI + preview if one doesn't already exist. |
| Toggle optional line items (cashier name, customer name, receipt #, tax breakdown) | Common "receipt options" pattern across POS vendors — lets store match local expectations without a full designer | LOW | `showCashierName`/`showCustomerName`/`showReceiptNumber` already exist; a tax-breakdown toggle would be new but trivial (data already computed for checkout). |
| Live preview before print | Thermal paper is a consumable — every reviewed designer (Odoo receipt builder, Parzibyte's designer) shows a render before committing; printing 5 test receipts to check a logo fit is real cost for a solo operator | MEDIUM | `ReceiptPreview.tsx` already exists for the payment-flow preview; reuse/extend it as the settings-page live preview rather than building a second renderer. |
| Create a PO with line items against a supplier | Universal purchase-order pattern (inFlow, PosNation, doss.com) — a PO is fundamentally supplier + product + qty + cost lines | MEDIUM | New entity; `suppliers`/`supplier_products` already exist and should be reused for supplier/product selection and default cost. |
| PO status lifecycle (draft → ordered → received/closed) | Every PO tool reviewed has at minimum this state machine; "received" is what triggers stock update | MEDIUM | Must integrate with, not duplicate, `receive_shipment` — see Dependencies. Partial receiving (below) is the main complexity driver, not the states themselves. |
| Reorder suggestions from existing low-stock data | Every retail POS with reordering (AMS Retail, NRS+) surfaces a low-stock list that seeds a PO — this is the #1 requested win because it turns a report the store already has into action | LOW | Low-stock/reorder-point data already exists and is displayed (Inventory page). This feature is mostly "convert an existing list into pre-filled PO line items," not new data. |
| Receive against an open PO | Reviewed sources (doss.com, AMS Retail) call this out as where "most errors occur" — scanning against a PO instead of free-typing prevents inventory inaccuracies | MEDIUM-HIGH | Must extend `receive_shipment` (or add a `po_id` param) rather than fork a second receiving code path — the v1.1 weighted-average-cost/earliest-expiry-wins fix lives there and must not regress. |
| Inventory valuation report (on-hand qty × cost, by product/category, store total) | Universal "what is my inventory worth" report — koronapos.com and Finale both list it as a baseline inventory-control report | LOW-MEDIUM | Mostly a query (`sum(qty * cost)` grouped by category) over data that already exists (`inventory`, `products.cost` — cost is already weighted-average per the v1.1 fix). No new cost-tracking machinery needed. |
| Shrinkage/waste report (value of non-sale stock loss) | Standard KPI across every source reviewed (koronapos.com, Finale, BlueCart) — "shrinkage rate" is treated as a baseline retail metric, not a nice-to-have | LOW-MEDIUM | Rollup of the existing `inventory_log` / manual-adjustment reason codes (already audit-logged with required reason per Alpha). New work is aggregation + a report view, not new capture. |
| Expiry-loss report (value written off due to expiry) | Direct extension of the store's existing expiry tracking — reviewed sources treat expiry loss as a shrinkage sub-category for grocery/food retail specifically | LOW | Filter the same adjustment/movement data by an "expired" reason code; near-expiry alerts already exist as the leading indicator, this report is the trailing/financial one. |
| Turnover / sell-through report (product or category level) | Universal inventory KPI (koronapos.com lists it alongside GMROI as a core inventory-control metric) | MEDIUM | Needs units-sold (already available via existing Product Sales report) over average-inventory-value (from the new valuation query) for a period — formula/period choice is the only real design decision, not new data plumbing. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Generate PO from low-stock" one-click per supplier | Turns the reorder-point list the store already has into a ready-to-edit PO in one action — the single highest-leverage feature in this milestone for a solo operator who currently reorders from memory/gut feel | LOW | All source data (low-stock items, their usual supplier via `supplier_products`) already exists; this is UI + a prefill query, not a new subsystem. Do this before building any manual PO-line-entry-only flow — it's the 80% use case. |
| Partial PO receiving with backorder remainder tracking | Real-world grocery restocking rarely arrives complete (supplier short-ships, substitutes, or splits a delivery); tracking "3 of 10 cases received, 7 open" avoids the store silently losing track of what's still owed | MEDIUM | Natural extension of the PO status lifecycle above; worth the complexity because it's a genuine, frequent pain point for the domain (packaged Indian grocery imports have real supply variability), not speculative. |
| Category-level shrinkage/turnover breakdown (not just store total) | For a store selling frozen, loose-weight, and long-shelf-life dry goods side by side, a single store-wide shrinkage % hides where the actual loss is (frozen/loose items vs. shelf-stable packaged goods behave very differently) | LOW-MEDIUM | Same query as the store-level report, grouped by `category_id` instead of collapsed — cheap to add once the base report exists. |
| Locale-aware receipt template (reuses existing i18n) | The store already ships es-MX/en-US receipts via `react-i18next`'s `receipt` namespace; a designer that respects staff locale (not just static English fields) is differentiated versus most small-POS receipt builders which are English-only | LOW | Purely a matter of routing new custom-field labels through the existing `receipt` namespace — no new i18n machinery. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Freeform drag-and-drop/pixel-canvas receipt builder (Odoo-style) | Looks impressive in vendor demos; "it's a real designer" | An 80mm thermal receipt is a fixed-width monospace/bitmap surface (32/40/48 chars); free 2D positioning doesn't map onto ESC/POS text-line printing the way it does an A4 PDF invoice. Building a canvas engine for a medium that's fundamentally linear is solving a problem that doesn't exist here, and is a large, ongoing maintenance surface for a solo-maintained app. | Structured field toggles + ordering (which the schema already mostly has) plus a live preview. Gets 95% of the value at a fraction of the build/maintenance cost. |
| Custom fonts / rich typography on receipt | "Make the logo/heading look nicer" | ESC/POS thermal printers support only built-in bitmap fonts plus bold/double-height/double-width toggles — true custom fonts require rendering everything as an image, which adds print latency and a second rendering pipeline for every line, not just the logo. | Use the existing bold/emphasis toggles (`boldTotals` pattern) for hierarchy; reserve image rendering for the logo only. |
| Multiple receipt templates per terminal/register | "Different look for different registers/promos" | v1.1 already made a deliberate, documented decision (D-04) that `receipt_settings` is a store-wide singleton because this is a 1-2 terminal store with no terminal-identity concept — reopening that is scope creep with no real user behind it. | Keep the singleton; if a second terminal genuinely needs a different look later, that's a new decision point, not default scope. |
| Auto-PO generation / demand forecasting (auto-scheduled reorders based on sales velocity) | "The system should just reorder for me" | Explicitly out of scope per PROJECT.md — forecasting accuracy on a single store's noisy sales data would be unreliable, and a wrong auto-PO (over-ordering a spice with a 2-year shelf life vs. under-ordering fresh dairy) is worse than no automation. | The low-stock-seeded, manually-triggered PO (Differentiator above) gives the "the system did the work" feeling without unattended ordering. |
| Multi-level PO approval workflow (submit → approve → order) | Common in mid/large retail chains and B2B procurement tools | There is no organizational hierarchy here to approve against — it's one owner/admin and possibly one manager. An approval gate with no approver to route to is dead UI. | PO creation gated by existing `manager`+ RBAC tier (reuse `adjust_inventory`-style role gating), no separate approval state. |
| Multi-supplier price comparison / auto-routing per PO line | "Get the best price automatically" | Requires maintaining current pricing across every supplier for every product and a comparison engine — real complexity for a store that, per PROJECT.md, deliberately excludes supplier scorecards/performance analytics. | Each PO is created against one chosen supplier (as `supplier_products` already implies); the operator picks the supplier, same as today's manual receiving. |
| EDI / API integration to auto-send POs to suppliers | "Feels more professional/automated" | The store's suppliers (small Indian grocery importers/distributors) don't run EDI-capable systems; building integration plumbing for a non-existent recipient is pure waste. | PDF/print export of the PO, or a simple share/copy of line items for phone/WhatsApp/email — matches how the store actually orders today. |
| FIFO/weighted-average COGS valuation engine | "More accurate" inventory valuation | PROJECT.md explicitly excludes FIFO/FEFO costing engines as overkill for one store; a full COGS layer is a lot of machinery for marginal accuracy gain over current cost. | Value on-hand stock using the product's current weighted-average cost (already the receiving-time cost per the v1.1 `receive_shipment` fix) — good enough for a single-store valuation report. |
| AI/ML-driven shrinkage root-cause classification | "Detect theft/fraud patterns automatically" | Speculative machinery with no training data or track record for this store; a manual-reason-code rollup already gives an owner 90% of the diagnostic value ("which category, which reason, how much $") without a model to maintain. | Report existing manual adjustment reason codes grouped by category/reason/period — the store's own audit trail already captures the "why." |
| Live/real-time-subscribed valuation & shrinkage dashboards | "Always up to date" | These are analytical, backward-looking reports (end-of-day/weekly review), not operational screens like the POS cart — Realtime subscriptions add complexity (Zustand store wiring, connection handling) for no behavioral benefit over "load on page open." | Compute on demand / cache per existing Reports page pattern (`export-report` infra), same as the current trimmed report set. |

## Feature Dependencies

```
[Receipt: field toggles + header/footer text]
    └──independent of──> [Receipt: logo-on-paper printing]
                              └──requires──> [Rust: GS v 0 raster-image ESC/POS command in printer.rs]
                                                 (does not exist yet — logoDataUrl today only reaches
                                                  in-app UI, not the physical print path)

[PO: create PO + line items]
    └──requires──> [existing `suppliers` / `supplier_products` tables]

[PO: reorder suggestions]
    └──requires──> [PO: create PO + line items]
    └──requires──> [existing low-stock/reorder-point data (already surfaced on Inventory page)]

[PO: receive against open PO]
    └──requires──> [PO: create PO + line items]
    └──requires──> [existing `receive_shipment` RPC — extend with optional po_id, do not fork]

[PO: partial receiving / backorder tracking]
    └──requires──> [PO: receive against open PO]

[Inventory valuation report]
    └──requires──> [existing `products.cost` / weighted-average cost (v1.1 fix)]
    └──requires──> [existing `inventory` on-hand quantities]

[Turnover report]
    └──requires──> [Inventory valuation report] (needs average-inventory-value)
    └──requires──> [existing Product Sales report data (units sold)]

[Shrinkage/waste report]
    └──requires──> [existing `inventory_log` movement audit trail + adjustment reason codes]

[Expiry-loss report]
    └──enhances──> [Shrinkage/waste report] (same data, filtered to expiry-reason adjustments)
    └──requires──> [existing expiry tracking / near-expiry alerts]

[Category-level shrinkage/turnover breakdown]
    └──enhances──> [Shrinkage/waste report] and [Turnover report]
```

### Dependency Notes

- **Logo-on-paper requires new Rust ESC/POS raster-image support:** this is the single biggest hidden-complexity item in the whole milestone. `logoDataUrl` and its upload UI already exist and work for on-screen branding, which can create a false impression that "receipt logo" is already done — the physical thermal print path (`print_receipt` in `src-tauri/src/commands/printer.rs`) currently only accepts a `Vec<String>` of text lines and has no image/bitmap command at all. Scope this explicitly as new Rust work (image → monochrome dither → `GS v 0` chunked bytes), not a settings-UI task.
- **PO receiving must extend `receive_shipment`, not duplicate it:** the v1.1 milestone specifically fixed a cost/expiry-overwrite bug in that RPC (weighted-average-cost + earliest-expiry-wins). A second, PO-aware receiving code path would either miss that fix or require it to be re-implemented and kept in sync — high regression risk for a solo-maintained codebase. Add an optional `po_id` reference and reduce the PO's open quantity as part of the same call.
- **Valuation report unlocks turnover:** turnover needs an average-inventory-value denominator, which the valuation report's query already computes. Build valuation first; turnover is a thin layer on top plus existing sales data.
- **Shrinkage and expiry-loss share one data source:** both are rollups of the existing stock-adjustment audit trail, differing only in which reason codes are included. Implement as one underlying query with a reason-code filter, not two separate report engines.

## MVP Definition

### Launch With (v1 of this milestone)

- [ ] Receipt field customization (header lines, footer text, show/hide toggles) with live preview — highest-visibility, lowest-risk piece; mostly wiring an existing schema to a proper editor UI
- [ ] Logo-on-paper printing (Rust raster-image support) — the one piece of real new engineering; do it early since it's the biggest unknown, not last
- [ ] PO creation with reorder-point-seeded suggestions per supplier — the single highest-leverage feature of the whole milestone for a solo operator
- [ ] Receive against an open PO (full receive only, extending `receive_shipment`) — closes the PO loop end-to-end before adding partial-receive complexity
- [ ] Inventory valuation report — cheapest of the four new reports, and a prerequisite for turnover
- [ ] Shrinkage/waste report + expiry-loss report (built as one underlying rollup, two views/filters)

### Add After Validation (v1.x)

- [ ] Partial PO receiving / backorder remainder tracking — add once full-receive PO flow is proven in daily use and short-shipments are observed to actually happen often enough to justify it
- [ ] Turnover report — layer on top of valuation once that report's numbers are trusted
- [ ] Category-level breakdowns for shrinkage/turnover — cheap add once the store-level versions exist and the owner asks "which category though?"

### Future Consideration (v2+)

- [ ] Locale-aware custom receipt field labels beyond what the `receipt` i18n namespace already covers — defer until a genuine bilingual-printing need surfaces (both locales already share the same field toggles today)
- [ ] Trend view (week-over-week/month-over-month) for valuation/shrinkage/turnover — defer until the point-in-time reports have been used for at least one full month and a trend need is actually felt

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Receipt field toggles + live preview | MEDIUM | LOW | P1 |
| Logo-on-paper (Rust raster printing) | HIGH | MEDIUM | P1 |
| PO creation + low-stock-seeded suggestions | HIGH | LOW-MEDIUM | P1 |
| Receive against open PO (full receive) | HIGH | MEDIUM-HIGH | P1 |
| Inventory valuation report | MEDIUM | LOW-MEDIUM | P1 |
| Shrinkage/waste + expiry-loss report | HIGH | LOW-MEDIUM | P1 |
| Partial PO receiving / backorder | MEDIUM | MEDIUM | P2 |
| Turnover report | MEDIUM | MEDIUM | P2 |
| Category-level breakdowns | LOW-MEDIUM | LOW | P2 |
| Locale-aware custom field labels | LOW | LOW | P3 |
| Trend views over time | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add once P1 is proven in daily use
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Reviewed Pattern A (Odoo POS Receipt Builder) | Reviewed Pattern B (Lightspeed / AMS Retail vendor-order flow) | Our Approach |
|---------|-----------------------------------------------|------------------------------------------------------------------|--------------|
| Receipt customization | Full drag-and-drop canvas with fields/tables/widgets | Template selection + field toggles, assignable per register | Field toggles + live preview, single store-wide template (matches Lightspeed's simpler pattern, not Odoo's canvas — see Anti-Features) |
| Reordering | N/A (not a receipt-builder concern) | Low-stock alerts → auto-generated draft PO for review/approval, routed by spend threshold | Low-stock-seeded PO draft, no approval routing (no hierarchy to route to) |
| Receiving | N/A | Scan against a PO to prevent inventory inaccuracies | Receive against an open PO by extending the existing `receive_shipment` RPC |
| Inventory analytics | N/A | Shrinkage rate, turnover, GMROI as standard inventory-control report set | Valuation, shrinkage/waste, expiry-loss, turnover — same category of report, expiry-loss specialized for perishable/near-expiry grocery goods (not present as a distinct line item in general-retail sources, but directly matches this store's existing expiry-tracking feature) |

## Sources

- [Setting up your receipt templates – Lightspeed Retail (X-Series)](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534014632987-Setting-up-your-receipt-templates) — MEDIUM confidence (vendor docs, general retail POS)
- [Set up and design receipt formats - Microsoft Dynamics 365 Commerce](https://learn.microsoft.com/en-us/dynamics365/commerce/receipt-templates-printing) — MEDIUM confidence (vendor docs)
- [Receipt designer for thermal printers - Free and open source | Parzibyte](https://parzibyte.me/blog/en/posts/receipt-designer-thermal-printers-free-open-source/) — MEDIUM confidence
- [POS Receipt Builder (drag & drop) | Odoo Apps Store](https://apps.odoo.com/apps/modules/18.0/nab_pos_receipt_builder) — MEDIUM confidence (illustrates the canvas-builder anti-pattern for this scale)
- [Purchase Order Management 101: 7 Tips & Tools for Grocers](https://www.posnation.com/blog/purchase-order-management) — MEDIUM confidence, grocery-specific
- [Purchase Order Management Software | inFlow Inventory](https://www.inflowinventory.com/features/purchase-order-software) — MEDIUM confidence
- [Low Stock Alerts & Reordering for Retail POS Systems | AMS Retail](https://amsretail.com/feeds/blog/low-stock-alerts-pos-systems-retail) — MEDIUM confidence
- [Vendor Orders in POS Systems for Retail: A Practical Guide | AMS Retail](https://amsretail.com/feeds/blog/manage-vendor-orders-pos-systems-retail) — MEDIUM confidence
- [Purchase Order Workflow: How to Automate and Scale Your PO Process | doss.com](https://www.doss.com/blog/purchase-order-workflow-how-to-automate-and-scale-your-po-process) — MEDIUM confidence
- [8 Operational Wins Independent Grocery Store Owners Unlock With an Integrated POS and Inventory System | NRS+](https://nrsplus.com/blog/8-operational-wins-independent-grocery-store/) — MEDIUM confidence, grocery-specific
- [Inventory Control Reports for Retail Businesses: Types, KPIs, and Best Practices | KORONA POS](https://koronapos.com/blog/inventory-control-report/) — MEDIUM confidence
- [Inventory Shrinkage: Complete Guide to Causes, Calculation, and Prevention | Descartes Finale](https://www.finaleinventory.com/guides/inventory-shrinkage/) — MEDIUM confidence
- [What Is Shrinkage: How to Calculate Inventory Shrinkage | BlueCart](https://www.bluecart.com/blog/inventory-shrinkage) — MEDIUM confidence
- Codebase (direct read, HIGH confidence): `src/shared/lib/domain.ts` (`ReceiptSettingsSchema`), `src/shared/lib/pos-printer.ts`, `src-tauri/src/commands/printer.rs`, `src/features/upload-logo/`, `src/widgets/LogoImage/`, `.planning/PROJECT.md`

---
*Feature research for: small-retail/grocery POS — receipt branding, purchase orders, inventory analytics*
*Researched: 2026-08-19*
