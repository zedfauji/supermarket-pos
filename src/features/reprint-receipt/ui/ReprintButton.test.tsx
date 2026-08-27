/**
 * Unit tests for ReprintButton (Plan 19-04, D-11) — closes the second,
 * subtler silent-discard: handleClick previously called `printReceipt` but
 * never inspected its returned Result, so a broker rejection was never
 * surfaced to the cashier. Covers: the returned Result is now branched on
 * (failure -> translated printJobErrorCopyKey toast; success -> no toast,
 * matching the no-success-toast rule), while a genuine data-fetch failure
 * still falls through to the existing generic reprintDataFailed toast.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Payment } from '@entities/payment';
import type * as PosPrinter from '@shared/lib/pos-printer';
import { printReceipt } from '@shared/lib/pos-printer';
import { err, ok } from '@shared/lib/result';
import { renderWithProviders } from '@shared/lib/test-utils';

import { ReprintButton } from './ReprintButton';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockFetchReceiptDataForPayment = vi.fn();

vi.mock('@entities/payment', () => ({
  fetchReceiptDataForPayment: (tabId: string) => mockFetchReceiptDataForPayment(tabId),
  paymentReceiptKeys: { byTab: (tabId: string) => ['payment', 'receipt-data', tabId] },
}));

vi.mock('@entities/settings', () => ({
  useReceiptSettings: () => ({ data: undefined }),
}));

vi.mock('@shared/lib/pos-printer', async importOriginal => {
  const actual = await importOriginal<typeof PosPrinter>();
  return {
    ...actual,
    printReceipt: vi.fn(),
  };
});

const payment: Payment = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tabId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  amount: 20,
  tipAmount: 0,
  method: 'cash',
  squarePaymentId: null,
  squareReceiptUrl: null,
  tenderedAmount: 20,
  referenceNumber: null,
  idempotencyKey: null,
  processedAt: new Date('2026-04-17T12:00:00.000Z'),
  processedBy: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  status: 'completed',
};

const receiptData = {
  receiptNumber: 'R1',
  tabId: payment.tabId,
  customerName: 'Guest',
  cashierName: 'Staff',
  barName: 'Bar',
  barAddress: '',
  items: [],
  subtotal: 20,
  tipAmount: 0,
  total: 20,
  paymentMethod: 'cash' as const,
  processedAt: new Date('2026-04-17T12:00:00.000Z'),
  squareReceiptUrl: null,
  tenderedAmount: 20,
  changeAmount: 0,
};

describe('ReprintButton — print Result handling (no silent discard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchReceiptDataForPayment.mockResolvedValue(receiptData);
    vi.mocked(printReceipt).mockResolvedValue(ok({ jobId: 'mock-job' }));
  });

  it('shows the translated rejected copy when printReceipt returns a failed Result (previously never inspected)', async () => {
    const user = userEvent.setup();
    vi.mocked(printReceipt).mockResolvedValue(err({ code: 'PRINT_JOB_REJECTED', message: 'z' }));
    renderWithProviders(<ReprintButton payment={payment} />);

    await user.click(screen.getByRole('button', { name: 'Reprint' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Printer rejected this job. Check the printer name in Settings and try again.'
      );
    });
  });

  it('shows no toast when printReceipt succeeds (no-success-toast rule)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReprintButton payment={payment} />);

    await user.click(screen.getByRole('button', { name: 'Reprint' }));

    await waitFor(() => {
      expect(printReceipt).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('still shows the generic reprintDataFailed toast on a data-fetch failure (distinct from a print failure)', async () => {
    const user = userEvent.setup();
    mockFetchReceiptDataForPayment.mockRejectedValue(new Error('not found'));
    renderWithProviders(<ReprintButton payment={payment} />);

    await user.click(screen.getByRole('button', { name: 'Reprint' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Couldn't load this sale's receipt — try again.");
    });
    expect(printReceipt).not.toHaveBeenCalled();
  });
});
