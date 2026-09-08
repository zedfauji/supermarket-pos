---
phase: 31-product-catalog-detail-photo-upload
plan: 06
subsystem: ui
tags: [react-query, supabase, zod, playwright, product-catalog]

# Dependency graph
requires:
  - phase: 31-product-catalog-detail-photo-upload
    provides: ProductDetailDialog reshape (31-02), stock-strip UI (D-17), product-photo pipeline (31-01/31-04/31-05)
provides:
  - "useProductsForManagement() and the create-mutation's post-insert refetch now join inventory(quantity_on_hand, low_stock_threshold), matching useProducts()"
  - "ProductDetailDialog's unitsPerPackage handler rejects non-integer input via a whole-number regex guard before Number.parseInt"
  - "PM16/PM17/PM18 E2E assertions proving the stock strip's real numbers/badge and the units-per-package rejection"
affects: [product-catalog, inventory-display]

# Actuals (#2632)
actuals:
  tokens: 2200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/entities/product/model/queries.ts
    - src/features/manage-products/ui/ProductDetailDialog.tsx
    - e2e/products/product-management.spec.ts

key-decisions:
  - "Both tasks' E2E additions (PM16, PM17, PM18) were authored together in one contiguous insertion in product-management.spec.ts, so Task 1's commit carries all three new tests while Task 2's commit carries only the ProductDetailDialog.tsx fix that makes PM18 meaningful — a minor packaging deviation from strict one-test-per-task, noted below."
  - "Post-merge, the orchestrator ran the live E2E suite (this project's non-negotiable testing policy forbids treating unrun tests as done) and found PM18 genuinely failing: the dialog's <form> had no noValidate, so the units-per-package input's own step={1} HTML5 constraint blocked native submission for \"2.5\" before onSubmit/handleSubmit ever ran — the JS validation, applyFieldErrors, and aria-invalid never fired. Fixed in af6edea by adding noValidate to the form. All 3 new tests plus the full 17-test product-management.spec.ts file now pass, confirmed on two separate runs (no flake)."

patterns-established: []

requirements-completed: [PCAT-01, PCAT-02, PCAT-04]

coverage:
  - id: D1
    description: "useProductsForManagement()'s select and the create-mutation's post-insert refetch select both join inventory(quantity_on_hand, low_stock_threshold), matching useProducts()'s existing join, so the D-17 stock strip renders real on-hand/threshold numbers and a correctly conditional low-stock badge instead of always-wrong '0'/'No threshold' defaults."
    requirement: "PCAT-01"
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts#PM16: stock strip shows real seeded on-hand/threshold, no low-stock badge when comfortably above threshold"
        status: pass
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts#PM17: stock strip shows the low-stock badge when seeded quantity is at/below threshold"
        status: pass
    human_judgment: false
  - id: D2
    description: "ProductDetailDialog's unitsPerPackage handler rejects a non-integer entry (e.g. '2.5') with a visible field error instead of silently truncating it via Number.parseInt."
    requirement: "PCAT-02"
    verification:
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts#PM18 (WR-01): a non-integer Units per package entry is rejected, not silently truncated"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-09-08
status: complete
---

# Phase 31 Plan 06: Stock-Strip Inventory Join & Units-Per-Package Validation Summary

**Joined `inventory(quantity_on_hand, low_stock_threshold)` into `useProductsForManagement`'s and the create-mutation's product selects to fix the D-17 stock strip's always-wrong "0"/"No threshold" display, and added a whole-number regex guard so a manually-typed decimal `unitsPerPackage` value is rejected instead of silently truncated.**

## Performance

- **Duration:** ~20 min (code + test authoring + verification investigation)
- **Started:** 2026-09-08T09:37Z (worktree base)
- **Completed:** 2026-09-08T09:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Closed 31-VERIFICATION.md's sole blocking gap (also 31-REVIEW.md CR-01): `useProductsForManagement()` and `useMutationCreateProduct`'s post-insert refetch both now select `inventory(quantity_on_hand, low_stock_threshold)`, exactly matching `useProducts()`'s existing join. `mapProductRow` needed no changes — it already read `row.inventory?.quantity_on_hand`/`low_stock_threshold`; the join was the only missing piece.
- Closed 31-REVIEW.md WR-01: `ProductDetailDialog`'s `unitsPerPackage` handler now validates the trimmed input is a whole-number string (`/^\d+$/`) before calling `Number.parseInt`, rejecting `"2.5"`/`"1e2"` via the existing `unitsPerPackageMinError` field-error path instead of silently truncating and saving a wrong value.
- Added PM16, PM17 (seeded-inventory stock-strip number/badge assertions) and PM18 (units-per-package rejection assertion) to `e2e/products/product-management.spec.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Join `inventory` into the catalog-management product query (CR-01 fix)** - `f29bd78` (fix) — includes PM16/PM17/PM18 additions to the spec file (see Deviations)
2. **Task 2 (WR-01): Reject a non-integer `unitsPerPackage` entry** - `ac767fc` (fix)
3. **Orchestrator follow-up fix (found by running PM18 for real):** `af6edea` (fix) — added `noValidate` to the dialog's `<form>`

## Files Created/Modified
- `src/entities/product/model/queries.ts` - Added `inventory(quantity_on_hand, low_stock_threshold)` to `useProductsForManagement`'s select and to `useMutationCreateProduct`'s post-insert refetch select
- `src/features/manage-products/ui/ProductDetailDialog.tsx` - `handleSubmit`'s `unitsPerPackage` branch now rejects non-whole-number strings before `Number.parseInt`; `<form>` gained `noValidate` (orchestrator follow-up, see below)
- `e2e/products/product-management.spec.ts` - Added PM16, PM17, PM18

## Decisions Made
- Combined the three new E2E tests (PM16/PM17/PM18) into a single contiguous insertion authored once, rather than splitting the spec-file diff per task via partial staging — Task 1's commit therefore carries the whole test addition while Task 2's commit carries only its source fix. This is a packaging deviation from strict one-test-per-task atomicity but does not affect correctness or test content; both commits' diffs were reviewed for accidental deletions (none found).

## Deviations from Plan

### Auto-fixed Issues

None beyond the plan's own two named fixes (CR-01, WR-01) — no additional Rule 1/2/3 issues were found during implementation.

### Process Deviation (resolved by the orchestrator post-merge)

**1. Executor's sandboxed worktree could not reach Docker/Supabase — orchestrator ran the live suite instead and it caught a real second bug**
- **Found during:** Task 1's mandated RED checkpoint (`npx playwright test ... --grep "PM16|PM17"`) inside the executor's isolated worktree.
- **Issue:** The executor's worktree-isolation sandbox had no path to Docker Desktop (`supabase status` errored `LegacyStatusDbInspectError`) and refused to launch it. The executor documented this honestly and shipped with `human_judgment: true` / unrun-verify rather than claiming false coverage.
- **Orchestrator resolution:** After merging the worktree to `main`, the orchestrator (which has real Docker/Windows access) started Docker Desktop, resolved a stale WinNAT port-exclusion issue blocking `supabase start`, started the local Supabase stack, and ran the suite for real. **PM18 genuinely failed** on the first run: `aria-invalid` stayed `"false"` even with `"2.5"` typed into the field. Root cause: the dialog's `<form>` had no `noValidate`, so the `unitsPerPackage` input's own `step={1}` HTML5 constraint blocked the browser's native form submission before `onSubmit`/`handleSubmit` ever ran — the new regex guard, `applyFieldErrors`, and the resulting `aria-invalid` never executed at all. Fixed in `af6edea` by adding `noValidate` to the form. Re-ran PM16/17/18 twice (stable, no flake) and the full 17-test `product-management.spec.ts` file once — **all pass**.
- **Files modified:** `src/features/manage-products/ui/ProductDetailDialog.tsx` (the `af6edea` commit, on top of the executor's `ac767fc`).

---

**Total deviations:** 1 process deviation (sandbox environment limitation, handled correctly by the executor) that led to 1 real Rule-1-class bug found and fixed by the orchestrator during mandatory live verification.
**Impact on plan:** All code and test changes are complete and verified GREEN via a real `npx playwright test` run, not just static trace. The `noValidate` fix was necessary for PM18's actual scenario (not just its literal assertion) to work at all — without it, the browser silently blocks submission of an invalid units-per-package value with no error shown to the user, which is arguably worse than the truncation bug this plan set out to fix.

## Issues Encountered

- Local self-hosted Supabase (Docker) was unreachable in the executor's sandboxed worktree — resolved by running verification at the orchestrator level instead (which has real Docker access), per this project's non-negotiable "automate it, never ask the user to click through" testing policy. See "Process Deviation" above.
- Along the way, Docker Desktop needed a cold start and a stale Windows WinNAT port-exclusion state needed a `net stop winnat && net start winnat` (run by the user, since this session lacked Administrator rights) before `supabase start` would bind its ports. Purely a host-environment hiccup, unrelated to the code.

## TDD Gate Compliance

Both tasks carry `tdd="true"`. The executor could not observe a live RED→GREEN cycle in its sandbox, but its fixes were authored against a precise, independently-confirmed pre-fix defect (31-VERIFICATION.md Truth 5 / 31-REVIEW.md CR-01 and WR-01). The orchestrator then ran the actual suite: PM18 was RED once for real (caught the missing-`noValidate` bug), and GREEN after `af6edea`. PM16/PM17 were GREEN on first real run. All three, plus the full spec file, are confirmed passing.

## Next Phase Readiness

- Both of 31-VERIFICATION.md's/31-REVIEW.md's named gaps (CR-01, WR-01) are closed and confirmed via a real, passing E2E run — no outstanding action needed before Phase 31 verification.
- IN-01 (client/bucket upload-limit mismatch) and IN-02 (unmemoized `photoColumn`) remain explicitly out of scope per this plan's objective — untouched.

## Self-Check: PASSED

- FOUND: src/entities/product/model/queries.ts (modified)
- FOUND: src/features/manage-products/ui/ProductDetailDialog.tsx (modified)
- FOUND: e2e/products/product-management.spec.ts (modified)
- FOUND: .planning/phases/31-product-catalog-detail-photo-upload/31-06-SUMMARY.md
- FOUND commit: f29bd78 (Task 1)
- FOUND commit: ac767fc (Task 2)
- FOUND commit: bf0ce56 (metadata)

---
*Phase: 31-product-catalog-detail-photo-upload*
*Completed: 2026-09-08*
