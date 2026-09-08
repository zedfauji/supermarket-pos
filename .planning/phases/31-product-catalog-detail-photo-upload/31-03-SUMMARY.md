---
phase: 31-product-catalog-detail-photo-upload
plan: "03"
subsystem: catalog-row-click-and-thumbnails
tags: [react, tanstack-table, tanstack-query, supabase-storage, e2e, tdd]

requires:
  - "products.photo_path column + product-photos Storage bucket + resolveProductImage.ts (Plan 01)"
  - "ProductDetailDialog.tsx — single Details/Photo/Links dialog host (Plan 02)"
provides:
  - "signProductPhotos + useProductImageUrls (D-16 batch signed-URL resolver for list surfaces), re-exported from both entities/product barrels"
  - "CatalogProductsTab row-click wiring (D-04): DataTable's onRowClick opens ProductDetailDialog"
  - "40px batch-signed thumbnail column, one signing request per page"
  - "e2e/products/catalog-row-and-thumbnails.spec.ts — row-click, inline-edit isolation, batch-signing proof"
affects:
  - "src/features/manage-products/ui/CatalogProductsTab.tsx — table columns memoization refactor (see Deviations)"

actuals:
  tokens: 11700
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "TanStack Table cell-closure stability: flexRender's isReactComponent check matches any `typeof x === 'function'`, so an unmemoized `columns` array recreates a new component type per cell every render — memoize the interactive columns via useMemo and read frequently-changing values (drafts, products, the mutation object) through refs updated in a post-commit effect, keeping cell identity stable so React updates instead of remounting."
    - "Live-read-at-commit-time for inline-editable cells: an onCommit callback re-reads the current draft value via a stable getter at call time rather than comparing a value captured in the render that created the closure — avoids a one-render-staleness window where a fill()-then-blur() in the same tick would compare the new value against itself."
    - "Selectively unmemoized column: the photo column is deliberately excluded from the columns memo and rebuilt every render, since it holds no focus/typed state to lose on remount — the correct escape hatch when a value (photoUrls/photosPending) needs to be live without a lagging ref."

key-files:
  created:
    - e2e/products/catalog-row-and-thumbnails.spec.ts
  modified:
    - src/entities/product/model/resolveProductImage.ts
    - src/entities/product/model/resolveProductImage.test.ts
    - src/entities/product/model/index.ts
    - src/entities/product/index.ts
    - src/features/manage-products/ui/CatalogProductsTab.tsx

key-decisions:
  - "Task 1: signProductPhotos/useProductImageUrls follow Plan 01's precedent (no Result<T> wrapping — Storage responses aren't Postgrest builders) — dedupe+sort input, one createSignedUrls call, per-row error isolation, degrade to an empty map (never throw) on any top-level failure."
  - "Task 2: thumbnail cell is a single fixed-size (size-10) container across all three states (image/skeleton/placeholder) rather than three separately-sized elements, so a mixed page never shifts column width and the acceptance-criteria grep for a single catalog-row-thumb testid per cell holds."
  - "[Rule 1 - Bug] CatalogProductsTab's columns array was unmemoized before this plan touched the file — every keystroke in an inline editor silently remounted every table cell, discarding the edit before its blur event could reach a (now-replaced) input, with zero visible error. Found via this plan's own Task 3 E2E spec (a DOM-value assertion would never have caught it — only a service-client check of the persisted row exposed it). Fixed by memoizing the interactive columns and reading changing values through refs; the photo column is deliberately left unmemoized since it has no focus state to lose."

patterns-established:
  - "Table-cell staleness debugging playbook: when an inline edit's committed value never reaches the database despite the UI showing it correctly, suspect table-column memoization before the mutation logic — a component's own local display state (e.g. MoneyInput's displayValue) survives a remount and can mask the underlying remount entirely."

requirements-completed: [PCAT-01, PCAT-04]

coverage:
  - id: batch-signed-url-resolver
    description: "signProductPhotos (D-16): dedupe+sort input paths, one createSignedUrls call, per-row error isolation, degrades to an empty map on any top-level failure; useProductImageUrls keys its TanStack Query on the sorted path list so reordered rows share one cache entry"
    requirement: PCAT-01
    verification:
      - kind: unit
        ref: "src/entities/product/model/resolveProductImage.test.ts (18 tests, RED->GREEN)"
        status: pass
      - kind: e2e
        ref: "e2e/products/catalog-row-and-thumbnails.spec.ts::one signing request per page"
        status: pass
    human_judgment: false
  - id: row-click-and-propagation-stops
    description: "D-04: clicking a non-interactive part of a catalog row opens ProductDetailDialog; every inline editor and both row action buttons stop propagation so neither opens the dialog"
    requirement: PCAT-01
    verification:
      - kind: e2e
        ref: "e2e/products/catalog-row-and-thumbnails.spec.ts::row click opens the dialog, inline editors do not open the dialog, deactivate does not open the dialog, Edit button still opens the dialog"
        status: pass
      - kind: e2e
        ref: "e2e/products/product-management.spec.ts (14 passed, 1 skipped, 0 failed — full regression against the reshaped catalog)"
        status: pass
    human_judgment: false
  - id: thumbnail-column-states
    description: "40px rounded object-cover thumbnail / skeleton / ImageOff placeholder, one fixed-size container per row so a mixed page never shifts column width"
    requirement: PCAT-01
    verification:
      - kind: e2e
        ref: "e2e/products/catalog-row-and-thumbnails.spec.ts::thumbnail states"
        status: pass
    human_judgment: false
  - id: inline-edit-adjacency
    description: "PCAT-02 edge probe: an inline cell commit and a later dialog Save on the same product are two independent writes with no merge — whichever commits last wins"
    requirement: PCAT-04
    verification:
      - kind: e2e
        ref: "e2e/products/catalog-row-and-thumbnails.spec.ts::adjacency (edge probe PCAT-02)"
        status: pass
    human_judgment: false

duration: ~4.5h (includes a real Rule-1 bug found and fixed via this plan's own E2E spec, plus a recurring dev-server port collision with a sibling worktree agent)
completed: "2026-09-08"
status: complete
---

# Phase 31 Plan 03: Catalog Row-Click & Thumbnails Summary

**Wires the catalog table's row click to the reshaped product dialog (D-04), adds a batch-signed 40px thumbnail column (one `createSignedUrls` request per page, D-16), and — while writing the E2E spec that proves both — found and fixed a real pre-existing bug where every inline table edit was silently discarded due to an unmemoized `columns` array forcing a full cell remount on every keystroke.**

## Performance

- Duration: ~4.5h
- Tasks: 3/3 complete
- Files: 6 changed (1 created, 5 modified)
- Commits: 5

## Accomplishments

- `signProductPhotos`/`useProductImageUrls` (`src/entities/product/model/resolveProductImage.ts`): the D-16 batch signer alongside Plan 01's single-product resolver — dedupes and sorts input paths, one `createSignedUrls` call, per-row error isolation (a bad path never discards the page), degrades to an empty map and logs on any top-level failure rather than throwing. TanStack Query hook keyed on the sorted path list so reordered rows share one cache entry. 18/18 unit tests (TDD RED→GREEN).
- `CatalogProductsTab.tsx`: new first `photo` column (batch-signed thumbnail, one request per page), `onRowClick` wired to open `ProductDetailDialog`, `stopPropagation` added to all three inline editors (Name/Category/Price) and both row action buttons (Edit/Deactivate) so neither an inline edit nor Deactivate also pops the dialog open.
- `e2e/products/catalog-row-and-thumbnails.spec.ts`: 7 new tests against the real remote Supabase project — row click opens the dialog, each inline editor doesn't, Deactivate opens only its own confirmation, Edit still opens the dialog, exactly one batch signing request per page, distinct thumbnail states at an identical bounding-box width, and the PCAT-02 adjacency probe (inline edit + later dialog Save are independent writes, the later one wins).
- Found and fixed a real, pre-existing bug (see Deviations) that this plan's own new E2E spec surfaced — no other test in the suite checked a persisted value after an inline `fill()`+`blur()`, so it had never been caught.

## Task Commits

1. `2a7d87b` (test — RED) — failing tests for `signProductPhotos`/`useProductImageUrls` added to `resolveProductImage.test.ts`; confirmed failing (module exports didn't exist) before implementation.
2. `019b7fe` (feat — GREEN) — `signProductPhotos`/`useProductImageUrls` implemented; re-exported from both `entities/product` barrels; 18/18 tests pass, typecheck/lint clean.
3. `144b999` (feat) — photo column, `onRowClick` wiring, propagation stops on all three inline editors and both action buttons; `e2e/products/product-management.spec.ts` 14 passed / 1 skipped / 0 failed against the reshaped catalog.
4. `e40d296` (fix) — Rule 1 bug fix: memoized the interactive table columns via `useMemo` + refs to stop cell remounts on every keystroke; photo column deliberately left unmemoized (see Deviations).
5. `d82d5a0` (test) — `e2e/products/catalog-row-and-thumbnails.spec.ts`, 7/7 passing.

## Files Created/Modified

**Created:**
- `e2e/products/catalog-row-and-thumbnails.spec.ts`

**Modified:**
- `src/entities/product/model/resolveProductImage.ts` + `.test.ts` (batch signer + hook)
- `src/entities/product/model/index.ts`, `src/entities/product/index.ts` (barrel re-exports)
- `src/features/manage-products/ui/CatalogProductsTab.tsx` (photo column, row-click, propagation stops, columns-memoization fix)

## Decisions Made

- Batch signer intentionally not `Result<T>`-wrapped, matching Plan 01's `resolveProductImage.ts` precedent for Storage responses.
- Thumbnail cell is one fixed-size container across all three render states (not three differently-sized elements), so the column never shifts width on a mixed page and carries exactly one `catalog-row-thumb` testid per cell.
- The photo column is deliberately excluded from the `columns` `useMemo` and rebuilt every render — the correct fix for a value (`photoUrls`/`photosPending`) that must be live without a lagging ref, since nothing else re-renders the table once a background signing query settles and a stale ref would freeze the thumbnail on its skeleton forever. Contrast with the interactive cells, which must stay memoized because remounting them loses focus/in-progress input.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `CatalogProductsTab`'s unmemoized `columns` array silently discarded every inline table edit**
- **Found during:** Task 3, while writing and running the new E2E spec's "inline editors do not open the dialog" and "adjacency" tests — both asserted the *persisted* database value after a `fill()`+`blur()`, not just the DOM-displayed value.
- **Issue:** `columns: ColumnDef<Product>[] = [...]` was recomputed fresh on every render (pre-existing, not introduced by this plan — Task 2 only added a column to the same unmemoized array). TanStack Table's `flexRender` treats any function passed as a column's `cell` as a genuine React component type (`isReactComponent` matches `typeof x === 'function'`), so a brand-new `cell` closure every render is a *different component type* at the same tree position — React unmounts and remounts every table cell on every keystroke. A price cell's own `MoneyInput` shows the typed value correctly (its `displayValue` is local component state, survives a remount by re-initializing from the current prop), which is exactly why no prior test caught it: every existing assertion checked `toHaveValue(...)` on the DOM, never the service-client-read persisted row. In reality the remount replaces the focused `<input>` with an unfocused new one *before* the browser's blur event can fire on it, so `onBlurCommit` never runs and the edit is silently lost.
- **Fix:** Split `columns` into a memoized `stableColumns` (`useMemo`, name/category/price/active/actions) plus an intentionally-unmemoized `photoColumn` concatenated in front of it. `stableColumns`'s cell closures read `drafts`/`products`/the update-mutation object through refs (synced in one post-commit `useEffect`, since `react-hooks/refs` forbids a same-render ref write) instead of closing over the render-scoped variables directly, so the closures never need to change identity. Each inline editor's `onCommit` now fires unconditionally on blur and re-reads the live draft value via `getDraft(p)` at call time, rather than comparing a value captured in the render that created the closure — closes a related one-render staleness window that remained even after remounting stopped (a `fill()` immediately followed by `blur()` in the same tick could otherwise commit against a still-stale captured prop). The photo column is deliberately left outside the memo since it has no focus/typed state to lose on remount, and routing `photoUrls`/`photosPending` through the same ref pattern would leave a resolved thumbnail frozen on its skeleton forever (nothing else re-renders the table once the background signing query settles).
- **Files modified:** `src/features/manage-products/ui/CatalogProductsTab.tsx`.
- **Verification:** `e2e/products/catalog-row-and-thumbnails.spec.ts` (7/7) and `e2e/products/product-management.spec.ts` (14 passed, 1 skipped, 0 failed) both green after the fix; `npm run typecheck`/`npm run lint` clean.
- **Commit:** `e40d296`.

**2. [Rule 3 - Blocker] Self-provisioned `.env.local` and re-synced E2E fixture credentials via the Supabase CLI**
- **Found during:** Setup, before Task 2's E2E verification.
- **Issue:** This worktree had no `.env.local` (gitignored, not carried over). Task 2/3's `<verify>` steps require E2E credentials and a reachable dev server against the same remote project prior plans used.
- **Fix:** `supabase link --project-ref mkvinyekkyennyegfoxq` (already-authenticated global CLI) → `supabase projects api-keys` for the anon/service-role keys → wrote a fresh worktree-local `.env.local`. `npm run setup:dev-users` confirmed the 4 fixture accounts already existed on this project from prior plans' provisioning.
- **Files modified:** `.env.local` (gitignored, not committed).

**3. [Rule 3 - Blocker] Recurring dev-server port collision with a sibling worktree agent**
- **Found during:** Task 2 and Task 3's E2E verification runs.
- **Issue:** `vite.config.ts` hardcodes port 1520 (a genuine Tauri requirement, not configurable per-worktree). A sibling agent (working Plan 31-04 in a different worktree, per this plan's dispatch context) runs the identical `npm run dev` on the same fixed port. Several times during this session my own dev server process died (root cause not fully diagnosed — possibly an earlier transient malformed-JSX moment during a debug edit crashing the Vite process) and the sibling's server then claimed the now-free port 1520, silently redirecting my Playwright runs to a *different worktree's code* for several test iterations (confirmed via `curl`'ing the served file and reading the Vite-injected worktree path in the transformed source) before this was diagnosed and each subsequent run was preceded by re-verifying and, when necessary, `taskkill`-ing the wrong process and restarting my own `npm run dev`.
- **Fix:** No code change — a session-operational issue only. Every E2E command in this plan's final verification pass was preceded by a `curl` check confirming the served file's embedded worktree path matched this worktree before trusting the test results.
- **Files modified:** None.

**Total deviations:** 3 auto-fixed (1 real bug found and fixed via this plan's own tracer-quality E2E test, 2 environment/session blockers). **Impact:** the Rule-1 fix was necessary for Task 3's own must_haves ("an inline cell edit committed on blur... is [an] independent write") to be true at all — without it, no inline edit in this table ever actually persisted, a defect invisible to every prior E2E assertion in the suite (all DOM-only). None of the three deviations required an architectural decision or user input.

## Issues Encountered

None beyond the deviations above (all resolved).

## User Setup Required

None — no external service configuration required. The self-provisioned `.env.local` (Deviation 2) is gitignored, worktree-local, and reuses the same remote project and fixture-account convention Plans 01/02 already established.

## Next Phase Readiness

Plan 04 (Photo tab drag/drop/paste completion, running concurrently in a sibling worktree) touches a disjoint file set (`ProductPhotoTab.tsx`, `useProductPhotoUpload.ts`, `photo-file.ts`, `ProductDetailDialog.tsx`, i18n locales, `product-photo-upload.spec.ts`) and is unaffected by this plan's changes. The `columns`-memoization pattern established here (`stableColumns` via `useMemo` + refs, with the deliberately-unmemoized photo column as the documented exception) is directly reusable if a future phase adds more inline-editable or live-updating columns to this or any other TanStack Table instance in the codebase.

## Self-Check: PASSED

`e2e/products/catalog-row-and-thumbnails.spec.ts` confirmed present on disk. All 5 commit hashes (`2a7d87b`, `019b7fe`, `144b999`, `e40d296`, `d82d5a0`) confirmed in `git log`. Working tree clean aside from this SUMMARY.md.

---
*Phase: 31-product-catalog-detail-photo-upload*
*Completed: 2026-09-08*
