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

/** Row shape returned by the `*, promotion_targets(*)` nested-join select. */
type PromotionRowWithTargets = Tables<'promotions'> & {
  promotion_targets: Tables<'promotion_targets'>[] | null;
};

function mapPromotionRow(row: PromotionRowWithTargets): Result<Promotion> {
  try {
    return ok(
      PromotionSchema.parse({
        id: row.id,
        name: row.name,
        targets: (row.promotion_targets ?? []).map(t => ({
          id: t.id,
          promotionId: t.promotion_id,
          productId: t.product_id,
          categoryId: t.category_id,
        })),
        discountType: row.discount_type,
        discountValue: row.discount_value,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
        daysOfWeek: row.days_of_week,
        startTime: row.start_time,
        endTime: row.end_time,
        needsReview: row.needs_review,
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

/** Fetches all promotions (with their targets), newest first (stable default sort order). */
export function usePromotions() {
  const query = useQuery({
    queryKey: PROMOTION_QUERY_KEY,
    queryFn: async (): Promise<Result<Promotion[]>> => {
      const res = await supabaseQuery(() =>
        supabase
          .from('promotions')
          .select('*, promotion_targets(*)')
          .order('created_at', { ascending: false })
      );

      if (!res.ok) {
        logger.error('promotions.fetch_failed', {
          code: res.error.code,
          message: res.error.message,
        });
        return res;
      }

      const promotions: Promotion[] = [];
      for (const row of res.data as unknown as PromotionRowWithTargets[]) {
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
        discount_type: input.discountType,
        discount_value: input.discountValue,
        starts_at: input.startsAt.toISOString(),
        ends_at: input.endsAt.toISOString(),
        days_of_week: input.daysOfWeek,
        start_time: input.startTime,
        end_time: input.endTime,
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
      const promotionRow = res.data as unknown as Tables<'promotions'>;
      const promotionId = promotionRow.id;
      let insertedTargets: Tables<'promotion_targets'>[] = [];

      if (input.targets.length > 0) {
        const targetRows: TablesInsert<'promotion_targets'>[] = input.targets.map(t => ({
          promotion_id: promotionId,
          product_id: t.productId,
          category_id: t.categoryId,
        }));
        const targetsRes = await supabaseMutation(() =>
          supabase.from('promotion_targets').insert(targetRows).select('*')
        );
        if (!targetsRes.ok) {
          logger.error('promotions.create_targets_failed', {
            message: targetsRes.error.message,
            promotionId,
          });
          // The promotion row itself was created successfully — do not
          // silently leave an orphaned store-wide promotion. Surface the
          // promotion id so the admin can retry adding targets via edit.
          return err(
            unknownError(
              new Error(
                `Promotion "${input.name}" (${promotionId}) was created, but its targets failed to save: ${targetsRes.error.message}. Edit the promotion to retry.`
              )
            )
          );
        }
        insertedTargets = targetsRes.data as unknown as Tables<'promotion_targets'>[];
      }

      return mapPromotionRow({
        ...promotionRow,
        promotion_targets: insertedTargets,
      });
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
      const { id, targets, ...rest } = input;
      const row: TablesUpdate<'promotions'> = {};
      if (rest.name !== undefined) row.name = rest.name;
      if (rest.discountType !== undefined) row.discount_type = rest.discountType;
      if (rest.discountValue !== undefined) row.discount_value = rest.discountValue;
      if (rest.startsAt !== undefined) row.starts_at = rest.startsAt.toISOString();
      if (rest.endsAt !== undefined) row.ends_at = rest.endsAt.toISOString();
      if (rest.daysOfWeek !== undefined) row.days_of_week = rest.daysOfWeek;
      if (rest.startTime !== undefined) row.start_time = rest.startTime;
      if (rest.endTime !== undefined) row.end_time = rest.endTime;
      if (rest.active !== undefined) row.active = rest.active;

      if (Object.keys(row).length > 0) {
        const res = await supabaseMutation(() =>
          supabase.from('promotions').update(row).eq('id', id)
        );
        if (!res.ok) {
          logger.error('promotions.update_failed', { message: res.error.message });
          return res;
        }
      }

      // Delete + reinsert (not a diff) — simplest correct approach for a
      // handful of target rows per promotion.
      if (targets !== undefined) {
        const delRes = await supabaseMutation(() =>
          supabase.from('promotion_targets').delete().eq('promotion_id', id)
        );
        if (!delRes.ok) {
          logger.error('promotions.update_targets_delete_failed', {
            message: delRes.error.message,
          });
          return delRes;
        }
        if (targets.length > 0) {
          const targetRows: TablesInsert<'promotion_targets'>[] = targets.map(t => ({
            promotion_id: id,
            product_id: t.productId,
            category_id: t.categoryId,
          }));
          const insRes = await supabaseMutation(() =>
            supabase.from('promotion_targets').insert(targetRows)
          );
          if (!insRes.ok) {
            logger.error('promotions.update_targets_insert_failed', {
              message: insRes.error.message,
            });
            return insRes;
          }
        }
      }

      return ok(null);
    },
    onSuccess: result => {
      if (result.ok) invalidatePromotionQueries(queryClient);
    },
  });
}

/**
 * Real DELETE (not a soft-deactivate — see useMutationUpdatePromotion's doc
 * comment above). `order_items.promotion_id` is ON DELETE SET NULL (Plan 01),
 * so a sale that already used this promotion keeps its recorded discount
 * snapshot after deletion.
 */
export function useMutationDeletePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<Result<null>> => {
      const res = await supabaseMutation(() => supabase.from('promotions').delete().eq('id', id));
      if (!res.ok) {
        logger.error('promotions.delete_failed', { message: res.error.message });
        return res;
      }
      return ok(null);
    },
    onSuccess: result => {
      if (result.ok) invalidatePromotionQueries(queryClient);
    },
  });
}
