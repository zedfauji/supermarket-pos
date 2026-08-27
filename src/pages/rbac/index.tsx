import { useTranslation } from 'react-i18next';
import { RBACDashboard } from '@widgets/RBACDashboard';
import { PageContainer } from '@shared/ui';

export default function RbacPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('rbac.title')} backTo="/home">
          <RBACDashboard />
        </PageContainer>
      </main>
    </div>
  );
}
