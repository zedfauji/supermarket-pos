/**
 * useAppUpdater hook
 *
 * Manages the full update lifecycle:
 * - Startup check (UPD-01)
 * - 4-hour periodic poll (UPD-02)
 * - Progress tracking during download (UPD-08)
 * - Silent failure on network error or no update (UPD-07)
 * - Dismiss / remind-later (UPD-05)
 */

import { relaunch as tauriRelaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useRef, useState } from 'react';
import { isLicenseEnforced } from '@shared/lib/license/config';
import { getEffectiveNow, useLicenseStore } from '@shared/lib/license/store';
import { updatesExpired } from '@shared/lib/license/token';
import { logger } from '@shared/lib/logger-instance';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000; // 14_400_000 ms

export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string; changelog: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'restart-ready'; version: string }
  | { phase: 'error' };

export interface UseAppUpdaterReturn {
  state: UpdaterState;
  startInstall: () => Promise<void>;
  dismissUpdate: () => void;
  relaunch: () => Promise<void>;
}

export function useAppUpdater(): UseAppUpdaterReturn {
  const [state, setState] = useState<UpdaterState>({ phase: 'idle' });
  const updateRef = useRef<Awaited<ReturnType<typeof check>>>(null);

  const runCheck = async (): Promise<void> => {
    // Lifetime licenses include 4 years of regular updates — after updates_until the
    // installed version keeps working but no longer polls for new releases.
    if (isLicenseEnforced() && updatesExpired(useLicenseStore.getState().payload, getEffectiveNow())) {
      logger.info('updater.skipped_updates_expired');
      return;
    }
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setState({
          phase: 'available',
          version: update.version,
          changelog: update.body ?? '',
        });
      }
      // null return = no update available = silent (UPD-07)
    } catch (err) {
      logger.warn('updater.check_failed', { err });
      // UPD-07: network failure is silent — no UI change
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runCheck is async; setState fires after await resolution, not synchronously
    void runCheck();
    const interval = setInterval(() => {
      void runCheck();
    }, FOUR_HOURS_MS);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const startInstall = async (): Promise<void> => {
    const currentState = state;
    if (currentState.phase !== 'available') return;
    const { version } = currentState;
    const update = updateRef.current;
    if (!update) return;

    let downloaded = 0;
    let contentLength = 0;
    setState({ phase: 'downloading', version, percent: 0 });

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setState({
                phase: 'downloading',
                version,
                percent: Math.min(100, Math.round((downloaded / contentLength) * 100)),
              });
            }
            break;
          case 'Finished':
            setState({ phase: 'restart-ready', version });
            break;
        }
      });
      // downloadAndInstall resolves after Finished — ensure restart-ready state
      setState({ phase: 'restart-ready', version });
    } catch (err) {
      logger.error('updater.install_failed', { err });
      setState({ phase: 'error' });
    }
  };

  const dismissUpdate = (): void => {
    setState({ phase: 'idle' });
  };

  const relaunch = async (): Promise<void> => {
    await tauriRelaunch();
  };

  return { state, startInstall, dismissUpdate, relaunch };
}
