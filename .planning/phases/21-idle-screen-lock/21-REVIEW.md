---
phase: 21-idle-screen-lock
reviewed: 2026-08-30T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - e2e/helpers/auth.ts
  - e2e/security/idle-lock-bypass.spec.ts
  - e2e/security/idle-lock-transactions.spec.ts
  - e2e/security/idle-lock.spec.ts
  - e2e/settings/lock-timeout.spec.ts
  - src/app/App.tsx
  - src/entities/settings/index.ts
  - src/entities/settings/model/index.ts
  - src/entities/settings/model/queries.ts
  - src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts
  - src/entities/settings/model/types.ts
  - src/features/idle-screen-lock/index.ts
  - src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts
  - src/features/idle-screen-lock/model/lock-state-store.ts
  - src/features/idle-screen-lock/model/useIdleLockAudit.ts
  - src/features/idle-screen-lock/model/useIdleTimer.test.ts
  - src/features/idle-screen-lock/model/useIdleTimer.ts
  - src/features/idle-screen-lock/ui/IdleLockOverlay.tsx
  - src/features/idle-screen-lock/ui/IdleLockProvider.tsx
  - src/shared/lib/audit-actions.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/i18n/locales/en-US/featOrders.json
  - src/shared/lib/i18n/locales/en-US/settings.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/featOrders.json
  - src/shared/lib/i18n/locales/es-MX/settings.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
  - src/widgets/SettingsTabsPanel/index.tsx
  - src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx
  - supabase/migrations/20260830000002_terminal_lock_settings.sql
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-08-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

The idle-lock plumbing itself (`useIdleTimer`, `lock-state-store`, `IdleLockProvider`, the `terminal_lock_settings` RLS/migration, the audit trail via `record_audit`) is careful and well-tested: timeout gating, RLS admin-only writes, and lock/unlock attribution all check out against their own stated design decisions (D-01/D-02/D-04/D-05), and the unit/integration/E2E suite genuinely exercises the tricky bits (cross-staff unlock, mid-transaction survival, barcode-scanner global-listener bypass).

However, the phase explicitly identified and fixed exactly one class of bug — a `window`-level `keydown` listener that keeps firing underneath the visual lock overlay regardless of focus (`useBarcodeScanner` in `CheckoutPanel`, RESEARCH.md "Pitfall 3") — but did not apply the same fix to the other components in the codebase that share the identical pattern. `ConfirmDialog` (`src/shared/ui/ConfirmDialog.tsx`) registers an un-gated global `keydown` listener that auto-fires a real mutation on Enter, and it is used directly inside the in-progress payment flow the phase's own E2E suite (`idle-lock-transactions.spec.ts`) claims to have locked down. This is a genuine, demonstrable bypass of the lock and is filed as the sole Critical finding below. A handful of smaller robustness/consistency gaps (no PIN-attempt throttling on the unlock overlay, no Zod validation on the fetched timeout value, a silent no-op on invalid Lock Settings input) round out the Warnings.

## Critical Issues

### CR-01: `ConfirmDialog`'s global Enter-to-confirm listener is not gated on idle-lock state — mid-transaction actions (e.g. payment retry) can be executed blind while the terminal is locked

**File:** `src/shared/ui/ConfirmDialog.tsx:110-127`
**Also affected:** `src/widgets/PaymentModal/ui/PaymentForm.tsx:1056-1069` (concrete exploitable instance), plus every other caller of `ConfirmDialog` (`RemoveTabItemDialog`, `EditPaidTabDialog`, `ClockOutDialog`, `ForcePinChangeDialog`, `SupplierListPanel`, `CatalogProductsTab`, `CatalogModifiersTab`, `PurchaseOrderListPanel`, `ModifierGroupEditor`, `BackupSettingsTab`).

**Issue:** This phase explicitly identified and fixed the "global `window`-level listener keeps firing underneath the visual lock overlay" bug class for `useBarcodeScanner` — `CheckoutPanel.tsx` gates it with `!locked` from `useLockStateStore`, and `idle-lock-bypass.spec.ts` proves it. But `ConfirmDialog`'s own `keydown` effect has the exact same shape (`window.addEventListener('keydown', ...)`, unscoped to any focused/visible element) and was never given the same gate:

```tsx
// src/shared/ui/ConfirmDialog.tsx
useEffect(() => {
  if (!open || isLoading) return;          // <-- no `locked` check

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleConfirm();                 // <-- fires the real onConfirm callback
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [open, isLoading, handleConfirm, handleCancel]);
```

`IdleLockProvider`/D-01 requires "no exemption, even mid-transaction" — the wrapped route (including any already-open `ConfirmDialog`) is deliberately never unmounted when the lock engages, only visually covered by the overlay. Radix's focus trap moves *keyboard focus* into the lock overlay, but this listener is attached to `window`, not to any DOM node inside the dialog, so it never cared about focus in the first place — it fires on **any** Enter keypress anywhere in the document, exactly like the barcode-scanner bug this phase fixed.

Concretely, `PaymentForm.tsx` renders `<ConfirmDialog open={showOfflineDialog} ... onConfirm={() => { setShowOfflineDialog(false); void (isSplitMode ? handleSplitPrimary() : handlePrimary()); }} />` — the "retry after offline" dialog. If the idle timer fires while that dialog happens to be open (a realistic scenario: staff walks away right after a network blip during checkout), a single physical Enter keypress from anyone standing at the terminal — no PIN, no click, the overlay never even has to be interacted with — re-submits the payment. This directly contradicts `idle-lock-transactions.spec.ts`'s own stated intent ("the payment modal is not closed/unmounted underneath the overlay... a bounded click against it must time out, never actually submitting payment") — the spec only checked the *click* path, not the keyboard path, so it does not catch this.

The same gap exists for every other `ConfirmDialog` consumer: if any of them is open at lock time (e.g. `RemoveTabItemDialog`'s destructive removal, `EditPaidTabDialog`'s save, `SupplierListPanel`'s delete confirm), Enter fires the confirm callback while the screen is locked.

**Fix:** Gate the listener on the same lock-state store `useBarcodeScanner`/`CheckoutPanel` already use — this is the single choke point every `ConfirmDialog` instance routes through, so fixing it here (rather than in each of the ~10 call sites) closes the gap for all of them at once:

```tsx
import { useLockStateStore } from '@features/idle-screen-lock/model/lock-state-store';
// ...
const locked = useLockStateStore(s => s.locked);

useEffect(() => {
  if (!open || isLoading || locked) return;
  // ... unchanged
}, [open, isLoading, locked, handleConfirm, handleCancel]);
```

(Note: `shared/ui` importing from `features/idle-screen-lock` would invert the FSD dependency direction — either move `lock-state-store` down into `shared/lib`, or re-export a thin read-only `isLocked()` accessor from `shared/lib` that `features/idle-screen-lock` also uses, so `shared/ui/ConfirmDialog.tsx` can depend on it without violating the `app → pages → widgets → features → entities → shared` import boundary.)

## Warnings

### WR-01: `WeightEntryDialog`'s global numeric-entry listener has the same un-gated pattern (lower-impact variant of CR-01)

**File:** `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:48-65`
**Issue:** Same shape as CR-01 — a `window`-level `keydown` listener gated only on `open`, not on lock state:
```tsx
useEffect(() => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (/^[0-9]$/.test(event.key)) setValue(current => current + event.key);
    // ...
  };
  window.addEventListener('keydown', onKeyDown);
  ...
}, [open, value]);
```
Unlike CR-01, committing the entered weight still requires clicking the "Confirm"/"Edit" button, which is visually occluded by the lock overlay and would fail Playwright's actionability check the same way `idle-lock-transactions.spec.ts` proves for the payment button — so this does not, by itself, mutate the cart while locked. But it does let a physical numeric keypad silently rewrite the pending weight value behind the overlay, which is then whatever a legitimate staff member commits after unlocking (without having typed it themselves) — a lower-severity variant of the same missing-gate root cause. Fix the same way: add a `locked` check to the effect's early return.

### WR-02: No throttling/lockout on repeated incorrect-PIN attempts at the idle-lock overlay

**File:** `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx:52-62`
**Issue:** `handlePinComplete` does a plain client-side `find(s => s.pin === enteredPin)` against the active staff list with no attempt counter, delay, or lockout — an attacker with physical access to an idle (but not yet re-locked-by-someone-else) terminal can try every PIN combination back-to-back with zero friction. This mirrors existing precedent elsewhere in the codebase (`ManagerPinDialog`), so it is not a regression introduced by this phase, but it is worth flagging here specifically because this overlay's entire purpose is to be the last line of defense against exactly this threat model (an idle, unattended terminal), unlike `ManagerPinDialog` which gates a single in-session action.
**Fix:** Add a simple incrementing-backoff or attempt cap (e.g. disable the keypad for N seconds after 5 consecutive wrong PINs) in `IdleLockOverlay`, independent of any future fix to `ManagerPinDialog`.

### WR-03: `useTerminalLockSettings` skips the Zod schema validation every sibling settings parser uses

**File:** `src/entities/settings/model/queries.ts:416-420`
**Issue:** Every other settings query in this file (`parseGeneral`, `parseBilling`, `parseEmailReceipts`, `parsePaymentLabels`, `parseReceipt`, `parseNearExpiry`) runs the fetched value through its Zod schema's `.safeParse()` and falls back to a typed default on failure. `useTerminalLockSettings` instead does a raw unchecked cast:
```ts
return ok(
  data
    ? { lockTimeoutSeconds: (data as { lock_timeout_seconds: number }).lock_timeout_seconds }
    : DEFAULT_TERMINAL_LOCK
);
```
`TerminalLockSettingsSchema` (imported into `model/types.ts`/`index.ts` and re-exported) is never actually applied here. In practice the DB `CHECK (lock_timeout_seconds BETWEEN 15 AND 600)` constraint makes an out-of-range value unlikely, but a `NULL`/malformed row (e.g. from a future migration bug or manual SQL edit) would silently propagate as `NaN`/`undefined` into `IdleLockProvider`'s `timeoutMs` calculation instead of falling back to `DEFAULT_TERMINAL_LOCK`, unlike every other setting in this file.
**Fix:**
```ts
return ok(
  data
    ? parseTerminalLock({ lockTimeoutSeconds: (data as { lock_timeout_seconds: number }).lock_timeout_seconds })
    : DEFAULT_TERMINAL_LOCK
);
// with: function parseTerminalLock(v: unknown) { const p = TerminalLockSettingsSchema.safeParse(v); return p.success ? p.data : DEFAULT_TERMINAL_LOCK; }
```

### WR-04: `LockSettingsTab.save()` silently no-ops on invalid input with no user feedback

**File:** `src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx:21-28`
**Issue:**
```ts
const save = async () => {
  const value = Number(seconds);
  if (!Number.isInteger(value) || value < 15 || value > 600) return;
  ...
};
```
If the admin types a value outside 15-600 (or a decimal — the `<Input type="number">` has no `step` restriction, so e.g. `120.5` is a valid browser-level value) and clicks "Save Timeout", the function returns with no error toast, no visual feedback, and the Save button remains enabled (`dirty` stays `true` since it's never reset). The admin has no way to tell whether the save silently failed or is still pending.
**Fix:** Surface a validation error via the existing `toast.error(...)` path (mirroring the server-error branch two lines below) instead of a bare `return`.

## Info

### IN-01: `IdleLockOverlay` shows the generic "incorrect PIN" error even when the true cause is a failed/empty staff-list fetch

**File:** `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx:52-62`
**Issue:** `useStaffList()`'s query function never throws on a Supabase error — it returns an `Err` `Result`, which TanStack Query treats as a successful fetch (`isPending`/`isLoading` both `false`), so `isIdleOrLoading` is `false` and the keypad is enabled even though `staffList` resolved to `undefined`. In that state, entering a genuinely correct PIN falls through to the `else` branch and shows `idleLock.incorrectPin` — indistinguishable from an actually wrong PIN — with no indication that the real problem is a stale/failed staff directory. A reload is the only recovery path, but nothing on screen suggests that.
**Fix:** Track `resultError`/`isError` from `useStaffList()` and render a distinct "couldn't load staff list, try again" state instead of routing an infra failure through the wrong-PIN error copy.

---

_Reviewed: 2026-08-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
