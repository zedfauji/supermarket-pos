import { describe, expect, it } from 'vitest';
import type { ReceiptSettings } from '@shared/lib/domain';
import { ReceiptSettingsSchema } from '@shared/lib/domain';
import type { ReceiptData } from './edge-function-contracts';
import i18n from './i18n';
import type { PreChequeData } from './receipt-format';
import { buildPreChequeText, buildThermalReceiptText } from './receipt-format';

/** Every field has a Zod `.default()`, so an empty/partial object always parses to a full, valid ReceiptSettings. */
function defaultReceiptSettings(overrides?: Partial<ReceiptSettings>): ReceiptSettings {
  return ReceiptSettingsSchema.parse({ ...overrides });
}

function baseReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    receiptNumber: 'R1',
    tabId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    customerName: 'Ana',
    cashierName: 'Luis',
    barName: 'Bola 8',
    barAddress: 'Av. Revolución 123, CDMX',
    items: [{ name: 'Cerveza', quantity: 2, unitPrice: 45, lineTotal: 90 }],
    subtotal: 90,
    tipAmount: 13.5,
    total: 103.5,
    paymentMethod: 'cash',
    processedAt: new Date('2026-04-17T18:00:00.000Z'),
    squareReceiptUrl: null,
    tenderedAmount: 200,
    changeAmount: 96.5,
    ...overrides,
  };
}

describe('buildThermalReceiptText', () => {
  it('centers bar name and uses Bar fallback when barName empty', () => {
    const firstLine = buildThermalReceiptText(baseReceipt({ barName: '' }), 'es-MX', defaultReceiptSettings()).split(
      '\n'
    )[0];
    expect(firstLine?.trim()).toBe('Bar');
    expect(firstLine?.length).toBe(32);
  });

  it('wraps long barAddress in 32-char chunks', () => {
    const addr = 'A'.repeat(70);
    const text = buildThermalReceiptText(baseReceipt({ barAddress: addr }), 'es-MX', defaultReceiptSettings());
    expect(text).toContain('A'.repeat(32));
    expect(text).toContain('A'.repeat(6));
  });

  it('labels card as BBVA terminal', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        paymentMethod: 'card',
        tenderedAmount: null,
        changeAmount: null,
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Tarjeta (Terminal BBVA)');
  });

  it('labels Rappi payment', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        paymentMethod: 'rappi',
        tipAmount: 0,
        total: 90,
        tenderedAmount: null,
        changeAmount: null,
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Rappi');
  });

  it('shows tendered and change for cash when tenderedAmount set', () => {
    const text = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings());
    expect(text).toContain('Entregado');
    expect(text).toContain('Cambio');
    expect(text).toContain('$200.00');
    expect(text).toContain('$96.50');
  });

  it('shows terminal reference when set', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        paymentMethod: 'card',
        tenderedAmount: null,
        changeAmount: null,
        terminalReference: 'BBVA-99',
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Ref');
    expect(text).toContain('BBVA-99');
  });

  // ---------------------------------------------------------------------
  // Split sale-level receipt (Phase 2 gap closure, CHK-04 / CR-03)
  // ---------------------------------------------------------------------

  it('renders one line per tender leg for a split sale, without repeating the single-payment line', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        subtotal: 100,
        tipAmount: 0,
        total: 100,
        tenderedAmount: null,
        changeAmount: null,
        tenders: [
          { method: 'cash', amount: 50, tipAmount: 0, tenderedAmount: 50, changeAmount: 0 },
          { method: 'card', amount: 50, tipAmount: 0, terminalReference: 'BBVA-42' },
        ],
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Efectivo');
    expect(text).toContain('Tarjeta (Terminal BBVA)');
    expect(text).toContain('BBVA-42');
    // Basket/subtotal/total are still composed once, not once per leg.
    expect(text.match(/Subtotal/g)).toHaveLength(1);
    expect(text.match(/Total/g)).toHaveLength(1);
  });

  it('falls back to the single-payment line when only one tender leg is present', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        tenders: [{ method: 'cash', amount: 90, tipAmount: 13.5, tenderedAmount: 200, changeAmount: 96.5 }],
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Pago');
    expect(text).toContain('Efectivo');
  });

  it('accepts processedAt as ISO string', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        processedAt: '2026-01-15T12:30:00.000Z' as unknown as Date,
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Fecha');
  });

  it('truncates long item name with tilde on left column', () => {
    const longName = 'X'.repeat(40);
    const text = buildThermalReceiptText(
      baseReceipt({
        items: [{ name: longName, quantity: 1, unitPrice: 1, lineTotal: 1 }],
        subtotal: 1,
        tipAmount: 0,
        total: 1,
        tenderedAmount: 5,
        changeAmount: 4,
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('~');
  });

  it('shows kilograms instead of a unit quantity for weighted receipt lines', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        items: [{ name: 'Jamón', quantity: 1, unitPrice: 37.5, lineTotal: 37.5, weightGrams: 375 }],
      }),
      'es-MX',
      defaultReceiptSettings()
    );

    expect(text).toContain('0.375kg');
    expect(text).not.toContain('1× Jamón');
  });

  it('includes receipt number footer', () => {
    const text = buildThermalReceiptText(baseReceipt({ receiptNumber: 'ABCD12' }), 'es-MX', defaultReceiptSettings());
    expect(text).toContain('#ABCD12');
  });

  // ---------------------------------------------------------------------
  // Locale-awareness (21-05, D-06)
  // ---------------------------------------------------------------------

  it('es-MX output uses real Spanish labels (Impeccable critique i18n fix)', () => {
    const text = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings());
    expect(text).toContain('Fecha');
    expect(text).toContain('Cajero');
    expect(text).toContain('Cliente');
    expect(text).toContain('Subtotal');
    expect(text).toContain('Propina');
    expect(text).toContain('Total');
    expect(text).toContain('Pago');
    expect(text).toContain('Entregado');
    expect(text).toContain('Cambio');
  });

  it('en-US output uses the same English labels as es-MX (thermal receipt was already English)', () => {
    const text = buildThermalReceiptText(baseReceipt(), 'en-US', defaultReceiptSettings());
    expect(text).toContain('Date');
    expect(text).toContain('Cashier');
    expect(text).toContain('Customer');
    expect(text).toContain('Subtotal');
  });

  it('28-02: building with en-US while the live i18n language is es-MX still yields the en-US symbol (no MX$ prefix)', async () => {
    await i18n.changeLanguage('es-MX');
    try {
      const text = buildThermalReceiptText(baseReceipt(), 'en-US', defaultReceiptSettings());
      expect(text).not.toContain('MX$');
      expect(text).toContain('$200.00');
    } finally {
      await i18n.changeLanguage('es-MX');
    }
  });

  // ---------------------------------------------------------------------
  // Category grouping + modifier lines (Phase 25, D-01/D-05)
  // ---------------------------------------------------------------------

  it('renders both category headers and indented modifier lines, all within 32 UTF-8 bytes', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        items: [
          {
            name: 'Nachos',
            quantity: 1,
            unitPrice: 80,
            lineTotal: 80,
            categoryId: 'cat-food',
            categoryName: 'Food',
            modifierNames: ['Extra cheese'],
          },
          {
            name: 'Cerveza',
            quantity: 2,
            unitPrice: 45,
            lineTotal: 90,
            categoryId: 'cat-drinks',
            categoryName: 'Drinks',
            modifierNames: [],
          },
        ],
        subtotal: 170,
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    expect(text).toContain('Food');
    expect(text).toContain('Drinks');
    expect(text).toContain('  + Extra cheese');
    const maxByteWidth = Math.max(
      ...text.split('\n').map(l => new TextEncoder().encode(l).length)
    );
    expect(maxByteWidth).toBeLessThanOrEqual(32);
  });

  it('single-category items produce no category header line (SC-3 degenerate case)', () => {
    const text = buildThermalReceiptText(
      baseReceipt({
        items: [
          {
            name: 'Nachos',
            quantity: 1,
            unitPrice: 80,
            lineTotal: 80,
            categoryId: 'cat-food',
            categoryName: 'Food',
            modifierNames: [],
          },
        ],
        subtotal: 80,
      }),
      'es-MX',
      defaultReceiptSettings()
    );
    const hasHeaderLine = text.split('\n').some(l => l.trim() === 'Food');
    expect(hasHeaderLine).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Settings-aware formatting (RCPD-01, Phase 15 Plan 01 Task 1)
  // ---------------------------------------------------------------------

  it('settings.paperWidthChars=40 produces a divider() of exactly 40 UTF-8 bytes, not 32', () => {
    const text = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings({ paperWidthChars: 40 }));
    const dividerLine = text.split('\n').find(l => l.startsWith('-'));
    expect(dividerLine).toBeDefined();
    expect(new TextEncoder().encode(dividerLine ?? '').length).toBe(40);
  });

  it('settings.showCashierName toggles the cashier line', () => {
    const withCashier = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings({ showCashierName: true }));
    expect(withCashier).toContain('Luis');
    const withoutCashier = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings({ showCashierName: false }));
    expect(withoutCashier).not.toContain('Cajero');
    expect(withoutCashier).not.toContain('Luis');
  });

  it('settings.showCustomerName toggles the customer line', () => {
    const withCustomer = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings({ showCustomerName: true }));
    expect(withCustomer).toContain('Ana');
    const withoutCustomer = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings({ showCustomerName: false }));
    expect(withoutCustomer).not.toContain('Cliente');
    expect(withoutCustomer).not.toContain('Ana');
  });

  it('settings.showReceiptNumber toggles the receipt-number footer line', () => {
    const withNumber = buildThermalReceiptText(
      baseReceipt({ receiptNumber: 'ABCD12' }),
      'es-MX',
      defaultReceiptSettings({ showReceiptNumber: true })
    );
    expect(withNumber).toContain('#ABCD12');
    const withoutNumber = buildThermalReceiptText(
      baseReceipt({ receiptNumber: 'ABCD12' }),
      'es-MX',
      defaultReceiptSettings({ showReceiptNumber: false })
    );
    expect(withoutNumber).not.toContain('#ABCD12');
  });

  it('settings.headerLine2, when non-empty, renders as one centered line directly under the store-name header line', () => {
    const text = buildThermalReceiptText(
      baseReceipt({ barAddress: '' }),
      'es-MX',
      defaultReceiptSettings({ headerLine2: 'Gracias por su compra' })
    );
    const lines = text.split('\n');
    expect(lines[0]?.trim()).toBe('Bola 8');
    expect(lines[1]?.trim()).toBe('Gracias por su compra');
  });

  it('settings.headerLine2 empty (schema default) emits no extra header line', () => {
    const text = buildThermalReceiptText(
      baseReceipt({ barAddress: '' }),
      'es-MX',
      defaultReceiptSettings({ headerLine2: '' })
    );
    expect(text).not.toContain('Gracias por su compra');
  });

  // ---------------------------------------------------------------------
  // footerText multi-line wrap + sanitize (RCPD-01, Phase 15 Plan 01 Task 2)
  // ---------------------------------------------------------------------

  it('footerText of ~100 chars wraps across multiple padRight-padded lines, never truncated to one line', () => {
    const footer = 'F'.repeat(100);
    const text = buildThermalReceiptText(
      baseReceipt(),
      'es-MX',
      defaultReceiptSettings({ footerText: footer })
    );
    // Full text preserved across lines (never truncated via a single centerLine() call).
    expect(text).toContain('F'.repeat(32));
    const footerLines = text.split('\n').filter(l => /^F+ *$/.test(l));
    const rejoined = footerLines.map(l => l.trimEnd()).join('');
    expect(rejoined).toBe(footer);
    expect(footerLines.length).toBeGreaterThan(1);
  });

  it('footerText containing control characters has them stripped before rendering', () => {
    const footer = 'Gracias\x00\x01 por su compra';
    const text = buildThermalReceiptText(
      baseReceipt(),
      'es-MX',
      defaultReceiptSettings({ footerText: footer })
    );
    expect(text).toContain('Gracias por su compra');
    // eslint-disable-next-line no-control-regex -- asserting control bytes are absent (T-15-03)
    expect(text).not.toMatch(/\x00|\x01/);
  });

  it('footerText with accented characters wraps without dropping bytes mid-chunk (WR-01)', () => {
    const footer = 'á'.repeat(40);
    const text = buildThermalReceiptText(
      baseReceipt(),
      'es-MX',
      defaultReceiptSettings({ footerText: footer })
    );
    const footerLines = text.split('\n').filter((l) => l.includes('á'));
    const rejoined = footerLines.map((l) => l.trimEnd()).join('');
    expect(rejoined).toBe(footer);
  });

  it('footerText with a typed line break renders as two separate lines, not merged (WR-02)', () => {
    const footer = 'Gracias por su visita\nRegresa pronto';
    const text = buildThermalReceiptText(
      baseReceipt(),
      'es-MX',
      defaultReceiptSettings({ footerText: footer })
    );
    expect(text).toContain('Gracias por su visita');
    expect(text).toContain('Regresa pronto');
    expect(text).not.toContain('visitaRegresa');
  });

  it('headerLine2 containing control characters has them stripped before rendering', () => {
    const text = buildThermalReceiptText(
      baseReceipt({ barAddress: '' }),
      'es-MX',
      defaultReceiptSettings({ headerLine2: 'Hola\x00\x01 Mundo' })
    );
    expect(text).toContain('Hola Mundo');
    // eslint-disable-next-line no-control-regex -- asserting control bytes are absent (T-15-03)
    expect(text).not.toMatch(/\x00|\x01/);
  });

  it('empty footerText (schema default) emits no divider/footer lines, same total line count as receipt without footerText', () => {
    const withoutFooter = buildThermalReceiptText(
      baseReceipt(),
      'es-MX',
      defaultReceiptSettings({ footerText: '' })
    );
    const withFooterUnset = buildThermalReceiptText(baseReceipt(), 'es-MX', defaultReceiptSettings());
    expect(withoutFooter.split('\n').length).toBe(withFooterUnset.split('\n').length);
  });
});

// ============================================================================
// buildPreChequeText
// ============================================================================

function basePreCheque(overrides: Partial<PreChequeData> = {}): PreChequeData {
  return {
    barName: 'Bola 8',
    tableLabel: 'Mesa 5',
    customerName: 'Juan',
    cashierName: 'Maria',
    happyHourActive: false,
    items: [
      {
        name: 'Cerveza',
        quantity: 2,
        lineTotal: 90,
        orderedAt: new Date('2026-04-17T18:00:00Z'),
        modifierNames: [],
        notes: null,
        categoryId: null,
        categoryName: null,
      },
    ],
    poolCharge: null,
    subtotal: 90,
    generatedAt: new Date('2026-04-17T20:00:00Z'),
    ...overrides,
  };
}

describe('buildPreChequeText', () => {
  it('header contains PRE-CUENTA', () => {
    const text = buildPreChequeText(basePreCheque(), 'es-MX');
    expect(text).toContain('PRE-CUENTA');
  });

  it('footer contains PENDIENTE DE PAGO', () => {
    const text = buildPreChequeText(basePreCheque(), 'es-MX');
    expect(text).toContain('PENDIENTE DE PAGO');
  });

  it('does not include Billar line when poolCharge is null', () => {
    const text = buildPreChequeText(basePreCheque({ poolCharge: null }), 'es-MX');
    expect(text).not.toContain('Billar');
  });

  it('includes Billar line when poolCharge is set', () => {
    const text = buildPreChequeText(
      basePreCheque({
        poolCharge: {
          tableLabel: 'Mesa 5',
          billedMinutes: 30,
          ratePerHour: 60,
          amount: 30,
        },
        subtotal: 120,
      }),
      'es-MX'
    );
    expect(text).toContain('Billar');
    expect(text).toContain('30m');
  });

  it('28-02: pool-rate line renders the rate through formatMoneyIn (two-decimal, locale-symbol) instead of a hand-built currency string', () => {
    const text = buildPreChequeText(
      basePreCheque({
        poolCharge: {
          tableLabel: 'Mesa 5',
          billedMinutes: 30,
          ratePerHour: 60,
          amount: 30,
        },
        subtotal: 120,
      }),
      'es-MX'
    );
    expect(text).toContain('MX$60.00/h');
  });

  it('subtotal includes pool amount when poolCharge present', () => {
    const text = buildPreChequeText(
      basePreCheque({
        poolCharge: {
          tableLabel: 'Mesa 5',
          billedMinutes: 30,
          ratePerHour: 60,
          amount: 30,
        },
        subtotal: 120,
      }),
      'es-MX'
    );
    // subtotal line should show 120.00
    expect(text).toContain('$120.00');
  });

  it('handles empty items array without crashing and still renders header/footer', () => {
    const text = buildPreChequeText(basePreCheque({ items: [], subtotal: 0 }), 'es-MX');
    expect(text).toContain('PRE-CUENTA');
    expect(text).toContain('PENDIENTE DE PAGO');
  });

  it('all output lines are at most 32 characters', () => {
    const text = buildPreChequeText(
      basePreCheque({
        barName: 'A very long bar name that might overflow the line',
        cashierName: 'A very long cashier name',
        customerName: 'A very long customer name',
        items: [
          {
            name: 'X'.repeat(40),
            quantity: 10,
            lineTotal: 999.99,
            orderedAt: new Date(),
            modifierNames: [],
            notes: null,
            categoryId: null,
            categoryName: null,
          },
        ],
      }),
      'es-MX'
    );
    const lines = text.split('\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it('happyHourActive true → output contains HORA FELIZ', () => {
    const text = buildPreChequeText(basePreCheque({ happyHourActive: true }), 'es-MX');
    expect(text).toContain('HORA FELIZ');
  });

  it('WR-02 regression: multi-byte ★ happy-hour line is padded to exactly 32 UTF-8 bytes, not 32 UTF-16 code units', () => {
    const text = buildPreChequeText(basePreCheque({ happyHourActive: true }), 'es-MX');
    const happyHourLine = text.split('\n').find(l => l.includes('HORA FELIZ'));
    expect(happyHourLine).toBeDefined();
    expect(new TextEncoder().encode(happyHourLine ?? '').length).toBe(32);
  });

  it('happyHourActive false → output does NOT contain HORA FELIZ', () => {
    const text = buildPreChequeText(basePreCheque({ happyHourActive: false }), 'es-MX');
    expect(text).not.toContain('HORA FELIZ');
  });

  it('uses Bar fallback when barName is empty', () => {
    const text = buildPreChequeText(basePreCheque({ barName: '' }), 'es-MX');
    expect(text).toContain('Bar');
  });

  it('renders item name and quantity in output', () => {
    const text = buildPreChequeText(
      basePreCheque({
        items: [
          {
            name: 'Tequila',
            quantity: 3,
            lineTotal: 150,
            orderedAt: new Date(),
            modifierNames: [],
            notes: null,
            categoryId: null,
            categoryName: null,
          },
        ],
      }),
      'es-MX'
    );
    expect(text).toContain('Tequila');
    expect(text).toContain('3');
  });

  // ---------------------------------------------------------------------
  // Locale-awareness (21-05, D-06)
  // ---------------------------------------------------------------------

  it('en-US pre-cheque renders English labels (PRE-CHEQUE/Date/Cashier)', () => {
    const text = buildPreChequeText(basePreCheque(), 'en-US');
    expect(text).toContain('PRE-CHEQUE');
    expect(text).toContain('Date');
    expect(text).toContain('Cashier');
    expect(text).not.toContain('Fecha');
    expect(text).not.toContain('Cajero');
  });

  it('es-MX pre-cheque keeps the current Spanish labels (CUENTA PREVIA/Fecha/Cajero)', () => {
    const text = buildPreChequeText(basePreCheque(), 'es-MX');
    expect(text).toContain('CUENTA PREVIA');
    expect(text).toContain('Fecha');
    expect(text).toContain('Cajero');
  });
});
