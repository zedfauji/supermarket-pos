import { useTranslation } from 'react-i18next';
import { CajaDashboard } from '@widgets/CajaDashboard';
import { StaffDashboard } from '@widgets/StaffDashboard/StaffDashboard';
import { PageContainer } from '@shared/ui';

export default function StaffPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('staff.title')} backTo="/home">
          <CajaDashboard />
          <StaffDashboard />
        </PageContainer>
      </main>
    </div>
  );
}
