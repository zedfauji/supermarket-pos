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
  storeName: string;
  address: string;
  timezone: string;
  currency: string;
  receiptFooterText: string;
  storeLogoPath: string | null;
};

const DEFAULT_FORM: GeneralForm = {
  storeName: '',
  address: '',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  receiptFooterText: '',
  storeLogoPath: null,
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
      storeName: data.general.storeName,
      address: data.general.address,
      timezone: data.general.timezone,
      currency: data.general.currency,
      receiptFooterText: data.general.receiptFooterText,
      storeLogoPath: data.general.storeLogoPath,
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, dirty]);

  const save = async () => {
    const result = await updateSetting.mutateAsync({
      key: 'general',
      value: {
        storeName: form.storeName.trim(),
        address: form.address.trim(),
        timezone: form.timezone.trim(),
        currency: form.currency.trim().toUpperCase(),
        receiptFooterText: form.receiptFooterText.trim(),
        storeLogoPath: form.storeLogoPath,
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
            <Label htmlFor="settings-store-name">{t('generalSettingsTab.storeNameLabel')}</Label>
            <Input
              id="settings-store-name"
              value={form.storeName}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, storeName: event.target.value }));
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
