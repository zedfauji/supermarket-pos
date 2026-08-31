/* eslint-disable */
/**
 * E2E spec: Phase 23 (Bank Transfer Payment Tracking) — Plan 04
 * Tickets: BTP-03, BTP-04, BTP-05, BTP-07, BTP-09
 *
 * This is the phase's core tracer proof: Test 1 drives checkout mark-pending
 * (real /pos UI) through manager confirm (real /payments -> Bank Transfers
 * tab UI) in one continuous flow — no service-role shortcut on either end.
 * Tests 2-4 seed their own pending transfer directly via the service-role
 * client (mirroring e2e/payments/refund.spec.ts's seedPaidTab pattern) since
 * they only need to prove the reconciliation-tab half of the flow.
 *
 * Manager PIN: ManagerPinDialog uses a PINKeypad (button-based, no text
 * input) — `enterPin` from e2e/helpers/auth.ts clicks the numeric keypad.
 */

import { expect, test } from '../fixtures';
import { enterPin, gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { createRoleScopedClient } from '../helpers/rls-clients';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Luhn helpers (local, verbatim port of src/shared/lib/bank-transfer-code.ts
// — e2e/ has no cross-package import into src/, see e2e/helpers conventions)
// ---------------------------------------------------------------------------

function luhnCheckDigit(payloadDigits: string): number {
  const digits = payloadDigits.split('').reverse();
  let sum = 0;
  digits.forEach((digit, i) => {
    let d = Number(digit);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  });
  return (10 - (sum % 10)) % 10;
}

function generateValidCode(): string {
  let payload = '';
  for (let i = 0; i < 6; i++) payload += String(Math.floor(Math.random() * 10));
  return payload + String(luhnCheckDigit(payload));
}

/** Mutates a single non-check digit — 100% guaranteed Luhn-invalid per
 * bank-transfer-code.test.ts's "catches 100% of single-digit transcription
 * errors" property. */
function mutateOneDigit(code: string): string {
  const first = Number(code[0]);
  const mutated = (first + 1) % 10;
  return String(mutated) + code.slice(1);
}

// ---------------------------------------------------------------------------
// Seed helper — pending bank transfer, no UI involved (Tests 2-4 only)
// ---------------------------------------------------------------------------

interface SeededPendingTransfer {
  paymentId: string;
  referenceCode: string;
  customerName: string;
  customerPhone: string;
}

async function seedPendingTransfer(
  db: ReturnType<typeof getServiceClient>,
  amount: number
): Promise<SeededPendingTransfer> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  let shiftId: string;
  const { data: existingShift } = await db
    .from('shifts')
    .select('id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift } = await db
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    shiftId = newShift.id as string;
  }

  const stamp = Date.now();
  const customerName = `E2E Bank Transfer ${stamp}`;
  const customerPhone = '5511122233';

  const { data: tab } = await db
    .from('tabs')
    .insert({
      customer_name: customerName,
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPendingTransfer: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  const referenceCode = generateValidCode();
  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount,
      method: 'bank_transfer',
      is_refund: false,
      processed_by: profile.id,
      reference_number: referenceCode,
      idempotency_key: `e2e-seed-transfer-${(tab.id as string).slice(0, 8)}-${stamp}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) {
    throw new Error(`seedPendingTransfer: payments insert failed: ${payErr?.message}`);
  }

  const { error: btErr } = await db.from('bank_transfers').insert({
    payment_id: payment.id,
    customer_phone: customerPhone,
    created_by: profile.id,
  });
  if (btErr) {
    throw new Error(`seedPendingTransfer: bank_transfers insert failed: ${btErr.message}`);
  }

  return { paymentId: payment.id as string, referenceCode, customerName, customerPhone };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  requireIntegrationEnv();
  await resetTestState();
  await openCaja(600);
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  await logout(page).catch(() => undefined);
});

// ============================================================================
// Test 1 (tracer, BTP-03/BTP-07): checkout mark-pending (real UI) -> manager
// confirm (real UI), end to end
// ============================================================================
test('Test 1 (tracer): cashier checkout mark-pending -> manager confirm, end-to-end via real UI', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'requirement', description: 'BTP-03, BTP-07' });

  await loginAs(page, 'cashier');

  await page.getByRole('button', { name: /checkout/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
  await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
  await page
    .getByRole('button', { name: /^process payment$/i })
    .first()
    .click();

  await page.getByTestId('payment-btn-bank-transfer').click();
  await page.getByLabel(/customer name/i).fill('Tracer Customer');
  await page.getByTestId('bank-transfer-phone-input').fill('5519998888');
  await page
    .getByRole('button', { name: /^process payment$/i })
    .last()
    .click();

  await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
  const referenceCode = (
    await page.getByTestId('bank-transfer-reference-code').innerText()
  ).trim();
  expect(referenceCode).toMatch(/^\d{7}$/);
  await page.getByRole('button', { name: /done/i }).click();

  await logout(page);

  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
  await loginAs(page, 'manager');
  await gotoAuthed(page, '/payments');
  await page.getByRole('tab', { name: /bank transfers/i }).click();

  const pendingRow = page.getByRole('row', { name: new RegExp(referenceCode) });
  await expect(pendingRow).toBeVisible({ timeout: 15_000 });
  await pendingRow.getByRole('button', { name: 'Confirm' }).click();

  const confirmDialog = page.getByRole('alertdialog');
  await expect(confirmDialog).toBeVisible({ timeout: 8_000 });
  await page.locator('#confirm-transfer-code').fill(referenceCode);
  await confirmDialog.getByRole('button', { name: 'Confirm transfer' }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await enterPin(page, managerPin);

  await expect(page.getByText(/bank transfer.*confirmed/i)).toBeVisible({ timeout: 15_000 });

  // Moves off the default pending filter.
  await expect(page.getByRole('row', { name: new RegExp(referenceCode) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmed' }).click();
  await expect(page.getByRole('row', { name: new RegExp(referenceCode) })).toBeVisible({
    timeout: 10_000,
  });

  const db = getServiceClient();
  const { data: payment } = await db
    .from('payments')
    .select('id')
    .eq('reference_number', referenceCode)
    .single();
  const { data: transfer } = await db
    .from('bank_transfers')
    .select('status')
    .eq('payment_id', (payment as { id: string }).id)
    .single();
  expect((transfer as { status: string }).status).toBe('confirmed');

  const { data: auditRow } = await db
    .from('audit_logs')
    .select('id')
    .eq('action', 'payment.transfer_confirmed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(auditRow).not.toBeNull();
});

// ============================================================================
// Test 2 (BTP-04): dispute requires a non-empty reason, then succeeds
// ============================================================================
test('Test 2: dispute blocks an empty reason, then succeeds with a real reason', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'requirement', description: 'BTP-04' });

  const db = getServiceClient();
  const seeded = await seedPendingTransfer(db, 25);
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

  await loginAs(page, 'manager');
  await gotoAuthed(page, '/payments');
  await page.getByRole('tab', { name: /bank transfers/i }).click();

  const row = page.getByRole('row', { name: new RegExp(seeded.referenceCode) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Dispute' }).click();

  const disputeDialog = page.getByRole('alertdialog');
  await expect(disputeDialog).toBeVisible({ timeout: 8_000 });
  const disputeBtn = disputeDialog.getByRole('button', { name: 'Dispute transfer' });

  // Empty reason blocks submission — no RPC call fires.
  await expect(disputeBtn).toBeDisabled();

  const reason = 'Reference code does not match any transfer received in the bank statement.';
  await page.locator('#dispute-transfer-reason').fill(reason);
  await expect(disputeBtn).toBeEnabled();
  await disputeBtn.click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await enterPin(page, managerPin);

  await expect(page.getByText(/bank transfer disputed/i)).toBeVisible({ timeout: 15_000 });

  const { data: transfer } = await db
    .from('bank_transfers')
    .select('status, dispute_reason')
    .eq('payment_id', seeded.paymentId)
    .single();
  expect((transfer as { status: string }).status).toBe('disputed');
  expect((transfer as { dispute_reason: string }).dispute_reason).toBe(reason);

  const { data: auditRow } = await db
    .from('audit_logs')
    .select('id')
    .eq('action', 'payment.transfer_disputed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(auditRow).not.toBeNull();
});

// ============================================================================
// Test 3 (BTP-05): Luhn-invalid code blocks confirm inline, no RPC call fires
// ============================================================================
test('Test 3: Luhn-invalid code blocks confirm inline, no RPC call fires', async ({ page }) => {
  test.info().annotations.push({ type: 'requirement', description: 'BTP-05' });

  const db = getServiceClient();
  const seeded = await seedPendingTransfer(db, 15);

  let rpcCalls = 0;
  await page.route('**/rest/v1/rpc/confirm_transfer_payment*', async route => {
    rpcCalls += 1;
    await route.continue();
  });

  await loginAs(page, 'manager');
  await gotoAuthed(page, '/payments');
  await page.getByRole('tab', { name: /bank transfers/i }).click();

  const row = page.getByRole('row', { name: new RegExp(seeded.referenceCode) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Confirm' }).click();

  const confirmDialog = page.getByRole('alertdialog');
  await expect(confirmDialog).toBeVisible({ timeout: 8_000 });

  const invalidCode = mutateOneDigit(seeded.referenceCode);
  await page.locator('#confirm-transfer-code').fill(invalidCode);

  await expect(confirmDialog.getByText(/isn't valid|no es válido/i)).toBeVisible();
  await expect(confirmDialog.getByRole('button', { name: 'Confirm transfer' })).toBeDisabled();

  expect(rpcCalls).toBe(0);

  const { data: transferAfter } = await db
    .from('bank_transfers')
    .select('status')
    .eq('payment_id', seeded.paymentId)
    .single();
  expect((transferAfter as { status: string }).status).toBe('pending');
});

// ============================================================================
// Test 4 (BTP-09): RBAC denial — UI-level (no buttons) and server-level
// (direct RPC call from a real cashier-signed-in client)
// ============================================================================
test('Test 4: cashier is denied both UI-level (no buttons) and server-level (RPC)', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'requirement', description: 'BTP-09' });

  const db = getServiceClient();
  const seeded = await seedPendingTransfer(db, 12);

  await loginAs(page, 'cashier');
  await gotoAuthed(page, '/payments');
  await page.getByRole('tab', { name: /bank transfers/i }).click();

  const row = page.getByRole('row', { name: new RegExp(seeded.referenceCode) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Dispute' })).toHaveCount(0);

  const cashierClient = await createRoleScopedClient('cashier', 'bank-transfer-rbac');
  try {
    const { data, error } = await cashierClient.client.rpc('confirm_transfer_payment', {
      p_payment_id: seeded.paymentId,
      p_entered_code: seeded.referenceCode,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/AUTH_FORBIDDEN/i);
  } finally {
    await cashierClient.cleanup();
  }

  const { data: transferAfter } = await db
    .from('bank_transfers')
    .select('status')
    .eq('payment_id', seeded.paymentId)
    .single();
  expect((transferAfter as { status: string }).status).toBe('pending');
});
