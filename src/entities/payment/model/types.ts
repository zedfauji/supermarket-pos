import { z } from 'zod';

// =====================================================
// PAYMENT SCHEMA
// =====================================================

export const PaymentSchema = z.object({
  id: z.uuid(),
  tabId: z.uuid(),
  // Refund rows (isRefund: true) store a negative amount — the app's actual
  // ledger convention (see process_refund RPC), so this must not be `.min(0)`.
  amount: z.number(),
  method: z.enum(['cash', 'card', 'rappi']),
  squarePaymentId: z.string().nullable(),
  squareReceiptUrl: z.url().nullable(),
  tenderedAmount: z.number().min(0).nullable().optional(),
  referenceNumber: z.string().max(64).nullable().optional(),
  idempotencyKey: z.string().min(1).max(255).nullable().optional(),
  processedAt: z.date(),
  processedBy: z.uuid(),
  isRefund: z.boolean().optional(),
  refundId: z.uuid().nullable().optional(),
  // Phase 23: 'reopened_void' when the parent tab was reopened and this payment
  // reversed. Default keeps pre-migration rows (no `status` column yet) parsing cleanly.
  status: z.enum(['completed', 'reopened_void']).default('completed'),
});

export type Payment = z.infer<typeof PaymentSchema>;

export const CreatePaymentSchema = PaymentSchema.omit({
  id: true,
  processedAt: true,
});

export type CreatePayment = z.infer<typeof CreatePaymentSchema>;

