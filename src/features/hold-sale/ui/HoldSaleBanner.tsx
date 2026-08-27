import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHoldSale } from '@features/hold-sale/model/useHoldSale';
import { ConfirmDialog, POSButton } from '@shared/ui';
import { Badge } from '@shared/ui/badge';

export function HoldSaleBanner() {
  const { t } = useTranslation('wPanels');
  const { isHeld, resumeHeld, discardHeld } = useHoldSale();
  const [discardOpen, setDiscardOpen] = useState(false);

  if (!isHeld) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 lg:col-span-2">
      <Badge>{t('holdSale.badge')}</Badge>
      <div className="flex gap-2">
        <POSButton type="button" variant="outline" onClick={resumeHeld}>
          {t('holdSale.resume')}
        </POSButton>
        <POSButton
          type="button"
          variant="ghost"
          onClick={() => {
            setDiscardOpen(true);
          }}
        >
          {t('holdSale.discard')}
        </POSButton>
      </div>
      <ConfirmDialog
        open={discardOpen}
        title={t('holdSale.discardTitle')}
        description={t('holdSale.discardBody')}
        confirmLabel={t('holdSale.discardConfirm')}
        onCancel={() => {
          setDiscardOpen(false);
        }}
        onConfirm={() => {
          discardHeld();
          setDiscardOpen(false);
        }}
      />
    </div>
  );
}
