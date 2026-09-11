---
phase: 33-login-screen-store-branding
plan: 02
subsystem: storage
tags: [supabase-storage, rls, zod, tanstack-query, vitest]

# Dependency graph
requires:
  - phase: 33-login-screen-store-branding
    provides: "plan 33-01's GeneralSettingsSchema.storeLogoPath field + anon-scoped settings read policy, which this plan's write path and signed-URL resolver build on"
provides:
  - "store-branding Storage bucket (private) + RLS: INSERT/UPDATE/DELETE gated on manage_settings, SELECT open to anon+authenticated (migration 20260911000002)"
  - "store-logo-file.ts: validateStoreLogoFile/targetLogoDimensions/resizeStoreLogo/storeLogoObjectPath (pure) + signStoreLogo/useStoreLogoUrl (Option B signed-URL resolver+cache)"
  - "useStoreLogoUpload.ts: useStoreLogoUpload/useRemoveStoreLogo — read-merge-write mutations against the whole general settings blob"
  - "Both new modules re-exported through @entities/settings for pages/login and widgets/SettingsTabsPanel"
affects: [33-03-logo-upload-ui-and-verification]

actuals:
  tokens: 7100
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Private Storage bucket + anon-scoped SELECT RLS policy (bucket_id predicate only, no permission join) so a pre-auth screen can sign a URL — same shape as the settings-table anon SELECT policy from plan 01, applied to storage.objects"
    - "Read-merge-write against a whole-blob JSONB settings column: read the cached snapshot via queryClient.getQueryData before spreading it into a write, rather than trusting a partial payload"

key-files:
  created:
    - supabase/migrations/20260911000002_store_branding_storage.sql
    - src/entities/settings/model/store-logo-file.ts
    - src/entities/settings/model/store-logo-file.test.ts
    - src/entities/settings/model/useStoreLogoUpload.ts
  modified:
    - src/entities/settings/model/index.ts
    - src/entities/settings/index.ts

key-decisions:
  - "Task 1 checkpoint (store-branding bucket visibility) was pre-resolved by the user before execution: Option B — private bucket with an anonymous SELECT policy, not the plan's Option-A default (public bucket + synchronous getPublicUrl). Recorded here as decided, no prompt was issued."
  - "Under Option B, the plan's default storeLogoPublicUrl(path): string|null export does not exist. It is replaced by signStoreLogo(path): Promise<Result<string>> (async, wraps createSignedUrl, never throws) plus useStoreLogoUrl(path) — a TanStack Query hook keyed ['store-logo-url', path] with SIGNED_URL_TTL_SECONDS/SIGNED_URL_STALE_TIME_MS copied verbatim from src/entities/product/model/resolveProductImage.ts. This is the one place this plan's shipped code differs from the frontmatter's artifacts.exports list (which enumerates storeLogoPublicUrl, written before the checkpoint was resolved)."
  - "33-RESEARCH.md's Architectural Responsibility Map 'Signed-URL minting/caching' row was re-checked against Option B and found still accurate (private bucket, server-side signing, TTL-cached client read) — left unchanged, confirmed via git diff --stat showing 0 changed lines in that file across both task commits."
  - "signStoreLogo/useStoreLogoUrl live inside store-logo-file.ts rather than a separate entities/settings/model/resolveStoreLogo.ts file, because 33-02-PLAN.md's files_modified list only names store-logo-file.ts for this role (33-PATTERNS.md's suggested separate resolveStoreLogo.ts file was not adopted by the plan actually executed)."

requirements-completed: [STORE-01]

coverage:
  - id: D1
    description: "store-branding Storage bucket (private, 2MB backstop, jpeg/png/webp only) + RLS: INSERT/UPDATE/DELETE gated on manage_settings via role_permissions EXISTS join, SELECT open to anon+authenticated with a bucket_id-only predicate — applied to the local database"
    requirement: "STORE-01"
    verification:
      - kind: integration
        ref: "npx supabase migration up --local (20260911000002 applied); npx supabase migration list --local confirms it"
        status: pass
      - kind: integration
        ref: "psql: storage.buckets row for store-branding (public=f, file_size_limit=2097152, allowed_mime_types=jpeg/png/webp) and pg_policies for storage.objects (store_branding_select{anon,authenticated}, store_branding_insert/update/delete{authenticated})"
        status: pass
    human_judgment: false
  - id: D2
    description: "store-logo-file.ts pure pipeline: validateStoreLogoFile (MIME allow-list, 10MB cap, unknownType sentinel), targetLogoDimensions (800px max edge, D-07), resizeStoreLogo (WebP-preferred/JPEG-fallback canvas re-encode), storeLogoObjectPath (uuid-only key, no file-name segment)"
    requirement: "STORE-01"
    verification:
      - kind: unit
        ref: "src/entities/settings/model/store-logo-file.test.ts (16 tests, all pass)"
        status: pass
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: unit
        ref: "npm run lint"
        status: pass
    human_judgment: false
  - id: D3
    description: "signStoreLogo (async signed-URL resolver, Option B) + useStoreLogoUrl (TanStack Query cache hook, keyed by path, TTL/staleTime copied from resolveProductImage.ts)"
    requirement: "STORE-01"
    verification:
      - kind: unit
        ref: "src/entities/settings/model/store-logo-file.test.ts#signStoreLogo, #useStoreLogoUrl"
        status: pass
    human_judgment: false
  - id: D4
    description: "useStoreLogoUpload/useRemoveStoreLogo: isOnline guard, validate/resize/upload sequence with upsert:false, read-merge-write link step against the cached general settings snapshot (fails with the link error rather than writing a partial blob when no snapshot is cached), orphan-tolerant delete-previous-object-last with logger.warn"
    requirement: "STORE-01"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: unit
        ref: "npm run lint"
        status: pass
      - kind: other
        ref: "grep-asserted acceptance criteria: upsert: false (1), isOnline (4 occurrences: import + 2 guards + usage), storeLogoPath: (2, set+clear), logger.warn (2), crypto.randomUUID (1), no file.name/.name} usage (0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No unit-level UI/E2E proof that the mutations wire correctly into a real component — this plan ships hooks only, no UI. Full end-to-end proof (upload through the Settings tab, login hero rendering) is plan 33-03's scope."
    human_judgment: true
    rationale: "Deliberately out of scope for this plan per its own objective ('No UI in this plan'). Not a gap to close here — plan 33-03 owns the UI wiring and its own Playwright coverage."

duration: ~40min
completed: 2026-09-11
status: complete
---

# Phase 33 Plan 02: Login Screen Store Branding (store-logo storage layer) Summary

**Private `store-branding` Storage bucket with an anon-readable RLS SELECT policy (Option B, mirroring Phase 31's product-photos shape), plus a validate/downscale/upload/link pipeline (`store-logo-file.ts` + `useStoreLogoUpload.ts`) that read-merge-writes the whole-blob `general` settings JSONB so a logo upload never blanks the store's other settings fields.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-11
- **Completed:** 2026-09-11
- **Tasks:** 3 of 3 completed (Task 1 pre-resolved as a decision record, no code)
- **Files modified:** 6 (1 new migration, 3 new TS files, 2 barrel updates)

## Accomplishments

- **Task 1 (decision, pre-resolved):** the "store-logo bucket visibility" checkpoint was decided by the user before execution — **Option B: private bucket with an anonymous SELECT policy** — rather than the plan's Option-A default (public bucket + synchronous `getPublicUrl`). No prompt was issued; the decision is recorded here as already resolved, and execution proceeded straight to Task 2 using Option B's implementation path throughout.
- **Task 2:** `supabase/migrations/20260911000002_store_branding_storage.sql` — `store-branding` bucket (private, 2 MB server-side backstop, jpeg/png/webp only, `ON CONFLICT DO NOTHING`), four RLS policies on `storage.objects` (`store_branding_select` `TO anon, authenticated` with a `bucket_id`-only predicate — the Option-B widening from Phase 31's `authenticated`-only shape — and `store_branding_insert`/`_update`/`_delete` `TO authenticated` gated on `manage_settings` via the `role_permissions` EXISTS join, each preceded by `DROP POLICY IF EXISTS`). Applied to the local database (`npx supabase migration up --local`) and verified via a direct `psql` read of `storage.buckets`/`pg_policies`. 33-RESEARCH.md's Architectural Responsibility Map "Signed-URL minting/caching" row was re-checked against Option B and left unchanged (still accurate) — confirmed via `git diff --stat` showing zero changed lines in that file.
- **Task 3:** `src/entities/settings/model/store-logo-file.ts` — pure `validateStoreLogoFile`/`targetLogoDimensions`/`resizeStoreLogo`/`storeLogoObjectPath` adapted from `photo-file.ts` (800px max edge per D-07, `crypto.randomUUID()`-only object keys, no file-name segment), plus Option B's `signStoreLogo`/`useStoreLogoUrl` (async signed-URL resolver + TanStack Query cache hook, TTL/staleTime copied verbatim from `resolveProductImage.ts`). `src/entities/settings/model/useStoreLogoUpload.ts` — `useStoreLogoUpload`/`useRemoveStoreLogo`, adapted from `useProductPhotoUpload.ts`: `isOnline()` guard → validate → resize → Storage upload (`upsert: false`) → **read-merge-write** the cached `general` settings snapshot (spreads the current blob before writing `storeLogoPath`, fails with the link/remove error rather than writing a partial blob when no snapshot is cached) → orphan-tolerant delete-previous-object-last (`logger.warn`, never user-facing). Both new modules re-exported through `entities/settings/model/index.ts` and `entities/settings/index.ts`. 16 new unit tests in `store-logo-file.test.ts` (mirroring `photo-file.test.ts`'s structure plus `resolveProductImage.test.ts`'s Storage-mocking pattern for the signing/hook tests) — all pass.

## Task Commits

1. **Task 1 (decision, no code) + Task 2: Create and apply the store-branding bucket migration** - `0f8ef69` (feat)
2. **Task 3: Store-logo file pipeline — validate, downscale, mint key, upload, link** - `6221296` (feat)

## Files Created/Modified
- `supabase/migrations/20260911000002_store_branding_storage.sql` - store-branding bucket + RLS (Option B: anon-readable SELECT, manage_settings-gated writes)
- `src/entities/settings/model/store-logo-file.ts` - validate/resize/path-mint pure helpers + signStoreLogo/useStoreLogoUrl (Option B)
- `src/entities/settings/model/store-logo-file.test.ts` - 16 unit tests
- `src/entities/settings/model/useStoreLogoUpload.ts` - useStoreLogoUpload/useRemoveStoreLogo mutations
- `src/entities/settings/model/index.ts` - re-exports the new symbols
- `src/entities/settings/index.ts` - re-exports the new symbols through the top-level entity barrel

## Decisions Made

See `key-decisions` in the frontmatter above (Task 1's pre-resolved Option B, the `storeLogoPublicUrl` → `signStoreLogo`/`useStoreLogoUrl` divergence, the RESEARCH.md row re-check, and the `resolveStoreLogo.ts`-vs-`store-logo-file.ts` file-placement note).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a stray "1200" literal from a code comment that broke an acceptance-criteria grep**

- **Found during:** Task 3, running the plan's own acceptance-criteria greps after implementation
- **Issue:** `MAX_EDGE_PX`'s explanatory comment originally read `// D-07: hero login display, not close-up product inspection (Phase 31 used 1200)`. The plan's acceptance criteria require `grep -c "1200" src/entities/settings/model/store-logo-file.ts` to equal 0 (proving the 1200px product-photo constant was not accidentally carried over) — the comment's literal `1200` failed that check even though the actual constant value (800) was correct.
- **Fix:** Reworded the comment to describe the difference without repeating the literal number (`smaller than Phase 31's product-photo constant`).
- **Files modified:** `src/entities/settings/model/store-logo-file.ts`
- **Verification:** `grep -c "1200" src/entities/settings/model/store-logo-file.ts` now returns 0; `grep -c "800"` still returns 3 (constant + two D-07 comments).
- **Committed in:** `6221296` (Task 3 commit — fixed before the file was ever committed, no separate fix commit)

**2. [Rule 1 - Bug] Extracted a duplicated literal string into a named constant to satisfy `i18next/no-literal-string`**

- **Found during:** Task 3, `npm run lint`
- **Issue:** `photoLinkFailedError('No cached general settings snapshot to merge into')` and the equivalent `photoRemoveFailedError(...)` call each passed a literal string directly as an argument, which `i18next/no-literal-string` flags even though the string is an `AppError.detail` value (log-only, never shown to the user per `result.ts`'s own doc-comment) rather than UI copy.
- **Fix:** Extracted the string into a `NO_CACHED_SNAPSHOT_DETAIL` constant inside the file's existing `eslint-disable i18next/no-literal-string` block (already covering the MIME-type literals and the settings query-key literal), and reused it at both call sites plus their paired `logger.error` calls.
- **Files modified:** `src/entities/settings/model/useStoreLogoUpload.ts`
- **Verification:** `npm run lint` clean (0 errors, 0 warnings).
- **Committed in:** `6221296` (Task 3 commit — fixed before the file was ever committed, no separate fix commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs, both cosmetic/lint fixes caught before commit)
**Impact on plan:** Neither affected runtime behavior. No scope creep.

## Issues Encountered

None. The local Supabase stack was confirmed reachable (`npx supabase status`) and plan 01's migration (`20260911000001`) was already applied before this plan started, so Task 2's precondition was met on the first check — no halt was needed this session.

## User Setup Required

None - no external service configuration required. (Docker Desktop / local Supabase was already running.)

## Next Phase Readiness

- **Ready for plan 33-03 (logo upload UI + verification).** The Storage bucket, RLS, validate/resize/upload/link pipeline, and the Option-B signed-URL resolver hook (`useStoreLogoUrl`) are all in place and unit-tested. Plan 03 can build the `GeneralSettingsTab` upload control and the login-hero `StoreLogoImage` component directly against `useStoreLogoUpload`/`useRemoveStoreLogo`/`useStoreLogoUrl`, all importable from `@entities/settings`.
- **Important for plan 03's implementation:** because Option B was chosen, the login-hero logo component must use the **async** `useStoreLogoUrl(path)` hook (loading/error states apply) rather than a synchronous `storeLogoPublicUrl(path)` string — 33-UI-SPEC.md's loading-state guidance for the hero logo should be read with this in mind if it was drafted assuming Option A.
- No E2E/RLS-boundary spec was written in this plan (out of scope — "No UI in this plan"); 33-RESEARCH.md's Wave 0 Gap `e2e/settings/store-branding-rls.spec.ts` remains open for plan 03 or a later verification pass to close against the now-live `store-branding` bucket policies.

---
*Phase: 33-login-screen-store-branding*
*Completed: 2026-09-11*
