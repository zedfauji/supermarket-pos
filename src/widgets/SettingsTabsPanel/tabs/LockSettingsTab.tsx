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
    /* eslint-disable react-hooks/set-state-in-effect -- synchronize saved settings while the form is pristine */
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
          <Input
            id="lock-timeout-threshold"
            type="number"
            min={15}
            max={600}
            value={seconds}
            onChange={e => {
              setDirty(true);
              setSeconds(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">{t('lockSettingsTab.thresholdHint')}</p>
        </div>
        <POSButton
          type="button"
          touchSize="large"
          disabled={!dirty || updateSetting.isPending}
          onClick={() => {
            void save();
          }}
        >
          {t('lockSettingsTab.saveButton')}
        </POSButton>
      </div>
    </ProtectedAction>
  );
}
