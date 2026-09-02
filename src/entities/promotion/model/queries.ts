import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Promotion, PromotionCreate, PromotionUpdate } from '@shared/lib/domain';
import { PromotionSchema } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import {
  err,
  ok,
  supabaseMutation,
  supabaseQuery,
  unknownError,
  type Result,
} from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@shared/lib/supabase.types';

// ============================================================================
// QUERY KEYS
// ============================================================================
/* eslint-disable i18next/no-literal-string -- TanStack Query cache-key
   namespace strings below are not UI copy. */

const PROMOTION_QUERY_KEY = ['promotions'] as const;

// ============================================================================
// ROW MAPPER
// ============================================================================

function mapPromotionRow(row: Tables<'promotions'>): Result<Promotion> {
  try {
    return ok(
      PromotionSchema.parse({
        id: row.id,
        name: row.name,
        scopeType: row.scope_type,
        productId: row.product_id,
        categoryId: row.category_id,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
        active: row.active,
        createdAt: new Date(row.created_at),
        createdBy: row.created_by,
      })
    );
  } catch (e) {
    return err(unknownError(e));
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function invalidatePromotionQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: PROMOTION_QUERY_KEY });
}

// ============================================================================
// QUERIES
// ============================================================================

/** Fetches all promotions, newest first (stable default sort order). */
export function usePromotions() {
  const query = useQuery({
    queryKey: PROMOTION_QUERY_KEY,
    queryFn: async (): Promise<Result<Promotion[]>> => {
      const res = await supabaseQuery(() =>
        supabase.from('promotions').select('*').order('created_at', { ascending: false })
      );

      if (!res.ok) {
        logger.error('promotions.fetch_failed', {
          code: res.error.code,
          message: res.error.message,
        });
        return res;
      }

      const promotions: Promotion[] = [];
      for (const row of res.data) {
        const mapped = mapPromotionRow(row);
        if (!mapped.ok) {
          logger.error('promotions.map_failed', { message: mapped.error.message });
          return mapped;
        }
        promotions.push(mapped.data);
      }
      return ok(promotions);
    },
    staleTime: 5 * 60 * 1000,
  });

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useMutationCreatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PromotionCreate): Promise<Result<Promotion>> => {
      const insertRow: TablesInsert<'promotions'> = {
        name: input.name,
        scope_type: input.scopeType,
        product_id: input.productId,
        category_id: input.categoryId,
        discount_type: input.discountType,
        discount_value: input.discountValue,
        starts_at: input.startsAt.toISOString(),
        ends_at: input.endsAt.toISOString(),
        active: input.active,
        created_by: input.createdBy,
      };

      const res = await supabaseMutation(() =>
        supabase.from('promotions').insert(insertRow).select('*').single()
      );

      if (!res.ok) {
        logger.error('promotions.create_failed', { message: res.error.message });
        return res;
      }
      return mapPromotionRow(res.data as unknown as Tables<'promotions'>);
    },
    onSuccess: result => {
      if (result.ok) invalidatePromotionQueries(queryClient);
    },
  });
}

/**
 * Also used for the inline active/inactive Switch toggle — a partial
 * update of just `active`. No separate soft-delete/deactivate mutation:
 * "Delete" in the management UI (Plan 02) is a real DELETE relying on the
 * ON DELETE CASCADE/SET NULL semantics already in the schema.
 */
export function useMutationUpdatePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PromotionUpdate): Promise<Result<null>> => {
      const { id, ...rest } = input;
      const row: TablesUpdate<'promotions'> = {};
      if (rest.name !== undefined) row.name = rest.name;
      if (rest.scopeType !== undefined) row.scope_type = rest.scopeType;
      if (rest.productId !== undefined) row.product_id = rest.productId;
      if (rest.categoryId !== undefined) row.category_id = rest.categoryId;
      if (rest.discountType !== undefined) row.discount_type = rest.discountType;
      if (rest.discountValue !== undefined) row.discount_value = rest.discountValue;
      if (rest.startsAt !== undefined) row.starts_at = rest.startsAt.toISOString();
      if (rest.endsAt !== undefined) row.ends_at = rest.endsAt.toISOString();
      if (rest.active !== undefined) row.active = rest.active;

      if (Object.keys(row).length === 0) return ok(null);

      const res = await supabaseMutation(() =>
        supabase.from('promotions').update(row).eq('id', id)
      );
      if (!res.ok) {
        logger.error('promotions.update_failed', { message: res.error.message });
        return res;
      }
      return ok(null);
    },
    onSuccess: result => {
      if (result.ok) invalidatePromotionQueries(queryClient);
    },
  });
}
