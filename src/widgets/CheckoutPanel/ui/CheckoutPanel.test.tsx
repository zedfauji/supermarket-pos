import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStaffStore } from '@entities/staff/model/store';
import { useCartStore } from '@entities/tab/model/cartStore';
import type { Product, Staff } from '@shared/lib/domain';
import { renderWithProviders } from '@shared/lib/test-utils';
import { CheckoutPanel } from './CheckoutPanel';

vi.mock('@entities/product', () => ({
  useProducts: vi.fn(),
  useCategories: vi.fn(),
}));

vi.mock('@entities/staff/model/store', () => ({
  useStaffStore: vi.fn(),
}));

const mockProductA: Product = {
  id: 'product-a',
  name: 'Product A',
  categoryId: 'cat-1',
  basePrice: 10,
  happyHourPrice: null,
  sku: null,
  isActive: true,
  soldByWeight: false,
  imageUrl: null,
  stock_threshold: null,
  barcode: '1111111111111',
  unitsPerPackage: null,
  parentProductId: null,
  comboEligible: true,
  isCombo: false,
  modifiers: [],
};

const mockProductB: Product = {
  ...mockProductA,
  id: 'product-b',
  name: 'Product B',
  barcode: '3333333333333',
};

const mockWeightedProduct: Product = {
  ...mockProductA,
  id: 'product-weighted',
  name: 'Weighted Product',
  soldByWeight: true,
  barcode: '2222222222222',
};

// A stand-in that exposes the same interaction surface the real ProductGrid
// gives a user (a card click calls onSelect / weightEntry.openFor) and
// surfaces the scanned-into search text via a data attribute, without
// needing the full product-list/category-filter tree.
vi.mock('@widgets/ProductGrid/ui/ProductGrid', () => ({
  ProductGrid: ({
    search,
    onSelect,
    weightEntry,
  }: {
    search: string;
    onSelect: (product: Product) => void;
    weightEntry: { openFor: (product: Product) => void };
  }) => (
    <div data-testid="product-grid-mock" data-search={search}>
      <button type="button" onClick={() => { onSelect(mockProductA); }}>
        Mock add product A
      </button>
      <button type="button" onClick={() => { weightEntry.openFor(mockWeightedProduct); }}>
        Mock open weight entry
      </button>
    </div>
  ),
}));

vi.mock('@features/hold-sale/ui/HoldSaleBanner', () => ({
  HoldSaleBanner: () => null,
}));

vi.mock('@features/checkout-sale/model/useCheckoutSale', () => ({
  useCheckoutSale: () => ({
    syntheticTab: {},
    processors: {},
    resetIdempotencyKey: vi.fn(),
  }),
}));

// A lightweight stand-in so the scanner-gate logic under test doesn't need
// the full PaymentForm tree (settings, processors, receipt rendering, etc.).
// Mirrors the '@widgets/PaymentModal' stub pattern already used by
// PaymentPane.test.tsx.
vi.mock('@widgets/PaymentModal/ui/PaymentForm', () => ({
  PaymentForm: ({ onDone, onClose }: { onDone?: () => void; onClose?: () => void }) => (
    <div data-testid="payment-form-mock">
      <button type="button" onClick={onClose}>
        Mock cancel
      </button>
      <button type="button" onClick={onDone}>
        Mock done
      </button>
    </div>
  ),
}));

vi.mock('sonner', () => ({
  toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

type StoreState = Parameters<Parameters<typeof useStaffStore>[0]>[0];
const mockStoreState =
  (partial: Partial<StoreState>) =>
  (fn: (s: StoreState) => unknown): unknown =>
    fn(partial as StoreState);

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function scanKeys(code: string) {
  code.split('').forEach(pressKey);
  pressKey('Enter');
}

async function scanAndFlush(code: string) {
  await act(async () => {
    scanKeys(code);
    await Promise.resolve();
    await Promise.resolve();
  });
}

const mockStaff: Staff = {
  id: 'staff-1',
  name: 'Test Cashier',
  email: 'cashier@example.com',
  role: 'cashier',
  pin: '123456',
  isActive: true,
  mustChangePin: false,
  locale: 'es-MX',
};

describe('CheckoutPanel', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], heldCart: null });
    vi.mocked(useStaffStore).mockImplementation(mockStoreState({ currentStaff: mockStaff }));
  });

  it('populates the search box with the scanned barcode instead of adding to the cart', async () => {
    renderWithProviders(<CheckoutPanel />);

    await scanAndFlush(mockProductA.barcode as string);

    await waitFor(() => {
      expect(screen.getByTestId('product-grid-mock')).toHaveAttribute(
        'data-search',
        mockProductA.barcode
      );
    });
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('ignores a scanner burst while payment/receipt UI is active (CHK-01)', async () => {
    renderWithProviders(<CheckoutPanel />);

    await scanAndFlush(mockProductA.barcode as string);
    await act(async () => {
      screen.getByRole('button', { name: /mock add product a/i }).click();
    });
    expect(useCartStore.getState().items).toHaveLength(1);

    await act(async () => {
      screen.getByRole('button', { name: /process payment/i }).click();
    });
    expect(screen.getByTestId('payment-form-mock')).toBeInTheDocument();

    // Scanning is fully disabled (the keydown listener is detached) while
    // payment UI is mounted, so the search box never picks up this scan.
    await scanAndFlush(mockProductB.barcode as string);

    await act(async () => {
      screen.getByRole('button', { name: /mock cancel/i }).click();
    });
    expect(screen.getByTestId('product-grid-mock')).toHaveAttribute(
      'data-search',
      mockProductA.barcode
    );
  });

  it('ignores a scanner burst while the weight-entry dialog is open', async () => {
    renderWithProviders(<CheckoutPanel />);

    await act(async () => {
      screen.getByRole('button', { name: /mock open weight entry/i }).click();
    });
    expect(useCartStore.getState().items).toHaveLength(0);

    // With the weight dialog open, a scan burst must not update the search
    // box or be treated as a second weight-entry trigger.
    await scanAndFlush(mockProductA.barcode as string);
    expect(screen.getByTestId('product-grid-mock')).toHaveAttribute('data-search', '');
  });

  it('restores ordinary scanning once payment is cancelled back to the cart screen', async () => {
    renderWithProviders(<CheckoutPanel />);

    await scanAndFlush(mockProductA.barcode as string);
    await waitFor(() => {
      expect(screen.getByTestId('product-grid-mock')).toHaveAttribute(
        'data-search',
        mockProductA.barcode
      );
    });

    await act(async () => {
      screen.getByRole('button', { name: /mock add product a/i }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: /process payment/i }).click();
    });
    expect(screen.getByTestId('payment-form-mock')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: /mock cancel/i }).click();
    });
    expect(screen.queryByTestId('payment-form-mock')).not.toBeInTheDocument();

    await scanAndFlush(mockProductB.barcode as string);
    await waitFor(() => {
      expect(screen.getByTestId('product-grid-mock')).toHaveAttribute(
        'data-search',
        mockProductB.barcode
      );
    });
  });
});
