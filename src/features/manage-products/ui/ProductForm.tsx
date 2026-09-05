import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { CreateProductInput, UpdateProductInput } from '@entities/product';
import type { Category, Modifier, Product, Supplier } from '@shared/lib/domain';
import { ProductCreateSchema, ProductUpdateSchema, UuidSchema } from '@shared/lib/domain';
import { formatMoney } from '@shared/lib/format';
import { FormField } from '@shared/ui/FormField';
import { MoneyInput } from '@shared/ui/MoneyInput';
import { POSButton } from '@shared/ui/POSButton';
import { ScrollArea } from '@shared/ui/ScrollArea';
import { Checkbox } from '@shared/ui/checkbox';
import { Input } from '@shared/ui/input';

const ModifierIdsSchema = z.array(UuidSchema);

export type ProductFormProps = {
  categories: Category[];
  modifiers: Modifier[];
  /** All catalog products — used to populate the parent-package selector. */
  products: Product[];
  suppliers: Supplier[];
  supplierIds?: readonly string[] | undefined;
  /** When set, form is in edit mode */
  initialProduct?: Product | null;
  submitting?: boolean;
  onSubmitCreate: (payload: CreateProductInput) => void;
  onSubmitUpdate: (payload: UpdateProductInput) => void;
  onCancel: () => void;
};

export function ProductForm({
  categories,
  modifiers,
  products,
  suppliers,
  supplierIds,
  initialProduct,
  submitting = false,
  onSubmitCreate,
  onSubmitUpdate,
  onCancel,
}: ProductFormProps) {
  const { t } = useTranslation('featMgmt');
  const isEdit = initialProduct != null;

  const [name, setName] = useState(initialProduct?.name ?? '');
  const [categoryId, setCategoryId] = useState(
    initialProduct?.categoryId ?? categories[0]?.id ?? ''
  );
  const [basePrice, setBasePrice] = useState(initialProduct?.basePrice ?? 0);
  const [sku, setSku] = useState(initialProduct?.sku ?? '');
  const [barcode, setBarcode] = useState(initialProduct?.barcode ?? '');
  const [unitsPerPackageInput, setUnitsPerPackageInput] = useState(
    initialProduct?.unitsPerPackage != null ? String(initialProduct.unitsPerPackage) : ''
  );
  const [parentProductIdInput, setParentProductIdInput] = useState(
    initialProduct?.parentProductId ?? ''
  );
  const [isActive, setIsActive] = useState(initialProduct?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState(initialProduct?.imageUrl ?? '');
  const [modifierIds, setModifierIds] = useState<string[]>(
    () => initialProduct?.modifiers.map(m => m.id) ?? []
  );
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>(() => [
    ...(supplierIds ?? []),
  ]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // `categoryId`'s initializer above only runs once, at mount — if the
  // dialog opens before the parent's `useCategories()` query has resolved
  // (`categories` is still `[]` on that first render), categoryId is
  // permanently stuck at `''` for the rest of this mount, since nothing
  // else ever re-evaluates that default. Submitting then fails
  // ProductCreateSchema's UUID check with no visible field error rendered
  // anywhere a user would look (the Category select just silently shows the
  // "No categories" placeholder for a moment, then a real category, while
  // categoryId itself was never updated to match). Backfill once categories
  // arrive, but only while still unset — never override an explicit choice.
  useEffect(() => {
    const firstCategoryId = categories[0]?.id;
    if (categoryId === '' && firstCategoryId != null) {
      // Syncing internal state from an async prop that can arrive after
      // mount — same sanctioned pattern as shared/ui/MoneyInput.tsx's own
      // display-value sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategoryId(firstCategoryId);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (supplierIds) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async query result initializes edit form
      setSelectedSupplierIds([...supplierIds]);
    }
  }, [supplierIds]);

  const sortedModifiers = useMemo(
    () => [...modifiers].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [modifiers]
  );

  // Only a configured package product (units-per-package set) is a legal
  // parent, and a product can never be its own parent (D-01/T-27-18).
  const parentPackageOptions = useMemo(
    () =>
      products
        .filter(p => p.unitsPerPackage != null && p.id !== initialProduct?.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, initialProduct?.id]
  );

  function toggleModifier(id: string) {
    setModifierIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  function toggleSupplier(id: string) {
    setSelectedSupplierIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    const modParsed = ModifierIdsSchema.safeParse(modifierIds);
    if (!modParsed.success) {
      setFieldErrors({ modifiers: t('manageProducts.productForm.invalidModifierSelection') });
      return;
    }

    const skuVal = sku.trim() === '' ? null : sku.trim();
    const imageVal = imageUrl.trim() === '' ? null : imageUrl.trim();
    const barcodeVal = barcode.trim() === '' ? null : barcode.trim();
    const parentProductId = parentProductIdInput === '' ? null : parentProductIdInput;

    let unitsPerPackage: number | null = null;
    if (unitsPerPackageInput.trim() !== '') {
      const parsedUnits = Number.parseInt(unitsPerPackageInput.trim(), 10);
      if (!Number.isFinite(parsedUnits) || parsedUnits < 1) {
        setFieldErrors({
          unitsPerPackage: t('manageProducts.productForm.unitsPerPackageMinError'),
        });
        return;
      }
      unitsPerPackage = parsedUnits;
    }

    // happyHourPrice is always null — happy-hour pricing is now managed in
    // Settings → Promotions (D-01); this vestigial nullable Zod field must
    // still be present in the parsed payload.
    //
    // stock_threshold has no input in this form (it's set via a separate
    // low-stock-alert flow, not exposed here) but ProductSchema requires the
    // key present (nullable, not optional) — omitting it entirely fails
    // ProductCreateSchema.safeParse with a silent, invisible "expected
    // number, received undefined" field error on a key this form has no
    // control for, so every "Create product" submission was failing with no
    // visible feedback. Preserve the existing value on edit; default to null
    // (not tracked) on create, matching the low-stock-report query's own
    // treatment of null as "not configured".
    if (initialProduct != null) {
      const parsed = ProductUpdateSchema.safeParse({
        id: initialProduct.id,
        name,
        categoryId,
        basePrice,
        happyHourPrice: null,
        sku: skuVal,
        isActive,
        imageUrl: imageVal,
        barcode: barcodeVal,
        unitsPerPackage,
        parentProductId,
        stock_threshold: initialProduct.stock_threshold ?? null,
      });
      if (!parsed.success) {
        const flat = z.flattenError(parsed.error);
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(flat.fieldErrors)) {
          const first = Array.isArray(v) ? v[0] : undefined;
          if (first) next[k] = first;
        }
        if (Object.keys(next).length === 0 && parsed.error.issues[0]) {
          next._form = parsed.error.issues[0].message;
        }
        setFieldErrors(next);
        return;
      }
      onSubmitUpdate({
        ...parsed.data,
        modifierIds: modParsed.data,
        supplierIds: selectedSupplierIds,
      });
      return;
    }

    const parsed = ProductCreateSchema.safeParse({
      name,
      categoryId,
      basePrice,
      happyHourPrice: null,
      sku: skuVal,
      isActive,
      imageUrl: imageVal,
      barcode: barcodeVal,
      unitsPerPackage,
      parentProductId,
      stock_threshold: null,
    });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat.fieldErrors)) {
        const first = Array.isArray(v) ? v[0] : undefined;
        if (first) next[k] = first;
      }
      if (Object.keys(next).length === 0 && parsed.error.issues[0]) {
        next._form = parsed.error.issues[0].message;
      }
      setFieldErrors(next);
      return;
    }

    onSubmitCreate({
      ...parsed.data,
      modifierIds: modParsed.data,
      supplierIds: selectedSupplierIds,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-h-[min(70vh,560px)] flex-col gap-4 overflow-y-auto"
    >
      {/* Phase 27 (27-08 fixup): the units-per-package/parent-product fields pushed
          this form past its own max-height with no way to reach the submit button —
          DialogContent is `position: fixed` with no scroll container of its own
          (shared/ui/dialog.tsx), and this form had `max-height` without `overflow`,
          which doesn't clip/scroll, just lets content visually spill past the fixed
          dialog's bounds. `overflow-y-auto` makes the form itself the scroll region
          so Save/Create stays reachable regardless of viewport height. */}
      {fieldErrors._form ? <p className="text-sm text-destructive">{fieldErrors._form}</p> : null}

      <FormField
        label={t('manageProducts.productForm.nameLabel')}
        required
        error={fieldErrors.name ?? ''}
      >
        <Input
          value={name}
          onChange={e => {
            setName(e.target.value);
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
            setCategoryId(e.target.value);
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
        <MoneyInput value={basePrice} onChange={setBasePrice} disabled={submitting} />
      </FormField>

      {/* Happy-hour pricing is now managed in Settings → Promotions (D-01). */}

      <FormField label={t('manageProducts.productForm.skuLabel')} error={fieldErrors.sku ?? ''}>
        <Input
          value={sku}
          onChange={e => {
            setSku(e.target.value);
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
            setBarcode(e.target.value);
          }}
          disabled={submitting}
        />
      </FormField>

      <FormField
        label={t('manageProducts.productForm.unitsPerPackageLabel')}
        hint={t('manageProducts.productForm.unitsPerPackageHint')}
        error={fieldErrors.unitsPerPackage ?? ''}
      >
        <Input
          type="number"
          min={1}
          step={1}
          value={unitsPerPackageInput}
          onChange={e => {
            setUnitsPerPackageInput(e.target.value);
          }}
          disabled={submitting}
        />
      </FormField>

      <FormField
        label={t('manageProducts.productForm.parentProductLabel')}
        hint={t('manageProducts.productForm.parentProductHint')}
        error={fieldErrors.parentProductId ?? ''}
      >
        <select
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-xs dark:bg-input/20"
          value={parentProductIdInput}
          onChange={e => {
            setParentProductIdInput(e.target.value);
          }}
          disabled={submitting}
        >
          <option value="">{t('manageProducts.productForm.noParentProduct')}</option>
          {parentPackageOptions.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label={t('manageProducts.productForm.imageUrlLabel')}
        error={fieldErrors.imageUrl ?? ''}
      >
        <Input
          value={imageUrl}
          onChange={e => {
            setImageUrl(e.target.value);
          }}
          placeholder={t('manageProducts.productForm.imageUrlPlaceholder')}
          disabled={submitting}
        />
      </FormField>

      <div className="flex items-center gap-2">
        <Checkbox
          id="product-active"
          checked={isActive}
          onCheckedChange={v => {
            setIsActive(v === true);
          }}
          disabled={submitting}
        />
        <label htmlFor="product-active" className="text-sm font-medium">
          {t('manageProducts.productForm.activeLabel')}
        </label>
      </div>

      <FormField
        label={t('manageProducts.productForm.modifiersLabel')}
        error={fieldErrors.modifiers ?? ''}
      >
        <ScrollArea className="max-h-40 rounded-lg border border-border bg-card p-2">
          <ul className="space-y-2 pr-2">
            {sortedModifiers.length === 0 ? (
              <li className="text-muted-foreground text-sm">
                {t('manageProducts.productForm.noModifiersDefined')}
              </li>
            ) : (
              sortedModifiers.map(m => (
                <li key={m.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`mod-${m.id}`}
                    checked={modifierIds.includes(m.id)}
                    onCheckedChange={() => {
                      toggleModifier(m.id);
                    }}
                    disabled={submitting}
                  />
                  <label htmlFor={`mod-${m.id}`} className="text-sm">
                    {m.name}{' '}
                    {/* eslint-disable i18next/no-literal-string -- signed money formatting (parens), not UI copy */}
                    <span className="text-muted-foreground">
                      ({formatMoney(m.priceDelta, { showSign: true })})
                    </span>
                    {/* eslint-enable i18next/no-literal-string */}
                  </label>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </FormField>

      <FormField label={t('manageProducts.productForm.suppliersLabel')}>
        <ScrollArea className="max-h-40 rounded-lg border border-border bg-card p-2">
          <ul className="space-y-2 pr-2">
            {suppliers.length === 0 ? (
              <li className="text-muted-foreground text-sm">
                {t('manageProducts.productForm.noSuppliersDefined')}
              </li>
            ) : (
              suppliers.map(supplier => (
                <li key={supplier.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`product-supplier-${supplier.id}`}
                    checked={selectedSupplierIds.includes(supplier.id)}
                    onCheckedChange={() => {
                      toggleSupplier(supplier.id);
                    }}
                    disabled={submitting}
                  />
                  <label htmlFor={`product-supplier-${supplier.id}`} className="text-sm">
                    {supplier.name}
                  </label>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </FormField>

      <div className="mt-auto flex flex-wrap justify-end gap-2 border-t pt-4">
        <POSButton
          type="button"
          variant="outline"
          touchSize="default"
          disabled={submitting}
          onClick={onCancel}
        >
          {t('common:actions.cancel')}
        </POSButton>
        <POSButton
          type="submit"
          touchSize="default"
          disabled={submitting || categories.length === 0}
        >
          {submitting
            ? t('common:actions.saving')
            : isEdit
              ? t('manageProducts.productForm.saveProduct')
              : t('manageProducts.productForm.createProduct')}
        </POSButton>
      </div>
    </form>
  );
}
