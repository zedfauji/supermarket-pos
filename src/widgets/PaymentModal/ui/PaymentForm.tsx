/**
 * PaymentForm — all payment state and UI extracted from PaymentModal.
 * Can be embedded inline (PaymentPane) or wrapped in a Dialog (PaymentModal).
 */

import { AlertCircle, Copy, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ReceiptPreview } from '@features/process-payment/ui/ReceiptPreview';
import { useReceiptSettings, useSettings } from '@entities/settings';
import { useStaffStore } from '@entities/staff/model/store';
import type { Tab } from '@entities/tab/model/types';
import { ReceiptSettingsSchema, type DiscountScope, type DiscountType } from '@shared/lib/domain';
import {
  getDiscountBase,
  calculateDiscountAmount,
  generateIdempotencyKey,
} from '@shared/lib/domain-helpers';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import { formatMoney } from '@shared/lib/format';
import { groupOrderItems } from '@shared/lib/groupOrderItems';
import { logger } from '@shared/lib/logger-instance';
import {
  processCardPayment,
  processCashPayment,
  processRappiPayment,
  processSplitPayment,
  type DiscountInfo,
  type SplitPaymentLegInput,
} from '@shared/lib/payment-processor';
import { openCashDrawer, printJobErrorCopyKey, printReceipt } from '@shared/lib/pos-printer';
import type { AppErrorCode, Result } from '@shared/lib/result';
import {
  ConfirmDialog,
  MoneyDisplay,
  MoneyInput,
  POSButton,
  ProtectedAction,
  ScrollArea,
  Switch,
} from '@shared/ui';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';

type PayMethod = 'cash' | 'card' | 'rappi' | 'bank_transfer';

// bank_transfer is checkout-time single-method only (no split-leg support
// this phase, see PLAN 23-02) — split rows keep the pre-existing method set.
type SplitPayMethod = Exclude<PayMethod, 'bank_transfer'>;

type SplitRow = {
  id: string;
  method: SplitPayMethod;
  amount: number;
  tenderedAmount: number;
  cardReference: string;
};

type SplitRowAction =
  | { type: 'RESET_ROWS'; rows: SplitRow[] }
  | { type: 'ADD_ROW'; defaultMethod: SplitPayMethod }
  | { type: 'REMOVE_ROW'; rowId: string }
  | { type: 'SET_METHOD'; rowId: string; method: SplitPayMethod }
  | { type: 'SET_AMOUNT'; rowId: string; value: number }
  | { type: 'SET_TENDERED'; rowId: string; value: number }
  | { type: 'SET_CARD_REF'; rowId: string; value: string };

let splitRowCounter = 0;
function nextSplitRowId(): string {
  splitRowCounter += 1;
  return `split-row-${String(splitRowCounter)}`;
}

function makeDefaultSplitRow(method: SplitPayMethod): SplitRow {
  return {
    id: nextSplitRowId(),
    method,
    amount: 0,
    tenderedAmount: 0,
    cardReference: '',
  };
}

function splitRowsReducer(state: SplitRow[], action: SplitRowAction): SplitRow[] {
  switch (action.type) {
    case 'RESET_ROWS':
      return action.rows;
    case 'ADD_ROW':
      if (state.length >= 4) return state;
      return [...state, makeDefaultSplitRow(action.defaultMethod)];
    case 'REMOVE_ROW':
      if (state.length <= 2) return state;
      return state.filter(r => r.id !== action.rowId);
    case 'SET_METHOD':
      return state.map(r => (r.id === action.rowId ? { ...r, method: action.method } : r));
    case 'SET_AMOUNT':
      return state.map(r => (r.id === action.rowId ? { ...r, amount: action.value } : r));
    case 'SET_TENDERED':
      return state.map(r => (r.id === action.rowId ? { ...r, tenderedAmount: action.value } : r));
    case 'SET_CARD_REF':
      return state.map(r => (r.id === action.rowId ? { ...r, cardReference: action.value } : r));
    default:
      return state;
  }
}

const DEFAULT_ENABLED_METHODS = {
  cash: true,
  bbvaCard: true,
  rappi: true,
} as const;
const DEFAULT_TAX_RATE_PERCENT = 16;

export type PaymentProcessors = {
  processCashPayment: typeof processCashPayment;
  processCardPayment: typeof processCardPayment;
  processRappiPayment: typeof processRappiPayment;
  processSplitPayment: typeof processSplitPayment;
  /**
   * Only ever supplied by CheckoutPanel (via useCheckoutSale) — absent from
   * defaultProcessors, which PaymentPane's generic tab-payment flow uses.
   * This absence is the sole client-side gate implementing D-16's
   * "checkout-time only" scoping (T-23-06): PaymentForm only renders the
   * Bank Transfer method button when this field is present.
   */
  processBankTransferPayment?: (
    tabId: string,
    amount: number,
    customerName: string,
    customerPhone: string,
    discountInfo?: DiscountInfo,
    expectedVersion?: number,
    idempotencyKeyOverride?: string
  ) => ReturnType<typeof processCardPayment>;
};

const defaultProcessors: PaymentProcessors = {
  processCashPayment,
  processCardPayment,
  processRappiPayment,
  processSplitPayment,
};

export interface PaymentFormProps {
  tab: Tab;
  /** Current staff profile id — required to process payment */
  staffId: string;
  onPaymentSuccess: () => void;
  /** Used by PaymentModal's Dialog to close after viewing receipt */
  onClose?: () => void;
  /** Used by direct sale checkout after a successful receipt is dismissed */
  onDone?: () => void;
  /** Storybook / tests */
  processors?: PaymentProcessors;
}

function calculateLineTotal(
  item: Pick<Tab['items'][number], 'unitPrice' | 'modifierPriceDelta' | 'quantity'>
): number {
  return (item.unitPrice + item.modifierPriceDelta) * item.quantity;
}

export function PaymentForm({
  tab,
  staffId,
  onPaymentSuccess,
  onClose,
  onDone,
  processors = defaultProcessors,
}: PaymentFormProps) {
  const { t } = useTranslation('wPanels');
  const { t: tCommon } = useTranslation('common');
  const currentRole = useStaffStore(s => s.currentStaff?.role);
  const { data: appSettings } = useSettings();
  const { data: receiptSettings } = useReceiptSettings();
  const settings = receiptSettings ?? ReceiptSettingsSchema.parse({});
  const enabledMethods = appSettings?.billing.paymentMethods ?? DEFAULT_ENABLED_METHODS;
  const taxRatePercent = appSettings?.billing.taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT;
  const taxInclusive = appSettings?.billing.taxInclusive ?? true;
  const paymentLabels = appSettings?.paymentLabels ?? {
    cash: t('paymentForm.defaultLabelCash'),
    card: t('paymentForm.defaultLabelCard'),
    rappi: t('paymentForm.defaultLabelRappi'),
  };
  const isRappiTab = Boolean(tab.rappiOrderId);

  const [step, setStep] = useState<'pay' | 'receipt'>('pay');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [tenderedAmount, setTenderedAmount] = useState(0);
  const [cardReference, setCardReference] = useState('');
  const [cardChargeOverride, setCardChargeOverride] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountScope, setDiscountScope] = useState<DiscountScope>('all');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountExpanded, setDiscountExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitRows, dispatchSplitRows] = useReducer(splitRowsReducer, []);
  const idempotencyKeyRef = useRef<string | null>(null);

  /* Reset state when the tab being viewed changes */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setStep('pay');
    setErrorMessage(null);
    setReceiptData(null);
    if (isRappiTab && enabledMethods.rappi) {
      setMethod('rappi');
    } else if (enabledMethods.cash) {
      setMethod('cash');
    } else if (enabledMethods.bbvaCard) {
      setMethod('card');
    } else {
      setMethod('cash');
    }
    setTenderedAmount(0);
    setCardReference('');
    setCardChargeOverride(null);
    setCustomerName('');
    setCustomerPhone('');
    setDiscountScope('all');
    setDiscountType('percent');
    setDiscountValue(0);
    setDiscountExpanded(false);
    setIsSplitMode(false);
    idempotencyKeyRef.current = null;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tab.id, isRappiTab, enabledMethods.cash, enabledMethods.bbvaCard, enabledMethods.rappi]);

  /* Split-mode rows: seed 2 default rows on toggle-ON, clear on toggle-OFF */
  useEffect(() => {
    if (isSplitMode) {
      const defaultMethod: SplitPayMethod = enabledMethods.cash
        ? 'cash'
        : enabledMethods.bbvaCard
          ? 'card'
          : 'rappi';
      dispatchSplitRows({
        type: 'RESET_ROWS',
        rows: [makeDefaultSplitRow(defaultMethod), makeDefaultSplitRow(defaultMethod)],
      });
    } else {
      dispatchSplitRows({ type: 'RESET_ROWS', rows: [] });
    }
  }, [isSplitMode, enabledMethods.cash, enabledMethods.bbvaCard]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (method === 'cash' && !enabledMethods.cash) {
      setMethod(enabledMethods.bbvaCard ? 'card' : enabledMethods.rappi ? 'rappi' : 'cash');
      return;
    }
    if (method === 'card' && !enabledMethods.bbvaCard) {
      setMethod(enabledMethods.cash ? 'cash' : enabledMethods.rappi ? 'rappi' : 'card');
      return;
    }
    if (method === 'rappi' && !enabledMethods.rappi) {
      setMethod(enabledMethods.cash ? 'cash' : enabledMethods.bbvaCard ? 'card' : 'rappi');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [enabledMethods.bbvaCard, enabledMethods.cash, enabledMethods.rappi, method]);

  const itemsSubtotal = useMemo(
    () => tab.items.reduce((sum, item) => sum + calculateLineTotal(item), 0),
    [tab.items]
  );
  // Pool tables were removed (Phase 1 strip-rebrand) — pool charges are
  // permanently 0. DiscountScopeSchema's pool_only/consumptions_only members
  // were retired in Phase 27 (PROMO-05); 'all' is the only scope now.
  const poolChargesTotal = 0;
  const baseSubtotal = itemsSubtotal + poolChargesTotal;
  const discountBase = useMemo(
    () => getDiscountBase(itemsSubtotal, poolChargesTotal, discountScope),
    [itemsSubtotal, discountScope]
  );
  const discountAmount = useMemo(
    () => calculateDiscountAmount(discountBase, discountType, discountValue),
    [discountBase, discountType, discountValue]
  );
  const afterDiscount = Math.round((baseSubtotal - discountAmount) * 100) / 100;
  const taxAmount = useMemo(() => {
    if (method === 'rappi') return 0;
    if (taxInclusive) {
      // Inclusive mode (TAX-02): afterDiscount already IS the total — decompose
      // subtotal by division first, then derive tax by subtraction (never
      // re-derive independently — avoids a 1-cent drift vs. the total).
      const decomposedSubtotal = Math.round((afterDiscount / (1 + taxRatePercent / 100)) * 100) / 100;
      return Math.round((afterDiscount - decomposedSubtotal) * 100) / 100;
    }
    // Exclusive mode (TAX-03): unchanged additive math.
    return Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
  }, [afterDiscount, method, taxRatePercent, taxInclusive]);
  const subtotalWithTax = taxInclusive
    ? afterDiscount
    : Math.round((afterDiscount + taxAmount) * 100) / 100;
  const runningTotal = subtotalWithTax;
  const changeDue = Math.max(0, Math.round((tenderedAmount - runningTotal) * 100) / 100);
  const effectiveCardAmount = cardChargeOverride ?? runningTotal;

  const canSubmitCash = tenderedAmount >= runningTotal && runningTotal > 0;
  const canSubmitCard = effectiveCardAmount > 0;
  const canSubmitBankTransfer = customerPhone.trim().length > 0;
  const canSubmit =
    staffId.length > 0 &&
    (method !== 'cash' || canSubmitCash) &&
    (method !== 'card' || canSubmitCard) &&
    (method !== 'bank_transfer' || canSubmitBankTransfer);

  const splitRowsSum = useMemo(
    () => Math.round(splitRows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    [splitRows]
  );
  const splitRemaining = Math.round((subtotalWithTax - splitRowsSum) * 100) / 100;

  const perRowMethodValid = (row: SplitRow): boolean => {
    if (row.method === 'cash') {
      return row.tenderedAmount >= row.amount;
    }
    return true;
  };

  const canSubmitSplit =
    staffId.length > 0 &&
    isSplitMode &&
    splitRows.length >= 2 &&
    splitRows.length <= 4 &&
    splitRows.every(r => r.amount > 0) &&
    Math.abs(splitRowsSum - subtotalWithTax) <= 0.01 &&
    splitRows.every(perRowMethodValid);

  const groupedItems = useMemo(() => groupOrderItems(tab.items), [tab.items]);

  const runPayment = async (): Promise<
    Result<{ receiptData: ReceiptData }, { message: string; code?: AppErrorCode }>
  > => {
    if (!staffId) {
      return { ok: false, error: { message: t('paymentForm.notSignedIn') } };
    }

    const discountInfoArg =
      discountAmount > 0
        ? { scope: discountScope, type: discountType, value: discountValue, amount: discountAmount }
        : undefined;

    if (method === 'cash') {
      // eslint-disable-next-line i18next/no-literal-string -- idempotency-key prefix, not UI copy
      idempotencyKeyRef.current ??= generateIdempotencyKey('payment_cash');
      const r = await processors.processCashPayment(
        tab.id,
        subtotalWithTax,
        tenderedAmount,
        discountInfoArg,
        tab.version,
        idempotencyKeyRef.current
      );
      // r.error.code is typed as bare `string` by PaymentProcessors' legacy
      // AppError contract (supabase-contracts.ts), but the direct-sale
      // processors (useCheckoutSale.ts) actually populate it from the real
      // AppErrorCode union in result.ts — cast to check the offline code.
      if (!r.ok)
        return {
          ok: false,
          error: { message: r.error.message, code: r.error.code as AppErrorCode },
        };
      return { ok: true, data: { receiptData: r.data.receiptData } };
    }

    if (method === 'card') {
      // eslint-disable-next-line i18next/no-literal-string -- idempotency-key prefix, not UI copy
      idempotencyKeyRef.current ??= generateIdempotencyKey('payment_card');
      const ref = cardReference.trim();
      const chargeAmount = cardChargeOverride ?? subtotalWithTax;
      const r = await processors.processCardPayment(
        tab.id,
        chargeAmount,
        ref.length > 0 ? ref : undefined,
        discountInfoArg,
        tab.version,
        idempotencyKeyRef.current
      );
      if (!r.ok)
        return {
          ok: false,
          error: { message: r.error.message, code: r.error.code as AppErrorCode },
        };
      return { ok: true, data: { receiptData: r.data.receiptData } };
    }

    if (method === 'bank_transfer') {
      if (!processors.processBankTransferPayment) {
        return { ok: false, error: { message: t('featOrders:checkoutSale.bankTransferUnavailable') } };
      }
      // eslint-disable-next-line i18next/no-literal-string -- idempotency-key prefix, not UI copy
      idempotencyKeyRef.current ??= generateIdempotencyKey('payment_bank_transfer');
      const name = customerName.trim() || t('featOrders:checkoutSale.defaultCustomerName');
      const r = await processors.processBankTransferPayment(
        tab.id,
        subtotalWithTax,
        name,
        customerPhone.trim(),
        discountInfoArg,
        tab.version,
        idempotencyKeyRef.current
      );
      if (!r.ok)
        return {
          ok: false,
          error: { message: r.error.message, code: r.error.code as AppErrorCode },
        };
      return { ok: true, data: { receiptData: r.data.receiptData } };
    }

    if (!tab.rappiOrderId) {
      return { ok: false, error: { message: t('paymentForm.missingRappiOrderId') } };
    }
    const r = await processors.processRappiPayment(
      tab.id,
      afterDiscount,
      tab.rappiOrderId,
      discountInfoArg,
      tab.version
    );
    if (!r.ok)
      return { ok: false, error: { message: r.error.message, code: r.error.code as AppErrorCode } };
    return { ok: true, data: { receiptData: r.data.receiptData } };
  };

  const handlePrimary = async () => {
    setErrorMessage(null);
    setIsProcessing(true);
    const result = await runPayment();
    setIsProcessing(false);

    if (!result.ok) {
      if (result.error.code === 'NETWORK_OFFLINE') {
        setShowOfflineDialog(true);
        return;
      }
      setErrorMessage(result.error.message);
      logger.warn('payment.failed', { tabId: tab.id, code: 'client' });
      return;
    }

    logger.info('payment.succeeded', { tabId: tab.id, paymentMethod: method });
    idempotencyKeyRef.current = null;
    const receipt = result.data.receiptData;
    setReceiptData(receipt);
    setStep('receipt');
    onPaymentSuccess();

    void (async () => {
      const logHardwareFail = (event: string, code: AppErrorCode, message: string) => {
        logger.warn(event, { tabId: tab.id, message });
        toast.error(t(printJobErrorCopyKey(code)));
      };
      try {
        if (method === 'cash') {
          const drawer = await openCashDrawer(settings.printerName);
          if (!drawer.ok) logHardwareFail('cash_drawer.failed', drawer.error.code, drawer.error.message);
          const printed = await printReceipt(receipt, settings);
          if (!printed.ok)
            logHardwareFail('printer.receipt.failed', printed.error.code, printed.error.message);
        } else {
          const printed = await printReceipt(receipt, settings);
          if (!printed.ok)
            logHardwareFail('printer.receipt.failed', printed.error.code, printed.error.message);
        }
      } catch (e) {
        logger.warn('printer.post_payment.exception', { tabId: tab.id, raw: String(e) });
        toast.error(t('paymentForm.printOrDrawerFailed'));
      }
    })();
  };

  const handleSplitPrimary = async () => {
    setErrorMessage(null);
    setIsProcessing(true);

    const discountInfoArg =
      discountAmount > 0
        ? { scope: discountScope, type: discountType, value: discountValue, amount: discountAmount }
        : undefined;

    const legs: SplitPaymentLegInput[] = splitRows.map(row => ({
      method: row.method,
      amount: row.amount,
      ...(row.method === 'cash' ? { tenderedAmount: row.tenderedAmount } : {}),
      ...(row.method === 'card' && row.cardReference.trim().length > 0
        ? { referenceNumber: row.cardReference.trim() }
        : {}),
      ...(row.method === 'rappi' && tab.rappiOrderId ? { rappiOrderId: tab.rappiOrderId } : {}),
    }));

    // eslint-disable-next-line i18next/no-literal-string -- idempotency-key prefix, not UI copy
    idempotencyKeyRef.current ??= generateIdempotencyKey('payment_split');
    const result = await processors.processSplitPayment(
      tab.id,
      legs,
      subtotalWithTax,
      discountInfoArg,
      idempotencyKeyRef.current
    );
    setIsProcessing(false);

    if (!result.ok) {
      if (result.error.code === 'NETWORK_OFFLINE') {
        setShowOfflineDialog(true);
        return;
      }
      setErrorMessage(t('paymentForm.splitPaymentFailed'));
      logger.warn('payment.split_failed', { tabId: tab.id, code: 'client' });
      return;
    }

    // Direct-sale split payments now return one sale-level receipt (basket
    // composed once, every leg in receiptData.tenders); the untouched
    // generic tab split-payment path (D-09) still returns one receipt per
    // leg — either way, the first receipt is what's shown on screen, and
    // every receipt in the array is still printed below.
    const firstReceipt = result.data.receipts[0];
    if (!firstReceipt) {
      setErrorMessage(t('paymentForm.splitPaymentFailed'));
      logger.warn('payment.split_failed', { tabId: tab.id, code: 'client' });
      return;
    }

    logger.info('payment.split_succeeded', { tabId: tab.id, legCount: legs.length });
    idempotencyKeyRef.current = null;
    setReceiptData(firstReceipt);
    setStep('receipt');
    onPaymentSuccess();

    void (async () => {
      const logHardwareFail = (event: string, code: AppErrorCode, message: string) => {
        logger.warn(event, { tabId: tab.id, message });
        toast.error(t(printJobErrorCopyKey(code)));
      };
      try {
        if (legs.some(l => l.method === 'cash')) {
          const drawer = await openCashDrawer(settings.printerName);
          if (!drawer.ok) logHardwareFail('cash_drawer.failed', drawer.error.code, drawer.error.message);
        }
        for (const receipt of result.data.receipts) {
          const printed = await printReceipt(receipt, settings);
          if (!printed.ok)
            logHardwareFail('printer.receipt.failed', printed.error.code, printed.error.message);
        }
      } catch (e) {
        logger.warn('printer.post_payment.exception', { tabId: tab.id, raw: String(e) });
        toast.error(t('paymentForm.printOrDrawerFailed'));
      }
    })();
  };

  const primaryLabel = isSplitMode
    ? t('paymentForm.processSplitPayment')
    : method === 'card'
      ? t('paymentForm.confirmCardPayment')
      : method === 'rappi'
        ? t('paymentForm.confirmAndCloseTab')
        : t('paymentForm.processPayment');

  const handleReceiptDone = () => {
    (onDone ?? onClose)?.();
  };

  if (step === 'receipt' && receiptData) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden p-4 sm:px-6">
        {receiptData.paymentMethod === 'bank_transfer' && receiptData.terminalReference && (
          <section
            className="mb-4 space-y-2 rounded-lg border-2 border-[var(--pos-accent)] p-4 text-center"
            data-testid="bank-transfer-reference-code-section"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('featOrders:checkoutSale.referenceCodeHeading')}
            </h3>
            <p
              className="font-mono text-4xl font-bold tracking-widest"
              data-testid="bank-transfer-reference-code"
            >
              {receiptData.terminalReference}
            </p>
            <POSButton
              type="button"
              variant="outline"
              touchSize="default"
              onClick={() => {
                void navigator.clipboard.writeText(receiptData.terminalReference ?? '');
                toast.success(t('featOrders:checkoutSale.codeCopied'));
              }}
            >
              <Copy className="mr-2 size-4" />
              {t('featOrders:checkoutSale.copyCode')}
            </POSButton>
            <p className="text-xs text-muted-foreground">
              {t('featOrders:checkoutSale.referenceCodeInstructions')}
            </p>
          </section>
        )}
        <ReceiptPreview
          receipt={receiptData}
          onDone={() => {
            handleReceiptDone();
          }}
        />
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="flex-1 p-4 sm:px-6">
        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">{tab.customerName}</h3>
              <p className="text-sm text-muted-foreground">
                {t('paymentForm.itemTypesAndTotal', {
                  itemTypeCount: groupedItems.length,
                  plural: groupedItems.length !== 1 ? 's' : '',
                  itemCount: tab.items.reduce((s, i) => s + i.quantity, 0),
                })}
              </p>
            </div>
            <div className="space-y-2">
              {groupedItems.map(item => (
                <div
                  key={`${item.productId}::${item.modifierIds.join(',')}`}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {item.quantity > 1 ? `${String(item.quantity)}× ` : ''}
                      {item.productName}
                    </p>
                  </div>
                  <MoneyDisplay amount={item.lineTotal} size="sm" />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>{t('paymentForm.itemsSubtotal')}</span>
                <MoneyDisplay amount={itemsSubtotal} size="sm" />
              </div>
            </div>
          </section>

          {method !== 'rappi' && (
            <section className="space-y-2 rounded-lg border p-3" data-testid="discount-section">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label htmlFor="discount-toggle" className="text-sm font-semibold">
                    {t('paymentForm.discount')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('paymentForm.discountDescription')}
                  </p>
                </div>
                <Switch
                  id="discount-toggle"
                  checked={discountExpanded}
                  disabled={isProcessing}
                  onCheckedChange={setDiscountExpanded}
                />
              </div>
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                  discountExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-2 pt-2">
                    <div className="flex gap-2">
                      {/* Phase 27 (PROMO-05): pool_only/consumptions_only scopes retired —
                          'all' is DiscountScope's only remaining member, so this is a single
                          fixed button rather than a scope picker. Full retirement (dropping
                          discountScope state entirely) is Plan 27-04. */}
                      <POSButton
                        type="button"
                        touchSize="large"
                        variant="default"
                        disabled={isProcessing}
                        data-testid="discount-scope-all"
                        onClick={() => {
                          setDiscountScope('all');
                        }}
                        className="flex-1 text-xs"
                      >
                        {t('paymentForm.discountScopeAll')}
                      </POSButton>
                    </div>
                    <div className="flex gap-2">
                      {/* eslint-disable-next-line i18next/no-literal-string -- fixed discount-type enum identifiers, not UI copy */}
                      {(['percent', 'fixed'] as const).map(type => (
                        <POSButton
                          key={type}
                          type="button"
                          touchSize="large"
                          variant={discountType === type ? 'default' : 'outline'}
                          disabled={isProcessing}
                          data-testid={`discount-type-${type}`}
                          onClick={() => {
                            setDiscountType(type);
                          }}
                          className="flex-1"
                        >
                          {type === 'percent'
                            ? t('paymentForm.discountTypePercent')
                            : t('paymentForm.discountTypeFixed')}
                        </POSButton>
                      ))}
                    </div>
                    <MoneyInput
                      label={
                        discountType === 'percent'
                          ? t('paymentForm.discountPercentLabel')
                          : t('paymentForm.discountAmountLabel')
                      }
                      value={discountValue}
                      onChange={setDiscountValue}
                      disabled={isProcessing}
                      data-testid="discount-value-input"
                    />
                    {discountAmount > 0 && (
                      <p className="text-sm text-pos-accent" data-testid="discount-applied-label">
                        {t('paymentForm.discountApplied', { amount: formatMoney(discountAmount) })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {method === 'rappi' && (
            <section className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              {t('paymentForm.rappiCollectedNotice')}
            </section>
          )}

          <section className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t('paymentForm.subtotal')}</span>
              <MoneyDisplay amount={baseSubtotal} size="sm" />
            </div>
            {discountAmount > 0 && (
              <>
                <div
                  className="flex items-center justify-between text-sm text-pos-accent"
                  data-testid="discount-row"
                >
                  <span>
                    {t('paymentForm.discountRow', {
                      detail:
                        discountType === 'percent'
                          ? `${String(discountValue)}%`
                          : t('paymentForm.discountRowFixed'),
                    })}
                  </span>
                  <span>
                    -<MoneyDisplay amount={discountAmount} size="sm" />
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>{t('paymentForm.afterDiscount')}</span>
                  <MoneyDisplay amount={afterDiscount} size="sm" />
                </div>
              </>
            )}
            {method !== 'rappi' && (
              <div className="flex items-center justify-between text-sm" data-testid="tax-row">
                <span>{t('paymentForm.taxLabel', { rate: taxRatePercent })}</span>
                <MoneyDisplay amount={taxAmount} size="sm" />
              </div>
            )}
            <div
              className="flex items-center justify-between border-t pt-2 text-lg font-semibold"
              data-testid="total-row"
            >
              <span>{t('paymentForm.total')}</span>
              <MoneyDisplay amount={runningTotal} size="lg" />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="font-medium">{t('paymentForm.paymentMethod')}</h4>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <Label htmlFor="split-mode-toggle" className="text-sm font-semibold">
                  {t('paymentForm.splitPayment')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('paymentForm.splitPaymentDescription')}
                </p>
              </div>
              <Switch
                id="split-mode-toggle"
                checked={isSplitMode}
                disabled={isProcessing}
                onCheckedChange={setIsSplitMode}
              />
            </div>

            {isSplitMode ? (
              <div className="space-y-3">
                {splitRows.map((row, index) => (
                  <div key={row.id} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        {t('paymentForm.paymentNumber', { number: index + 1 })}
                      </span>
                      {splitRows.length > 2 && (
                        <POSButton
                          type="button"
                          variant="ghost"
                          touchSize="xl"
                          focusEmphasis="high"
                          aria-label={`Remove payment ${String(index + 1)}`}
                          disabled={isProcessing}
                          className="px-2 text-destructive"
                          onClick={() => {
                            dispatchSplitRows({ type: 'REMOVE_ROW', rowId: row.id });
                          }}
                        >
                          <Trash2 className="size-4" />
                        </POSButton>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      {enabledMethods.cash && (
                        <POSButton
                          type="button"
                          touchSize="large"
                          variant={row.method === 'cash' ? 'default' : 'outline'}
                          disabled={isProcessing}
                          onClick={() => {
                            dispatchSplitRows({
                              type: 'SET_METHOD',
                              rowId: row.id,
                              method: 'cash',
                            });
                          }}
                        >
                          {paymentLabels.cash}
                        </POSButton>
                      )}
                      {enabledMethods.bbvaCard && (
                        <POSButton
                          type="button"
                          touchSize="large"
                          variant={row.method === 'card' ? 'default' : 'outline'}
                          disabled={isProcessing}
                          onClick={() => {
                            dispatchSplitRows({
                              type: 'SET_METHOD',
                              rowId: row.id,
                              method: 'card',
                            });
                          }}
                        >
                          {paymentLabels.card}
                        </POSButton>
                      )}
                      {isRappiTab && enabledMethods.rappi && (
                        <POSButton
                          type="button"
                          touchSize="large"
                          variant={row.method === 'rappi' ? 'default' : 'outline'}
                          disabled={isProcessing}
                          onClick={() => {
                            dispatchSplitRows({
                              type: 'SET_METHOD',
                              rowId: row.id,
                              method: 'rappi',
                            });
                          }}
                        >
                          {paymentLabels.rappi}
                        </POSButton>
                      )}
                    </div>

                    <MoneyInput
                      label={t('paymentForm.amount')}
                      value={row.amount}
                      onChange={value => {
                        dispatchSplitRows({ type: 'SET_AMOUNT', rowId: row.id, value });
                      }}
                      disabled={isProcessing}
                    />

                    {row.method === 'cash' && (
                      <>
                        <MoneyInput
                          label={t('paymentForm.amountTendered')}
                          value={row.tenderedAmount}
                          onChange={value => {
                            dispatchSplitRows({ type: 'SET_TENDERED', rowId: row.id, value });
                          }}
                          disabled={isProcessing}
                        />
                        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                          <span>{t('paymentForm.changeDue')}</span>
                          <MoneyDisplay
                            amount={Math.max(
                              0,
                              Math.round((row.tenderedAmount - row.amount) * 100) / 100
                            )}
                            size="sm"
                          />
                        </div>
                      </>
                    )}

                    {row.method === 'card' && (
                      <div className="space-y-2">
                        <Label htmlFor={`split-card-ref-${row.id}`}>
                          {t('paymentForm.referenceOptional')}
                        </Label>
                        <Input
                          id={`split-card-ref-${row.id}`}
                          value={row.cardReference}
                          onChange={e => {
                            dispatchSplitRows({
                              type: 'SET_CARD_REF',
                              rowId: row.id,
                              value: e.target.value,
                            });
                          }}
                          placeholder={t('paymentForm.terminalReceiptPlaceholder')}
                          maxLength={64}
                          disabled={isProcessing}
                          autoComplete="off"
                        />
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {t('paymentForm.splitRowCharges', {
                        amount: formatMoney(row.amount),
                      })}
                    </p>
                  </div>
                ))}

                <POSButton
                  type="button"
                  variant="outline"
                  disabled={isProcessing || splitRows.length >= 4}
                  onClick={() => {
                    const defaultMethod: SplitPayMethod = enabledMethods.cash
                      ? 'cash'
                      : enabledMethods.bbvaCard
                        ? 'card'
                        : 'rappi';
                    dispatchSplitRows({ type: 'ADD_ROW', defaultMethod });
                  }}
                >
                  {t('paymentForm.addPaymentMethod')}
                </POSButton>

                <div
                  className={`rounded-lg border p-3 ${
                    splitRemaining === 0 ? 'border-[var(--pos-accent)]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>
                      {splitRemaining > 0
                        ? t('paymentForm.remainingToPay')
                        : splitRemaining === 0
                          ? t('paymentForm.fullyAllocated')
                          : t('paymentForm.overBy', {
                              amount: formatMoney(Math.abs(splitRemaining)),
                            })}
                    </span>
                    {splitRemaining >= 0 && <MoneyDisplay amount={splitRemaining} size="sm" />}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {enabledMethods.cash && (
                  <POSButton
                    type="button"
                    touchSize="xl"
                    variant={method === 'cash' ? 'default' : 'outline'}
                    disabled={isProcessing}
                    data-testid="payment-btn-cash"
                    onClick={() => {
                      setMethod('cash');
                    }}
                  >
                    {paymentLabels.cash}
                  </POSButton>
                )}
                {enabledMethods.bbvaCard && (
                  <POSButton
                    type="button"
                    touchSize="xl"
                    variant={method === 'card' ? 'default' : 'outline'}
                    disabled={isProcessing}
                    data-testid="payment-btn-card"
                    onClick={() => {
                      setMethod('card');
                    }}
                  >
                    {paymentLabels.card}
                  </POSButton>
                )}
                {isRappiTab && enabledMethods.rappi && (
                  <POSButton
                    type="button"
                    touchSize="xl"
                    variant={method === 'rappi' ? 'default' : 'outline'}
                    disabled={isProcessing}
                    data-testid="payment-btn-rappi"
                    onClick={() => {
                      setMethod('rappi');
                    }}
                  >
                    {paymentLabels.rappi}
                  </POSButton>
                )}
                {processors.processBankTransferPayment && (
                  <POSButton
                    type="button"
                    touchSize="xl"
                    variant={method === 'bank_transfer' ? 'default' : 'outline'}
                    disabled={isProcessing}
                    data-testid="payment-btn-bank-transfer"
                    onClick={() => {
                      setMethod('bank_transfer');
                    }}
                  >
                    {t('featOrders:checkoutSale.bankTransferMethodLabel')}
                  </POSButton>
                )}
              </div>
            )}
          </section>

          {!isSplitMode && method === 'cash' && (
            <section className="space-y-3">
              <MoneyInput
                label={t('paymentForm.amountTendered')}
                value={tenderedAmount}
                onChange={setTenderedAmount}
                disabled={isProcessing}
              />
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                <span>{t('paymentForm.changeDue')}</span>
                <MoneyDisplay amount={changeDue} size="sm" />
              </div>
            </section>
          )}

          {!isSplitMode && method === 'card' && (
            <section className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">{t('paymentForm.processOnBbvaTerminal')}</p>
              <MoneyInput
                label={t('paymentForm.chargeAmount')}
                value={effectiveCardAmount}
                onChange={setCardChargeOverride}
                disabled={isProcessing}
              />
              {cardChargeOverride !== null && (
                <POSButton
                  type="button"
                  variant="ghost"
                  touchSize="default"
                  data-testid="card-override-reset"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => {
                    setCardChargeOverride(null);
                  }}
                >
                  {t('paymentForm.resetToComputed', { amount: formatMoney(runningTotal) })}
                </POSButton>
              )}
              <div className="space-y-2">
                <Label htmlFor="card-ref">{t('paymentForm.referenceOptional')}</Label>
                <Input
                  id="card-ref"
                  value={cardReference}
                  onChange={e => {
                    setCardReference(e.target.value);
                  }}
                  placeholder={t('paymentForm.terminalReceiptPlaceholder')}
                  maxLength={64}
                  disabled={isProcessing}
                  autoComplete="off"
                />
              </div>
            </section>
          )}

          {!isSplitMode && method === 'bank_transfer' && (
            <section className="space-y-3 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="bank-transfer-customer-name">
                  {t('featOrders:checkoutSale.customerNameLabel')}
                </Label>
                <Input
                  id="bank-transfer-customer-name"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                  }}
                  placeholder={t('featOrders:checkoutSale.defaultCustomerName')}
                  maxLength={100}
                  disabled={isProcessing}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-transfer-customer-phone">
                  {t('featOrders:checkoutSale.customerPhoneLabel')}
                </Label>
                <Input
                  id="bank-transfer-customer-phone"
                  value={customerPhone}
                  onChange={e => {
                    setCustomerPhone(e.target.value);
                  }}
                  placeholder={t('featOrders:checkoutSale.customerPhonePlaceholder')}
                  maxLength={30}
                  disabled={isProcessing}
                  autoComplete="off"
                  data-testid="bank-transfer-phone-input"
                />
              </div>
            </section>
          )}

          {errorMessage && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
              data-testid="payment-error-alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t px-4 py-3 sm:px-6 sm:py-4">
        <ProtectedAction
          action="close_tab"
          currentRole={currentRole}
          disabled={isProcessing || (isSplitMode ? !canSubmitSplit : !canSubmit)}
        >
          <POSButton
            type="button"
            touchSize="xl"
            focusEmphasis="high"
            disabled={isProcessing || (isSplitMode ? !canSubmitSplit : !canSubmit)}
            className="w-full bg-[var(--pos-accent)] text-black hover:opacity-90"
            onClick={() => {
              if (isSplitMode) {
                void handleSplitPrimary();
              } else {
                void handlePrimary();
              }
            }}
          >
            {isProcessing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {t('paymentForm.processing')}
              </span>
            ) : (
              primaryLabel
            )}
          </POSButton>
        </ProtectedAction>
        {onClose && (
          <POSButton
            type="button"
            touchSize="large"
            variant="outline"
            className="w-full"
            disabled={isProcessing}
            onClick={onClose}
          >
            {t('paymentForm.cancel')}
          </POSButton>
        )}
      </div>
      <ConfirmDialog
        open={showOfflineDialog}
        title={t('paymentForm.offlineTitle')}
        description={t('paymentForm.offlineBody')}
        confirmLabel={tCommon('actions.tryAgain')}
        cancelLabel={tCommon('actions.cancel')}
        onConfirm={() => {
          setShowOfflineDialog(false);
          void (isSplitMode ? handleSplitPrimary() : handlePrimary());
        }}
        onCancel={() => {
          setShowOfflineDialog(false);
        }}
      />
    </>
  );
}
