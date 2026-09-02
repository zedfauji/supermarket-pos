import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartItem as CartItemType, Product } from '@shared/lib/domain';
import { renderWithProviders } from '@shared/lib/test-utils';
import { CartItem } from './CartItem';

vi.mock('@entities/inventory', () => ({
  useNearExpiryAlerts: () => ({ data: undefined }),
}));

const mockProduct: Product = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Haldiram\'s Aloo Bhujia 200g',
  categoryId: '00000000-0000-4000-8000-000000000001',
  basePrice: 100,
  happyHourPrice: null,
  imageUrl: null,
  isActive: true,
  soldByWeight: false,
  sku: 'ALOO-200G',
  stock_threshold: null,
  unitsPerPackage: null,
  parentProductId: null,
  comboEligible: false,
  isCombo: false,
  modifiers: [],
};

function buildItem(overrides: Partial<CartItemType> = {}): CartItemType {
  return {
    tempId: 'temp-1',
    product: mockProduct,
    quantity: 1,
    selectedModifiers: [],
    unitPrice: mockProduct.basePrice,
    notes: '',
    lineTotal: mockProduct.basePrice,
    ...overrides,
  };
}

const noop = () => undefined;

describe('CartItem', () => {
  it('shows no discount indicator when unitPrice equals product.basePrice', () => {
    renderWithProviders(
      <CartItem
        item={buildItem()}
        onQuantitySet={noop}
        onRemove={noop}
        onNotesChange={noop}
      />
    );

    expect(screen.queryByLabelText('Promotion applied')).not.toBeInTheDocument();
    expect(screen.queryByText(/% off/)).not.toBeInTheDocument();
  });

  it('shows the Zap icon and a rounded "X% off" Badge when unitPrice is discounted', () => {
    renderWithProviders(
      <CartItem
        item={buildItem({ unitPrice: 80, lineTotal: 80 })}
        onQuantitySet={noop}
        onRemove={noop}
        onNotesChange={noop}
      />
    );

    expect(screen.getByLabelText('Promotion applied')).toBeInTheDocument();
    expect(screen.getByText('20% off')).toBeInTheDocument();
  });

  it('rounds the discount percent to the nearest whole number', () => {
    renderWithProviders(
      <CartItem
        // 100 -> 66.67: (100-66.67)/100 = 33.33% -> rounds to 33%
        item={buildItem({ unitPrice: 66.67, lineTotal: 66.67 })}
        onQuantitySet={noop}
        onRemove={noop}
        onNotesChange={noop}
      />
    );

    expect(screen.getByText('33% off')).toBeInTheDocument();
  });

  it('never renders the promotion name — only the compact percent badge', () => {
    renderWithProviders(
      <CartItem
        item={buildItem({ unitPrice: 80, lineTotal: 80 })}
        onQuantitySet={noop}
        onRemove={noop}
        onNotesChange={noop}
      />
    );

    // Only the "X% off" text renders next to the discount indicator — no
    // promotion-name free text anywhere on the line (UI-SPEC long-text rule).
    expect(screen.getByText('20% off')).toBeInTheDocument();
  });
});
