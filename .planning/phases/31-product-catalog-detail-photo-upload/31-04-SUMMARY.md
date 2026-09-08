---
phase: 31-product-catalog-detail-photo-upload
plan: "04"
subsystem: product-photo-upload-interactions
tags: [drag-and-drop, clipboard-paste, playwright, product-catalog, tdd]

requires:
  - "products.photo_path column + product-photos Storage bucket + resolveProductImage.ts + ProductPhotoTab.tsx (Plan 01)"
  - "ProductDetailDialog.tsx — Details/Photo/Links vertical-tab host (Plan 02)"
provides:
  - "firstImageFromDataTransfer / firstImageFromClipboard (photo-file.ts) — shared extraction over any DataTransferItem-shaped list"
  - "ProductPhotoTab.tsx — drag-and-drop, clipboard paste, Replace, confirmed Remove, and the full loading/error state matrix; exposes an imperative handleFile handle via forwardRef"
  - "useRemoveProductPhoto mutation + PHOTO_REMOVE_FAILED AppErrorCode"
  - "Photo-tab-scoped onPaste listener on ProductDetailDialog's DialogContent"
  - "vite.config.ts server.watch.ignored fix for Playwright output directories"
affects:
  - "src/shared/lib/result.ts (PHOTO_REMOVE_FAILED code + photoRemoveFailedError factory)"
  - "src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json (photo.dropHere/replace/remove/removed/errorRemove/removeConfirm*)"
  - "e2e/products/product-photo-upload.spec.ts (6 new specs, 11/11 total)"

actuals:
  tokens: 10700
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Duck-typed DataTransferItemLike interface (kind/type/getAsFile) so drag, paste, and unit tests all share one extractor without a jsdom DataTransferItem constructor"
    - "Imperative handle (forwardRef + useImperativeHandle) to let a dialog-level paste listener feed a tab-owned upload pipeline without duplicating mutation logic"
    - "Mutation-input stage callback (onStageChange) to let a single validate->resize->upload->link pipeline report two distinct UI-visible phases (processing vs uploading) without splitting the pipeline"
    - "Playwright drop/paste simulation: page.evaluateHandle to build a real decodable-PNG DataTransfer, then either Locator.dispatchEvent('drop', {dataTransfer}) (Playwright's own DragEvent mapping) or an in-page-constructed native ClipboardEvent for 'paste' (which Playwright's dispatchEvent does not map)"

key-files:
  modified:
    - src/features/manage-products/model/photo-file.ts
    - src/features/manage-products/model/photo-file.test.ts
    - src/features/manage-products/model/useProductPhotoUpload.ts
    - src/features/manage-products/ui/tabs/ProductPhotoTab.tsx
    - src/features/manage-products/ui/ProductDetailDialog.tsx
    - src/shared/lib/result.ts
    - src/shared/lib/i18n/locales/es-MX/featMgmt.json
    - src/shared/lib/i18n/locales/en-US/featMgmt.json
    - e2e/products/product-photo-upload.spec.ts
    - vite.config.ts

key-decisions:
  - "Task 1: replace semantics stay exactly the upload pipeline's existing previousPath parameter — drop and paste both call the same handleFile() as the picker, so there is no second, divergent code path for any entry method (matches the threat register's T-31-14 mitigation)."
  - "Task 2: Remove's sequence clears products.photo_path BEFORE deleting the Storage object (mirrors the upload path's link-then-delete-old precedent) — a column-clear failure leaves the photo fully intact and retryable; a post-clear object-delete failure is a logged orphan, not a user-facing error, since nothing references the object anymore either way."
  - "Task 2: removed the whole-frame role=button/onClick affordance for the populated state (Plan 01's tracer-only workaround for having no Replace button yet) now that a dedicated Replace button exists — matches 31-UI-SPEC.md's photo-area populated-state contract exactly (frame is display-only; actions live in the button row)."
  - "Task 2: a single onStageChange callback on the upload mutation's input (rather than splitting resizePhoto/upload into two separate mutations) distinguishes the UI-SPEC's processing vs uploading loading rows with the smallest possible change to Plan 01's already-tested pipeline."
  - "[Rule 3 - Blocker] vite.config.ts: added e2e-results/, playwright-report/, e2e-blob-reports/ to server.watch.ignored — Vite's dev server was watching its own Playwright output directories; continuous trace/video writes during a run triggered HMR full-page-reloads mid-test, intermittently wiping in-progress dialog state (5 of 6 new specs failed with 'element not found' on a ~5-6 min unfixed run) and once produced an ERR_CONNECTION_REFUSED against an unrelated Plan 01 spec, proving server instability rather than a test-logic defect. After the fix: the full 11-test file went from 5-6 min with 5 flaky failures to a stable 2 min, 0 failures, across two consecutive clean runs."
  - "[Rule 3 - Blocker] Self-provisioned .env.local + a distinct E2E fixture PIN convention (100001/100002/100003/100004) via the Supabase CLI, matching a convention already live on the shared remote project mkvinyekkyennyegfoxq from a concurrent session/worktree — an earlier arbitrary PIN choice (100000/200000/300000/400000) was repeatedly clobbered back to the 100001-series convention mid-run by that concurrent process, causing spurious 'PIN incorrecto' login failures unrelated to any application code."

patterns-established:
  - "AppErrorCode additions continue one-code-per-failure-stage: PHOTO_REMOVE_FAILED joins Plan 01's PHOTO_TOO_LARGE/PHOTO_DECODE_FAILED/PHOTO_UPLOAD_FAILED/PHOTO_LINK_FAILED rather than overloading a generic code."

requirements-completed: [PCAT-03, PCAT-04]

coverage:
  - id: drag-drop-paste-entry-paths
    description: "D-09: OS picker, drag-and-drop, and clipboard paste (Photo-tab-scoped) all converge on the single validate->resize->upload->link pipeline; an unsupported type dropped or pasted produces a named, visible error rather than a silent log line"
    requirement: PCAT-03
    verification:
      - kind: unit
        ref: "src/features/manage-products/model/photo-file.test.ts (5 new extraction tests, 19/19 total)"
        status: pass
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts::drop, ::paste, ::unsupported type on drop"
        status: pass
    human_judgment: false
  - id: replace-and-remove
    description: "Replace writes a new uuid key and deletes the old one (never overwrites); Remove clears the column and deletes the object behind a destructive ConfirmDialog, never on a single click"
    requirement: PCAT-03
    verification:
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts::replace, ::remove"
        status: pass
    human_judgment: false
  - id: full-state-matrix
    description: "All eight rows of 31-UI-SPEC.md's Photo tab table are reachable and visually distinct: empty, drag-over, processing, uploading, populated, signed-URL loading, load-failed, and the inline validation/upload/link/remove error alert"
    requirement: PCAT-04
    verification:
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts (11/11 specs covering happy path, link failure, unsupported type, offline, drop, paste, replace, remove)"
        status: pass
      - kind: manual
        ref: "npm run typecheck / npm run lint clean over ProductPhotoTab.tsx"
        status: pass
    human_judgment: false
  - id: offline-and-connectivity-guard
    description: "Both the upload and remove paths check isOnline() before reading any file or issuing any Storage call; offline blocks with a clear inline+toast message and no request reaches the Storage endpoint"
    requirement: PCAT-03
    verification:
      - kind: e2e
        ref: "e2e/products/product-photo-upload.spec.ts::offline"
        status: pass
    human_judgment: false

duration: ~5.5h
completed: "2026-09-08"
status: complete
---

# Phase 31 Plan 04: Photo Tab Drag/Drop/Paste/Replace/Remove Summary

**All three D-09 entry paths (picker, drag-and-drop, clipboard paste) now converge on one upload pipeline, Replace and a confirmed Remove complete the photo lifecycle, and every state in the UI contract's Photo-tab table is reachable — proven by 11/11 green Playwright specs after root-causing a genuine Vite dev-server watch-storm that was intermittently breaking the E2E run.**

## Performance

- Duration: ~5.5h (includes a long environment-diagnosis detour: a shared-remote-project PIN race with a concurrent worktree agent, and a Vite dev-server HMR-reload-storm bug found and fixed via Playwright's own trace/log evidence)
- Tasks: 3/3 complete
- Files: 10 changed (0 created, 10 modified)

## Accomplishments

- `photo-file.ts`: `firstImageFromDataTransfer` / `firstImageFromClipboard`, duck-typed over a `DataTransferItemLike` shape so drag, paste, and unit tests all share one extractor. An unsupported-type item is still extracted (never silently dropped) so the caller's existing `validatePhotoFile` can name the offending type — the deliberate divergence from `agent-chat/FileDropZone`'s log-only precedent.
- `ProductPhotoTab.tsx`: drag-over state and handlers wired onto the drop zone (mirroring `FileDropZone`'s visual language), a `handleFile` pipeline shared by picker/drop/paste, an imperative handle (`forwardRef` + `useImperativeHandle`) so the dialog-level paste listener can feed it, Replace and destructive-Remove `POSButton`s below the populated frame, a destructive `ConfirmDialog` gating Remove, and an in-flight overlay that now distinguishes "processing" (resize) from "uploading"/"removing" via a mutation-input stage callback.
- `ProductDetailDialog.tsx`: `onPaste` on `DialogContent`, gated to `activeTab === 'photo'` so a paste into a Details or Links field is never intercepted.
- `useProductPhotoUpload.ts`: `onStageChange` callback added to the existing pipeline (no new mutation needed for processing/uploading); new `useRemoveProductPhoto` mutation (clear column -> delete object, matching the existing link-then-delete-old-object orphan-tolerant precedent), guarded by the same `isOnline()` check as upload.
- `result.ts`: `PHOTO_REMOVE_FAILED` code + `photoRemoveFailedError` factory, following Plan 01's one-code-per-failure-stage pattern.
- i18n: `photo.dropHere`, `.replace`, `.remove`, `.removed`, `.errorRemove`, `.removeConfirmTitle/Description/Label/CancelLabel` added to both locales, values from 31-UI-SPEC.md's Copywriting Contract verbatim.
- `e2e/products/product-photo-upload.spec.ts`: 6 new specs (drop, paste with the Details-tab negative case, replace with an old-object-download-fails proof, remove with cancel-then-confirm, unsupported-type-on-drop, offline) — 11/11 green in the full file.
- Found and fixed a real infrastructure bug (see Deviations): Vite's dev server was watching its own Playwright output directories, causing HMR reload storms that intermittently broke long E2E runs.

## Task Commits

1. `01dc683` (test — RED) — 5 failing tests for `firstImageFromDataTransfer`/`firstImageFromClipboard` in `photo-file.test.ts`. Verified RED (module exports missing) before committing.
2. `f23e885` (feat — GREEN) — the extraction helpers, drag-and-drop wiring on `ProductPhotoTab`, the Photo-tab-scoped paste listener on `ProductDetailDialog`, `photo.dropHere` i18n. 19/19 unit tests pass.
3. `cf74066` (feat) — Replace/Remove buttons, `useRemoveProductPhoto`, `PHOTO_REMOVE_FAILED`, the processing/uploading stage split, remaining i18n keys. `npm run typecheck`/`lint` clean, 40/40 unit tests in `model/`.
4. `bbe6e2b` (test) — 6 new E2E specs plus the `vite.config.ts` watch-ignore fix (Rule 3 blocker) that made the full 11-spec file reliably green.

## Files Created/Modified

**Modified:**
- `src/features/manage-products/model/photo-file.ts` (`firstImageFromDataTransfer`, `firstImageFromClipboard`, `DataTransferItemLike`)
- `src/features/manage-products/model/photo-file.test.ts` (+5 tests, 19 total)
- `src/features/manage-products/model/useProductPhotoUpload.ts` (`onStageChange`, `useRemoveProductPhoto`)
- `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx` (drag-and-drop, paste handle, Replace/Remove, full state matrix)
- `src/features/manage-products/ui/ProductDetailDialog.tsx` (Photo-tab-scoped `onPaste`)
- `src/shared/lib/result.ts` (`PHOTO_REMOVE_FAILED`, `photoRemoveFailedError`)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featMgmt.json` (`photo.dropHere`/`replace`/`remove`/`removed`/`errorRemove`/`removeConfirm*`)
- `e2e/products/product-photo-upload.spec.ts` (+6 specs, 11 total)
- `vite.config.ts` (`server.watch.ignored` — Rule 3 deviation, see below)

## Decisions Made

- Drop and paste both route through the exact same `handleFile()` the picker uses (no second pipeline) — the imperative-handle pattern was chosen over lifting the mutation state up into `ProductDetailDialog` so the Photo tab keeps owning its own upload state, matching Plan 01/02's existing ownership boundaries.
- Remove clears the DB column before deleting the Storage object, mirroring the existing replace-path ordering (link then delete-old) — keeps exactly one failure-tolerance pattern for "the reference and the object can only ever diverge in the direction of an orphan, never a broken link."
- The processing/uploading state split uses a callback on the mutation input rather than a second mutation, keeping Plan 01's already-tested pipeline as the single source of truth for the upload sequence.
- Dropped the populated-state whole-frame click-to-replace affordance now that a real Replace button exists, matching 31-UI-SPEC.md's photo-area contract precisely rather than carrying forward Plan 01's tracer-only workaround.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Vite dev-server HMR reload storm during long Playwright runs**
- **Found during:** Task 3, verifying the new E2E specs.
- **Issue:** `vite.config.ts`'s `server.watch` only ignored `src-tauri/**`. Playwright continuously writes trace/video/screenshot artifacts into `e2e-results/` (and blob/HTML reports into `e2e-blob-reports/`/`playwright-report/`) *during* a running test session — all inside the Vite-watched project root. Vite's fs watcher treated these writes as source changes, triggering HMR full-page-reloads mid-test. Over a long (5-6 min) full-suite run this reliably wiped in-progress dialog/form state partway through, producing "element not found" failures on 5 of 6 new specs, and once destabilized the dev server enough to produce a genuine `ERR_CONNECTION_REFUSED` against an unrelated, previously-passing Plan 01 spec — proof the instability was server-side, not test-logic.
- **Fix:** Added `e2e-results/**`, `playwright-report/**`, `e2e-blob-reports/**` to `server.watch.ignored` alongside the existing `src-tauri/**` entry.
- **Files modified:** `vite.config.ts`.
- **Verification:** Before the fix: repeated full-suite runs consistently landed at "5 failed" (always the same 5: drop/paste/replace/remove/unsupported-type-on-drop) or similar, 5-6 min runtime. After the fix, two consecutive full clean runs both reported 11/11 passed, 2.0 min runtime — confirms both the reliability fix and the root-cause diagnosis (a watch-triggered reload was consuming the extra 3-4 minutes too).
- **Commit:** `bbe6e2b`.

**2. [Rule 3 - Blocker] Self-provisioned `.env.local` + adopted a concurrently-established E2E fixture PIN convention**
- **Found during:** Setup, before Task 3's E2E verification, and again mid-diagnosis.
- **Issue:** This worktree had no `.env.local` (gitignored, not carried over). Self-provisioned via the Supabase CLI against the same shared remote project (`mkvinyekkyennyegfoxq`) Plans 01/02 used. An initial arbitrary PIN choice (`100000`/`200000`/`300000`/`400000`) was applied via `npm run setup:dev-users`, but was found reset to a *different*, internally-consistent convention (`100001`/`100002`/`100003`/`100004`) between test runs — evidence of a concurrent process (almost certainly the sibling 31-03 worktree agent, or a leftover session) writing its own convention to the same shared fixture accounts by name. Fighting this with repeated overwrites was unproductive; adopting the other convention (re-running `setup:dev-users` with matching values) stopped the clobbering.
- **Fix:** `.env.local` written with `E2E_ADMIN_PIN=100001` / `E2E_MANAGER_PIN=100002` / `E2E_BARTENDER_PIN=100003` / `E2E_KITCHEN_PIN=100004`, matching the value already live on the shared project at the time of the final successful run.
- **Files modified:** `.env.local` (gitignored, not committed).
- **Verification:** All subsequent logins in this session succeeded; final full-suite run reported 11/11 passed with no PIN-related failures.

**Total deviations:** 2 auto-fixed (both Rule 3 environment/infrastructure blockers — one a genuine, previously-undiagnosed project bug fixed with a scoped config change; one a shared-test-project credential race resolved by convergence, not code change). **Impact:** both were necessary to reach a genuinely reliable, tested implementation; neither required an architectural decision or user input. The `vite.config.ts` fix benefits every future E2E run in this project, not just this plan's specs.

### Pre-existing, out of scope

- None newly observed this plan beyond the two deviations above (both already documented as fixes, not left as pre-existing issues).

## Issues Encountered

None beyond the deviations above (all resolved).

## User Setup Required

None — no external service configuration required. The `.env.local` self-provisioning (Deviation 2) is gitignored, worktree-local, and reuses the same remote project Plans 01/02 already established; the fixture-account PIN convention now converges with whatever concurrent session last wrote it, so a future worktree hitting the same clobbering pattern should likewise re-query the live values via the service-role client rather than assuming a fixed convention.

## Next Phase Readiness

Plan 05 (RLS denial proof, per the threat register's T-31-15 note) can build directly on:
- `useRemoveProductPhoto` and the Replace path's delete-old-object call as the two Storage-delete call sites to prove `manage_products`-gated denial against.
- The full Photo-tab state matrix and both destructive confirmations (`ConfirmDialog` for Remove, matching Discard's pattern from Plan 02) as stable, tested UI to assert RBAC-driven visibility/disabled states against, if Plan 05's scope touches the UI layer at all.

## Self-Check: PASSED

All 10 modified files confirmed present on disk with the expected changes; all 4 commit hashes (`01dc683`, `f23e885`, `cf74066`, `bbe6e2b`) confirmed in `git log`. Working tree clean. No leftover `TestPhotoProduct-E2E` row in the remote database after the final E2E run.

---
*Phase: 31-product-catalog-detail-photo-upload*
*Completed: 2026-09-08*
