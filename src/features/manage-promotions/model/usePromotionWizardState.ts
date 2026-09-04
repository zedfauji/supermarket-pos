import { useEffect, useState } from 'react';
import {
  useMutationCreatePromotion,
  useMutationUpdatePromotion,
  type Promotion,
} from '@entities/promotion';
import type { DiscountType } from '@shared/lib/domain';
import type { Result } from '@shared/lib/result';

export type PromotionWizardStep = 'basics' | 'scope' | 'validity' | 'review';

export const WIZARD_STEP_ORDER: PromotionWizardStep[] = ['basics', 'scope', 'validity', 'review'];

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

function defaultToStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toDateStr(d);
}

/**
 * Wizard state machine for the promotion create/edit flow (D-07/D-08/D-10).
 * This task (28-01) only implements the Basics & Discount step's real
 * fields — Scope/Validity/Review are minimal stand-ins (store-wide target,
 * plain date-range default, no recurrence) that Waves 2 (28-03/28-04)
 * expand into full step UI. `save()` already writes the real
 * junction-table/recurrence shape via the entity mutations, so this task's
 * output is a genuinely working (if partial) wizard, not a throwaway.
 */
export function usePromotionWizardState(promotion: Promotion | null | undefined) {
  const [currentStep, setCurrentStep] = useState<PromotionWizardStep>('basics');
  const [furthestValidStep, setFurthestValidStep] = useState(0);

  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  // String-buffered percent input (mirrors PromotionFormDialog/NearExpirySettingsTab):
  // raw string state, no per-keystroke Number() coercion. Number() applied
  // once, at validate/save time.
  const [discountPercentStr, setDiscountPercentStr] = useState('0');

  // Pitfall 1 note: this plain date-range default uses the SAME
  // browser-local startOfDay/endOfDay helpers PromotionFormDialog already
  // used for the (unchanged-in-this-task) date-range feature — never reuse
  // this pattern for recurrence, which Task 2 routes through
  // settings.general.timezone instead.
  const [fromStr, setFromStr] = useState(() => toDateStr(new Date()));
  const [toStr, setToStr] = useState(defaultToStr);

  const [nameError, setNameError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);

  const createMutation = useMutationCreatePromotion();
  const updateMutation = useMutationUpdatePromotion();
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset the wizard to
       the promotion being edited (or blank, for create) each time the
       identity of `promotion` changes, mirroring PromotionFormDialog's
       existing open/promotion reset effect. */
    if (promotion) {
      setName(promotion.name);
      setDiscountType(promotion.discountType);
      setDiscountValue(promotion.discountValue);
      setDiscountPercentStr(String(promotion.discountValue));
      setFromStr(toDateStr(promotion.startsAt));
      setToStr(toDateStr(promotion.endsAt));
      setFurthestValidStep(WIZARD_STEP_ORDER.length - 1);
    } else {
      setName('');
      setDiscountType('percent');
      setDiscountValue(0);
      setDiscountPercentStr('0');
      setFromStr(toDateStr(new Date()));
      setToStr(defaultToStr());
      setFurthestValidStep(0);
    }
    setCurrentStep('basics');
    setNameError(null);
    setValueError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [promotion]);

  function handleDiscountTypeChange(next: DiscountType) {
    setDiscountType(next);
    if (next === 'percent') setDiscountPercentStr('0');
  }

  /** Validates the Basics & Discount step's fields (D-08 forward-nav gate). */
  function validateBasics(): boolean {
    let hasError = false;
    if (!name.trim()) {
      // eslint-disable-next-line i18next/no-literal-string -- i18n key identifier (resolved by the caller via t(`promotionFormDialog.${nameError}`)), not UI copy
      setNameError('nameError');
      hasError = true;
    } else {
      setNameError(null);
    }
    const percentValue = Number(discountPercentStr);
    if (discountType === 'percent' && (percentValue <= 0 || percentValue > 100)) {
      // eslint-disable-next-line i18next/no-literal-string -- i18n key identifier, not UI copy
      setValueError('discountPercentError');
      hasError = true;
    } else if (discountType === 'fixed' && discountValue <= 0) {
      // eslint-disable-next-line i18next/no-literal-string -- i18n key identifier, not UI copy
      setValueError('discountAmountError');
      hasError = true;
    } else {
      setValueError(null);
    }
    return !hasError;
  }

  async function save(): Promise<Result<Promotion | null>> {
    const percentValue = Number(discountPercentStr);
    const basics = {
      name: name.trim(),
      discountType,
      discountValue: discountType === 'percent' ? percentValue : discountValue,
      startsAt: startOfDay(fromStr),
      endsAt: endOfDay(toStr),
      // Task 1 minimal stand-ins (Scope/Validity real UI lands in 28-03/28-04):
      daysOfWeek: null,
      startTime: null,
      endTime: null,
      active: promotion?.active ?? true,
      createdBy: promotion?.createdBy ?? null,
    };

    if (promotion) {
      // Edit mode: `targets` is intentionally OMITTED here (never sent as
      // `[]`) — the update mutation only touches promotion_targets when
      // `targets !== undefined`. Since this task's Scope step has no real
      // picker UI yet, sending an empty array would silently wipe out any
      // targets an existing promotion already has. Real Scope-step editing
      // (28-03/28-04) will pass the actual selected set here instead.
      return updateMutation.mutateAsync({ id: promotion.id, ...basics });
    }
    // Create mode: a brand-new promotion has no prior targets to lose —
    // an explicit empty array here is exactly D-01's store-wide default.
    return createMutation.mutateAsync({ ...basics, targets: [] });
  }

  return {
    currentStep,
    setCurrentStep,
    furthestValidStep,
    setFurthestValidStep,
    name,
    setName,
    discountType,
    handleDiscountTypeChange,
    discountValue,
    setDiscountValue,
    discountPercentStr,
    setDiscountPercentStr,
    fromStr,
    toStr,
    nameError,
    valueError,
    validateBasics,
    save,
    isPending,
  };
}
