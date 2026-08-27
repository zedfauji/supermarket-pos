# Phase 10: Quality debt & ops documentation - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Five independent quality-debt/ops items, closed without adding new capabilities:

1. **QA-01** — Suppliers page shows loading + error states instead of silently rendering blank.
2. **QA-02** — Storybook stories for 6 `shared/ui` primitives (EmptyState, ConfirmDialog, POSButton, DataTable, MoneyDisplay, MoneyInput).
3. **QA-03** — Audit Log, Edit History, and Reports show copyable/clickable entity IDs.
4. **QA-04** — `useCheckoutSale` (the payment mutation hook) gets a dedicated Vitest unit test.
5. **OPS-02** — A DB backup/disaster-recovery plan document, matching actual production reality.

No new user-facing features. Each item is scoped to its existing surface — do not expand beyond what's listed above.

</domain>

<decisions>
## Implementation Decisions

### QA-03 — Entity ID cross-linking
- **D-01:** Ship both copy-to-clipboard AND real navigation links, not copy-only. — **Reversibility:** reversible — UI-only, no schema/contract impact.
- **D-02:** Only `payment`/`tab` entity IDs and `staff` entity IDs get real navigation links. All other `entityType` values (settings, caja_session, product, order_item, etc.) get copy-to-clipboard only — no detail page exists for them and building one is out of scope.
- **D-03:** `payment`/`tab` IDs link to `/payments`, pre-filtered/searched to that ID. The Payments page currently has no search/filter-by-ID — this phase adds one (scoped narrowly: filter the existing payments list by ID, not a new search UI paradigm).
- **D-04:** `staff` entity IDs link to `/staff`, filtered or scrolled to that staff member. Same narrow-scope approach — reuse/extend existing list rendering, don't build a new staff detail page.
- Apply this consistently across all three surfaces that show entity IDs: Audit Log (`AuditLogTable`, which currently has no entity-ID column at all — needs one added), Edit History (`EditHistoryTable`, already truncates entityId at `.slice(0, 8)`), and Reports (wherever entity IDs currently appear, confirm during research).

### QA-01 — Suppliers page loading/error states
- **D-05:** Reuse `TableRowSkeleton` (`src/shared/ui/LoadingSkeletons.tsx`) for the loading state — render a few skeleton rows in place of the `<ul>` supplier list while `useSuppliers()` is loading. No new skeleton component.
- **D-06:** Error state follows the exact pattern already established in `InventoryPagePanel` (`src/widgets/InventoryPagePanel.tsx` ~line 223): `resultError ? <p role="alert" className="text-sm text-destructive">{resultError.message}</p> : null`. `useSuppliers()` (`src/entities/supplier/model/queries.ts`) already exposes `isLoading`/`resultError` — `SupplierListPanel.tsx` currently only destructures `data`, so this is purely wiring, no query changes needed.

### QA-02 & QA-04 — Storybook + payment hook test
- **D-07:** Proceed with the described mechanical approach, no changes requested:
  - 6 new `.stories.tsx` files next to their components in `src/shared/ui/`, following the conventions of existing stories (e.g. `Button.stories.tsx`).
  - `useCheckoutSale.test.ts` in `src/features/checkout-sale/model/`, mirroring `src/features/process-refund/model/useProcessRefund.test.ts`'s approach: mock the cart/staff/caja Zustand stores and `callProcessDirectSale` (from `@shared/lib/edge-function-contracts`), assert success and failure paths across cash/card/split payment processors.

### OPS-02 — DB backup/disaster-recovery doc
- **D-08:** Production hosting (self-hosted Supabase Docker stack vs. Supabase Cloud) is genuinely undecided — do not assume either. The doc must cover BOTH scenarios rather than picking one:
  - **Self-hosted:** no managed PITR exists; document what's actually available today (nothing automated) and the recommended mechanism.
  - **Supabase Cloud:** document which project tier is needed for adequate PITR coverage, once/if that path is chosen.
- **D-09:** In addition to the doc, write a runnable pg_dump backup script (e.g. `scripts/backup-db.sh`) covering the self-hosted fallback path — ready to wire into a cron job later, not wired in yet (that's a deploy-time decision, out of scope here).
- **D-10:** This is distinct from the existing `BackupSettingsTab`/`useSettingsBackups` feature (`src/widgets/SettingsTabsPanel/tabs/BackupSettingsTab.tsx`, `supabase/functions/settings-backup`) — that feature backs up receipt/terminal *settings* only, not the full database (products, orders, inventory, etc.). Do not conflate the two; OPS-02 is about full-database DR, and the doc should explicitly note the settings-backup feature is NOT a substitute.

### Claude's Discretion
- Exact wording/structure of the OPS-02 doc (research step should confirm the actual current Supabase config.toml comments/D-06 decision record before drafting, so the doc states verified facts, not assumptions).
- Exact search/filter UI mechanism added to `/payments` and `/staff` for D-03/D-04 (a query param, a search box, etc.) — small enough to leave to planning/research, not a user preference call.
- Where entity IDs currently appear in Reports (QA-03) — confirm exact locations during research; not fully enumerated in this discussion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requirements
- `.planning/ROADMAP.md` §"Phase 10: Quality debt & ops documentation" — the 5 success criteria (QA-01..04, OPS-02) this phase must satisfy.
- `.planning/REQUIREMENTS.md` — QA-01, QA-02, QA-03, QA-04, OPS-02 entries.
- `.planning/PROJECT.md` — "Quality debt" backlog bullets (Deferred Items section) that map to this phase.

### Existing code to reuse/extend
- `src/widgets/InventoryPagePanel.tsx` (~line 223) — the `resultError` → `role="alert"` error-display pattern to replicate in `SupplierListPanel.tsx`.
- `src/shared/ui/LoadingSkeletons.tsx` — `TableRowSkeleton` export, to reuse for QA-01.
- `src/entities/supplier/model/queries.ts` — `useSuppliers()` already returns `isLoading`/`resultError`/`isEmpty`; no changes needed there.
- `src/widgets/SupplierListPanel.tsx` — the file to wire loading/error into.
- `src/widgets/AuditLogTable/AuditLogTable.tsx` — no entity-ID column currently; needs one added for QA-03.
- `src/widgets/EditHistoryTable/EditHistoryTable.tsx` (~line 100) — existing `entityId?.slice(0, 8)` truncated display, to extend with copy/link.
- `src/features/process-refund/model/useProcessRefund.test.ts` — the mocking pattern to mirror for QA-04's `useCheckoutSale.test.ts`.
- `src/features/checkout-sale/model/useCheckoutSale.ts` — the hook under test for QA-04.
- `src/widgets/SettingsTabsPanel/tabs/BackupSettingsTab.tsx` + `supabase/functions/settings-backup` — the existing settings-only backup feature; OPS-02 doc must distinguish itself from this.
- `supabase/config.toml` (D-06 comment block) — records the self-hosted-vs-cloud ambiguity already noted in this repo; ground OPS-02's doc in this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TableRowSkeleton` (`src/shared/ui/LoadingSkeletons.tsx`) — ready to drop into `SupplierListPanel.tsx` for QA-01.
- `useSuppliers()`'s existing `isLoading`/`resultError`/`isEmpty` fields — QA-01 needs zero query-layer changes, purely UI wiring.
- `useProcessRefund.test.ts` — direct template for QA-04's store/edge-function mocking approach.
- Existing `.stories.tsx` files (e.g. `Button.stories.tsx`) — direct template for QA-02's 6 new stories.

### Established Patterns
- Error display: `resultError ? <p role="alert" className="text-sm text-destructive">{message}</p> : null` (from `InventoryPagePanel.tsx`) — the project's one established error-UI convention; QA-01 should match it exactly rather than inventing a new one.
- No FSD layer currently has cross-page navigation-by-ID (no `/orders/:id`, no ID-based search anywhere) — QA-03's D-03/D-04 additions to `/payments` and `/staff` are the first instance of this pattern in the codebase; research should check for the least-invasive way to add it (query param + client-side filter, most likely) rather than inventing new infrastructure.

### Integration Points
- QA-03 touches three widgets (`AuditLogTable`, `EditHistoryTable`, and wherever Reports renders entity IDs) plus two pages (`/payments`, `/staff`) for the link targets.
- OPS-02 is documentation + a standalone script (`scripts/backup-db.sh`) — no application code changes, no new routes/components.

</code_context>

<specifics>
## Specific Ideas

- OPS-02's doc must NOT assume Supabase Cloud is the production target (repo's own `supabase/config.toml` D-06 comment already flags production hosting as unresolved) — cover both self-hosted and Cloud scenarios explicitly, stating which decision points are still open.
- QA-03's navigation links are intentionally narrow: reuse the existing Payments/Staff list views with ID-based filtering, not new detail pages.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)

None — no matching pending todos were surfaced by cross-reference.

</deferred>

---

*Phase: 10-quality-debt-ops-documentation*
*Context gathered: 2026-08-18*
