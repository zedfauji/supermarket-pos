import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import { printReceipt } from '@shared/lib/pos-printer';
import { renderWithProviders } from '@shared/lib/test-utils';
import { ReceiptPreview } from './ReceiptPreview';

vi.mock('@shared/lib/pos-printer', () => ({
  printReceipt: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

vi.mock('@entities/settings', () => ({
  useReceiptSettings: () => ({ data: undefined }),
}));

vi.mock('./EmailReceiptDialog', () => ({
  EmailReceiptDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="email-dialog-open">email</div> : null,
}));

const receipt: ReceiptData = {
  receiptNumber: 'R1',
  tabId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  customerName: 'Guest',
  cashierName: 'Staff',
  barName: 'Bar',
  barAddress: '',
  items: [{ name: 'Beer', quantity: 1, unitPrice: 5, lineTotal: 5 }],
  subtotal: 5,
  tipAmount: 0,
  total: 5,
  paymentMethod: 'cash',
  processedAt: new Date('2026-04-17T12:00:00.000Z'),
  squareReceiptUrl: null,
  tenderedAmount: 10,
  changeAmount: 5,
};

describe('ReceiptPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(printReceipt).mockResolvedValue({ ok: true, data: undefined });
  });

  it('renders thermal receipt text', () => {
    const onDone = vi.fn();
    renderWithProviders(<ReceiptPreview receipt={receipt} onDone={onDone} />);
    expect(screen.getByText(/Beer/)).toBeInTheDocument();
    expect(screen.getByText(/Subtotal/)).toBeInTheDocument();
  });

  it('shows Printing while printReceipt pending then idle', async () => {
    const user = userEvent.setup();
    let resolvePrint: (v: { ok: true; data: undefined }) => void = () => {};
    const printPromise = new Promise<{ ok: true; data: undefined }>(res => {
      resolvePrint = res;
    });
    vi.mocked(printReceipt).mockReturnValue(printPromise);

    renderWithProviders(<ReceiptPreview receipt={receipt} onDone={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Print receipt' }));
    expect(screen.getByRole('button', { name: 'Printing…' })).toBeDisabled();

    resolvePrint({ ok: true, data: undefined });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Print receipt' })).toBeInTheDocument();
    });
  });

  it('opens email dialog when Email receipt clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceiptPreview receipt={receipt} onDone={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Email receipt' }));
    expect(screen.getByTestId('email-dialog-open')).toBeInTheDocument();
  });

  it('calls onDone from Done button', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithProviders(<ReceiptPreview receipt={receipt} onDone={onDone} />);

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });
});
