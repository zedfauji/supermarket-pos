---
phase: 22-admin-pin-reset-server-side-recovery-path
reviewed: 2026-08-31T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - supabase/functions/admin-reset-pin/index.ts
  - src/features/admin-reset-pin/index.ts
  - src/features/admin-reset-pin/model/useAdminResetPin.ts
  - src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx
  - src/features/admin-reset-pin/ui/AdminResetPinDialog.test.tsx
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/edge-function-contracts.test.ts
  - src/shared/lib/audit-actions.ts
  - src/shared/lib/__tests__/audit-actions.test.ts
  - src/widgets/StaffDashboard/StaffDashboard.tsx
  - src/shared/lib/i18n/locales/en-US/staff.json
  - src/shared/lib/i18n/locales/es-MX/staff.json
  - e2e/rbac/staff-management.spec.ts
findings:
  critical: 0
  warning: 5
  info: 1
  total: 6
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-08-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the `admin-reset-pin` edge function and its client-side feature (dialog, mutation hook,
edge-function contract, audit-action registration, StaffDashboard wiring, i18n catalogs, and the
RBAC/e2e coverage). The core security properties the phase was designed around all hold up:

- The admin-only role gate is enforced server-side (`role !== 'admin'` → 403), confirmed by
  `e2e/rbac/staff-management.spec.ts` SM10 for both `cashier` and `manager` callers and for an
  unauthenticated caller.
- The dual-write is correctly ordered `auth.users` → `profiles`, and the partial-failure branch
  (profiles update fails after the auth write succeeds) is handled distinctly: it returns a
  `PARTIAL_FAILURE`-prefixed 500, is unit-tested end-to-end through
  `mapAdminResetPinEdgeError` (`edge-function-contracts.test.ts`), and is audit-logged with an
  explicit `partialFailure: true` marker rather than silently swallowed.
- The raw new PIN is never logged or audited in plaintext anywhere in the reviewed files — every
  `recordAudit()` call for this action logs only `{ mustChangePin: true }` or
  `{ partialFailure: true, ... }`.
- The confirm-gate (`ManagerPinDialog`) cannot be bypassed: `handleSubmitClick` only opens the
  gate, and the mutation only fires from the gate's `onSuccess` callback, which itself only fires
  after a PIN match against an admin-role staff member. This is directly asserted by
  `AdminResetPinDialog.test.tsx`'s "never calls the mutation directly" test.
- `manage_staff` (gating both the UI button and `ManagerPinDialog`'s `eligibleStaff` filter) is
  admin-only in `rbac.ts`'s `ADMIN_EXTRA` set, so the client-side gate and the server-side gate
  agree — a manager can neither see the button nor pass the confirm-PIN check.
- `AuditActionSchema` / `audit-actions.test.ts` were correctly extended with a new sibling test
  that scans `supabase/functions/*/index.ts` for `recordAudit()` calls (the original test only
  scanned SQL migrations for `PERFORM record_audit(...)`, which would have missed this edge
  function entirely).

The issues below are all quality/robustness gaps rather than exploitable bugs — none block the
core recovery-path guarantee, but several degrade the admin's experience specifically in the
failure paths this phase exists to make safe.

## Warnings

### WR-01: Confirm-gate dialog stays open (with a disabled keypad) after a reset failure

**File:** `src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx:64-82`

**Issue:** `handleConfirmedReset` only closes the `ManagerPinDialog` confirm gate
(`setConfirmGateOpen(false)`) on the success path. On failure (both the generic-failure and the
`PIN_RESET_PARTIAL_FAILURE` branches) it shows a toast and `return`s without closing the gate.
This deviates from the established pattern in this codebase — `RefundSheet.tsx` (the file whose
composition this dialog's own test comments cite as prior art) closes its `ManagerPinDialog`
*immediately* in `onSuccess`, before the mutation even fires:

```tsx
// RefundSheet.tsx:322-330
<ManagerPinDialog
  open={pinOpen}
  onOpenChange={setPinOpen}
  requiredAction="process_refund"
  onSuccess={() => {
    setPinOpen(false);
    void handleSubmitRefund();
  }}
/>
```

Because `AdminResetPinDialog` defers the close to inside the async continuation, and `PINKeypad`
disables all keys once `value.length >= maxLength` (per `ManagerPinDialog.tsx:36-44`'s own
comment) and `ManagerPinDialog`'s `handlePinComplete` never clears `pin` on the success path, a
failed reset leaves the admin looking at a full-length, disabled PIN keypad with no visible error
text (the toast may already have auto-dismissed) — the only way out is the "Cancel" button in the
`AlertDialog` footer. This is exactly the failure surface (partial-failure / generic failure) the
phase is meant to make legible to the admin, and today it looks frozen instead.

**Fix:**
```tsx
<ManagerPinDialog
  open={confirmGateOpen}
  onOpenChange={setConfirmGateOpen}
  requiredAction="manage_staff"
  onSuccess={() => {
    setConfirmGateOpen(false);
    void handleConfirmedReset();
  }}
/>
```
(and drop the now-redundant `setConfirmGateOpen(false)` from the success branch of
`handleConfirmedReset`, matching `RefundSheet`'s shape exactly).

### WR-02: No test coverage for the failure / partial-failure toast paths

**File:** `src/features/admin-reset-pin/ui/AdminResetPinDialog.test.tsx`

**Issue:** The test file covers PIN validation, the collision warning, and that submit never
calls the mutation directly — but nothing exercises `handleConfirmedReset`'s two failure branches
(`PIN_RESET_PARTIAL_FAILURE` → `resetPin.partialFailureToast`, and any other error →
`resetPin.genericFailure`), even though `mutateAsyncMock` is already mocked and trivially
returnable as an `Err(...)`. Given this phase's explicit focus on making the partial-failure path
visible and non-silent, the one component that renders that message to the admin has zero
assertions proving it renders the right copy for the right error code.

**Fix:** Add two cases to the existing "clicking submit only opens the confirm gate" test (or a
new `describe` block) that mock `ManagerPinDialog`'s `onSuccess` to fire directly, have
`mutateAsyncMock` resolve to `{ ok: false, error: { code: 'PIN_RESET_PARTIAL_FAILURE', ... } }`
and to a generic error respectively, and assert `toastErrorMock` was called with
`'resetPin.partialFailureToast'` / `'resetPin.genericFailure'`.

### WR-03: `resetPin.pinMismatch` is dead i18n content — no PIN-mismatch feedback is ever shown

**File:** `src/shared/lib/i18n/locales/en-US/staff.json:49`, `src/shared/lib/i18n/locales/es-MX/staff.json:49`

**Issue:** Both locale catalogs define `resetPin.pinMismatch` ("PINs don't match — re-enter both
fields." / "Los PIN no coinciden — vuelve a ingresar ambos campos."), but it is never referenced
anywhere in `AdminResetPinDialog.tsx` (confirmed via repo-wide grep — the only live consumer of a
`pinMismatch` key is `CreateStaffDialog.tsx`'s `addStaff.pinMismatch`, via a toast). In
`AdminResetPinDialog`, a mismatch between "New PIN" and "Confirm New PIN" is communicated purely
by leaving the Submit button disabled, with no inline message or toast explaining why — unlike
`CreateStaffDialog`, which toasts `addStaff.pinMismatch` on submit-with-mismatch. The key was
clearly authored with the intent to surface this feedback and the wiring was dropped.

**Fix:** Either render the message inline under the "Confirm New PIN" field when both fields are
6 digits and don't match (mirroring the existing `collision` conditional just below it), or toast
it on a submit attempt, and delete the key if intentionally unused.

### WR-04: Edge function checks the target's `is_active` but never the caller's

**File:** `supabase/functions/admin-reset-pin/index.ts:58-69` vs `:93-110`

**Issue:** D-06's target-must-be-active check (`if (!targetProfile.is_active)` → 400) has no
symmetric check on the caller (`callerProfile`) at the earlier role-gate (`:58-69` only checks
`callerProfile.role !== 'admin'`, never `callerProfile.is_active`). A deactivated admin account
(role still `admin`, `is_active: false`) whose Supabase Auth session/JWT is still technically
valid can still successfully reset another staff member's PIN through this endpoint. This mirrors
`create-staff/index.ts`'s identical gap (also no `is_active` check on the caller), so it isn't a
regression introduced by this phase, but it's present in the file under review and is worth
closing now that a second admin-privileged edge function has landed with the same hole.

**Fix:** Extend the caller-profile select to `role, is_active` and fold it into the existing 403
branch: `if (callerProfileError || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active)`.

### WR-05: Resetting a PIN does not invalidate the target's existing session

**File:** `supabase/functions/admin-reset-pin/index.ts:112-122`

**Issue:** After `supabaseAdmin.auth.admin.updateUserById(targetStaffId, { password: newPin })`
succeeds, no call is made to revoke the target's existing sessions
(`supabaseAdmin.auth.admin.signOut(targetStaffId, 'global')` or equivalent). For a feature framed
as a "server-side recovery path" — i.e. plausibly used when a PIN is suspected compromised — an
already-issued access/refresh token pair for the target account remains valid until it naturally
expires, undermining the recovery guarantee: an attacker who already has a live session for the
target is unaffected by the PIN reset.

**Fix:** After the `profiles` update succeeds, best-effort call
`await supabaseAdmin.auth.admin.signOut(targetStaffId, 'global')` (or the current SDK's equivalent
sign-out-all-sessions call), logging but not failing the request if it errors — same
fire-and-forget posture already used for `recordAudit`.

## Info

### IN-01: `req.method` is never validated

**File:** `supabase/functions/admin-reset-pin/index.ts:16-17`

**Issue:** The handler only special-cases `OPTIONS`; any other verb (e.g. `GET` with a JSON body,
if some intermediary allowed one) falls through to the same mutating logic as `POST`. This mirrors
`create-staff/index.ts`'s identical omission, so it's shared debt rather than new, but worth
noting since it's present in a second privileged mutating endpoint now.

**Fix:** `if (req.method !== 'POST' && req.method !== 'OPTIONS') return new Response(..., { status: 405 })`.

---

_Reviewed: 2026-08-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
