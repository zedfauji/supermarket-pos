/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutationUpdatePurchaseOrder, usePurchaseOrder } from '@entities/purchase-order';
import { PurchaseOrderForm } from '@features/create-purchase-order';
import { ReceiveShipmentForm } from '@features/receive-shipment';
import { err, unknownError } from '@shared/lib/result';
import { MoneyDisplay } from '@shared/ui/MoneyDisplay';
import { POSButton } from '@shared/ui/POSButton';
import { StatusBadge } from '@shared/ui/StatusBadge';
import { TableRowSkeleton } from '@shared/ui/LoadingSkeletons';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';

export function PurchaseOrderDetailPanel({
  purchaseOrderId,
  onClose,
}: {
  purchaseOrderId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('wAdmin');
  const { data: po, isLoading } = usePurchaseOrder(purchaseOrderId);
  const update = useMutationUpdatePurchaseOrder();
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);

  if (isLoading || !po) {
    return (
      <div className="space-y-4">
        <TableRowSkeleton columns={4} />
        <TableRowSkeleton columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-medium">{po.supplier?.name}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-3">
        <StatusBadge status={po.status === 'received' ? 'po_received' : 'po_draft'} />
        <span className="text-sm text-muted-foreground">
          {new Date(po.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {po.items?.map(item => (
          <div
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
            key={item.id}
          >
            <span className="truncate">{item.product?.name}</span>
            <span className="text-sm text-muted-foreground">{item.quantity}</span>
            <MoneyDisplay amount={item.costPrice} />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <POSButton type="button" variant="outline" onClick={onClose}>
          {t('common:actions.close')}
        </POSButton>
        {po.status === 'draft' && (
          <>
            <POSButton type="button" onClick={() => setEditing(true)}>
              {t('purchaseOrderDetailPanel.edit')}
            </POSButton>
            <POSButton type="button" onClick={() => setReceiving(true)}>
              {t('purchaseOrderDetailPanel.receive')}
            </POSButton>
          </>
        )}
      </div>
      <ReceiveShipmentForm
        open={receiving}
        onOpenChange={setReceiving}
        initialPurchaseOrder={{
          id: po.id,
          supplierId: po.supplierId,
          items:
            po.items?.map(item => ({
              productId: item.productId,
              productName: item.product?.name ?? '',
              quantity: item.quantity,
              costPrice: item.costPrice,
            })) ?? [],
        }}
      />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-medium">{t('purchaseOrderDetailPanel.edit')}</DialogTitle>
          </DialogHeader>
          <PurchaseOrderForm
            initialPurchaseOrder={po}
            submitting={update.isPending}
            onCancel={() => setEditing(false)}
            onSubmitCreate={() => Promise.resolve(err(unknownError()))}
            onSubmitUpdate={value =>
              void update.mutateAsync(value, {
                onSuccess: r => {
                  if (r.ok) {
                    toast.success(t('purchaseOrderForm.created', { ns: 'featMgmt' }));
                    setEditing(false);
                  } else toast.error(r.error.message);
                },
              })
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
