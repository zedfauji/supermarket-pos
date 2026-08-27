import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffStore } from '@entities/staff/model/store';
import { usePermissions } from '@entities/staff/model/usePermissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { BackupSettingsTab } from './tabs/BackupSettingsTab';
import { BillingSettingsTab } from './tabs/BillingSettingsTab';
import { EmailReceiptsSettingsTab } from './tabs/EmailReceiptsSettingsTab';
import { GeneralSettingsTab } from './tabs/GeneralSettingsTab';
import { HardwareSettingsTab } from './tabs/HardwareSettingsTab';
import { LanguageSettingsTab } from './tabs/LanguageSettingsTab';
import { NearExpirySettingsTab } from './tabs/NearExpirySettingsTab';
import { ProductsSettingsTab } from './tabs/ProductsSettingsTab';

type TabItem = {
  key: string;
  label: string;
  render: () => ReactNode;
};

export function SettingsTabsPanel() {
  const { t } = useTranslation('settings');
  const currentRole = useStaffStore(s => s.currentStaff?.role ?? null);
  const { can } = usePermissions();
  const canManageSettings = can('manage_settings');
  const canManageProducts = can('manage_products');

  const tabs = useMemo<TabItem[]>(() => {
    // Role-agnostic — pushed first and outside both gates below so every
    // authenticated role (incl. bartender) always has a non-empty tab list
    // and Language is the default tab for roles with neither permission.
    const out: TabItem[] = [
      {
        key: 'language',
        label: t('tabs.language'),
        render: () => <LanguageSettingsTab />,
      },
    ];
    if (canManageSettings) {
      out.push(
        {
          key: 'general',
          label: t('tabs.general'),
          render: () => <GeneralSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'hardware',
          label: t('tabs.hardware'),
          render: () => <HardwareSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'email',
          label: t('tabs.email'),
          render: () => <EmailReceiptsSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'backup',
          label: t('tabs.backup'),
          render: () => <BackupSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'near-expiry',
          label: t('tabs.nearExpiry'),
          render: () => <NearExpirySettingsTab currentRole={currentRole} />,
        }
      );
    }
    if (canManageProducts) {
      out.push(
        {
          key: 'products',
          label: t('tabs.products'),
          render: () => <ProductsSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'billing',
          label: t('tabs.billing'),
          render: () => <BillingSettingsTab currentRole={currentRole} />,
        }
      );
    }
    return out;
  }, [canManageProducts, canManageSettings, currentRole, t]);

  const firstTab = tabs[0];
  if (!firstTab) {
    return (
      <section className="rounded-lg border p-4 text-sm text-muted-foreground">
        {t('noPermission')}
      </section>
    );
  }
  const defaultTab = firstTab.key;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap items-center justify-start gap-2 rounded-md bg-muted p-1">
          {tabs.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="min-h-[14rem]">
            {tab.render()}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
