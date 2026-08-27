/**
 * useProcessRefund — TanStack mutation hook for calling the process_refund RPC.
 *
 * Maps REFUND_EXCEEDS_ORIGINAL, ITEM_NOT_IN_ORIGINAL_ORDER, and AUTH_FORBIDDEN
 * error codes to typed AppError results. Validates the payload client-side via
 * ProcessRefundInputSchema (defense-in-depth, SALE-06) before calling the RPC;
 * the RPC's own cross-row/DB-state checks remain the sole authority.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ProcessRefundInputSchema, refundKeys, type ProcessRefundInput } from '@entities/refund';
import { tabKeys } from '@entities/tab';
import i18n from '@shared/lib/i18n';
import type { AppErrorCode, Result } from '@shared/lib/result';
import { err, ok, supabaseMutation } from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';

export type { ProcessRefundInput };

export function useProcessRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProcessRefundInput): Promise<Result<string>> => {
      const parsed = ProcessRefundInputSchema.safeParse(input);
      if (!parsed.success) {
        return err({
          code: 'VALIDATION_ERROR' as AppErrorCode,
          message: i18n.t('featOrders:processRefund.invalidPayload'),
        });
      }
      const rpcRes = await supabaseMutation(() =>
        supabase.rpc('process_refund', {
          p_original_payment_id: parsed.data.originalPaymentId,
          p_items: parsed.data.items,
          p_reason: parsed.data.reason,
          p_manager_pin: '',  // PIN already verified by ManagerPinDialog; RPC re-checks role via auth.uid()
        })
      );
      if (!rpcRes.ok) {
        if (rpcRes.error.message.includes('REFUND_EXCEEDS_ORIGINAL')) {
          return err({ code: 'REFUND_EXCEEDS_ORIGINAL' as AppErrorCode, message: i18n.t('featOrders:processRefund.exceedsOriginal') });
        }
        if (rpcRes.error.message.includes('ITEM_NOT_IN_ORIGINAL_ORDER')) {
          return err({ code: 'ITEM_NOT_IN_ORIGINAL_ORDER' as AppErrorCode, message: i18n.t('featOrders:processRefund.itemNotInOriginalOrder') });
        }
        if (rpcRes.error.message.includes('AUTH_FORBIDDEN')) {
          return err({ code: 'AUTH_FORBIDDEN' as AppErrorCode, message: i18n.t('featOrders:processRefund.authForbidden') });
        }
        return err({
          code: rpcRes.error.code,
          message: i18n.t('featOrders:processRefund.genericError'),
          raw: rpcRes.error.raw,
        });
      }
      if (rpcRes.data === null) {
        return err({
          code: 'SUPABASE_ERROR' as AppErrorCode,
          message: i18n.t('featOrders:processRefund.genericError'),
        });
      }
      void qc.invalidateQueries({ queryKey: refundKeys.lists() });
      void qc.invalidateQueries({ queryKey: refundKeys.byPayment(input.originalPaymentId) });
      void qc.invalidateQueries({ queryKey: tabKeys.lists() });
      return ok(rpcRes.data);
    },
  });
}
