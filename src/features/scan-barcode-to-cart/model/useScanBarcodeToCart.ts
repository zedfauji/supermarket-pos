import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLookupProductByBarcode } from '@features/lookup-product-by-barcode/model/useLookupProductByBarcode';
import { getProductRiskFlag } from '@entities/product/model/productRiskFlag';
import { useConfirmRiskyAdd } from '@entities/product/model/useConfirmRiskyAdd';
import { useCartStore } from '@entities/tab/model/cartStore';
import type { Product } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import { supabase } from '@shared/lib/supabase';
import { useBarcodeScanner } from '@shared/lib/useBarcodeScanner';

const TERMINAL_ID = (import.meta.env.VITE_TERMINAL_ID as string | undefined) ?? 'POS-1';

export function useScanBarcodeToCart(enabled = true, onWeightedProduct: (product: Product) => void) {
  const { t } = useTranslation('featOrders');
  const { lookup } = useLookupProductByBarcode();
  const addItem = useCartStore(state => state.addItem);
  const confirmRiskyAdd = useConfirmRiskyAdd();
  // `enabled` at handleScan's call time can go stale while its async lookup
  // is still in flight (e.g. checkout opens payment mid-lookup) — a plain
  // closure over the `enabled` param would still act on a state that is no
  // longer current. Read the live value at resolution time instead.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const handleScan = async (code: string) => {
    const product = await lookup(code);
    if (!enabledRef.current) {
      logger.debug('barcode_scan.discarded_disabled', { barcode: code });
      return;
    }
    if (product) {
      const commit = () => {
        if (product.soldByWeight) {
          onWeightedProduct(product);
          logger.debug('barcode_scan.weight_entry_opened', {
            barcode: code,
            productId: product.id,
          });
          return;
        }
        addItem(product, []);
        logger.debug('barcode_scan.added', { barcode: code, productId: product.id });
      };
      const flag = getProductRiskFlag(product);
      if (flag) {
        confirmRiskyAdd(flag, product, commit);
        return;
      }
      commit();
      return;
    }

    toast.error(t('scanBarcodeToCart.productNotFound'));
    logger.warn('barcode_scan.not_found', { barcode: code });
    try {
      const { error } = await supabase.rpc('record_audit', {
        p_action: 'barcode.scan_failed',
        p_entity_type: 'product',
        p_entity_id: null,
        p_before: { barcode: code },
        p_after: null,
        p_terminal_id: TERMINAL_ID,
        p_user_id: null,
      } as never);
      if (error)
        logger.warn('barcode_scan.audit_failed', { barcode: code, message: error.message });
    } catch (error) {
      logger.warn('barcode_scan.audit_threw', { barcode: code, error });
    }
  };

  useBarcodeScanner({
    enabled,
    onScan: code => {
      void handleScan(code);
    },
  });
}
