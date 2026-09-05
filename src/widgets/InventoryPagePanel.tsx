import { PackageX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  inventoryRowColumns,
  useInventory,
  useNearExpiryAlerts,
  useInventoryLog,
  useMutationAdjustInventory,
  type Inventory,
} from '@entities/inventory';
import { useStaffStore } from '@entities/staff/model/store';
import { cn } from '@shared/lib/utils';
import { EmptyState } from '@shared/ui';
import { DataTable } from '@shared/ui/DataTable';
import { FormField } from '@shared/ui/FormField';
import { POSButton } from '@shared/ui/POSButton';
import { ProtectedAction } from '@shared/ui/ProtectedAction';
import { SectionHeader } from '@shared/ui/SectionHeader';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { OpenUnitsTab } from './OpenUnitsTab';

function stockSortPriority(inv: Inventory): number {
  if (inv.quantityOnHand === 0) return 2;
  if (inv.quantityOnHand <= inv.lowStockThreshold) return 1;
  return 0;
}

function sortInventoryRows(rows: Inventory[]): Inventory[] {
  return [...rows].sort((a, b) => {
    const p = stockSortPriority(b) - stockSortPriority(a);
    if (p !== 0) return p;
    return (a.product?.name ?? '').localeCompare(b.product?.name ?? '', undefined, {
      sensitivity: 'base',
    });
  });
}

function rowHighlightClass(inv: Inventory): string | undefined {
  if (inv.quantityOnHand === 0) {
    // eslint-disable-next-line i18next/no-literal-string -- Tailwind class string, not UI copy
    return 'border-l-2 border-l-destructive bg-destructive/5';
  }
  if (inv.quantityOnHand <= inv.lowStockThreshold) {
    // eslint-disable-next-line i18next/no-literal-string -- Tailwind class string, not UI copy
    return 'border-l-2 border-l-warning bg-warning-soft/60';
  }
  return undefined;
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    // eslint-disable-next-line i18next/no-literal-string -- CSV quote-escaping, not UI copy
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadInventoryCsv(rows: Inventory[]) {
  /* eslint-disable i18next/no-literal-string -- machine-readable CSV column keys, not UI copy */
  const headers = [
    'product',
    'category',
    'sku',
    'quantity_on_hand',
    'unit',
    'low_stock_threshold',
    'base_price',
  ];
  /* eslint-enable i18next/no-literal-string */
  const lines = [
    headers.join(','),
    ...rows.map(r => {
      const cells = [
        r.product?.name ?? '',
        r.product?.category?.name ?? '',
        r.product?.sku ?? '',
        String(r.quantityOnHand),
        r.unit,
        String(r.lowStockThreshold),
        r.product?.basePrice != null ? String(r.product.basePrice) : '',
      ];
      return cells.map(escapeCsvField).join(',');
    }),
  ];
  // eslint-disable-next-line i18next/no-literal-string -- MIME type, not UI copy
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function InventoryPagePanel() {
  const { t } = useTranslation('wAdmin');
  // inventoryRowColumns' header keys ('inventoryRow.columns.*') live in the
  // 'entities' namespace, not 'wAdmin' — a plain wAdmin-scoped t() can't
  // resolve them and falls back to rendering the literal key (Rule 1 fix,
  // found via e2e/44-focus-tab-order.spec.ts surface (b) failing to find a
  // "Product" column-header button; the table was actually rendering
  // "inventoryRow.columns.product").
  const { t: tEntities } = useTranslation('entities');
  const currentStaff = useStaffStore(s => s.currentStaff);
  const currentRole = currentStaff?.role;
  const staffId = currentStaff?.id ?? '';

  const { data, isLoading, resultError, isEmpty } = useInventory();
  const { data: nearExpiryAlerts, isEmpty: nearExpiryEmpty } = useNearExpiryAlerts();
  const { data: logs, isLoading: logsLoading } = useInventoryLog();
  const adjustMutation = useMutationAdjustInventory();

  // eslint-disable-next-line i18next/no-literal-string -- sentinel value, not UI copy
  const [categoryFilter, setCategoryFilter] = useState<string>('__all__');
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchProductId, setBatchProductId] = useState<string>('');
  const [batchDelta, setBatchDelta] = useState<string>('1');
  const [batchReason, setBatchReason] = useState<string>('');

  const columns = useMemo(
    () =>
      inventoryRowColumns(
        tEntities,
        staffId || '00000000-0000-0000-0000-000000000001',
        currentRole
      ),
    [tEntities, staffId, currentRole]
  );

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const row of data ?? []) {
      const n = row.product?.category?.name;
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const displayedRows = useMemo(() => {
    let rows = data ?? [];
    if (categoryFilter !== '__all__') {
      rows = rows.filter(r => (r.product?.category?.name ?? '') === categoryFilter);
    }
    return sortInventoryRows(rows);
  }, [data, categoryFilter]);

  const stats = useMemo(() => {
    const rows = data ?? [];
    const totalSkus = rows.length;
    let lowStock = 0;
    let outOfStock = 0;
    for (const r of rows) {
      if (r.quantityOnHand === 0) outOfStock += 1;
      else if (r.quantityOnHand <= r.lowStockThreshold) lowStock += 1;
    }
    return { totalSkus, lowStock, outOfStock };
  }, [data]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="inv-category-filter" className="text-sm text-muted-foreground">
        {t('inventoryPagePanel.categoryLabel')}
      </label>
      <select
        id="inv-category-filter"
        className="h-10 rounded-lg border border-input bg-card px-3 text-sm shadow-xs transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none dark:bg-input/20"
        value={categoryFilter}
        onChange={e => {
          setCategoryFilter(e.target.value);
        }}
      >
        <option value="__all__">{t('inventoryPagePanel.allCategories')}</option>
        {uniqueCategories.map(c => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );

  const handleExportCsv = () => {
    if (!displayedRows.length) {
      toast.message(t('inventoryPagePanel.nothingToExport'));
      return;
    }
    downloadInventoryCsv(displayedRows);
    toast.success(t('inventoryPagePanel.csvDownloaded'));
  };

  const handleBatchSubmit = async () => {
    if (!staffId) {
      toast.error(t('inventoryPagePanel.signInToAdjust'));
      return;
    }
    const delta = Number.parseInt(batchDelta, 10);
    if (!batchProductId || Number.isNaN(delta) || delta === 0 || !batchReason) {
      toast.error(t('inventoryPagePanel.chooseProductAndDeltaAndReason'));
      return;
    }
    const res = await adjustMutation.mutateAsync({
      productId: batchProductId,
      quantityDelta: delta,
      reason: batchReason,
      staffId,
    });
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success(t('inventoryPagePanel.stockUpdated'));
    setBatchOpen(false);
    setBatchDelta('1');
    setBatchReason('');
  };

  return (
    <Tabs defaultValue="stock" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="stock">{t('inventoryPagePanel.stockTabLabel')}</TabsTrigger>
        <TabsTrigger value="open-units">{t('inventoryPagePanel.openUnitsTabLabel')}</TabsTrigger>
        <TabsTrigger value="near-expiry">{t('inventoryPagePanel.nearExpiryTabLabel')}</TabsTrigger>
      </TabsList>
      <TabsContent value="stock">
        <div className="mx-auto max-w-6xl space-y-8">
          {resultError ? (
            <p className="text-sm text-destructive" role="alert">
              {resultError.message}
            </p>
          ) : null}

          {!staffId ? (
            <p className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm font-medium text-warning-strong">
              {t('inventoryPagePanel.signInBanner')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-stretch gap-3">
            <div className="min-w-[9rem] rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
              <div className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {t('inventoryPagePanel.totalSkus')}
              </div>
              <div className="text-numeric mt-1 text-2xl font-semibold">{stats.totalSkus}</div>
            </div>
            <div className="min-w-[9rem] rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
              <div className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {t('inventoryPagePanel.lowStock')}
              </div>
              <div
                className={cn(
                  'text-numeric mt-1 text-2xl font-semibold',
                  stats.lowStock > 0 && 'text-warning-strong'
                )}
              >
                {stats.lowStock}
              </div>
            </div>
            <div className="min-w-[9rem] rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
              <div className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {t('inventoryPagePanel.outOfStock')}
              </div>
              <div
                className={cn(
                  'text-numeric mt-1 text-2xl font-semibold',
                  stats.outOfStock > 0 && 'text-destructive'
                )}
              >
                {stats.outOfStock}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ProtectedAction action="adjust_inventory" currentRole={currentRole}>
                <POSButton
                  type="button"
                  touchSize="large"
                  variant="secondary"
                  onClick={() => {
                    setBatchOpen(true);
                  }}
                >
                  {t('inventoryPagePanel.adjust')}
                </POSButton>
              </ProtectedAction>
              <ProtectedAction action="adjust_inventory" currentRole={currentRole}>
                <POSButton
                  type="button"
                  touchSize="large"
                  variant="outline"
                  disabled={displayedRows.length === 0}
                  onClick={handleExportCsv}
                >
                  {t('inventoryPagePanel.exportCsv')}
                </POSButton>
              </ProtectedAction>
            </div>
          </div>

          <section>
            <SectionHeader
              title={t('inventoryPagePanel.onHandLevelsTitle')}
              description={t('inventoryPagePanel.onHandLevelsDescription')}
            />
            <DataTable<Inventory>
              columns={columns}
              data={displayedRows}
              isLoading={isLoading}
              enableSorting
              toolbar={toolbar}
              getRowClassName={rowHighlightClass}
              emptyState={
                isEmpty ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('inventoryPagePanel.noInventoryRecords')}
                  </p>
                ) : (data?.length ?? 0) > 0 && displayedRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('inventoryPagePanel.noRowsForCategory')}
                  </p>
                ) : undefined
              }
            />
          </section>

          <section>
            <SectionHeader
              title={t('inventoryPagePanel.changeLogTitle')}
              description={t('inventoryPagePanel.changeLogDescription')}
            />
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventoryPagePanel.columnWhen')}</TableHead>
                    <TableHead>{t('inventoryPagePanel.columnProductId')}</TableHead>
                    <TableHead>{t('inventoryPagePanel.columnDelta')}</TableHead>
                    <TableHead>{t('inventoryPagePanel.columnReason')}</TableHead>
                    <TableHead>{t('inventoryPagePanel.columnStaffId')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        {t('inventoryPagePanel.loading')}
                      </TableCell>
                    </TableRow>
                  ) : !logs?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        {t('inventoryPagePanel.noLogEntries')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {log.createdAt.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.productId}</TableCell>
                        <TableCell className="tabular-nums">{log.quantityDelta}</TableCell>
                        <TableCell>{log.reason}</TableCell>
                        <TableCell className="font-mono text-xs">{log.staffId}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('inventoryPagePanel.batchAdjustmentTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label htmlFor="batch-product" className="text-sm font-medium">
                    {t('inventoryPagePanel.productLabel')}
                  </label>
                  <select
                    id="batch-product"
                    className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none dark:bg-input/20"
                    value={batchProductId}
                    onChange={e => {
                      setBatchProductId(e.target.value);
                    }}
                  >
                    <option value="">{t('inventoryPagePanel.selectPlaceholder')}</option>
                    {(data ?? []).map(inv => (
                      <option key={inv.productId} value={inv.productId}>
                        {inv.product?.name ?? inv.productId}
                      </option>
                    ))}
                  </select>
                </div>
                <FormField
                  label={t('inventoryPagePanel.quantityDeltaLabel')}
                  hint={t('inventoryPagePanel.quantityDeltaHint')}
                >
                  {/* eslint-disable-next-line no-restricted-syntax -- 31-CONTEXT.md D-06: signed-delta input, MoneyInput would clamp negatives */}
                  <input
                    type="number"
                    className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none dark:bg-input/20"
                    value={batchDelta}
                    onChange={e => {
                      setBatchDelta(e.target.value);
                    }}
                  />
                </FormField>
                <FormField label={t('inventoryPagePanel.reasonLabel')}>
                  <select
                    className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none dark:bg-input/20"
                    value={batchReason}
                    onChange={e => {
                      setBatchReason(e.target.value);
                    }}
                  >
                    <option value="">{t('inventoryPagePanel.reasonPlaceholder')}</option>
                    <option value="waste">{t('inventoryPagePanel.reasonOptionWaste')}</option>
                    <option value="expired">{t('inventoryPagePanel.reasonOptionExpired')}</option>
                    <option value="delivery">{t('inventoryPagePanel.reasonOptionDelivery')}</option>
                    <option value="correction">
                      {t('inventoryPagePanel.reasonOptionCorrection')}
                    </option>
                    <option value="manual_adjustment">
                      {t('inventoryPagePanel.reasonOptionManualAdjustment')}
                    </option>
                    <option value="physical_count">
                      {t('inventoryPagePanel.reasonOptionPhysicalCount')}
                    </option>
                  </select>
                </FormField>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <POSButton
                  type="button"
                  variant="outline"
                  touchSize="large"
                  onClick={() => {
                    setBatchOpen(false);
                  }}
                >
                  {t('inventoryPagePanel.cancel')}
                </POSButton>
                <POSButton
                  type="button"
                  touchSize="large"
                  disabled={adjustMutation.isPending}
                  onClick={() => {
                    void handleBatchSubmit();
                  }}
                >
                  {t('inventoryPagePanel.apply')}
                </POSButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TabsContent>
      <TabsContent value="open-units">
        <OpenUnitsTab />
      </TabsContent>
      <TabsContent value="near-expiry">
        {nearExpiryEmpty ? (
          <EmptyState
            icon={PackageX}
            title={t('inventoryPagePanel.nothingExpiringSoonTitle')}
            description={t('inventoryPagePanel.nothingExpiringSoonBody')}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tEntities('inventoryRow.columns.product')}</TableHead>
                  <TableHead>{t('inventoryPagePanel.expiryDate')}</TableHead>
                  <TableHead>{t('inventoryPagePanel.daysRemaining')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nearExpiryAlerts?.map(alert => (
                  <TableRow key={alert.productId}>
                    <TableCell>{alert.productName}</TableCell>
                    <TableCell>{alert.expiryDate}</TableCell>
                    <TableCell>{alert.daysUntilExpiry}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
