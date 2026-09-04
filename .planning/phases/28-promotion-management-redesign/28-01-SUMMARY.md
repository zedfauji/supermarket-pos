---
phase: 28-promotion-management-redesign
plan: 01
subsystem: promotions
tags: [supabase, postgres, junction-table, zod, react-router, tanstack-query, i18next, playwright, timezone]

# Dependency graph
requires:
  - phase: 27-promotions-discount-management
    provides: promotions table (scope_type/product_id/category_id + XOR CHECK), evaluateBestPromotion, process_direct_sale_atomic promotion candidate-pool matching, PromotionFormDialog
provides:
  - promotion_targets junction table (0 rows = store-wide, N rows = multi-product/multi-category)
  - days_of_week/start_time/end_time recurrence columns on promotions
  - needs_review backfill flag for pre-migration promotion rows
  - process_direct_sale_atomic candidate-pool matching extended to junction table + store-local-timezone recurrence filter
  - evaluateBestPromotion() rewritten for targets array + recurrence, plus new getStoreLocalDowAndTime() helper
  - /promotions/new and /promotions/:id/edit wizard routes (Basics+Discount step working; Scope/Validity/Review placeholders)
  - PromotionWizardPage replacing the deleted PromotionFormDialog
affects: [28-02, 28-03, 28-04, 28-05]

# Actuals (#2632)
actuals:
  tokens: 37226
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Junction table with partial unique indexes (not a composite UNIQUE across nullable columns) for a one-of-many-optional-FK relationship"
    - "Store-local wall-clock time via Intl.DateTimeFormat with explicit timeZone (TS) mirrored by AT TIME ZONE (plpgsql) — never Date.getDay()/getHours() or naive UTC math"
    - "Delete+reinsert (not diff) for a small junction-table target set on update"

key-files:
  created:
    - supabase/migrations/20260904000001_promotion_targets_recurrence.sql
    - src/features/manage-promotions/ui/PromotionWizardPage.tsx
    - src/features/manage-promotions/model/usePromotionWizardState.ts
    - e2e/promotions/multi-target-scope.spec.ts
    - e2e/promotions/migrated-review-flag.spec.ts
    - e2e/promotions/recurrence-timezone.spec.ts
  modified:
    - src/shared/lib/domain.ts
    - src/shared/lib/supabase.types.ts
    - src/entities/promotion/model/queries.ts
    - src/entities/promotion/model/promotion-pricing.ts
    - src/entities/promotion/index.ts
    - src/entities/promotion/model/types.ts
    - src/pages/promotions/index.tsx
    - src/app/router.tsx
    - src/shared/ui/StatusBadge.tsx
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/entities/tab/ui/CartItem.tsx

key-decisions:
  - "PromotionUpdate omits `targets` entirely in edit mode instead of sending an empty array, since this task's Scope step has no real picker UI yet — sending `[]` would have silently wiped an existing promotion's targets on every edit-save"
  - "process_direct_sale_atomic rebuilt from the truly-current live body (20260903093000), not the plan's cited read_first (20260903090000) — restored the p_manager_override NULL-coalesce guard and payment-delegation forwarding that 093000 added and 090000 lacked"
  - "Explicit DROP CONSTRAINT promotions_exactly_one_target removed from the migration — Postgres auto-drops a CHECK constraint when a column it references is dropped in the same ALTER TABLE statement, so the explicit clause errored"

patterns-established:
  - "getStoreLocalDowAndTime(now, timeZone): { dayOfWeek, hhmm } — the TS-side mirror of plpgsql's EXTRACT(DOW FROM now() AT TIME ZONE tz) / (now() AT TIME ZONE tz)::time, exported from @entities/promotion for reuse by the Review step's live preview (28-04)"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-11, D-12]

coverage:
  - id: D1
    description: "promotion_targets junction table replaces scope_type/product_id/category_id; 0 targets = store-wide, N targets = multi-product/multi-category in one candidate pool (D-01/D-02)"
    requirement: "D-01"
    verification:
      - kind: e2e
        ref: "e2e/promotions/multi-target-scope.spec.ts"
        status: pass
      - kind: unit
        ref: "src/entities/promotion/model/promotion-pricing.test.ts#store-wide and multi-target matching"
        status: pass
    human_judgment: false
  - id: D2
    description: "days_of_week/start_time/end_time recurrence AND-filter, evaluated in the store's configured timezone on both the plpgsql and TS sides (D-03..D-06)"
    requirement: "D-06"
    verification:
      - kind: e2e
        ref: "e2e/promotions/recurrence-timezone.spec.ts"
        status: pass
      - kind: unit
        ref: "src/entities/promotion/model/promotion-pricing.test.ts#recurrence (D-03..D-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every pre-existing promotion row backfilled needs_review=true; a freshly-created one is not, surfaced as a 'Needs review' badge on /promotions (D-11/D-12)"
    requirement: "D-11"
    verification:
      - kind: e2e
        ref: "e2e/promotions/migrated-review-flag.spec.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "/promotions/new and /promotions/:id/edit render a working 4-tab wizard shell with a real Basics+Discount step; PromotionFormDialog fully removed"
    requirement: "D-07"
    verification:
      - kind: e2e
        ref: "e2e/promotions/migrated-review-flag.spec.ts#a promotion created fresh through the wizard shows no Needs review badge"
        status: pass
    human_judgment: false
  - id: D5
    description: "Scope/Validity/Review wizard steps are placeholder panels for this task — real multi-select target picker, recurrence fields, and live price preview land in 28-03/28-04"
    human_judgment: true
    rationale: "Intentional partial scope per plan design — no automated coverage expected for UI that doesn't exist yet; flagged so the phase-gate task doesn't mistake the placeholder text for a bug"

duration: ~2h
completed: 2026-09-04
status: complete
---

# Phase 28 Plan 01: Promotion_targets Junction Table + Recurrence + Minimal Wizard Entry Summary

**`promotion_targets` junction table (multi-product/multi-category/store-wide) + day-of-week/time-of-day recurrence, evaluated in store-local timezone on both plpgsql and TS, replacing `PromotionFormDialog` with a working `/promotions/new`+`/promotions/:id/edit` wizard route.**

## Performance

- **Duration:** ~2h (includes a substantial shared-local-Supabase-instance debugging detour — see Issues Encountered)
- **Completed:** 2026-09-04T17:18:55Z
- **Tasks:** 2
- **Files modified:** 29 (6 created, 23 modified)

## Accomplishments
- `promotion_targets` junction table (0 rows = store-wide, N rows = any mix of product/category targets), replacing the old `scope_type`/`product_id`/`category_id` XOR-CHECK columns, with partial unique indexes guarding against duplicate target rows (NULL-distinctness pitfall).
- `days_of_week int[]`/`start_time time`/`end_time time` recurrence columns, plus a `needs_review boolean` flag backfilled `true` on every pre-existing promotion row.
- `process_direct_sale_atomic` extended: candidate-pool scope match now uses `EXISTS`/`NOT EXISTS` against `promotion_targets`, AND'd with a recurrence filter computed via `AT TIME ZONE v_store_tz` — the sole checkout-time price authority, unchanged in every other respect.
- `evaluateBestPromotion()` (client-side preview) rewritten to match the same junction-table + recurrence logic via a new `getStoreLocalDowAndTime()` helper (`Intl.DateTimeFormat` with explicit `timeZone`, never `Date.getDay()`/`getHours()`), threaded through all 4 call sites (`CheckoutPanel` x2, `PaymentForm`, `CartItem`).
- `PromotionFormDialog` deleted; `/promotions/new` and `/promotions/:id/edit` render a real 4-tab wizard (`PromotionWizardPage`) with a fully working Basics & Discount step (name, discount type/value) and placeholder panels for Scope/Validity/Review (expanded in 28-03/28-04).
- `needs_review` surfaces as a "Needs review" badge on `/promotions`; the scope column now shows "Store-wide" or a product/category target count instead of a single target name.

## Task Commits

Each task was committed atomically:

1. **Task 1: promotion_targets migration + process_direct_sale_atomic extension + minimal wizard entry, end-to-end** - `ddf92a4` (feat)
2. **Task 2: evaluateBestPromotion multi-target + recurrence mirror, timezone-correct** - `281bd29` (feat)

## Files Created/Modified
- `supabase/migrations/20260904000001_promotion_targets_recurrence.sql` - Junction table, recurrence columns, needs_review backfill, extended `process_direct_sale_atomic`
- `src/shared/lib/domain.ts` - `PromotionTargetSchema`/`PromotionTargetInputSchema`, rewritten `PromotionSchema`/`PromotionCreateSchema`/`PromotionUpdateSchema`
- `src/shared/lib/supabase.types.ts` - Regenerated from the local DB post-migration
- `src/entities/promotion/model/queries.ts` - `usePromotions()` nested-join select, `useMutationCreatePromotion`/`useMutationUpdatePromotion` rewritten for targets + recurrence
- `src/entities/promotion/model/promotion-pricing.ts` - `getStoreLocalDowAndTime()`, `evaluateBestPromotion()` rewritten for targets + recurrence + new `timezone` parameter
- `src/entities/promotion/index.ts`, `src/entities/promotion/model/types.ts` - Export `getStoreLocalDowAndTime`, `PromotionTarget`, `PromotionTargetInput`
- `src/features/manage-promotions/ui/PromotionWizardPage.tsx` - New wizard page (created)
- `src/features/manage-promotions/model/usePromotionWizardState.ts` - New wizard state hook (created)
- `src/features/manage-promotions/ui/PromotionFormDialog.tsx`, `.test.tsx`, `src/features/manage-promotions/model/useMutationSavePromotion.ts` - Deleted (superseded)
- `src/pages/promotions/index.tsx` - Navigate to wizard routes instead of dialog; scope/review columns rewritten
- `src/app/router.tsx` - `/promotions/new`, `/promotions/:id/edit` routes
- `src/shared/ui/StatusBadge.tsx` - `promo_needs_review` variant
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`, `src/widgets/PaymentModal/ui/PaymentForm.tsx`, `src/entities/tab/ui/CartItem.tsx` - Pass `appSettings.general.timezone` to `evaluateBestPromotion`
- `src/entities/promotion/model/promotion-pricing.test.ts`, `src/entities/promotion/model/promotion-rpc.integration.test.ts`, `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` - Updated fixtures/call sites for the new shape
- `src/shared/lib/i18n/locales/{es-MX,en-US}/{common,wAdmin}.json` - New keys: `statusBadge.promoNeedsReview`, `promotionsListPanel.{scopeStoreWide,scopeTargetCounts,columnReview}`, `promotionWizard.*`
- `e2e/promotions/multi-target-scope.spec.ts`, `migrated-review-flag.spec.ts`, `recurrence-timezone.spec.ts` - New E2E specs

## Decisions Made
- **`useMutationUpdatePromotion` omits `targets` entirely in edit mode** rather than sending `[]` — this task's wizard has no real Scope-step UI yet, and an unconditional empty array would silently wipe any existing promotion's targets on every edit-save. Real Scope-step editing (28-03/28-04) will pass the actual selected set.
- **`process_direct_sale_atomic` rebuilt from the truly-current live body**, not the plan's cited read_first migration — see Deviations.
- **Store-local timezone default is `'America/Mexico_City'`** in `PaymentForm.tsx` when `appSettings` hasn't loaded yet, matching the RPC's own COALESCE fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `process_direct_sale_atomic` rebuilt from a stale read_first source, missing two live fixes**
- **Found during:** Task 1 (writing the migration)
- **Issue:** The plan's `<read_first>` cited `20260903090000_process_direct_sale_manager_pin_reverify.sql` as the current live body, but a later migration (`20260903093000_manager_override_null_coalesce_guard.sql`) further modified that same function — adding a `p_manager_override := COALESCE(p_manager_override, false);` NULL-guard and forwarding `p_manager_override`/`p_manager_pin` through the internal `process_payment_atomic`/`process_split_payment_atomic` delegation calls. Copying only from 090000 would have silently regressed both fixes (CR-01/CR-02 and G-27-13's forwarding requirement).
- **Fix:** Rebuilt the function body from the actual latest source (093000), preserving both fixes, and added the new junction-table/recurrence logic on top.
- **Files modified:** `supabase/migrations/20260904000001_promotion_targets_recurrence.sql`
- **Verification:** `npx vitest run src/entities/promotion/model/promotion-rpc.integration.test.ts` (3/3 pass, including the manager-override path)
- **Committed in:** `ddf92a4`

**2. [Rule 3 - Blocking] Explicit `DROP CONSTRAINT` after dropping its referenced column errors**
- **Found during:** Task 1 (first migration apply attempt)
- **Issue:** `promotions_exactly_one_target` CHECK references both `product_id`/`category_id`; Postgres auto-drops a CHECK constraint when a column it depends on is dropped in the same `ALTER TABLE` statement. The migration's trailing `DROP CONSTRAINT promotions_exactly_one_target` therefore errored with "constraint ... does not exist" once the column drops in the same statement already removed it.
- **Fix:** Removed the now-redundant explicit `DROP CONSTRAINT` clause.
- **Files modified:** `supabase/migrations/20260904000001_promotion_targets_recurrence.sql`
- **Verification:** Migration applied cleanly; `\d promotions` confirms the constraint is gone.
- **Committed in:** `ddf92a4`

**3. [Rule 1 - Bug] `promotion-rpc.integration.test.ts`'s below-cost-override test never passed `p_manager_pin`**
- **Found during:** Task 2 (running this task's own required `<verify>` list, which includes this file)
- **Issue:** The RPC has required `p_manager_pin` to authorize `p_manager_override:true` since Phase 27 Plan 08 (G-27-13), but this pre-existing test only ever passed `p_manager_override: true` with no PIN — a gap that predates this phase, unrelated to the junction-table/recurrence work, but within this task's explicit file scope and required to pass by its own verify list.
- **Fix:** `getStaffAndShift` now also selects and returns the fetched staff's `pin`; the below-cost-override test threads it through as `p_manager_pin`.
- **Files modified:** `src/entities/promotion/model/promotion-rpc.integration.test.ts`
- **Verification:** `npx vitest run src/entities/promotion/model/promotion-rpc.integration.test.ts` (3/3 pass)
- **Committed in:** `281bd29`

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bug fixes, 1 Rule 3 blocking-issue fix)
**Impact on plan:** All three were necessary for correctness (preventing a security-relevant regression, an invalid migration, and a mis-scoped test); no scope creep beyond what each task's own file list/verify already required.

## Issues Encountered
- **Local Supabase instance and dev-server port (1520) are shared across all parallel worktree agents in this wave**, not per-worktree. This surfaced three distinct problems during verification, all resolved without touching any sibling agent's work:
  1. **Migration history drift**: an unrelated stale/renamed migration-timestamp entry, plus six Phase-27 migrations physically applied to the shared local DB but never recorded in its migration-history table, blocked `supabase db push --local`. Repaired via `supabase migration repair --local --status reverted|applied <version>` (no destructive action, only history-table correction) before applying this plan's own migration. `supabase db push --local --dry-run` still reports drift post-completion because a sibling agent's own uncommitted migration (`20260904000002`, not present in this worktree) is now in the shared DB's history — this is expected, not a regression, and not something this plan should "fix" by touching a worktree it doesn't own.
  2. **Env credentials**: this worktree has no `.env.local` (gitignored, never checked out); `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`E2E_*_NAME`/`E2E_*_PIN` were supplied as inline shell env vars per test invocation (values derived from `supabase status`'s printed local dev keys) rather than a committed file, per the harness's `.env*` deny-rule.
  3. **Cross-agent E2E staff collisions**: this worktree's own `npx tsx scripts/setup-dev-users.ts` run created an "E2E Cashier Tester" profile that a sibling agent's later staff-seeding subsequently overwrote/removed (a different agent's own `E2E_BARTENDER_NAME` value collided against the shared DB's single `profiles` table). Re-running `setup-dev-users.ts` immediately before each E2E run made it idempotently self-healing.
- One transient E2E false-failure was self-inflicted: a `DEBUG TEST PROMO` row I manually seeded via `psql` during investigation (store-wide, no recurrence restriction) was still active during a later `recurrence-timezone.spec.ts` run, causing a false "discount applied when it shouldn't be" failure. Deleted; the suite passed cleanly on the next run. Not a product defect.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema, backend pricing engine, and client-side pricing preview are all fully migrated to the junction-table + recurrence model and proven end-to-end via real Playwright checkout flows (no mocked pricing logic).
- `PromotionWizardPage`/`usePromotionWizardState` are the real entry points 28-03/28-04 extend — the Scope step needs a real multi-select target picker (wiring `targets` into `usePromotionWizardState.save()`, replacing the current always-`[]`/omitted behavior), the Validity step needs real recurrence fields, and the Review step needs the D-09 live-price preview (via the newly-exported `getStoreLocalDowAndTime`).
- Full-suite regression (`npm run test:e2e`, all 51 specs including the 9 pre-existing promotions specs that seed the old `scope_type`/`product_id`/`category_id` shape) is deferred to Plan 05's phase-gate task, per this repo's Sampling Rate policy — not run in this plan.
- No blockers for 28-02 (the parallel manager-PIN-audit plan in this same wave) — it touches unrelated RPCs (`process_refund`/`reopen_tab`/`edit_paid_tab`/`close_tab`), not anything this plan modified.

---
*Phase: 28-promotion-management-redesign*
*Completed: 2026-09-04*

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260904000001_promotion_targets_recurrence.sql`
- FOUND: `src/features/manage-promotions/ui/PromotionWizardPage.tsx`
- FOUND: `src/features/manage-promotions/model/usePromotionWizardState.ts`
- FOUND: `e2e/promotions/multi-target-scope.spec.ts`
- FOUND: `e2e/promotions/migrated-review-flag.spec.ts`
- FOUND: `e2e/promotions/recurrence-timezone.spec.ts`
- CONFIRMED DELETED: `src/features/manage-promotions/ui/PromotionFormDialog.tsx`
- FOUND commit `ddf92a4` in git log
- FOUND commit `281bd29` in git log
- All plan-level `<verification>` commands re-run clean: `npm run typecheck` (0 errors), `npx vitest run` across all 4 required test files (64 tests pass), `npx playwright test` across all 3 required E2E spec files (6/6 pass)
