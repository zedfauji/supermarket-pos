# Phase 28: Promotion Management Redesign - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Phase 27's single-step `PromotionFormDialog` (a fixed-width Radix modal) with a
dedicated multi-step wizard screen for creating and editing promotions. This phase delivers:

- **Multi-target scope**: one promotion can target multiple products across multiple
  categories in a single row (today: exactly one product OR one category, DB-enforced by a
  CHECK constraint).
- **Blank/store-wide promotions**: a promotion with no target restriction becomes a valid save
  (today: actively rejected by the same CHECK constraint).
- **Recurrence**: day-of-week and time-of-day windows (e.g. "every day 4-6PM") layered on top
  of the existing date-range validity (today: only `starts_at`/`ends_at`, no recurrence at any
  layer).
- **Forward-looking validity UX**: the reused Reports `DateRangePicker` (all presets clamp `to`
  at today) is replaced or extended with promotion-appropriate, forward-looking options.
- **Wizard flow**: a multi-step screen (not a modal) that validates completeness per step
  rather than only at a single final Save click.

This is a genuine feature/design expansion of what Phase 27 shipped, not a bug fix. The
stuck-at-0 percent-field bug (a separate, narrow controlled-input defect) was already fixed as
Phase 27 gap plan `27-10-PLAN.md` — it is **not** part of this phase's scope.

Recurrence changes what "active" means for a promotion and touches the pricing engine built in
Phase 27 (`evaluateBestPromotion`, `process_direct_sale_atomic`'s
`now() BETWEEN starts_at AND ends_at` check) — this is a real design/research question
(timezone handling, interaction with the existing best-price-wins pool), not just a UI
addition.

</domain>

<decisions>
## Implementation Decisions

### Scope Data Model (Claude's discretion — not directly discussed, but implied and unopposed during the Recurrence and Migration discussions)
- **D-01:** Replace the singular `product_id`/`category_id` FK columns and the
  `promotions_exactly_one_target` XOR CHECK constraint with a junction table
  (`promotion_targets` or similar: `promotion_id`, and either `product_id` or `category_id` per
  row, one promotion can have N rows). A promotion with zero target rows is store-wide/blank.
  — **Reversibility:** one-way — requires a schema migration dropping the CHECK constraint and
  the singular columns; this repo has no DOWN scripts (CLAUDE.md convention), so reverting means
  writing a new forward migration, not rolling back.
- **D-02:** Drop the `scope_type` enum (`'product'|'category'`) entirely — junction-table row
  presence alone determines scope (some product rows / some category rows / mixed / none =
  store-wide). No separate enum kept in sync with the actual target rows.
  — **Reversibility:** one-way — same migration as D-01; a derived/computed scope label can be
  added back later without a schema change if list-page filtering needs it, but the original
  enum column is gone for good.

### Recurrence Semantics
- **D-03:** A recurring promotion still requires a bounding `starts_at`/`ends_at` date range
  (mandatory, as today). Day-of-week/time-of-day recurrence is an **additional AND filter**
  within that window — not a replacement for the date range, not an open-ended/indefinite mode.
  — **Reversibility:** one-way once `evaluateBestPromotion` and
  `process_direct_sale_atomic` ship against this shape — switching to an "indefinite, no end
  date" mode later means re-deriving the active-window check in both the TS pricing function and
  its plpgsql mirror.
- **D-04:** Day-of-week is an integer array column (`days_of_week int[]`, values 0-6),
  multi-select checkboxes in the UI. Empty/null array = every day. Rejected: bitmask integer
  (more compact but harder to query/debug in both SQL and TS).
  — **Reversibility:** costly — changing representation later touches schema, both
  pricing-engine implementations, and the wizard's day-picker UI.
- **D-05:** Time-of-day window is same-day only for v1 — `start_time < end_time` enforced at
  validation. Overnight wrap (e.g. 10PM-2AM) is explicitly deferred; the ROADMAP's own example
  (4-6PM) and every realistic grocery-store discount window is same-day.
  — **Reversibility:** costly — adding overnight-wrap support later requires new validation
  logic and a different comparison shape in both the wizard and the DB check (can no longer
  assume `start_time < end_time`).
- **D-06:** Day-of-week/time-of-day recurrence is evaluated in the store's local timezone
  (`GeneralSettings.timezone`, IANA string, `src/shared/lib/domain.ts` ~line 797) — not UTC.
  "Every day 4-6PM" means the store's physical local hours. Matches how Phase 27 already
  established store-local date-range boundary handling (PROMO-09).
  — **Reversibility:** one-way for any promotion already evaluated under this rule — the
  checkout-time authoritative computation (`process_direct_sale_atomic`) must convert `now()`
  into store-local time before comparing against `days_of_week`/`start_time`/`end_time`;
  switching to UTC later would silently shift every recurring promotion's active hours.

### Wizard Flow & Step Validation
- **D-07:** Four steps: **Basics+Discount** (name, discount type/value) → **Scope** (target
  multi-select or store-wide) → **Validity+Recurrence** (date range + optional
  day-of-week/time-of-day) → **Review** (final summary + save). Natural field-dependency
  grouping; Review step exists specifically to catch omissions before commit.
  — **Reversibility:** reversible — UI-only structure, no schema/engine dependency.
- **D-08:** "Validates completeness on exit" means: forward navigation is blocked while the
  current step has invalid/missing required fields (can't click Next). This is the literal
  reading of the ROADMAP wording ("validates completeness on exit" = validates when leaving a
  step), not a looser all-errors-on-Review model.
  — **Reversibility:** reversible — UI-only validation-gating behavior.
- **D-09:** The Review step shows a live computed price example (e.g. "Product X: $100 →
  $80"), reusing the existing pure `evaluateBestPromotion` function
  (`src/entities/promotion/model/promotion-pricing.ts`) against a sample matching product —
  not just a plain text summary of entered fields. Catches configuration mistakes (wrong
  discount type/value, scope that matches nothing) before save.
  — **Reversibility:** reversible — additive UI feature on top of an existing pure function;
  can be removed without touching the pricing engine itself.
- **D-10:** Editing an existing promotion reopens the **same wizard component**, pre-filled,
  with all four steps unlocked and freely navigable via a clickable step
  indicator/breadcrumb (no forward-only gating needed on edit, since the underlying data is
  already valid). Rejected: a separate flatter single-screen edit form (would duplicate
  create-flow logic).
  — **Reversibility:** reversible — one shared component; splitting into a separate edit form
  later is additive, not a rewrite.

### Existing Promotions Migration
- **D-11:** Neither environment has live/real promotion usage yet — the local Supabase setup
  is dev, and the "Taj House of Spices" remote Supabase project is schema-provisioned as
  production but **not live/in-use yet**. A breaking schema migration (drop the CHECK
  constraint + singular columns, add the junction table, backfill any existing rows from both
  environments into it in the same migration) is safe — no real customer data is at risk.
  — **Reversibility:** one-way — no DOWN script per repo convention (CLAUDE.md); if this
  turns out wrong, recovery is a new forward migration, not a rollback.
- **D-12:** Rows backfilled by the migration (i.e., promotions that existed under the old
  single-target schema) get a review flag surfaced in the promotions list UI, so the admin can
  confirm each one carried over correctly under the new multi-target model. Exact mechanism
  (boolean column, banner condition, dismiss-on-edit) is left to planning/implementation — the
  decision here is only that migrated rows must be **visibly distinguishable**, not silently
  identical to newly-created ones.
  — **Reversibility:** reversible — a review-flag column/UI affordance can be added, changed,
  or removed independently of the core schema migration.

### Claude's Discretion
- Exact junction-table column names/shape (D-01/D-02) — no specific naming was requested by
  the user; standard Supabase/FSD conventions apply (see `promotions_schema.sql` for existing
  naming style to mirror).
- Exact mechanism for the migrated-promotion review flag (D-12) — user asked for the *outcome*
  (visible, reviewable) not the specific implementation shape.
- Multi-select target-picker UX (search-as-you-type vs. simple checkbox list) was not
  discussed in depth — `src/shared/ui/command.tsx` (shadcn Command/cmdk) is the only
  search-combobox primitive already in this codebase and is the natural starting point for
  research/planning to evaluate.

### Folded Todos
- **`audit-manager-pin-identity-in-remaining-rpcs.md`** — "Audit process_refund/
  reopen_tab_rpc/edit_paid_tab_rpc/close_tab for the same manager-PIN identity bug fixed in
  G-27-13" (filed 2026-09-04, priority: high). The user explicitly chose to fold this into
  Phase 28 despite it not being scope-adjacent to promotion management (it concerns four
  unrelated RPCs: refund, reopen-tab, edit-paid-tab, close-tab — none of which Phase 28's
  wizard or schema changes touch). Planner should treat this as an independent security-audit
  task within Phase 28 (its own plan/wave), not something the promotion-redesign work itself
  depends on or should be entangled with.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Root-cause investigation & UAT trigger (read first — these already characterize exact gaps with file:line citations)
- `.planning/debug/promotion-dialog-ux-and-scope-gaps.md` — full root-cause diagnosis: Part A
  (percent-field bug, already fixed in 27-10) and Part B (the five scope/architecture gaps this
  phase addresses), with exact file:line citations against the current codebase.
- `.planning/phases/27-promotions-discount-management/27-UAT.md` (gap `G-27-8`) — verbatim user
  feedback that triggered this phase, plus the `missing:` capability list and `root_cause`
  summary.
- `.planning/ROADMAP.md` §"Phase 28: Promotion Management Redesign" — phase goal, dependency on
  Phase 27, and the two source-doc pointers above.

### Current schema & pricing engine (what this phase must extend, not rewrite)
- `supabase/migrations/20260901000001_promotions_schema.sql` — current `promotions` table:
  singular `product_id`/`category_id` FKs, `promotions_exactly_one_target` XOR CHECK, no
  recurrence columns.
- `supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql` — the
  authoritative server-side plpgsql mirror of `evaluateBestPromotion`; sole price authority at
  checkout (client display is preview-only, per Phase 27 D-05/D-06).
- `src/entities/promotion/model/promotion-pricing.ts` — pure, independently-testable
  best-price-wins pricing function (`evaluateBestPromotion`); the Review step's live preview
  (D-09) reuses this directly.
- `src/shared/lib/domain.ts` — `PromotionSchema` (~lines 1647-1675, scope/discount/date fields
  to extend) and `GeneralSettingsSchema.timezone` (~line 797, the store-local timezone source
  of truth for D-06).

### UI components to replace or extend
- `src/features/manage-promotions/ui/PromotionFormDialog.tsx` — the component this phase
  replaces (321 lines, single Radix Dialog, single non-paginated form, Save-only validation).
- `src/shared/ui/DateRangePicker.tsx` — current backward-looking-only date picker reused as-is
  by both Reports and the promotion dialog; needs forward-looking presets or a
  promotion-specific replacement.
- `src/shared/ui/CategoryTreePicker/CategoryTreePicker.tsx` — existing single-value category
  picker; precedent/reference for extending to multi-select.
- `src/shared/ui/command.tsx` — shadcn Command (cmdk) primitive; the only search-combobox
  building block already in this codebase, candidate for the multi-select target picker.
- `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` — reference pattern already
  used for the (separately-fixed) percent-field bug; not otherwise in scope here.

### Folded todo
- `.planning/todos/pending/audit-manager-pin-identity-in-remaining-rpcs.md` — see Folded Todos
  above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `evaluateBestPromotion` (`src/entities/promotion/model/promotion-pricing.ts`) — zero-import,
  pure pricing function; reused for the wizard's live Review-step preview (D-09) and as the
  spec for the plpgsql mirror's recurrence extension.
- `src/shared/ui/command.tsx` (shadcn Command/cmdk) — search-as-you-type primitive, only
  existing candidate for building the multi-select target picker.
- `NearExpirySettingsTab.tsx`'s string-state percent-field pattern — already the fix reference
  for the (out-of-scope-here) percent bug; worth reusing for any new numeric inputs the wizard
  introduces.

### Established Patterns
- Best-price-wins: ALL matching candidates (product-scoped, category-scoped, expiry-trigger)
  evaluated in one pool, single largest discount wins, exact ties broken by most-recent
  `createdAt` (Phase 27 D-05/D-06) — multi-target scope must plug into this pool without
  changing its tie-break semantics.
- Server-side is sole price authority: `process_direct_sale_atomic` always independently
  recomputes; any client-side wizard preview or checkout display is non-authoritative (Phase 27
  precedent, applies directly to D-09's live preview).
- Store-local timezone handling already exists for date-range boundaries (PROMO-09) — D-06
  extends this same principle to time-of-day.
- No DOWN migration scripts anywhere in this repo (CLAUDE.md convention) — D-01/D-11's breaking
  migration follows existing project convention, not a new risk.

### Integration Points
- `evaluateBestPromotion` + its plpgsql mirror are the two places recurrence/multi-target
  matching logic must land identically (mirrored, not literally shared, per Phase 27's own
  RESEARCH.md Pitfall 1 note in the pricing-pricing.ts header comment).
- `pages/promotions/index.tsx` — the real routed list page (unaffected structurally by this
  phase; only the create/edit flow it launches changes from dialog to wizard screen/route).

</code_context>

<specifics>
## Specific Ideas

- User's own example promotion: "Friends & Family Promotion, 20% flat, no product/category
  restriction" — the canonical blank/store-wide promotion test case.
- User's own recurrence example: "every day 4PM-6PM" — the canonical same-day time-window test
  case (locked as D-03/D-05/D-06's driving scenario).
- User's verbatim complaint about the reused Reports date picker: "What is last 7 days i mean?
  its not report its promotions for upcoming days" — drives the forward-looking-presets
  requirement in the Domain Boundary above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The percent-field bug is not deferred, it's
already fixed as Phase 27 gap plan `27-10-PLAN.md`, outside this phase entirely.)

### Reviewed Todos (not folded)
- `rename-cargo-package-bar-pos.md` — cosmetic Cargo package naming, unrelated to promotions;
  reviewed and left as a standalone pending todo.
- `rotate-remote-supabase-db-password.md` — infra/ops task, unrelated to promotions; reviewed
  and left as a standalone pending todo.

</deferred>

---

*Phase: 28-promotion-management-redesign*
*Context gathered: 2026-09-04*
