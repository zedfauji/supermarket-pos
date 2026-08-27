import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Product } from '@shared/lib/domain';
import { renderWithProviders } from '@shared/lib/test-utils';
import { WeightEntryDialog } from './WeightEntryDialog';

const product: Product = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Loose Apples',
  categoryId: '123e4567-e89b-12d3-a456-426614174001',
  basePrice: 10,
  happyHourPrice: null,
  sku: null,
  isActive: true,
  soldByWeight: true,
  imageUrl: null,
  stock_threshold: null,
  unitsPerPackage: null,
  parentProductId: null,
  comboEligible: true,
  isCombo: false,
  modifiers: [],
};

describe('WeightEntryDialog', () => {
  it('keeps confirmation disabled until a positive weight is entered', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WeightEntryDialog open onOpenChange={() => {}} product={product} mode="add" />
    );

    const confirm = screen.getByRole('button', { name: /add to cart/i });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '1' }));
    expect(confirm).toBeEnabled();
  });
});
