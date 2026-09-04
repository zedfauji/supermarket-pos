# Phase 28: Promotion Management Redesign - Research

**Researched:** 2026-09-04
**Domain:** Postgres schema redesign (junction table + recurrence) + plpgsql/TS pricing-engine mirror + React multi-step wizard UI + RPC authorization audit (folded todo)
**Confidence:** HIGH (codebase-grounded — every load-bearing claim below was verified by reading the actual source this session, not recalled from training)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope Data Model (Claude's discretion — not directly discussed, but implied and unopposed during the Recurrence and Migration discussions)**
- **D-01:** Replace the singular `product_id`/`category_id` FK columns and the
  `promotions_exactly_one_target` XOR CHECK constraint with a junction table
  (`promotion_targets` or similar: `promotion_id`, and either `product_id` or `category_id` per
  row, one promotion can have N rows). A promotion with zero target rows is store-wide/blank.
  — Reversibility: one-way — requires a schema migration dropping the CHECK constraint and
  the singular columns; this repo has no DOWN scripts (CLAUDE.md convention), so reverting means
  writing a new forward migration, not rolling back.
- **D-02:** Drop the `scope_type` enum (`'product'|'category'`) entirely — junction-table row
  presence alone determines scope (some product rows / some category rows / mixed / none =
  store-wide). No separate enum kept in sync with the actual target rows.
  — Reversibility: one-way — same migration as D-01; a derived/computed scope label can be
  added back later without a schema change if list-page filtering needs it, but the original
  enum column is gone for good.

**Recurrence Semantics**
- **D-03:** A recurring promotion still requires a bounding `starts_at`/`ends_at` date range
  (mandatory, as today). Day-of-week/time-of-day recurrence is an additional AND filter
  within that window — not a replacement for the date range, not an open-ended/indefinite mode.
  — Reversibility: one-way once `evaluateBestPromotion` and `process_direct_sale_atomic` ship
  against this shape.
- **D-04:** Day-of-week is an integer array column (`days_of_week int[]`, values 0-6),
  multi-select checkboxes in the UI. Empty/null array = every day. Rejected: bitmask integer.
  — Reversibility: costly — changing representation later touches schema, both
  pricing-engine implementations, and the wizard's day-picker UI.
- **D-05:** Time-of-day window is same-day only for v1 — `start_time < end_time` enforced at
  validation. Overnight wrap (e.g. 10PM-2AM) is explicitly deferred.
  — Reversibility: costly — adding overnight-wrap support later requires new validation
  logic and a different comparison shape in both the wizard and the DB check.
- **D-06:** Day-of-week/time-of-day recurrence is evaluated in the store's local timezone
  (`GeneralSettings.timezone`, IANA string, `src/shared/lib/domain.ts` ~line 797) — not UTC.
  — Reversibility: one-way for any promotion already evaluated under this rule — the
  checkout-time authoritative computation (`process_direct_sale_atomic`) must convert `now()`
  into store-local time before comparing against `days_of_week`/`start_time`/`end_time`.

**Wizard Flow & Step Validation**
- **D-07:** Four steps: Basics+Discount (name, discount type/value) → Scope (target
  multi-select or store-wide) → Validity+Recurrence (date range + optional
  day-of-week/time-of-day) → Review (final summary + save).
  — Reversibility: reversible — UI-only structure, no schema/engine dependency.
- **D-08:** "Validates completeness on exit" means: forward navigation is blocked while the
  current step has invalid/missing required fields (can't click Next).
  — Reversibility: reversible — UI-only validation-gating behavior.
- **D-09:** The Review step shows a live computed price example (e.g. "Product X: $100 →
  $80"), reusing the existing pure `evaluateBestPromotion` function against a sample matching
  product — not just a plain text summary of entered fields.
  — Reversibility: reversible — additive UI feature on top of an existing pure function.
- **D-10:** Editing an existing promotion reopens the same wizard component, pre-filled,
  with all four steps unlocked and freely navigable via a clickable step
  indicator/breadcrumb (no forward-only gating needed on edit). Rejected: a separate flatter
  single-screen edit form.
  — Reversibility: reversible — one shared component; splitting into a separate edit form
  later is additive, not a rewrite.

**Existing Promotions Migration**
- **D-11:** Neither environment has live/real promotion usage yet. A breaking schema migration
  (drop the CHECK constraint + singular columns, add the junction table, backfill any existing
  rows from both environments into it in the same migration) is safe — no real customer data
  is at risk.
  — Reversibility: one-way — no DOWN script per repo convention.
- **D-12:** Rows backfilled by the migration get a review flag surfaced in the promotions list
  UI, so the admin can confirm each one carried over correctly under the new multi-target
  model. Exact mechanism (boolean column, banner condition, dismiss-on-edit) is left to
  planning/implementation — the decision here is only that migrated rows must be visibly
  distinguishable, not silently identical to newly-created ones.
  — Reversibility: reversible.

**Folded Todos**
- `audit-manager-pin-identity-in-remaining-rpcs.md` — "Audit process_refund/
  reopen_tab_rpc/edit_paid_tab_rpc/close_tab for the same manager-PIN identity bug fixed in
  G-27-13" (priority: high). The user explicitly chose to fold this into Phase 28 despite it
  not being scope-adjacent to promotion management. Planner should treat this as an
  independent security-audit task within Phase 28 (its own plan/wave), not something the
  promotion-redesign work itself depends on or should be entangled with.

### Claude's Discretion
- Exact junction-table column names/shape (D-01/D-02) — no specific naming was requested by
  the user; standard Supabase/FSD conventions apply (see `promotions_schema.sql` for existing
  naming style to mirror).
- Exact mechanism for the migrated-promotion review flag (D-12) — user asked for the outcome
  (visible, reviewable) not the specific implementation shape.
- Multi-select target-picker UX (search-as-you-type vs. simple checkbox list) was not
  discussed in depth — `src/shared/ui/command.tsx` (shadcn Command/cmdk) is the only
  search-combobox primitive already in this codebase and is the natural starting point for
  research/planning to evaluate.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (The percent-field bug is not deferred, it's
already fixed as Phase 27 gap plan `27-10-PLAN.md`, outside this phase entirely.)

Reviewed-but-not-folded todos: `rename-cargo-package-bar-pos.md` and
`rotate-remote-supabase-db-password.md` — both reviewed and left as standalone pending todos,
unrelated to promotions.
</user_constraints>

## Summary

This phase has two structurally independent workstreams that should be planned as separate
waves: (1) the promotion-wizard redesign (schema + pricing-engine + UI), and (2) the folded
manager-PIN identity audit across `process_refund`/`reopen_tab`/`edit_paid_tab`/`close_tab`.
Neither depends on the other's code; both touch `supabase/migrations/` so should not run in the
same wave if migration-ordering matters to the plan-checker.

**Workstream 1 (promotion wizard):** The current schema (`promotions.product_id`/`category_id`
+ `promotions_exactly_one_target` XOR CHECK) must become a `promotion_targets` junction table
(zero rows = store-wide). Recurrence (`days_of_week int[]`, `start_time`/`end_time`) is a new
AND-filter on top of the existing date range, evaluated in `settings.general.timezone`, not UTC
— this **cannot** reuse the pattern currently used for the existing date-range boundary, because
that pattern (`PromotionFormDialog.tsx`'s `startOfDay`/`endOfDay`) uses the **browser's** local
timezone, not the store's configured one, and only appears correct by coincidence when the
admin's device happens to share the store's timezone. Recurrence, evaluated fresh at every
checkout rather than baked into a stored UTC instant once, has no such coincidence to hide
behind — it must genuinely convert via `settings.general.timezone` in both the plpgsql mirror
(`AT TIME ZONE`, text-variable-compatible) and the TS pure function (native `Intl.DateTimeFormat`,
matching the precedent Phase 27's own E2E suite already set to avoid a new date-library
dependency). The wizard itself is new UI-architecture territory for this codebase — there is no
existing multi-step wizard, no `react-hook-form` anywhere (all forms are hand-rolled
`useState` + manual validation, by established convention), and no multi-select combobox
component (`command.tsx`/cmdk is the only search primitive, currently used nowhere for
multi-select). None of this requires a new npm package.

**Workstream 2 (folded manager-PIN audit):** This is not a "check if a bug exists" task — it is
a "fix a bug that is already reproducibly confirmed" task. `process_refund` **already accepts** a
`p_manager_pin` parameter but the client hardcodes it to `''` and the function body never reads
it (`useProcessRefund.ts:36`'s own comment admits this: `"PIN already verified by
ManagerPinDialog; RPC re-checks role via auth.uid()"`). `reopen_tab` and `edit_paid_tab` don't
even have a PIN parameter — both check `auth.uid()`'s own session role. All three dialogs
(`RefundSheet`, `ReopenTabDialog`, `EditPaidTabDialog`) call `ManagerPinDialog` with the
**pre-widening** `onSuccess={() => {...}}` zero-arg signature, even though `ManagerPinDialog`
was already widened phase-27-wide to `onSuccess: (staff: Staff) => void` (which exposes
`staff.pin`, the exact plaintext PIN string these RPCs need) — Plan 27-08 only rewired
`PaymentForm.tsx`'s consumer, not these three. `close_tab` is different in kind: it has **zero**
authorization check of any kind (not even the broken `auth.uid()` pattern) and is not called
from any client code path today (the AI-agent `closeTab` tool does a raw `.from('tabs').update()`
instead) — but it is still `GRANT EXECUTE ... TO authenticated`, so it is a live, reachable
PostgREST endpoint regardless of UI wiring.

**Primary recommendation:** Two waves. Wave A: `promotion_targets` junction table + recurrence
columns in one migration (with backfill + `needs_review` flag), pricing-engine mirror update,
then the 4-step wizard route. Wave B (independent, can run in parallel or first): re-key
`process_refund`/`reopen_tab`/`edit_paid_tab` to `profiles.pin = p_manager_pin`
(mirroring `20260903090000_process_direct_sale_manager_pin_reverify.sql` exactly) and decide
`close_tab`'s disposition (harden as dead-code defense-in-depth, or explicitly deprecate/drop it
— it is unreachable from any current UI or agent-tool path).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Multi-target scope matching (product ∪ category ∪ store-wide) | API/Backend (`process_direct_sale_atomic`) | Entities (`evaluateBestPromotion`, client preview only) | Server is sole checkout-time price authority (Phase 27 precedent, PROMO-03); client copy is a mirror for the Review-step preview and live cart display, never trusted |
| Recurrence evaluation (day-of-week/time-of-day) | API/Backend | Entities | Same reason — recurrence is a pricing input, must be re-derived server-side every checkout, never trusted from client state |
| Store-local timezone conversion | API/Backend (plpgsql `AT TIME ZONE`) | Entities (TS `Intl.DateTimeFormat` mirror) | Both sides must independently compute the same wall-clock day/time from the same `settings.general.timezone` string — this is exactly the kind of "mirrored, not shared" logic Phase 27's own RESEARCH.md flagged (Pitfall 1) |
| 4-step wizard flow + step validation gating | Frontend (`pages/promotions`, new wizard route) | — | Pure UI-state concern, zero schema/engine dependency (D-07/D-08 marked "reversible — UI-only") |
| Multi-select product+category picker | Frontend (`shared/ui`) | — | New shared primitive, no backend involvement beyond the existing `useProducts`/`useCategories` queries already used by `PromotionFormDialog` |
| Forward-looking date-range presets | Frontend (`shared/ui/DateRangePicker.tsx`) | — | Pure preset-list/label change; the underlying native `<input type="date">` already supports any date, forward or backward |
| Migrated-row review flag | Database (new column) | Frontend (list-page badge) | A boolean column is the DB-side source of truth; the UI just renders a badge/banner off it |
| Manager-PIN identity re-verification (4 RPCs) | API/Backend (plpgsql role re-check) | Frontend (`ManagerPinDialog` consumers capture `staff.pin`) | Security boundary is server-side by design (Phase 27 precedent, T-27-10) — client dialog is UX-only |

## Standard Stack

No new packages are required for either workstream. Everything below is already installed and in
active use elsewhere in this codebase.

### Core (already installed, reused)
| Library | Version | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------------------------|
| react-router-dom | ^7.18.3 [VERIFIED: package.json] | Wizard route(s) (`/promotions/new`, `/promotions/:id/edit`) | Already the routing library for every page in `src/app/router.tsx`; no nested `:id` route exists yet in this app, but v7's `useParams`/`useNavigate` need no new setup |
| zod | ^4.3.6 [VERIFIED: package.json] | Extend `PromotionSchema` with recurrence fields, add a `PromotionTargetSchema` | Single source of truth per `domain.ts` convention (CLAUDE.md) |
| date-fns | ^4.1.0 [VERIFIED: package.json] | Non-timezone date math the wizard needs (e.g. formatting, day arithmetic for date-range presets) | Already installed; **do not** add `@date-fns/tz` or `date-fns-tz` for the recurrence timezone conversion — see Pitfall 1 below |
| cmdk (via `shared/ui/command.tsx`) | bundled shadcn primitive [VERIFIED: src/shared/ui/command.tsx] | Base for the multi-select product+category search picker | Only existing search-combobox primitive in the codebase; confirmed zero existing multi-select consumer (`Grep` for `multi-select\|MultiSelect` found none) |
| Radix Tabs (via `shared/ui/tabs.tsx`) | bundled shadcn primitive [VERIFIED: `ls src/shared/ui` shows `tabs.tsx`] | Step indicator / step container for the wizard | Controlled `value`/`onValueChange` Tabs is a natural fit for a step indicator that's forward-gated on create but freely clickable on edit (D-10) — no new component needed |
| Native `Intl.DateTimeFormat` | browser/Node built-in | Store-local wall-clock day-of-week/time-of-day conversion in the TS pricing function | Established precedent: Phase 27's own `e2e/promotions/timezone-boundary.spec.ts` already solved this exact problem this way and its own header comment cites "RESEARCH.md A4 / Don't Hand-Roll — no date library dependency exists in this repo" |

### Explicitly NOT needed
| Instead of | Don't add | Why |
|------------|-----------|-----|
| `react-hook-form` for the wizard | — | Zero existing usage anywhere in this codebase; every form (`PromotionFormDialog.tsx`, `NearExpirySettingsTab.tsx`, etc.) is hand-rolled `useState` + manual per-field validation. A 4-step wizard with per-step gating is a `currentStep` state machine, not a form-library problem — introducing RHF here would be the one form in the whole app using a different pattern. |
| `date-fns-tz` / `@date-fns/tz` for recurrence timezone math | — | Native `Intl.DateTimeFormat` already solves this (see Pitfall 1) and is the established in-repo precedent; adding a timezone library for one feature when the rest of the app doesn't use one is unjustified new-dependency surface. |
| A new multi-select/combobox package (e.g. `react-select`) | — | `cmdk` (already installed) + a plain `Set<string>`/array of selected ids is sufficient; the codebase's own precedent for "select many of these" (`ModifierGroupEditor.tsx`) is a plain checkbox list, not a third-party combobox lib. |

**Installation:** none — no `npm install` needed for this phase.

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new external packages.** Both workstreams reuse
already-installed, already-in-use dependencies (see Standard Stack above). Skip the Package
Legitimacy Gate protocol; there is nothing to check.

## Architecture Patterns

### System Architecture Diagram (Workstream 1 — pricing/matching data flow)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Promotion Wizard (create/edit)                                     │
│  Step 2 "Scope": multi-select picker writes to local wizard state    │
│  { productIds: string[], categoryIds: string[] }  (empty = store-wide)│
│  Step 3 "Validity+Recurrence": startsAt/endsAt + daysOfWeek/startTime/endTime │
└───────────────────────────┬───────────────────────────────────────────┘
                             │ on Save
                             ▼
              ┌──────────────────────────────┐
              │ promotions (row)              │  ← name, discount_type/value,
              │ promotion_targets (0..N rows) │    starts_at/ends_at, days_of_week,
              │                                │    start_time/end_time, needs_review
              └──────────────┬─────────────────┘
                             │
        ┌────────────────────┴─────────────────────┐
        ▼                                            ▼
┌─────────────────────────┐              ┌─────────────────────────────┐
│ evaluateBestPromotion()  │              │ process_direct_sale_atomic   │
│ (TS, pure, client-side)  │  MIRRORED,   │ (plpgsql, sole authority)    │
│ — cart display preview   │  NOT SHARED  │ — actual checkout price      │
│ — Review-step live price │              │ — recomputes independently   │
└─────────────────────────┘              └─────────────────────────────┘
        │                                            │
        │ both independently:                        │
        │ 1. fetch settings.general.timezone          │
        │ 2. convert "now" to store-local wall time    │
        │    (TS: Intl.DateTimeFormat; SQL: AT TIME ZONE)│
        │ 3. filter promotion_targets: product ∪       │
        │    category ∪ (zero rows = store-wide)       │
        │ 4. filter days_of_week/start_time/end_time    │
        │    as an AND on top of starts_at/ends_at      │
        │ 5. best-price-wins across surviving candidates│
        └────────────────────────────────────────────┘
```

### Recommended Project Structure (additions only)

```
src/
├── features/manage-promotions/
│   ├── ui/
│   │   ├── PromotionWizardPage.tsx       # NEW — replaces PromotionFormDialog as the entry surface
│   │   ├── wizard/
│   │   │   ├── StepBasicsDiscount.tsx    # Step 1
│   │   │   ├── StepScope.tsx             # Step 2 — hosts the multi-select picker
│   │   │   ├── StepValidityRecurrence.tsx # Step 3
│   │   │   └── StepReview.tsx            # Step 4 — live price preview via evaluateBestPromotion
│   │   └── PromotionFormDialog.tsx       # DELETE once wizard ships (or keep temporarily behind a flag — planner's call)
│   └── model/
│       └── usePromotionWizardState.ts    # currentStep + furthestValidStep + form fields, one hook
├── shared/ui/
│   └── MultiSelectPicker/                # NEW — generic product+category multi-select, cmdk-based
│       └── MultiSelectPicker.tsx
└── shared/ui/
    └── DateRangePicker.tsx               # EXTEND — add a `presets` prop, don't fork the component
```

### Pattern 1: Wizard as a controlled Tabs component, not a custom stepper

**What:** Use `shared/ui/tabs.tsx` (Radix Tabs) with `value={currentStep}` /
`onValueChange={handleStepChange}`. Each `TabsTrigger` is the step indicator; each
`TabsContent` is one step's form fields.

**When to use:** For both create and edit — same component, per D-10.

**Example (create-mode gating):**
```tsx
// Source: pattern derived from existing shared/ui/tabs.tsx (Radix Tabs primitive,
// already in this codebase) — no external wizard library.
<Tabs value={currentStep} onValueChange={(next) => {
  const nextIndex = STEP_ORDER.indexOf(next as Step);
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  // Forward navigation blocked past the furthest step whose fields
  // already validated (D-08: "can't click Next" = can't jump ahead either).
  if (nextIndex > currentIndex && !isStepValid(currentStep)) return;
  setCurrentStep(next as Step);
}}>
  <TabsList>
    {STEP_ORDER.map(step => (
      <TabsTrigger
        key={step}
        value={step}
        // Edit mode (promotion != null): every step always enabled (D-10).
        // Create mode: only steps up to furthestValidStep + 1 are enabled.
        disabled={!isEditMode && STEP_ORDER.indexOf(step) > furthestValidStep + 1}
      >
        {t(`promotionWizard.step.${step}`)}
      </TabsTrigger>
    ))}
  </TabsList>
  <TabsContent value="basics"><StepBasicsDiscount ... /></TabsContent>
  <TabsContent value="scope"><StepScope ... /></TabsContent>
  <TabsContent value="validity"><StepValidityRecurrence ... /></TabsContent>
  <TabsContent value="review"><StepReview ... /></TabsContent>
</Tabs>
```

### Pattern 2: Junction-table scope matching (SQL)

**What:** Replace the XOR-column match with an `EXISTS`/`NOT EXISTS` pair: zero target rows =
store-wide match-everything; otherwise match only if a target row references this exact product
or its category.

**Example:**
```sql
-- Source: derived directly from the existing candidate-pool SELECT in
-- supabase/migrations/20260903090000_process_direct_sale_manager_pin_reverify.sql
-- (lines 186-197 of that file, current live definition) — same shape, scope
-- predicate replaced.
SELECT p.id, p.discount_value, p.created_at,
  (CASE WHEN p.discount_type = 'percent'
        THEN ROUND(v_expected_price * p.discount_value / 100.0, 2)
        ELSE LEAST(p.discount_value, v_expected_price)
   END) AS amount
INTO v_cand_id, v_cand_rate, v_cand_created_at, v_cand_amount
FROM promotions p
WHERE p.active
  AND now() BETWEEN p.starts_at AND p.ends_at
  AND (
    NOT EXISTS (SELECT 1 FROM promotion_targets pt WHERE pt.promotion_id = p.id)
    OR EXISTS (
      SELECT 1 FROM promotion_targets pt
      WHERE pt.promotion_id = p.id
        AND (pt.product_id = (v_elem->>'product_id')::uuid OR pt.category_id = v_category_id)
    )
  )
  AND (p.days_of_week IS NULL OR EXTRACT(DOW FROM now() AT TIME ZONE v_store_tz)::int = ANY(p.days_of_week))
  AND (p.start_time IS NULL OR (now() AT TIME ZONE v_store_tz)::time BETWEEN p.start_time AND p.end_time)
ORDER BY amount DESC, p.created_at DESC
LIMIT 1;
```
`v_store_tz` is fetched once at the top of the function via the same
`SELECT ... COALESCE(...) FROM settings WHERE key = 'general'` double-fallback pattern already
used for `v_tax_rate`/`v_near_expiry_threshold` in the same function (verbatim style match).

### Pattern 3: Store-local wall-clock time in TS (mirror of the SQL above)

**What:** A small pure helper, no new dependency — matches the exact technique
`e2e/promotions/timezone-boundary.spec.ts` already uses for the date-range boundary.

**Example:**
```typescript
// Source: pattern lifted directly from e2e/promotions/timezone-boundary.spec.ts's
// own ymdInTimeZone/ zonedWallTimeToUtc helpers (lines 32-41 of that file) —
// generalized here to also extract day-of-week and time-of-day, not just Y/M/D.
export function getStoreLocalDowAndTime(
  now: Date,
  timeZone: string
): { dayOfWeek: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  // Postgres EXTRACT(DOW) convention: 0=Sunday..6=Saturday. Intl 'short'
  // weekday gives 'Sun'..'Sat' — map explicitly, never rely on Date.getDay()
  // (that reads the BROWSER's local timezone, not the store's).
  const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = DOW_MAP[get('weekday')] ?? 0;
  const hhmm = `${get('hour')}:${get('minute')}`;
  return { dayOfWeek, hhmm };
}
```

### Anti-Patterns to Avoid

- **Reusing `PromotionFormDialog.tsx`'s `startOfDay`/`endOfDay` pattern for recurrence:**
  `new Date(`${str}T00:00:00`)` [VERIFIED: src/features/manage-promotions/ui/PromotionFormDialog.tsx:32-45]
  interprets the string in the **browser's** local timezone, not
  `settings.general.timezone`. It "works" for the existing date-range feature only because the
  admin's device timezone happens to match the store's. Recurrence has no such coincidence to
  hide behind — every checkout re-evaluates it fresh, so it must genuinely read
  `settings.general.timezone` on both the TS and plpgsql sides (see Pitfall 1).
- **A plain `UNIQUE(promotion_id, product_id, category_id)` constraint on the junction table:**
  SQL NULL-distinctness means two rows `(promo_id=X, product_id=Y, category_id=NULL)` do **not**
  violate that constraint (NULL is never equal to NULL for uniqueness purposes) — duplicate
  target rows would silently accumulate. Use two partial unique indexes instead (see Pitfall 2).
- **`Date.getDay()`/`Date.getHours()` for the TS-side recurrence check:** both read the
  **runtime's** local timezone (whatever machine the code executes on — the cashier's Tauri app,
  a CI runner, etc.), never `settings.general.timezone`. Always route through
  `Intl.DateTimeFormat` with an explicit `timeZone` option.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-step wizard state machine | A custom stepper library or router-based sub-routes per step | A single `currentStep` + `furthestValidStep` state in one hook, rendered via `shared/ui/tabs.tsx` | The whole flow lives in one page/route already (per D-07's structure); a full sub-router per step adds navigation-history complexity (back-button semantics, deep-linking to step 3) with no payoff — nothing in D-07/D-08 asks for step-level URLs |
| Timezone-aware recurrence math | A new `date-fns-tz`/`luxon`/Temporal-polyfill dependency | Native `Intl.DateTimeFormat` (TS) + `AT TIME ZONE` (SQL) | Established in-repo precedent (Phase 27 E2E suite, and the pre-existing `20260721000007_fix_peak_hours_timezone.sql` migration already uses the identical `AT TIME ZONE 'zone'` SQL idiom for an unrelated report) — zero new dependency needed for either language |
| Multi-select product+category search | A third-party combobox/multi-select package | `cmdk` (`shared/ui/command.tsx`, already installed) + local `Set<string>` selection state | The primitive is already here and unused for this purpose; a package adds bundle size and a second combobox pattern alongside the existing `Select`/`CategoryTreePicker` |
| IANA timezone validation on the Settings timezone field | A timezone-picker library | (Out of scope for this phase — the field is a plain freeform text input today [VERIFIED: src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:111-118], unchanged by Phase 27 or this phase) | Not part of D-01..D-12; flagging only so the planner doesn't scope-creep into fixing it |

**Key insight:** Every "don't hand-roll" item above already has an in-repo precedent doing the
exact same thing for a different feature. The fastest, least-risky path is to generalize an
existing pattern, not introduce a new one.

## Common Pitfalls

### Pitfall 1: Reusing browser-local time for recurrence (silent timezone bug)
**What goes wrong:** A promotion configured "every day 4-6PM" appears active/inactive at the
wrong hours for the store, silently, with no error — because the evaluation used the checkout
device's local clock instead of `settings.general.timezone`.
**Why it happens:** `PromotionFormDialog.tsx`'s existing `startOfDay`/`endOfDay` helpers
[VERIFIED: src/features/manage-promotions/ui/PromotionFormDialog.tsx:32-45 —
`function startOfDay(str: string): Date { return new Date(`${str}T00:00:00`); }`] never read
`settings.general.timezone` at all; they rely on `new Date()`'s implicit browser-local
interpretation. Copy-pasting this pattern for recurrence would silently carry the same bug
forward, except recurrence has no "computed once at save time" cushion — it's evaluated live at
every checkout, so the bug would be constantly live, not a one-time miscalculation.
**How to avoid:** Both `evaluateBestPromotion` (TS) and `process_direct_sale_atomic` (plpgsql)
must take/fetch `settings.general.timezone` as an explicit input and convert via
`Intl.DateTimeFormat({timeZone: tz})` / `AT TIME ZONE v_store_tz` respectively — never via
`Date.getDay()`/`Date.getHours()` or a naive string-to-Date construction.
**Warning signs:** A recurrence E2E test that passes only when run in `America/Mexico_City`
(the CI runner's/dev machine's likely local zone) but fails under `TZ=UTC npm run test:e2e` is
the tell — Phase 27's own equivalent test explicitly computes the expected boundary via
`Intl.DateTimeFormat` for exactly this reason (see `e2e/promotions/timezone-boundary.spec.ts`).

### Pitfall 2: NULL-distinctness defeats a naive junction-table UNIQUE constraint
**What goes wrong:** The same product (or category) gets added to a promotion's target list
twice, silently — no error, no visible symptom until the candidate-pool query returns duplicate
rows (which, given `LIMIT 1` after `ORDER BY amount DESC`, is often invisible until someone
audits the table directly).
**Why it happens:** A composite `UNIQUE (promotion_id, product_id, category_id)` constraint
does **not** prevent two rows `(X, Y, NULL)` and `(X, Y, NULL)` from coexisting — standard SQL
NULL semantics treat every NULL as distinct from every other NULL for uniqueness purposes, and
since exactly one of `product_id`/`category_id` is always NULL (by the XOR CHECK), the "shared"
NULL column defeats the constraint every time.
**How to avoid:** Use two **partial** unique indexes instead:
`CREATE UNIQUE INDEX ... ON promotion_targets(promotion_id, product_id) WHERE product_id IS NOT NULL;`
and the equivalent for `category_id`.
**Warning signs:** A test that inserts the same product twice into one promotion's targets and
expects a constraint-violation error, but the INSERT silently succeeds.

### Pitfall 3: `ManagerPinDialog`'s widened contract exists but wasn't adopted everywhere
**What goes wrong:** Planning the manager-PIN audit as "find out if the bug exists" wastes a
research/investigation task — it demonstrably already exists, with the exact fix pattern already
proven once (Plan 27-08/27-09).
**Why it happens:** `ManagerPinDialog.onSuccess` was widened phase-27-wide from `() => void` to
`(staff: Staff) => void` [VERIFIED: src/features/manager-pin-gate/ui/ManagerPinDialog.tsx:32,
`onSuccess: (staff: Staff) => void;`], but only `PaymentForm.tsx` (the `apply_custom_discount`
consumer) was updated to actually use the new parameter. `RefundSheet.tsx`
[VERIFIED: src/features/process-refund/ui/RefundSheet.tsx:326, `onSuccess={() => {`],
`ReopenTabDialog.tsx` [VERIFIED: grep hit at line 146, `onSuccess={() => {`], and
`EditPaidTabDialog.tsx` [VERIFIED: grep hit at line 454, `onSuccess={() => {`] all still discard
the matched staff — meaning `useProcessRefund.ts` has nothing to send but a hardcoded empty
string [VERIFIED: src/features/process-refund/model/useProcessRefund.ts:36,
`p_manager_pin: '',  // PIN already verified by ManagerPinDialog; RPC re-checks role via auth.uid()`].
**How to avoid:** Widen each `onSuccess` callback to `(staff) => {...}`, capture `staff.pin`
(present on the `Staff` schema [VERIFIED: src/shared/lib/domain.ts:292, `pin: PinSchema,`]),
and thread it through to the RPC call as a new `p_manager_pin` parameter — this is a mechanical
repeat of exactly what Plan 27-08 already did once for `process_direct_sale_atomic`.
**Warning signs:** A cashier (not a manager) who is handed a real manager's PIN still gets
`AUTH_FORBIDDEN`/`FORBIDDEN` on refund/reopen/edit-paid-tab, even though the PIN entry itself
"succeeded" client-side — this is the reported failure mode, verbatim, for G-27-13 before it was
fixed on the direct-sale path.

### Pitfall 4: `close_tab` RPC has no authorization check at all, and is unreachable — do not assume "unreachable" means "safe"
**What goes wrong:** Treating `close_tab` (the Postgres function) as out-of-scope because no UI
button calls it, while it remains `GRANT EXECUTE ... TO authenticated`
[VERIFIED: supabase/migrations/20260703000004_close_tab_rpc.sql:91,
`GRANT EXECUTE ON FUNCTION public.close_tab(...) TO authenticated;`] and its body performs
**zero** role/PIN check of any kind [VERIFIED: same file, lines 55-88 — the function locks the
row, checks only `p_expected_version`, and updates `status` unconditionally]. Any authenticated
staff member (including a cashier) can call `supabase.rpc('close_tab', {...})` directly and
force a tab to `voided`/`closed`/`paid`/`open` with no permission check whatsoever.
**Why it happens:** The migration's own comment already flags this as dormant: "the hook is not
currently wired to any UI call site, so this was never exercised in production"
[VERIFIED: supabase/migrations/20260703000004_close_tab_rpc.sql:31-32]. The AI-agent tool that
shares its name (`closeTab` in `src/shared/lib/agent/tools/posTools.ts`) does a direct
`.from('tabs').update(...)` call [VERIFIED: src/shared/lib/agent/tools/posTools.ts:237-244],
**not** the `close_tab` RPC — so grepping for "who calls `close_tab`" from the client and finding
nothing does not mean the RPC is unreachable from PostgREST.
**How to avoid:** Decide explicitly (this is a real scope decision for the plan, not something
to silently skip): either (a) add the same `auth.uid()` role-check pattern `reopen_tab`/
`edit_paid_tab` already use, as defense-in-depth against direct PostgREST calls, or (b) revoke
`EXECUTE` from `authenticated` entirely since nothing legitimately calls it. Leaving it as-is
(reachable, zero-checked) is the worst option and should not be the default if the plan is
silent on it.
**Warning signs:** None from normal QA — this can only be found by reading the function
definition or attempting a direct RPC call, which is exactly why it survived every prior audit.

## Runtime State Inventory

> This section applies to Workstream 1's schema migration (D-01/D-02/D-11) only —
> Workstream 2 (manager-PIN audit) is a pure code/RPC-body change with no rename/data-migration
> component.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `promotions.product_id`/`category_id` on every existing row in both local dev and the remote "Taj House of Spices" Supabase project must be backfilled into `promotion_targets` rows in the same migration (D-11). Per D-11, neither environment has real/live promotion usage yet, so backfill volume is expected to be small/zero, but the migration must still perform it — do not skip backfill logic on the assumption "there's nothing to migrate." | Data migration: `INSERT INTO promotion_targets (promotion_id, product_id) SELECT id, product_id FROM promotions WHERE product_id IS NOT NULL;` (mirror for `category_id`), in the same transaction as the `DROP COLUMN`/`DROP CONSTRAINT` statements. |
| Live service config | None found. Promotions are a plain RLS-gated table (no n8n/external-service config analog for this feature). | None. |
| OS-registered state | None found. No OS-level task/scheduler registration references promotion data. | None. |
| Secrets/env vars | None found. No secret or env var references `promotions`/`promotion_targets` by name. | None. |
| Build artifacts | None found. No generated/compiled artifact embeds the old `scope_type`/`product_id`/`category_id` shape outside `supabase.types.ts` (which is regenerated post-migration per CLAUDE.md's standard workflow, not a manual fix). | Regenerate `supabase.types.ts` via `npx supabase gen types typescript` after the migration lands, per CLAUDE.md's existing convention — not a new action, just don't skip the usual step. |

**Nothing found in category:** Live service config, OS-registered state, and secrets/env vars —
verified by grep across the codebase for `promotions`/`promotion_targets`/`scope_type`
references outside `src/` and `supabase/`; none found in CI config, external service dashboards,
or task-scheduler references (none exist for this feature at all).

## Code Examples

### Recommended `promotion_targets` schema (Workstream 1, D-01/D-02)
```sql
-- Source: pattern derived from this repo's own promotions table
-- (supabase/migrations/20260901000001_promotions_schema.sql), same naming/index
-- style, junction-table shape replacing the singular FK + XOR CHECK.
CREATE TABLE promotion_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_targets_exactly_one_ref CHECK (
    (product_id IS NOT NULL) <> (category_id IS NOT NULL)
  )
);

-- Pitfall 2: partial unique indexes, NOT a composite UNIQUE constraint —
-- NULL-distinctness would defeat a plain UNIQUE(promotion_id, product_id, category_id).
CREATE UNIQUE INDEX idx_promotion_targets_unique_product
  ON promotion_targets (promotion_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX idx_promotion_targets_unique_category
  ON promotion_targets (promotion_id, category_id) WHERE category_id IS NOT NULL;

CREATE INDEX idx_promotion_targets_promotion ON promotion_targets (promotion_id);
CREATE INDEX idx_promotion_targets_product ON promotion_targets (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_promotion_targets_category ON promotion_targets (category_id) WHERE category_id IS NOT NULL;

-- D-04/D-05: recurrence columns on the existing promotions table.
ALTER TABLE promotions
  ADD COLUMN days_of_week int[],
  ADD COLUMN start_time time,
  ADD COLUMN end_time time,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
  DROP COLUMN scope_type,
  DROP COLUMN product_id,
  DROP COLUMN category_id,
  DROP CONSTRAINT promotions_exactly_one_target;

ALTER TABLE promotions ADD CONSTRAINT promotions_recurrence_both_or_neither CHECK (
  (start_time IS NULL) = (end_time IS NULL)
);
ALTER TABLE promotions ADD CONSTRAINT promotions_recurrence_same_day CHECK (
  start_time IS NULL OR start_time < end_time
);
ALTER TABLE promotions ADD CONSTRAINT promotions_days_of_week_valid CHECK (
  days_of_week IS NULL OR days_of_week <@ ARRAY[0,1,2,3,4,5,6]
);
```

### `needs_review` backfill (D-12, in the same migration)
```sql
-- Runs BEFORE the DROP COLUMN statements above so it can still see the old
-- shape's rows — mark every row that existed prior to this migration.
UPDATE promotions SET needs_review = true;
-- (New rows created after this migration default to needs_review = false
-- via the column DEFAULT above — no further action needed for the ongoing case.)
```

### RPC re-verification fix template (Workstream 2, apply to `process_refund`/`reopen_tab`/`edit_paid_tab`)
```sql
-- Source: exact pattern from 20260903090000_process_direct_sale_manager_pin_reverify.sql
-- (the proven G-27-13 fix), adapted to process_refund's existing (already-present,
-- currently-ignored) p_manager_pin parameter.
-- BEFORE (current, broken — checks the CALLER's own session role):
--   SELECT id INTO v_staff_id FROM profiles
--   WHERE id = auth.uid() AND role IN ('manager', 'admin');
--   IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN: manager or admin role required'; END IF;
-- AFTER (re-derives the AUTHORIZING staff from the entered PIN, independent of auth.uid()):
SELECT p.id INTO v_staff_id
FROM profiles p JOIN role_permissions rp ON rp.role = p.role
WHERE p.pin = p_manager_pin AND p.is_active = true AND rp.action = 'process_refund';
IF NOT FOUND THEN
  RAISE EXCEPTION 'AUTH_FORBIDDEN: manager or admin role required' USING ERRCODE = 'P0A01';
END IF;
```
`reopen_tab`/`edit_paid_tab` currently have **no** `p_manager_pin` parameter at all — that must
be appended (append-only, per Pitfall 5 convention already established in this codebase:
`20260901000002_process_direct_sale_atomic_promotions.sql`'s own header comment) as
`p_manager_pin text DEFAULT NULL::text`, the new last parameter, with a `DROP FUNCTION IF EXISTS`
of the old signature preceding the `CREATE OR REPLACE`.

### Client-side thread-through fix (Workstream 2, apply to `RefundSheet.tsx`/`ReopenTabDialog.tsx`/`EditPaidTabDialog.tsx`)
```tsx
// Source: mechanical repeat of the pattern already proven in
// src/widgets/PaymentModal/ui/PaymentForm.tsx (Plan 27-08).
<ManagerPinDialog
  open={pinOpen}
  onOpenChange={setPinOpen}
  requiredAction="process_refund"
  onSuccess={(staff) => {
    setPinOpen(false);
    void handleSubmitRefund(staff.pin); // was: void handleSubmitRefund()
  }}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Single dialog, single non-paginated form, Save-only validation | Dedicated route, 4-step wizard, per-step forward-navigation gating | This phase (D-07/D-08) | New UI-architecture pattern for this codebase — first multi-step wizard; establishes a precedent future phases can reuse |
| `product_id`/`category_id` XOR columns + CHECK constraint | `promotion_targets` junction table, 0..N rows per promotion | This phase (D-01/D-02) | Breaking, one-way schema migration (no DOWN script, per repo convention) — must land in one migration with backfill, since this repo has no rollback mechanism |
| `ManagerPinDialog.onSuccess` zero-arg (pre-Phase-27) | `onSuccess: (staff: Staff) => void`, but only adopted by `PaymentForm.tsx` so far | Widened in Plan 27-08, not yet adopted by refund/reopen/edit-paid-tab | This phase's folded todo finishes the adoption Plan 27-08 started — no further widening needed, just wiring |

**Deprecated/outdated:**
- `promotions.scope_type` enum (`'product'|'category'`): removed entirely (D-02) — junction-table
  row presence alone determines scope going forward.
- `PromotionFormDialog.tsx`: replaced by the wizard; delete once the wizard ships (planner's call
  on whether to delete in the same phase or leave dead code — CLAUDE.md has no stated preference
  here, but the codebase's own convention elsewhere is to delete replaced components in the same
  phase, e.g. Phase 1's bar-pos strip).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `close_tab` should either be hardened with a role check or have `EXECUTE` revoked from `authenticated` — no third option is acceptable | Pitfall 4 / Standard Stack | If the user actually wants this RPC left exactly as-is (e.g. because a future feature plans to wire it up with its own auth story), the plan should not force a decision here without confirming scope with the user first |
| A2 | The wizard should live at dedicated routes (`/promotions/new`, `/promotions/:id/edit`) rather than, e.g., a full-page overlay reached without a URL change | Architecture Patterns / Recommended Project Structure | D-07 says "dedicated screen (not a modal)" but does not mandate a URL-addressable route specifically — if the planner/user prefers a full-page component swap without router involvement, the recommended structure would need adjusting (low risk either way, purely structural) |
| A3 | `needs_review` should be dismissed only by an explicit "reviewed" affirmation (not automatically cleared on any edit-save) — this research recommends but does not mandate a dismiss mechanism, since D-12 explicitly leaves the mechanism to planning/implementation | Code Examples / Runtime State Inventory | If the planner picks "auto-clear on next save" instead, that's compatible with D-12's stated outcome (visibly distinguishable, reviewable) and not wrong — flagging only because this research didn't verify which the user would prefer |

**If this table is empty:** N/A — see entries above. Everything else in this research (schema
shape specifics, the manager-PIN bug's exact mechanism, the timezone-conversion pitfall, the
NULL-distinctness pitfall) was verified directly against source files read this session, not
assumed.

## Open Questions

1. **Should `PromotionFormDialog.tsx` be deleted in this phase, or left as dead code temporarily?**
   - What we know: the wizard is a full replacement per D-07; nothing in CONTEXT.md says to keep
     the old dialog around.
   - What's unclear: whether the plan should delete it in the same wave as the wizard ships, or
     as a follow-up cleanup task.
   - Recommendation: delete in the same phase — leaving a superseded, still-compiling dialog
     component around invites accidental reuse and doubles the surface area code review has to
     check for the Part-A percent-field-bug class of defect.

2. **`close_tab`'s disposition (harden vs. revoke) — see Assumption A1.**
   - What we know: it's dead code from every current client path but still a live, unchecked
     PostgREST endpoint.
   - What's unclear: whether the user wants it kept for a near-future feature or considers it
     safe to revoke.
   - Recommendation: default to hardening (add the same role-check pattern as
     `reopen_tab`/`edit_paid_tab`) rather than revoking — this is reversible (a later feature can
     still use it) whereas revoking `EXECUTE` and later needing to re-grant it is equally
     reversible but a harden-first default costs nothing and closes the live gap immediately.

## Environment Availability

Skipped — this phase has no new external tool/service dependency beyond the already-configured
local Supabase stack and Node/npm toolchain, both already verified working throughout this
project's prior 27 phases. No new probe is warranted.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright ^1.59 (E2E) + Vitest ^4 (unit) — both already configured [VERIFIED: package.json, CLAUDE.md commands section] |
| Config file | `playwright.config.ts` / `vitest.config.ts` (existing, unchanged) |
| Quick run command | `npx playwright test e2e/promotions/` (per-folder, existing convention) |
| Full suite command | `npm run test:e2e` |

### Phase Requirements -> Test Map
| Req/Decision | Behavior | Test Type | Automated Command | File Exists? |
|--------------|----------|-----------|---------------------|-------------|
| D-01/D-02 | A promotion with 0 target rows applies store-wide; a promotion with N product + M category rows applies to all of them | e2e | `npx playwright test e2e/promotions/multi-target-scope.spec.ts` | ❌ Wave 0 — new spec |
| D-03..D-06 | "Every day 4-6PM" recurrence applies inside the window and not outside it, evaluated in store-local time across a UTC day-boundary crossing | e2e | `npx playwright test e2e/promotions/recurrence-timezone.spec.ts` | ❌ Wave 0 — new spec, mirror `timezone-boundary.spec.ts`'s existing `Intl.DateTimeFormat`-based expected-value computation |
| D-07/D-08 | Forward navigation blocked on an invalid current step; unblocked once valid | e2e | `npx playwright test e2e/promotions/wizard-step-validation.spec.ts` | ❌ Wave 0 — new spec |
| D-09 | Review step shows a live computed price example matching `evaluateBestPromotion`'s real output for the entered configuration | e2e | same spec as above, additional assertion | ❌ Wave 0 |
| D-10 | Edit mode: all 4 steps clickable/navigable immediately, no forward-gating | e2e | same spec | ❌ Wave 0 |
| D-12 | A migrated (pre-existing) promotion shows the review-needed indicator; a newly-created one does not | e2e | `npx playwright test e2e/promotions/migrated-review-flag.spec.ts` | ❌ Wave 0 — new spec |
| Manager-PIN audit (folded todo) | A cashier session + a distinct manager's PIN succeeds on refund/reopen/edit-paid-tab (mirrors the already-proven `apply-promotion-and-custom-discount.spec.ts` pattern) | e2e | extend `e2e/payments/apply-promotion-and-custom-discount.spec.ts` pattern into `e2e/payments/refund-manager-pin-identity.spec.ts`, `e2e/tabs/reopen-manager-pin-identity.spec.ts`, `e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts` | ❌ Wave 0 — 3 new specs, one proven template (`apply-promotion-and-custom-discount.spec.ts`) to copy the login-as-cashier-with-a-different-manager's-PIN pattern from |
| `close_tab` disposition | Whichever disposition is chosen (harden or revoke), prove it: either a non-manager direct RPC call now fails, or the grant is confirmed revoked | integration or e2e | new spec, exact shape depends on the disposition decision (Open Question 2) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant new/modified spec file only (`npx playwright test e2e/promotions/<file>.spec.ts`)
- **Per wave merge:** `npm run typecheck && npm run lint && npm run test`
- **Phase gate:** `npm run test:e2e` full suite green before `/gsd-verify-work`, per CLAUDE.md's
  mandatory-automated-testing policy (no `human_needed`/manual UAT permitted anywhere in this
  phase)

### Wave 0 Gaps
- [ ] `e2e/promotions/multi-target-scope.spec.ts`
- [ ] `e2e/promotions/recurrence-timezone.spec.ts`
- [ ] `e2e/promotions/wizard-step-validation.spec.ts`
- [ ] `e2e/promotions/migrated-review-flag.spec.ts`
- [ ] `e2e/payments/refund-manager-pin-identity.spec.ts`
- [ ] `e2e/tabs/reopen-manager-pin-identity.spec.ts`
- [ ] `e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts`
- [ ] `close_tab` disposition test (shape TBD per Open Question 2)
- [ ] `src/entities/promotion/model/promotion-pricing.test.ts` extension — unit-test the new
      `getStoreLocalDowAndTime` helper and the multi-target matching logic in isolation (fast
      feedback before the E2E layer)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No auth-flow change in this phase |
| V3 Session Management | No | No session change |
| V4 Access Control | **Yes** | The folded manager-PIN audit is squarely a V4 (broken access control / privilege confusion between "who is logged in" vs. "who authorized this action") fix — re-derive the authorizing identity server-side from `profiles.pin = p_manager_pin`, never trust the caller's own session for a privileged override, exactly the pattern already proven in `process_direct_sale_atomic` |
| V5 Input Validation | Yes | `PromotionSchema`/new `PromotionTargetSchema` (Zod, client-side defense-in-depth) + DB CHECK constraints (`promotions_recurrence_same_day`, `promotions_days_of_week_valid`) as the actual authority, mirroring the existing `promotions_exactly_one_target`-style pattern |
| V6 Cryptography | No | No crypto surface touched — `profiles.pin` remains a pre-existing plaintext-comparison design (out of scope to change here; CLAUDE.md documents the two-credential-store PIN/password split as an accepted existing pattern) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Elevation of privilege via manager-PIN-dialog identity confusion (client PIN match discarded; RPC trusts caller's own session) | Elevation of Privilege | Server-side re-derivation of the authorizing staff from `profiles.pin = p_manager_pin`, independently re-checked against `role_permissions` for the specific action — never a client-supplied staff id (T-27-10's exact rationale, already proven for `process_direct_sale_atomic`) |
| Unauthenticated-by-design RPC reachable via direct PostgREST call despite no UI wiring (`close_tab`) | Elevation of Privilege / Tampering | Either add the same role-check pattern as sibling RPCs, or revoke `EXECUTE` from `authenticated` if genuinely unused — "no UI button calls it" is not a security boundary; PostgREST grants are |
| Duplicate junction-table rows silently bypassing an intended uniqueness guarantee | Tampering (data integrity) | Partial unique indexes instead of a composite `UNIQUE` constraint across nullable columns (Pitfall 2) |

## Sources

### Primary (HIGH confidence — read directly this session)
- `D:/Projects/Code/supermarket-pos/.planning/phases/28-promotion-management-redesign/28-CONTEXT.md` — locked decisions D-01..D-12, folded todo
- `D:/Projects/Code/supermarket-pos/.planning/debug/promotion-dialog-ux-and-scope-gaps.md` — root-cause diagnosis with file:line citations
- `D:/Projects/Code/supermarket-pos/.planning/phases/27-promotions-discount-management/27-UAT.md` — G-27-8, G-27-13 verbatim gap reports
- `D:/Projects/Code/supermarket-pos/.planning/phases/27-promotions-discount-management/27-08-SUMMARY.md`, `27-08-PLAN.md` — the proven manager-PIN re-verification fix pattern
- `D:/Projects/Code/supermarket-pos/.planning/todos/pending/audit-manager-pin-identity-in-remaining-rpcs.md` — the folded todo, full text
- `supabase/migrations/20260901000001_promotions_schema.sql`, `20260901000002_process_direct_sale_atomic_promotions.sql`, `20260903090000_process_direct_sale_manager_pin_reverify.sql`, `20260903093000_manager_override_null_coalesce_guard.sql`, `20260828000001_drop_tip_amount.sql` (current live `process_refund`/`close_caja_session` definitions), `20260721000001_fix_reopen_tab_double_count.sql` (current live `reopen_tab`), `20260720000001_fix_edit_paid_tab_inventory.sql` (current live `edit_paid_tab`), `20260703000004_close_tab_rpc.sql` (current live `close_tab`), `20260721000007_fix_peak_hours_timezone.sql` (existing `AT TIME ZONE` idiom precedent)
- `src/entities/promotion/model/promotion-pricing.ts` — `evaluateBestPromotion`, full source
- `src/shared/lib/domain.ts` — `PromotionSchema` (lines 1650-1675), `GeneralSettingsSchema` (lines 794-802), `Staff`/`pin` field (line 292)
- `src/features/manage-promotions/ui/PromotionFormDialog.tsx` — full source, component being replaced
- `src/shared/ui/DateRangePicker.tsx`, `src/shared/ui/CategoryTreePicker/CategoryTreePicker.tsx`, `src/shared/ui/command.tsx` — full source
- `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` — full source, widened contract
- `src/features/process-refund/ui/RefundSheet.tsx`, `src/features/process-refund/model/useProcessRefund.ts` — full source, live confirmed bug
- `e2e/promotions/timezone-boundary.spec.ts` — the established `Intl.DateTimeFormat` timezone-conversion pattern
- `src/shared/lib/agent/tools/posTools.ts` — confirms `close_tab` RPC is unreachable from the AI-agent tool of the same name
- `src/shared/lib/rbac.ts` — `STAFF_ACTIONS`, `CASHIER_ACTIONS`/`MANAGER_EXTRA` sets
- `src/app/router.tsx`, `src/pages/promotions/index.tsx` — current routing/list-page structure
- `package.json` — confirmed installed dependency versions, confirmed absence of `react-hook-form`/`date-fns-tz`

### Secondary (MEDIUM confidence)
- [PostgreSQL: Documentation: Date/Time Functions and Operators](https://www.postgresql.org/docs/current/functions-datetime.html) — confirms `AT TIME ZONE` accepts a text-expression zone name (variable-compatible, not literal-only) and can be chained; cross-verified against this repo's own existing `AT TIME ZONE 'America/Mexico_City'` usage in `20260721000007_fix_peak_hours_timezone.sql`

## Metadata

**Confidence breakdown:**
- Schema/pricing-engine redesign (Workstream 1): HIGH — every current-state claim verified by
  reading the live migration/TS source this session; the recommended junction-table shape is a
  direct, conservative generalization of the existing table's own conventions
- Manager-PIN audit (Workstream 2): HIGH — the bug is not inferred, it is directly confirmed in
  live source (`useProcessRefund.ts:36`'s own comment, the three dialogs' unwidened `onSuccess`
  calls, `close_tab`'s zero-check body) and the fix pattern is a proven, already-shipped precedent
  (Plan 27-08/27-09), not a novel design
- Wizard UI architecture: MEDIUM-HIGH — the recommended Tabs-based step pattern is a reasonable,
  low-risk generalization of an existing primitive, but it is genuinely new territory for this
  codebase (no prior wizard to compare against), so treat the exact component boundaries as a
  planning decision, not a verified fact

**Research date:** 2026-09-04
**Valid until:** 30 days (stable domain — no external library version drift risk since no new
packages are introduced; the manager-PIN audit findings are current-source-verified and will
only go stale if another phase touches these same RPCs first)
