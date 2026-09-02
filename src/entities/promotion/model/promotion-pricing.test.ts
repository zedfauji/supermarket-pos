import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Promotion } from '@shared/lib/domain';
import { evaluateBestPromotion, type PromotionPricingProduct } from './promotion-pricing';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test promo',
    scopeType: 'product',
    productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    categoryId: null,
    discountType: 'percent',
    discountValue: 20,
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-31T23:59:59.000Z'),
    active: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    createdBy: null,
    ...overrides,
  };
}

const PRODUCT: PromotionPricingProduct = {
  productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  categoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  basePrice: 100,
};

describe('evaluateBestPromotion', () => {
  it('returns null when no candidate qualifies', () => {
    const result = evaluateBestPromotion(PRODUCT, [], NOW, 15, null, 14);
    expect(result).toBeNull();
  });

  it('one active product-scoped percent promotion — returns its discount', () => {
    const promo = makePromotion({ discountType: 'percent', discountValue: 20 });
    const result = evaluateBestPromotion(PRODUCT, [promo], NOW, 15, null, 14);
    expect(result).toEqual({
      promotionId: promo.id,
      discountRate: 20,
      discountAmount: 20,
      discountedUnitPrice: 80,
    });
  });

  it('product-scoped vs category-scoped candidates — best price wins regardless of array order', () => {
    const smaller = makePromotion({
      id: '22222222-2222-4222-8222-222222222222',
      scopeType: 'product',
      productId: PRODUCT.productId,
      categoryId: null,
      discountType: 'percent',
      discountValue: 10, // $10 amount
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const bigger = makePromotion({
      id: '33333333-3333-4333-8333-333333333333',
      scopeType: 'category',
      productId: null,
      categoryId: PRODUCT.categoryId,
      discountType: 'fixed',
      discountValue: 25, // $25 amount
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
    });

    const resultA = evaluateBestPromotion(PRODUCT, [smaller, bigger], NOW, 15, null, 14);
    const resultB = evaluateBestPromotion(PRODUCT, [bigger, smaller], NOW, 15, null, 14);
    expect(resultA?.promotionId).toBe(bigger.id);
    expect(resultA?.discountAmount).toBe(25);
    expect(resultB).toEqual(resultA);
  });

  it('exact tie — later createdAt wins (D-06)', () => {
    const earlier = makePromotion({
      id: '44444444-4444-4444-8444-444444444444',
      discountType: 'fixed',
      discountValue: 15,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const later = makePromotion({
      id: '55555555-5555-4555-8555-555555555555',
      discountType: 'fixed',
      discountValue: 15,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
    });
    const result = evaluateBestPromotion(PRODUCT, [earlier, later], NOW, 15, null, 14);
    expect(result?.promotionId).toBe(later.id);
  });

  it('expiry trigger loses an exact tie against a real promotion (D-06)', () => {
    // expiryDiscountPercent=15 on basePrice=100 -> $15, matches the fixed promo's $15.
    const promo = makePromotion({ discountType: 'fixed', discountValue: 15 });
    const result = evaluateBestPromotion(PRODUCT, [promo], NOW, 15, 10, 14);
    expect(result?.promotionId).toBe(promo.id);
  });

  it('daysUntilExpiry within threshold, no promotion beats it — returns expiry-trigger candidate', () => {
    const result = evaluateBestPromotion(PRODUCT, [], NOW, 15, 10, 14);
    expect(result).toEqual({
      promotionId: null,
      discountRate: 15,
      discountAmount: 15,
      discountedUnitPrice: 85,
    });
  });

  it('daysUntilExpiry exactly at threshold qualifies (inclusive)', () => {
    const result = evaluateBestPromotion(PRODUCT, [], NOW, 15, 14, 14);
    expect(result).not.toBeNull();
  });

  it('daysUntilExpiry beyond threshold does not qualify', () => {
    const result = evaluateBestPromotion(PRODUCT, [], NOW, 15, 15, 14);
    expect(result).toBeNull();
  });

  it('now exactly at startsAt qualifies (inclusive boundary)', () => {
    const promo = makePromotion({ startsAt: NOW, endsAt: new Date('2026-12-31T00:00:00.000Z') });
    const result = evaluateBestPromotion(PRODUCT, [promo], NOW, 15, null, 14);
    expect(result?.promotionId).toBe(promo.id);
  });

  it('now exactly at endsAt qualifies (inclusive boundary)', () => {
    const promo = makePromotion({ startsAt: new Date('2026-08-01T00:00:00.000Z'), endsAt: NOW });
    const result = evaluateBestPromotion(PRODUCT, [promo], NOW, 15, null, 14);
    expect(result?.promotionId).toBe(promo.id);
  });

  it('now before startsAt or after endsAt excludes the candidate', () => {
    const notYetStarted = makePromotion({
      startsAt: new Date('2026-09-02T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T00:00:00.000Z'),
    });
    const alreadyEnded = makePromotion({
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-31T00:00:00.000Z'),
    });
    expect(evaluateBestPromotion(PRODUCT, [notYetStarted], NOW, 15, null, 14)).toBeNull();
    expect(evaluateBestPromotion(PRODUCT, [alreadyEnded], NOW, 15, null, 14)).toBeNull();
  });

  it('fast-check: discountAmount never exceeds basePrice, discountedUnitPrice never negative', () => {
    const promoArb = fc.record({
      id: fc.uuid(),
      name: fc.constant('Promo'),
      scopeType: fc.constantFrom<'product' | 'category'>('product', 'category'),
      discountType: fc.constantFrom<'percent' | 'fixed'>('percent', 'fixed'),
      discountValue: fc.float({ min: Math.fround(0.01), max: 100, noNaN: true }),
      daysOffsetStart: fc.integer({ min: -30, max: 0 }),
      daysOffsetEnd: fc.integer({ min: 0, max: 30 }),
      daysOffsetCreated: fc.integer({ min: -60, max: 0 }),
    });

    fc.assert(
      fc.property(
        fc.array(promoArb, { maxLength: 6 }),
        fc.float({ min: 1, max: 100_000, noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.option(fc.integer({ min: -5, max: 30 }), { nil: null }),
        fc.integer({ min: 0, max: 60 }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (promoSpecs, basePrice, daysUntilExpiry, expiryThresholdDays, expiryDiscountPercent) => {
          const dayMs = 86_400_000;
          const promotions: Promotion[] = promoSpecs.map(spec => ({
            id: spec.id,
            name: spec.name,
            scopeType: spec.scopeType,
            productId: spec.scopeType === 'product' ? PRODUCT.productId : null,
            categoryId: spec.scopeType === 'category' ? PRODUCT.categoryId : null,
            discountType: spec.discountType,
            discountValue: spec.discountValue,
            startsAt: new Date(NOW.getTime() + spec.daysOffsetStart * dayMs),
            endsAt: new Date(NOW.getTime() + spec.daysOffsetEnd * dayMs + dayMs),
            active: true,
            createdAt: new Date(NOW.getTime() + spec.daysOffsetCreated * dayMs),
            createdBy: null,
          }));
          const product: PromotionPricingProduct = {
            productId: PRODUCT.productId,
            categoryId: PRODUCT.categoryId,
            basePrice,
          };
          const result = evaluateBestPromotion(
            product,
            promotions,
            NOW,
            expiryDiscountPercent,
            daysUntilExpiry,
            expiryThresholdDays
          );
          if (result) {
            expect(result.discountAmount).toBeLessThanOrEqual(basePrice);
            expect(result.discountedUnitPrice).toBeGreaterThanOrEqual(0);
          }
        }
      )
    );
  });
});
