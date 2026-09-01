import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutationUpdateSetting, useSettings } from '@entities/settings';
import type { PaymentMethodLabels } from '@entities/settings';
import type { UserRole } from '@shared/lib/domain';
import { Input, Label, POSButton, ProtectedAction } from '@shared/ui';

type Props = {
  currentRole: UserRole | null;
};

type BillingForm = {
  taxRatePercent: string;
  paymentMethods: {
    cash: boolean;
    bbvaCard: boolean;
    rappi: boolean;
  };
  firstHourMode: 'full' | 'prorated';
  taxInclusive: boolean;
};

const DEFAULT_FORM: BillingForm = {
  taxRatePercent: '16',
  paymentMethods: { cash: true, bbvaCard: true, rappi: true },
  firstHourMode: 'prorated',
  taxInclusive: true,
};

const DEFAULT_LABELS: PaymentMethodLabels = {
  cash: 'Efectivo',
  card: 'Terminal BBVA',
  rappi: 'Rappi',
};

export function BillingSettingsTab({ currentRole }: Props) {
  const { t } = useTranslation('wAdmin');
  const { data } = useSettings();
  const updateSetting = useMutationUpdateSetting();
  const [form, setForm] = useState<BillingForm>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);
  const [labels, setLabels] = useState<PaymentMethodLabels>(DEFAULT_LABELS);
  const [labelsDirty, setLabelsDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!dirty) {
      setForm({
        taxRatePercent: String(data.billing.taxRatePercent),
        paymentMethods: {
          cash: data.billing.paymentMethods.cash,
          bbvaCard: data.billing.paymentMethods.bbvaCard,
          rappi: data.billing.paymentMethods.rappi,
        },
        firstHourMode: data.billing.firstHourMode,
        taxInclusive: data.billing.taxInclusive,
      });
    }
    if (!labelsDirty) {
      setLabels(data.paymentLabels);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, dirty, labelsDirty]);

  const paymentMethodButtons = useMemo(
    () =>
      [
        { key: 'cash', label: 'Cash' },
        { key: 'bbvaCard', label: 'BBVA Card' },
        { key: 'rappi', label: 'Rappi' },
      ] as const,
    []
  );

  const save = async () => {
    const taxRatePercent = Number(form.taxRatePercent);
    if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
      toast.error(t('billingSettingsTab.taxRateInvalid'));
      return;
    }

    const result = await updateSetting.mutateAsync({
      key: 'billing',
      value: {
        taxRatePercent,
        paymentMethods: form.paymentMethods,
        firstHourMode: form.firstHourMode,
        taxInclusive: form.taxInclusive,
      },
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setDirty(false);
    toast.success(t('billingSettingsTab.billingSaved'));
  };

  return (
    <ProtectedAction
      action="manage_products"
      currentRole={currentRole}
      disabled={updateSetting.isPending}
    >
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('billingSettingsTab.title')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-tax-rate">{t('billingSettingsTab.taxRateLabel')}</Label>
            <Input
              id="settings-tax-rate"
              value={form.taxRatePercent}
              onChange={event => {
                setDirty(true);
                setForm(current => ({ ...current, taxRatePercent: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('billingSettingsTab.taxInclusiveLabel')}</Label>
            <POSButton
              type="button"
              touchSize="large"
              variant={form.taxInclusive ? 'default' : 'outline'}
              onClick={() => {
                setDirty(true);
                setForm(current => ({ ...current, taxInclusive: !current.taxInclusive }));
              }}
            >
              {t(
                form.taxInclusive
                  ? 'billingSettingsTab.taxInclusiveOnLabel'
                  : 'billingSettingsTab.taxInclusiveOffLabel'
              )}
            </POSButton>
            <p className="text-xs text-muted-foreground">
              {t('billingSettingsTab.taxInclusiveDescription')}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('billingSettingsTab.enabledPaymentMethods')}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {paymentMethodButtons.map(button => (
              <POSButton
                key={button.key}
                type="button"
                touchSize="large"
                variant={form.paymentMethods[button.key] ? 'default' : 'outline'}
                onClick={() => {
                  setDirty(true);
                  setForm(current => ({
                    ...current,
                    paymentMethods: {
                      ...current.paymentMethods,
                      [button.key]: !current.paymentMethods[button.key],
                    },
                  }));
                }}
              >
                {button.label}
              </POSButton>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('billingSettingsTab.firstHourModeLabel')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('billingSettingsTab.firstHourModeDescription')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {/* eslint-disable i18next/no-literal-string -- 'value' is a data enum key, not UI copy */}
            {(
              [
                {
                  value: 'prorated' as const,
                  label: t('billingSettingsTab.proratedLabel'),
                  description: t('billingSettingsTab.proratedDescription'),
                },
                {
                  value: 'full' as const,
                  label: t('billingSettingsTab.fullHourLabel'),
                  description: t('billingSettingsTab.fullHourDescription'),
                },
              ]
            ).map(option => (
              /* eslint-enable i18next/no-literal-string */
              <POSButton
                key={option.value}
                type="button"
                touchSize="large"
                variant={form.firstHourMode === option.value ? 'default' : 'outline'}
                onClick={() => {
                  setDirty(true);
                  setForm(current => ({ ...current, firstHourMode: option.value }));
                }}
              >
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="font-semibold">{option.label}</span>
                  <span className="text-xs font-normal opacity-80">{option.description}</span>
                </span>
              </POSButton>
            ))}
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
          {updateSetting.isPending ? t('billingSettingsTab.saving') : t('billingSettingsTab.saveBilling')}
        </POSButton>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">{t('billingSettingsTab.paymentButtonLabelsTitle')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('billingSettingsTab.paymentButtonLabelsDescription')}
          </p>
          {(
            [
              { key: 'cash', placeholder: t('billingSettingsTab.placeholderCash') },
              { key: 'card', placeholder: t('billingSettingsTab.placeholderCard') },
              { key: 'rappi', placeholder: t('billingSettingsTab.placeholderRappi') },
            ] as const
          ).map(({ key, placeholder }) => (
            <div key={key} className="flex items-center gap-3">
              <Label htmlFor={`label-${key}`} className="w-12 shrink-0 capitalize">
                {key}
              </Label>
              <Input
                id={`label-${key}`}
                value={labels[key]}
                placeholder={placeholder}
                maxLength={40}
                onChange={e => {
                  setLabelsDirty(true);
                  setLabels(prev => ({ ...prev, [key]: e.target.value }));
                }}
              />
            </div>
          ))}
          <POSButton
            type="button"
            touchSize="large"
            disabled={!labelsDirty || updateSetting.isPending}
            onClick={() => {
              updateSetting.mutate(
                { key: 'payment_labels', value: labels },
                {
                  onSuccess: result => {
                    if (!result.ok) {
                      toast.error(result.error.message);
                      return;
                    }
                    setLabelsDirty(false);
                    toast.success(t('billingSettingsTab.paymentLabelsSaved'));
                  },
                }
              );
            }}
          >
            {updateSetting.isPending ? t('billingSettingsTab.saving') : t('billingSettingsTab.saveLabels')}
          </POSButton>
        </div>
      </div>
    </ProtectedAction>
  );
}
