/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMutationCreatePurchaseOrder,
  useMutationDeletePurchaseOrder,
  usePurchaseOrders,
  type PurchaseOrderListItem,
} from '@entities/purchase-order';
import { PurchaseOrderForm } from '@features/create-purchase-order';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { DataTable } from '@shared/ui/DataTable';
import { EmptyState } from '@shared/ui/EmptyState';
import { MoneyDisplay } from '@shared/ui/MoneyDisplay';
import { POSButton } from '@shared/ui/POSButton';
import { StatusBadge } from '@shared/ui/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { PurchaseOrderDetailPanel } from './PurchaseOrderDetailPanel';

export function PurchaseOrderListPanel() {
  const { t } = useTranslation('wAdmin');
  const { data: purchaseOrders, isLoading, resultError } = usePurchaseOrders();
  const create = useMutationCreatePurchaseOrder();
  const remove = useMutationDeletePurchaseOrder();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: ColumnDef<PurchaseOrderListItem>[] = [
    {
      id: 'supplier',
      accessorFn: po => po.supplierName,
      header: t('purchaseOrderListPanel.columnSupplier'),
      cell: info => <span className="truncate font-medium">{info.getValue<string>()}</span>,
    },
    {
      id: 'status',
      header: t('purchaseOrderListPanel.columnStatus'),
      cell: ({ row }) => (
        <StatusBadge status={row.original.status === 'received' ? 'po_received' : 'po_draft'} />
      ),
    },
    {
      id: 'itemCount',
      accessorFn: po => po.itemCount,
      header: t('purchaseOrderListPanel.columnItems'),
    },
    {
      id: 'totalCost',
      header: t('purchaseOrderListPanel.columnTotal'),
      cell: ({ row }) => <MoneyDisplay amount={row.original.totalCost} />,
    },
    {
      id: 'createdAt',
      accessorFn: po => new Date(po.createdAt).toLocaleDateString(),
      header: t('purchaseOrderListPanel.columnCreated'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'draft' ? (
          <POSButton
            type="button"
            variant="destructive"
            size="icon"
            aria-label={t('purchaseOrderListPanel.delete')}
            onClick={e => {
              e.stopPropagation();
              setDeleteId(row.original.id);
            }}
          >
            <Trash2 className="size-4" />
          </POSButton>
        ) : null,
    },
  ];

  return (
    <section className="space-y-4">
      {resultError ? (
        <p className="text-sm text-destructive" role="alert">
          {resultError.message}
        </p>
      ) : null}
      <POSButton type="button" onClick={() => setCreateOpen(true)}>
        {t('purchaseOrderListPanel.newPurchaseOrder')}
      </POSButton>
      <DataTable
        columns={columns}
        data={purchaseOrders ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('purchaseOrderListPanel.search')}
        onRowClick={po => setSelectedId(po.id)}
        emptyState={
          <EmptyState
            icon={FileText}
            title={t('purchaseOrderListPanel.emptyTitle')}
            description={t('purchaseOrderListPanel.emptyBody')}
            action={{
              label: t('purchaseOrderListPanel.newPurchaseOrder'),
              onClick: () => setCreateOpen(true),
            }}
          />
        }
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-medium">
              {t('purchaseOrderListPanel.newPurchaseOrder')}
            </DialogTitle>
          </DialogHeader>
          <PurchaseOrderForm
            initialPurchaseOrder={null}
            submitting={create.isPending}
            onCancel={() => setCreateOpen(false)}
            onSubmitCreate={value => create.mutateAsync(value)}
            onSubmitUpdate={() => undefined}
          />
        </DialogContent>
      </Dialog>
      {selectedId && (
        <Dialog open onOpenChange={() => setSelectedId(null)}>
          <DialogContent className="max-w-4xl">
            <PurchaseOrderDetailPanel
              purchaseOrderId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog
        open={!!deleteId}
        title={t('purchaseOrderListPanel.deletePurchaseOrderTitle')}
        description={t('purchaseOrderListPanel.deletePurchaseOrderBody')}
        confirmLabel={t('purchaseOrderListPanel.delete')}
        variant="destructive"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void remove.mutateAsync(deleteId);
          setDeleteId(null);
        }}
      />
    </section>
  );
}
