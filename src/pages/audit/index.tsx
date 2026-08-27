import { useTranslation } from 'react-i18next';
import { AuditLogTable } from '@widgets/AuditLogTable';
import { PrintJobsTable } from '@widgets/PrintJobsTable';
import { PageContainer } from '@shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';

export default function AuditPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('audit.title')} backTo="/home">
          <Tabs defaultValue="auditLog">
            <TabsList className="mb-4">
              <TabsTrigger value="auditLog">{t('audit.tabs.auditLog')}</TabsTrigger>
              <TabsTrigger value="printJobs">{t('audit.tabs.printJobs')}</TabsTrigger>
            </TabsList>

            <TabsContent value="auditLog">
              <AuditLogTable />
            </TabsContent>

            <TabsContent value="printJobs">
              <PrintJobsTable />
            </TabsContent>
          </Tabs>
        </PageContainer>
      </main>
    </div>
  );
}
