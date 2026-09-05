import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@shared/lib/i18n';

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

// Full mock (no vi.importActual): the real @entities/promotion module imports
// the Supabase client at load time, which would break jsdom. evaluateBestPromotion
// is re-exported from the pure pricing module instead.
vi.mock('@entities/promotion', async () => {
  const pricing = await import('@entities/promotion/model/promotion-pricing');
  return {
    evaluateBestPromotion: pricing.evaluateBestPromotion,
    useMutationCreatePromotion: () => ({ mutateAsync: createMutateAsync, isPending: false }),
    useMutationUpdatePromotion: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  };
});
vi.mock('@entities/product', () => ({
  useProducts: () => ({
    data: [
      {
        id: 'p1', name: 'Parle-G', categoryId: 'c1', basePrice: 100, happyHourPrice: null, sku: null,
        isActive: true, soldByWeight: false, imageUrl: null, stock_threshold: null, barcode: null,
        unitsPerPackage: null, parentProductId: null, comboEligible: true, isCombo: false, modifiers: [],
      },
    ],
  }),
}));
vi.mock('@entities/category', () => ({
  useCategories: () => ({ data: [{ id: 'c1', name: 'Biscuits', parentId: null }] }),
}));
vi.mock('@entities/settings', () => ({
  useSettings: () => ({
    data: {
      nearExpiry: { discountPercent: 0, thresholdDays: 14 },
      general: { timezone: 'America/Mexico_City' },
    },
  }),
}));

const { PromotionDialog } = await import('./PromotionDialog');

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('PromotionDialog', () => {
  beforeEach(() => {
    createMutateAsync.mockReset().mockResolvedValue({ ok: true, data: null });
    updateMutateAsync.mockReset().mockResolvedValue({ ok: true, data: null });
  });

  it('shows the name error and does not save when submitted empty', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    expect(await screen.findByText(/name is required|el nombre es obligatorio/i)).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('saves a store-wide percent promotion and closes', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText(/^name|^nombre/i), 'Diwali 20');
    const percent = screen.getByLabelText(/discount percent|porcentaje de descuento/i);
    await userEvent.clear(percent);
    await userEvent.type(percent, '20');
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      name: 'Diwali 20',
      discountType: 'percent',
      discountValue: 20,
      targets: [],
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
