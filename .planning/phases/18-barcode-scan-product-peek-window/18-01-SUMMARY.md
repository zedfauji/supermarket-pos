---
phase: 18-barcode-scan-product-peek-window
plan: 01
subsystem: ui
tags: [tauri, webviewwindow, cross-window-events, react, zustand, i18n]

requires: []
provides:
  - "WeightEntryDialog optional onConfirm override (resolves 18-UI-SPEC.md's flagged open question)"
  - "ensurePeekWindowShown(code) race-free peek-window open/reuse function + BARCODE_SCANNED_EVENT/ADD_TO_CART_EVENT constants + payload types"
  - "src-tauri/capabilities/default.json peek-window capability grant (windows: [main, peek], +5 minimum permissions)"
  - "wPanels:productPeekPanel.windowTitle i18n key (en-US + es-MX)"
  - "CheckoutPanel wired to open the peek window on scan and receive its two event types"
affects: ["18-02", "18-03"]

actuals:
  tokens: 3200
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Lazy WebviewWindow creation with first-payload delivered via creation URL query string, not a post-creation emit (avoids the not-yet-mounted-listener race)"
    - "Optional onConfirm override prop pattern for a dialog whose default behavior writes to a store not reachable from a second webview context"

key-files:
  created:
    - src/features/open-product-peek-window/model/useProductPeekWindow.ts
    - src/features/open-product-peek-window/model/useProductPeekWindow.test.ts
  modified:
    - src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx
    - src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx
    - src-tauri/capabilities/default.json
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "Restored the pre-existing WeightEntryDialog.test.tsx coverage (keypad-enables-confirm) alongside the new onConfirm-focused test suite, rather than replacing it — the plan's read_first note claiming zero existing coverage was inaccurate; overwriting would have been a silent regression in test coverage."
  - "Capability grant adds exactly 5 minimum permissions (allow-create-webview-window, allow-close, allow-hide, allow-show, allow-set-focus), never the broader core:webview:default/core:window:default bundles, per T-18-01's threat mitigation."

requirements-completed: [PEEK-02, PEEK-03, PEEK-04]

coverage:
  - id: D1
    description: "WeightEntryDialog accepts an optional onConfirm override that fully replaces default cartStore writes when supplied, with zero change to either existing caller"
    requirement: "PEEK-02"
    verification:
      - kind: unit
        ref: "src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "ensurePeekWindowShown constructs exactly one WebviewWindow on first scan (URL-encoded barcode via creation URL) and reuses (show+setFocus+emit) on subsequent scans, never double-constructing"
    requirement: "PEEK-04"
    verification:
      - kind: unit
        ref: "src/features/open-product-peek-window/model/useProductPeekWindow.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "src-tauri/capabilities/default.json grants the peek window label exactly the 5 documented minimum permissions"
    requirement: "PEEK-01"
    verification:
      - kind: other
        ref: "grep -c core:webview:allow-create-webview-window|core:window:allow-close|core:window:allow-hide|core:window:allow-show|core:window:allow-set-focus src-tauri/capabilities/default.json == 5"
        status: pass
    human_judgment: false
  - id: D4
    description: "CheckoutPanel opens/reuses the peek window on every scan without changing its own scan-to-search behavior, and correctly applies both cross-window event types to the real cart"
    requirement: "PEEK-03"
    verification:
      - kind: unit
        ref: "src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-27
status: complete
---

# Phase 18 Plan 01: Main-Window Peek-Window Plumbing Summary

**Race-free `WebviewWindow` open/reuse via `ensurePeekWindowShown`, an optional `onConfirm` override on `WeightEntryDialog`, and `CheckoutPanel`'s two new Tauri event listeners — all Vitest-covered against mocked `@tauri-apps/api` modules ahead of the peek window's own UI (Plan 18-02).**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-27
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `WeightEntryDialog` now accepts an optional `onConfirm` override that fully replaces its default `addWeightedItem`/`updateWeightedItem` cartStore writes when supplied — resolves 18-UI-SPEC.md's one flagged "Weight-path cart-mutation wiring" open question, with zero behavior change for either existing caller (`ProductGrid.tsx`, `CheckoutPanel.tsx`'s edit-weight usage).
- New `src/features/open-product-peek-window/model/useProductPeekWindow.ts`: `PEEK_WINDOW_LABEL`/`BARCODE_SCANNED_EVENT`/`ADD_TO_CART_EVENT` constants, `BarcodeScannedPayload`/`AddToCartPayload` types, and `ensurePeekWindowShown(code)` — checks `WebviewWindow.getByLabel('peek')` first, constructs exactly one new window with the barcode delivered via the creation URL's query string (race-free, no listener needed) when none exists, or `show()`+`setFocus()`+`emit()`s a rescan when one does.
- `src-tauri/capabilities/default.json`: `windows` now `["main", "peek"]`, with exactly 5 new minimum permissions (`core:webview:allow-create-webview-window`, `core:window:allow-close`/`allow-hide`/`allow-show`/`allow-set-focus`) — no broader `core:webview:default`/`core:window:default` grant.
- `wPanels:productPeekPanel.windowTitle` i18n key added to both `en-US` and `es-MX` catalogs.
- `CheckoutPanel.tsx`: `onScan` now also calls `ensurePeekWindowShown(code)` (local `setSearch` unchanged); a new effect listens for `barcode-scanned` (relays into `search`, same as a local scan) and `add-to-cart` (applies `weightGrams` via `addWeightedItem` or `qty` via a loop of `addItem` calls, defaulting to 1) — both unlisten on unmount.

## Task Commits

Each task was committed atomically (TDD tasks got separate RED/GREEN commits):

1. **Task 1: WeightEntryDialog onConfirm override**
   - `adeb615` test(18-01): add failing coverage for WeightEntryDialog onConfirm override
   - `cc4aff6` feat(18-01): add optional onConfirm override to WeightEntryDialog
2. **Task 2: ensurePeekWindowShown + capability grant + i18n**
   - `39aeeb0` test(18-01): add failing coverage for ensurePeekWindowShown
   - `e43aba5` feat(18-01): add ensurePeekWindowShown and peek window capability grant
3. **Task 3: Wire CheckoutPanel**
   - `3304148` feat(18-01): wire CheckoutPanel to open/relay/receive peek-window events

**Plan metadata:** (this commit, made after this SUMMARY)

## Files Created/Modified

- `src/features/open-product-peek-window/model/useProductPeekWindow.ts` — new: `ensurePeekWindowShown`, event-name constants, payload types
- `src/features/open-product-peek-window/model/useProductPeekWindow.test.ts` — new Vitest coverage (3 cases: first-open, URL-encoding, reuse)
- `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` — added optional `onConfirm` prop
- `src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` — added 6 new cases (default add/edit paths, onConfirm override for both modes, two invalid-weight no-op cases) alongside the pre-existing keypad-enables-confirm test
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` — `onScan` calls `ensurePeekWindowShown`; new effect for `barcode-scanned`/`add-to-cart` listeners
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` — added mocks for `@tauri-apps/api/event` and the new peek-window feature module
- `src-tauri/capabilities/default.json` — `windows: ["main", "peek"]`, +5 permissions
- `src/shared/lib/i18n/locales/en-US/wPanels.json`, `es-MX/wPanels.json` — `productPeekPanel.windowTitle` key

## Decisions Made

- Restored the pre-existing `WeightEntryDialog.test.tsx` coverage rather than overwriting it. The plan's `read_first`/research note ("grep found none") was inaccurate — a real test already existed (`keeps confirmation disabled until a positive weight is entered`). Overwriting it per the plan's literal instruction would have silently deleted working regression coverage; merged both suites into one file instead.
- No new shared `tauriPeekEvents.ts` wrapper file — the three constants live directly in `useProductPeekWindow.ts` per the plan's explicit YAGNI note; Plan 18-02 imports the same constants.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/regression risk] Preserved existing WeightEntryDialog test instead of overwriting**
- **Found during:** Task 1
- **Issue:** The plan instructed writing `WeightEntryDialog.test.tsx` "first (RED)" as if the file didn't exist; it did, with one working test (`keeps confirmation disabled until a positive weight is entered` using `renderWithProviders` + `userEvent`). A naive overwrite would have deleted that coverage.
- **Fix:** Kept the original test verbatim (restored via `renderWithProviders`/`userEvent`) and added the plan's 6 new onConfirm-focused cases (using a lighter mocked-cartStore + raw `render` + keydown-driven input, matching the plan's specified approach) in the same file.
- **Files modified:** `src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx`
- **Committed in:** `adeb615`

**2. [Rule 3 - Blocking] Local dev environment setup (not a code change)**
- **Found during:** Task 1 verification
- **Issue:** This worktree had no `.env.local` and its local Supabase Docker stack (`supabase_db_supermarket-pos-selfhosted`) was not running — `npx vitest run` failed at global-setup before any test could execute.
- **Fix:** Copied `.env.local` from the main repo checkout into the worktree (gitignored, not committed) and started Docker Desktop + `npx supabase status` confirmed the local stack was already provisioned and came up automatically once Docker's engine was ready.
- **Files modified:** none (environment-only; `.env.local` is gitignored)

---

**Total deviations:** 2 (1 test-preservation fix, 1 environment setup) — no scope creep, no production code beyond what the plan specified.
**Impact on plan:** None on scope; both were necessary to execute the plan correctly and to run its own verification commands at all.

## Issues Encountered

- Full-suite `npm run test` (run as an extra check beyond the plan's own verification command) shows 5 pre-existing failures in `src/entities/staff/model/queries.clock.test.ts` and `src/features/close-tab/tests/useCloseTab.test.ts` — both are real-DB integration tests requiring seeded staff/shift/tab fixture data (`npm run setup:dev`) that this freshly-started local Supabase instance doesn't have. Confirmed unrelated to any file this plan touches (no shared import path). Logged in `.planning/phases/18-barcode-scan-product-peek-window/deferred-items.md` per the scope-boundary rule rather than fixed.

## User Setup Required

None - no external service configuration required. (The `.env.local`/Docker step above was a one-time local dev-environment fix for this worktree, not a new requirement.)

## Next Phase Readiness

- Plan 18-02 can build the peek window's own React tree (`ProductPeekWindow.tsx`, `main.tsx` branching on `?window=peek`) knowing the main window already opens/reuses it correctly and has both event listeners in place.
- Plan 18-03's E2E work has real `ensurePeekWindowShown`/event-constant exports to import and mock via the `BroadcastChannel`-backed Tauri IPC mock described in 18-RESEARCH.md.
- No blockers. The `deferred-items.md` DB-seeding gap is worktree/environment-local and does not block downstream plans.

---
*Phase: 18-barcode-scan-product-peek-window*
*Completed: 2026-08-27*

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; all 5 task commits
(`adeb615`, `cc4aff6`, `39aeeb0`, `e43aba5`, `3304148`) confirmed present in
`git log --oneline`.
