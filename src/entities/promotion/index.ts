/**
 * Promotion entity public API.
 *
 * Import from here: `import { usePromotions, evaluateBestPromotion } from '@entities/promotion'`
 *
 * FSD boundary: features and widgets may import from this index only.
 * Deep imports into model/ are NOT allowed from outside this entity.
 */

export {
  usePromotions,
  useMutationCreatePromotion,
  useMutationUpdatePromotion,
  useMutationDeletePromotion,
} from './model/queries';

export {
  evaluateBestPromotion,
  type PromotionPricingProduct,
  type PromotionMatch,
} from './model/promotion-pricing';

export type { Promotion, PromotionCreate, PromotionUpdate } from './model/types';
