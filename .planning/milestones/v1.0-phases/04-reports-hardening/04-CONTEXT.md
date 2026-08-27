# Phase 4: Reports & Hardening - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The store can close out a day's business — reconcile cash and review sales performance — using a report set trimmed to what a supermarket needs, with the whole system verified to survive a realistic full day of checkout, receiving, and caja-close activity. Covers REP-01 (caja close/cash reconciliation) and REP-02 (trimmed report tabs: daily sales, product sales, hourly breakdown, payment methods, with bar/pool-specific tabs removed).

Caja open/close and cash reconciliation are already implemented and reused as-is from bar-pos (`close_caja_session` RPC, `CajaReportPanel`). This phase's net-new build surface is: (1) deleting bar/pool-specific report tabs and their code, (2) adding margin/profit to Product Sales, (3) a full-day hardening E2E spec that proves the whole checkout→receiving→caja-close loop under realistic volume, and (4) re-verifying that Phase 2/3's atomicity guarantees still hold end-to-end. No changes to the caja-close RPC or its UI are in scope.

</domain>

<decisions>
## Implementation Decisions

### Report Tab Trim
- **D-01:** Delete the "Tips" report tab and `TipDistributionPanel` widget entirely (component, query hook, and any now-unused RPC) — no tipping culture at a supermarket checkout. — **Reversibility:** costly — deleting the RPC/migration means re-adding it later needs a new migration, not just a UI toggle.
- **D-02:** Delete the "Modifier Popularity" report tab and `ModifierPopularityReport` widget entirely (component, query hook, `get_modifier_popularity_report` RPC/migration if unused elsewhere) — modifiers are a restaurant/bar concept, not applicable to packaged/loose supermarket goods.
- **D-03:** Keep "Staff Sales" and "Category Revenue" tabs as-is — generic retail reporting, not bar-specific, even though not explicitly named in REP-02's report list.
- **D-04:** "Remove" means delete the code entirely (component, query hook, unused RPC/migration), not just hide the tab from Reports page nav. Matches REP-02's explicit "removed" language and Phase 1's strip philosophy of not leaving dead code behind.
- Keep unchanged: session/caja, products, hourly, categories, payment-methods, voids, deletions-pre, deletions-post, refunds-reg (all generic retail/operations reports, none bar-specific).

### Product Sales Margin
- **D-05:** Add a margin/profit column to the Product Sales report (revenue − cost) — within REP-02's "product sales" report scope, not a new capability, since Phase 3 already captures `cost_price` at receiving.
- **D-06:** Margin uses **historical cost at time of sale**, not current `products.cost_price` — requires snapshotting `cost_price` onto `order_items` (or equivalent) at checkout time so margin stays accurate even after later cost changes from new deliveries. — **Reversibility:** costly — this adds a new write path into the checkout flow (`process_direct_sale_atomic`); removing it later means dropping a populated column and any report queries built against it.

### Full-Day Hardening
- **D-07:** Hardening deliverable is a single scripted full-day E2E soak spec: open caja → high-volume sales (~50-100+, covering barcode/search/loose-weight/multi-unit/split-pay cart types) → a receiving shipment → near-expiry alert check → close caja → assert cash reconciliation. High volume over breadth-only, to stress-test performance/locking at realistic daily transaction counts.
- **D-08:** Single-terminal only — no concurrent-terminal/concurrent-cashier test scenario in this phase, despite the 1-2 terminal deployment target. Concurrency testing is explicitly out of scope for this hardening pass.
- **D-09:** The soak spec re-verifies (reuses/extends) Phase 2/3's existing atomicity adversarial cases (mid-way failure on `process_direct_sale_atomic`, `receive_shipment`) rather than assuming they still hold — don't just test the happy path.

### Caja Close
- **D-10:** REP-01 is pure verification, not new build — `close_caja_session` and its UI/summary need no changes. Confirm it still reconciles correctly against supermarket-style sales (barcode/loose-weight/split-pay) inside the full-day soak spec.
- **D-11:** No receiving-cost visibility added to the caja-close summary — cash reconciliation stays payment-method-based as it is today; day's goods cost is a Product Sales / margin reporting concern, not a caja-close concern.

### Claude's Discretion
- Exact structure of the full-day soak spec (single `e2e/` file vs. split into a few focused specs), where in the codebase the RPC/migration deletions for Tips/Modifier Popularity land relative to other Phase 4 changes, and the specific query shape for joining historical cost onto Product Sales are left to research/planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Reports (REP-01, REP-02) — the locked requirement text for this phase
- `.planning/ROADMAP.md` §Phase 4 — goal, success criteria, dependency on Phase 2 + Phase 3 (both complete)
- `.planning/PROJECT.md` §Validated — confirms caja open/close/cash-reconciliation and payment processing are "existing, reusable as-is"

### Reports Page (trim target)
- `src/pages/reports/index.tsx` — current 12-tab, 4-group Reports page; "Tips" and "Modifier Popularity" tabs (and their imports/TabsContent blocks) to be deleted; "Staff", "Category Revenue", and the Operations group (voids/deletions-pre/deletions-post/refunds-reg) stay unchanged
- `src/widgets/TipDistributionPanel/` — widget to delete
- `src/widgets/ModifierPopularityReport/` — widget to delete
- `supabase/migrations/20260721000003_modifier_popularity_rpc.sql` — RPC migration to check for removal/supersession
- `src/entities/staff` (`useStaffTips`) — tip query hook to delete alongside the Tips tab

### Atomic-RPC Pattern (to re-verify, not rebuild)
- Phase 2's `process_direct_sale_atomic` (latest definition in `supabase/migrations/`) and Phase 3's `receive_shipment` RPC — the atomicity guarantees the hardening soak spec must re-exercise, including mid-way-failure adversarial cases already proven in Phase 2/3 verification
- `.planning/phases/02-core-direct-sale-checkout/02-CONTEXT.md`, `.planning/phases/03-supplier-receiving-expiry-tracking/03-CONTEXT.md` — prior atomicity decisions and patterns this phase must not contradict

### Product Sales / Cost Snapshot
- `src/widgets/ProductSalesPanel/` (or equivalent) — report to extend with a margin column
- `src/shared/lib/domain.ts` `OrderItemSchema` (or equivalent) — where a historical `cost_price` snapshot field must be added, following the Zod-source-of-truth convention
- Phase 3's `receive_shipment` RPC / `ProductSchema.cost_price` — the field being snapshotted

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/widgets/CajaReportPanel/CajaReportPanel.tsx` — existing, working caja-close/reconciliation UI, no changes needed
- `e2e/` existing specs (e.g. `02-caja.spec.ts`, `03-tab-order.spec.ts`, Phase 3's receiving specs) — patterns for the auth/login/data-setup boilerplate the full-day soak spec should reuse rather than reinvent
- `src/widgets/PaymentMethodsReport`, `StaffSalesPanel`, `CategoryRevenuePanel`, `VoidRefundPanel`, `DeletionsPreSendPanel`, `DeletionsPostCloseReport`, `RefundsRegister` — reports kept unchanged in this phase

### Established Patterns
- Report tabs follow a consistent shape: `TabsTrigger` + `TabsContent` pair in `src/pages/reports/index.tsx`, backed by a `src/widgets/<ReportName>` component and a query hook — deleting Tips/Modifier Popularity means removing all three layers cleanly
- Atomic RPC + edge function pairing (`process_direct_sale_atomic`, `receive_shipment`) is the house pattern for multi-effect mutations that must not partially fail — the hardening spec should exercise this via the UI/E2E layer, not bypass it

### Integration Points
- Full-day soak spec will touch checkout (Phase 2), receiving (Phase 3), near-expiry alerting (Phase 3), and caja close (existing) in one sequence — first genuinely cross-phase E2E coverage in this project
- Margin column requires touching the checkout write path (`process_direct_sale_atomic` or its edge function) to snapshot cost at sale time — the only Phase 4 change that isn't purely additive/report-only

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups or exact report layouts were discussed — open to standard approaches for how the margin column is displayed and how the soak spec is structured (single file vs. split).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Concurrent-terminal/concurrent-cashier testing was explicitly considered and deliberately excluded from this phase (D-08), not deferred as a future capability — revisit only if multi-terminal issues surface in real usage.

</deferred>

---

*Phase: 4-Reports & Hardening*
*Context gathered: 2026-08-14*
