import { CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ExportButtons } from '@features/export-report';
import { usePaymentMethodsReport } from '@entities/tab/model/queries-reports';
import type { PaymentMethodRow } from '@shared/lib/domain';
import { formatMoney } from '@shared/lib/format';
import { EmptyState, LoadingSpinner } from '@shared/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table';

const CHART_COLORS = [
  'var(--chart-1)',
  'oklch(0.72 0.19 145)', // --pos-accent green for top series
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

type Props = { dateRange: { from: Date; to: Date } };

function chartColor(index: number): string {
  // eslint-disable-next-line i18next/no-literal-string -- CSS custom-property value, not UI copy
  return CHART_COLORS[index % CHART_COLORS.length] ?? 'var(--chart-1)';
}

export function PaymentMethodsReport({ dateRange }: Props) {
  const { t } = useTranslation('wAdmin');
  const { data: result, isLoading } = usePaymentMethodsReport(dateRange.from, dateRange.to);

  if (isLoading) return <LoadingSpinner />;

  const rows: PaymentMethodRow[] = result?.ok ? result.data : [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title={t('paymentMethodsReport.emptyTitle')}
        description={t('paymentMethodsReport.emptyDescription')}
      />
    );
  }

  // Day-level rollup rows (one per method) drive the donut — leading (highest
  // gross) method gets the emerald accent, everything else stays grayscale.
  // Non-leading slices skip CHART_COLORS[1] (the reserved accent oklch slot)
  // so the accent is never assigned to more than one data point (Chart Contract).
  const rollupRows = [...rows]
    .filter(r => r.isRollup)
    .sort((a, b) => b.grossAmount - a.grossAmount);
  const chartData = rollupRows.map((r, i) => ({
    name: r.method,
    value: r.grossAmount,
    fill: i === 0 ? chartColor(1) : chartColor(i + 2),
  }));

  // Two-grain table (D-08): per-session rows first, day-level rollup row(s) pinned bottom.
  const sessionRows = [...rows]
    .filter(r => !r.isRollup)
    .sort(
      (a, b) =>
        (a.cajaSessionId ?? '').localeCompare(b.cajaSessionId ?? '') ||
        a.method.localeCompare(b.method)
    );
  const tableRows = [...sessionRows, ...rollupRows];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportButtons reportType="payment-methods" data={{ rows, dateRange }} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={100}
            />
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('paymentMethodsReport.columnSession')}</TableHead>
              <TableHead>{t('paymentMethodsReport.columnMethod')}</TableHead>
              <TableHead className="tabular-nums">
                {t('paymentMethodsReport.columnLegCount')}
              </TableHead>
              <TableHead className="tabular-nums">
                {t('paymentMethodsReport.columnGrossAmount')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((row, i) => {
              const isRollupStart = row.isRollup && i === sessionRows.length;
              const isLeadingRollup = row.isRollup && row === rollupRows[0];
              return (
                <TableRow
                  key={`${row.cajaSessionId ?? 'rollup'}-${row.method}-${String(i)}`}
                  className={
                    isLeadingRollup
                      ? `border-l-2 border-l-brand bg-brand-soft/60 font-semibold${isRollupStart ? ' border-t-2' : ''}`
                      : row.isRollup
                        ? `font-semibold${isRollupStart ? ' border-t-2' : ''}`
                        : undefined
                  }
                >
                  <TableCell className="tabular-nums">
                    {row.isRollup ? t('paymentMethodsReport.rollupLabel') : row.cajaSessionId}
                  </TableCell>
                  <TableCell className="capitalize">{row.method}</TableCell>
                  <TableCell className="tabular-nums">{row.legCount}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(row.grossAmount)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
