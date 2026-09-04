import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { usePromotions } from '@entities/promotion';
import type { DiscountType } from '@shared/lib/domain';
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

/**
 * Dedicated create/edit screen for promotions (D-07), replacing the deleted
 * PromotionFormDialog modal. This task (28-01) ships a real, working
 * Basics & Discount step end-to-end; the Scope/Validity/Review steps are
 * minimal placeholder panels — the full 4-step flow (multi-select target
 * picker, recurrence fields, live price preview) lands in 28-03/28-04.
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

  function goToStep(next: PromotionWizardStep) {
    const nextIndex = WIZARD_STEP_ORDER.indexOf(next);
    if (!isEditMode && nextIndex > wizard.furthestValidStep) return;
    wizard.setCurrentStep(next);
  }

  function handleNext() {
    if (wizard.currentStep === 'basics' && !wizard.validateBasics()) return;
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
    if (!wizard.validateBasics()) {
      wizard.setCurrentStep('basics');
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
          <p className="text-sm text-muted-foreground">{t('promotionWizard.comingSoon')}</p>
        </TabsContent>

        <TabsContent value="validity">
          <p className="text-sm text-muted-foreground">{t('promotionWizard.comingSoon')}</p>
        </TabsContent>

        <TabsContent value="review">
          <p className="text-sm text-muted-foreground">{t('promotionWizard.comingSoon')}</p>
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
