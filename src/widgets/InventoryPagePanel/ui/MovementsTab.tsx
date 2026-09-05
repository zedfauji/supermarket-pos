import { ArrowDownUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory, useInventoryLog } from '@entities/inventory';
import { useStaffList } from '@entities/staff/model/queries';
import { cn } from '@shared/lib/utils';
import { EmptyState } from '@shared/ui/EmptyState';
import { SectionHeader } from '@shared/ui/SectionHeader';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table';

// Reason enum values come from InventoryAdjustReasonSchema (domain.ts); the
// label keys already exist for the batch-adjustment reason picker.
/* eslint-disable i18next/no-literal-string -- i18n key lookup table, not UI copy */
const REASON_LABEL_KEY: Record<string, string> = {
  waste: 'inventoryPagePanel.reasonOptionWaste',
  expired: 'inventoryPagePanel.reasonOptionExpired',
  delivery: 'inventoryPagePanel.reasonOptionDelivery',
  correction: 'inventoryPagePanel.reasonOptionCorrection',
  manual_adjustment: 'inventoryPagePanel.reasonOptionManualAdjustment',
  physical_count: 'inventoryPagePanel.reasonOptionPhysicalCount',
  sale: 'inventoryPagePanel.reasonOptionSale',
};
/* eslint-enable i18next/no-literal-string */

const FILTERS = [
  'all',
  'delivery',
  'sale',
  'waste',
  'expired',
  'correction',
  'manual_adjustment',
  'physical_count',
] as const;
type ReasonFilter = (typeof FILTERS)[number];

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function MovementsTab() {
  const { t, i18n } = useTranslation('wAdmin');
  const { data: logs, isLoading } = useInventoryLog();
  const { data: inventory } = useInventory();
  const { data: staff } = useStaffList();
  const [filter, setFilter] = useState<ReasonFilter>('all');

  const productNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of inventory ?? []) {
      if (row.product) map.set(row.productId, row.product.name);
    }
    return map;
  }, [inventory]);

  const staffNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff ?? []) map.set(s.id, s.name);
    return map;
  }, [staff]);

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  );

  const visible = (logs ?? []).filter(log => filter === 'all' || log.reason === filter);

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <SectionHeader
        title={t('inventoryPagePanel.changeLogTitle')}
        description={t('inventoryPagePanel.changeLogDescription')}
      />
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t('inventoryPagePanel.reasonFilterLabel')}
      >
        {FILTERS.map(value => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
            }}
          >
            {value === 'all'
              ? t('inventoryPagePanel.reasonFilterAll')
              : t(REASON_LABEL_KEY[value] ?? 'inventoryPagePanel.reasonFilterAll')}
          </Button>
        ))}
      </div>
      {!isLoading && visible.length === 0 ? (
        <EmptyState
          icon={ArrowDownUp}
          title={t('inventoryPagePanel.noLogEntries')}
          description={t('inventoryPagePanel.noLogEntriesBody')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inventoryPagePanel.columnWhen')}</TableHead>
                <TableHead>{t('inventoryPagePanel.columnProduct')}</TableHead>
                <TableHead className="text-right">{t('inventoryPagePanel.columnDelta')}</TableHead>
                <TableHead>{t('inventoryPagePanel.columnReason')}</TableHead>
                <TableHead>{t('inventoryPagePanel.columnStaff')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {t('inventoryPagePanel.loading')}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatter.format(log.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {productNames.get(log.productId) ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {shortId(log.productId)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        log.quantityDelta > 0 ? 'text-success-strong' : 'text-destructive'
                      )}
                    >
                      {log.quantityDelta > 0 ? `+${String(log.quantityDelta)}` : String(log.quantityDelta)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">
                        {t(REASON_LABEL_KEY[log.reason] ?? 'inventoryPagePanel.reasonOptionManualAdjustment')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {staffNames.get(log.staffId) ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {shortId(log.staffId)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
