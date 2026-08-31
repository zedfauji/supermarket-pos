# Phase 21: Idle Screen Lock - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 10 (new + modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/2026XXXX_terminal_lock_settings.sql` | migration | CRUD | `supabase/migrations/20260819000001_receipt_settings.sql` | exact (same shape, deviate on RLS role check) |
| `src/shared/lib/audit-actions.ts` (extend) | config | CRUD | itself (existing enum) | exact |
| `src/entities/settings/model/queries.ts` (extend) | service/hook | CRUD | `useReceiptSettings`/`useMutationUpdateReceiptSettings` in same file | exact |
| `src/features/idle-screen-lock/model/useIdleTimer.ts` | utility/hook | event-driven | none in-repo (novel DOM-listener hook) — RESEARCH.md Pattern 1 supplies full code | no analog |
| `src/features/idle-screen-lock/model/useIdleLockAudit.ts` | service/hook | request-response | `src/features/toggle-permission/useMutationTogglePermission.ts` | exact (record_audit call shape) |
| `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx` | component | request-response | `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` | exact (minus role filter, minus Cancel) |
| `src/features/idle-screen-lock/ui/IdleLockProvider.tsx` | provider | event-driven | `src/shared/ui/ClockDriftBanner.tsx`-style always-mounted provider (role-match only; not read this pass, mount pattern taken from `App.tsx` instead) | role-match |
| `src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx` | component | CRUD | `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` | exact |
| `src/widgets/SettingsTabsPanel/index.tsx` (extend) | component | CRUD | itself (existing tab-registration array) | exact |
| `src/app/App.tsx` (extend) | provider/root | event-driven | itself (existing mount order) | exact |

## Pattern Assignments

### `supabase/migrations/2026XXXX_terminal_lock_settings.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260819000001_receipt_settings.sql`

Full replacement SQL already drafted in RESEARCH.md "Code Examples → New migration". Key deviations from the analog, both load-bearing:

1. **Primary key is `terminal_id TEXT` (the actual `TERMINAL_ID` value), not a generated UUID** — this table is genuinely one row per terminal, unlike `receipt_settings`'s singleton UUID.
2. **Write policies check `get_user_role() = 'admin'`**, not `IN ('manager', 'admin')` (lines 46-48 of the analog). `manage_settings` is admin-only per `src/shared/lib/rbac.ts:59-64` (`ADMIN_EXTRA`) — copying the analog's manager+admin check verbatim would be a real RBAC bug, not cosmetic.

Copy verbatim from analog: `ENABLE ROW LEVEL SECURITY`, the `update_updated_at_column()` trigger wiring, the `NOTIFY pgrst, 'reload schema';` + `BEGIN;`/`COMMIT;` wrapper, and the DOWN-script-as-comment convention (analog lines 59-70).

Add: `CHECK (lock_timeout_seconds BETWEEN 15 AND 600)` on the column, per UI-SPEC's confirmed 15-600 range.

---

### `src/shared/lib/audit-actions.ts` (config, CRUD)

**Analog:** itself — `AuditActionSchema` (lines 17-68, read in full).

Append two entries to the existing `z.enum([...])` array, following the file's own `// Comment section` grouping convention (e.g. `// Screen lock`):
```typescript
// Screen lock (Phase 21)
'screen.lock',
'screen.unlock',
```
Must land **before** any `record_audit()` call uses these values (file's stated convention, header comment lines 10-13). Note (from `RESEARCH.md` Sources): the CI grep test (`src/shared/lib/__tests__/audit-actions.test.ts`) only checks SQL-embedded `PERFORM record_audit(...)` calls, not client `.rpc()` calls — so this addition isn't auto-enforced by that test, but must still be added first per the file's stated convention and to satisfy the Zod schema if it's ever used to validate client payloads.

---

### `src/entities/settings/model/queries.ts` (service/hook, CRUD)

**Analog:** `useReceiptSettings` / `useMutationUpdateReceiptSettings` in the same file (lines 307-368, read in full).

**Query pattern to copy** (lines 307-333) — note the `.maybeSingle()` + explicit null-check, NOT `supabaseQuery()` (which treats a null row as `NOT_FOUND`, wrong here since an empty table before first save is a legitimate starting state):
```typescript
export function useTerminalLockSettings() {
  const query = useQuery({
    queryKey: terminalLockSettingsKeys.all,
    queryFn: async (): Promise<Result<TerminalLockSettings>> => {
      const { data, error } = await supabase
        .from('terminal_lock_settings')
        .select('*')
        .eq('terminal_id', TERMINAL_ID)
        .maybeSingle();
      if (error) {
        logger.error('terminal_lock_settings.fetch_failed', { message: error.message, code: error.code });
        return err(parseSupabaseError(error));
      }
      return ok(data ? mapRow(data) : DEFAULT_LOCK_TIMEOUT_SECONDS);
    },
    staleTime: 30 * 1000,
  });
  const r = query.data;
  return { ...query, data: r?.ok ? r.data : undefined, resultError: r && !r.ok ? r.error : undefined, isIdleOrLoading: query.isPending || query.isLoading };
}
```

**Mutation pattern to copy** (lines 335-368) — upsert keyed on `terminal_id` instead of the receipt table's fixed singleton `id`:
```typescript
export function useMutationUpdateTerminalLockSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lockTimeoutSeconds: number): Promise<Result<void>> => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('terminal_lock_settings')
        .upsert({ terminal_id: TERMINAL_ID, lock_timeout_seconds: lockTimeoutSeconds, updated_by: user?.id ?? null }, { onConflict: 'terminal_id' })
        .select('terminal_id')
        .single();
      if (error) {
        logger.error('terminal_lock_settings.update_failed', { message: error.message, code: error.code });
        return err(parseSupabaseError(error));
      }
      return ok(undefined);
    },
    onSuccess: result => { if (result.ok) void queryClient.invalidateQueries({ queryKey: terminalLockSettingsKeys.all }); },
  });
}
```
Per RESEARCH.md's inconsistency note: use the **env-var-reading inline `TERMINAL_ID` pattern** (`(import.meta.env.VITE_TERMINAL_ID as string | undefined) ?? 'POS-1'`, copied from `toggle-permission`'s own local const, see below), not the hardcoded `@shared/config/constants` import — majority precedent (8 of 11 files) and the only one that actually varies per terminal.

---

### `src/features/idle-screen-lock/model/useIdleLockAudit.ts` (service/hook, request-response)

**Analog:** `src/features/toggle-permission/useMutationTogglePermission.ts` (full file read, 117 lines).

**Imports + local TERMINAL_ID pattern** (lines 1-15):
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@shared/lib/logger-instance';
import { err, ok, type Result } from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';

const db = supabase as any; // ponytail-equivalent cast if record_audit isn't typed yet — check supabase.types.ts first, this file already has it typed for other RPCs
const TERMINAL_ID = (import.meta.env.VITE_TERMINAL_ID as string | undefined) ?? 'POS-1';
```

**`record_audit` call shape** (lines 51-67, 90-106) — this is the exact shape to reuse for both lock and unlock events, with `p_user_id: null` always (session identity never changes, Pitfall 1/2 from RESEARCH.md):
```typescript
const auditRes = await db.rpc('record_audit', {
  p_action: 'screen.lock', // or 'screen.unlock'
  p_entity_type: 'shift',
  p_entity_id: currentShift?.id ?? null,
  p_before: null, // or sessionOwner payload for unlock
  p_after: { sessionOwnerStaffId: currentStaff?.id, sessionOwnerStaffName: currentStaff?.name },
  p_source: 'client',
  p_terminal_id: TERMINAL_ID,
  p_user_id: null,
});
if (auditRes?.error) {
  logger.warn('screen.lock.audit_failed', { message: auditRes.error.message });
}
```
Non-blocking on audit failure — copy the `logger.warn` (not `err()`) treatment from the analog (lines 61-67): a failed audit write must never block the lock/unlock UX itself.

Full lock/unlock `p_before`/`p_after` payload shapes are in RESEARCH.md "Code Examples → Lock/unlock record_audit calls" — copy verbatim, do not re-derive.

---

### `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx` (component, request-response)

**Analog:** `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (full file read, 105 lines).

**Imports pattern** (lines 1-16) — copy verbatim, drop `canAccess`/`StaffAction` (no role filter per D-04), drop `AlertDialogCancel`:
```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffList } from '@entities/staff/model/queries';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  PINKeypad,
} from '@shared/ui';
```

**PIN comparison — the safety-critical pattern (RESEARCH.md Pitfall 1)** (lines 65-78, with the role filter removed per D-04):
```typescript
const { data: staffList, isIdleOrLoading } = useStaffList();

function handlePinComplete(enteredPin: string) {
  const match = (staffList ?? []).find(s => s.pin === enteredPin);
  if (match) {
    onUnlock(match); // pass matched staff up for the audit p_after payload — never call supabase.auth.*
  } else {
    setError(t('idleLock.incorrectPin'));
    setPin('');
  }
}
```
**Never** copy `PINLoginForm`'s `supabase.auth.signInWithPassword(...)` pattern here (`src/widgets/PINLoginForm/PINLoginForm.tsx:82-85`) — that would swap the active session, violating D-04.

**Non-dismissable AlertDialog** (new — RESEARCH.md Pattern 3, no analog in this codebase yet since `ManagerPinDialog` IS dismissable via Cancel):
```typescript
<AlertDialogContent
  onEscapeKeyDown={e => e.preventDefault()}
  onPointerDownOutside={e => e.preventDefault()}
>
  {/* no AlertDialogCancel / AlertDialogFooter — only a correct PIN closes this */}
</AlertDialogContent>
```

**PINKeypad usage** — per UI-SPEC, omit the `label` prop entirely (unlike `ManagerPinDialog`'s `label={t('managerPinGate.pinLabel')}` at line 94) to stay at 2 font weights:
```typescript
<PINKeypad
  value={pin}
  onChange={setPin}
  onComplete={handlePinComplete}
  error={error}
  isLoading={isIdleOrLoading}
/>
```

Copy the `prevOpen`/render-time-reset pattern (analog lines 48-55) verbatim if the overlay is kept mounted across lock/unlock cycles rather than conditionally rendered.

---

### `src/features/idle-screen-lock/model/useIdleTimer.ts` (utility/hook, event-driven)

**No in-repo analog** — RESEARCH.md's own draft (Pattern 1, ~30 lines) is the closest thing to a source; copy that verbatim, it was written for this exact purpose this session:
```typescript
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
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, reset, { passive: true, capture: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset, { capture: true });
    };
  }, [timeoutMs, onIdle, enabled]);
}
```
Critical: pass `enabled={isAuthenticated && !locked}` (Pitfall 4) — timer must fully pause while overlay is open, not just be ignored, or PIN keystrokes reset the "time until re-lock" timer.

---

### `src/features/idle-screen-lock/ui/IdleLockProvider.tsx` (provider, event-driven)

**Analog (mount pattern only):** `src/app/App.tsx` itself (full file read, 22 lines) — confirms the exact insertion point.

```typescript
// src/app/App.tsx — EXTEND, insert between ClockDriftBanner and Router:
<Providers>
  <ClockDriftBanner />
  <IdleLockProvider>
    <Router />
  </IdleLockProvider>
</Providers>
```
`IdleLockProvider` composes `useStaffStore(s => s.isAuthenticated)`, `useTerminalLockSettings()`, `useIdleTimer`, and renders `<IdleLockOverlay>` as a sibling of `{children}` (not wrapping/unmounting them) — this is what satisfies D-01 (route state, e.g. cart/payment modal, stays mounted underneath).

---

### `src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx` (component, CRUD)

**Analog:** `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` (full file read, 45 lines) — copy structure wholesale, swap the settings source and bounds.

```typescript
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutationUpdateTerminalLockSettings, useTerminalLockSettings } from '@entities/settings';
import type { UserRole } from '@shared/lib/domain';
import { Input, Label, POSButton, ProtectedAction } from '@shared/ui';

type Props = { currentRole: UserRole | null };

export function LockSettingsTab({ currentRole }: Props) {
  const { t } = useTranslation('wAdmin');
  const { data } = useTerminalLockSettings();
  const updateSetting = useMutationUpdateTerminalLockSettings();
  const [seconds, setSeconds] = useState('60');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (data && !dirty) setSeconds(String(data.lockTimeoutSeconds));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, dirty]);
  const save = async () => {
    const value = Number(seconds);
    if (!Number.isInteger(value) || value < 15 || value > 600) return;
    const result = await updateSetting.mutateAsync(value);
    if (!result.ok) return toast.error(result.error.message);
    setDirty(false);
    toast.success(t('lockSettingsTab.saved'));
  };
  return (
    <ProtectedAction action="manage_settings" currentRole={currentRole} disabled={updateSetting.isPending}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('lockSettingsTab.title')}</h2>
        <div className="space-y-2">
          <Label htmlFor="lock-timeout-threshold">{t('lockSettingsTab.thresholdLabel')}</Label>
          <Input id="lock-timeout-threshold" type="number" min={15} max={600} value={seconds} onChange={e => { setDirty(true); setSeconds(e.target.value); }} />
          <p className="text-xs text-muted-foreground">{t('lockSettingsTab.thresholdHint')}</p>
        </div>
        <POSButton type="button" touchSize="large" disabled={!dirty || updateSetting.isPending} onClick={() => { void save(); }}>
          {t('lockSettingsTab.saveButton')}
        </POSButton>
      </div>
    </ProtectedAction>
  );
}
```

---

### `src/widgets/SettingsTabsPanel/index.tsx` (component, CRUD — extend)

**Analog:** itself, the `canManageSettings` tab-push block (lines 39-67, read in full).

Add one entry to the same `out.push(...)` call that already includes `near-expiry` (inside the `if (canManageSettings)` block, since `manage_settings` gates both):
```typescript
import { LockSettingsTab } from './tabs/LockSettingsTab';
// ... inside out.push(..., { key: 'near-expiry', ... }):
{
  key: 'lock-timeout',
  label: t('tabs.lockTimeout'),
  render: () => <LockSettingsTab currentRole={currentRole} />,
},
```
Add the new `tabs.lockTimeout` key to the `settings` i18n namespace (both locales) alongside existing `tabs.nearExpiry`.

## Shared Patterns

### `record_audit` direct client call (non-blocking on failure)
**Source:** `src/features/toggle-permission/useMutationTogglePermission.ts:51-67, 90-106`
**Apply to:** `useIdleLockAudit.ts` (both lock and unlock calls)
```typescript
const auditRes = await db.rpc('record_audit', { p_action, p_entity_type, p_entity_id, p_before, p_after, p_source: 'client', p_terminal_id: TERMINAL_ID, p_user_id: null });
if (auditRes?.error) logger.warn('<action>.audit_failed', { message: auditRes.error.message });
```

### Client-side PIN comparison (never `supabase.auth.*`)
**Source:** `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx:65-78`
**Apply to:** `IdleLockOverlay.tsx`
```typescript
const match = (staffList ?? []).find(s => s.pin === enteredPin);
```

### Settings query/mutation pair keyed off a dedicated small table (not the generic `settings` table)
**Source:** `src/entities/settings/model/queries.ts:307-368` (`useReceiptSettings`/`useMutationUpdateReceiptSettings`)
**Apply to:** `useTerminalLockSettings`/`useMutationUpdateTerminalLockSettings` — same file, same `.maybeSingle()` + upsert-with-onConflict shape, keyed on `terminal_id` instead of a fixed singleton `id`.

### Admin-only Settings tab gating
**Source:** `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` (`<ProtectedAction action="manage_settings" ...>`)
**Apply to:** `LockSettingsTab.tsx` — identical gate, since `manage_settings` (D-02/LCK-02) is admin-only in `rbac.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/features/idle-screen-lock/model/useIdleTimer.ts` | utility/hook | event-driven | No prior idle-detection code exists in this codebase (confirmed via RESEARCH.md package.json grep — no idle-timer library either). RESEARCH.md's own Pattern 1 code block is the de facto source; use it verbatim rather than re-deriving. |
| `e2e/security/idle-lock.spec.ts` | test | request-response | New `e2e/security/` folder — no prior spec in that folder to model on; closest sibling conventions are `e2e/rbac/` (RLS-denial assertions) and `e2e/helpers/supabase.ts`'s service-role seed pattern used by `receipt-settings-rls.integration.test.ts`. |

## Metadata

**Analog search scope:** `src/features/manager-pin-gate/`, `src/features/toggle-permission/`, `src/entities/settings/model/`, `src/widgets/SettingsTabsPanel/`, `src/shared/lib/audit-actions.ts`, `src/shared/config/constants.ts`, `src/app/App.tsx`, `supabase/migrations/20260819000001_receipt_settings.sql`
**Files scanned:** 9 read in full (all ≤ 449 lines, single-pass reads, no re-reads)
**Pattern extraction date:** 2026-08-30
