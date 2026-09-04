---
phase: 28-promotion-management-redesign
plan: 04
subsystem: promotions
tags: [react, zod, tanstack-query, i18next, playwright, vitest, radix-tabs, cmdk]

# Dependency graph
requires:
  - phase: 28-promotion-management-redesign
    provides: "28-01: promotion_targets junction table, recurrence columns, evaluateBestPromotion + getStoreLocalDowAndTime, minimal wizard entry. 28-03: MultiSelectPicker primitive, real Scope step, usePromotionWizardState scope-step API."
provides:
  - "DateRangePicker.tsx presets prop + PROMOTION_DATE_PRESETS (forward-looking: Today onward/Next 7 Days/Next 30 Days/This Month), co-located in DateRangePicker.presets.ts"
  - "usePromotionWizardState: recurring/daysOfWeek/startTime/endTime state, handleRecurringChange, toggleDayOfWeek, handleDateRangeChange, isValidityStepValid, isBasicsStepValid, and the isStepValid(step) dispatcher covering all 4 wizard steps"
  - "StepValidityRecurrence.tsx — Validity & Recurrence step (date range + Recurring toggle + day-of-week checkboxes + time-window fields)"
  - "StepReview.tsx — Review step: read-only summary + D-09 live computed-price preview via evaluateBestPromotion"
  - "PromotionWizardPage.tsx: full 4-step forward-nav gate (D-08) generalized across basics/scope/validity, edit-mode zero-gating (D-10), accent-styled current-step TabsTrigger"
  - "e2e/promotions/wizard-step-validation.spec.ts proving D-07/D-08/D-09/D-10 end-to-end"
affects: [28-05]

# Actuals (#2632)
actuals:
  tokens: 13458
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Co-locate a shared/ui component's non-component value exports (preset arrays, helper types) in a sibling .presets.ts/.helpers.ts file — keeps the component file exporting only the component itself, avoiding react-refresh/only-export-components"
    - "Pure isXStepValid() predicates (no side effects) alongside side-effecting validateX() functions that also set inline-error state — the pure predicate powers the isStepValid(step) dispatcher and any-step-jump re-validation; the side-effecting version drives the visible per-field error UI"

key-files:
  created:
    - src/shared/ui/DateRangePicker.presets.ts
    - src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx
    - src/features/manage-promotions/ui/wizard/StepReview.tsx
    - e2e/promotions/wizard-step-validation.spec.ts
  modified:
    - src/shared/ui/DateRangePicker.tsx
    - src/features/manage-promotions/model/usePromotionWizardState.ts
    - src/features/manage-promotions/model/usePromotionWizardState.test.ts
    - src/features/manage-promotions/ui/PromotionWizardPage.tsx
    - src/shared/lib/i18n/locales/es-MX/common.json
    - src/shared/lib/i18n/locales/en-US/common.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json

key-decisions:
  - "PROMOTION_DATE_PRESETS and the existing backward-looking PRESETS both moved into a new DateRangePicker.presets.ts co-located helper file, rather than staying inline in DateRangePicker.tsx — exporting a non-component value (PROMOTION_DATE_PRESETS) alongside the component tripped react-refresh/only-export-components (max-warnings:0 lint gate)"
  - "Fixed a pre-existing gap while touching this file: DateRangePicker's preset button labels were hardcoded English literals never routed through t() at all (even for Reports' own es-MX usage) — converted all 8 preset labels (4 existing + 4 new) to real i18n keys under the common.json dateRangePicker namespace, with genuine Spanish translations for the new forward-looking set"
  - "isValidityStepValid() treats 'exactly one of startTime/endTime set' as invalid (same as the stated 'both empty' case) — the plan's <behavior> spec only explicitly calls out 'both null' and 'both set with endTime<=startTime' as false cases, but a lone one-sided time value can't form a real window and would violate the DB's promotions_recurrence_both_or_neither CHECK constraint if it ever reached save()"
  - "goToStep()'s forward-jump re-validation was generalized from 28-03's Scope-only re-check into a loop over every gated step strictly before the destination index, calling each step's real validating function (validateBasics()/isScopeStepValid()/isValidityStepValid()) — preserves 28-03's robustness (re-invalidating a step the admin backtracked and broke) while extending it to all 3 gated steps per the plan's explicit instruction"
  - "StepReview's Nav bar Create/Save button was NOT duplicated inside StepReview.tsx — PromotionWizardPage's existing bottom Nav bar (built in 28-01, sits outside the Tabs) already renders it; the plan's 'add the final POSButton' instruction is satisfied by that existing wiring plus StepReview's own isLastStep-triggered call to save(), not a second button"
  - "Review step's scrollable region uses a plain div with max-h-[60vh] overflow-y-auto (not the shared ScrollArea component) — matches the must_haves backstop's literal 'overflow-y-auto on the step content region' wording and MultiSelectPicker's own established max-h-40 overflow-y-auto convention; Radix ScrollArea uses overflow-hidden + a JS-managed viewport instead of native overflow-y-auto, which wouldn't literally satisfy that DOM-property backstop"

requirements-completed: [D-04, D-05, D-06, D-07, D-08, D-09, D-10]

coverage:
  - id: D1
    description: "DateRangePicker accepts an optional presets prop (default unchanged for Reports); PROMOTION_DATE_PRESETS supplies 4 forward-looking options for the wizard"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "src/shared/ui (full suite) — DateRangePicker unaffected, 65 tests pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "isValidityStepValid/isStepValid full predicate machine per the stated truth table: date-range-before-start, empty-recurrence, invalid-time-window all false; partial-recurrence configurations true"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#usePromotionWizardState — Validity step validity (D-04/D-05)"
        status: pass
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#usePromotionWizardState — isStepValid dispatcher (D-08)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Recurring toggle reveals day-of-week checkboxes + time-window fields only when on; toggling off clears daysOfWeek/startTime/endTime to null"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#toggling recurring off clears daysOfWeek/startTime/endTime to null"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full create-mode 4-step forward-navigation gate (D-08): empty name, unchecked-scope-with-no-selection, and invalid time window each block Next with the correct inline error"
    requirement: "D-08"
    verification:
      - kind: e2e
        ref: "e2e/promotions/wizard-step-validation.spec.ts#blocks forward navigation on every gated step, shows the live preview, and creates the promotion"
        status: pass
    human_judgment: false
  - id: D5
    description: "Review step's live preview shows a real, cross-checked computed discounted price for the entered configuration, or the no-match fallback"
    requirement: "D-09"
    verification:
      - kind: e2e
        ref: "e2e/promotions/wizard-step-validation.spec.ts#blocks forward navigation on every gated step, shows the live preview, and creates the promotion"
        status: pass
    human_judgment: false
  - id: D6
    description: "Edit mode: every step's TabsTrigger is immediately clickable (no disabled attribute), direct jump to Review bypassing Scope/Validity works"
    requirement: "D-10"
    verification:
      - kind: e2e
        ref: "e2e/promotions/wizard-step-validation.spec.ts#edit mode allows immediate navigation to any step, no forward-gating (D-10)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Review step's summary card stays independently scrollable (overflow-y-auto on its own content region, not the whole page) when recurrence + multi-target scope + the live preview are all populated at once"
    human_judgment: true
    rationale: "must_haves backstop item — implemented via max-h-[60vh] overflow-y-auto on StepReview's root div (visually confirmed via a real E2E screenshot during this plan's own debugging), but no dedicated DOM-height/visual-regression assertion was written for this specific overflow behavior; flagged per the backstop verification vocabulary for the verifier to classify."

duration: ~55min
completed: 2026-09-04
status: complete
---

# Phase 28 Plan 04: Promotion Wizard Validity/Review Steps + Full Forward-Gate Summary

**Completes the 4-step promotion wizard: forward-looking DateRangePicker presets, the Validity & Recurrence step (day-of-week/time-of-day recurrence), the Review step's live `evaluateBestPromotion` price preview, and the full create-mode forward-navigation gate across all 4 steps plus edit-mode's unrestricted navigation.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-04T13:05:00-06:00 (approx.)
- **Completed:** 2026-09-04T13:58:09-06:00
- **Tasks:** 3
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments

- `DateRangePicker.tsx` gains an optional `presets` prop (defaulting to the existing backward-looking set, Reports unaffected) plus a co-located `DateRangePicker.presets.ts` exporting `PROMOTION_DATE_PRESETS` (Today onward/Next 7 Days/Next 30 Days/This Month) for the wizard's Validity step. Fixed a latent i18n gap while here: every preset button label (old and new) now routes through real `dateRangePicker.*` translation keys instead of hardcoded English literals.
- `usePromotionWizardState.ts` gets the full recurrence state machine: `recurring`/`daysOfWeek`/`startTime`/`endTime`, `handleRecurringChange` (clears fields on toggle-off), `toggleDayOfWeek`, `handleDateRangeChange`, `isValidityStepValid()`, a pure `isBasicsStepValid()`, and the `isStepValid(step)` dispatcher spanning all 4 steps. `save()` now writes real recurrence fields instead of hardcoded nulls; edit-mode prefill derives `recurring` from the saved promotion's daysOfWeek/startTime/endTime.
- `StepValidityRecurrence.tsx` (new): DateRangePicker wired to `PROMOTION_DATE_PRESETS`, a "Recurring" Switch revealing 7 day-of-week checkboxes + start/end time inputs only when on, with inline D-05 (`end <= start`) and date-range validation errors.
- `StepReview.tsx` (new): read-only summary of every prior step's values in a `max-h-[60vh] overflow-y-auto` region, plus the D-09 live-price-preview card — builds a preview `Promotion` object from the wizard's unsaved field state, finds the first catalog product matching the current scope, and calls `evaluateBestPromotion` directly, rendering the computed discount or the no-match fallback copy.
- `PromotionWizardPage.tsx`: `goToStep()`'s forward-jump re-validation generalized from 28-03's Scope-only check to all 3 gated steps (basics/scope/validity); current-step `TabsTrigger` now gets accent (`bg-primary`/`text-primary-foreground`) styling per 28-UI-SPEC's step-indicator contract (the base `Tabs` component's default active style didn't use the accent color).
- `e2e/promotions/wizard-step-validation.spec.ts` (new): proves the complete create-mode forward-gate (empty name, unchecked-scope, invalid time window each block Next with the correct error), the Review step's live preview against an independently hand-computed expected discount, the final Create action persisting the promotion, and edit-mode's unrestricted step navigation — all in real Playwright runs against the running app, no mocks.

## Task Commits

Each task was committed atomically:

1. **Task 1: DateRangePicker forward-looking presets** - `d3202ec` (feat)
2. **Task 2 RED: failing tests for isStepValid predicate machine** - `9800b91` (test)
2. **Task 2 GREEN: wire full isStepValid predicate machine + StepValidityRecurrence.tsx** - `540186f` (feat)
3. **Task 3: StepReview.tsx live preview + edit-mode step styling + wizard E2E** - `d553844` (feat)

_Note: Task 2 carried `tdd="true"` — RED (`9800b91`) then GREEN (`540186f`); no REFACTOR commit was needed._

## Files Created/Modified

- `src/shared/ui/DateRangePicker.presets.ts` — `PRESETS` (backward-looking, unchanged behavior) + new `PROMOTION_DATE_PRESETS` (forward-looking), extracted to keep `DateRangePicker.tsx` a component-only export
- `src/shared/ui/DateRangePicker.tsx` — `presets?: Preset[]` prop, defaults to `PRESETS`
- `src/features/manage-promotions/model/usePromotionWizardState.ts` — recurrence state/handlers, `isValidityStepValid`, `isBasicsStepValid`, `isStepValid(step)` dispatcher, `handleDateRangeChange`, real recurrence fields in `save()`, edit-mode recurrence prefill
- `src/features/manage-promotions/model/usePromotionWizardState.test.ts` — 10 new tests covering the Validity step's full truth table and the `isStepValid` dispatcher
- `src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx` — new Validity & Recurrence step component
- `src/features/manage-promotions/ui/wizard/StepReview.tsx` — new Review step component (summary + D-09 live preview)
- `src/features/manage-promotions/ui/PromotionWizardPage.tsx` — wires both new steps, generalized forward-jump re-validation, accent-styled current-step tab
- `src/shared/lib/i18n/locales/{es-MX,en-US}/common.json` — `dateRangePicker.{today,yesterday,last7Days,thisMonth,todayOnward,next7Days,next30Days}` keys
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` — `promotionWizard.validity.*` and `promotionWizard.review.*` keys; removed the now-unused `promotionWizard.comingSoon` placeholder key
- `e2e/promotions/wizard-step-validation.spec.ts` — new E2E spec, 2 tests

## Decisions Made

- Moved `PROMOTION_DATE_PRESETS` (and the pre-existing `PRESETS`) into a co-located `DateRangePicker.presets.ts` helper rather than keeping them inline — exporting a non-component value alongside `DateRangePicker` tripped `react-refresh/only-export-components` under this repo's `max-warnings: 0` lint gate.
- While touching `DateRangePicker.tsx`, fixed a pre-existing gap: none of its preset button labels (including Reports' existing "Today"/"Yesterday"/"Last 7 Days"/"This Month") were ever routed through `t()` — all 8 labels now use real i18n keys with genuine es-MX Spanish translations for the new forward-looking set.
- `isValidityStepValid()` treats "exactly one of startTime/endTime set" as invalid, same as the plan's explicit "both empty" false-case — a one-sided time value can't form a real window and would otherwise violate the DB's `promotions_recurrence_both_or_neither` CHECK constraint if it ever reached `save()`.
- `goToStep()`'s forward-jump re-validation loop was generalized from 28-03's Scope-only re-check to iterate every gated step strictly before the jump destination, calling each step's real validating function — preserves 28-03's robustness against a backtracked-and-broken step while extending it to basics/validity as the plan's `<behavior>` requires.
- `StepReview.tsx` does not render its own Create/Save button — `PromotionWizardPage`'s existing bottom Nav bar (built in 28-01, outside the Tabs) already does, satisfying the plan's "add the final POSButton" instruction without duplicating it.
- The Review step's scrollable region is a plain `<div className="max-h-[60vh] overflow-y-auto">`, not the shared `ScrollArea` component — matches the must_haves backstop's literal "overflow-y-auto" wording (Radix `ScrollArea` uses `overflow-hidden` + a JS-managed viewport instead) and mirrors `MultiSelectPicker`'s own established `max-h-40 overflow-y-auto` convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] E2E spec's own seeded product name exceeded ProductSchema's 50-char max**
- **Found during:** Task 3 (running `wizard-step-validation.spec.ts` for the first time)
- **Issue:** The spec's `seedProduct()` helper generated names like `E2E Wizard Validation Product 1788551612280-d7bpge` (51+ chars). `ProductSchema.name` is capped at `z.string().max(50)`, and `useProducts()`'s mapping loop fails the ENTIRE products list on the first row that doesn't validate — so this one over-long seeded row broke the Scope step's product picker for every test run, 100% reproducibly. Root-caused via a temporary diagnostic patch to `queries.ts`'s error logging (reverted immediately after — confirmed via `git diff` showing zero net change to that file) that surfaced the real Zod `too_big` error the generic `AppError.message` had been masking.
- **Fix:** Shortened the seed helper's name/category prefixes (`E2E WizProd`/`E2E WizCat`) so the full randomized name always stays under 50 chars.
- **Files modified:** `e2e/promotions/wizard-step-validation.spec.ts`
- **Verification:** Full spec re-run clean, 2/2 pass, repeated twice for stability.
- **Committed in:** `d553844` (Task 3 commit; the bug was fixed before the file was ever committed, so no separate fix commit exists)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix, in the test's own seed helper — not application code)
**Impact on plan:** No impact on shipped application behavior; the bug was entirely confined to this plan's own new E2E test fixture. Extensive investigation before finding the root cause considered (and ruled out via direct service-role and real-authenticated-JWT REST queries) shared-local-Supabase-instance flakiness, RLS scoping, and Docker networking instability (a genuinely crash-looping `supabase_vector` container was found and is a real but unrelated environmental artifact) — documented in Issues Encountered below so a future investigator doesn't re-tread the same false leads.

## Issues Encountered

- Extensive debugging was required to isolate the E2E failure (Deviation #1) from this repo's genuinely-documented shared-local-Supabase-instance flakiness pattern (28-01/28-03 precedent). Direct verification ruled out: RLS policies on `products`/`categories` (both are unconditionally `true` for `authenticated`, confirmed via `pg_policies`), stale/cached data (a real signed-in-admin JWT REST query returned clean data via a standalone script at the same time the app's own fetch was failing), and Vite dev-server env-var loading (confirmed `import.meta.env.VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` resolve correctly). Along the way, `supabase_vector_supermarket-pos-selfhosted` (the local stack's log-aggregation sidecar) was observed crash-looping with `Network unreachable` errors — unrelated to this bug (a pure logging container, doesn't touch PostgREST/Postgres), but noted here in case it explains other agents' own flakiness reports in this shared dev environment. The actual root cause (an over-long seeded product name) was found by temporarily instrumenting `queries.ts`'s error logging to surface the underlying `ZodError` (`ProductSchema` rejects the whole `useProducts()` batch on the first row that fails validation) — the instrumentation was fully reverted (`git diff` on that file shows zero changes in the final state).
- Local Supabase stack had to be started (`npx supabase start`) and `node_modules` installed (`npm ci --legacy-peer-deps`, per 28-03's precedent for the peer-dependency conflict) — both absent in this freshly-spawned worktree.
- `E2E Admin/Manager/Cashier/Kitchen Tester` staff accounts already existed in the shared local DB from a prior session; re-ran `scripts/setup-dev-users.ts` (idempotent, repairs drift) to confirm auth was intact rather than assuming.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The promotion wizard is now fully complete across all 4 steps (Basics/Scope/Validity/Review), with the full D-08 forward-navigation gate and D-10 edit-mode unrestricted navigation proven end-to-end.
- `evaluateBestPromotion`'s live preview integration in `StepReview.tsx` establishes the pattern for any future wizard step needing a client-side pricing preview.
- No blockers for 28-05.
- The Review step's overflow-scroll backstop (D7 in coverage above) has no dedicated automated assertion — flagged for the verifier; visually confirmed correct during this plan's own debugging but not covered by a standalone test.

---
*Phase: 28-promotion-management-redesign*
*Completed: 2026-09-04*

## Self-Check: PASSED

- FOUND: `src/shared/ui/DateRangePicker.presets.ts`
- FOUND: `src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx`
- FOUND: `src/features/manage-promotions/ui/wizard/StepReview.tsx`
- FOUND: `e2e/promotions/wizard-step-validation.spec.ts`
- FOUND commit `d3202ec` in git log
- FOUND commit `9800b91` in git log
- FOUND commit `540186f` in git log
- FOUND commit `d553844` in git log
- All plan-level `<verification>` commands re-run clean: `npm run typecheck` (0 errors), `npx vitest run src/shared/ui` (65/65 pass), `npx vitest run src/features/manage-promotions` (21/21 pass), `npx playwright test e2e/promotions/wizard-step-validation.spec.ts` (2/2 pass, re-run twice for stability)
