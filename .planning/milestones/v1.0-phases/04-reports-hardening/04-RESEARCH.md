# Phase 4: Reports & Hardening - Research

**Researched:** 2026-08-15
**Domain:** Report-surface deletion (React/FSD + Postgres RPC), a checkout-time cost snapshot (Postgres RPC write path), and Playwright E2E soak testing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Delete the "Tips" report tab and `TipDistributionPanel` widget entirely (component, query hook, and any now-unused RPC) — no tipping culture at a supermarket checkout. — **Reversibility:** costly — deleting the RPC/migration means re-adding it later needs a new migration, not just a UI toggle.
- **D-02:** Delete the "Modifier Popularity" report tab and `ModifierPopularityReport` widget entirely (component, query hook, `get_modifier_popularity_report` RPC/migration if unused elsewhere) — modifiers are a restaurant/bar concept, not applicable to packaged/loose supermarket goods.
- **D-03:** Keep "Staff Sales" and "Category Revenue" tabs as-is — generic retail reporting, not bar-specific, even though not explicitly named in REP-02's report list.
- **D-04:** "Remove" means delete the code entirely (component, query hook, unused RPC/migration), not just hide the tab from Reports page nav. Matches REP-02's explicit "removed" language and Phase 1's strip philosophy of not leaving dead code behind.
- Keep unchanged: session/caja, products, hourly, categories, payment-methods, voids, deletions-pre, deletions-post, refunds-reg (all generic retail/operations reports, none bar-specific).
- **D-05:** Add a margin/profit column to the Product Sales report (revenue − cost) — within REP-02's "product sales" report scope, not a new capability, since Phase 3 already captures `cost_price` at receiving.
- **D-06:** Margin uses **historical cost at time of sale**, not current `products.cost_price` — requires snapshotting `cost_price` onto `order_items` (or equivalent) at checkout time so margin stays accurate even after later cost changes from new deliveries. — **Reversibility:** costly — this adds a new write path into the checkout flow (`process_direct_sale_atomic`); removing it later means dropping a populated column and any report queries built against it.
- **D-07:** Hardening deliverable is a single scripted full-day E2E soak spec: open caja → high-volume sales (~50-100+, covering barcode/search/loose-weight/multi-unit/split-pay cart types) → a receiving shipment → near-expiry alert check → close caja → assert cash reconciliation. High volume over breadth-only, to stress-test performance/locking at realistic daily transaction counts.
- **D-08:** Single-terminal only — no concurrent-terminal/concurrent-cashier test scenario in this phase, despite the 1-2 terminal deployment target. Concurrency testing is explicitly out of scope for this hardening pass.
- **D-09:** The soak spec re-verifies (reuses/extends) Phase 2/3's existing atomicity adversarial cases (mid-way failure on `process_direct_sale_atomic`, `receive_shipment`) rather than assuming they still hold — don't just test the happy path.
- **D-10:** REP-01 is pure verification, not new build — `close_caja_session` and its UI/summary need no changes. Confirm it still reconciles correctly against supermarket-style sales (barcode/loose-weight/split-pay) inside the full-day soak spec.
- **D-11:** No receiving-cost visibility added to the caja-close summary — cash reconciliation stays payment-method-based as it is today; day's goods cost is a Product Sales / margin reporting concern, not a caja-close concern.

### Claude's Discretion

Exact structure of the full-day soak spec (single `e2e/` file vs. split into a few focused specs), where in the codebase the RPC/migration deletions for Tips/Modifier Popularity land relative to other Phase 4 changes, and the specific query shape for joining historical cost onto Product Sales are left to research/planning.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Concurrent-terminal/concurrent-cashier testing was explicitly considered and deliberately excluded from this phase (D-08), not deferred as a future capability — revisit only if multi-terminal issues surface in real usage.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REP-01 | User can close a caja/register session and reconcile cash for the day | Pure re-verification (D-10) — `close_caja_session` RPC and `CajaReportPanel` are unchanged and already work; research confirms no code changes needed, only that the full-day soak spec (Track C) exercises this RPC against supermarket-style sale volume and asserts its own reconciliation summary |
| REP-02 | User can view daily sales, product sales, hourly breakdown, and payment-method reports, with bar/pool-specific report tabs removed | Research maps the exact deletion surface for the two bar/pool-specific tabs (Tips, Modifier Popularity — Track A) across widget/query/RPC/locale/export-plumbing layers, and the exact write/read path for the Product Sales margin addition (Track B); daily sales, hourly breakdown, and payment-method reports are already built and explicitly kept unchanged (D-03) |
</phase_requirements>

## Summary

This phase has three independent, low-risk-but-wide-touch-surface pieces of work: (1) deleting two report tabs and all their layers (component, query hook, RPC, locale strings, export-type plumbing), (2) adding a historical-cost snapshot column to `order_items` so Product Sales can show margin, and (3) a scripted full-day Playwright soak spec that re-exercises Phase 2/3's atomicity guarantees at realistic volume.

The deletion surface (D-01/D-02/D-04) is wider than CONTEXT.md's canonical-refs list suggests: `TipDistributionPanel` and `ModifierPopularityReport` are wired into a **shared, generic** `useExportReport`/`ExportButtons` feature (`ExportType` union, per-report CSV column consts, Excel/PDF exporter functions) that also serves every other report tab. This is a touch-many-places, delete-cleanly job, not an isolated widget deletion — get the surgical boundaries wrong (e.g. delete `fetchActiveProfiles`, which `useStaffMetrics` still needs) and a kept report breaks. A prior, unrelated tip feature (D-21 tip-bucket distribution / `tip_distribution_entries`) was **already fully removed in Phase 1** (`20260810000010_drop_tip_distribution.sql`) — do not confuse it with this phase's `TipDistributionPanel` (per-staff tip totals from `payments.tip_amount`, still live and unrelated to that dropped table).

For the margin column: **`cost_price` lives on `inventory`, not `products`** [VERIFIED: src/shared/lib/domain.ts:509-514]. `process_direct_sale_atomic` currently locks `products` (`base_price`, `sold_by_weight`) row-by-row but never touches `inventory` [VERIFIED: supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:100-150]. The margin work requires a new `SELECT cost_price FROM inventory WHERE product_id = ...` inside that same per-item loop, a new nullable `order_items` column, and a `domain.ts` schema addition — not a trivial "read an existing field" change.

For the soak spec: the project already has a mature, reusable pattern for RPC-level atomicity adversarial testing (`e2e/50-direct-sale-checkout.spec.ts`, `e2e/53-supplier-receiving.spec.ts`) — call the RPC directly via a service-role client and assert `payments`/`tabs`/`shipments`/`inventory` row counts are unchanged on rejection. **`playwright.config.ts`'s default per-test timeout is 45-60s** [VERIFIED: playwright.config.ts:16] — a UI-click-driven 50-100-sale loop will blow that budget; the soak spec must drive bulk volume through direct RPC calls (proven pattern) and reserve real UI interaction for a representative sample per cart type, with `test.setTimeout()` raised explicitly for the one long-running test.

**Primary recommendation:** Treat this phase as three independent PLAN tracks (report deletion, cost-snapshot + margin, soak spec) — they touch disjoint files and can be planned/executed in parallel waves. Do not let the soak spec become a fourth changed-file surface on top of the checkout RPC edit; write it against the *post*-margin-column `process_direct_sale_atomic`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Report tab trim (Tips, Modifier Popularity) | Browser/Client (React widgets, `src/pages/reports`) | Database/Storage (RPC + migration drop) | UI removal is the bulk of the work; the RPC deletion is a small, isolated Postgres migration |
| Historical cost-price snapshot at sale | API/Backend (`process_direct_sale_atomic` RPC) | Database/Storage (`order_items` new column) | Must be computed and written inside the same atomic transaction as the sale — cannot be derived after the fact once `inventory.cost_price` changes on a later delivery |
| Product Sales margin column | Browser/Client (`ProductSalesPanel`, `useProductSalesReport`) | — | Purely additive read/aggregation on already-snapshotted data; no new backend surface beyond the snapshot column itself |
| Full-day hardening E2E soak | Test/Verification (Playwright, `e2e/`) | API/Backend (exercises `process_direct_sale_atomic`, `receive_shipment`, `close_caja_session` directly) | Cross-cutting verification, not a production capability; mapped here only to flag it touches the same RPCs as the other two rows |
| Caja close / cash reconciliation (REP-01) | API/Backend (`close_caja_session` RPC, existing) | Browser/Client (`CajaReportPanel`, existing) | No changes in scope — pure re-verification per D-10 |

## Standard Stack

No new external packages are required for this phase. All work uses already-installed dependencies, versions confirmed directly from `package.json` this session [VERIFIED: package.json]:

| Library | Version | Purpose in this phase |
|---------|---------|------------------------|
| `react-i18next` / `i18next` | 17.0.10 / 26.3.6 | Delete/adjust locale keys for removed tabs; add margin-column labels |
| `recharts` | ^3.8.1 | Unaffected — `ModifierPopularityReport`'s chart is deleted wholesale, no recharts changes elsewhere |
| `@tanstack/react-table` | ^8.21.3 | `ProductSalesPanel`'s `ColumnDef<ProductSalesRow>[]` gains a margin column |
| `xlsx` | ^0.18.5 | `productSalesToWorkbook` (excel.ts) needs a margin column; `staffTipsToWorkbook` is deleted |
| `@playwright/test` | ^1.59.1 | Soak spec; `test.setTimeout()` override needed for the long-running test [CITED: playwright.dev/docs/test-timeouts] |

No `Alternatives Considered` table — this phase adds no new libraries.

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages. No `npm install` step exists in any of the three work tracks.

## Architecture Patterns

### System Architecture Diagram

```
Checkout (existing, Phase 2)
  CheckoutPanel → process-direct-sale edge fn → process_direct_sale_atomic RPC
                                                    │
                                    ┌───────────────┼─────────────────────────┐
                                    │               │                         │
                          products (base_price,  inventory (cost_price) ◄─NEW READ
                          sold_by_weight)  FOR      FOR the margin snapshot
                          UPDATE (existing)          (no lock currently taken
                                    │                 here — add one)
                                    ▼
                          INSERT INTO order_items (..., cost_price_snapshot) ◄─NEW COLUMN
                                    │
                                    ▼
                    AFTER INSERT trigger: decrement_inventory_on_order_item()
                          (unchanged — still only touches quantity_on_hand)

Reports page (src/pages/reports/index.tsx)
  Tabs: session | products | hourly | categories | payment-methods   ◄─ kept, generic
        [modifier-popularity]  [tips]                                ◄─ DELETE (D-01/D-02)
        staff | voids | deletions-pre | deletions-post | refunds-reg ◄─ kept

  ProductSalesPanel → useProductSalesReport()
    (client-side aggregation over order_items JOIN orders JOIN tabs — NOT an RPC)
    → adds SUM(cost_price_snapshot * quantity) per product → margin = revenue - cost

  ExportButtons (shared feature, ALL report tabs route through this)
    → useExportReport(): ExportType union + per-type CSV/Excel/PDF branches
        'tips-excel' | 'tips-pdf' | 'tips-csv'            ◄─ DELETE 3 cases + TipsContext
        'modifier-popularity-csv'                          ◄─ DELETE 1 case + context
        'products-*'                                       ◄─ EXTEND with margin column

Full-day soak spec (e2e/, new)
  open caja (helper) → N sales (RPC-bulk + UI-sample per cart type)
    → receiving shipment (RPC, receive_shipment)
    → near-expiry check (UI, existing dashboard alert)
    → close caja (UI, existing CajaReportPanel)
    → assert cash reconciliation against summed payments
  Adversarial sub-cases reuse e2e/50-direct-sale-checkout.spec.ts and
  e2e/53-supplier-receiving.spec.ts patterns: call the RPC directly with a
  tampered/short/invalid payload, assert row counts unchanged.
```

### Recommended Project Structure

No new directories. Files touched, by track:

**Track A — report deletion**
```
src/pages/reports/index.tsx                          # remove 2 TabsTrigger + 2 TabsContent, "menu" group (only child = modifier-popularity), adjust "staffTips" group → staff-only
src/widgets/TipDistributionPanel/                     # delete directory (3 files)
src/widgets/ModifierPopularityReport/                 # delete directory (2 files)
src/entities/staff/model/queries.ts                   # delete useStaffTips + staffKeys.staffTips; KEEP fetchActiveProfiles (shared with useStaffMetrics)
src/entities/staff/model/queries.staff-report.test.ts # delete only the `describe('useStaffTips', ...)` block; KEEP useStaffMetrics tests in same file
src/entities/staff/index.ts, model/index.ts            # remove useStaffTips export
src/entities/tab/model/queries-reports.ts             # delete useModifierPopularityReport + its exported type re-export
src/entities/tab/model/modifier-popularity-report.integration.test.ts  # delete file
src/shared/lib/domain.ts                              # delete StaffTipsSchema/StaffTips, ModifierPopularityRowSchema/ModifierPopularityRow (verify no other consumer first — none found this session)
src/features/export-report/model/useExportReport.ts   # delete tips-excel/pdf/csv + modifier-popularity-csv ExportType members, TipsContext/ModifierPopularityContext, TIPS_CSV_COLUMNS/MODIFIER_POPULARITY_CSV_COLUMNS, 5 switch cases, staffTipsToWorkbook/staffTipsToPdfBytes imports
src/features/export-report/ui/ExportButtons.tsx       # delete TipsProps/ModifierPopularityProps, 2 branches in handleExport
src/shared/lib/exporters/excel.ts, pdf.tsx             # delete staffTipsToWorkbook/staffTipsToPdfBytes (verify no other caller — none found this session)
src/shared/lib/i18n/locales/{es-MX,en-US}/pages.json   # delete reports.tabs.tips/modifierPopularity, reports.groups.menu (whole group), adjust reports.groups.staffTips label
src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json  # delete tipDistributionPanel{}, modifierPopularityReport{} blocks
supabase/migrations/<new>_drop_modifier_popularity_report_rpc.sql  # DROP FUNCTION get_modifier_popularity_report; regenerate supabase.types.ts after
```

**Track B — cost snapshot + margin**
```
supabase/migrations/<new>_order_items_cost_price_snapshot.sql   # ALTER TABLE order_items ADD COLUMN cost_price_snapshot numeric(10,2) (nullable — pre-existing rows stay NULL, no backfill possible since Phase 3's receive_shipment didn't retroactively version cost)
supabase/migrations/<new>_process_direct_sale_atomic_cost_snapshot.sql  # CREATE OR REPLACE, adding inventory.cost_price read + INSERT column
src/shared/lib/domain.ts                              # OrderItemSchema: add costPriceSnapshot: MoneySchema.nullable().optional() (mirrors InventorySchema.costPrice's own nullable pattern at line 514)
src/shared/lib/domain.ts                              # ProductSalesRow: add costTotal/margin/marginPct fields (plain type, not a Zod schema — verified below)
src/entities/tab/model/queries-reports.ts             # useProductSalesReport: select cost_price_snapshot, aggregate cost, compute margin per product
src/widgets/ProductSalesPanel/ProductSalesPanel.tsx    # add margin ColumnDef
src/shared/lib/exporters/excel.ts                      # productSalesToWorkbook: add margin column
src/shared/lib/exporters/pdf.tsx                        # productSalesToPdfBytes / ProductSalesDoc: add margin column
src/features/export-report/model/useExportReport.ts    # PRODUCTS_CSV_COLUMNS: add margin column
src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json   # productSalesPanel: add columnMargin key
```

**Track C — soak spec**
```
e2e/55-full-day-soak.spec.ts (or similar new number)   # new spec, following e2e/50-53's helper/pattern conventions
```

### Pattern 1: RPC-level atomicity adversarial test (reuse, don't reinvent)

**What:** Call the target RPC directly with a service-role Supabase client, bypassing the UI entirely, and assert row counts are unchanged on rejection.
**When to use:** Every "mid-way failure" / tampered-input case in the soak spec's D-09 re-verification.
**Example (verified live in this repo):**
```typescript
// Source: e2e/50-direct-sale-checkout.spec.ts:331-346 (verified read this session)
test('rejects a tampered price before creating any rows', async () => {
  const { admin, args } = await directSaleInput(0.02);
  const [{ count: paymentsBefore }, { count: tabsBefore }] = await Promise.all([
    admin.from('payments').select('id', { count: 'exact', head: true }),
    admin.from('tabs').select('id', { count: 'exact', head: true }),
  ]);
  const result = await admin.rpc('process_direct_sale_atomic', args);
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ ok: false, code: 'PRICE_MISMATCH' });
  const [{ count: paymentsAfter }, { count: tabsAfter }] = await Promise.all([
    admin.from('payments').select('id', { count: 'exact', head: true }),
    admin.from('tabs').select('id', { count: 'exact', head: true }),
  ]);
  expect(paymentsAfter).toBe(paymentsBefore);
  expect(tabsAfter).toBe(tabsBefore);
});
```
The equivalent for receiving already exists too (`e2e/53-supplier-receiving.spec.ts:140-194`, "rejects a later invalid line without receiving earlier lines" — asserts `inventory.quantity_on_hand` and `shipments` count unchanged). The soak spec's D-09 sub-cases should call these same two RPCs (`process_direct_sale_atomic`, `receive_shipment`) with fresh adversarial payloads inside the full-day sequence, not just at test start — e.g. after 50 real sales have run, prove one more tampered sale still gets rejected cleanly.

### Pattern 2: Bulk RPC-driven volume + representative UI sampling

**What:** For "50-100+ sales" volume (D-07), do not click through the UI 50-100 times — `playwright.config.ts`'s default test timeout is 45s (fast mode) / 60s (normal) [VERIFIED: playwright.config.ts:16-17], and every existing UI-driven checkout test in this repo (`e2e/50-direct-sale-checkout.spec.ts`) budgets `timeout: 30_000` just for the post-payment "Done" button to appear. A 50+ iteration UI loop will not fit in the default per-test timeout.
**When to use:** The soak spec's bulk-volume requirement.
**Recommended split:**
- Drive the bulk of the 50-100+ sales via direct `admin.rpc('process_direct_sale_atomic', ...)` calls in a loop (proven safe/fast pattern, same RPC the UI calls) — this is what actually stress-tests locking/performance at realistic transaction counts (D-07's stated goal).
- Drive a small representative subset (5-10 sales) through the real UI, one per cart type named in D-07: barcode scan (`e2e/51-barcode-scan-search.spec.ts` pattern), manual search, loose-weight (`e2e/52-loose-weight-hold-sale.spec.ts` pattern), multi-unit/case-to-piece, and split-pay (`e2e/50-direct-sale-checkout.spec.ts`'s split cash/card pattern) — this proves the checkout UI itself survives the sequence, not just the RPC.
- Wrap the whole spec (or at minimum the bulk-volume test) in `test.setTimeout(<large ms value>)` called at the top of the test body [CITED: playwright.dev/docs/test-timeouts] — the global config timeout is not the place to raise this, since it would loosen every other spec's budget too.

### Pattern 3: Shared export-feature deletion boundary

**What:** `useExportReport`/`ExportButtons` is one generic, shared feature serving every report tab via a discriminated `ExportType`/`reportType` union. Deleting a report's export support means removing that report's union members and switch branches from the **shared** files, not deleting the shared files.
**When to use:** Both D-01 (Tips) and D-02 (Modifier Popularity) deletions.
**Caution:** `useExportReport.ts`'s `default: { const never: never = type; ... }` exhaustiveness check (line 489-492, verified read this session) means leaving a stale `ExportType` member after deleting its switch case is a compile error, not a silent bug — TypeScript will catch an incomplete deletion here, which is a useful executor-side safety net.

### Anti-Patterns to Avoid

- **Deleting `fetchActiveProfiles`/`fetchPaymentsWithTipsInRange` wholesale:** `fetchActiveProfiles` is called by both `useStaffMetrics` (kept, Staff Sales tab) and `useStaffTips` (deleted) [VERIFIED: src/entities/staff/model/queries.ts:653,719 — both call sites read `fetchActiveProfiles()`]. Only delete `useStaffTips` itself and its own query-key entry.
- **Confusing this phase's "Tips" tab with Phase 1's already-removed tip-bucket distribution:** `tip_distribution_entries` table and its `close_caja_session` tip-pooling block were dropped in `20260810000010_drop_tip_distribution.sql` (Phase 1, D-21). That is unrelated dead history — do not write a migration that tries to "re-drop" it or gate this phase's work on it.
- **Deriving margin from `products` instead of `inventory`:** `costPrice` is defined only on `InventorySchema` [VERIFIED: src/shared/lib/domain.ts:509-514, quoted: `costPrice: MoneySchema.nullable().optional()`], not on `ProductSchema`. A plan that says "read `products.cost_price`" will fail — the column does not exist there.
- **Writing the cost snapshot via the `decrement_inventory_on_order_item` AFTER INSERT trigger instead of `process_direct_sale_atomic` itself:** CONTEXT.md D-06 explicitly scopes the write to `process_direct_sale_atomic`. The trigger fires after the row is committed and would require a second `UPDATE order_items` statement per row — noisier and out of line with the locked decision.
- **Assuming `useProductSalesReport` is RPC-backed like `useHourlyBreakdown`/`useVoidRefundReport`:** it is a **client-side Supabase `.select()` + in-memory aggregation** [VERIFIED: src/entities/tab/model/queries-reports.ts:225-296], unlike the other reports that were already migrated to bounded RPCs in a prior phase. Margin math is added client-side in this same function, not via a new RPC — unless the planner deliberately chooses to also migrate this report to an RPC (out of this phase's stated scope per CONTEXT.md's discretion note; the query-shape decision is explicitly left to planning).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bulk-volume sale generation for the soak spec | A new seeding script or ad-hoc SQL inserts | Loop `admin.rpc('process_direct_sale_atomic', ...)` with the existing `directSaleInput()`-style helper from `e2e/50-direct-sale-checkout.spec.ts` | Reuses the exact server-authoritative price/tax derivation the RPC itself enforces — hand-rolled inserts would bypass the atomicity/authority checks this phase is supposed to be re-verifying |
| Cash reconciliation assertion | Custom cash-math replication in the test | `close_caja_session`'s own returned JSON summary (already used by `CajaReportPanel`, D-10) | REP-01 is pure verification — asserting against the RPC's own output, not re-deriving totals independently, is the correct verification boundary |

**Key insight:** Nothing in this phase needs new library code. The risk is entirely in touch-surface completeness (finding every file a deleted report reaches into) and in RPC atomicity discipline (the margin write must happen inside the same transaction/lock scope as the rest of `process_direct_sale_atomic`) — not in choosing the right tool.

## Runtime State Inventory

This phase deletes two RPCs and their consuming code, so the Phase 1 "live vs. migration-file" caution applies (that phase found a case where a live function body had been patched in place by a later migration without a corresponding file update — see `20260810000010_drop_tip_distribution.sql`'s own commentary, read this session).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `get_modifier_popularity_report` reads `modifiers`/`order_items.modifier_ids`/`product_modifiers` — these tables/columns are still live and used by checkout (`process_direct_sale_atomic` validates `product_modifiers` on every sale) [VERIFIED: supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:119-136]. Dropping the RPC does NOT touch these tables — confirm the migration only does `DROP FUNCTION`, never touches `modifiers`/`order_items.modifier_ids` | Code edit only (DROP FUNCTION), no data migration |
| Live service config | None — no n8n/Datadog/Tailscale-style external config for this repo | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env vars for either deletion or margin tracks | None |
| Build artifacts | `src/shared/lib/supabase.types.ts` will go stale after `DROP FUNCTION get_modifier_popularity_report` and after the `order_items` column add — regenerate with `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts` per CLAUDE.md's documented workaround, or continue using the `const db = supabase as any` escape hatch already present in `queries-reports.ts` (it already casts to `any`, so a stale generated type does not block compilation there) | Regenerate types after both migrations land, or confirm the `any`-cast escape hatch already covers all touched call sites |

**Nothing found in category (Live service config, OS-registered state, Secrets/env vars):** confirmed by direct grep of this session — no matches for external-service config patterns tied to Tips/Modifier Popularity.

## Common Pitfalls

### Pitfall 1: `useExportReport`'s exhaustive switch will not compile until every deletion layer lands atomically
**What goes wrong:** Deleting `TipsProps`/`ModifierPopularityProps` from `ExportButtons.tsx` but leaving `'tips-excel' | 'tips-pdf' | 'tips-csv'` in `ExportType` (or vice versa) leaves a dangling reference either direction.
**Why it happens:** The deletion spans two files (`ExportButtons.tsx` props union + `useExportReport.ts` type union/switch) that must change together.
**How to avoid:** Delete both files' relevant blocks in the same task/commit; let `npm run typecheck` be the pass/fail gate — the `never` exhaustiveness check in `useExportReport.ts:489-492` will fail loudly if incomplete.
**Warning signs:** `tsc` error "Type '"tips-excel"' is not assignable to type 'never'" or similar.

### Pitfall 2: `order_items.cost_price_snapshot` will be NULL for every pre-existing row, and margin math must not silently divide/subtract against NULL
**What goes wrong:** `revenue - cost` where `cost` is `NULL` produces `NULL` or `NaN` in JS, corrupting the whole date range's margin total if not guarded.
**Why it happens:** There is no historical cost data to backfill — `receive_shipment` never versioned cost by date before this phase, so a pre-existing `order_item` row has no way to know what `inventory.cost_price` was at the time it was sold.
**How to avoid:** Treat `cost_price_snapshot IS NULL` as "unknown margin" per-row (exclude from the margin sum, or display "—" / a distinct badge), not as zero cost (which would inflate margin) or zero revenue.
**Warning signs:** Margin appears implausibly high for date ranges spanning the cutover, or a single `NaN`/`null` in the report crashes the whole aggregation.

### Pitfall 3: The soak spec's default Playwright timeout will silently truncate a long UI sequence
**What goes wrong:** A test that runs 10+ UI-driven checkout flows plus receiving plus caja-close sequentially will exceed the 45-60s default `timeout` in `playwright.config.ts` and fail with a generic timeout, not a useful assertion failure.
**Why it happens:** `playwright.config.ts`'s `timeout` config applies per-test, and every existing spec in this repo assumes a single short user flow.
**How to avoid:** Call `test.setTimeout(<value>)` at the top of the soak test body (or `test.slow()` for a 3x multiplier) [CITED: playwright.dev/docs/test-timeouts]. Do not raise the global config timeout — that loosens every other spec's failure-detection budget.
**Warning signs:** Test fails with `Test timeout of 60000ms exceeded` with no specific assertion in the failure trace.

### Pitfall 4: `resetTestState()`'s existing seed data may not match a "supermarket" narrative
**What goes wrong:** Existing E2E helpers/specs seed and reference products like "Budweiser" and "Margarita" [VERIFIED: e2e/50-direct-sale-checkout.spec.ts:118,144,466 — `.eq('name', 'Budweiser')`, `.eq('name', 'Margarita')`] — bar-pos-era product names, not yet rebranded to grocery SKUs in the E2E fixture data as of this session.
**Why it happens:** Phase 1-3 focused on code/schema; E2E seed *data* naming wasn't in scope for those phases.
**How to avoid:** Not a blocker for this phase — the soak spec can reuse these exact fixture products (they exist, are seeded, and their RPC-level behavior is identical regardless of name). Do not scope a product-name rebrand into this phase; it's cosmetic E2E fixture data, out of REP-01/REP-02's stated scope.
**Warning signs:** None — flagged here only so the planner doesn't mistake this for a phase-blocking data gap.

## Code Examples

### Where to add the `inventory.cost_price` read in `process_direct_sale_atomic`

```sql
-- Source: supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:100-105
-- (verified read this session — current per-item loop, before this phase's edit)
FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  SELECT base_price, sold_by_weight INTO v_catalog_price, v_sold_by_weight
  FROM products WHERE id = (v_elem->>'product_id')::uuid AND is_active = true FOR UPDATE;
  IF v_catalog_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRICE_MISMATCH', 'message', 'Item price does not match catalog');
  END IF;
  -- ... existing weight/price derivation ...

  -- NEW (this phase): also lock+read inventory.cost_price for the snapshot.
  -- SELECT cost_price INTO v_cost_price FROM inventory
  --   WHERE product_id = (v_elem->>'product_id')::uuid FOR UPDATE;
  -- (v_cost_price may legitimately be NULL — inventory.cost_price is nullable;
  --  do not reject the sale for a NULL cost, just snapshot NULL)
```

### `order_items` INSERT — column list to extend

```sql
-- Source: supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:177-181
-- (verified read this session — add cost_price_snapshot to both the column
-- list and the SELECT, threaded through v_derived_items same as unit_price)
INSERT INTO order_items (order_id, product_id, quantity, unit_price, modifier_ids, modifier_price_delta, notes, weight_grams)
SELECT v_order_id, (elem->>'product_id')::uuid, (elem->>'quantity')::int, (elem->>'unit_price')::numeric,
  COALESCE((SELECT array_agg(value::uuid) FROM jsonb_array_elements_text(COALESCE(elem->'modifier_ids', '[]'::jsonb)) AS t(value)), ARRAY[]::uuid[]),
  (elem->>'modifier_price_delta')::numeric, elem->>'notes', NULLIF((elem->>'weight_grams')::text, '')::integer
FROM jsonb_array_elements(v_derived_items) AS elem;
```

### Existing nullable-money domain pattern to mirror for `costPriceSnapshot`

```typescript
// Source: src/shared/lib/domain.ts:509-514 (verified read this session)
export const InventorySchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  quantityOnHand: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  unit: z.string().min(1).max(20),
  costPrice: MoneySchema.nullable().optional(),
});
```

## State of the Art

Not applicable in the usual "library version drift" sense — this phase touches no fast-moving external dependency. The one relevant internal precedent: `useHourlyBreakdown`/`useVoidRefundReport` were migrated from unbounded client-side joins to bounded RPCs in a prior phase (comments in `queries-reports.ts` reference "D-01/D-03/SC-4"), while `useProductSalesReport` and `useCategoryRevenueReport` were **not** migrated and remain client-side aggregations [VERIFIED: src/entities/tab/model/queries-reports.ts:225-296, 410-439]. This phase's margin work extends the still-client-side `useProductSalesReport` — CONTEXT.md leaves it to planning discretion whether to also migrate it to an RPC in the same pass; research found no forcing requirement either way (REP-02 only asks for margin/profit, not for a performance migration).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `inventory.cost_price` should be read with `FOR UPDATE` inside `process_direct_sale_atomic`'s per-item loop, mirroring the existing `products ... FOR UPDATE` lock | Code Examples / Architecture Patterns | Low — if a plan chooses a plain `SELECT` instead of `FOR UPDATE`, the snapshot could theoretically race a concurrent `receive_shipment` cost update mid-transaction; given D-08 explicitly descopes concurrent-terminal testing, this is a minor correctness nuance the planner/executor should confirm against `receive_shipment`'s own locking, not blocking |
| A2 | The soak spec should split bulk volume (RPC-driven) from representative UI sampling (5-10 real clicks per cart type), rather than the whole 50-100+ count being UI-driven | Pattern 2 | Low — this is a research recommendation to fit Playwright's timeout budget and existing patterns, not a locked decision; CONTEXT.md leaves "exact structure of the full-day soak spec" to Claude's discretion (see CONTEXT.md `## Claude's Discretion`), so the planner is free to choose a different split as long as volume and timeout constraints are respected |

## Open Questions

1. **Should the soak spec be one file or split (single `e2e/` file vs. a few focused specs)?**
   - What we know: CONTEXT.md explicitly defers this to "research/planning" (Claude's Discretion section).
   - What's unclear: Whether a single long sequential spec (open→sales→receive→expiry→close, one `test()`) or several specs sharing a `test.describe.serial()` block better fits this repo's existing conventions (all reviewed specs use independent `test()` blocks with their own `beforeEach` reset).
   - Recommendation: Given the whole point is a *sequential* full-day narrative (caja must stay open across all the sales, receiving happens mid-day, caja closes last), a single spec with `test.describe.serial()` (or one long `test()`) is the natural fit — one shared `resetTestState()`/`openCaja()` at the top, not a fresh caja per assertion the way existing specs do.

2. **Does `receive_shipment`'s current signature/locking need any change to be safely called at soak-spec volume (one shipment mid-sequence), or is it purely additive to an already-open caja/day?**
   - What we know: `receive_shipment` is caja-agnostic (no `caja_session_id` parameter observed in the adversarial test's RPC call) [VERIFIED: e2e/53-supplier-receiving.spec.ts:165-172 — call args are `p_staff_id, p_supplier_id, p_items`].
   - What's unclear: Whether receiving mid-day (between sales) has any interaction with in-flight sale locks on the same product's `inventory` row that the soak spec should specifically probe (e.g. receive stock for a product that's mid-sale).
   - Recommendation: Not a blocker — D-08 already descopes concurrency testing; sequential (not simultaneous) receiving-then-selling is sufficient for D-07's stated goal.

## Environment Availability

Skipped — this phase has no external tool/service dependencies beyond what's already running (local Supabase stack, dev server) and already verified working in Phase 2/3.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unchanged — no auth surface touched this phase |
| V3 Session Management | No | Unchanged |
| V4 Access Control | No (re-verify only) | `close_caja_session`'s existing manager/admin role check is re-exercised by the soak spec, not changed [VERIFIED: supabase/migrations/20260810000010_drop_tip_distribution.sql:57-64, quoted: `IF v_caller_role NOT IN ('manager', 'admin') THEN`] |
| V5 Input Validation | Yes | `process_direct_sale_atomic`'s existing server-authoritative-price pattern (reject client `unit_price`/`p_amount` disagreement >1 cent) is the standard this phase must not weaken — the new `inventory.cost_price` read is server-side only, never client-supplied, so it introduces no new input-validation surface |
| V6 Cryptography | No | Unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Client-supplied cost/margin data smuggled into the sale payload | Tampering | Not applicable by construction — `cost_price_snapshot` is read server-side from `inventory` inside the RPC, never accepted as an RPC parameter. Do not add a `p_cost_price` parameter to `process_direct_sale_atomic`; there is no legitimate reason a client would ever supply it. |
| Dangling RPC left callable after its consuming UI is deleted | Elevation of Privilege (stale attack surface) | `DROP FUNCTION get_modifier_popularity_report` in the same migration wave as the UI deletion, per D-04's "delete the code entirely" — do not just stop calling it from the client while leaving it `GRANT EXECUTE ... TO authenticated` |

## Sources

### Primary (HIGH confidence — read directly this session)
- `src/pages/reports/index.tsx` — full current Reports page tab structure
- `src/widgets/TipDistributionPanel/TipDistributionPanel.tsx`, `src/widgets/ModifierPopularityReport/ModifierPopularityReport.tsx` — components to delete
- `src/entities/staff/model/queries.ts` — `useStaffTips`/`useStaffMetrics` shared-helper boundary
- `src/entities/tab/model/queries-reports.ts` — `useProductSalesReport`, `useModifierPopularityReport`, RPC vs. client-aggregation pattern split
- `src/shared/lib/domain.ts` — `OrderItemSchema`, `InventorySchema`, `ProductSalesRow`, `StaffTipsSchema`, `ModifierPopularityRowSchema`
- `src/features/export-report/model/useExportReport.ts`, `src/features/export-report/ui/ExportButtons.tsx` — shared export plumbing
- `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` — current live `process_direct_sale_atomic` (latest CREATE OR REPLACE)
- `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql`, `20260817000002_receive_shipment_atomicity.sql` — `receive_shipment` and `inventory.cost_price` origin
- `supabase/migrations/20260810000010_drop_tip_distribution.sql`, `20260721000003_modifier_popularity_rpc.sql` — RPC history for both deletion targets
- `supabase/migrations/20260414000008_triggers.sql`, `20260814000001_loose_weight_items.sql` — `decrement_inventory_on_order_item` trigger (stock decrement path)
- `e2e/50-direct-sale-checkout.spec.ts`, `e2e/53-supplier-receiving.spec.ts`, `e2e/helpers/auth.ts`, `e2e/helpers/supabase.ts` — soak spec pattern sources
- `playwright.config.ts`, `package.json` — timeout config, dependency versions
- `.planning/phases/04-reports-hardening/04-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — locked decisions and requirement text

### Secondary (MEDIUM confidence)
- [Timeouts | Playwright](https://playwright.dev/docs/test-timeouts) — confirms `test.setTimeout()` per-test override API

### Tertiary (LOW confidence)
- None used for factual claims in this document.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all versions read directly from `package.json`
- Architecture: HIGH — every claim about file structure, RPC bodies, and trigger behavior is a direct `Read`/`grep` this session, not training-data recall
- Pitfalls: HIGH — all four pitfalls trace to a specific verified file/line, not speculation

**Research date:** 2026-08-15
**Valid until:** 30 days (internal codebase research; stale only if a concurrent phase touches the same RPCs/files before this phase executes)
