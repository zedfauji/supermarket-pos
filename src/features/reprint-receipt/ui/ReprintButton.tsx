/**
 * ReprintButton — reconstructs and reprints a completed sale's full receipt.
 *
 * No dialog, no PIN gate: reprint is a read-only, non-destructive action
 * (RESEARCH.md Open Questions #2 / 13-UI-SPEC.md Interaction Contract).
 * Renders unconditionally for every payment row — unlike its siblings, it
 * is not scoped to the clicked row's tender leg; it reconstructs the whole
 * sale grouped by tabId (RESEARCH.md Pitfall 4 / CR-03).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { fetchReceiptDataForPayment, paymentReceiptKeys, type Payment } from '@entities/payment';
import { useReceiptSettings } from '@entities/settings';
import { ReceiptSettingsSchema } from '@shared/lib/domain';
import { printJobErrorCopyKey, printReceipt } from '@shared/lib/pos-printer';
import { POSButton } from '@shared/ui';

export interface ReprintButtonProps {
  payment: Payment;
}

export function ReprintButton({ payment }: ReprintButtonProps) {
  const { t } = useTranslation('wPanels');
  const [busy, setBusy] = useState(false);
  const { data: settings } = useReceiptSettings();
  const queryClient = useQueryClient();

  async function handleClick() {
    setBusy(true);
    try {
      const receipt = await queryClient.fetchQuery({
        queryKey: paymentReceiptKeys.byTab(payment.tabId),
        queryFn: () => fetchReceiptDataForPayment(payment.tabId),
      });
      const printed = await printReceipt(receipt, settings ?? ReceiptSettingsSchema.parse({}));
      if (!printed.ok) {
        toast.error(t(printJobErrorCopyKey(printed.error.code)));
      }
      // No toast on success — a successful durable acceptance stays silent
      // (status badge only, wired in a later plan); see UI-SPEC's
      // no-success-toast rule (PRN-04/UX).
    } catch {
      toast.error(t('paymentPane.reprintDataFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <POSButton
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => {
        void handleClick();
      }}
    >
      {busy ? t('paymentPane.reprinting') : t('paymentPane.reprint')}
    </POSButton>
  );
}
