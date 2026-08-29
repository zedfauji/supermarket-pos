import { describe, expect, it } from 'vitest';
import {
  type ReceiptData,
  AgentProxyRequestSchema,
  ProcessPaymentRequestSchema,
  ReceiptDataSchema,
  SendReceiptEmailRequestSchema,
} from './edge-function-contracts';

const tabId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function baseValidRequest() {
  return {
    tabId,
    amount: 10,
    method: 'cash' as const,
    idempotencyKey: 'payment_cash_abc',
    tenderedAmount: 20,
  };
}

function validReceiptData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    receiptNumber: 'RCPT1234',
    tabId,
    customerName: 'Guest',
    cashierName: 'Staff',
    barName: 'Test Bar',
    barAddress: 'Calle 1',
    items: [{ name: 'Beer', quantity: 1, unitPrice: 10, lineTotal: 10 }],
    subtotal: 10,
    total: 10,
    paymentMethod: 'cash',
    processedAt: new Date('2026-04-17T12:00:00.000Z'),
    squareReceiptUrl: null,
    tenderedAmount: 20,
    changeAmount: 10,
    ...overrides,
  };
}

// Keep the reference so TypeScript doesn't complain about unused import
void validReceiptData;

describe('ReceiptDataSchema — Sprint 2 discount fields', () => {
  it('accepts receipt with discountAmount: null', () => {
    const r = ReceiptDataSchema.safeParse({
      ...validReceiptData(),
      discountAmount: null,
    });
    expect(r.success).toBe(true);
  });

  it('accepts receipt without discount fields', () => {
    const r = ReceiptDataSchema.safeParse(validReceiptData());
    expect(r.success).toBe(true);
  });
});

describe('AgentProxyRequestSchema', () => {
  it('accepts a minimal valid body with tools/system omitted', () => {
    const r = AgentProxyRequestSchema.safeParse({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts the same shape plus tools and system', () => {
    const r = AgentProxyRequestSchema.safeParse({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are a helpful assistant.',
      tools: [{ name: 'get_menu', description: 'Get menu', input_schema: {} }],
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a body missing messages', () => {
    const r = AgentProxyRequestSchema.safeParse({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
    });
    expect(r.success).toBe(false);
  });

  it('rejects max_tokens: 0', () => {
    const r = AgentProxyRequestSchema.safeParse({
      model: 'claude-sonnet-4-6',
      max_tokens: 0,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a negative max_tokens', () => {
    const r = AgentProxyRequestSchema.safeParse({
      model: 'claude-sonnet-4-6',
      max_tokens: -1,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('ProcessPaymentRequestSchema', () => {
  it('accepts valid cash with tenderedAmount', () => {
    const r = ProcessPaymentRequestSchema.safeParse(baseValidRequest());
    expect(r.success).toBe(true);
  });

  it('accepts card without tenderedAmount', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      method: 'card',
      tenderedAmount: undefined,
      referenceNumber: 'REF123',
    });
    expect(r.success).toBe(true);
  });

  it('accepts rappi with non-empty rappiOrderId', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      method: 'rappi',
      tenderedAmount: undefined,
      rappiOrderId: 'R-99',
    });
    expect(r.success).toBe(true);
  });

  it('rejects cash without tenderedAmount', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      tenderedAmount: undefined,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some(i => i.path.includes('tenderedAmount'))).toBe(true);
    }
  });

  it('rejects non-cash with tenderedAmount', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      method: 'card',
      tenderedAmount: 50,
    });
    expect(r.success).toBe(false);
  });

  it('rejects rappi with missing rappiOrderId', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      method: 'rappi',
      tenderedAmount: undefined,
      rappiOrderId: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('rejects rappi with whitespace-only rappiOrderId', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      method: 'rappi',
      tenderedAmount: undefined,
      rappiOrderId: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      amount: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects amount not multiple of 0.01', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      amount: 10.001,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty idempotencyKey', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      idempotencyKey: '',
    });
    expect(r.success).toBe(false);
  });

  it('rejects idempotencyKey over 255 chars', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      idempotencyKey: 'x'.repeat(256),
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid tabId', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      tabId: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('rejects referenceNumber over 64 chars', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      method: 'card',
      tenderedAmount: undefined,
      referenceNumber: 'r'.repeat(65),
    });
    expect(r.success).toBe(false);
  });

  // Sprint 2 — discount fields
  it('accepts valid request with discount fields', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      discountScope: 'all',
      discountType: 'percent',
      discountValue: 10,
      discountAmount: 1.0,
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid request without discount fields (all optional)', () => {
    const r = ProcessPaymentRequestSchema.safeParse(baseValidRequest());
    expect(r.success).toBe(true);
  });

  // Phase 15 gap-closure (D-02) — expectedVersion
  it('accepts request without expectedVersion (field is optional)', () => {
    const r = ProcessPaymentRequestSchema.safeParse(baseValidRequest());
    expect(r.success).toBe(true);
  });

  it('accepts expectedVersion: 0 and retains it in parsed output', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      expectedVersion: 0,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.expectedVersion).toBe(0);
    }
  });

  it('accepts expectedVersion: 7 and retains it in parsed output', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      expectedVersion: 7,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.expectedVersion).toBe(7);
    }
  });

  it('rejects negative expectedVersion', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      expectedVersion: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer expectedVersion', () => {
    const r = ProcessPaymentRequestSchema.safeParse({
      ...baseValidRequest(),
      expectedVersion: 1.5,
    });
    expect(r.success).toBe(false);
  });
});

// TODO: Move callProcessPayment invocation tests to e2e/05-payments.spec.ts
// These require the Deno Edge Runtime (npx supabase functions serve) to be running.
describe.skip('callProcessPayment — requires edge runtime', () => {
  it.todo('move to e2e/05-payments.spec.ts');
});

describe('SendReceiptEmailRequestSchema', () => {
  it('accepts valid email and plain text', () => {
    const r = SendReceiptEmailRequestSchema.safeParse({
      email: '  a@b.co  ',
      receiptPlainText: 'Receipt\nLine',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('a@b.co');
    }
  });

  it('rejects invalid email', () => {
    const r = SendReceiptEmailRequestSchema.safeParse({
      email: 'not-email',
      receiptPlainText: 'x',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty receiptPlainText', () => {
    const r = SendReceiptEmailRequestSchema.safeParse({
      email: 'a@b.co',
      receiptPlainText: '',
    });
    expect(r.success).toBe(false);
  });

  it('rejects receiptPlainText over 50_000 chars', () => {
    const r = SendReceiptEmailRequestSchema.safeParse({
      email: 'a@b.co',
      receiptPlainText: 'x'.repeat(50_001),
    });
    expect(r.success).toBe(false);
  });
});

// TODO: Move callSendReceiptEmail invocation tests to e2e/08-settings-receipt.spec.ts
// These require the Deno Edge Runtime (npx supabase functions serve) to be running.
describe.skip('callSendReceiptEmail — requires edge runtime', () => {
  it.todo('move to e2e/08-settings-receipt.spec.ts');
});
