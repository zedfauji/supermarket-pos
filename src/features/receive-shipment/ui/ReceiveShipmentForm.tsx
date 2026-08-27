/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import { useState } from 'react';
import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCategories } from '@entities/category';
import { useProductsForManagement, useMutationCreateProduct } from '@entities/product';
import { useSuppliers } from '@entities/supplier';
import { EmptyState } from '@shared/ui/EmptyState';
import { FormField } from '@shared/ui/FormField';
import { MoneyInput } from '@shared/ui/MoneyInput';
import { POSButton } from '@shared/ui/POSButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Input } from '@shared/ui/input';
import { useReceiveShipment } from '../model/useReceiveShipment';

type Line = {
  productId: string;
  search: string;
  quantity: number;
  costPrice: number;
  expiryDate: string | null;
};
const blank = (): Line => ({
  productId: '',
  search: '',
  quantity: 1,
  costPrice: 0,
  expiryDate: null,
});
type InitialPurchaseOrder = {
  id: string;
  supplierId: string;
  items: { productId: string; productName: string; quantity: number; costPrice: number }[];
};
export function ReceiveShipmentForm({
  open,
  onOpenChange,
  initialPurchaseOrder = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPurchaseOrder?: InitialPurchaseOrder | null;
}) {
  const { t } = useTranslation('featMgmt');
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProductsForManagement();
  const { data: categories } = useCategories();
  const receive = useReceiveShipment();
  const create = useMutationCreateProduct();
  const [supplierId, setSupplierId] = useState(() => initialPurchaseOrder?.supplierId ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    initialPurchaseOrder
      ? initialPurchaseOrder.items.map(i => ({
          productId: i.productId,
          search: i.productName,
          quantity: i.quantity,
          costPrice: i.costPrice,
          expiryDate: null,
        }))
      : []
  );
  const [error, setError] = useState('');
  const [quick, setQuick] = useState<{
    index: number;
    name: string;
    barcode: string;
    categoryId: string;
    price: number;
  } | null>(null);
  const [quickError, setQuickError] = useState('');
  const update = (index: number, patch: Partial<Line>) =>
    setLines(v => v.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const submit = async () => {
    setError('');
    const result = await receive.mutateAsync({
      supplierId,
      items: lines.map(({ productId, quantity, costPrice, expiryDate }) => ({
        productId,
        quantity,
        costPrice,
        expiryDate,
      })),
      poId: initialPurchaseOrder?.id ?? undefined,
    });
    if (!result.ok) {
      // The RPC's raw error code (e.g. PO_ALREADY_RECEIVED) survives only in
      // `details` — the shared edge-error mapper has no explicit case for it,
      // so `code` collapses to the generic 'SUPABASE_ERROR'.
      if (result.error.details === 'PO_ALREADY_RECEIVED') {
        toast.error(t('purchaseOrderDetailPanel.alreadyReceivedError', { ns: 'wAdmin' }));
      } else {
        setError(t('receiveShipment.error'));
      }
      return;
    }
    toast.success(t('receiveShipment.confirm'));
    onOpenChange(false);
    setLines([]);
    setSupplierId('');
  };
  const addProduct = async () => {
    if (!quick) return;
    setQuickError('');
    const result = await create.mutateAsync({
      name: quick.name,
      categoryId: quick.categoryId,
      basePrice: quick.price,
      happyHourPrice: null,
      sku: null,
      isActive: true,
      soldByWeight: false,
      imageUrl: null,
      barcode: quick.barcode || null,
      unitsPerPackage: null,
      parentProductId: null,
      stock_threshold: null,
      comboEligible: true,
      isCombo: false,
      modifierIds: [],
    });
    if (!result.ok) {
      setQuickError(
        result.error.code === 'DUPLICATE_ENTRY'
          ? t('receiveShipment.duplicateBarcode')
          : result.error.message
      );
      return;
    }
    update(quick.index, { productId: result.data.id, search: result.data.name });
    setQuick(null);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('receiveShipment.confirm')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label={t('receiveShipment.supplier')}>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3"
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              disabled={!!initialPurchaseOrder}
            >
              <option value="" />
              {suppliers?.map(s => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          {lines.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t('receiveShipment.emptyTitle')}
              description={t('receiveShipment.emptyBody')}
            />
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {lines.map((line, index) => (
                <div className="grid grid-cols-1 gap-2 border-b pb-3 md:grid-cols-6" key={index}>
                  <Input
                    className="md:col-span-2"
                    aria-label={t('receiveShipment.product')}
                    value={line.search}
                    placeholder={t('receiveShipment.product')}
                    onChange={e => {
                      const search = e.target.value;
                      const match = products?.find(
                        p =>
                          p.name.toLowerCase() === search.toLowerCase() ||
                          p.barcode === search ||
                          p.sku === search
                      );
                      update(index, { search, productId: match?.id ?? '' });
                    }}
                  />
                  <Input
                    type="number"
                    aria-label={t('receiveShipment.quantity')}
                    min="1"
                    value={line.quantity}
                    onChange={e => update(index, { quantity: Number(e.target.value) })}
                  />
                  <MoneyInput
                    label={t('receiveShipment.cost')}
                    value={line.costPrice}
                    onChange={costPrice => update(index, { costPrice })}
                  />
                  <Input
                    type="date"
                    aria-label={t('receiveShipment.expiry')}
                    value={line.expiryDate ?? ''}
                    onChange={e => update(index, { expiryDate: e.target.value || null })}
                  />
                  <div className="flex gap-1">
                    {!line.productId && line.search && (
                      <POSButton
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setQuickError('');
                          setQuick({
                            index,
                            name: line.search,
                            barcode: /^\d{6,}$/.test(line.search) ? line.search : '',
                            categoryId: categories?.[0]?.id ?? '',
                            price: 0,
                          });
                        }}
                      >
                        {t('receiveShipment.addProduct')}
                      </POSButton>
                    )}
                    <POSButton
                      type="button"
                      variant="destructive"
                      onClick={() => setLines(v => v.filter((_, i) => i !== index))}
                    >
                      ×
                    </POSButton>
                  </div>
                </div>
              ))}
            </div>
          )}
          {quick && (
            <div className="grid grid-cols-2 gap-2 rounded border p-3">
              <FormField label={t('manageProducts.productForm.nameLabel')} required>
                <Input
                  value={quick.name}
                  onChange={e => setQuick({ ...quick, name: e.target.value })}
                />
              </FormField>
              <FormField label={t('manageProducts.productForm.barcodeLabel')}>
                <Input
                  value={quick.barcode}
                  onChange={e => setQuick({ ...quick, barcode: e.target.value })}
                />
              </FormField>
              <FormField label={t('manageProducts.productForm.categoryLabel')} required>
                <select
                  className="border-input bg-background h-10 rounded border px-3"
                  value={quick.categoryId}
                  onChange={e => setQuick({ ...quick, categoryId: e.target.value })}
                >
                  {categories?.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <MoneyInput
                label={t('receiveShipment.salePrice')}
                value={quick.price}
                onChange={price => setQuick({ ...quick, price })}
              />
              {quickError && <p className="col-span-2 text-sm text-destructive">{quickError}</p>}
              <POSButton type="button" onClick={() => void addProduct()}>
                {t('receiveShipment.addProduct')}
              </POSButton>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-between">
            <POSButton
              type="button"
              variant="outline"
              onClick={() => setLines(v => [...v, blank()])}
            >
              {t('receiveShipment.addLine')}
            </POSButton>
            <POSButton
              type="button"
              onClick={() => void submit()}
              disabled={
                receive.isPending ||
                !supplierId ||
                lines.length === 0 ||
                lines.some(line => !line.productId || !(line.quantity > 0))
              }
            >
              {t('receiveShipment.confirm')}
            </POSButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
