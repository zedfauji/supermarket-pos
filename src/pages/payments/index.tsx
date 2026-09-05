import { useTranslation } from 'react-i18next';
import { BankTransfersList } from '@widgets/BankTransfersList';
import { PaymentPane } from '@widgets/PaymentPane';
import { RefundsList } from '@widgets/RefundsList';
import { PageContainer } from '@shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';

export default function PaymentsPage() {
  const { t } = useTranslation('pages');
  return (
    <PageContainer title={t('payments.title')} width="fluid" flush>
      <Tabs defaultValue="payments" className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <div className="shrink-0 border-b border-border bg-background px-6 py-3 lg:px-8">
          <TabsList>
            <TabsTrigger value="payments">{t('payments.tabs.payments')}</TabsTrigger>
            <TabsTrigger value="refunds">{t('payments.tabs.refunds')}</TabsTrigger>
            <TabsTrigger value="bankTransfers">{t('payments.tabs.bankTransfers')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="payments" className="flex min-h-0 flex-1 overflow-hidden">
          <PaymentPane />
        </TabsContent>
        <TabsContent value="refunds" className="flex min-h-0 flex-1 overflow-auto p-6 lg:p-8">
          <RefundsList />
        </TabsContent>
        <TabsContent value="bankTransfers" className="flex min-h-0 flex-1 overflow-auto p-6 lg:p-8">
          <BankTransfersList />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
