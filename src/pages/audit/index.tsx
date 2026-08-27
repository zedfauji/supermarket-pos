import { useTranslation } from 'react-i18next';
import { AuditLogTable } from '@widgets/AuditLogTable';
import { PageContainer } from '@shared/ui';

export default function AuditPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('audit.title')} backTo="/home">
          <AuditLogTable />
        </PageContainer>
      </main>
    </div>
  );
}
