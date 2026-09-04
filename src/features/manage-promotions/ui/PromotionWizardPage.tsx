import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { usePromotions } from '@entities/promotion';
import type { DiscountType } from '@shared/lib/domain';
import { cn } from '@shared/lib/utils';
import {
  FormField,
  Input,
  MoneyInput,
  PageContainer,
  POSButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';
import {
  usePromotionWizardState,
  WIZARD_STEP_ORDER,
  type PromotionWizardStep,
} from '../model/usePromotionWizardState';
import { StepReview } from './wizard/StepReview';
import { StepScope } from './wizard/StepScope';
import { StepValidityRecurrence } from './wizard/StepValidityRecurrence';

/**
 * Dedicated create/edit screen for promotions (D-07), replacing the deleted
 * PromotionFormDialog modal. All 4 steps — Basics & Discount (28-01), Scope
 * (28-03), Validity & Recurrence, and Review (28-04) — are real, working
 * steps.
 */
export function PromotionWizardPage() {
  const { t } = useTranslation('wAdmin');
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { data: promotions } = usePromotions();
  const isEditMode = Boolean(id);
  const promotion = isEditMode ? ((promotions ?? []).find(p => p.id === id) ?? null) : null;

  const wizard = usePromotionWizardState(promotion);
  const stepIndex = WIZARD_STEP_ORDER.indexOf(wizard.currentStep);
  const isLastStep = stepIndex === WIZARD_STEP_ORDER.length - 1;
  // D-08 partial: tracks whether the admin tried to leave the Scope/Validity
  // step while it was invalid, so those steps only show their inline error
  // after a real attempt (not on first render).
  const [scopeAttempted, setScopeAttempted] = useState(false);
  const [validityAttempted, setValidityAttempted] = useState(false);

  function goToStep(next: PromotionWizardStep) {
    const nextIndex = WIZARD_STEP_ORDER.indexOf(next);
    if (!isEditMode) {
      if (nextIndex > wizard.furthestValidStep) return;
      // furthestValidStep is a high-water mark set the first time a step was
      // validly passed — it does not retroactively invalidate if the admin
      // goes back and un-does a previously-valid step's fields. Re-check
      // every gated step strictly before the destination (D-08, now covering
      // all 3 gated steps) so a direct tab click can't bypass a
      // since-invalidated step.
      for (let i = 0; i < nextIndex; i++) {
        const step = WIZARD_STEP_ORDER[i];
        if (!step) continue;
        if (step === 'basics' && !wizard.validateBasics()) return;
        if (step === 'scope' && !wizard.isScopeStepValid()) {
          setScopeAttempted(true);
          return;
        }
        if (step === 'validity' && !wizard.isValidityStepValid()) {
          setValidityAttempted(true);
          return;
        }
      }
    }
    wizard.setCurrentStep(next);
  }

  function handleNext() {
    if (wizard.currentStep === 'basics' && !wizard.validateBasics()) return;
    if (wizard.currentStep === 'scope' && !wizard.isScopeStepValid()) {
      setScopeAttempted(true);
      return;
    }
    if (wizard.currentStep === 'validity' && !wizard.isValidityStepValid()) {
      setValidityAttempted(true);
      return;
    }
    const nextIndex = Math.min(stepIndex + 1, WIZARD_STEP_ORDER.length - 1);
    wizard.setFurthestValidStep(Math.max(wizard.furthestValidStep, nextIndex));
    const nextStep = WIZARD_STEP_ORDER[nextIndex];
    if (nextStep) wizard.setCurrentStep(nextStep);
  }

  function handleBack() {
    const prevIndex = Math.max(stepIndex - 1, 0);
    const prevStep = WIZARD_STEP_ORDER[prevIndex];
    if (prevStep) wizard.setCurrentStep(prevStep);
  }

  async function handleSave() {
    // D-10 lets edit mode jump straight to Review without visiting every
    // step; re-validate Basics/Scope/Validity here regardless of entry
    // point, or an invalid Scope step's targets:[] silently saves as if the
    // admin had genuinely chosen store-wide (indistinguishable at the data
    // layer — this was a real data-integrity bug, not just a UX gap).
    if (!wizard.validateBasics()) {
      wizard.setCurrentStep('basics');
      return;
    }
    if (!wizard.isScopeStepValid()) {
      setScopeAttempted(true);
      wizard.setCurrentStep('scope');
      return;
    }
    if (!wizard.isValidityStepValid()) {
      setValidityAttempted(true);
      wizard.setCurrentStep('validity');
      return;
    }
    const result = await wizard.save();
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('promotionFormDialog.savedToast'));
    void navigate('/promotions');
  }

  return (
    <PageContainer
      title={isEditMode ? t('promotionFormDialog.editTitle') : t('promotionFormDialog.createTitle')}
      backTo="/promotions"
    >
      <Tabs
        value={wizard.currentStep}
        onValueChange={next => {
          goToStep(next as PromotionWizardStep);
        }}
      >
        <TabsList>
          {WIZARD_STEP_ORDER.map((step, idx) => (
            <TabsTrigger
              key={step}
              value={step}
              disabled={!isEditMode && idx > wizard.furthestValidStep}
              // Step indicator states (28-UI-SPEC.md): current = accent
              // bg/text; completed & revisitable = the base component's
              // default clickable style; not-yet-reached in create mode =
              // disabled + muted (disabled:opacity-50 from the base
              // component); edit mode = never disabled, per D-10.
              className={cn(
                'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
              )}
            >
              {t(`promotionWizard.step.${step}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="basics">
          <div className="space-y-4">
            <FormField
              label={t('promotionFormDialog.nameLabel')}
              required
              {...(wizard.nameError ? { error: t(`promotionFormDialog.${wizard.nameError}`) } : {})}
            >
              <Input
                value={wizard.name}
                onChange={e => {
                  wizard.setName(e.target.value);
                }}
                disabled={wizard.isPending}
              />
            </FormField>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('promotionFormDialog.discountTypeLabel')}</p>
              <div className="flex gap-2">
                {/* eslint-disable-next-line i18next/no-literal-string -- fixed discount-type enum identifiers, not UI copy */}
                {(['percent', 'fixed'] as const).map((type: DiscountType) => (
                  <POSButton
                    key={type}
                    type="button"
                    touchSize="default"
                    variant={wizard.discountType === type ? 'default' : 'outline'}
                    disabled={wizard.isPending}
                    onClick={() => {
                      wizard.handleDiscountTypeChange(type);
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

            {wizard.discountType === 'percent' ? (
              <FormField
                label={t('promotionFormDialog.discountPercentLabel')}
                required
                {...(wizard.valueError
                  ? { error: t(`promotionFormDialog.${wizard.valueError}`) }
                  : {})}
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={wizard.discountPercentStr}
                  onChange={e => {
                    wizard.setDiscountPercentStr(e.target.value);
                  }}
                  disabled={wizard.isPending}
                />
              </FormField>
            ) : (
              <FormField
                label={t('promotionFormDialog.discountAmountLabel')}
                required
                {...(wizard.valueError
                  ? { error: t(`promotionFormDialog.${wizard.valueError}`) }
                  : {})}
              >
                <MoneyInput
                  value={wizard.discountValue}
                  onChange={wizard.setDiscountValue}
                  disabled={wizard.isPending}
                />
              </FormField>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scope">
          <StepScope
            storeWide={wizard.storeWide}
            onStoreWideChange={wizard.handleStoreWideChange}
            selectedProductIds={wizard.selectedProductIds}
            selectedCategoryIds={wizard.selectedCategoryIds}
            onScopeSelectionChange={wizard.handleScopeSelectionChange}
            showValidationError={scopeAttempted && !wizard.isScopeStepValid()}
            disabled={wizard.isPending}
          />
        </TabsContent>

        <TabsContent value="validity">
          <StepValidityRecurrence
            fromStr={wizard.fromStr}
            toStr={wizard.toStr}
            onDateRangeChange={wizard.handleDateRangeChange}
            recurring={wizard.recurring}
            onRecurringChange={wizard.handleRecurringChange}
            daysOfWeek={wizard.daysOfWeek}
            onToggleDayOfWeek={wizard.toggleDayOfWeek}
            startTime={wizard.startTime}
            endTime={wizard.endTime}
            onStartTimeChange={wizard.setStartTime}
            onEndTimeChange={wizard.setEndTime}
            showValidationError={validityAttempted && !wizard.isValidityStepValid()}
            disabled={wizard.isPending}
          />
        </TabsContent>

        <TabsContent value="review">
          <StepReview
            name={wizard.name}
            discountType={wizard.discountType}
            discountValue={wizard.discountValue}
            discountPercentStr={wizard.discountPercentStr}
            fromStr={wizard.fromStr}
            toStr={wizard.toStr}
            storeWide={wizard.storeWide}
            selectedProductIds={wizard.selectedProductIds}
            selectedCategoryIds={wizard.selectedCategoryIds}
            recurring={wizard.recurring}
            daysOfWeek={wizard.daysOfWeek}
            startTime={wizard.startTime}
            endTime={wizard.endTime}
          />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <POSButton
          type="button"
          variant="outline"
          touchSize="large"
          disabled={stepIndex === 0}
          onClick={handleBack}
        >
          {t('promotionWizard.back')}
        </POSButton>
        {isLastStep ? (
          <POSButton
            type="button"
            touchSize="xl"
            disabled={wizard.isPending}
            onClick={() => {
              void handleSave();
            }}
          >
            {isEditMode ? t('promotionWizard.saveChanges') : t('promotionWizard.createPromotion')}
          </POSButton>
        ) : (
          <POSButton type="button" touchSize="large" onClick={handleNext}>
            {t('promotionWizard.next')}
          </POSButton>
        )}
      </div>
    </PageContainer>
  );
}
