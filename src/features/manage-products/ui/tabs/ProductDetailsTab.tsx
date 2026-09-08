import { useTranslation } from 'react-i18next';
import type { Category } from '@shared/lib/domain';
import { FormField } from '@shared/ui/FormField';
import { MoneyInput } from '@shared/ui/MoneyInput';
import { Checkbox } from '@shared/ui/checkbox';
import { Input } from '@shared/ui/input';

export type ProductDetailsTabProps = {
  name: string;
  onNameChange: (value: string) => void;
  categories: Category[];
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  basePrice: number;
  onBasePriceChange: (value: number) => void;
  sku: string;
  onSkuChange: (value: string) => void;
  barcode: string;
  onBarcodeChange: (value: string) => void;
  isActive: boolean;
  onIsActiveChange: (value: boolean) => void;
  fieldErrors: Record<string, string>;
  submitting: boolean;
};

/**
 * Details panel of `ProductDetailDialog` (Phase 31 D-02). Field logic, Zod
 * parsing, and error flattening all live in the parent dialog — this
 * component is presentational only, lifted verbatim from `ProductForm.tsx`.
 */
export function ProductDetailsTab({
  name,
  onNameChange,
  categories,
  categoryId,
  onCategoryIdChange,
  basePrice,
  onBasePriceChange,
  sku,
  onSkuChange,
  barcode,
  onBarcodeChange,
  isActive,
  onIsActiveChange,
  fieldErrors,
  submitting,
}: ProductDetailsTabProps) {
  const { t } = useTranslation('featMgmt');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FormField
        label={t('manageProducts.productForm.nameLabel')}
        required
        error={fieldErrors.name ?? ''}
        className="lg:col-span-2"
      >
        <Input
          value={name}
          onChange={e => {
            onNameChange(e.target.value);
          }}
          disabled={submitting}
        />
      </FormField>

      <FormField
        label={t('manageProducts.productForm.categoryLabel')}
        required
        error={fieldErrors.categoryId ?? ''}
      >
        <select
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs dark:bg-input/20"
          value={categoryId}
          onChange={e => {
            onCategoryIdChange(e.target.value);
          }}
          disabled={submitting || categories.length === 0}
        >
          {categories.length === 0 ? (
            <option value="">{t('manageProducts.productForm.noCategories')}</option>
          ) : null}
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label={t('manageProducts.productForm.basePriceLabel')}
        required
        error={fieldErrors.basePrice ?? ''}
      >
        <MoneyInput value={basePrice} onChange={onBasePriceChange} disabled={submitting} />
      </FormField>

      {/* Happy-hour pricing is now managed in Settings → Promotions (D-01). */}

      <FormField label={t('manageProducts.productForm.skuLabel')} error={fieldErrors.sku ?? ''}>
        <Input
          value={sku}
          onChange={e => {
            onSkuChange(e.target.value);
          }}
          disabled={submitting}
        />
      </FormField>

      <FormField
        label={t('manageProducts.productForm.barcodeLabel')}
        hint={t('manageProducts.productForm.barcodeHint')}
        error={fieldErrors.barcode ?? ''}
      >
        <Input
          data-testid="product-form-barcode"
          value={barcode}
          onChange={e => {
            onBarcodeChange(e.target.value);
          }}
          disabled={submitting}
        />
      </FormField>

      <div className="flex items-center gap-2 lg:col-span-2">
        <Checkbox
          id="product-active"
          checked={isActive}
          onCheckedChange={v => {
            onIsActiveChange(v === true);
          }}
          disabled={submitting}
        />
        <label htmlFor="product-active" className="text-sm font-medium">
          {t('manageProducts.productForm.activeLabel')}
        </label>
      </div>
    </div>
  );
}
