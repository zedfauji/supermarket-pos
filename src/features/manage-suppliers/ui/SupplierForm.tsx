/* eslint-disable import/order, react-hooks/set-state-in-effect, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unused-expressions */
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Product, SupplierCreate, SupplierUpdate } from '@shared/lib/domain';
import { FormField } from '@shared/ui/FormField';
import { POSButton } from '@shared/ui/POSButton';
import { ScrollArea } from '@shared/ui/ScrollArea';
import { Checkbox } from '@shared/ui/checkbox';
import { Input } from '@shared/ui/input';
import type { Supplier } from '@entities/supplier';
import { useSupplierProductIds } from '@entities/supplier';

type Payload = SupplierCreate & { productIds: string[] };
export function SupplierForm({
  initialSupplier,
  products,
  submitting,
  onSubmitCreate,
  onSubmitUpdate,
  onCancel,
}: {
  initialSupplier?: Supplier | null;
  products: Product[];
  submitting?: boolean;
  onSubmitCreate: (payload: Payload) => void;
  onSubmitUpdate: (payload: SupplierUpdate & { productIds: string[] }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('featMgmt');
  const { data: linked } = useSupplierProductIds(initialSupplier?.id);
  const [name, setName] = useState(initialSupplier?.name ?? '');
  const [contactName, setContactName] = useState(initialSupplier?.contactName ?? '');
  const [phone, setPhone] = useState(initialSupplier?.phone ?? '');
  const [email, setEmail] = useState(initialSupplier?.email ?? '');
  const [address, setAddress] = useState(initialSupplier?.address ?? '');
  const [notes, setNotes] = useState(initialSupplier?.notes ?? '');
  const [productIds, setProductIds] = useState<string[]>([]);
  useEffect(() => {
    if (linked) setProductIds(linked);
  }, [linked]);
  const toggle = (id: string) =>
    setProductIds(x => (x.includes(id) ? x.filter(v => v !== id) : [...x, id]));
  const nil = (value: string) => value.trim() || null;
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    const value = {
      name,
      contactName: nil(contactName),
      phone: nil(phone),
      email: nil(email),
      address: nil(address),
      notes: nil(notes),
      productIds,
    };
    initialSupplier ? onSubmitUpdate({ ...value, id: initialSupplier.id }) : onSubmitCreate(value);
  };
  return (
    <form className="space-y-4" onSubmit={submit}>
      <FormField label={t('manageSuppliers.supplierForm.name')} required>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={submitting}
          required
        />
      </FormField>
      <FormField label={t('manageSuppliers.supplierForm.contactName')}>
        <Input
          value={contactName}
          onChange={e => setContactName(e.target.value)}
          disabled={submitting}
        />
      </FormField>
      <FormField label={t('manageSuppliers.supplierForm.phone')}>
        <Input value={phone} onChange={e => setPhone(e.target.value)} disabled={submitting} />
      </FormField>
      <FormField label={t('manageSuppliers.supplierForm.email')}>
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={submitting}
        />
      </FormField>
      <FormField label={t('manageSuppliers.supplierForm.address')}>
        <Input value={address} onChange={e => setAddress(e.target.value)} disabled={submitting} />
      </FormField>
      <FormField label={t('manageSuppliers.supplierForm.notes')}>
        <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={submitting} />
      </FormField>
      <FormField label={t('manageSuppliers.supplierForm.productsLabel')}>
        <ScrollArea className="max-h-40 rounded-md border p-2">
          <ul className="space-y-2 pr-2">
            {products.length ? (
              products.map(product => (
                <li key={product.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`supplier-product-${product.id}`}
                    checked={productIds.includes(product.id)}
                    onCheckedChange={() => toggle(product.id)}
                  />
                  <label className="text-sm" htmlFor={`supplier-product-${product.id}`}>
                    {product.name}
                  </label>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground text-sm">
                {t('manageSuppliers.supplierForm.noProductsDefined')}
              </li>
            )}
          </ul>
        </ScrollArea>
      </FormField>
      <div className="flex justify-end gap-2 border-t pt-4">
        <POSButton type="button" variant="outline" onClick={onCancel}>
          {t('common:actions.cancel')}
        </POSButton>
        <POSButton type="submit" disabled={submitting || !name.trim()}>
          {t(
            initialSupplier
              ? 'manageSuppliers.supplierForm.save'
              : 'manageSuppliers.supplierForm.create'
          )}
        </POSButton>
      </div>
    </form>
  );
}
