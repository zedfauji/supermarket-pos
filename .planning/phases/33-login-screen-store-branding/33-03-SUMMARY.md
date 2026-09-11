---
phase: 33-login-screen-store-branding
plan: 03
subsystem: ui
tags: [react, i18n, playwright, supabase-storage, rls]

# Dependency graph
requires:
  - phase: 33-login-screen-store-branding
    provides: "plan 01's storeName rename + anon-scoped settings read; plan 02's store-branding Storage bucket, validate/resize/upload pipeline, and the Option-B signStoreLogo/useStoreLogoUrl signed-URL resolver"
provides:
  - "GeneralSettingsTab store-logo upload control (80px dropzone, drag/drop/paste-ready markup, choose/replace/remove, inline+toast error copy, ConfirmDialog remove)"
  - "StoreLogoImage entity component (entities/settings/ui) — async signed-URL image with Skeleton/ImageOff states, sibling to the receipt-only widgets/LogoImage"
  - "LoginPage hero tile now renders the uploaded store logo (falls back to ShoppingBasket when unset)"
  - "22 new generalSettingsTab.logo* i18n keys (es-MX/en-US) + login.logoAlt"
  - "e2e/settings/store-branding.spec.ts extended with the full upload/reject/remove/save-preserves-path flow"
  - "e2e/settings/store-branding-rls.spec.ts — cashier/anon Storage-write denial + anon settings-read scope proof"
  - "e2e/visual/login-branding-baseline.spec.ts — configured/unconfigured login-aside baselines + hero-size boundingBox measurement"
affects: []

actuals:
  tokens: 11800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Settings-form logo control commits on its own action, independent of the text-field dirty/Save flow (mirrors Phase 31's Photo tab)"
    - "Async signed-URL image component (StoreLogoImage) kept as a separate entity component from a base64-data-URL sibling (widgets/LogoImage) rather than parameterizing one component over two source shapes"

key-files:
  created:
    - src/entities/settings/ui/StoreLogoImage.tsx
    - e2e/settings/store-branding-rls.spec.ts
    - e2e/visual/login-branding-baseline.spec.ts
  modified:
    - src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx
    - src/entities/settings/index.ts
    - src/pages/login/index.tsx
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/pages.json
    - src/shared/lib/i18n/locales/en-US/pages.json
    - e2e/settings/store-branding.spec.ts

key-decisions:
  - "Built against plan 02's Option-B (private bucket + anon SELECT policy) async resolver shape throughout — StoreLogoImage and the settings-tab preview both call useStoreLogoUrl(path) (TanStack Query, loading/error states), not a synchronous getPublicUrl string. No Option-A code was written."
  - "errorCopyFor's unsupported-type/decode-failure branches interpolate the raw declared MIME type (including the 'unknownType' sentinel in the rare empty-File.type case) directly, rather than adding a 23rd 'unknown type' i18n key — the plan's Copywriting Contract enumerates exactly 22 generalSettingsTab.logo* keys and the acceptance criteria assert that count."
  - "The settings-tab logo tile's drag-over state announces generalSettingsTab.logoDropHere via an sr-only span rather than visible overlay text — the tile is 80px (unlike Phase 31's 320px Photo-tab dropzone), too small to typeset a sentence over without visually breaking."

requirements-completed: [STORE-01, STORE-02, STORE-03]

coverage:
  - id: D1
    description: "Store-logo upload control in GeneralSettingsTab: 80px dropzone (choose/drag/drop), Replace/Remove buttons, processing/uploading/signed-URL-loading states, inline role=alert + toast error copy for every AppErrorCode branch (unsupported type, too large, decode, upload, link, remove, offline, load), destructive ConfirmDialog for Remove — all inside the existing manage_settings gate, logo commits independent of the Save-General text-field flow"
    requirement: "STORE-01"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: unit
        ref: "npm run lint"
        status: pass
      - kind: e2e
        ref: "e2e/settings/store-branding.spec.ts#store logo: upload renders on the login hero, an unsupported type is rejected, Remove clears it, and saving General text fields leaves storeLogoPath untouched"
        status: pass
    human_judgment: false
  - id: D2
    description: "StoreLogoImage entity component and the login hero wiring: LoginPage's configured hero tile renders the uploaded logo via an async signed-URL resolver (Skeleton while resolving, ImageOff on load failure, ShoppingBasket fallback when unset); widgets/LogoImage (receipt-only) left byte-identical"
    requirement: "STORE-02"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: unit
        ref: "npm run lint"
        status: pass
      - kind: e2e
        ref: "e2e/settings/store-branding.spec.ts#store logo: ... (login-store-logo visible with non-empty src after upload; fallback icon after Remove)"
        status: pass
      - kind: other
        ref: "git diff --name-only -- src/widgets/LogoImage/index.tsx (0 lines)"
        status: pass
    human_judgment: false
  - id: D3
    description: "STORE-03 automated coverage: functional upload/reject/remove/save-preserves-path flow (extended store-branding.spec.ts), database-level RLS boundary on the store-branding bucket + the widened anon settings read (new store-branding-rls.spec.ts), and paired visual baselines with a hero-size boundingBox measurement (new login-branding-baseline.spec.ts) — no manual/human-check anywhere"
    requirement: "STORE-03"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/settings/store-branding.spec.ts e2e/settings/store-branding-rls.spec.ts (13 passed, 0 failed — twice consecutively)"
        status: pass
      - kind: e2e
        ref: "npm run test:e2e:visual -- e2e/visual/login-branding-baseline.spec.ts (2 passed on re-run against existing baselines)"
        status: pass
    human_judgment: false

duration: ~2h (not machine-timed from a recorded start; includes full read of both prior plans' summaries, three e2e/local-Supabase debugging cycles)
completed: 2026-09-11
status: complete
---

# Phase 33 Plan 3: Login Screen Store Branding (logo upload UI + STORE-03 coverage) Summary

**Store-logo upload control in Settings → General wired to plan 02's async signed-URL pipeline, a new `StoreLogoImage` entity component rendering the logo hero-size on the pre-auth login screen, 22 new i18n keys across two locales, and three green Playwright specs (functional, RLS-boundary, visual-regression) proving STORE-03 end to end with zero manual verification.**

## Performance

- **Duration:** ~2h (session-length estimate; PLAN_START_TIME was not captured)
- **Completed:** 2026-09-11
- **Tasks:** 3 of 3 completed
- **Files modified:** 11 (3 new, 8 modified)

## Accomplishments

- **Task 1:** `GeneralSettingsTab.tsx` gained a `md:col-span-2` logo row directly below the `storeName` field — an 80px dropzone tile (dashed/empty → solid/populated, `role="button" tabIndex={0}`, keyboard + drag entry), a hidden file input wired to `useStoreLogoUpload`/`useRemoveStoreLogo` from `@entities/settings`, Choose/Replace/Remove `POSButton`s, a `LoadingSpinner` overlay for processing/uploading, a `Skeleton` for the (currently unreachable but defensively rendered) signed-URL-still-resolving state, an `errorCopyFor(AppError)` switch covering all 7 `PHOTO_*`/`VALIDATION_ERROR`/`NETWORK_OFFLINE` codes, and a destructive `ConfirmDialog` for Remove. 22 new `generalSettingsTab.logo*` keys added verbatim to both `wAdmin.json` locales (node key-parity check: 22/22/true).
- **Task 2:** New `src/entities/settings/ui/StoreLogoImage.tsx` — mirrors `widgets/LogoImage`'s props contract (`className`/`alt`/`fallback`) but reads `general.storeLogoPath` and resolves it through plan 02's `useStoreLogoUrl` (Option B: private bucket + anon SELECT, async signed URL). Renders `fallback` when unset, a `Skeleton` while the URL resolves, a centered `ImageOff` on `<img onError>`, and the real `<img data-testid="login-store-logo" object-contain>` otherwise. `LoginPage`'s configured hero tile now renders `<StoreLogoImage>` with a hero-size `ShoppingBasket` fallback instead of the plan-01 placeholder icon; the mobile header and unconfigured branch are untouched. New `login.logoAlt` key in both `pages.json` locales.
- **Task 3:** Extended `e2e/settings/store-branding.spec.ts` with one comprehensive serial-flow test: admin uploads a logo (preview appears, `storeLogoPath` lands at `store/<uuid>.<ext>`, every sibling field preserved), the pre-auth login screen renders it, an `image/heic` attach is rejected inline with `storeLogoPath` unchanged, Remove clears it behind the `alertdialog` confirm and the login screen reverts to the hero-size fallback icon, and a subsequent store-name Save leaves `storeLogoPath` untouched. New `e2e/settings/store-branding-rls.spec.ts` mirrors `product-photo-rls.spec.ts`'s structure: cashier and anonymous `upload`/`update`/`remove` against the `store-branding` bucket are all denied (paired with service-client ground-truth reads), an anonymous client *can* sign the seeded object (Option B's intentional widened SELECT), an admin positive control proves the bucket itself isn't broken, and an anonymous `settings` read is proven scoped to `key='general'` only (`billing`/`near_expiry` return zero rows). New `e2e/visual/login-branding-baseline.spec.ts` captures the login aside's configured (ASCII fixture name + a real seeded logo object) and unconfigured states at 1280×800, masking the ticking `LiveTimeDisplay`/date-label pair, paired with a `boundingBox()` assertion that the hero tile is ≥120×120px.

## Task Commits

1. **Task 1: Store-logo upload control in Settings → General** - `89847e4` (feat)
2. **Task 2: StoreLogoImage and the login hero logo** - `43ab19d` (feat)
3. **Task 3: STORE-03 coverage — functional upload flow, RLS boundary, visual baselines** - `d8b72c8` (test)

## Files Created/Modified

- `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx` - logo upload control (Task 1)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` - 22 `generalSettingsTab.logo*` keys (Task 1)
- `src/entities/settings/ui/StoreLogoImage.tsx` - new async-signed-URL logo component (Task 2)
- `src/entities/settings/index.ts` - re-exports `StoreLogoImage` (Task 2)
- `src/pages/login/index.tsx` - hero tile renders `StoreLogoImage` (Task 2)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/pages.json` - `login.logoAlt` (Task 2)
- `e2e/settings/store-branding.spec.ts` - extended with the logo flow (Task 3)
- `e2e/settings/store-branding-rls.spec.ts` - new RLS-boundary spec (Task 3)
- `e2e/visual/login-branding-baseline.spec.ts` - new visual-regression spec (Task 3)

## Decisions Made

See `key-decisions` in the frontmatter above (Option-B async resolver used throughout; no 23rd "unknown type" i18n key added; sr-only drag-over announcement instead of visible overlay text on the small 80px tile).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `login-branding-baseline.spec.ts`'s "unconfigured" fixture failing `GeneralSettingsSchema.address`'s `min(1)` validation**
- **Found during:** Task 3, first run of the new visual spec
- **Issue:** `GeneralSettingsSchema.address` is `.min(1).max(300)` (unrelated to this phase — set by an earlier phase). The visual spec's `UNCONFIGURED_VALUE` fixture set `address: ''` for the "unconfigured" case; that empty string fails `safeParse`, so `parseGeneral()` silently fell back to the schema's *entire* `DEFAULT_GENERAL` object — including `storeName` — rather than just leaving `storeName` empty. The "configured" test case (which reused `UNCONFIGURED_VALUE` as its base via spread) was therefore also written with an empty address, so its `storeName`/`storeLogoPath` overrides were silently discarded and the login page rendered the generic fallback instead of the fixture name/logo, failing the `div.size-32` visibility assertion.
- **Fix:** Changed `UNCONFIGURED_VALUE.address` to a non-empty placeholder (`'Av. Revolucion 123, CDMX'`, matching `store-branding.spec.ts`'s existing `SEEDED_VALUE.address`) — "unconfigured" in this phase's UI sense means an empty `storeName`, not an empty settings row. Added a comment recording the schema constraint so the next author of this fixture doesn't repeat it.
- **Files modified:** `e2e/visual/login-branding-baseline.spec.ts`
- **Verification:** Both visual-baseline cases pass, twice consecutively (baseline-write run + green comparison re-run).
- **Committed in:** `d8b72c8` (Task 3 commit — fixed before the file was ever committed, no separate fix commit)

**2. [Rule 1 - Bug] Fixed a same-session-still-authenticated `/login` navigation racing a redirect in the functional spec**
- **Found during:** Task 3, first run of the extended `store-branding.spec.ts`
- **Issue:** After the Remove step, the test navigated straight to `/login` while the admin session from the immediately-prior `loginAs` call was still active. `LoginPage` redirects an authenticated session to `/home`, so the "fallback icon after Remove" assertions (`div.size-32`, `login-store-name`) never found their target — the test was actually asserting against `/home`'s unrelated DOM, timing out.
- **Fix:** Added the missing `await logout(page);` immediately before that `page.goto('/login')` call, matching every other pre-auth check earlier in the same test.
- **Files modified:** `e2e/settings/store-branding.spec.ts`
- **Verification:** Full file passes (13/13 across both new specs combined), twice consecutively.
- **Committed in:** `d8b72c8` (Task 3 commit — fixed before the file was ever committed, no separate fix commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs, both in this plan's own new/extended test code, not application code)
**Impact on plan:** Neither affected shipped application behavior — both were test-fixture bugs caught and fixed before either spec file was ever committed. No scope creep.

## Issues Encountered

- This worktree had no `.env.local` (untracked, not copied by `git worktree add`) — copied from the main repo checkout (`D:\Projects\Code\supermarket-pos\.env.local`) before any Playwright run could resolve `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. Not committed (still gitignored inside the worktree) — same situation plan 01 documented and resolved the same way.
- Local Docker Desktop + Supabase stack was confirmed reachable throughout (`npx supabase status`, both `20260911000001`/`20260911000002` migrations present via `npx supabase migration list --local`) — no precondition halt was needed this session.

## User Setup Required

None — no external service configuration required. (Docker Desktop / local Supabase was already running, confirmed at session start.)

## Next Phase Readiness

- **Phase 33 is now fully complete.** STORE-01/STORE-02/STORE-03 are proven end-to-end for both halves of the phase's scope: plan 01 shipped the *name* half, plans 02–03 shipped the *logo* half — upload, storage, RLS, and the login-hero render are all live and covered by automated Playwright (functional + RLS-boundary + visual-regression), with zero `test.skip`/manual-verification anywhere in the three specs this plan touched.
- `src/widgets/LogoImage/index.tsx` (receipt-only logo) and the `receipt_settings` schema remain byte-identical across the whole phase, confirmed via `git diff --name-only` on every task commit.
- No open items or deferred work identified for this plan.

## Self-Check: PASSED

All created files verified present on disk; all three task commit hashes (`89847e4`, `43ab19d`, `d8b72c8`) verified present in `git log`.

---
*Phase: 33-login-screen-store-branding*
*Completed: 2026-09-11*
