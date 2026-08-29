/**
 * Unit tests for domain.ts Zod schemas.
 * Covers all schemas added or extended in Plan 03 (S1-06):
 *   - CategorySchema (with parentId)
 *   - ProductSchema (with comboEligible / isCombo)
 *   - StockMovementReasonSchema
 *   - StockMovementSchema
 *   - ModifierGroupSchema
 *   - ModifierGroupItemSchema
 *   - ProductModifierGroupSchema
 *
 * Each schema section contains:
 *   - happy-path: valid input parses without error
 *   - invalid cases: missing/wrong-type fields produce ZodError
 */

import { describe, it, expect } from 'vitest';

import {
  CategorySchema,
  ProductSchema,
  StockMovementReasonSchema,
  StockMovementSchema,
  ModifierGroupSchema,
  ModifierGroupItemSchema,
  ProductModifierGroupSchema,
  HourlyRowSchema,
  DeletionsPreRowSchema,
  DeletionsPostRowSchema,
  PaymentMethodRowSchema,
} from './domain';

// ─── Shared test fixtures ────────────────────────────────────────────────────

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const UUID2 = '223e4567-e89b-12d3-a456-426614174001';
const NOW = new Date().toISOString();

// ─── CategorySchema ───────────────────────────────────────────────────────────

describe('CategorySchema', () => {
  const baseValid = {
    id: UUID,
    name: 'Beers',
    color: '#FF5500',
    sortOrder: 0,
    happyHourStart: null,
    happyHourEnd: null,
    routing: 'NONE',
    createdAt: NOW,
  };

  it('parses a root category (parentId absent)', () => {
    const result = CategorySchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBeUndefined();
    }
  });

  it('parses a child category (parentId = UUID)', () => {
    const result = CategorySchema.safeParse({ ...baseValid, parentId: UUID2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBe(UUID2);
    }
  });

  it('parses a category with parentId = null (root sentinel)', () => {
    const result = CategorySchema.safeParse({ ...baseValid, parentId: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBeNull();
    }
  });

  it('rejects category with invalid UUID for parentId', () => {
    const result = CategorySchema.safeParse({ ...baseValid, parentId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects category with empty name', () => {
    const result = CategorySchema.safeParse({ ...baseValid, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects category with invalid color (no #)', () => {
    const result = CategorySchema.safeParse({ ...baseValid, color: 'FF5500' });
    expect(result.success).toBe(false);
  });

  it('rejects category missing required field id', () => {
    const rest = {
      name: baseValid.name,
      color: baseValid.color,
      sortOrder: baseValid.sortOrder,
      happyHourStart: baseValid.happyHourStart,
      happyHourEnd: baseValid.happyHourEnd,
      routing: baseValid.routing,
      createdAt: baseValid.createdAt,
    };
    const result = CategorySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ─── ProductSchema ────────────────────────────────────────────────────────────

describe('ProductSchema', () => {
  const baseValid = {
    id: UUID,
    name: 'House Beer',
    categoryId: UUID2,
    basePrice: 65.0,
    happyHourPrice: null,
    sku: null,
    isActive: true,
    imageUrl: null,
    stock_threshold: null,
    unitsPerPackage: null,
    parentProductId: null,
    comboEligible: true,
    isCombo: false,
    modifiers: [],
  };

  it('parses a valid product with combo flags', () => {
    const result = ProductSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comboEligible).toBe(true);
      expect(result.data.isCombo).toBe(false);
    }
  });

  it('defaults comboEligible to true when absent', () => {
    const rest = {
      id: baseValid.id,
      name: baseValid.name,
      categoryId: baseValid.categoryId,
      basePrice: baseValid.basePrice,
      happyHourPrice: baseValid.happyHourPrice,
      sku: baseValid.sku,
      isActive: baseValid.isActive,
      imageUrl: baseValid.imageUrl,
      stock_threshold: baseValid.stock_threshold,
      unitsPerPackage: baseValid.unitsPerPackage,
      parentProductId: baseValid.parentProductId,
      isCombo: baseValid.isCombo,
      modifiers: baseValid.modifiers,
    };
    const result = ProductSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comboEligible).toBe(true);
    }
  });

  it('defaults isCombo to false when absent', () => {
    const rest = {
      id: baseValid.id,
      name: baseValid.name,
      categoryId: baseValid.categoryId,
      basePrice: baseValid.basePrice,
      happyHourPrice: baseValid.happyHourPrice,
      sku: baseValid.sku,
      isActive: baseValid.isActive,
      imageUrl: baseValid.imageUrl,
      stock_threshold: baseValid.stock_threshold,
      unitsPerPackage: baseValid.unitsPerPackage,
      parentProductId: baseValid.parentProductId,
      comboEligible: baseValid.comboEligible,
      modifiers: baseValid.modifiers,
    };
    const result = ProductSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isCombo).toBe(false);
    }
  });

  it('parses a combo product (isCombo=true, comboEligible=false)', () => {
    const result = ProductSchema.safeParse({ ...baseValid, isCombo: true, comboEligible: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isCombo).toBe(true);
      expect(result.data.comboEligible).toBe(false);
    }
  });

  it('rejects negative basePrice', () => {
    const result = ProductSchema.safeParse({ ...baseValid, basePrice: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects product with empty name', () => {
    const result = ProductSchema.safeParse({ ...baseValid, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects product with non-boolean isCombo', () => {
    const result = ProductSchema.safeParse({ ...baseValid, isCombo: 'yes' });
    expect(result.success).toBe(false);
  });
});

// ─── StockMovementReasonSchema ────────────────────────────────────────────────

describe('StockMovementReasonSchema', () => {
  const validReasons = [
    'sale',
    'manual_adjustment',
    'waste',
    'delivery',
    'correction',
    'physical_count',
    'prep_production',
    'prep_consumption',
    'combo_component',
    'refund',
    'void',
  ] as const;

  it.each(validReasons)('accepts reason "%s"', reason => {
    const result = StockMovementReasonSchema.safeParse(reason);
    expect(result.success).toBe(true);
  });

  it('rejects unknown reason', () => {
    const result = StockMovementReasonSchema.safeParse('damaged');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = StockMovementReasonSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

// ─── StockMovementSchema ──────────────────────────────────────────────────────

describe('StockMovementSchema', () => {
  const baseValid = {
    id: UUID,
    productId: UUID2,
    quantityDelta: -3,
    reason: 'sale',
    staffId: UUID,
    createdAt: NOW,
  };

  it('parses a minimal valid stock movement (sale)', () => {
    const result = StockMovementSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('sale');
      expect(result.data.refType).toBeUndefined();
      expect(result.data.refId).toBeUndefined();
      expect(result.data.ingredientId).toBeUndefined();
    }
  });

  it('parses a movement with polymorphic ref fields', () => {
    const result = StockMovementSchema.safeParse({
      ...baseValid,
      refType: 'order_item',
      refId: UUID2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.refType).toBe('order_item');
      expect(result.data.refId).toBe(UUID2);
    }
  });

  it('parses prep_production reason with nullable ingredientId', () => {
    const result = StockMovementSchema.safeParse({
      ...baseValid,
      reason: 'prep_production',
      ingredientId: null,
    });
    expect(result.success).toBe(true);
  });

  it('parses void reason', () => {
    const result = StockMovementSchema.safeParse({
      ...baseValid,
      reason: 'void',
      quantityDelta: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid reason', () => {
    const result = StockMovementSchema.safeParse({ ...baseValid, reason: 'stolen' });
    expect(result.success).toBe(false);
  });

  it('accepts decimal quantityDelta (S3a: ingredient deltas may be fractional)', () => {
    const result = StockMovementSchema.safeParse({ ...baseValid, quantityDelta: 1.5 });
    expect(result.success).toBe(true);
  });

  it('rejects missing productId', () => {
    const result = StockMovementSchema.safeParse({
      id: baseValid.id,
      quantityDelta: baseValid.quantityDelta,
      reason: baseValid.reason,
      staffId: baseValid.staffId,
      createdAt: baseValid.createdAt,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for refId', () => {
    const result = StockMovementSchema.safeParse({ ...baseValid, refId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

// ─── ModifierGroupSchema ──────────────────────────────────────────────────────

describe('ModifierGroupSchema', () => {
  const baseValid = {
    id: UUID,
    name: 'Salsas',
    minSelect: 0,
    maxSelect: 2,
    isRequired: false,
    sortOrder: 0,
    createdAt: NOW,
  };

  it('parses a valid modifier group', () => {
    const result = ModifierGroupSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Salsas');
      expect(result.data.minSelect).toBe(0);
      expect(result.data.maxSelect).toBe(2);
    }
  });

  it('parses a required group (isRequired=true)', () => {
    const result = ModifierGroupSchema.safeParse({ ...baseValid, isRequired: true, minSelect: 1 });
    expect(result.success).toBe(true);
  });

  it('rejects group with empty name', () => {
    const result = ModifierGroupSchema.safeParse({ ...baseValid, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative minSelect', () => {
    const result = ModifierGroupSchema.safeParse({ ...baseValid, minSelect: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects maxSelect < 1', () => {
    const result = ModifierGroupSchema.safeParse({ ...baseValid, maxSelect: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const result = ModifierGroupSchema.safeParse({
      name: baseValid.name,
      minSelect: baseValid.minSelect,
      maxSelect: baseValid.maxSelect,
      isRequired: baseValid.isRequired,
      sortOrder: baseValid.sortOrder,
      createdAt: baseValid.createdAt,
    });
    expect(result.success).toBe(false);
  });
});

// ─── ModifierGroupItemSchema ──────────────────────────────────────────────────

describe('ModifierGroupItemSchema', () => {
  const baseValid = {
    groupId: UUID,
    modifierId: UUID2,
    sortOrder: 0,
  };

  it('parses a valid modifier group item', () => {
    const result = ModifierGroupItemSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.groupId).toBe(UUID);
      expect(result.data.modifierId).toBe(UUID2);
    }
  });

  it('rejects invalid groupId UUID', () => {
    const result = ModifierGroupItemSchema.safeParse({ ...baseValid, groupId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects negative sortOrder', () => {
    const result = ModifierGroupItemSchema.safeParse({ ...baseValid, sortOrder: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing modifierId', () => {
    const result = ModifierGroupItemSchema.safeParse({
      groupId: baseValid.groupId,
      sortOrder: baseValid.sortOrder,
    });
    expect(result.success).toBe(false);
  });
});

// ─── ProductModifierGroupSchema ───────────────────────────────────────────────

describe('ProductModifierGroupSchema', () => {
  const baseValid = {
    productId: UUID,
    groupId: UUID2,
    sortOrder: 0,
  };

  it('parses a valid product-modifier-group link', () => {
    const result = ProductModifierGroupSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productId).toBe(UUID);
      expect(result.data.groupId).toBe(UUID2);
    }
  });

  it('parses when sortOrder is null (optional per DB schema)', () => {
    const result = ProductModifierGroupSchema.safeParse({ ...baseValid, sortOrder: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBeNull();
    }
  });

  it('rejects invalid productId', () => {
    const result = ProductModifierGroupSchema.safeParse({ ...baseValid, productId: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid groupId', () => {
    const result = ProductModifierGroupSchema.safeParse({ ...baseValid, groupId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing productId', () => {
    const result = ProductModifierGroupSchema.safeParse({
      groupId: baseValid.groupId,
      sortOrder: baseValid.sortOrder,
    });
    expect(result.success).toBe(false);
  });
});

// ─── HourlyRowSchema (D-04 extension) ────────────────────────────────────────

describe('HourlyRowSchema', () => {
  it('accepts the original fields plus dayOfWeek and isBusiest', () => {
    const result = HourlyRowSchema.safeParse({
      hour: 18,
      orderCount: 12,
      revenue: 340.5,
      dayOfWeek: 5,
      isBusiest: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an object missing the new required fields', () => {
    const result = HourlyRowSchema.safeParse({
      hour: 18,
      orderCount: 12,
      revenue: 340.5,
    });
    expect(result.success).toBe(false);
  });
});

// ─── DeletionsPreRowSchema (D-05 variant A) ──────────────────────────────────

describe('DeletionsPreRowSchema', () => {
  it('accepts orderId/itemName/removedAt/staffName/reason', () => {
    const result = DeletionsPreRowSchema.safeParse({
      orderId: UUID,
      itemName: 'Micheladas',
      removedAt: NOW,
      staffName: 'Ana',
      reason: 'Wrong item',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing reason', () => {
    const result = DeletionsPreRowSchema.safeParse({
      orderId: UUID,
      itemName: 'Micheladas',
      removedAt: NOW,
      staffName: 'Ana',
    });
    expect(result.success).toBe(false);
  });
});

// ─── DeletionsPostRowSchema (D-05 variant B) ─────────────────────────────────

describe('DeletionsPostRowSchema', () => {
  it('accepts tabId/editedAt/staffName/reason/fieldsChanged', () => {
    const result = DeletionsPostRowSchema.safeParse({
      tabId: UUID,
      editedAt: NOW,
      staffName: 'Carlos',
      reason: 'Customer dispute',
      fieldsChanged: ['quantity', 'unitPrice'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-array fieldsChanged', () => {
    const result = DeletionsPostRowSchema.safeParse({
      tabId: UUID,
      editedAt: NOW,
      staffName: 'Carlos',
      reason: 'Customer dispute',
      fieldsChanged: 'quantity',
    });
    expect(result.success).toBe(false);
  });
});

// ─── PaymentMethodRowSchema (D-08) ───────────────────────────────────────────

describe('PaymentMethodRowSchema', () => {
  it('accepts a per-session row with a non-null cajaSessionId', () => {
    const result = PaymentMethodRowSchema.safeParse({
      cajaSessionId: UUID,
      method: 'cash',
      legCount: 6,
      grossAmount: 1200,
      isRollup: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a day-level rollup row with a null cajaSessionId', () => {
    const result = PaymentMethodRowSchema.safeParse({
      cajaSessionId: null,
      method: 'card',
      legCount: 20,
      grossAmount: 5000,
      isRollup: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid payment method', () => {
    const result = PaymentMethodRowSchema.safeParse({
      cajaSessionId: null,
      method: 'bitcoin',
      legCount: 1,
      grossAmount: 10,
      isRollup: false,
    });
    expect(result.success).toBe(false);
  });
});
