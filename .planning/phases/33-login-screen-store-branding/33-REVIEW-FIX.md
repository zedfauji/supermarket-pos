---
phase: 33-login-screen-store-branding
fixed_at: 2026-09-11T12:24:00Z
review_path: .planning/phases/33-login-screen-store-branding/33-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 33: Code Review Fix Report

**Fixed at:** 2026-09-11
**Source review:** .planning/phases/33-login-screen-store-branding/33-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 5
- Fixed: 5
- Skipped: 0
- Out of scope (Info, not requested): 1 (IN-01)

## Fixed Issues

### CR-01: Read-merge-write can permanently blank storeName/address/timezone/currency on the next logo upload or remove

**Files modified:** `src/entities/settings/model/queries.ts`
**Commit:** `60cd552`
**Applied fix:** `parseGeneral()` no longer collapses the entire `general` settings blob to `DEFAULT_GENERAL` when any single field fails `GeneralSettingsSchema.safeParse`. It now falls back field-by-field (per the REVIEW.md suggested fix), so a single invalid field (e.g. a blanked `address`) can no longer erase the sibling `storeName`/`timezone`/`currency`/`receiptFooterText`/`storeLogoPath` values. `parseGeneral()` is used solely inside `toSnapshot()`, which is the single shared read path behind `useSettings()` — the same query-cache entry `useStoreLogoUpload`/`useRemoveStoreLogo` read via `currentGeneralSnapshot()` before their read-merge-write. Fixing the one shared parse function closes the hole for every caller, not just the logo pipeline.

### CR-02: Login-hero logo permanently shows the broken-image icon after any single failed load

**Files modified:** `src/entities/settings/ui/StoreLogoImage.tsx`
**Commit:** `be4d3d1`
**Applied fix:** Added a `useEffect` keyed on `url` that resets `imgFailed` to `false` whenever the resolved signed URL changes (TTL refresh, retry, or an entirely new logo path). Previously `imgFailed` was plain `useState` with nothing to reset it, so one failed `<img>` load permanently gated every future render to the `ImageOff` icon for the rest of the mount — a real risk for the kiosk-style, long-lived login screen this component targets. Needed an `eslint-disable`/`-enable` pair for `react-hooks/set-state-in-effect` (same accepted pattern already used in `GeneralSettingsTab.tsx`'s own `imgFailed` resets).

### WR-01: Newly-uploaded logo object is silently orphaned (unlogged) when the link write fails

**Files modified:** `src/entities/settings/model/useStoreLogoUpload.ts`
**Commit:** `828e1e5`
**Applied fix:** On link-step failure, the mutation now attempts `supabase.storage.from(STORE_BRANDING_BUCKET).remove([path])` for the just-uploaded object, and logs `settings.store_logo.unlinked_object_orphaned` via `logger.warn` if that cleanup also fails — matching the existing orphan-tolerant/logged precedent already used for the old-object delete path.

### WR-02: Client-side `MAX_LOGO_UPLOAD_BYTES` (10MB) is 5x the server-side Storage backstop (2MB)

**Files modified:** `src/entities/settings/model/store-logo-file.ts`, `src/shared/lib/i18n/locales/en-US/wAdmin.json`, `src/shared/lib/i18n/locales/es-MX/wAdmin.json`
**Commits:** `242f7cb` (limit), `577e349` (stale copy correction, bundled with WR-03)
**Applied fix:** Lowered `MAX_LOGO_UPLOAD_BYTES` from `10 * 1024 * 1024` to `2 * 1024 * 1024`, matching the `store-branding` bucket's server-side `file_size_limit` (2097152 bytes) exactly. This is a stricter, simpler fix than the review's alternative (a post-resize size check) and removes the possibility of a full decode+resize round-trip ending in a generic Storage rejection. Discovered as a direct consequence: `GeneralSettingsTab.tsx`'s `logoHint` and `logoErrorTooLarge` copy hardcoded "10 MB"/"máximo 10 MB" in both locales — left uncorrected this would have been user-facing misinformation, so it was corrected to "2 MB" in the same fix pass (see WR-03 commit).

### WR-03: Unmapped `AppErrorCode`s surface raw, untranslated `error.message` to the admin

**Files modified:** `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx`, `src/shared/lib/i18n/locales/en-US/wAdmin.json`, `src/shared/lib/i18n/locales/es-MX/wAdmin.json`
**Commit:** `577e349`
**Applied fix:** Added a new `generalSettingsTab.logoErrorGeneric` translation key to both locale files and switched `logoErrorCopyFor`'s `default` branch to return it instead of the raw `error.message`, keeping this component consistent with the layer's `i18next/no-literal-string: error` enforcement.

## Skipped Issues

None — all 5 in-scope (Critical + Warning) findings were fixed.

## Out-of-Scope Findings (not attempted)

### IN-01: `store_branding_select` policy permits anonymous listing of every object in the bucket, including orphans

Info-level, explicitly excluded from this fix pass's scope (`critical_warning`) per the task instructions. The review itself frames this as "worth a note for a future cleanup job, not a blocker" — not a vulnerability, since every object in the single-purpose `store-branding` bucket is non-sensitive branding imagery by design.

## Verification

All verification ran in an isolated git worktree (`gsd-reviewfix/33-3702`, fast-forward-merged into `main` at commit `577e349`), then re-confirmed in the main checkout after worktree teardown:

- `npx tsc --noEmit` — clean, 0 errors, both after each individual fix and on the full repo.
- `npx eslint` on every touched file/directory — clean (only pre-existing, unrelated boundaries-plugin config warnings).
- `npx vitest run` — `src/shared/lib/domain.test.ts`, `src/entities/settings/model/store-logo-file.test.ts`, `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx` — 83/83 passed. (`.integration.test.ts` files require a running local Supabase instance and were correctly out of scope for this pass.)

**Incident during worktree cleanup (fully resolved, no lasting effect):** the isolated worktree's `node_modules` was set up as a Windows junction to the main checkout's real `node_modules` (standard practice for these worktrees, to avoid a slow `npm ci` per run). `git worktree remove --force` partially recursed through that junction while tearing down the worktree and deleted a portion of the main checkout's real `node_modules` (confirmed: `.bin` and several `@scope` package directories were missing immediately afterward) before failing with `Invalid argument`. This was caught before finishing the task: the junction itself was intact throughout (confirmed via `fs.lstatSync`), so it was safely unlinked (not recursively removed), and the damaged `node_modules` was fully repaired via `npm install --legacy-peer-deps` (the project's documented install command) plus one explicit `npm install @testing-library/dom@10.4.1 --no-save` to restore a required peer dependency that the resolver dropped on the first pass. `package.json` and `package-lock.json` are both back to their original committed state (`git status` clean for both) — the only lasting change is the `node_modules` directory contents, which now match what `npm install --legacy-peer-deps` produces from the unmodified lockfile. Full `tsc`/`eslint`/`vitest` re-runs after the repair confirmed no regression, including a spot-check of unrelated widget test files that were transiently broken mid-repair.

---

_Fixed: 2026-09-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
