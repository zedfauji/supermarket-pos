/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import { useState } from 'react';
import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useInventory } from '@entities/inventory';
import { useProductsForManagement } from '@entities/product';
import type {
  PurchaseOrder,
  PurchaseOrderCreate,
  PurchaseOrderItemCreate,
} from '@entities/purchase-order';
import { useSuppliers } from '@entities/supplier';
import { useSuggestReorder } from '@features/suggest-reorder';
import type { Result } from '@shared/lib/result';
import { EmptyState } from '@shared/ui/EmptyState';
import { FormField } from '@shared/ui/FormField';
import { MoneyInput } from '@shared/ui/MoneyInput';
import { POSButton } from '@shared/ui/POSButton';
import { Input } from '@shared/ui/input';

type Line = { productId: string; search: string; quantity: number; costPrice: number };
const blank = (): Line => ({ productId: '', search: '', quantity: 1, costPrice: 0 });

export function PurchaseOrderForm({
  initialPurchaseOrder,
  submitting,
  onCancel,
  onSubmitCreate,
  onSubmitUpdate,
}: {
  initialPurchaseOrder: PurchaseOrder | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmitCreate: (value: PurchaseOrderCreate) => Promise<Result<PurchaseOrder>>;
  onSubmitUpdate: (value: {
    id: string;
    supplierId: string;
    items: PurchaseOrderItemCreate[];
  }) => void;
}) {
  const { t } = useTranslation('featMgmt');
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProductsForManagement();
  const { data: inventory } = useInventory();
  const [supplierId, setSupplierId] = useState(initialPurchaseOrder?.supplierId ?? '');
  const [lines, setLines] = useState<Line[]>(
    () =>
      initialPurchaseOrder?.items?.map(i => ({
        productId: i.productId,
        search: i.product?.name ?? '',
        quantity: i.quantity,
        costPrice: i.costPrice,
      })) ?? []
  );
  const [error, setError] = useState('');
  const suggestion = useSuggestReorder(supplierId || undefined);
  const update = (index: number, patch: Partial<Line>) =>
    setLines(v => v.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const submit = async () => {
    setError('');
    const items: PurchaseOrderItemCreate[] = lines.map(({ productId, quantity, costPrice }) => ({
      productId,
      quantity,
      costPrice,
    }));
    if (initialPurchaseOrder) {
      onSubmitUpdate({ id: initialPurchaseOrder.id, supplierId, items });
      return;
    }
    const result = await onSubmitCreate({ supplierId, items });
    if (!result.ok) {
      setError(t('purchaseOrderForm.saveError'));
      return;
    }
    toast.success(t('purchaseOrderForm.created'));
    onCancel();
  };
  const applySuggestion = () => {
    if (!suggestion.data) return;
    setLines(
      suggestion.data.map(s => ({
        productId: s.productId,
        search: s.productName,
        quantity: s.quantity,
        costPrice: s.costPrice,
      }))
    );
  };
  const showNoReorderNeeded = !!supplierId && lines.length === 0 && suggestion.data?.length === 0;
  return (
    <div className="space-y-4">
      <FormField label={t('receiveShipment.supplier')}>
        <select
          className="h-10 w-full rounded-lg border border-input bg-card px-3 shadow-xs dark:bg-input/20"
          value={supplierId}
          onChange={e => setSupplierId(e.target.value)}
          disabled={submitting}
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
        showNoReorderNeeded ? (
          <p className="text-sm text-muted-foreground">{t('purchaseOrderForm.noReorderNeeded')}</p>
        ) : (
          <EmptyState
            icon={Package}
            title={t('purchaseOrderForm.emptyTitle')}
            description={t('purchaseOrderForm.emptyBody')}
          />
        )
      ) : (
        <div className="max-h-72 space-y-4 overflow-y-auto">
          {lines.map((line, index) => (
            <div className="grid grid-cols-1 gap-4 border-b pb-4 md:grid-cols-5" key={index}>
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
                  if (match) {
                    const costPrice =
                      inventory?.find(i => i.productId === match.id)?.costPrice ?? 0;
                    update(index, { search, productId: match.id, costPrice });
                  } else {
                    update(index, { search, productId: '' });
                  }
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
              <POSButton
                type="button"
                variant="destructive"
                onClick={() => setLines(v => v.filter((_, i) => i !== index))}
              >
                ×
              </POSButton>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between">
        <div className="flex gap-2">
          <POSButton type="button" variant="outline" onClick={() => setLines(v => [...v, blank()])}>
            {t('receiveShipment.addLine')}
          </POSButton>
          <POSButton
            type="button"
            variant="outline"
            disabled={!supplierId || lines.length > 0}
            onClick={applySuggestion}
          >
            {t('purchaseOrderForm.suggestReorder')}
          </POSButton>
        </div>
        <div className="flex gap-2">
          <POSButton type="button" variant="outline" onClick={onCancel}>
            {t('common:actions.cancel')}
          </POSButton>
          <POSButton
            type="button"
            onClick={() => void submit()}
            disabled={
              submitting ||
              !supplierId ||
              lines.length === 0 ||
              lines.some(line => !line.productId || !(line.quantity > 0))
            }
          >
            {t('purchaseOrderForm.save')}
          </POSButton>
        </div>
      </div>
    </div>
  );
}
