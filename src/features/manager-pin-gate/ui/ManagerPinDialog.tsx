import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useStaffList } from '@entities/staff/model/queries';
import { canAccess } from '@shared/lib/rbac';
import type { StaffAction } from '@shared/lib/rbac';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  PINKeypad,
} from '@shared/ui';

export interface ManagerPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredAction: StaffAction;
  onSuccess: () => void;
}

export function ManagerPinDialog({
  open,
  onOpenChange,
  requiredAction,
  onSuccess,
}: ManagerPinDialogProps) {
  const { t } = useTranslation('featOrders');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { data: staffList, isIdleOrLoading } = useStaffList();

  // This dialog stays mounted across open/close cycles (every caller renders
  // it unconditionally, only toggling `open`), and a successful PIN entry
  // closes it via the parent setting `open` to false directly — Radix's
  // onOpenChange (handleOpenChange below) only fires on a user-driven close
  // (Escape/outside-click/Cancel), never on a programmatic `open` prop
  // change. Without this, `pin` stays at maxLength from the prior success,
  // so PINKeypad's `disabled={value.length >= maxLength}` permanently locks
  // every key the next time this same dialog instance reopens.
  //
  // Adjusted during render (react.dev's "Adjusting state when a prop
  // changes" pattern) rather than in a useEffect, so the reset lands in the
  // same commit as the prop change instead of triggering an extra render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPin('');
      setError('');
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPin('');
      setError('');
    }
    onOpenChange(next);
  }

  const eligibleStaff = useMemo(
    () => (staffList ?? []).filter(s => canAccess(s.role, requiredAction)),
    [staffList, requiredAction]
  );

  function handlePinComplete(enteredPin: string) {
    const match = eligibleStaff.find(s => s.pin === enteredPin);
    if (match) {
      onSuccess();
    } else {
      setError(t('managerPinGate.incorrectPin'));
      setPin('');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('managerPinGate.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('managerPinGate.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <PINKeypad
          value={pin}
          onChange={setPin}
          onComplete={handlePinComplete}
          label={t('managerPinGate.pinLabel')}
          error={error}
          isLoading={isIdleOrLoading}
        />

        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
