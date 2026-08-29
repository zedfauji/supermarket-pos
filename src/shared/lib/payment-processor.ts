/**
 * Client-side payment orchestration — calls Supabase Edge `process-payment`
 * with idempotency keys (secrets stay server-side).
 */

import type { DiscountScope, DiscountType } from '@shared/lib/domain';
import { generateIdempotencyKey } from '@shared/lib/domain-helpers';
import {
  callProcessPayment,
  callProcessSplitPayment,
  type ProcessPaymentSuccess,
  type ProcessSplitPaymentSuccess,
} from '@shared/lib/edge-function-contracts';
import { ok, type Result } from '@shared/lib/result';
import type { AppError } from '@shared/lib/supabase-contracts';

export interface DiscountInfo {
  scope: DiscountScope;
  type: DiscountType;
  value: number;
  amount: number;
}

export type CashPaymentResult = {
  paymentId: string;
  changeAmount: number;
  receiptData: ProcessPaymentSuccess['receiptData'];
};

export type CardPaymentResult = {
  paymentId: string;
  receiptData: ProcessPaymentSuccess['receiptData'];
};

export type RappiPaymentResult = {
  paymentId: string;
  receiptData: ProcessPaymentSuccess['receiptData'];
};

export async function processCashPayment(
  tabId: string,
  amount: number,
  tenderedAmount: number,
  discountInfo?: DiscountInfo,
  expectedVersion?: number,
  idempotencyKeyOverride?: string
): Promise<Result<CashPaymentResult, AppError>> {
  const idempotencyKey = idempotencyKeyOverride ?? generateIdempotencyKey('payment_cash');
  const result = await callProcessPayment({
    tabId,
    amount,
    method: 'cash',
    idempotencyKey,
    tenderedAmount,
    discountScope: discountInfo?.scope,
    discountType: discountInfo?.type,
    discountValue: discountInfo?.value,
    discountAmount: discountInfo?.amount,
    expectedVersion,
  });

  if (!result.ok) {
    return result;
  }

  const change = result.data.receiptData.changeAmount ?? Math.max(0, tenderedAmount - amount);
  return ok({
    paymentId: result.data.paymentId,
    changeAmount: Math.round(change * 100) / 100,
    receiptData: result.data.receiptData,
  });
}

export async function processCardPayment(
  tabId: string,
  amount: number,
  referenceNumber?: string,
  discountInfo?: DiscountInfo,
  expectedVersion?: number,
  idempotencyKeyOverride?: string
): Promise<Result<CardPaymentResult, AppError>> {
  const idempotencyKey = idempotencyKeyOverride ?? generateIdempotencyKey('payment_card');
  const trimmed = referenceNumber?.trim();
  const result = await callProcessPayment({
    tabId,
    amount,
    method: 'card',
    idempotencyKey,
    referenceNumber: trimmed && trimmed.length > 0 ? trimmed : undefined,
    discountScope: discountInfo?.scope,
    discountType: discountInfo?.type,
    discountValue: discountInfo?.value,
    discountAmount: discountInfo?.amount,
    expectedVersion,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    paymentId: result.data.paymentId,
    receiptData: result.data.receiptData,
  });
}

export type SplitPaymentLegInput = {
  method: 'cash' | 'card' | 'rappi';
  amount: number;
  tenderedAmount?: number;
  referenceNumber?: string;
  rappiOrderId?: string;
};

export type SplitPaymentResult = {
  paymentGroupId: string;
  paymentIds: string[];
  receipts: ProcessSplitPaymentSuccess['receipts'];
};

export async function processSplitPayment(
  tabId: string,
  legs: SplitPaymentLegInput[],
  expectedTotal: number,
  discountInfo?: DiscountInfo,
  idempotencyKeyOverride?: string
): Promise<Result<SplitPaymentResult, AppError>> {
  const idempotencyKey = idempotencyKeyOverride ?? generateIdempotencyKey('payment_split');
  const result = await callProcessSplitPayment({
    tabId,
    legs,
    expectedTotal,
    idempotencyKey,
    discountScope: discountInfo?.scope,
    discountType: discountInfo?.type,
    discountValue: discountInfo?.value,
    discountAmount: discountInfo?.amount,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    paymentGroupId: result.data.paymentGroupId,
    paymentIds: result.data.paymentIds,
    receipts: result.data.receipts,
  });
}

export async function processRappiPayment(
  tabId: string,
  amount: number,
  rappiOrderId: string,
  discountInfo?: DiscountInfo,
  expectedVersion?: number
): Promise<Result<RappiPaymentResult, AppError>> {
  const idempotencyKey = generateIdempotencyKey('payment_rappi');
  const result = await callProcessPayment({
    tabId,
    amount,
    method: 'rappi',
    idempotencyKey,
    rappiOrderId: rappiOrderId.trim(),
    discountScope: discountInfo?.scope,
    discountType: discountInfo?.type,
    discountValue: discountInfo?.value,
    discountAmount: discountInfo?.amount,
    expectedVersion,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    paymentId: result.data.paymentId,
    receiptData: result.data.receiptData,
  });
}
