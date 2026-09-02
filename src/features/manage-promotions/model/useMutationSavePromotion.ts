import {
  useMutationCreatePromotion,
  useMutationUpdatePromotion,
  type Promotion,
  type PromotionCreate,
  type PromotionUpdate,
} from '@entities/promotion';
import type { Result } from '@shared/lib/result';

/**
 * Thin wrapper choosing create vs. update based on whether `id` is present —
 * mirrors src/features/manage-categories/'s create/update split, but exposed
 * as one mutation so PromotionFormDialog doesn't need to branch itself.
 */
export function useMutationSavePromotion() {
  const createMutation = useMutationCreatePromotion();
  const updateMutation = useMutationUpdatePromotion();

  const mutateAsync = async (
    input: PromotionCreate | PromotionUpdate
  ): Promise<Result<Promotion | null>> => {
    if ('id' in input && input.id) {
      return updateMutation.mutateAsync(input);
    }
    return createMutation.mutateAsync(input as PromotionCreate);
  };

  return {
    mutateAsync,
    isPending: createMutation.isPending || updateMutation.isPending,
  };
}
