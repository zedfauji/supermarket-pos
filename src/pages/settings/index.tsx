import { useTranslation } from 'react-i18next';
import { SettingsTabsPanel } from '@widgets/SettingsTabsPanel';
import { PageContainer } from '@shared/ui';

export default function SettingsPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('settings.title')} backTo="/home">
          <SettingsTabsPanel />
        </PageContainer>
      </main>
    </div>
  );
}
