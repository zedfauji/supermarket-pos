/**
 * promotion-pricing.ts
 *
 * Pure best-price-wins pricing function (PROMO-04, D-05/D-06). Zero imports
 * beyond the Promotion type — independently testable, and mirrored (not
 * literally shared, RESEARCH.md Pitfall 1) in process_direct_sale_atomic's
 * plpgsql body (supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql),
 * which is the sole authoritative computation at checkout.
 */
import type { Promotion } from '@shared/lib/domain';

export interface PromotionPricingProduct {
  productId: string;
  categoryId: string;
  basePrice: number;
}

export interface PromotionMatch {
  /** The winning promotion's id, or null when the expiry-proximity trigger won. */
  promotionId: string | null;
  /** The winning candidate's discount_value (promotion) or expiryDiscountPercent (expiry trigger). */
  discountRate: number;
  discountAmount: number;
  discountedUnitPrice: number;
}

/** Rounds like Postgres's ROUND(...,2) — ties away from zero for positive inputs. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Evaluates the best-price-wins candidate pool for one line item: every
 * active product-scoped OR category-scoped promotion matching the product,
 * plus the expiry-proximity auto-discount trigger — all in one pool (D-05).
 * The single largest discount amount wins; on an exact tie the most
 * recently created promotion wins (D-06), and the expiry-trigger candidate
 * (no createdAt) loses exact ties against any real promotion.
 *
 * Returns null when no candidate qualifies (no matching promotion, no
 * expiry trigger).
 */
export function evaluateBestPromotion(
  product: PromotionPricingProduct,
  activePromotions: Promotion[],
  now: Date,
  expiryDiscountPercent: number,
  daysUntilExpiry: number | null,
  expiryThresholdDays: number
): PromotionMatch | null {
  let bestPromoId: string | null = null;
  let bestPromoRate: number | null = null;
  let bestPromoAmount = -Infinity;
  let bestPromoCreatedAt: number | null = null;

  for (const promo of activePromotions) {
    if (!promo.active) continue;
    if (now < promo.startsAt || now > promo.endsAt) continue;
    const matchesScope =
      (promo.scopeType === 'product' && promo.productId === product.productId) ||
      (promo.scopeType === 'category' && promo.categoryId === product.categoryId);
    if (!matchesScope) continue;

    const rawAmount =
      promo.discountType === 'percent'
        ? round2((product.basePrice * promo.discountValue) / 100)
        : round2(Math.min(promo.discountValue, product.basePrice));
    const amount = Math.min(rawAmount, product.basePrice);
    const createdAt = promo.createdAt.getTime();

    if (
      amount > bestPromoAmount ||
      (amount === bestPromoAmount && bestPromoCreatedAt !== null && createdAt > bestPromoCreatedAt)
    ) {
      bestPromoAmount = amount;
      bestPromoId = promo.id;
      bestPromoRate = promo.discountValue;
      bestPromoCreatedAt = createdAt;
    }
  }

  const hasPromoCandidate = bestPromoId !== null;

  let expiryAmount: number | null = null;
  if (daysUntilExpiry !== null && daysUntilExpiry <= expiryThresholdDays) {
    expiryAmount = Math.min(
      round2((product.basePrice * expiryDiscountPercent) / 100),
      product.basePrice
    );
  }

  // A real promotion wins exact ties against the expiry candidate (D-06 —
  // the expiry trigger has no createdAt to compare).
  if (hasPromoCandidate && (expiryAmount === null || bestPromoAmount >= expiryAmount)) {
    return {
      promotionId: bestPromoId,
      discountRate: bestPromoRate as number,
      discountAmount: bestPromoAmount,
      discountedUnitPrice: round2(product.basePrice - bestPromoAmount),
    };
  }

  if (expiryAmount !== null) {
    return {
      promotionId: null,
      discountRate: expiryDiscountPercent,
      discountAmount: expiryAmount,
      discountedUnitPrice: round2(product.basePrice - expiryAmount),
    };
  }

  return null;
}
