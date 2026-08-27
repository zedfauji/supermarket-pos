import { useTranslation } from 'react-i18next';
import { PaymentPane } from '@widgets/PaymentPane';
import { RefundsList } from '@widgets/RefundsList';
import { PageContainer } from '@shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';

export default function PaymentsPage() {
  const { t } = useTranslation('pages');
  return (
    <PageContainer
      title={t('payments.title')}
      backTo="/home"
      className="mx-0 flex h-screen max-w-none flex-col space-y-0 bg-background p-0"
    >
      <Tabs defaultValue="payments" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 mb-0 w-fit">
          <TabsTrigger value="payments">{t('payments.tabs.payments')}</TabsTrigger>
          <TabsTrigger value="refunds">{t('payments.tabs.refunds')}</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="flex flex-1 overflow-hidden">
          <PaymentPane />
        </TabsContent>
        <TabsContent value="refunds" className="flex flex-1 overflow-hidden p-4">
          <RefundsList />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
