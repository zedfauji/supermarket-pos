/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import { useState } from 'react';
import { Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProductsForManagement } from '@entities/product';
import {
  useMutationCreateSupplier,
  useMutationDeleteSupplier,
  useMutationUpdateSupplier,
  useSuppliers,
  type Supplier,
} from '@entities/supplier';
import { SupplierForm } from '@features/manage-suppliers';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { EmptyState } from '@shared/ui/EmptyState';
import { TableRowSkeleton } from '@shared/ui/LoadingSkeletons';
import { POSButton } from '@shared/ui/POSButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
export function SupplierListPanel() {
  const { t } = useTranslation('wAdmin');
  const { data: suppliers, isLoading, resultError } = useSuppliers();
  const { data: products } = useProductsForManagement();
  const create = useMutationCreateSupplier();
  const update = useMutationUpdateSupplier();
  const remove = useMutationDeleteSupplier();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setEditing(null);
  };
  const form = (
    <SupplierForm
      initialSupplier={editing}
      products={products ?? []}
      submitting={create.isPending || update.isPending}
      onCancel={close}
      onSubmitCreate={value =>
        void create.mutateAsync(value, {
          onSuccess: result => {
            if (result.ok) {
              toast.success(value.name);
              close();
            } else toast.error(result.error.message);
          },
        })
      }
      onSubmitUpdate={value =>
        void update.mutateAsync(value, {
          onSuccess: result => {
            if (result.ok) close();
            else toast.error(result.error.message);
          },
        })
      }
    />
  );
  if (isLoading)
    return (
      <div className="space-y-4">
        <TableRowSkeleton columns={2} />
        <TableRowSkeleton columns={2} />
        <TableRowSkeleton columns={2} />
      </div>
    );
  if (suppliers?.length === 0)
    return (
      <>
        <EmptyState
          icon={Truck}
          title={t('supplierListPanel.emptyTitle')}
          description={t('supplierListPanel.emptyBody')}
          action={{ label: t('supplierListPanel.addSupplier'), onClick: () => setOpen(true) }}
        />
        <Dialog open={open} onOpenChange={value => !value && close()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('supplierListPanel.newSupplier')}</DialogTitle>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      </>
    );
  return (
    <section className="space-y-4">
      {resultError ? (
        <p className="text-sm text-destructive" role="alert">
          {resultError.message}
        </p>
      ) : null}
      <POSButton type="button" onClick={() => setOpen(true)}>
        {t('supplierListPanel.newSupplier')}
      </POSButton>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {suppliers?.map(s => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <span className="truncate font-medium">{s.name}</span>
            <span className="flex gap-2">
              <POSButton
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(s);
                  setOpen(true);
                }}
              >
                {t('supplierListPanel.edit')}
              </POSButton>
              <POSButton type="button" variant="destructive" onClick={() => setDeleteId(s.id)}>
                {t('supplierListPanel.delete')}
              </POSButton>
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={value => !value && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('supplierListPanel.newSupplier')}</DialogTitle>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleteId}
        title={t('supplierListPanel.deleteSupplierTitle')}
        description={t('supplierListPanel.deleteSupplierBody')}
        confirmLabel={t('supplierListPanel.delete')}
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
