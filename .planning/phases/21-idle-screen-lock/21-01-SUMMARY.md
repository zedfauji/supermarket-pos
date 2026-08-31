---
phase: 21-idle-screen-lock
plan: 01
subsystem: auth
tags: [idle-lock, pin, rls, audit, supabase, react-query, zustand, radix-alert-dialog]

# Dependency graph
requires:
  - phase: none
    provides: "greenfield additive phase — no prior-phase dependency"
provides:
  - "terminal_lock_settings table (TERMINAL_ID-keyed, admin-only write RLS)"
  - "screen.lock/screen.unlock AuditActionSchema entries"
  - "features/idle-screen-lock/ feature (useIdleTimer, useIdleLockAudit, IdleLockOverlay, IdleLockProvider)"
  - "useTerminalLockSettings/useMutationUpdateTerminalLockSettings hooks"
  - "LockSettingsTab admin-only Settings UI"
affects: [21-02-plan-hardening, any-future-phase-touching-App.tsx-provider-tree]

# Actuals (#2632)
actuals:
  tokens: 15150
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side idle-detect hook (no library) gated by enabled={isAuthenticated && !locked}"
    - "Direct-from-client record_audit RPC calls for a new audit action pair"
    - "Per-terminal settings table keyed by TERMINAL_ID (not a UUID singleton), mirroring receipt_settings' query/mutation shape but with admin-only RLS"

key-files:
  created:
    - supabase/migrations/20260830000002_terminal_lock_settings.sql
    - src/features/idle-screen-lock/model/useIdleTimer.ts
    - src/features/idle-screen-lock/model/useIdleTimer.test.ts
    - src/features/idle-screen-lock/model/useIdleLockAudit.ts
    - src/features/idle-screen-lock/ui/IdleLockOverlay.tsx
    - src/features/idle-screen-lock/ui/IdleLockProvider.tsx
    - src/features/idle-screen-lock/index.ts
    - src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts
    - src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts
    - src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx
    - e2e/security/idle-lock.spec.ts
    - e2e/settings/lock-timeout.spec.ts
  modified:
    - src/shared/lib/audit-actions.ts
    - src/shared/lib/domain.ts
    - src/entities/settings/model/queries.ts
    - src/entities/settings/model/types.ts
    - src/entities/settings/model/index.ts
    - src/entities/settings/index.ts
    - src/app/App.tsx
    - src/widgets/SettingsTabsPanel/index.tsx
    - src/shared/lib/i18n/locales/en-US/featOrders.json
    - src/shared/lib/i18n/locales/es-MX/featOrders.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/settings.json
    - src/shared/lib/i18n/locales/es-MX/settings.json
    - e2e/helpers/auth.ts

key-decisions:
  - "Overlay closes on ANY valid staff PIN (no role filter), matching D-04 — the unlock candidate list is the full useStaffList() result, not a canAccess()-filtered subset like ManagerPinDialog."
  - "Unlock is a pure client-side string comparison against profiles.pin, never supabase.auth.* — verified end-to-end by the E2E test asserting the Home welcome banner still shows the original (cashier) staff's name after a manager unlocks."
  - "record_audit's actor_id cannot express 'who unlocked' (the Supabase Auth session never changes across lock/unlock) — both events carry explicit sessionOwnerStaffId/unlockedByStaffId identities in p_before/p_after JSON instead."
  - "terminal_lock_settings RLS write policies check get_user_role() = 'admin', not IN ('manager','admin') like receipt_settings — manage_settings is admin-only in this codebase's RBAC."
  - "useIdleLockAudit's recordLock/recordUnlock are module-level functions (not defined inside the hook) so they are referentially stable across renders, avoiding idle-timer listener churn."

patterns-established:
  - "Pattern: a new per-terminal settings table follows receipt_settings' query/mutation shape (queries.ts) but swaps the singleton-id upsert for a terminal_id upsert, and tightens RLS to the action's real RBAC scope instead of copying the analog's write policy verbatim."

requirements-completed: [LCK-01, LCK-02, LCK-03, LCK-04]

coverage:
  - id: D1
    description: "Idle-lock overlay engages after the configured per-terminal timeout, on every screen, non-dismissable by Escape or outside click"
    requirement: LCK-01
    verification:
      - kind: e2e
        ref: "e2e/security/idle-lock.spec.ts#locks after idle timeout (non-dismissable), cross-staff unlock keeps session identity, incorrect PIN errors, both events audited"
        status: pass
      - kind: unit
        ref: "src/features/idle-screen-lock/model/useIdleTimer.test.ts (5 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "terminal_lock_settings table keyed by TERMINAL_ID with admin-only write RLS, editable only by manage_settings-gated roles"
    requirement: LCK-02
    verification:
      - kind: integration
        ref: "src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts (4 cases)"
        status: pass
      - kind: e2e
        ref: "e2e/settings/lock-timeout.spec.ts#admin configures and persists the auto-lock timeout; manager cannot see the tab (D-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Overlay unlocks on any valid staff PIN, not necessarily the original staff; active session identity is unchanged"
    requirement: LCK-03
    verification:
      - kind: e2e
        ref: "e2e/security/idle-lock.spec.ts (cross-staff unlock assertion — welcome banner still shows original staff's name)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both lock and unlock events write fully-attributed audit_logs rows (session owner at lock; unlocking staff at unlock)"
    requirement: LCK-04
    verification:
      - kind: integration
        ref: "src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts (2 cases)"
        status: pass
      - kind: e2e
        ref: "e2e/security/idle-lock.spec.ts (audit_logs attribution assertion)"
        status: pass
    human_judgment: false

duration: 65min
completed: 2026-08-31
status: complete
---

# Phase 21 Plan 01: Idle Screen Lock — Tracer Summary

**Idle-lock overlay (non-dismissable AlertDialog + PINKeypad, any-staff PIN unlock) with a `terminal_lock_settings` table and full `audit_logs` accountability trail, wired into every route via `App.tsx`.**

## Performance

- **Duration:** 65 min
- **Started:** 2026-08-31T00:05:00Z (approx.)
- **Completed:** 2026-08-31T01:10:00Z
- **Tasks:** 3
- **Files modified:** 27

## Accomplishments

- Built the full idle-detect → lock overlay → cross-staff PIN-unlock → audit_logs cycle end-to-end, proven by a real Playwright E2E run (`e2e/security/idle-lock.spec.ts`), not a mock.
- `terminal_lock_settings` table live on both local and remote Supabase, keyed by `TERMINAL_ID` (D-02), admin-only write RLS confirmed by integration test (cashier AND manager both rejected, only admin succeeds).
- `useIdleLockAudit` writes explicit `sessionOwnerStaffId`/`unlockedByStaffId` identities into `record_audit`'s `p_before`/`p_after` JSON, since `actor_id` cannot distinguish the two (verified: `actor_id` never equals the unlocking staff's id).
- Admin-only `LockSettingsTab` in Settings; manager (not just cashier) confirmed unable to see the tab at all, matching `manage_settings`'s real admin-only RBAC scope.

## Task Commits

Each task was committed atomically (Task 1 followed RED-GREEN TDD per its `tdd="true"` flag):

1. **Task 1a (RED): failing tests for idle screen lock tracer** - `6235b70` (test)
2. **Task 1b (GREEN): idle screen lock tracer implementation** - `976e45d` (feat)
3. **Task 2: RLS + audit accountability integration tests** - `dd3dab6` (test)
4. **Task 3: admin-only LockSettingsTab + RBAC-gated E2E** - `9b4c8ab` (feat)

_Note: Task 1's `tdd="true"` flag produced 2 commits (RED test, GREEN feat) per the TDD gate protocol._

## Files Created/Modified

- `supabase/migrations/20260830000002_terminal_lock_settings.sql` - new table + RLS, applied Local and Remote
- `src/shared/lib/audit-actions.ts` - `screen.lock`/`screen.unlock` added to `AuditActionSchema`
- `src/shared/lib/domain.ts` - `TerminalLockSettingsSchema`
- `src/entities/settings/model/queries.ts` - `useTerminalLockSettings`/`useMutationUpdateTerminalLockSettings`
- `src/features/idle-screen-lock/model/useIdleTimer.ts` - activity-listener idle-detect hook
- `src/features/idle-screen-lock/model/useIdleLockAudit.ts` - `record_audit` call wrappers for lock/unlock
- `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx` - non-dismissable PIN overlay, any-staff match
- `src/features/idle-screen-lock/ui/IdleLockProvider.tsx` - composes hook + overlay, mounted in `App.tsx`
- `src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx` - admin-only timeout config UI
- `e2e/security/idle-lock.spec.ts` - LCK-01/03/04 end-to-end cycle
- `e2e/settings/lock-timeout.spec.ts` - LCK-02 admin-only Settings tab
- `src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts` - RLS admin-only write proof
- `src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts` - audit accountability proof

## Decisions Made

- No role filter on the unlock overlay's candidate staff list — matches the full `useStaffList()` result per D-04, unlike `ManagerPinDialog`'s `canAccess()`-filtered subset.
- `terminal_lock_settings` RLS write policies check `get_user_role() = 'admin'`, deliberately diverging from `receipt_settings`' `manager+admin` write policy, since `manage_settings` (LCK-02) is admin-only in this codebase's RBAC (`src/shared/lib/rbac.ts`).
- `useIdleLockAudit`'s `recordLock`/`recordUnlock` are module-level (not defined inside the hook) so they are referentially stable across renders, keeping `useIdleTimer`'s window-listener subscription from churning on every parent re-render.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing node_modules, `.env.local`, and Supabase CLI project linkage**
- **Found during:** Task 1, before any implementation work
- **Issue:** This worktree was freshly forked with none of the gitignored, worktree-local dev-environment state (`node_modules/`, `.env.local`, `supabase/.temp/`) that `npm run dev`/`npx playwright test`/`npx supabase db push` all require — none of the plan's `<verify>` commands could run at all.
- **Fix:** Copied `.env.local` and `supabase/.temp/` from the main checkout (same secrets the user already has locally, not fabricated), and ran `npm ci` against the existing, unmodified `package-lock.json` (no new package installed — explicitly not the Rule 3 package-install exclusion).
- **Files modified:** None tracked in git (all copied/installed files are gitignored worktree-local state)
- **Verification:** `npm run dev`, `npx playwright test`, and `npx supabase db push` all subsequently worked
- **Committed in:** N/A (no git-tracked change)

**2. [Rule 3 - Blocking] Concurrent worktree agent's migration ledger entries blocked `supabase db push`/`migration up`**
- **Found during:** Task 1, pushing the new migration
- **Issue:** A concurrent agent (Phase 22, admin PIN reset work) had already applied migrations directly to both the shared remote Supabase project (ledger version `20260831001057`) and the shared local Docker Postgres instance (ledger version `20260831000001`, a real `clear_must_change_pin` fix — confirmed applied via a direct schema query, `pronargs: 2`) without those files being committed to git yet. The Supabase CLI refuses `db push`/`migration up` outright when the remote/local ledger references a version with no matching local file.
- **Fix:** For each affected version, kept a local file present (the real untracked file for `20260831000001` copied from the main checkout for accuracy; a documented, comment-only, never-git-added placeholder for `20260831001057` since its real content lives in another agent's branch) and ran `supabase migration repair --status applied <version>` — a ledger-only operation that never executes SQL or touches the concurrent agent's actual schema changes, unlike the CLI's own suggested `--status reverted` (which would have falsely told the ledger that migration was never applied). Verified the local schema change was genuinely already live before repairing, so the repair reflects reality rather than masking a gap.
- **Files modified:** None tracked in git (both migration files involved are intentionally left untracked — not this plan's work to commit)
- **Verification:** `supabase migration list` shows every version, including `20260830000002`, applied on both Local and Remote; a direct `db dump`/schema query confirmed the concurrent agent's real changes were untouched
- **Committed in:** N/A (no git-tracked change; the two foreign migration files remain untracked in this worktree)

**3. [Rule 1 - Bug] Radix's `AlertDialogContent` does not expose `onPointerDownOutside`**
- **Found during:** Task 1, typecheck after first draft of `IdleLockOverlay.tsx`
- **Issue:** Copied an `onPointerDownOutside={e => e.preventDefault()}` prop from the plan's draft pattern, but `@radix-ui/react-alert-dialog`'s own type explicitly omits `onPointerDownOutside`/`onInteractOutside` from `AlertDialogContentProps` — Radix's `AlertDialog` (unlike `Dialog`) already blocks outside-pointer dismissal by design, so the prop is both unnecessary and a type error.
- **Fix:** Removed the prop; kept `onEscapeKeyDown={e => e.preventDefault()}` (which the type does expose) and documented why outside-click is already handled.
- **Files modified:** `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx`
- **Verification:** `npm run typecheck` passes; the E2E test's `Escape` assertion still confirms non-dismissability
- **Committed in:** `976e45d` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking-environment, 1 bug)
**Impact on plan:** All three were necessary to make the plan's own `<verify>` commands runnable at all in this freshly-forked worktree, or to fix a real type error. No scope creep — the actual `terminal_lock_settings`/idle-lock feature surface matches the plan exactly.

## Issues Encountered

None beyond the deviations above — both were fully resolved and verified before proceeding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core idle-lock mechanism (LCK-01..04) is fully implemented, tested, and live on both local and remote Supabase.
- Plan 21-02 (per the phase objective) hardens the remaining D-01 edge cases and closes the global-listener bypass risk flagged as `T-21-06` in the threat register (deferred here since it requires this plan's `locked` state to exist first).
- No blockers for 21-02.

## Self-Check: PASSED

- All 13 created files verified present and tracked in git (`git ls-files`).
- All 5 task commits (`6235b70`, `976e45d`, `dd3dab6`, `9b4c8ab`, `6f6a07f`) verified present in `git log --oneline --all`.
- Re-ran the plan-level `<verification>` block in full: both E2E specs (`idle-lock.spec.ts`, `lock-timeout.spec.ts`) pass; all 3 Vitest test files (11 tests) pass; `npm run typecheck` and `npm run lint` pass; `supabase migration list` shows `20260830000002` applied on Local and Remote.
- Full unit suite (`npm run test`) re-run for regressions: 135 test files passed, 1254 tests passed, no failures.

---
*Phase: 21-idle-screen-lock*
*Completed: 2026-08-31*
