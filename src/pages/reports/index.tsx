import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CajaReportPanel } from '@widgets/CajaReportPanel';
import { CategoryRevenuePanel } from '@widgets/CategoryRevenuePanel';
import { DeletionsPostCloseReport } from '@widgets/DeletionsPostCloseReport';
import { DeletionsPreSendPanel } from '@widgets/DeletionsPreSendPanel';
import { HourlyBreakdownPanel } from '@widgets/HourlyBreakdownPanel';
import { InventoryAnalyticsPanel } from '@widgets/InventoryAnalyticsPanel';
import { PaymentMethodsReport } from '@widgets/PaymentMethodsReport';
import { ProductSalesPanel } from '@widgets/ProductSalesPanel';
import { RefundsRegister } from '@widgets/RefundsRegister';
import { StaffSalesPanel } from '@widgets/StaffSalesPanel';
import { VoidRefundPanel } from '@widgets/VoidRefundPanel';
import { DateRangePicker, PageContainer } from '@shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

function fromDateStr(s: string, endOfDay: boolean): Date {
  const [y, m, day] = s.split('-').map(Number);
  const d = new Date(y ?? 0, (m ?? 1) - 1, day ?? 1);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

export default function ReportsPage() {
  const { t } = useTranslation('pages');
  const today = toDateStr(new Date());
  const [fromStr, setFromStr] = useState(today);
  const [toStr, setToStr] = useState(today);

  function handleDateChange(f: string, t: string) {
    setFromStr(f);
    setToStr(t);
  }

  const dateRange = {
    from: fromDateStr(fromStr, false),
    to: fromDateStr(toStr, true),
  };

  return (
    <PageContainer title={t('reports.title')}>
      <Tabs defaultValue="session">
        <TabsList className="mb-2 flex h-auto w-full flex-wrap items-start justify-start gap-x-6 gap-y-3 rounded-none bg-transparent p-0">
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t('reports.groups.sales')}
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
              <TabsTrigger value="session" className="flex-none">
                {t('reports.tabs.session')}
              </TabsTrigger>
              <TabsTrigger value="products" className="flex-none">
                {t('reports.tabs.products')}
              </TabsTrigger>
              <TabsTrigger value="hourly" className="flex-none">
                {t('reports.tabs.hourly')}
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex-none">
                {t('reports.tabs.categories')}
              </TabsTrigger>
              <TabsTrigger value="payment-methods" className="flex-none">
                {t('reports.tabs.paymentMethods')}
              </TabsTrigger>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t('reports.groups.inventoryAnalytics')}
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
              <TabsTrigger value="inventory-analytics" className="flex-none">
                {t('reports.tabs.inventoryAnalytics')}
              </TabsTrigger>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t('reports.groups.staffTips')}
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
              <TabsTrigger value="staff" className="flex-none">
                {t('reports.tabs.staff')}
              </TabsTrigger>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t('reports.groups.operations')}
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
              <TabsTrigger value="voids" className="flex-none">
                {t('reports.tabs.voids')}
              </TabsTrigger>
              <TabsTrigger value="deletions-pre" className="flex-none">
                {t('reports.tabs.deletionsPre')}
              </TabsTrigger>
              <TabsTrigger value="deletions-post" className="flex-none">
                {t('reports.tabs.deletionsPost')}
              </TabsTrigger>
              <TabsTrigger value="refunds-reg" className="flex-none">
                {t('reports.tabs.refundsReg')}
              </TabsTrigger>
            </div>
          </div>
        </TabsList>

        <TabsContent value="session">
          <CajaReportPanel />
        </TabsContent>

        <TabsContent value="products">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <ProductSalesPanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="hourly">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <HourlyBreakdownPanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="inventory-analytics">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <InventoryAnalyticsPanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="voids">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <VoidRefundPanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="deletions-pre">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <DeletionsPreSendPanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="deletions-post">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <DeletionsPostCloseReport dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="payment-methods">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <PaymentMethodsReport dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <CategoryRevenuePanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="staff">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <StaffSalesPanel dateRange={dateRange} />
          </div>
        </TabsContent>

        <TabsContent value="refunds-reg">
          <div className="space-y-4">
            <DateRangePicker fromStr={fromStr} toStr={toStr} onChange={handleDateChange} />
            <RefundsRegister dateRange={dateRange} />
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
