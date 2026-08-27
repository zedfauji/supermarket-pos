import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { mapProductRow, type ProductRow } from '@entities/product/model/queries';
import type { Product } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import { supabase } from '@shared/lib/supabase';

export function useLookupProductByBarcode() {
  const queryClient = useQueryClient();

  const findCached = useCallback(
    (code: string): Product | null => {
      // eslint-disable-next-line i18next/no-literal-string -- TanStack Query cache key, not UI copy
      const cached = queryClient.getQueryData<Product[] | undefined>(['products']);
      if (Array.isArray(cached)) {
        const hit = cached.find(p => p.barcode === code);
        if (hit) return hit;
      }
      return null;
    },
    [queryClient]
  );

  const lookup = useCallback(
    async (code: string): Promise<Product | null> => {
      const cached = findCached(code);
      if (cached) return cached;

      const { data, error } = await supabase
        .from('products')
        .select(
          `
            *,
            category:categories(*),
            product_modifiers(
              modifier:modifiers(*)
            ),
            inventory(quantity_on_hand, low_stock_threshold)
          ` as never
        )
        // eslint-disable-next-line i18next/no-literal-string -- DB column name, not UI copy
        .eq('barcode' as never, code)
        // A deactivated product's barcode must not be sellable via the
        // cache-miss fallback (T-02-08-02) — findCached() above only ever
        // holds active products since useProducts() filters is_active=true,
        // but a fresh barcode not yet in that cache would otherwise still
        // resolve to an inactive row here.
        .eq('is_active', true)
        .maybeSingle();
      if (error) {
        logger.error('barcode_lookup.failed', { code: error.code, message: error.message });
        return null;
      }
      if (!data) return null;
      const mapped = mapProductRow(data as unknown as ProductRow);
      if (!mapped.ok) {
        logger.error('barcode_lookup.map_failed', { message: mapped.error.message });
        return null;
      }
      return mapped.data;
    },
    [findCached]
  );

  return { lookup };
}
