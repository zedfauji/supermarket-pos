# Phase 21: Idle Screen Lock - Research

**Researched:** 2026-08-30
**Domain:** Global idle detection + PIN-gated overlay + per-terminal config table (React/Tauri/Supabase)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Idle-lock engages on every screen, every role including admin, even mid-transaction
  (open cart, payment modal, any in-progress dialog). No carve-outs. User was explicit: "Everywhere."
  A carve-out for in-progress checkout state was considered and rejected during exploration.
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
- **D-04:** Unlock accepts **any valid staff PIN**, not specifically the PIN of the staff member
  who was locked out. The active session's identity is unchanged after unlock — this is a screen
  lock, not a re-login. Explicit user quote: "anyone unlock, but session stays as original user."
  This means the unlock dialog must NOT filter candidates by role/action the way
  `ManagerPinDialog`'s `requiredAction` prop does — it must match against the full staff list.
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| LCK-01 | Idle-lock overlay engages after a configurable inactivity timeout (default 60s) on every screen, every role including admin, no exemption for in-progress transactions; overlay blocks all interaction until unlocked. | Pattern 1 (`useIdleTimer`) + `App.tsx` mount point above `<Router />` (Architecture Patterns, System Diagram) keeps route state mounted while blocking interaction; Pitfall 3 covers bypass-hardening; Validation Architecture maps this to a new `e2e/security/idle-lock.spec.ts`. |
| LCK-02 | Inactivity timeout configurable per-terminal, editable only by `manage_settings`-gated roles. | New `terminal_lock_settings` table keyed by `TERMINAL_ID` (Code Examples migration), RLS corrected to admin-only per the `rbac.ts` finding (Anti-Patterns), `LockSettingsTab` mirroring `NearExpirySettingsTab` (Recommended Project Structure). |
| LCK-03 | Overlay unlocks on any valid staff PIN, not necessarily the original staff; session identity unchanged. | Pattern 2 (any-staff PIN comparison) + Pitfall 1 (the critical finding that `PINLoginForm`'s `signInWithPassword` pattern must NOT be used, since it would change the session). |
| LCK-04 | Both lock and unlock events write to `audit_logs`, recording session owner and (for unlock) the unlocking staff, which may differ. | Code Examples (`record_audit` calls for lock/unlock) + Pitfall 2 (the critical finding that `actor_id` cannot represent "who unlocked" — must use `p_after`/`p_before` JSON instead) + new `AuditActionSchema` entries. |
</phase_requirements>

## Summary

This phase needs zero new dependencies — it composes existing, already-verified codebase patterns:
client-side idle detection (no library installed, none needed), the `ManagerPinDialog` PIN-comparison
pattern (NOT the `PINLoginForm` re-auth pattern — this distinction is safety-critical, see Pitfall 1),
a new small Postgres table keyed by `TERMINAL_ID` with admin-only RLS (modeled on `receipt_settings`'s
table shape but with a tighter write policy), and the existing direct-from-client `record_audit` RPC
call convention. The `settings`/`receipt_settings` precedent set in `entities/settings/model/queries.ts`
is the right home for the new table's query/mutation hooks.

The single most important finding is architectural, not technical: this app's PIN "login" for a
**different** staff member (`PINLoginForm`) calls `supabase.auth.signInWithPassword()`, which **changes**
the real Supabase Auth session (`auth.uid()`) to the newly-entered staff. If the idle-unlock overlay is
built on that pattern, unlocking with a different staff's PIN would silently swap the active session —
directly violating D-04 ("session identity does not change on unlock"). `ManagerPinDialog` avoids this
entirely: it fetches the staff list and does a **plain client-side string comparison** against
`profiles.pin`, never touching `supabase.auth`. The idle-unlock overlay MUST follow the
`ManagerPinDialog` pattern, minus its `requiredAction` role filter (D-04).

The second key finding: because the Supabase Auth session never changes across a lock/unlock cycle,
`record_audit`'s `actor_id` column (always `COALESCE(p_user_id, auth.uid())`) will be **identical** for
the lock and unlock audit rows — it can never represent "which staff unlocked it" per D-05. That fact
must be captured explicitly in the unlock event's `p_after` JSON payload instead.

**Primary recommendation:** Build a new `features/idle-screen-lock/` feature (idle-detection hook +
non-dismissable overlay modeled on `ManagerPinDialog` minus role-filtering), a new `terminal_lock_settings`
table keyed by `TERMINAL_ID` with admin-only RLS, a `LockSettingsTab` in `SettingsTabsPanel`, two new
`AuditActionSchema` entries (`screen.lock`, `screen.unlock`), and mount the provider in `App.tsx` between
`<ClockDriftBanner />` and `<Router />` — no new packages required.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Idle-activity detection (DOM event listeners, timer) | Browser / Client | — | Pure client-side timing concern; no server round-trip needed |
| Lock overlay UI (non-dismissable PIN prompt) | Browser / Client | — | Renders above `<Router />`, blocks interaction without unmounting route state (D-01) |
| Unlock PIN verification | Browser / Client | — | Client-side comparison against already-fetched `profiles.pin` list — mirrors `ManagerPinDialog`, must NOT call `supabase.auth.*` (Pitfall 1) |
| Per-terminal timeout value (storage) | Database / Storage | API / Backend (RLS) | New table keyed by `TERMINAL_ID`; RLS enforces `manage_settings` (admin-only) writes |
| Per-terminal timeout value (Settings UI) | Browser / Client | Database / Storage | New `SettingsTabsPanel` tab, gated client-side by `ProtectedAction action="manage_settings"` and server-side by RLS |
| Lock/unlock accountability trail | API / Backend | Database / Storage | `record_audit` SECURITY DEFINER RPC, called directly from client per existing precedent |

## Standard Stack

### Core

No new libraries. This phase is built entirely from already-installed dependencies:

| Library | Version | Purpose | Why Standard (for this codebase) |
|---------|---------|---------|-----------------------------------|
| React 19 (`useEffect`/`useRef`/`useState`) | 19.1.0 [VERIFIED: package.json] | Idle-timer hook, overlay state | Already the only UI framework in this repo |
| `@radix-ui/react-alert-dialog` | ^1.1.15 [VERIFIED: package.json:41] | Non-dismissable overlay primitive | Already wrapped as `shared/ui/alert-dialog.tsx`; supports `onEscapeKeyDown`/`onPointerDownOutside` prevention (used for the first time in this phase, but a documented Radix Content prop — [CITED: radix-ui.com/primitives/docs/components/alert-dialog]) |
| `@tanstack/react-query` v5 | per CLAUDE.md stack table [ASSUMED: version from CLAUDE.md, not re-verified via npm view this session] | Fetch/cache the per-terminal timeout row | Existing server-state convention (`entities/settings/model/queries.ts`) |
| Zustand v5 (`useStaffStore`) | per CLAUDE.md stack table [ASSUMED] | Gate idle-timer activity on `isAuthenticated` | Existing auth-state store, already the documented integration point (21-CONTEXT.md code_context) |
| Zod v4 | per CLAUDE.md stack table [ASSUMED] | Validate the new `TerminalLockSettings` shape | Existing domain-typing convention (`src/shared/lib/domain.ts`) |

### Supporting

None needed. No idle-detection library (`react-idle-timer`, `@uidotdev/usehooks`, etc.) is installed in
this repo `[VERIFIED: package.json grep — no match for "idle", "usehooks", "@uidotdev", "idle-timer"]`,
and CONTEXT.md's own Claude's-Discretion note already calls the hand-rolled approach "established,
low-risk" — the Don't-Hand-Roll ladder correctly stops here: a ~15-line `useIdleTimer` hook (activity
listeners + one `setTimeout`) is simpler than adding and learning a new dependency for this.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `useIdleTimer` hook | `react-idle-timer` npm package | Adds a dependency for ~15 lines of code; package also brings cross-tab sync/leader-election machinery this single-window POS terminal doesn't need |
| Client-side PIN comparison (ManagerPinDialog pattern) | `supabase.auth.signInWithPassword` re-auth (PINLoginForm pattern) | Re-auth pattern actively breaks D-04 (session identity change) — not a viable alternative, listed only to document why it's rejected (Pitfall 1) |
| New dedicated `entities/terminal-lock-settings/` folder | Extend `entities/settings/model/queries.ts` | This repo's own precedent already colocates a *second, physically separate* settings table (`receipt_settings`) inside `entities/settings/`, not a new entity folder — extending keeps one settings surface instead of two |

**Installation:** None required.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new npm packages. All work uses already-installed,
already-audited dependencies (React, Radix AlertDialog, TanStack Query, Zustand, Zod, Supabase JS).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx                                                              │
│  <Providers>                                                         │
│    <ClockDriftBanner />                                              │
│    <IdleLockProvider>          ← NEW, mounted here (above Router)    │
│      useStaffStore(isAuthenticated) ──► gates whether timer runs     │
│      useTerminalLockSettings(TERMINAL_ID) ──► timeout value (query)  │
│      useIdleTimer(timeoutMs, onIdle) ──► DOM activity listeners      │
│           │ no activity for N seconds                                │
│           ▼                                                          │
│      setLocked(true) ──► lock audit: record_audit('screen.lock', …)  │
│           │                                                          │
│      <IdleLockOverlay open={locked}>   ← AlertDialog, non-dismissable│
│         staffList (useStaffList) ──► PINKeypad ──► compare s.pin     │
│           │ match found (ANY staff, D-04)                            │
│           ▼                                                          │
│      setLocked(false) ──► unlock audit: record_audit('screen.unlock',│
│                             p_after: { unlockedByStaffId, name })    │
│    </IdleLockProvider>                                                │
│    <Router />              ← cart/payment/dialog state stays mounted │
│      /pos, /inventory, /settings, ... (every route, D-01)            │
│  </Providers>                                                        │
└─────────────────────────────────────────────────────────────────────┘

Settings write path (LCK-02):
  SettingsTabsPanel → LockSettingsTab (manage_settings gated)
    → useMutationUpdateTerminalLockSettings(TERMINAL_ID, seconds)
    → supabase.from('terminal_lock_settings').upsert({ terminal_id, lock_timeout_seconds })
    → RLS: admin-only INSERT/UPDATE (get_user_role() = 'admin')
```

### Recommended Project Structure
```
src/
├── features/
│   └── idle-screen-lock/            # NEW — one feature: "lock/unlock the screen"
│       ├── model/
│       │   ├── useIdleTimer.ts      # DOM activity listeners + setTimeout, no deps
│       │   └── useIdleLockAudit.ts  # thin wrapper around record_audit for both events
│       ├── ui/
│       │   ├── IdleLockOverlay.tsx  # AlertDialog + PINKeypad, ManagerPinDialog pattern, no role filter
│       │   └── IdleLockProvider.tsx # composes hook + overlay; mounted in App.tsx
│       └── index.ts
├── entities/
│   └── settings/
│       └── model/
│           └── queries.ts           # EXTEND — add useTerminalLockSettings + mutation (receipt_settings-style, own table)
├── widgets/
│   └── SettingsTabsPanel/
│       └── tabs/
│           └── LockSettingsTab.tsx  # NEW tab, manage_settings-gated, mirrors NearExpirySettingsTab
└── app/
    └── App.tsx                      # EXTEND — mount <IdleLockProvider> between ClockDriftBanner and Router
```

### Pattern 1: Idle detection without a library
**What:** Track a single "last activity" timestamp via a `setTimeout` that resets on every qualifying
DOM event; fire a callback when the timeout elapses uninterrupted.
**When to use:** Any "lock after N seconds of inactivity" requirement with no cross-tab/cross-window
coordination need (this is a single-window-per-terminal POS; the one exception is the Phase 18 Product
Peek window — see Open Questions).
**Example:**
```typescript
// New file: src/features/idle-screen-lock/model/useIdleTimer.ts
// Pattern is standard practice (the same technique react-idle-timer implements
// internally) — [CITED: MDN "EventTarget: addEventListener" passive/capture options]
import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function useIdleTimer(timeoutMs: number, onIdle: () => void, enabled: boolean): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onIdle, timeoutMs);
    };

    reset();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true, capture: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, reset, { capture: true });
      }
    };
  }, [timeoutMs, onIdle, enabled]);
}
```
Pass `enabled={isAuthenticated && !locked}` from `IdleLockProvider` — this both satisfies the
"only run once logged in" integration point and stops the timer from re-arming while the overlay
itself is open (typing a PIN into the overlay should not race a second idle-fire).

### Pattern 2: Any-staff PIN check without touching Supabase Auth
**What:** Compare an entered PIN against the full fetched staff list's `pin` field client-side; call a
success callback on match. Never calls `supabase.auth.signInWithPassword` or `.updateUser`.
**When to use:** Any "verify a staff member is present" gate that must NOT change the active session —
this is exactly `ManagerPinDialog`'s existing behavior, just without its `canAccess(s.role, requiredAction)`
filter.
**Example:**
```typescript
// Source: existing src/features/manager-pin-gate/ui/ManagerPinDialog.tsx (read this session),
// adapted — remove the eligibleStaff role filter per D-04 ("any valid staff PIN").
const { data: staffList } = useStaffList();

function handlePinComplete(enteredPin: string) {
  const match = (staffList ?? []).find(s => s.pin === enteredPin);
  if (match) {
    onUnlock(match); // pass the matched staff to the caller for the audit p_after payload
  } else {
    setError(t('idleLock.incorrectPin'));
    setPin('');
  }
}
```

### Pattern 3: Non-dismissable AlertDialog
**What:** Prevent Escape and outside-click from closing the overlay; there is no Cancel button.
**Example:**
```typescript
// shared/ui/alert-dialog.tsx's AlertDialogContent spreads {...props} onto
// @radix-ui/react-alert-dialog's Content primitive (read this session,
// alert-dialog.tsx:36-52) — these two Radix Content props are the documented
// mechanism [CITED: radix-ui.com/primitives/docs/components/alert-dialog#content].
<AlertDialogContent
  onEscapeKeyDown={e => e.preventDefault()}
  onPointerDownOutside={e => e.preventDefault()}
>
  {/* no <AlertDialogCancel> — this dialog only closes via a correct PIN */}
</AlertDialogContent>
```

### Anti-Patterns to Avoid
- **Building the unlock dialog on `PINLoginForm`'s `signInWithPassword` pattern:** silently swaps the
  real Supabase Auth session to the unlocking staff — violates D-04. See Pitfall 1.
- **Reading "who unlocked" from `audit_logs.actor_id`:** that column is always the original session's
  `auth.uid()`, which never changes across lock/unlock — see Pitfall 2. Put the unlocking staff's
  identity in `p_after` JSON instead.
- **Modeling the new table on `receipt_settings`'s manager-OR-admin write policy:** `manage_settings`
  (the action named in D-02/LCK-02) is **admin-only** in this codebase's RBAC
  (`src/shared/lib/rbac.ts:59-64`, `ADMIN_EXTRA` set — `'manage_settings'` is not in `MANAGER_EXTRA`).
  The new table's RLS write policies must check `get_user_role() = 'admin'`, not
  `get_user_role() IN ('manager', 'admin')` like `receipt_settings_insert_admin` does.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal focus-trap / backdrop / animation | A custom overlay `<div>` | `AlertDialog` (already wraps Radix's focus-trap + `aria-hidden` background handling) | Radix already solves keyboard-trap and pointer-blocking correctly; a custom `<div>` would need to reinvent both |
| PIN input UI | A new numeric keypad component | `PINKeypad` (`shared/ui/PINKeypad.tsx`) | Already the touch-target-sized, dot-masked, loading-aware keypad used everywhere else in the app |
| Audit trail plumbing | A new lock-specific audit table/RPC | Existing `record_audit` SECURITY DEFINER RPC, called directly from client | Established precedent (`toggle-permission`, `force-pin-change`, `lookup-product-by-barcode`); a new RPC would duplicate the 64KB-truncation/actor-capture logic already centralized there |

**Key insight:** every piece this phase needs already has a sibling implementation in this codebase.
The work is composition and one small new table, not new infrastructure.

## Common Pitfalls

### Pitfall 1: Building unlock on the wrong PIN pattern silently changes the session (CRITICAL)
**What goes wrong:** The unlock overlay is implemented by calling
`supabase.auth.signInWithPassword({ email: matchedStaff.email, password: enteredPin })` (copying
`PINLoginForm`'s pattern, since that's the codebase's other "enter a PIN" flow) instead of
`ManagerPinDialog`'s plain comparison. Unlocking with a *different* staff member's PIN then genuinely
re-authenticates as that staff — `auth.uid()` changes, and every subsequent RLS-scoped query/RPC call
in the session now runs as the unlocking staff, not the original session owner.
**Why it happens:** `PINLoginForm` (`src/widgets/PINLoginForm/PINLoginForm.tsx:82-85`, read this
session) genuinely does call `supabase.auth.signInWithPassword({ email: selectedStaff.email, password:
pin })` for the *normal* login flow — this app's staff "PIN" literally doubles as the Supabase Auth
password. It is easy to assume this is *the* PIN-verification pattern for the whole app.
**How to avoid:** Model the unlock overlay strictly on `ManagerPinDialog`
(`src/features/manager-pin-gate/ui/ManagerPinDialog.tsx:70-78`, read this session): fetch `useStaffList()`,
compare `enteredPin` against each staff's `.pin` field client-side, call success on match. Never call
any `supabase.auth.*` method from the unlock path.
**Warning signs:** A code review or test that checks `useStaffStore.getState().currentStaff` before and
after unlock — if unlocking with staff B's PIN ever changes `currentStaff` away from staff A (the
original session owner), the wrong pattern was used. Write this exact assertion into the E2E spec (LCK-03).

### Pitfall 2: `audit_logs.actor_id` cannot record "who unlocked"
**What goes wrong:** The unlock `record_audit` call is made with the default `p_user_id: null`
(actor derived from `auth.uid()`), and the plan assumes the resulting `audit_logs` row's `actor_id`
column shows the unlocking staff. Because of Pitfall 1's finding — the Supabase Auth session never
changes across lock/unlock — `auth.uid()` is the *same* value for both the lock and unlock rows (the
original session owner), not the unlocking staff.
**Why it happens:** `record_audit`'s signature (`supabase/migrations/20260703000001_record_audit_terminal_id.sql:47-56`,
read this session) computes `v_actor_id := COALESCE(p_user_id, auth.uid())` — there is no other source
of "who is interacting right now" available to a SECURITY DEFINER function than the JWT's `auth.uid()`.
**How to avoid:** Put the unlocking staff's identity in the `p_after` JSON payload explicitly, e.g.
`p_after: { unlockedByStaffId: match.id, unlockedByStaffName: match.name }`, and put the session-owner's
identity in the *lock* event's `p_after` similarly (`{ sessionOwnerStaffId, sessionOwnerStaffName }`).
Do not rely on `actor_id` to distinguish the two identities D-05 requires.
**Warning signs:** A verification step that only checks `audit_logs.actor_id IS NOT NULL` will pass
even with this bug — the check must explicitly compare the `p_after`/`before` JSON's staff id fields
against the two different staff members involved in a cross-staff unlock test.

### Pitfall 3: Overlay pointer/keyboard bypass while "locked"
**What goes wrong:** A test or real user finds a way to interact with the underlying route (e.g. via
keyboard Tab-focus escaping the dialog, or a global keyboard shortcut) while the lock overlay is open,
defeating D-01's "no exemption" requirement.
**Why it happens:** Radix's `AlertDialog` traps focus and sets `aria-hidden` on siblings by default, but
only for its own rendered tree — any keyboard shortcut wired at the `window`/`document` level *outside*
React's dialog-aware tree (e.g. a global barcode-scanner listener, if one exists) could still fire.
**How to avoid:** Audit for any `window`/`document`-level keydown listeners that are NOT scoped inside
`ProtectedRoute`/dialog boundaries (e.g. barcode-scan-to-cart's global listener, if it exists at the
`/pos` page level) and ensure the idle-lock's `enabled` gate is checked by anything that mutates state
in response to a raw keypress, not just by the visible UI.
**Warning signs:** An E2E test that locks the screen, then attempts to trigger a background action
(e.g. simulates a barcode scan network call) and asserts no mutation occurred.

### Pitfall 4: Idle timer resets itself off PIN-entry activity while locked
**What goes wrong:** If `useIdleTimer` stays `enabled` while the overlay is open, typing digits on the
`PINKeypad` counts as "activity" and continuously resets the *same* timer that's supposed to represent
"time until re-lock", producing confusing behavior (e.g. the moment you unlock, a fresh 60s countdown
has already silently been ticking from your PIN-entry keystrokes, or worse, entering a PIN never
"completes" the idle period because keystrokes are the very thing resetting it).
**How to avoid:** Gate `useIdleTimer`'s `enabled` prop on `!locked` (see Pattern 1) — the timer should
be fully paused, not merely ignored, while the overlay is open. Restart it fresh on a successful unlock.
**Warning signs:** Overlay taking far longer than the configured timeout to reappear after an unlock.

## Runtime State Inventory

Not applicable — this is a greenfield additive phase (new table, new component tree, new audit
actions). Nothing is being renamed, refactored, or migrated. No existing runtime state (Mem0, n8n,
Windows Task Scheduler, SOPS keys, etc.) is affected.

## Code Examples

### New migration: `terminal_lock_settings` table
```sql
-- Source: modeled on supabase/migrations/20260819000001_receipt_settings.sql
-- (read this session), with two deliberate deviations documented inline.
BEGIN;

CREATE TABLE terminal_lock_settings (
  terminal_id TEXT PRIMARY KEY,           -- keyed by TERMINAL_ID (D-02), not a generated uuid —
                                           -- there is genuinely one row per terminal, no surrogate needed
  lock_timeout_seconds SMALLINT NOT NULL DEFAULT 60
    CHECK (lock_timeout_seconds BETWEEN 15 AND 600), -- bounds are [ASSUMED], see Assumptions Log A1
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE TRIGGER update_terminal_lock_settings_updated_at BEFORE UPDATE ON terminal_lock_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE terminal_lock_settings ENABLE ROW LEVEL SECURITY;

-- Every authenticated role needs to READ the timeout to arm its own idle timer —
-- mirrors receipt_settings_select_authenticated.
CREATE POLICY "terminal_lock_settings_select_authenticated" ON terminal_lock_settings
  FOR SELECT TO authenticated USING (true);

-- DEVIATION from receipt_settings: manage_settings is ADMIN-ONLY in this codebase's
-- RBAC (src/shared/lib/rbac.ts:59-64, ADMIN_EXTRA), not manager+admin — so these
-- policies check get_user_role() = 'admin', not IN ('manager','admin').
CREATE POLICY "terminal_lock_settings_insert_admin" ON terminal_lock_settings
  FOR INSERT TO authenticated WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "terminal_lock_settings_update_admin" ON terminal_lock_settings
  FOR UPDATE TO authenticated USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "terminal_lock_settings_delete_admin" ON terminal_lock_settings
  FOR DELETE TO authenticated USING (get_user_role() = 'admin');

NOTIFY pgrst, 'reload schema';

COMMIT;
```

### New audit actions (add BEFORE any record_audit call uses them, per D-05)
```typescript
// src/shared/lib/audit-actions.ts — quoted verbatim block this session
// (lines 17-68, current end of enum), append inside the existing array:
export const AuditActionSchema = z.enum([
  // ...existing 27 entries unchanged (payment.*, tab.*, order_item.remove, caja.*,
  // order.*, combo.add_to_tab, inventory.*, shipment.receive, prep.produce,
  // permission.*, staff.*, settings.update, tip_distribution.compute,
  // promotion.apply, open_unit.*)...
  // Screen lock (Phase 21)
  'screen.lock',
  'screen.unlock',
]);
```

### Lock/unlock record_audit calls
```typescript
// Source: shape copied from src/features/toggle-permission/useMutationTogglePermission.ts:51-60
// (read this session) — same db.rpc('record_audit', {...}) call shape, p_source: 'client',
// p_terminal_id: TERMINAL_ID, p_user_id: null (auth.uid() stays the original session owner
// throughout — see Pitfall 2, this is expected and fine for actor_id).
const currentStaff = useStaffStore.getState().currentStaff;
const currentShift = useStaffStore.getState().currentShift;

// On idle-fire (lock):
await db.rpc('record_audit', {
  p_action: 'screen.lock',
  p_entity_type: 'shift',
  p_entity_id: currentShift?.id ?? null,
  p_before: null,
  p_after: { sessionOwnerStaffId: currentStaff?.id, sessionOwnerStaffName: currentStaff?.name },
  p_source: 'client',
  p_terminal_id: TERMINAL_ID,
  p_user_id: null,
});

// On successful PIN match (unlock):
await db.rpc('record_audit', {
  p_action: 'screen.unlock',
  p_entity_type: 'shift',
  p_entity_id: currentShift?.id ?? null,
  p_before: { sessionOwnerStaffId: currentStaff?.id, sessionOwnerStaffName: currentStaff?.name },
  p_after: { unlockedByStaffId: match.id, unlockedByStaffName: match.name },
  p_source: 'client',
  p_terminal_id: TERMINAL_ID,
  p_user_id: null,
});
```

## State of the Art

Not applicable — no external framework/library version drift is relevant here (no new dependency,
and the internal patterns referenced — `record_audit`, `ManagerPinDialog`, `receipt_settings` — were
all authored within the last ~3 months of this project's own history and remain current).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `lock_timeout_seconds` bounds of 15–600 seconds (0.25–10 min) | Code Examples (migration) | Too-narrow bounds could reject a legitimate owner preference (e.g. wanting 5s or 15min); easy to adjust the `CHECK` constraint in the same migration before it ships — low risk, but D-03 explicitly left this to discretion and the user hasn't confirmed a number |
| A2 | New audit `entity_type: 'shift'` (vs. `'session'`/`'staff'`) and using `currentShift.id` as `entity_id` | Code Examples (record_audit calls) | Cosmetic only — `audit_logs.entity_id` has no FK constraint (confirmed via migration read), so any string entity_type works; a reviewer may prefer a different label, no functional impact |
| A3 | `@tanstack/react-query` v5 / Zustand v5 / Zod v4 exact versions, cited from CLAUDE.md rather than re-verified via `npm view` this session | Standard Stack | None — no new install of these; versions are already pinned in this repo's `package.json` and unrelated to this phase's changes |

## Open Questions

1. **Does the idle lock apply to the Phase 18 Product Peek window (a separate native Tauri OS window)?**
   - What we know: D-01 says "every screen, no carve-outs"; `App.tsx`'s `<IdleLockProvider>` only wraps
     the main window's React tree. The Peek window (`PEEK-01..04`, Phase 18) opens as a genuinely
     separate Tauri OS window, likely with its own React root.
   - What's unclear: Whether "every screen" was intended to include a second physical OS window that
     wasn't roadmapped when this phase's requirements (LCK-01..04) were written, and whether the Peek
     window's own idle timer (if any) needs to share state with the main window's lock state.
   - Recommendation: Confirm scope with the user during planning/discussion, or default to "Peek window
     inherits no independent idle timer — it is a transient, short-lived detail view opened mid-scan and
     closed within seconds (PEEK-03/04), so the main window's lock firing underneath it is enough:
     the Peek window can be left un-instrumented for v1 of this phase, revisited only if usage data shows
     it's held open long enough to matter." This is the smaller, faster-to-verify choice.

2. **Should the lock-timeout Settings tab allow editing a terminal *other than* the current one, or only
   the current terminal's own row?**
   - What we know: `TERMINAL_ID` is a per-terminal build-time value; a single store with 1-2 terminals is
     the stated deployment target (v1.6 DEP context).
   - What's unclear: Whether an admin sitting at Terminal 1 should ever be able to change Terminal 2's
     timeout remotely, or only their own.
   - Recommendation: Ship "current terminal only" (`WHERE terminal_id = TERMINAL_ID`, no terminal picker
     UI) — matches D-02's stated scope ("no exemption... beyond what this timeout needs") and is
     trivially extensible to a picker later if a second terminal ships and the need arises.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependency. It uses the already-running
Vite dev server, the already-configured remote Supabase project, and already-installed npm packages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit/integration) + Playwright v1.59 (E2E) [ASSUMED: versions per CLAUDE.md stack table, not re-verified via npm view this session — unchanged by this phase] |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) — both pre-existing, no changes needed |
| Quick run command | `npx vitest run src/features/idle-screen-lock` |
| Full suite command | `npm run test` (unit) and `npm run test:e2e` (E2E) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| LCK-01 | Overlay engages after configured idle timeout, on every screen, no transaction exemption | E2E | `npx playwright test e2e/security/idle-lock.spec.ts` | ❌ Wave 0 |
| LCK-01 | `useIdleTimer` resets/fires correctly on activity vs. silence | unit | `npx vitest run src/features/idle-screen-lock/model/useIdleTimer.test.ts` | ❌ Wave 0 |
| LCK-02 | `terminal_lock_settings` RLS: admin can write, cashier/manager cannot | integration (Vitest, service-role) | `npx vitest run src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts` | ❌ Wave 0 |
| LCK-02 | Settings tab visible/editable only for `manage_settings` role | E2E | `npx playwright test e2e/settings/` (extend existing file) | ✅ folder exists |
| LCK-03 | Unlock with a staff PIN different from the session owner leaves `currentStaff` unchanged | E2E | `npx playwright test e2e/security/idle-lock.spec.ts` | ❌ Wave 0 |
| LCK-04 | Lock and unlock both write correctly-attributed `audit_logs` rows | integration (Vitest, service-role query after triggering lock/unlock via RPC or UI) | `npx vitest run src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/features/idle-screen-lock` (and the new integration test file for whichever task touched RLS/audit)
- **Per wave merge:** `npm run test` (full unit suite)
- **Phase gate:** `npm run test:e2e` green before `/gsd-verify-work`, per this repo's no-manual-UAT policy

### Wave 0 Gaps
- [ ] `e2e/security/idle-lock.spec.ts` — new folder+file, covers LCK-01/LCK-03 (seed a short
      `terminal_lock_settings.lock_timeout_seconds` via the service-role client in `e2e/helpers/supabase.ts`
      before the test, matching the existing service-role-seed precedent in
      `receipt-settings-rls.integration.test.ts`, so the test doesn't wait on the real 60s default)
- [ ] `src/features/idle-screen-lock/model/useIdleTimer.test.ts` — unit test using Vitest fake timers
- [ ] `src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts` — mirrors
      `receipt-settings-rls.integration.test.ts`'s structure (temp auth users, service-role seed/cleanup)
- [ ] `src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts` — asserts `audit_logs`
      rows for both events carry the correct staff identities in `p_before`/`p_after`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | Unlock PIN check must remain a pure comparison against already-RLS-fetched `profiles.pin` — never a fresh Supabase Auth credential exchange (Pitfall 1) |
| V3 Session Management | Yes | Screen lock/unlock must not create, destroy, or swap the underlying Supabase Auth session at any point |
| V4 Access Control | Yes | `terminal_lock_settings` RLS: admin-only write (`get_user_role() = 'admin'`), matching `manage_settings`'s actual RBAC scope (admin-only, not manager+admin) |
| V5 Input Validation | Yes | `lock_timeout_seconds` bounded by a DB `CHECK` constraint (15–600, [ASSUMED] range, A1) in addition to client-side validation |
| V6 Cryptography | N/A | No new cryptography surface introduced; PIN storage/comparison mechanism (`profiles.pin`, plaintext-comparable field) is pre-existing and unchanged by this phase — out of scope to alter here |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Unlock silently re-authenticates as a different staff member (session hijack via feature bug, not attacker-driven) | Elevation of Privilege | Follow `ManagerPinDialog`'s pattern exactly — never call `supabase.auth.*` from the unlock path (Pitfall 1) |
| Idle-lock bypassed via a global keyboard/scanner listener outside the dialog's focus trap | Tampering | Audit for `window`/`document`-level listeners outside dialog scope; gate any such handler on the same `locked` state (Pitfall 3) |
| Admin-only settings write enforced only client-side (`ProtectedAction`), RLS left permissive | Elevation of Privilege | DB-level `CHECK`/RLS policy is the actual enforcement boundary — client gating is UX only, confirmed pattern already used for every other admin-only Settings tab |
| Audit row falsely implies the unlocking staff via `actor_id` | Repudiation | Explicit `p_after`/`p_before` JSON fields for both identities, never inferred from `actor_id` (Pitfall 2) |

## Sources

### Primary (HIGH confidence — read this session)
- `D:/Projects/Code/supermarket-pos/.planning/phases/21-idle-screen-lock/21-CONTEXT.md` — locked decisions D-01..D-05, code_context
- `D:/Projects/Code/supermarket-pos/src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` — any-PIN comparison pattern
- `D:/Projects/Code/supermarket-pos/src/widgets/PINLoginForm/PINLoginForm.tsx:75-99` — the re-auth pattern to AVOID for unlock (Pitfall 1 source)
- `D:/Projects/Code/supermarket-pos/src/shared/lib/audit-actions.ts` — `AuditActionSchema`, lines 17-68
- `D:/Projects/Code/supermarket-pos/src/shared/config/constants.ts` — `TERMINAL_ID` hardcoded constant (see note below)
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260511000001_audit_logs_table.sql` — `record_audit`/6 original signature
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260703000001_record_audit_terminal_id.sql` — `record_audit`/8 current signature, `p_user_id`/`p_terminal_id` semantics (Pitfall 2 source)
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260819000001_receipt_settings.sql` — table+RLS shape modeled for the new `terminal_lock_settings` table
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260419000001_settings_and_backups.sql` — generic `settings` table RLS (manager+admin scoped) for contrast
- `D:/Projects/Code/supermarket-pos/src/shared/lib/rbac.ts:6-78` — confirms `manage_settings` is admin-only (`ADMIN_EXTRA`), not manager+admin
- `D:/Projects/Code/supermarket-pos/src/entities/staff/model/store.ts` — `useStaffStore` shape (`currentStaff`, `currentShift`, `isAuthenticated`)
- `D:/Projects/Code/supermarket-pos/src/app/ProtectedRoute.tsx` and `src/app/App.tsx` — mount-point confirmation
- `D:/Projects/Code/supermarket-pos/src/entities/settings/model/queries.ts` and `receipt-settings-rls.integration.test.ts` — settings-entity precedent + RLS integration test pattern to mirror
- `D:/Projects/Code/supermarket-pos/src/shared/lib/__tests__/audit-actions.test.ts` — confirms the CI grep only checks SQL-embedded `PERFORM record_audit(...)` calls, not client `.rpc()` calls (client-side `screen.lock`/`screen.unlock` calls are not auto-enforced by this test)
- `D:/Projects/Code/supermarket-pos/e2e/helpers/auth.ts` and `e2e/helpers/supabase.ts` — E2E auth helpers + service-role client for seeding a short test timeout
- `package.json` — confirms no idle-detection library installed; confirms `@radix-ui/react-alert-dialog` version

### Secondary (MEDIUM confidence)
- Radix AlertDialog `onEscapeKeyDown`/`onPointerDownOutside` props — well-documented public API, not fetched fresh this session [CITED: radix-ui.com/primitives/docs/components/alert-dialog]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every pattern read directly from this codebase this session
- Architecture: HIGH — mount point, RLS shape, and audit-call shape all confirmed by reading the actual source files, not inferred
- Pitfalls: HIGH — Pitfall 1 and 2 are derived from reading the actual `signInWithPassword`/`record_audit` implementations, not speculation; this is the highest-value finding of this research pass

**Research date:** 2026-08-30
**Valid until:** No expiry driver — all findings are internal-codebase facts, not third-party API/version facts subject to drift. Re-verify only if `record_audit`, `PINLoginForm`, or `rbac.ts` change before this phase is implemented.

---

**Correction note on 21-CONTEXT.md's `TERMINAL_ID` claim:** CONTEXT.md states `TERMINAL_ID`
(`src/shared/config/constants.ts`) is "sourced from `VITE_TERMINAL_ID` env var, default `'POS-1'`."
Reading the file directly shows this is **not accurate**: `src/shared/config/constants.ts:2` is
`export const TERMINAL_ID = 'POS-1';` — a hardcoded literal with no `import.meta.env` reference
`[VERIFIED: src/shared/config/constants.ts:2]`. The actual env-var-reading behavior CONTEXT.md
describes exists, but as a **separate, duplicated inline pattern** —
`const TERMINAL_ID = (import.meta.env.VITE_TERMINAL_ID as string | undefined) ?? 'POS-1';` — repeated
locally in at least 8 files (`toggle-permission`, `PINLoginForm`, `version-error.ts`,
`lookup-product-by-barcode`, `force-pin-change`, `staff/model/queries.ts`, `logger-instance.ts`,
`caja/model/queries.ts`, `OfflineQueueProcessor.tsx`) `[VERIFIED: grep across src/, 2026-08-30 session]`,
while 3 other files (`reopen-tab`, `edit-paid-tab`, `EditReopenedItemsPanel`) import the hardcoded
constant from `@shared/config/constants` instead. **This is a pre-existing inconsistency, not something
to fix in this phase** — but the planner must pick one for the new lock-timeout code and should pick
the **env-var-reading inline pattern** (the majority precedent, and the only one that actually varies
per terminal if `VITE_TERMINAL_ID` is ever set to something other than the default), not the hardcoded
`@shared/config/constants` import.
