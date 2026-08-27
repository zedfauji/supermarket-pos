import { describe, expect, it } from 'vitest';
import { ProductSchema } from './domain';

const baseProduct = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Club Soda',
  categoryId: '00000000-0000-0000-0000-000000000002',
  basePrice: 3500,
  happyHourPrice: null,
  sku: null,
  isActive: true,
  imageUrl: null,
  stock_threshold: null,
  unitsPerPackage: null,
  parentProductId: null,
};

describe('ProductSchema stock_threshold field', () => {
  it('accepts null stock_threshold (AC-3: existing products default to NULL)', () => {
    const result = ProductSchema.parse(baseProduct);
    expect(result.stock_threshold).toBeNull();
  });

  it('accepts a positive numeric threshold', () => {
    const result = ProductSchema.parse({ ...baseProduct, stock_threshold: 10 });
    expect(result.stock_threshold).toBe(10);
  });

  it('accepts zero as a valid threshold value', () => {
    const result = ProductSchema.parse({ ...baseProduct, stock_threshold: 0 });
    expect(result.stock_threshold).toBe(0);
  });

  it('accepts fractional thresholds (e.g. half-case units)', () => {
    const result = ProductSchema.parse({ ...baseProduct, stock_threshold: 0.5 });
    expect(result.stock_threshold).toBe(0.5);
  });

  it('rejects missing stock_threshold field (field is required, not optional)', () => {
    const withoutThreshold = Object.fromEntries(
      Object.entries(baseProduct).filter(([k]) => k !== 'stock_threshold')
    );
    expect(() => ProductSchema.parse(withoutThreshold)).toThrow();
  });
});
