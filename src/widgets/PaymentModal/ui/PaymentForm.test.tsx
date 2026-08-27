/**
 * Unit tests for PaymentForm — card charge override feature
 *
 * Covers: MoneyInput for charge amount, default value, onChange, reset button
 * visibility/behavior, canSubmit guard, and processCardPayment call args.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStaffStore } from '@entities/staff/model/store';
import type { Tab } from '@entities/tab/model/types';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import { openCashDrawer, printReceipt } from '@shared/lib/pos-printer';
import { ok } from '@shared/lib/result';
import { renderWithProviders } from '@shared/lib/test-utils';

import type { PaymentProcessors } from './PaymentForm';
import { PaymentForm } from './PaymentForm';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@shared/lib/pos-printer', () => ({
  printReceipt: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  openCashDrawer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

// taxRatePercent=0 keeps assertions simple — no tax arithmetic needed.
vi.mock('@entities/settings', () => {
  const stableSettings = {
    billing: {
      taxRatePercent: 0,
      defaultTipPercentages: [10, 15, 18, 20],
      paymentMethods: { cash: true, bbvaCard: true, rappi: true },
    },
    paymentLabels: { cash: 'Efectivo', card: 'Terminal BBVA', rappi: 'Rappi' },
  };
  return {
    useSettings: () => ({ data: stableSettings }),
    useReceiptSettings: () => ({ data: undefined }),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const staffId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const shiftId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/**
 * Minimal Tab with items totalling $20 (no pool charges, no tax with taxRate=0).
 * runningTotal = $20 + tip (15% of $20 = $3) = $23.
 */
const testTab: Tab = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  customerName: 'Test Customer',
  staffId,
  shiftId,
  openedAt: new Date('2026-04-17T10:00:00.000Z'),
  closedAt: null,
  status: 'open',
  notes: null,
  orders: [],
  items: [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddd01',
      orderId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      productId: 'ffffffff-ffff-ffff-ffff-fffffffffff1',
      quantity: 2,
      unitPrice: 10,
      modifierIds: [],
      modifierPriceDelta: 0,
      notes: null,
      modifiers: [],
    },
  ],
};

function makeReceipt(): ReceiptData {
  return {
    receiptNumber: 'R001',
    tabId: testTab.id,
    customerName: testTab.customerName,
    cashierName: 'Staff',
    barName: 'Test Bar',
    barAddress: '1 Main St',
    items: [],
    subtotal: 20,
    tipAmount: 0,
    total: 20,
    paymentMethod: 'card',
    processedAt: new Date(),
    squareReceiptUrl: null,
    tenderedAmount: null,
    changeAmount: null,
  };
}

function makeProcessors(overrides: Partial<PaymentProcessors> = {}): PaymentProcessors {
  const receipt = makeReceipt();
  return {
    processCashPayment: vi
      .fn()
      .mockResolvedValue(ok({ paymentId: 'p-cash', changeAmount: 0, receiptData: receipt })),
    processCardPayment: vi
      .fn()
      .mockResolvedValue(ok({ paymentId: 'p-card', receiptData: receipt })),
    processRappiPayment: vi
      .fn()
      .mockResolvedValue(ok({ paymentId: 'p-rappi', receiptData: receipt })),
    processSplitPayment: vi
      .fn()
      .mockResolvedValue(
        ok({ paymentGroupId: 'group-1', paymentIds: ['p-split-1'], receipts: [receipt] })
      ),
    ...overrides,
  };
}

function renderForm(processors: PaymentProcessors = makeProcessors(), onPaymentSuccess = vi.fn()) {
  renderWithProviders(
    <PaymentForm
      tab={testTab}
      staffId={staffId}
      onPaymentSuccess={onPaymentSuccess}
      processors={processors}
    />
  );
}

/** Switch to card method */
async function selectCardMethod(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('payment-btn-card'));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useStaffStore.setState({
    currentStaff: {
      id: staffId,
      name: 'Test Manager',
      email: 'manager@test.dev',
      role: 'manager',
      pin: '123456',
      isActive: true,
      mustChangePin: false,
      locale: 'es-MX',
    },
    currentShift: null,
    staffList: [],
    isAuthenticated: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sprint 2 — Discount section
// ---------------------------------------------------------------------------

describe('PaymentForm — discount section', () => {
  it('renders discount section for cash payment', () => {
    renderForm();
    // Default method is cash (non-rappi tab); discount section should be present
    expect(screen.getByTestId('discount-section')).toBeInTheDocument();
  });

  it('discount section not shown for Rappi payment', () => {
    const rappiTab: Tab = {
      ...testTab,
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      rappiOrderId: 'RAPPI-ORDER-123',
    };
    renderWithProviders(
      <PaymentForm
        tab={rappiTab}
        staffId={staffId}
        onPaymentSuccess={vi.fn()}
        processors={makeProcessors()}
      />
    );
    // rappi tab auto-selects rappi method → discount hidden
    expect(screen.queryByTestId('discount-section')).not.toBeInTheDocument();
  });

  it('10% all-items discount shows discount row in totals', async () => {
    const user = userEvent.setup();
    renderForm();

    // discount is progressively disclosed — expand it first
    await user.click(screen.getByRole('switch', { name: 'Discount' }));

    // scope defaults to 'all'; change discount value to 10
    const discountInput = screen.getByLabelText('Discount %');
    await user.clear(discountInput);
    await user.type(discountInput, '10');
    await user.tab(); // blur to commit

    // Discount base = $20 (itemsSubtotal), 10% = $2
    expect(screen.getByTestId('discount-row')).toBeInTheDocument();
  });

  it('fixed $5 discount shows correct discount-applied-label', async () => {
    const user = userEvent.setup();
    renderForm();

    // discount is progressively disclosed — expand it first
    await user.click(screen.getByRole('switch', { name: 'Discount' }));
    await user.click(screen.getByTestId('discount-type-fixed'));

    const discountInput = screen.getByLabelText('Discount amount');
    await user.clear(discountInput);
    await user.type(discountInput, '5');
    await user.tab();

    expect(screen.getByTestId('discount-applied-label')).toHaveTextContent('5.00');
  });

  it('no discount row when discountValue is 0', () => {
    renderForm();
    // Default discountValue = 0
    expect(screen.queryByTestId('discount-row')).not.toBeInTheDocument();
  });
});

describe('PaymentForm — card charge override', () => {
  it('renders MoneyInput for charge amount when method is card', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);
    expect(screen.getByLabelText('Charge amount')).toBeInTheDocument();
  });

  it('MoneyInput defaults to runningTotal when no override is set', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);
    // baseSubtotal=20, taxRate=0, tip=15% of 20=3, runningTotal=23
    const input = screen.getByLabelText('Charge amount');
    expect(input).toHaveValue('23.00');
  });

  it('onChange on MoneyInput sets the override', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);

    const input = screen.getByLabelText('Charge amount');
    await user.clear(input);
    await user.type(input, '50.00');
    // blur to commit the value
    await user.tab();

    expect(input).toHaveValue('50.00');
  });

  it('reset button is hidden when override is null', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);

    expect(screen.queryByTestId('card-override-reset')).not.toBeInTheDocument();
  });

  it('reset button appears when override is set', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);

    const input = screen.getByLabelText('Charge amount');
    await user.clear(input);
    await user.type(input, '99.00');
    await user.tab();

    expect(screen.getByTestId('card-override-reset')).toBeInTheDocument();
  });

  it('reset button clears the override', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);

    const input = screen.getByLabelText('Charge amount');
    await user.clear(input);
    await user.type(input, '99.00');
    await user.tab();

    await user.click(screen.getByTestId('card-override-reset'));

    // reset button should disappear again
    expect(screen.queryByTestId('card-override-reset')).not.toBeInTheDocument();
    // input should return to runningTotal
    expect(input).toHaveValue('23.00');
  });

  it('submit button is disabled when cardChargeOverride is 0', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectCardMethod(user);

    const input = screen.getByLabelText('Charge amount');
    await user.clear(input);
    await user.type(input, '0.00');
    await user.tab();

    expect(screen.getByRole('button', { name: /confirm card payment/i })).toBeDisabled();
  });

  it('processCardPayment called with override amount and tipAmount=0 when override set', async () => {
    const user = userEvent.setup();
    const processors = makeProcessors();
    renderForm(processors);
    await selectCardMethod(user);

    const input = screen.getByLabelText('Charge amount');
    await user.clear(input);
    await user.type(input, '45.00');
    await user.tab();

    await user.click(screen.getByRole('button', { name: /confirm card payment/i }));

    await waitFor(() => {
      expect(processors.processCardPayment).toHaveBeenCalled();
    });
    // override amount=45, tipAmount=0 (because override is set), no ref, no discount, no version (testTab has none)
    expect(processors.processCardPayment).toHaveBeenCalledWith(
      testTab.id,
      45,
      0,
      undefined,
      undefined,
      undefined,
      expect.any(String)
    );
  });

  it('processCardPayment called with baseSubtotal and tipAmount when no override', async () => {
    const user = userEvent.setup();
    const processors = makeProcessors();
    renderForm(processors);
    await selectCardMethod(user);

    // Do NOT modify the charge amount — leave it as default (runningTotal)
    await user.click(screen.getByRole('button', { name: /confirm card payment/i }));

    await waitFor(() => {
      expect(processors.processCardPayment).toHaveBeenCalled();
    });
    // No override: chargeAmount=baseSubtotal=20, tipAmount=3 (15% of 20, taxRate=0), no ref, no discount, no version (testTab has none)
    expect(processors.processCardPayment).toHaveBeenCalledWith(
      testTab.id,
      20,
      3,
      undefined,
      undefined,
      undefined,
      expect.any(String)
    );
  });
});

describe('PaymentForm — close and receipt completion', () => {
  it('keeps Cancel separate from receipt Done when onDone is supplied', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(
      <PaymentForm
        tab={testTab}
        staffId={staffId}
        onPaymentSuccess={vi.fn()}
        onClose={onClose}
        onDone={onDone}
        processors={makeProcessors()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone instead of onClose after a successful payment receipt', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(
      <PaymentForm
        tab={testTab}
        staffId={staffId}
        onPaymentSuccess={vi.fn()}
        onClose={onClose}
        onDone={onDone}
        processors={makeProcessors()}
      />
    );

    await selectCardMethod(user);
    await user.click(screen.getByRole('button', { name: /confirm card payment/i }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(onDone).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 18 — Split payment mode
// ---------------------------------------------------------------------------

describe('PaymentForm — split mode', () => {
  async function openSplitMode(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('switch', { name: 'Split payment' }));
  }

  it('toggle ON reveals 2 rows + Remaining to pay box; toggle OFF restores the method grid', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByTestId('payment-btn-cash')).toBeInTheDocument();

    await openSplitMode(user);

    expect(screen.getByText('Payment 1')).toBeInTheDocument();
    expect(screen.getByText('Payment 2')).toBeInTheDocument();
    expect(screen.getByText('Remaining to pay')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-btn-cash')).not.toBeInTheDocument();

    await openSplitMode(user);

    expect(screen.getByTestId('payment-btn-cash')).toBeInTheDocument();
    expect(screen.queryByText('Payment 1')).not.toBeInTheDocument();
  });

  it('add-row appends up to 4 rows then disables Add; remove-row disabled at exactly 2 rows', async () => {
    const user = userEvent.setup();
    renderForm();
    await openSplitMode(user);

    expect(screen.queryByRole('button', { name: 'Remove payment 1' })).not.toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: '+ Add payment method' });
    await user.click(addBtn);
    expect(screen.getByText('Payment 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove payment 1' })).toBeInTheDocument();

    await user.click(addBtn);
    expect(screen.getByText('Payment 4')).toBeInTheDocument();
    expect(addBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove payment 4' }));
    await user.click(screen.getByRole('button', { name: 'Remove payment 3' }));

    expect(screen.queryByText('Payment 3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove payment 1' })).not.toBeInTheDocument();
    expect(addBtn).not.toBeDisabled();
  });

  it('live remaining shows Fully allocated when rows sum to subtotalWithTax; submit disabled until remaining=0 and every row amount>0', async () => {
    const user = userEvent.setup();
    renderForm();
    await openSplitMode(user);

    // Switch both rows to card to avoid the cash tendered-amount requirement.
    const cardButtons = screen.getAllByRole('button', { name: 'Terminal BBVA' });
    await user.click(cardButtons[0]!);
    await user.click(cardButtons[1]!);

    const submitBtn = screen.getByRole('button', { name: 'Process split payment' });
    expect(submitBtn).toBeDisabled();

    const amountInputs = screen.getAllByLabelText('Amount');
    await user.clear(amountInputs[0]!);
    await user.type(amountInputs[0]!, '10.00');
    await user.tab();
    // Row 2 still has amount=0 — submit stays disabled (Pitfall 3)
    expect(submitBtn).toBeDisabled();

    await user.clear(amountInputs[1]!);
    await user.type(amountInputs[1]!, '10.00');
    await user.tab();

    // testTab: itemsSubtotal=$20, taxRate=0 → subtotalWithTax=$20 → 10+10=20
    expect(screen.getByText('Fully allocated ✓')).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();
  });

  it('submit calls processSplitPayment with legs summing to subtotalWithTax; renders the single sale-level receipt once; Done reaches onClose', async () => {
    const user = userEvent.setup();
    // Direct-sale split payments now resolve to exactly one sale-level
    // receipt (basket composed once, every leg in receipt.tenders) —
    // mirrors what useCheckoutSale's processSplitPayment adapter returns.
    const saleReceipt = {
      ...makeReceipt(),
      total: 20,
      tenders: [
        { method: 'cash' as const, amount: 12, tipAmount: 0, tenderedAmount: 12, changeAmount: 0 },
        { method: 'card' as const, amount: 8, tipAmount: 0 },
      ],
    };
    const processors = makeProcessors({
      processSplitPayment: vi
        .fn()
        .mockResolvedValue(
          ok({ paymentGroupId: 'group-x', paymentIds: ['p1', 'p2'], receipts: [saleReceipt] })
        ),
    });
    const onClose = vi.fn();
    renderWithProviders(
      <PaymentForm
        tab={testTab}
        staffId={staffId}
        onPaymentSuccess={vi.fn()}
        onClose={onClose}
        processors={processors}
      />
    );

    await openSplitMode(user);

    // Row 1 stays cash (default); switch row 2 to card.
    const cardButtons = screen.getAllByRole('button', { name: 'Terminal BBVA' });
    await user.click(cardButtons[1]!);

    const amountInputs = screen.getAllByLabelText('Amount');
    await user.clear(amountInputs[0]!);
    await user.type(amountInputs[0]!, '12.00');
    await user.clear(amountInputs[1]!);
    await user.type(amountInputs[1]!, '8.00');
    await user.tab();

    const tenderedInput = screen.getByLabelText('Amount tendered');
    await user.clear(tenderedInput);
    await user.type(tenderedInput, '12.00');
    await user.tab();

    const submitBtn = screen.getByRole('button', { name: 'Process split payment' });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(processors.processSplitPayment).toHaveBeenCalled();
    });
    const call = vi.mocked(processors.processSplitPayment).mock.calls[0]!;
    const [tabId, legs, expectedTotal] = call;
    expect(tabId).toBe(testTab.id);
    expect(legs.reduce((sum, leg) => sum + leg.amount, 0)).toBe(20);
    expect(expectedTotal).toBe(20);

    // No "Receipt N of M" navigation label — exactly one receipt is shown.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Receipt' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/of 2/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('cash-drawer-once: a 2-cash-row split calls openCashDrawer exactly once and printReceipt twice', async () => {
    const user = userEvent.setup();
    const receipt1 = { ...makeReceipt(), paymentMethod: 'cash' as const };
    const receipt2 = { ...makeReceipt(), paymentMethod: 'cash' as const };
    const processors = makeProcessors({
      processSplitPayment: vi
        .fn()
        .mockResolvedValue(
          ok({ paymentGroupId: 'group-y', paymentIds: ['p1', 'p2'], receipts: [receipt1, receipt2] })
        ),
    });
    renderForm(processors);
    await openSplitMode(user);

    // Both rows default to cash.
    const amountInputs = screen.getAllByLabelText('Amount');
    await user.clear(amountInputs[0]!);
    await user.type(amountInputs[0]!, '12.00');
    await user.clear(amountInputs[1]!);
    await user.type(amountInputs[1]!, '8.00');
    await user.tab();

    const tenderedInputs = screen.getAllByLabelText('Amount tendered');
    await user.clear(tenderedInputs[0]!);
    await user.type(tenderedInputs[0]!, '12.00');
    await user.clear(tenderedInputs[1]!);
    await user.type(tenderedInputs[1]!, '8.00');
    await user.tab();

    await user.click(screen.getByRole('button', { name: 'Process split payment' }));

    await waitFor(() => {
      expect(processors.processSplitPayment).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(openCashDrawer).toHaveBeenCalledTimes(1);
    });
    expect(printReceipt).toHaveBeenCalledTimes(2);
  });

  it('regression: single-method (toggle OFF) cash payment still calls processCashPayment unchanged', async () => {
    const user = userEvent.setup();
    const processors = makeProcessors();
    renderForm(processors);

    const tendered = screen.getByLabelText('Amount tendered');
    await user.clear(tendered);
    await user.type(tendered, '30.00');
    await user.tab();

    await user.click(screen.getByRole('button', { name: 'Process payment' }));

    await waitFor(() => {
      expect(processors.processCashPayment).toHaveBeenCalled();
    });
    expect(processors.processSplitPayment).not.toHaveBeenCalled();
  });
});
