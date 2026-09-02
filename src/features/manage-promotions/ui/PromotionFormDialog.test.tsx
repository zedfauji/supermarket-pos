import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Promotion } from '@shared/lib/domain';
import { PromotionFormDialog } from './PromotionFormDialog';

const mutateAsync = vi.fn();

vi.mock('@entities/product', () => ({
  useProducts: () => ({
    data: [{ id: 'prod-1', name: 'Arroz Basmati' }],
  }),
}));

vi.mock('@entities/category', () => ({
  useCategories: () => ({
    data: [{ id: 'cat-1', name: 'Abarrotes', parentId: null, color: '#ff0000' }],
  }),
}));

vi.mock('@entities/staff', () => ({
  useStaffStore: (selector: (state: { currentStaff: { id: string } }) => unknown) =>
    selector({ currentStaff: { id: 'staff-1' } }),
}));

vi.mock('../model/useMutationSavePromotion', () => ({
  useMutationSavePromotion: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const existingPromotion: Promotion = {
  id: 'promo-1',
  name: 'Descuento de arroz',
  scopeType: 'product',
  productId: 'prod-1',
  categoryId: null,
  discountType: 'percent',
  discountValue: 10,
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: new Date('2026-09-30T23:59:59Z'),
  active: true,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  createdBy: 'staff-1',
};

describe('PromotionFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the create title with a blank name field when promotion is not passed', () => {
    render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={null} />);
    expect(screen.getByText('New Promotion')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/i)).toHaveValue('');
  });

  it('renders the edit title with the promotion prefilled when editing', () => {
    render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={existingPromotion} />);
    expect(screen.getByText('Edit Promotion')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/i)).toHaveValue('Descuento de arroz');
  });

  it('does not call the save mutation when the name is left empty', async () => {
    render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Promotion' }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
