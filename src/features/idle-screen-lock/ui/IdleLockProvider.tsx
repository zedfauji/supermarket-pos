import { useCallback, type ReactNode } from 'react';

import { useTerminalLockSettings } from '@entities/settings';
import { useStaffStore } from '@entities/staff/model/store';
import type { Staff } from '@shared/lib/domain';
import { useLockStateStore } from '../model/lock-state-store';
import { useIdleLockAudit } from '../model/useIdleLockAudit';
import { useIdleTimer } from '../model/useIdleTimer';
import { IdleLockOverlay } from './IdleLockOverlay';

const DEFAULT_LOCK_TIMEOUT_SECONDS = 60;

export interface IdleLockProviderProps {
  children: ReactNode;
}

/**
 * Mounted in App.tsx between ClockDriftBanner and Router. `children` is
 * ALWAYS rendered (D-01: the wrapped route's state -- cart, payment modal,
 * any in-progress dialog -- is never unmounted); the overlay paints on top
 * only while locked.
 */
export function IdleLockProvider({ children }: IdleLockProviderProps) {
  const isAuthenticated = useStaffStore(s => s.isAuthenticated);
  const currentStaff = useStaffStore(s => s.currentStaff);
  const currentShift = useStaffStore(s => s.currentShift);
  const { data: lockSettings } = useTerminalLockSettings();
  const { recordLock, recordUnlock } = useIdleLockAudit();
  const locked = useLockStateStore(s => s.locked);

  const timeoutMs = (lockSettings?.lockTimeoutSeconds ?? DEFAULT_LOCK_TIMEOUT_SECONDS) * 1000;

  const handleIdle = useCallback(() => {
    useLockStateStore.getState().setLocked(true);
    void recordLock(currentStaff, currentShift?.id ?? null);
  }, [currentStaff, currentShift, recordLock]);

  const handleUnlock = useCallback(
    (matchedStaff: Staff) => {
      useLockStateStore.getState().setLocked(false);
      void recordUnlock(currentStaff, matchedStaff, currentShift?.id ?? null);
    },
    [currentStaff, currentShift, recordUnlock]
  );

  // Pitfall 4: fully paused (not merely ignored) while `locked` is true, so
  // PIN-entry keystrokes on the overlay never reset the "time until re-lock"
  // countdown. Restarts fresh the instant a successful unlock flips `locked`
  // back to false.
  useIdleTimer(timeoutMs, handleIdle, isAuthenticated && !locked);

  return (
    <>
      {children}
      {isAuthenticated && <IdleLockOverlay open={locked} onUnlock={handleUnlock} />}
    </>
  );
}
