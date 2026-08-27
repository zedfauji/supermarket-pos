import { useTranslation } from 'react-i18next';
import { EditHistoryTable } from '@widgets/EditHistoryTable';
import { PageContainer } from '@shared/ui';

export default function EditHistoryPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('editHistory.title')} backTo="/home">
          <EditHistoryTable />
        </PageContainer>
      </main>
    </div>
  );
}
