import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Promotion } from '@shared/lib/domain';
import { PromotionFormDialog } from './PromotionFormDialog';

// Radix Select uses pointer-capture APIs not implemented by jsdom; safe no-ops
// keep the scope-type target Select's open/select interactions deterministic
// (mirrors EditLocaleDialog.test.tsx's precedent).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

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
    mutateAsync.mockResolvedValue({ ok: true, value: existingPromotion });
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

  // G-27-8 Part A: percent-discount field is stuck at 0 because discountValue is
  // number-typed React state coerced via Number(e.target.value) on every keystroke,
  // with no string buffer — clearing the field redisplays the literal digit '0' and
  // new digits insert before it. See .planning/debug/promotion-dialog-ux-and-scope-gaps.md.
  describe('percent-discount field typing (G-27-8 Part A)', () => {
    it('typing "2" then "0" into the default field displays exactly "20", not "02" or "020"', async () => {
      const user = userEvent.setup();
      render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={null} />);
      const percentInput = screen.getByLabelText(/discount percent/i) as HTMLInputElement;

      await user.click(percentInput);
      await user.keyboard('2');
      await user.keyboard('0');

      expect(percentInput.value).toBe('20');
    });

    it('select-all + delete on a populated percent field produces a genuinely empty input, not "0"', async () => {
      const user = userEvent.setup();
      render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={existingPromotion} />);
      const percentInput = screen.getByLabelText(/discount percent/i) as HTMLInputElement;
      expect(percentInput.value).toBe('10');

      await user.clear(percentInput);

      expect(percentInput.value).toBe('');
    });

    it('typing "35" after clearing displays exactly "35"', async () => {
      const user = userEvent.setup();
      render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={existingPromotion} />);
      const percentInput = screen.getByLabelText(/discount percent/i) as HTMLInputElement;

      await user.clear(percentInput);
      await user.type(percentInput, '35');

      expect(percentInput.value).toBe('35');
    });

    it('submits discountValue: 20 (a number) when the percent field shows "20"', async () => {
      const user = userEvent.setup();
      render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={null} />);

      await user.type(screen.getByLabelText(/^Name/i), 'Descuento de prueba');
      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: 'Arroz Basmati' }));

      const percentInput = screen.getByLabelText(/discount percent/i) as HTMLInputElement;
      await user.clear(percentInput);
      await user.type(percentInput, '20');

      fireEvent.click(screen.getByRole('button', { name: 'Save Promotion' }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledTimes(1);
      });
      const call = mutateAsync.mock.calls[0]?.[0] as { discountValue: unknown };
      expect(call.discountValue).toBe(20);
    });

    it('rejects submit when the percent field is left empty, without weakening validation', async () => {
      const user = userEvent.setup();
      render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={null} />);

      await user.type(screen.getByLabelText(/^Name/i), 'Descuento de prueba');
      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: 'Arroz Basmati' }));

      const percentInput = screen.getByLabelText(/discount percent/i) as HTMLInputElement;
      await user.clear(percentInput);

      fireEvent.click(screen.getByRole('button', { name: 'Save Promotion' }));

      await waitFor(() => {
        expect(screen.getByText('Enter a discount between 0 and 100')).toBeInTheDocument();
      });
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('does not touch the fixed-amount MoneyInput branch', async () => {
      const user = userEvent.setup();
      render(<PromotionFormDialog open onOpenChange={vi.fn()} promotion={null} />);

      await user.click(screen.getByRole('button', { name: 'Fixed amount' }));

      // MoneyInput doesn't receive a `label` prop here, so its accessible name
      // is its own aria-label fallback ("Money amount"), not FormField's
      // "Discount amount" label text — pre-existing, untouched by this fix.
      expect(screen.getByLabelText(/money amount/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/discount percent/i)).not.toBeInTheDocument();
    });
  });
});
