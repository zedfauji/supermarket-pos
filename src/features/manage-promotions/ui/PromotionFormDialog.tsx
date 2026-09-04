import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCategories } from '@entities/category';
import { useProducts } from '@entities/product';
import type { Promotion } from '@entities/promotion';
import { useStaffStore } from '@entities/staff';
import type { DiscountType, PromotionScopeType } from '@shared/lib/domain';
import {
  DateRangePicker,
  FormField,
  Input,
  MoneyInput,
  POSButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/ui';
import { CategoryTreePicker, type CategoryPickerItem } from '@shared/ui/CategoryTreePicker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { useMutationSavePromotion } from '../model/useMutationSavePromotion';

export interface PromotionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit/null for create mode; pass the row being edited for edit mode. */
  promotion?: Promotion | null;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

function startOfDay(str: string): Date {
  return new Date(`${str}T00:00:00`);
}

function endOfDay(str: string): Date {
  return new Date(`${str}T23:59:59`);
}

export function PromotionFormDialog({ open, onOpenChange, promotion }: PromotionFormDialogProps) {
  const { t } = useTranslation('wAdmin');
  const { data: products } = useProducts();
  const { data: categories } = useCategories();
  const currentStaff = useStaffStore(s => s.currentStaff);
  const save = useMutationSavePromotion();

  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<PromotionScopeType>('product');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  // String-buffered percent input (G-27-8 Part A): raw string state, no per-keystroke
  // Number() coercion — mirrors NearExpirySettingsTab.tsx's discountPercent pattern.
  // Number() is applied once, at validate/save time, in handleSave.
  const [discountPercentStr, setDiscountPercentStr] = useState('0');
  const [fromStr, setFromStr] = useState(() => toDateStr(new Date()));
  const [toStr, setToStr] = useState(() => toDateStr(new Date()));
  const [nameError, setNameError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form to the
       promotion being edited (or blank, for create) each time the dialog opens */
    if (!open) return;
    if (promotion) {
      setName(promotion.name);
      setScopeType(promotion.scopeType);
      setTargetId(promotion.scopeType === 'product' ? promotion.productId : promotion.categoryId);
      setDiscountType(promotion.discountType);
      setDiscountValue(promotion.discountValue);
      setDiscountPercentStr(String(promotion.discountValue));
      setFromStr(toDateStr(promotion.startsAt));
      setToStr(toDateStr(promotion.endsAt));
    } else {
      setName('');
      setScopeType('product');
      setTargetId(null);
      setDiscountType('percent');
      setDiscountValue(0);
      setDiscountPercentStr('0');
      setFromStr(toDateStr(new Date()));
      setToStr(toDateStr(new Date()));
    }
    setNameError(null);
    setTargetError(null);
    setValueError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, promotion]);

  const categoryItems: CategoryPickerItem[] = (categories ?? []).map(c => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    color: c.color,
  }));

  function handleScopeTypeChange(next: PromotionScopeType) {
    setScopeType(next);
    // Switching scope type mid-edit clears the previously-selected target —
    // a stale, type-mismatched target id is never submitted.
    setTargetId(null);
  }

  function handleDiscountTypeChange(next: DiscountType) {
    setDiscountType(next);
    // Switching discount type mid-edit resets the percent field to a sane
    // default — a stale string carried over from a previous edit session
    // (or from the fixed-amount branch) is never left in a state that would
    // coerce to NaN once the user switches back to 'percent'.
    if (next === 'percent') setDiscountPercentStr('0');
  }

  async function handleSave() {
    let hasError = false;
    if (!name.trim()) {
      setNameError(t('promotionFormDialog.nameError'));
      hasError = true;
    } else {
      setNameError(null);
    }
    if (!targetId) {
      setTargetError(t('promotionFormDialog.targetError'));
      hasError = true;
    } else {
      setTargetError(null);
    }
    const percentValue = Number(discountPercentStr);
    if (discountType === 'percent' && (percentValue <= 0 || percentValue > 100)) {
      setValueError(t('promotionFormDialog.discountPercentError'));
      hasError = true;
    } else if (discountType === 'fixed' && discountValue <= 0) {
      setValueError(t('promotionFormDialog.discountAmountError'));
      hasError = true;
    } else {
      setValueError(null);
    }
    if (hasError || !targetId) return;

    const result = await save.mutateAsync({
      ...(promotion ? { id: promotion.id } : {}),
      name: name.trim(),
      scopeType,
      productId: scopeType === 'product' ? targetId : null,
      categoryId: scopeType === 'category' ? targetId : null,
      discountType,
      discountValue: discountType === 'percent' ? percentValue : discountValue,
      startsAt: startOfDay(fromStr),
      endsAt: endOfDay(toStr),
      active: promotion?.active ?? true,
      createdBy: promotion?.createdBy ?? currentStaff?.id ?? null,
    });

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('promotionFormDialog.savedToast'));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {promotion ? t('promotionFormDialog.editTitle') : t('promotionFormDialog.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField
            label={t('promotionFormDialog.nameLabel')}
            required
            {...(nameError ? { error: nameError } : {})}
          >
            <Input
              value={name}
              onChange={e => {
                setName(e.target.value);
              }}
              disabled={save.isPending}
            />
          </FormField>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('promotionFormDialog.scopeTypeLabel')}</p>
            <div className="flex gap-2">
              {/* eslint-disable-next-line i18next/no-literal-string -- fixed scope-type enum identifiers, not UI copy */}
              {(['product', 'category'] as const).map(type => (
                <POSButton
                  key={type}
                  type="button"
                  touchSize="default"
                  variant={scopeType === type ? 'default' : 'outline'}
                  disabled={save.isPending}
                  onClick={() => {
                    handleScopeTypeChange(type);
                  }}
                  className="flex-1"
                >
                  {type === 'product'
                    ? t('promotionFormDialog.scopeTypeProduct')
                    : t('promotionFormDialog.scopeTypeCategory')}
                </POSButton>
              ))}
            </div>
          </div>

          {scopeType === 'product' ? (
            <FormField
              label={t('promotionFormDialog.targetProductLabel')}
              required
              {...(targetError ? { error: targetError } : {})}
            >
              <Select
                {...(targetId ? { value: targetId } : {})}
                onValueChange={val => {
                  setTargetId(val);
                }}
                disabled={save.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('promotionFormDialog.targetProductPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : (
            <FormField
              label={t('promotionFormDialog.targetCategoryLabel')}
              required
              {...(targetError ? { error: targetError } : {})}
            >
              <CategoryTreePicker
                items={categoryItems}
                value={targetId}
                onChange={setTargetId}
                disabled={save.isPending}
                label={t('promotionFormDialog.targetCategoryLabel')}
              />
            </FormField>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('promotionFormDialog.discountTypeLabel')}</p>
            <div className="flex gap-2">
              {/* eslint-disable-next-line i18next/no-literal-string -- fixed discount-type enum identifiers, not UI copy */}
              {(['percent', 'fixed'] as const).map(type => (
                <POSButton
                  key={type}
                  type="button"
                  touchSize="default"
                  variant={discountType === type ? 'default' : 'outline'}
                  disabled={save.isPending}
                  onClick={() => {
                    handleDiscountTypeChange(type);
                  }}
                  className="flex-1"
                >
                  {type === 'percent'
                    ? t('promotionFormDialog.discountTypePercent')
                    : t('promotionFormDialog.discountTypeFixed')}
                </POSButton>
              ))}
            </div>
          </div>

          {discountType === 'percent' ? (
            <FormField
              label={t('promotionFormDialog.discountPercentLabel')}
              required
              {...(valueError ? { error: valueError } : {})}
            >
              <Input
                type="number"
                min={0}
                max={100}
                value={discountPercentStr}
                onChange={e => {
                  setDiscountPercentStr(e.target.value);
                }}
                disabled={save.isPending}
              />
            </FormField>
          ) : (
            <FormField
              label={t('promotionFormDialog.discountAmountLabel')}
              required
              {...(valueError ? { error: valueError } : {})}
            >
              <MoneyInput value={discountValue} onChange={setDiscountValue} disabled={save.isPending} />
            </FormField>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('promotionFormDialog.activeRangeLabel')}</p>
            <DateRangePicker
              fromStr={fromStr}
              toStr={toStr}
              onChange={(from, to) => {
                setFromStr(from);
                setToStr(to);
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <POSButton
            type="button"
            touchSize="large"
            disabled={save.isPending}
            onClick={() => {
              void handleSave();
            }}
          >
            {t('promotionFormDialog.saveButton')}
          </POSButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
