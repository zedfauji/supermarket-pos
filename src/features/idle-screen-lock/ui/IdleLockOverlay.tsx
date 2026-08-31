import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useStaffList } from '@entities/staff/model/queries';
import type { Staff } from '@shared/lib/domain';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  PINKeypad,
} from '@shared/ui';

export interface IdleLockOverlayProps {
  open: boolean;
  onUnlock: (staff: Staff) => void;
}

/**
 * Non-dismissable PIN-entry overlay shown while the terminal is idle-locked
 * (LCK-01). Modeled on ManagerPinDialog, minus two deliberate removals:
 *  - No role filter on candidate staff (D-04: ANY valid staff PIN unlocks).
 *  - No AlertDialogFooter/Cancel -- only a correct PIN closes this dialog.
 *    Escape is explicitly prevented below; Radix's AlertDialogContent
 *    already blocks outside-pointer dismissal by design.
 *
 * PIN comparison is a pure client-side string match against the fetched
 * staff list -- this handler MUST NEVER call any Supabase Auth sign-in/update
 * method (RESEARCH.md Pitfall 1), or a cross-staff unlock would silently swap
 * the active auth session, violating D-04.
 */
export function IdleLockOverlay({ open, onUnlock }: IdleLockOverlayProps) {
  const { t } = useTranslation('featOrders');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { data: staffList, isIdleOrLoading } = useStaffList();

  // Same render-time-reset pattern as ManagerPinDialog: this overlay stays
  // mounted across lock/unlock cycles (IdleLockProvider only toggles `open`),
  // so `pin`/`error` must clear every time `open` flips back to true or a
  // stale maxLength-reached `pin` would permanently disable every key.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPin('');
      setError('');
    }
  }

  function handlePinComplete(enteredPin: string) {
    const match = (staffList ?? []).find(s => s.pin === enteredPin);
    if (match) {
      setPin('');
      setError('');
      onUnlock(match);
    } else {
      setError(t('idleLock.incorrectPin'));
      setPin('');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={() => undefined}>
      <AlertDialogContent
        onEscapeKeyDown={e => {
          e.preventDefault();
        }}
      >
        {/* Radix's AlertDialogContent (unlike Dialog) already prevents
            outside-pointer dismissal by design -- only Escape needs an
            explicit preventDefault here. No AlertDialogCancel/Footer --
            only a correct PIN closes this dialog. */}
        <AlertDialogHeader>
          <AlertDialogTitle>{t('idleLock.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('idleLock.description')}</AlertDialogDescription>
        </AlertDialogHeader>

        <PINKeypad
          value={pin}
          onChange={setPin}
          onComplete={handlePinComplete}
          error={error}
          isLoading={isIdleOrLoading}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
