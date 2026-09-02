---
phase: 27-promotions-discount-management
plan: 02
subsystem: ui
tags: [react, tanstack-query, tanstack-table, react-router, i18next, radix-ui, vitest]

requires:
  - phase: 27-promotions-discount-management (Plan 01)
    provides: promotions table + RLS, entities/promotion (Promotion type, usePromotions/mutation hooks, manage_promotions RBAC action), NearExpirySettingsSchema.discountPercent field
provides:
  - "/promotions admin-only route + Home dashboard tile (manage_promotions-gated)"
  - "Create/Edit Promotion dialog (product/category scope, percent/fixed discount, active date range)"
  - "Promotions DataTable (list/toggle-active/edit/delete) — the usePromotions()-backed surface Plans 03-04 will read from"
  - "useMutationDeletePromotion (real DELETE, order_items.promotion_id ON DELETE SET NULL preserves sale history)"
  - "NearExpirySettingsTab.discountPercent field (default 15, shares near_expiry settings row with thresholdDays)"
affects: [27-03, 27-04]

actuals:
  tokens: 11045
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Client-derived StatusBadge status (promo_active/scheduled/expired/inactive) computed from active/startsAt/endsAt at render time, not a persisted column — mirrors the tab-duration-tier StatusBadge pattern already in this file."
    - "Fetch-failure backstop for a DataTable-backed list: mirror the last-known-good query result into local state (with a set-state-in-effect eslint-disable, matching NearExpirySettingsTab's existing sync-from-query pattern) so a background refetch failure keeps rows rendered instead of clearing to blank."

key-files:
  created:
    - src/app/promotions-route.tsx
    - src/features/manage-promotions/model/useMutationSavePromotion.ts
    - src/features/manage-promotions/ui/PromotionFormDialog.tsx
    - src/features/manage-promotions/ui/PromotionFormDialog.test.tsx
    - src/features/manage-promotions/index.ts
    - src/pages/promotions/index.tsx
    - src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.test.tsx
  modified:
    - src/app/router.tsx
    - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
    - src/shared/ui/StatusBadge.tsx
    - src/entities/promotion/model/queries.ts
    - src/entities/promotion/index.ts
    - src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx
    - src/shared/lib/i18n/locales/{es-MX,en-US}/{pages,wPanels,wAdmin,common}.json

key-decisions:
  - "Task 1's pages/promotions/index.tsx shipped as an intentionally minimal, self-contained shell (title + inert CTA button, no dialog/query wiring) so its own task-scoped typecheck/lint verify command passed without referencing Task 2's not-yet-created PromotionFormDialog — Task 2 then fully replaced the file body with the wired DataTable + dialog. Both diffs are real, atomic, and independently compiling."
  - "Task 2 added useMutationDeletePromotion to src/entities/promotion/model/queries.ts and exported it from the entity barrel — not in the plan's files_modified list, but explicitly required by the task's own <action> text ('add this mutation to entities/promotion/model/queries.ts if Plan 01 didn't already include a delete mutation'). Follows the entity's existing useMutationDeleteModifier pattern verbatim (real DELETE, not soft-deactivate)."
  - "Home dashboard tile label (homeDashboard.tiles.promotions) required a new key in wPanels.json — not listed in the plan's files_modified i18n set (which only named pages.json/wAdmin.json), but HomeDashboard.tsx's existing labelKey convention resolves through the wPanels namespace, not pages. Added to both locales as a Rule 2 completion (component would otherwise render a raw i18n key)."
  - "StatusBadge's promo_* labels live in common.json (the namespace StatusBadge.tsx's useTranslation('common') actually reads), not wAdmin.json — same category of Rule 2 completion as the wPanels tile key above."
  - "Promotion status (active/scheduled/expired/inactive) is derived client-side from active/startsAt/endsAt at render time per the plan's explicit spec — no new DB column, recomputed on every DataTable render."
  - "Copy authoring convention followed Plan 01/this repo's existing wAdmin.json split: Spanish (es-MX) is the authored source string, English (en-US) the genuine translation — matches every pre-existing wAdmin.json entry (nearExpirySettingsTab, supplierListPanel, etc.), which are themselves natural Spanish, not byte-identical-to-English."

patterns-established:
  - "Admin-only list+dialog CRUD page built directly in a pages/<name>/index.tsx (DataTable + create/edit Dialog + delete ConfirmDialog + inline Switch toggle all in one file) when the plan scopes no separate widget/panel file — mirrors PurchaseOrderListPanel's DataTable/Dialog/ConfirmDialog wiring pattern, just inlined into the page instead of a widget."

requirements-completed: [PROMO-01, PROMO-02]

coverage:
  - id: D1
    description: "/promotions route (admin-only, manage_promotions-gated) + Home dashboard tile, non-admin redirected to /home with a toast"
    requirement: "PROMO-01"
    verification:
      - kind: unit
        ref: "npm run typecheck && npm run lint -- --max-warnings=0 (src/app/promotions-route.tsx, router.tsx, HomeDashboard.tsx, pages/promotions/index.tsx)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Create/Edit Promotion dialog: product/category scope (switching scope type clears the previously-selected target), percent/fixed discount with 0-100 client validation, active date range"
    requirement: "PROMO-01"
    verification:
      - kind: unit
        ref: "src/features/manage-promotions/ui/PromotionFormDialog.test.tsx — create title + blank name, edit title + prefilled name, empty-name validation blocks the save mutation"
        status: pass
    human_judgment: false
  - id: D3
    description: "Promotions DataTable: name/scope/discount/date-range/StatusBadge/actions columns, inline active-toggle Switch, edit and delete (ConfirmDialog, UI-SPEC copy), empty state and fetch-error backstop (toast + last-known rows retained)"
    requirement: "PROMO-01"
    verification:
      - kind: unit
        ref: "npm run typecheck && npm run lint -- --max-warnings=0 (src/pages/promotions/index.tsx, entities/promotion/model/queries.ts)"
        status: pass
    human_judgment: true
    rationale: "DataTable row rendering/interaction (Switch toggle, delete confirm, fetch-error backstop keeping rows visible) is only unit-verified at the compile/lint level here — no Playwright/RTL coverage was added for the page itself in this plan; visual/interaction confirmation is deferred to Plan 27-03/27-04's e2e work or a future verify-work pass."
  - id: D4
    description: "NearExpirySettingsTab.discountPercent field (default 15) saves onto the same near_expiry settings row as thresholdDays, same save()/toast.error/dirty-flag pattern, rejects out-of-range (0-100) saves silently"
    requirement: "PROMO-02"
    verification:
      - kind: unit
        ref: "src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.test.tsx — prefill from saved setting, combined save payload, out-of-range rejection"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-02
status: complete
---

# Phase 27 Plan 2: Promotions Management UI Summary

**Admin-only `/promotions` page (route + Home tile + Create/Edit dialog + DataTable) and a `discountPercent` field on Near-Expiry settings, both wired directly onto Plan 01's `entities/promotion` model layer.**

## Performance

- **Duration:** ~25 min (commit-to-commit)
- **Started:** 2026-09-02T09:44:00-06:00 (approx, first tool call)
- **Completed:** 2026-09-02T09:59:41-06:00
- **Tasks:** 3
- **Files modified:** 21 (7 created, 14 modified)

## Accomplishments
- `/promotions` route (`PromotionsRoute`, admin-only via `manage_promotions`) registered in `router.tsx`, plus a Home dashboard tile (`Percent` icon, admin-gated like `/settings`)
- `PromotionFormDialog` (`features/manage-promotions`): product/category scope picker (Select for product, `CategoryTreePicker` for category — one component covers both category and subcategory scope per PROMO-01), percent/fixed discount toggle, `DateRangePicker` for the active window, inline field validation, scope-type switch clears the stale target
- Promotions `DataTable` wired directly into `pages/promotions/index.tsx`: name/scope/discount/date-range/`StatusBadge` (derived client-side: active/scheduled/expired/inactive)/row-actions columns, inline active `Switch`, Edit reopens the dialog pre-filled, Delete via `ConfirmDialog` with the UI-SPEC's exact "sales keep their recorded discount" copy, empty state, and a fetch-failure backstop that toasts and keeps the last-known rows rendered
- `useMutationDeletePromotion` added to `entities/promotion` (real DELETE — `order_items.promotion_id` is `ON DELETE SET NULL`, so a sale's discount snapshot survives)
- `NearExpirySettingsTab.discountPercent` field (default 15, D-04) sharing the existing `thresholdDays` save/dirty/toast pattern, persisting both fields onto the same `near_expiry` settings row

## Task Commits

Each task was committed atomically:

1. **Task 1: `/promotions` route, page shell, and Home dashboard tile** - `a196647` (feat)
2. **Task 2: Create/Edit Promotion dialog + promotions DataTable** - `8bac859` (feat)
3. **Task 3: Expiry-discount rate field on Near-Expiry settings** - `5a66fca` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/app/promotions-route.tsx` - admin-only route guard, mirrors `AuditRoute`
- `src/app/router.tsx` - registers `/promotions`
- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` - new `/promotions` tile (`Percent` icon)
- `src/pages/promotions/index.tsx` - the full list page: `PageContainer` + `DataTable` + `PromotionFormDialog` + `ConfirmDialog`
- `src/shared/ui/StatusBadge.tsx` - `promo_active`/`promo_scheduled`/`promo_expired`/`promo_inactive` statuses
- `src/entities/promotion/model/queries.ts`, `index.ts` - `useMutationDeletePromotion`
- `src/features/manage-promotions/model/useMutationSavePromotion.ts` - create/update dispatch wrapper
- `src/features/manage-promotions/ui/PromotionFormDialog.tsx`, `.test.tsx` - the dialog + smoke tests
- `src/features/manage-promotions/index.ts` - feature barrel
- `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx`, `.test.tsx` - `discountPercent` field + tests
- `src/shared/lib/i18n/locales/{es-MX,en-US}/{pages,wPanels,wAdmin,common}.json` - all new copy keys

## Decisions Made
- Task 1 shipped `pages/promotions/index.tsx` as a minimal, independently-compiling shell (no forward reference to Task 2's not-yet-created `PromotionFormDialog`); Task 2 fully replaced the file body. Both remain real, atomic, verifiable diffs.
- `useMutationDeletePromotion` added to `entities/promotion` even though not in the plan's `files_modified` header — the task's own `<action>` text explicitly required it, and Plan 01's summary confirmed no delete mutation existed yet.
- `wPanels.json` (Home dashboard tile label) and `common.json` (StatusBadge labels) both received new keys despite not being in the plan's i18n file list — required by the actual namespace each consuming component reads (`HomeDashboard.tsx` uses `wPanels`, `StatusBadge.tsx` uses `common`), otherwise those UI surfaces would render raw i18n keys instead of copy.
- Followed this repo's existing wAdmin.json convention: es-MX is the authored Spanish source copy, en-US the genuine English translation (matches every pre-existing entry in the file, not the byte-identical-to-English convention used elsewhere for the original i18n migration).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `useMutationDeletePromotion` missing from `entities/promotion`**
- **Found during:** Task 2 (wiring the Delete row action)
- **Issue:** Plan 01 did not add a delete mutation to `entities/promotion/model/queries.ts`; Task 2's own action text anticipated this ("add this mutation... if Plan 01 didn't already include a delete mutation") but the plan's `files_modified` header omitted the file.
- **Fix:** Added `useMutationDeletePromotion` mirroring `useMutationDeleteModifier`'s existing real-DELETE pattern; exported from `entities/promotion/index.ts`.
- **Files modified:** `src/entities/promotion/model/queries.ts`, `src/entities/promotion/index.ts`
- **Verification:** `npm run typecheck` clean; DataTable's Delete action compiles and calls it.
- **Committed in:** `8bac859` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Home dashboard tile label and StatusBadge labels missing from their actual i18n namespaces**
- **Found during:** Task 1 (Home tile) and Task 2 (StatusBadge promo_* statuses)
- **Issue:** The plan's i18n file list named only `pages.json`/`wAdmin.json`, but `HomeDashboard.tsx` resolves `labelKey` through the `wPanels` namespace and `StatusBadge.tsx` resolves `statusConfig[status].labelKey` through the `common` namespace — neither file was in scope, which would have left those UI surfaces showing raw untranslated keys.
- **Fix:** Added `homeDashboard.tiles.promotions` to `wPanels.json` (es-MX/en-US) and `statusBadge.promoActive/promoScheduled/promoExpired/promoInactive` to `common.json` (es-MX/en-US).
- **Files modified:** `src/shared/lib/i18n/locales/{es-MX,en-US}/wPanels.json`, `src/shared/lib/i18n/locales/{es-MX,en-US}/common.json`
- **Verification:** `npm run lint -- --max-warnings=0` (i18next/no-literal-string gate) clean; manual key lookup confirms both keys resolve.
- **Committed in:** `a196647` (Task 1) / `8bac859` (Task 2)

---

**Total deviations:** 2 auto-fixed (both Rule 2 - missing critical functionality)
**Impact on plan:** Both were necessary for the plan's own stated behavior to actually work (a Delete button that doesn't compile, or UI tiles/badges rendering raw i18n keys, would fail the plan's own `<done>` criteria). No scope creep — no new features beyond what the plan specified.

## Issues Encountered
- `react-hooks/set-state-in-effect` fired on two new synchronize-from-query effects (`PromotionFormDialog`'s edit-mode prefill, and `pages/promotions/index.tsx`'s fetch-failure backstop). Resolved with the same `eslint-disable`/`eslint-enable` bracketing already established by `NearExpirySettingsTab`'s pre-existing threshold-sync effect — not a new pattern, just applied consistently.
- `exactOptionalPropertyTypes: true` rejected `error={x ?? undefined}` / `value={x ?? undefined}` props on `FormField`/`Select` (both declare `prop?: T`, not `prop: T | undefined`); fixed by conditionally spreading the prop (`{...(x ? { error: x } : {})}`) instead of passing `undefined` explicitly, per this repo's documented TypeScript gotcha.
- An unrelated commit (`0534177`, a different Claude session capturing exploration notes under `.planning/notes/` and `.planning/research/`) landed on `main` between this plan's Task 2 and Task 3 commits. Not caused by this executor, does not touch any file this plan modifies, and this plan's own commit history (`a196647` → `8bac859` → `5a66fca`) remains intact and correctly ordered.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 27-03 (live cart display) and Plan 27-04 (payment-screen application) can read `usePromotions()` directly — the same hook this plan's list page consumes, now proven against a real admin-authored promotion end to end (create → list → toggle → edit → delete).
- `useMutationDeletePromotion` is available to any future plan needing it, not just this one.
- No blockers for Wave 2's remaining plans (27-03, 27-04 — both depend only on 27-01, run after this plan per the phase's sequential-dispatch note, not blocked by anything this plan built).
- Deferred: full Playwright/E2E coverage for `pages/promotions/index.tsx`'s DataTable interactions (Switch toggle, delete confirm, fetch-error backstop) was not added in this plan — flagged as `human_judgment: true` in this SUMMARY's `coverage` block (D3) for a future verify-work/e2e pass, consistent with this repo's automated-testing-only policy (no manual UAT is acceptable as a substitute, so this remains open work rather than a closed gap).

---
*Phase: 27-promotions-discount-management*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 7 created files verified present on disk; all 3 task commit hashes (`a196647`, `8bac859`, `5a66fca`) verified present in git history.
