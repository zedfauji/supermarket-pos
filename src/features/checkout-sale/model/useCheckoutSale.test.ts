import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CajaSession, CartItem, Shift, Staff } from '@shared/lib/domain';

import { useCheckoutSale } from './useCheckoutSale';

// ---------------------------------------------------------------------------
// Mocks — mirrors useScanBarcodeToCart.test.ts's selector-passthrough shape,
// extended to useCheckoutSale's 3-Zustand-store dependency.
// ---------------------------------------------------------------------------

vi.mock('@entities/tab/model/cartStore', () => ({
  useCartStore: (selector: (state: { items: CartItem[] }) => unknown) =>
    selector({ items: cartState.items }),
}));

vi.mock('@entities/staff', () => ({
  useStaffStore: (
    selector: (state: { currentStaff: Staff | null; currentShift: Shift | null }) => unknown
  ) => selector({ currentStaff: staffState.currentStaff, currentShift: staffState.currentShift }),
}));

vi.mock('@entities/caja', () => ({
  useCajaStore: (
    selector: (state: { currentCaja: CajaSession | null; isCajaOpen: boolean }) => unknown
  ) => selector({ currentCaja: cajaState.currentCaja, isCajaOpen: cajaState.isCajaOpen }),
}));

const mockCallProcessDirectSale = vi.fn();
vi.mock('@shared/lib/edge-function-contracts', () => ({
  callProcessDirectSale: (request: unknown) =>
    (mockCallProcessDirectSale as (r: unknown) => unknown)(request),
}));

const mockIsOnline = vi.fn(() => true);
vi.mock('@shared/lib/connectivity', () => ({
  isOnline: () => mockIsOnline(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const staff: Staff = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ana Cashier',
  email: 'ana@example.com',
  role: 'cashier',
  pin: '0000',
  isActive: true,
  mustChangePin: false,
  locale: 'es-MX',
};

const shift: Shift = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  staffId: staff.id,
  clockIn: new Date(),
  clockOut: null,
  openingCash: 100,
  closingCash: null,
};

const caja: CajaSession = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  openedAt: new Date(),
  closedAt: null,
  openedBy: staff.id,
  closedBy: null,
  openingCash: 100,
  closingCash: null,
  notes: null,
  status: 'open',
};

const cartState: { items: CartItem[] } = { items: [] };
const staffState: { currentStaff: Staff | null; currentShift: Shift | null } = {
  currentStaff: staff,
  currentShift: shift,
};
const cajaState: { currentCaja: CajaSession | null; isCajaOpen: boolean } = {
  currentCaja: caja,
  isCajaOpen: true,
};

function resetStores() {
  cartState.items = [];
  staffState.currentStaff = staff;
  staffState.currentShift = shift;
  cajaState.currentCaja = caja;
  cajaState.isCajaOpen = true;
}

// ---------------------------------------------------------------------------
// useCheckoutSale.processors
// ---------------------------------------------------------------------------

describe('useCheckoutSale', () => {
  beforeEach(() => {
    resetStores();
    mockIsOnline.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns NETWORK_OFFLINE and never calls the edge function when offline', async () => {
    mockIsOnline.mockReturnValue(false);
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCashPayment('tab-1', 10, 0, 10);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('NETWORK_OFFLINE');
    }
    expect(mockCallProcessDirectSale).not.toHaveBeenCalled();
  });

  it('returns CAJA_CLOSED and never calls the edge function when caja is not open', async () => {
    cajaState.isCajaOpen = false;
    cajaState.currentCaja = null;
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCashPayment('tab-1', 10, 0, 10);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('CAJA_CLOSED');
    }
    expect(mockCallProcessDirectSale).not.toHaveBeenCalled();
  });

  it('returns CAJA_CLOSED when there is no logged-in staff/shift', async () => {
    staffState.currentStaff = null;
    staffState.currentShift = null;
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCashPayment('tab-1', 10, 0, 10);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('CAJA_CLOSED');
    }
    expect(mockCallProcessDirectSale).not.toHaveBeenCalled();
  });

  it('processCashPayment returns ok with paymentId/changeAmount/receiptData on success', async () => {
    mockCallProcessDirectSale.mockResolvedValue({
      ok: true,
      data: { paymentId: 'p1', receiptData: { changeAmount: 0 } },
    });
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCashPayment('tab-1', 10, 0, 10);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        paymentId: 'p1',
        changeAmount: 0,
        receiptData: { changeAmount: 0 },
      });
    }
  });

  it('processCardPayment returns ok with paymentId/receiptData on success', async () => {
    mockCallProcessDirectSale.mockResolvedValue({
      ok: true,
      data: { paymentId: 'p1', receiptData: { changeAmount: 0 } },
    });
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCardPayment('tab-1', 10, 0);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ paymentId: 'p1', receiptData: { changeAmount: 0 } });
    }
  });

  it('processSplitPayment wraps the single sale-level receiptData in a one-element receipts array', async () => {
    mockCallProcessDirectSale.mockResolvedValue({
      ok: true,
      data: { paymentGroupId: 'g1', paymentIds: ['p1', 'p2'], receiptData: { changeAmount: 0 } },
    });
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processSplitPayment(
      'tab-1',
      [
        { method: 'cash', amount: 5, tipAmount: 0 },
        { method: 'card', amount: 5, tipAmount: 0 },
      ],
      10
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        paymentGroupId: 'g1',
        paymentIds: ['p1', 'p2'],
        receipts: [{ changeAmount: 0 }],
      });
    }
  });

  it('processCashPayment returns UNKNOWN_ERROR (not a thrown exception) when the success envelope is missing paymentId/receiptData', async () => {
    mockCallProcessDirectSale.mockResolvedValue({ ok: true, data: {} });
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCashPayment('tab-1', 10, 0, 10);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('UNKNOWN_ERROR');
    }
  });

  it('processCashPayment propagates an edge-function error unchanged', async () => {
    mockCallProcessDirectSale.mockResolvedValue({
      ok: false,
      error: { code: 'SUPABASE_ERROR', message: 'boom' },
    });
    const { result } = renderHook(() => useCheckoutSale());

    const res = await result.current.processors.processCashPayment('tab-1', 10, 0, 10);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toEqual({ code: 'SUPABASE_ERROR', message: 'boom' });
    }
  });
});
