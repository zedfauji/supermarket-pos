# Phase 21: Idle Screen Lock - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Any screen, any role (including admin), locks behind a PIN-entry overlay after a configurable
inactivity timeout. Unlock accepts any valid staff member's PIN — this is a screen lock, not a
re-login, so the active session's identity does not change. Both the lock and unlock events are
written to `audit_logs` with full accountability (session owner at lock time; unlocking staff
member at unlock time, which may differ). Timeout is configurable per-terminal, admin-gated.

Out of scope: changing session/auth identity, exempting any screen or in-progress transaction
state from locking, building a general "per-terminal settings" framework beyond what this timeout
needs.

</domain>

<decisions>
## Implementation Decisions

### Scope
- **D-01:** Idle-lock engages on every screen, every role including admin, even mid-transaction
  (open cart, payment modal, any in-progress dialog). No carve-outs. User was explicit: "Everywhere."
  A carve-out for in-progress checkout state was considered and rejected during exploration.

### Configuration
- **D-02:** Timeout is configured **per-terminal**, not global. Correction from the original
  exploration note: `receipt_settings` was assumed to already be a per-terminal pattern to mirror,
  but it is actually a true one-row singleton (`RECEIPT_SETTINGS_SINGLETON_ID` in
  `src/entities/settings/model/queries.ts`) despite what CLAUDE.md's table implies — do not copy
  that pattern. The codebase already has a real per-terminal identity primitive instead: the
  `TERMINAL_ID` constant (`src/shared/config/constants.ts`, sourced from `VITE_TERMINAL_ID`, default
  `'POS-1'`), already used to scope `audit_logs.terminal_id` and caja sessions. The new lock-timeout
  setting should be a table keyed by this same `TERMINAL_ID`, not a new terminal-identity concept.
  Confirmed with user: they explicitly chose true per-terminal scoping over a global singleton.
  — **Reversibility:** costly — a `TERMINAL_ID`-keyed table plus its RLS/Settings-UI wiring would
  need a migration to collapse back to a singleton later.
- **D-03:** Default timeout is 60 seconds. No min/max range was specified during exploration —
  left to planning/Claude's discretion.

### Unlock
- **D-04:** Unlock accepts **any valid staff PIN**, not specifically the PIN of the staff member
  who was locked out. The active session's identity is unchanged after unlock — this is a screen
  lock, not a re-login. Explicit user quote: "anyone unlock, but session stays as original user."
  This means the unlock dialog must NOT filter candidates by role/action the way
  `ManagerPinDialog`'s `requiredAction` prop does — it must match against the full staff list.

### Audit
- **D-05:** Both the lock event and the unlock event write to `audit_logs`. The lock record
  captures who the session owner was (the staff member who got locked out); the unlock record
  captures which staff member's PIN actually unlocked it. These can be different people — this
  needs a full accountability trail, not a boolean flag. New action labels (e.g. `screen.lock`,
  `screen.unlock`) must be added to `AuditActionSchema` in `src/shared/lib/audit-actions.ts`
  *before* any `record_audit()` call uses them (file's own stated convention).

### Claude's Discretion
- Exact min/max bounds (if any) for the configurable timeout value.
- Whether to call `record_audit` directly from the client (the existing lightweight pattern used
  by `force-pin-change`, `toggle-permission`, `lookup-product-by-barcode`) versus wrapping lock/unlock
  in a dedicated RPC — client-side direct call matches more precedent in this codebase and is
  recommended, but planner may deviate with justification.
- Exact idle-detection implementation (which DOM events reset the timer, debounce strategy, whether
  a Web Worker or `requestIdleCallback`-adjacent approach is warranted) — this is an established,
  low-risk pattern; no research pass was flagged as needed during exploration.
- Overlay visual design — reuse `ManagerPinDialog`'s `AlertDialog` + `PINKeypad` chrome as the visual
  baseline unless there's a reason to diverge (e.g. it should be non-dismissable, unlike a normal
  dialog with Cancel).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & exploration record
- `.planning/REQUIREMENTS.md` (LCK-01..04) — formal acceptance criteria for this phase
- `.planning/notes/idle-screen-lock-decisions.md` — original Socratic exploration record (superseded
  on the `receipt_settings` per-terminal claim by D-02 above; everything else still holds)
- `.planning/ROADMAP.md` "### Phase 21: Idle Screen Lock" section — phase goal statement

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ManagerPinDialog` (`src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`) — the PIN-entry
  dialog pattern to model the lock-unlock overlay on: `AlertDialog` + `PINKeypad` (from `@shared/ui`),
  staff list via `useStaffList()`, PIN compared client-side against `s.pin`. Its `requiredAction`
  prop role-filters candidates via `canAccess(s.role, requiredAction)` — the idle-unlock overlay
  must NOT do this filtering (per D-04, any staff PIN unlocks), so this needs a new component/variant
  rather than reusing `ManagerPinDialog` directly with a permissive action.
- `record_audit` RPC — already called directly from the client in several features (`force-pin-change`,
  `toggle-permission`, `lookup-product-by-barcode`, `OfflineQueueProcessor`) with a `p_terminal_id`
  param sourced from the `TERMINAL_ID` constant. This is the precedented way to write lock/unlock
  audit entries without inventing a new backend RPC.
- `TERMINAL_ID` (`src/shared/config/constants.ts`) — existing per-terminal identity primitive
  (`VITE_TERMINAL_ID` env var, default `'POS-1'`). Use this to key the new per-terminal timeout table,
  matching how `audit_logs.terminal_id` and caja sessions already scope by terminal.
- `useStaffStore(s => s.isAuthenticated)` (`@entities/staff/model/store`, used in
  `src/app/ProtectedRoute.tsx`) — the auth-state signal the idle-lock provider should gate on; the
  idle timer/overlay should only be active once a staff member is logged in (no point locking `/login`).

### Established Patterns
- RBAC: Settings tabs that change store-wide config are gated by the `manage_settings` action
  (`src/shared/lib/rbac.ts`), admin-only. The new lock-timeout Settings tab should follow the same
  gating as existing admin-only Settings tabs.
- Audit action enum: `src/shared/lib/audit-actions.ts` `AuditActionSchema` is the single source of
  truth for valid `action` values — CI (`audit-actions.test.ts`) greps migration files for
  `PERFORM record_audit('<action>'...)` calls and fails if the action isn't enumerated. New actions
  must be added here first.

### Integration Points
- `src/app/App.tsx` is the natural mount point for a global idle-lock provider/overlay: it renders
  `<Providers><ClockDriftBanner /><Router /></Providers>` — the idle-lock component belongs inside
  `<Providers>` (so it can use TanStack Query / staff store) but above `<Router />` so it wraps every
  route, including `/pos` mid-transaction, per D-01. The overlay must not unmount the underlying
  route's state (cart, payment modal) — it should render as an overlay, not a route swap.
- E2E: per this repo's mandatory-automated-testing policy, lock/unlock behavior must be covered by
  a new `e2e/` spec (likely under a new folder, or `e2e/a11y/`/`e2e/rbac/` if scoped as
  keyboard/RBAC-adjacent) — idle timers should be made fast/controllable in test mode (e.g. a very
  short configured timeout) rather than requiring real wall-clock waits.

</code_context>

<specifics>
## Specific Ideas

No UI mockups or specific visual references given — "reuse `ManagerPinDialog` pattern" (per
ROADMAP.md phase goal) is the closest concrete steer.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-idle-screen-lock*
*Context gathered: 2026-08-30*
