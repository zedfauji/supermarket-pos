---
phase: 24-tax-configuration-inclusive-exclusive-toggle
plan: 02
subsystem: ui
tags: [react, i18n, vitest, react-testing-library, zod]

# Dependency graph
requires:
  - phase: 24-tax-configuration-inclusive-exclusive-toggle/01
    provides: "BillingSettingsSchema.taxInclusive (default true), DEFAULT_BILLING.taxInclusive"
provides:
  - "BillingSettingsTab.tsx taxInclusive on/off toggle, threaded through form type/default/seed/save payload"
  - "es-MX/en-US billingSettingsTab.taxInclusive* i18n keys"
affects: [24-03, 24-04]

# Actuals (#2632)
actuals:
  tokens: 4200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-field UI thread: new boolean settings field copies the exact 4-point thread (form type -> DEFAULT_FORM -> useEffect seed -> save() payload) an existing field already uses, plus a JSX POSButton toggle mirroring the firstHourMode two-button pattern"

key-files:
  created: []
  modified:
    - src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx
    - src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - .planning/phases/24-tax-configuration-inclusive-exclusive-toggle/deferred-items.md

key-decisions:
  - "Placed the taxInclusive toggle inside the existing settings-tax-rate field's div (grid gap-4 md:grid-cols-2), as a second stacked space-y-2 block, rather than a new grid cell — keeps it visually adjacent to the tax rate input per the plan's objective ('alongside the tax rate field')"

patterns-established: []

requirements-completed: [TAX-01]

coverage:
  - id: D1
    description: "An admin viewing Billing Settings sees a taxInclusive on/off toggle alongside the tax rate field, seeded from the live settings row"
    requirement: "TAX-01"
    verification:
      - kind: unit
        ref: "src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx#renders a taxInclusive toggle reflecting the live settings value"
        status: pass
    human_judgment: false
  - id: D2
    description: "Saving Billing Settings after toggling taxInclusive persists the new value in the mutation payload, never silently reset to DEFAULT_FORM (Pitfall 6)"
    requirement: "TAX-01"
    verification:
      - kind: unit
        ref: "src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx#clicking the taxInclusive toggle then Save Billing calls mutation with taxInclusive: false"
        status: pass
      - kind: unit
        ref: "src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx#toggling taxInclusive on, off, then on again then saving calls mutation with taxInclusive: true"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-01
status: complete
---

# Phase 24 Plan 02: Billing Settings taxInclusive Toggle Summary

**Admin-facing `taxInclusive` on/off toggle added to `BillingSettingsTab.tsx`, threaded through the same form type/default/seed/save-payload path `taxRatePercent` already uses, closing TAX-01's UI half on top of Plan 01's already-shipped schema/RPC/receipt core.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-01
- **Tasks:** 2
- **Files modified:** 4 (+ 1 deferred-items.md log)

## Accomplishments
- `BillingForm` type, `DEFAULT_FORM`, the `useEffect` seed, and `save()`'s mutation payload all now carry `taxInclusive`, mirroring `taxRatePercent`/`firstHourMode`'s existing 4-point thread
- New JSX toggle (`POSButton`, `touchSize="large"`, on/off variant) rendered directly below the tax-rate `Input`, inside the existing `ProtectedAction action="manage_products"` gate (left unchanged per RESEARCH.md's explicit out-of-scope note)
- 4 new i18n keys added to both `es-MX`/`en-US` `wAdmin.json` under `billingSettingsTab`: `taxInclusiveLabel`, `taxInclusiveDescription`, `taxInclusiveOnLabel`, `taxInclusiveOffLabel`
- 3 new test cases in `BillingSettingsTab.test.tsx`: toggle renders from live data, save payload includes `taxInclusive: false` after one click (Pitfall 6 regression guard), and `taxInclusive: true` after toggling off then on again — all 5 pre-existing tests still pass (8/8 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the taxInclusive toggle to BillingSettingsTab** - `87a4c25` (feat)
2. **Task 2: Test the toggle persists and never gets silently dropped from a save** - `f8d654e` (test)

## Files Created/Modified
- `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` - `taxInclusive` threaded through `BillingForm`/`DEFAULT_FORM`/seed/save payload + new JSX toggle
- `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx` - `mockSettingsData.billing.taxInclusive` seed + 3 new `it` blocks
- `src/shared/lib/i18n/locales/es-MX/wAdmin.json` - 4 new `billingSettingsTab.taxInclusive*` keys
- `src/shared/lib/i18n/locales/en-US/wAdmin.json` - 4 new `billingSettingsTab.taxInclusive*` keys
- `.planning/phases/24-tax-configuration-inclusive-exclusive-toggle/deferred-items.md` - logged 2 pre-existing, unrelated failures found during this plan's verification (see Issues Encountered)

## Decisions Made
- Toggle placed as a second stacked block inside the same `grid gap-4 md:grid-cols-2` div as the tax-rate input (not a new grid row) — keeps it visually "alongside the tax rate field" per the plan's objective, and both fields share the same grid cell width on desktop
- Followed the plan's exact copy strings verbatim for the 4 new i18n keys (es-MX/en-US)

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 auto-fixes were needed; the two issues below are pre-existing failures in files this plan never touches, out of scope per the scope-boundary rule, and were logged rather than fixed.

## Issues Encountered

**1. Pre-existing `npm run typecheck` failure in `src/app/router.tsx`** (a `BrowserRouter future` prop / `react-router-dom` types mismatch) — confirmed via `git stash` that it reproduces identically on clean `main` HEAD (`542b0cf`), predating this plan. `BillingSettingsTab.tsx` itself has zero typecheck/lint errors. Logged to `deferred-items.md`.

**2. Pre-existing `npm run lint` failures (5 `@typescript-eslint/no-floating-promises` errors)** in `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` and `src/widgets/PINLoginForm/PINLoginForm.tsx` — neither file was read or modified by this plan; `npx eslint src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx --max-warnings 0` is clean. Logged to `deferred-items.md`.

Neither issue blocks this plan's own deliverable: `npx vitest run src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx` is fully green (8/8), and this plan's target file passes both typecheck and lint in isolation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `taxInclusive` is now settable from the admin UI, closing TAX-01 end-to-end (schema from Plan 01 + this plan's UI toggle).
- Plan 03 (fixing `process-payment`/`process-split-payment` receipts) and Plan 04 (e2e/unit fixture hardening) can proceed independently — this plan touched no files in their scope (`supabase/functions/process-payment/index.ts`, `supabase/functions/process-split-payment/index.ts`, `e2e/tabs/reopen-closed-ticket.spec.ts`, `e2e/payments/split-payment.spec.ts` were all left untouched).
- The two pre-existing `router.tsx`/`HomeDashboard.tsx`/`PINLoginForm.tsx` issues logged to `deferred-items.md` will keep failing full-suite `npm run typecheck`/`npm run lint` runs until a future unrelated fix picks them up.

## Self-Check: PASSED

All files created/modified confirmed present on disk; both task commit hashes (`87a4c25`, `f8d654e`) confirmed in `git log`.

---
*Phase: 24-tax-configuration-inclusive-exclusive-toggle*
*Completed: 2026-09-01*
