import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@shared/lib/domain';
import { useScanBarcodeToCart } from './useScanBarcodeToCart';

const mockLookup = vi.fn();
vi.mock('@features/lookup-product-by-barcode/model/useLookupProductByBarcode', () => ({
  useLookupProductByBarcode: () => ({ lookup: mockLookup }),
}));

const mockAddItem = vi.fn();
vi.mock('@entities/tab/model/cartStore', () => ({
  useCartStore: (selector: (state: { addItem: typeof mockAddItem }) => unknown) =>
    selector({ addItem: mockAddItem }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function scanKeys(code: string) {
  code.split('').forEach(pressKey);
  pressKey('Enter');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

const regularProduct: Product = {
  id: 'product-regular',
  name: 'Regular Product',
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

const weightedProduct: Product = {
  ...regularProduct,
  id: 'product-weighted',
  name: 'Weighted Product',
  soldByWeight: true,
  barcode: '2222222222222',
};

describe('useScanBarcodeToCart', () => {
  beforeEach(() => {
    mockLookup.mockReset();
    mockAddItem.mockReset();
  });

  it('adds a matched ordinary product to the cart while enabled', async () => {
    mockLookup.mockResolvedValue(regularProduct);
    const onWeightedProduct = vi.fn();
    renderHook(() => {
      useScanBarcodeToCart(true, onWeightedProduct);
    });

    await act(async () => {
      scanKeys(regularProduct.barcode as string);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddItem).toHaveBeenCalledWith(regularProduct, []);
    expect(onWeightedProduct).not.toHaveBeenCalled();
  });

  it('opens weight entry instead of adding a sold-by-weight product to the cart', async () => {
    mockLookup.mockResolvedValue(weightedProduct);
    const onWeightedProduct = vi.fn();
    renderHook(() => {
      useScanBarcodeToCart(true, onWeightedProduct);
    });

    await act(async () => {
      scanKeys(weightedProduct.barcode as string);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onWeightedProduct).toHaveBeenCalledWith(weightedProduct);
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('discards a lookup that resolves after checkout disables scanning mid-flight', async () => {
    const { promise, resolve } = deferred<Product>();
    mockLookup.mockReturnValue(promise);
    const onWeightedProduct = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useScanBarcodeToCart(enabled, onWeightedProduct);
      },
      { initialProps: { enabled: true } }
    );

    act(() => {
      scanKeys(weightedProduct.barcode as string);
    });

    // Checkout disables scanning (e.g. payment/receipt opens) before the
    // in-flight lookup started above resolves.
    rerender({ enabled: false });

    await act(async () => {
      resolve(weightedProduct);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddItem).not.toHaveBeenCalled();
    expect(onWeightedProduct).not.toHaveBeenCalled();
  });
});
