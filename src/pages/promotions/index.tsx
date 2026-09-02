import { useTranslation } from 'react-i18next';
import { PageContainer, POSButton } from '@shared/ui';

export default function PromotionsPage() {
  const { t } = useTranslation('pages');
  return (
    <PageContainer
      title={t('promotions.title')}
      backTo="/home"
      actions={<POSButton type="button">{t('promotions.newPromotion')}</POSButton>}
    >
      <></>
      {/* Task 2 wires the promotions DataTable + Create/Edit dialog here */}
    </PageContainer>
  );
}
