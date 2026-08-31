---
phase: 21-idle-screen-lock
plan: 02
subsystem: auth
tags: [idle-lock, zustand, barcode-scanner, e2e, playwright, react-query]

# Dependency graph
requires:
  - phase: 21-idle-screen-lock/plan-01
    provides: "terminal_lock_settings table, screen.lock/unlock audit actions, IdleLockProvider/IdleLockOverlay tracer mounted in App.tsx"
provides:
  - "useLockStateStore (shared Zustand lock-state store, single source of truth for 'is the screen locked' within a window's JS realm)"
  - "CheckoutPanel barcode-scanner gating on !locked (closes T-21-06 / Pitfall 3)"
  - "e2e/security/idle-lock-bypass.spec.ts (Pitfall 3 bypass-resistance coverage)"
  - "e2e/security/idle-lock-transactions.spec.ts (D-01 mid-transaction no-exemption coverage)"
affects: [any-future-phase-touching-idle-lock-or-CheckoutPanel-scanner-gating]

# Actuals (#2632)
actuals:
  tokens: 4222
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tiny non-persisted Zustand store as cross-module lock-state signal within one window's JS realm, deliberately not shared across separate Tauri OS windows (each has its own JS realm/store instance)"

key-files:
  created:
    - src/features/idle-screen-lock/model/lock-state-store.ts
    - e2e/security/idle-lock-bypass.spec.ts
    - e2e/security/idle-lock-transactions.spec.ts
  modified:
    - src/features/idle-screen-lock/ui/IdleLockProvider.tsx
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/entities/settings/model/queries.ts

key-decisions:
  - "useLockStateStore has no persist middleware -- lock state is a live per-session UI flag that should not survive a reload; IdleLockProvider re-arms the idle timer fresh on every mount regardless."
  - "ProductPeekWindow's own useBarcodeScanner call is deliberately left un-gated (out of scope per RESEARCH.md Open Question 1, flagged in 21-01's must_haves) -- it runs in a separate Tauri OS window with its own JS realm that does not share this store."
  - "E2E fake-barcode fixtures for bypass testing must be non-digit: PINKeypad also registers a global window keydown listener for physical digit-key PIN entry (0-9 + Backspace), so a digit-only fake barcode dispatched while the overlay is open silently types into the PIN buffer and corrupts the subsequent real-PIN unlock. Letters satisfy useBarcodeScanner's generic 1-character buffering without colliding."
  - "The correct Tauri IPC command for opening the Product Peek window is plugin:webview|create_webview_window (per tauriPeekMock.ts's own documented header, confirmed by reading node_modules/@tauri-apps/api/webviewWindow.js), not plugin:window|create_webview_window as the plan text stated -- corrected in both new specs' assertions."

patterns-established:
  - "Pattern: a feature-local Zustand store (no persist) is the mechanism for sharing live UI state across FSD layers within one window's JS realm without prop-drilling, reserved for state that should NOT survive a reload and should NOT be shared cross-window."

requirements-completed: [LCK-01]

coverage:
  - id: D1
    description: "CheckoutPanel's global barcode-scanner keydown listener is gated on the shared lock state -- zero Product Peek window opens while locked, normal scanning resumes immediately after unlock"
    requirement: LCK-01
    verification:
      - kind: e2e
        ref: "e2e/security/idle-lock-bypass.spec.ts#a barcode-scanner keystroke burst while locked opens zero Product Peek windows; scanning resumes after unlock"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-01's 'no exemption, even mid-transaction' clause: the idle-lock overlay engages while /pos has an open cart and open payment modal, without resetting either; the in-progress sale still completes after unlock"
    requirement: LCK-01
    verification:
      - kind: e2e
        ref: "e2e/security/idle-lock-transactions.spec.ts#cart contents and an open payment modal survive a lock/unlock cycle unchanged; the sale still completes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Escape does not dismiss the overlay (defense-in-depth re-check at the E2E layer, beyond Plan 21-01's component-level onEscapeKeyDown prevention)"
    requirement: LCK-01
    verification:
      - kind: e2e
        ref: "e2e/security/idle-lock-bypass.spec.ts (Escape assertion within the same test)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-31
status: complete
---

# Phase 21 Plan 02: Idle Screen Lock Hardening Summary

**Shared `useLockStateStore` (non-persisted Zustand) replaces `IdleLockProvider`'s local `useState`, gates `CheckoutPanel`'s global barcode-scanner listener on `!locked` (closing Pitfall 3 / T-21-06), and two new E2E specs prove both gaps RESEARCH.md flagged after Plan 21-01's tracer: the bypass risk and D-01's mid-transaction no-exemption clause.**

## Performance

- **Duration:** 55 min (approx.)
- **Completed:** 2026-08-31T01:43:27Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `useLockStateStore` (`src/features/idle-screen-lock/model/lock-state-store.ts`) is the single source of truth for "is the screen locked" within a window's JS realm, readable by any module without prop-drilling from `App.tsx`.
- `CheckoutPanel`'s `scannerEnabled` now also requires `!locked` — a raw barcode-scanner keystroke burst reaching the app while the overlay is visually blocking the screen has zero externally observable effect (no `plugin:webview|create_webview_window` IPC call), proven end-to-end by `e2e/security/idle-lock-bypass.spec.ts`, and normal scanning resumes immediately after unlock with no reload required.
- D-01's "no exemption, even mid-transaction" requirement is proven end-to-end by `e2e/security/idle-lock-transactions.spec.ts`: a real cart + open payment modal survive a full lock/unlock cycle unchanged (same total, same line count, same entered tendered amount), the confirm button is genuinely occluded while locked (bounded click times out), and the in-progress sale still completes successfully after unlocking.
- Closed a real, latent architecture bug in `useTerminalLockSettings()` discovered while debugging the new specs: its RLS-gated query fired once at initial app mount (before login, anonymous client), permanently caching a `null`/default-60s result with no later invalidation on login — silently stranding every real user's admin-configured per-terminal timeout at the 60s default unless a full page reload happened to occur.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared lock-state store + CheckoutPanel scanner gating (closes Pitfall 3)** - `fab34fd` (feat)
2. **Task 2: Mid-transaction no-exemption E2E (D-01)** - `80a205b` (test)

## Files Created/Modified

- `src/features/idle-screen-lock/model/lock-state-store.ts` - `useLockStateStore`, shared non-persisted lock-state Zustand store
- `src/features/idle-screen-lock/ui/IdleLockProvider.tsx` - reads/writes `locked` via the store instead of local `useState`; behavior unchanged
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` - `scannerEnabled` extended with `&& !locked`
- `src/entities/settings/model/queries.ts` - `useTerminalLockSettings()` gated on `isAuthenticated` (deviation, see below)
- `e2e/security/idle-lock-bypass.spec.ts` - Pitfall 3 bypass-resistance coverage
- `e2e/security/idle-lock-transactions.spec.ts` - D-01 mid-transaction no-exemption coverage

## Decisions Made

- `useLockStateStore` deliberately carries no `persist` middleware (lock state is live/per-session, not something that should survive a reload).
- `ProductPeekWindow`'s own `useBarcodeScanner` call is deliberately NOT gated on this store — it runs in a separate Tauri OS window with its own JS realm, out of scope per RESEARCH.md Open Question 1 and 21-01's flagged assumption.
- E2E fake-barcode fixtures used while the overlay is open must be non-digit strings — see Deviations below.
- The correct Tauri IPC command name is `plugin:webview|create_webview_window`, not `plugin:window|create_webview_window` as the plan text stated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useTerminalLockSettings()` permanently cached a pre-auth `null` result, stranding real users on the 60s default timeout**
- **Found during:** Task 1, debugging why `e2e/security/idle-lock-bypass.spec.ts`'s overlay never engaged within its 20s wait window
- **Issue:** `useTerminalLockSettings()`'s TanStack Query fires unconditionally on mount. `IdleLockProvider` mounts inside `<Providers>` regardless of auth state, so the query's first (and only, given `staleTime: 30_000` with no invalidation trigger on login) fetch runs anonymously — before any staff has logged in. `terminal_lock_settings`'s SELECT RLS policy is `TO authenticated`, so an anonymous SELECT silently returns zero rows (not an error). That `null` result gets cached and never refetched on login, so `IdleLockProvider` falls back to `DEFAULT_LOCK_TIMEOUT_SECONDS` (60) for the entire session regardless of the admin's actually-configured per-terminal value — a real bug affecting every genuine first-session user, not just this plan's new tests. Confirmed via a temporary debug `console.log` inside the query's `queryFn` showing `DEBUG_TERMINAL_LOCK POS-1 null` fired exactly once, at initial mount, before login.
- **Fix:** Gated `useQuery`'s `enabled` option on `useStaffStore(s => s.isAuthenticated)` (same cross-entity `useStaffStore` import pattern already precedented in `src/entities/tab/model/queries.ts`). The query now simply doesn't fire until a real session exists, so its first meaningfully-cached fetch is always authenticated.
- **Files modified:** `src/entities/settings/model/queries.ts`
- **Verification:** `npm run typecheck`/`npm run lint` pass; full unit suite (135 files, 1254 tests) passes with no regressions; both new E2E specs pass reliably with the overlay engaging within the seeded 15s timeout.
- **Committed in:** `fab34fd` (Task 1 commit)

**2. [Rule 1 - Bug] Digit-only fake barcode fixture collided with `PINKeypad`'s own physical-keyboard listener**
- **Found during:** Task 1, writing `e2e/security/idle-lock-bypass.spec.ts`
- **Issue:** The plan's action text suggested "any 4+ digit string plus Enter" for the fake barcode used while the overlay is open. `PINKeypad` (rendered inside the overlay) also registers a global `window` keydown listener supporting physical digit-key PIN entry (`0`-`9` + `Backspace`). Dispatching a digit-only fake barcode while the overlay is mounted therefore also typed into the PIN buffer, producing spurious "Incorrect PIN" states that corrupted the subsequent real-PIN unlock step.
- **Fix:** Used a non-digit fake barcode (`'ABCDEFGHIJK'`) instead — letters are untouched by `PINKeypad`'s digit filter but still satisfy `useBarcodeScanner`'s generic `e.key.length === 1` buffering, exercising the exact same listener the test targets.
- **Files modified:** `e2e/security/idle-lock-bypass.spec.ts`
- **Verification:** Spec passes reliably across repeated runs.
- **Committed in:** `fab34fd` (Task 1 commit)

**3. [Rule 1 - Bug] Wrong Tauri IPC command name in the plan's own acceptance-criteria text**
- **Found during:** Task 1, after fixing (1) and (2) — the spec still failed on the post-unlock "scanning resumes" assertion
- **Issue:** The plan's action/acceptance-criteria text specified asserting on `plugin:window|create_webview_window`, but `ensurePeekWindowShown`'s actual `new WebviewWindow(...)` call invokes `plugin:webview|create_webview_window` (confirmed against `tauriPeekMock.ts`'s own documented header, itself sourced from reading the compiled `@tauri-apps/api/webviewWindow.js`). The wrong command name meant the mock's call log never matched, so the "greater than 0 calls after unlock" assertion never passed.
- **Fix:** Corrected both assertions (and the file's doc comment) to `plugin:webview|create_webview_window`.
- **Files modified:** `e2e/security/idle-lock-bypass.spec.ts`
- **Verification:** Spec passes; both zero-while-locked and greater-than-zero-after-unlock assertions confirmed against real IPC mock call logs.
- **Committed in:** `fab34fd` (Task 1 commit)

**4. [Rule 3 - Blocking] Worktree missing node_modules and .env.local**
- **Found during:** Task 1, before any implementation work
- **Issue:** This worktree was freshly forked with none of the gitignored, worktree-local dev-environment state (`node_modules/`, `.env.local`, `supabase/.temp/`) that `npm run typecheck`/`npx playwright test` require — the same environment gap Plan 21-01 documented and fixed for its own worktree.
- **Fix:** Copied `.env.local` and `supabase/.temp` from the main checkout (same secrets the user already has locally, not fabricated), and ran `npm ci` against the existing, unmodified `package-lock.json` (no new package installed).
- **Files modified:** None tracked in git (all copied/installed files are gitignored worktree-local state)
- **Verification:** `npm run typecheck`, `npm run lint`, `npm run test`, and `npx playwright test` all subsequently worked
- **Committed in:** N/A (no git-tracked change)

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking-environment)
**Impact on plan:** All four were necessary to make the plan's own `<verify>` commands pass correctly — deviation #1 in particular fixes a real production correctness gap (LCK-02's "configurable" timeout silently never applying without a full reload) that predates this plan and would otherwise have shipped undetected. No scope creep — the actual lock-state-store/scanner-gating/E2E-coverage surface matches the plan exactly.

## Issues Encountered

None beyond the deviations above — all four were fully resolved and verified before proceeding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both gaps RESEARCH.md flagged after Plan 21-01's tracer (Pitfall 3 bypass risk, D-01 mid-transaction no-exemption) now have automated, passing E2E coverage.
- `npx playwright test e2e/security/` (all three specs across Plan 21-01/21-02) passes green together.
- Full unit suite (`npm run test`) re-run for regressions: 135 test files passed, 1254 tests passed, no failures.
- Phase 21 (Idle Screen Lock) has no known open gaps as of this plan's completion.

## Self-Check: PASSED

- All 3 created files verified present and tracked in git (`git ls-files`).
- Both task commits (`fab34fd`, `80a205b`) verified present in `git log --oneline --all`.
- Re-ran the plan-level `<verification>` block in full: `npx playwright test e2e/security/idle-lock-bypass.spec.ts e2e/security/idle-lock-transactions.spec.ts` passes (2/2); `npx playwright test e2e/security/` (all three specs) passes (3/3); `npm run typecheck` and `npm run lint` pass.
- Full unit suite (`npm run test`) re-run for regressions: 135 test files passed, 1254 tests passed, no failures.
- Confirmed `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` is unmodified (`git diff --stat` empty for that path), matching the plan's explicit scope boundary.

---
*Phase: 21-idle-screen-lock*
*Completed: 2026-08-31*
