import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutationUpdateSetting, useSettings } from '@entities/settings';
import type { UserRole } from '@shared/lib/domain';
import { Input, Label, POSButton, ProtectedAction } from '@shared/ui';

type Props = {
  currentRole: UserRole | null;
};

type GeneralForm = {
  barName: string;
  address: string;
  timezone: string;
  currency: string;
  receiptFooterText: string;
};

const DEFAULT_FORM: GeneralForm = {
  barName: 'Bola 8',
  address: '',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  receiptFooterText: '',
};

export function GeneralSettingsTab({ currentRole }: Props) {
  const { t } = useTranslation('wAdmin');
  const { data } = useSettings();
  const updateSetting = useMutationUpdateSetting();
  const [form, setForm] = useState<GeneralForm>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data || dirty) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setForm({
      barName: data.general.barName,
      address: data.general.address,
      timezone: data.general.timezone,
      currency: data.general.currency,
      receiptFooterText: data.general.receiptFooterText,
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, dirty]);

  const save = async () => {
    const result = await updateSetting.mutateAsync({
      key: 'general',
      value: {
        barName: form.barName.trim(),
        address: form.address.trim(),
        timezone: form.timezone.trim(),
        currency: form.currency.trim().toUpperCase(),
        receiptFooterText: form.receiptFooterText.trim(),
      },
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setDirty(false);
    toast.success(t('generalSettingsTab.saved'));
  };

  return (
    <ProtectedAction
      action="manage_settings"
      currentRole={currentRole}
      disabled={updateSetting.isPending}
    >
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('generalSettingsTab.title')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-bar-name">{t('generalSettingsTab.barNameLabel')}</Label>
            <Input
              id="settings-bar-name"
              value={form.barName}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, barName: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-currency">{t('generalSettingsTab.currencyLabel')}</Label>
            <Input
              id="settings-currency"
              value={form.currency}
              maxLength={3}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, currency: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="settings-address">{t('generalSettingsTab.addressLabel')}</Label>
            <Input
              id="settings-address"
              value={form.address}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, address: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-timezone">{t('generalSettingsTab.timezoneLabel')}</Label>
            <Input
              id="settings-timezone"
              value={form.timezone}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, timezone: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-receipt-footer">
              {t('generalSettingsTab.receiptFooterLabel')}
            </Label>
            <Input
              id="settings-receipt-footer"
              value={form.receiptFooterText}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, receiptFooterText: event.target.value }));
              }}
            />
          </div>
        </div>
        <POSButton
          type="button"
          touchSize="large"
          disabled={!dirty || updateSetting.isPending}
          onClick={() => {
            void save();
          }}
        >
          {updateSetting.isPending ? t('generalSettingsTab.saving') : t('generalSettingsTab.saveGeneral')}
        </POSButton>
      </div>
    </ProtectedAction>
  );
}
