---
phase: 28-promotion-management-redesign
plan: 03
subsystem: promotions
tags: [react, cmdk, radix-popover, i18next, vitest, testing-library, fsd]

# Dependency graph
requires:
  - phase: 28-promotion-management-redesign
    provides: "28-01: promotion_targets junction table, PromotionTargetInputSchema, usePromotionWizardState scaffold, PromotionWizardPage wizard shell"
provides:
  - "MultiSelectPicker shared/ui primitive (Popover + Command, grouped Products/Categories, chip overflow/truncation) — new reusable multi-select building block"
  - "Real Scope step (StepScope.tsx) wired into the promotion wizard, replacing the 28-01 placeholder"
  - "usePromotionWizardState scope-step API: storeWide, selectedProductIds/selectedCategoryIds, handleStoreWideChange, handleScopeSelectionChange, isScopeStepValid"
  - "save() now assembles the real promotion_targets payload for both create and edit modes (edit no longer omits targets)"
affects: [28-04, 28-05]

# Actuals (#2632)
actuals:
  tokens: 12060
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Multi-select combobox: Popover + cmdk Command + Checkbox rows, grouped via CommandGroup, category rows indented via buildTree-derived depth (mirrors CategoryTreePicker's single-select tree pattern)"
    - "Copy-via-props (not useTranslation) for a shared/ui primitive, mirroring CategoryTreePicker's label/emptyText convention — the feature-layer consumer supplies localized strings"
    - "jsdom scrollIntoView polyfill in test-setup.ts — required by any future cmdk-based shared/ui component's tests, not just this one"

key-files:
  created:
    - src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx
    - src/shared/ui/MultiSelectPicker/MultiSelectPicker.stories.tsx
    - src/shared/ui/MultiSelectPicker/MultiSelectPicker.test.tsx
    - src/shared/ui/MultiSelectPicker/index.ts
    - src/features/manage-promotions/ui/wizard/StepScope.tsx
    - src/features/manage-promotions/model/usePromotionWizardState.test.ts
  modified:
    - src/features/manage-promotions/model/usePromotionWizardState.ts
    - src/features/manage-promotions/ui/PromotionWizardPage.tsx
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/test-setup.ts

key-decisions:
  - "MultiSelectPicker takes all copy via props with English defaults (no useTranslation call inside the component) — mirrors CategoryTreePicker's existing label/emptyText convention; StepScope.tsx (the feature-layer consumer) supplies the real translated strings from wAdmin.json"
  - "Checking storeWide clears selectedProductIds/selectedCategoryIds; unchecking does not restore a prior selection — by construction the arrays are always empty by the time storeWide flips back off, since nothing can populate them while the picker is hidden"
  - "goToStep() re-checks isScopeStepValid() on any Tabs jump past the Scope index, not just relying on furthestValidStep's high-water mark — furthestValidStep doesn't retroactively invalidate if the admin goes back and un-does a previously-valid Scope selection, so a direct tab click could otherwise bypass the gate"
  - "Edit mode's save() no longer omits targets (28-01's temporary safeguard) — now that a real Scope-step picker exists, the selected set (including an explicit [] for store-wide) always reflects the admin's current choice"

requirements-completed: [D-01, D-08]

coverage:
  - id: D1
    description: "MultiSelectPicker: search-driven multi-select over grouped Products/Categories with checkbox rows, chip display with overflow scroll + truncation/tooltip for long names"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "src/shared/ui/MultiSelectPicker/MultiSelectPicker.test.tsx#MultiSelectPicker"
        status: pass
    human_judgment: false
  - id: D2
    description: "isScopeStepValid: true when storeWide or at least one target selected, false when storeWide is off with an empty selection"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#usePromotionWizardState — Scope step validity (D-08 partial)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Checking store-wide clears both selection arrays; unchecking does not restore a prior selection"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#checking storeWide clears both selectedProductIds and selectedCategoryIds"
        status: pass
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#unchecking storeWide leaves selection arrays empty — does not restore a prior selection"
        status: pass
    human_judgment: false
  - id: D4
    description: "save() assembles the real promotion_targets payload for store-wide (empty array) and multi-target (product/category rows) cases, in both create and update modes"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#usePromotionWizardState — save() targets payload assembly"
        status: pass
    human_judgment: false
  - id: D5
    description: "Edit-mode prefill: promotion.targets with zero rows -> storeWide true; non-empty rows -> storeWide false, split into selectedProductIds/selectedCategoryIds by which FK is non-null"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/model/usePromotionWizardState.test.ts#usePromotionWizardState — edit-mode scope prefill"
        status: pass
    human_judgment: false
  - id: D6
    description: "Forward navigation past the Scope step (via Next or a direct Tabs click) is blocked while zero targets are selected and store-wide is unchecked, showing an inline validation error after the blocked attempt"
    requirement: "D-08"
    human_judgment: true
    rationale: "PromotionWizardPage's handleNext()/goToStep() gating is exercised only via typecheck + code review in this plan, not an isolated component/E2E test — no PromotionWizardPage.test.tsx or new e2e spec was in this task's file scope. The underlying isScopeStepValid() predicate itself IS unit-tested (see D2); this entry covers the page-level wiring around it."

# Metrics
duration: ~55min
completed: 2026-09-04
status: complete
---

# Phase 28 Plan 03: MultiSelectPicker + Scope Step Summary

**New `MultiSelectPicker` shared/ui primitive (Popover + cmdk Command, grouped Products/Categories) wired into a real Scope step, replacing the promotion wizard's store-wide-only placeholder with multi-product/multi-category selection and D-08 forward-nav gating.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-04T17:35:00Z
- **Completed:** 2026-09-04T18:30:00Z
- **Tasks:** 2
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- `MultiSelectPicker` (`src/shared/ui/MultiSelectPicker/`) — a new pure-presentation shared/ui primitive: Popover-housed cmdk `Command` list, grouped "Products"/"Categories" via `CommandGroup`, category rows indented by `buildTree`-derived depth (reusing `category-tree.ts`, no duplication), removable `Badge` chips with a `max-h-40 overflow-y-auto` scroll region and `max-w-[12rem] truncate` + native `title` tooltip for long names. Storybook story + 7-test Vitest suite (select/deselect/search-filter/empty-state/chip-removal/disabled).
- `StepScope.tsx` — real Scope step: "Store-wide (no restriction)" checkbox that hides/shows the picker, fed live `useProducts()`/`useCategories()` data, plus an inline validation error shown after a blocked forward-navigation attempt.
- `usePromotionWizardState` extended with `storeWide`/`selectedProductIds`/`selectedCategoryIds` state, `handleStoreWideChange` (checking clears selection), `handleScopeSelectionChange` (wired to `MultiSelectPicker`'s `onChange` shape), `isScopeStepValid()` predicate, and edit-mode prefill from `promotion.targets`.
- `save()` now assembles the real `promotion_targets` payload (`[]` for store-wide, one row per selected product/category otherwise) for **both** create and update — edit mode no longer omits `targets` (28-01's temporary safeguard, now obsolete since a real picker exists).
- `PromotionWizardPage.tsx` replaces the Scope placeholder `TabsContent` with `<StepScope />`, and gates both `handleNext()` and the Tabs `onValueChange` jump-past-Scope case on `isScopeStepValid()`.
- New i18n keys under `promotionWizard.scope.*` in both `es-MX`/`en-US` `wAdmin.json` (store-wide label, picker placeholder/search/group headings, empty state, chip-remove aria-label, validation error).

## Task Commits

Each task was committed atomically:

1. **Task 1: MultiSelectPicker shared/ui primitive** - `b135592` (feat)
2. **Task 2 RED: failing tests for Scope step validity + save() targets assembly** - `2da865d` (test)
2. **Task 2 GREEN: wire StepScope into the promotion wizard with scope-step validity gating** - `7f8e5ef` (feat)

_Note: Task 2 carried `tdd="true"` — RED (`2da865d`) then GREEN (`7f8e5ef`); no REFACTOR commit was needed, the GREEN implementation didn't need further cleanup._

## Files Created/Modified

- `src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx` — new multi-select picker primitive (products/categories, controlled selection, chips)
- `src/shared/ui/MultiSelectPicker/MultiSelectPicker.stories.tsx` — Storybook coverage (empty/some-selected/mixed-overflow/disabled/interactive)
- `src/shared/ui/MultiSelectPicker/MultiSelectPicker.test.tsx` — 7-test Vitest suite
- `src/shared/ui/MultiSelectPicker/index.ts` — barrel export (mirrors `CategoryTreePicker/index.ts`)
- `src/features/manage-promotions/ui/wizard/StepScope.tsx` — new Scope step component
- `src/features/manage-promotions/model/usePromotionWizardState.test.ts` — 11-test RED/GREEN suite (scope validity, storeWide-clears-selection, save() targets assembly, edit-mode prefill)
- `src/features/manage-promotions/model/usePromotionWizardState.ts` — scope-step state/handlers/predicate, save() targets assembly, edit-mode prefill
- `src/features/manage-promotions/ui/PromotionWizardPage.tsx` — wires `<StepScope />`, adds `scopeAttempted` state, gates `handleNext()`/`goToStep()`
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` — `promotionWizard.scope.*` keys
- `src/shared/lib/test-setup.ts` — `window.HTMLElement.prototype.scrollIntoView` polyfill (jsdom doesn't implement it; cmdk's `Command` primitive calls it on every selection/keyboard-nav)

## Decisions Made

- `MultiSelectPicker` takes all copy via props with English defaults (no `useTranslation` inside the component) — mirrors `CategoryTreePicker`'s existing `label`/`emptyText` convention. `StepScope.tsx` supplies the real translated strings from `wAdmin.json`. This also matches Task 1's file scope, which listed no locale JSON changes.
- Checking `storeWide` clears both selection arrays; unchecking does not restore a prior selection — by construction the arrays are always empty by the time `storeWide` flips back off (nothing can populate them while the picker is hidden), matching the plan's `<behavior>` spec and `CategoryTreePicker`'s existing single-value-clear-on-deselect precedent.
- `goToStep()` re-checks `isScopeStepValid()` on any Tabs jump past the Scope index, not just relying on `furthestValidStep`'s high-water mark — `furthestValidStep` doesn't retroactively invalidate if the admin goes back and un-does a previously-valid Scope selection, so a direct tab click could otherwise bypass the D-08 gate.
- Edit mode's `save()` no longer omits `targets` (28-01's temporary safeguard) — now that a real Scope-step picker exists, the selected set (including an explicit `[]` for a promotion switched to store-wide) always reflects the admin's current choice.
- Per the task's own `<action>` text ("only when unchecked" render the picker), the picker is conditionally hidden rather than shown-but-disabled when store-wide is checked — functionally equivalent to the UI-SPEC's "disables the picker" phrasing (the admin cannot interact with it either way), and the plan's task-level instruction is more specific than the phase-level UI-SPEC prose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom has no `scrollIntoView`, breaking cmdk's Command primitive in tests**
- **Found during:** Task 1 (running `MultiSelectPicker.test.tsx` for the first time)
- **Issue:** `cmdk`'s `Command` primitive calls `element.scrollIntoView()` on selection/keyboard navigation; jsdom (this project's Vitest test environment) does not implement it, so every test that opened the picker threw `TypeError: i.scrollIntoView is not a function`.
- **Fix:** Added `window.HTMLElement.prototype.scrollIntoView = vi.fn();` to `src/shared/lib/test-setup.ts`, alongside the existing `ResizeObserver` polyfill for the same class of jsdom-missing-API issue (`ScrollArea`).
- **Files modified:** `src/shared/lib/test-setup.ts`
- **Verification:** All 7 `MultiSelectPicker.test.tsx` tests pass after the polyfill.
- **Committed in:** `b135592` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking-issue fix)
**Impact on plan:** Necessary for the test suite to run at all; the polyfill is additive and scoped to a genuinely missing jsdom API — it does not change behavior for any other test file. No scope creep.

## Issues Encountered

- `npm ci` initially failed with an `ERESOLVE` peer-dependency conflict between `@storybook/addon-vitest@10.3.5` (wants `@vitest/browser@^3||^4`) and this repo's `@vitest/browser@5.0.0`/`vitest@5.0.0`. Pre-existing in `package.json`/`package-lock.json` at the base commit, not introduced by this plan. Resolved with `npm ci --legacy-peer-deps` (matches how CI/sibling worktrees must already be installing, since 28-01 ran the same suite successfully) — no lockfile or `package.json` changes made, so this is purely a local install-flag workaround, not a deviation to the committed dependency tree.
- `node_modules` did not exist in this freshly-spawned worktree (Windows, not the documented Ubuntu-only gotcha) — ran `npm ci --legacy-peer-deps` before any typecheck/test/lint could run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `MultiSelectPicker` is a general-purpose shared/ui primitive now available to any future multi-select need, not just promotions.
- The Scope step is fully real and tested; 28-04 can proceed directly to the Validity & Recurrence step (day-of-week/time-of-day fields) and the Review step's live price preview — both currently still placeholder `TabsContent` panels in `PromotionWizardPage.tsx`.
- `save()`'s targets-assembly logic is stable and covered for both create/update and store-wide/multi-target cases; 28-04 should not need to touch it beyond adding `daysOfWeek`/`startTime`/`endTime` to the `basics` payload object already scaffolded there.
- No blockers for 28-04 or 28-05.

---
*Phase: 28-promotion-management-redesign*
*Completed: 2026-09-04*

## Self-Check: PASSED

- FOUND: `src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx`
- FOUND: `src/shared/ui/MultiSelectPicker/MultiSelectPicker.stories.tsx`
- FOUND: `src/shared/ui/MultiSelectPicker/MultiSelectPicker.test.tsx`
- FOUND: `src/shared/ui/MultiSelectPicker/index.ts`
- FOUND: `src/features/manage-promotions/ui/wizard/StepScope.tsx`
- FOUND: `src/features/manage-promotions/model/usePromotionWizardState.test.ts`
- FOUND commit `b135592` in git log
- FOUND commit `2da865d` in git log
- FOUND commit `7f8e5ef` in git log
- All plan-level `<verification>` commands re-run clean: `npm run typecheck` (0 errors), `npx vitest run src/shared/ui/MultiSelectPicker/MultiSelectPicker.test.tsx` (7/7 pass), `npx vitest run src/features/manage-promotions` (11/11 pass)
