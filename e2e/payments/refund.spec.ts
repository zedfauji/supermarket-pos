/* eslint-disable */
/**
 * E2E spec: Phase 6 — Refund
 * Tickets: S4-07, S4-11, S4-19
 * Covers:
 *  T1-T4: Complete a paid tab, select 2 items, enter manager PIN, verify refund processed
 *  T5:    REFUND_EXCEEDS_ORIGINAL blocks double-refund of fully-refunded payment
 *  T6:    Refund remaining items with restock=false succeeds (no ledger change)
 *
 * NOTE (autonomous: false): Requires `bar-pos/.env.local` + remote Supabase with
 * migrations 20260427000000–20260427000004 applied. Browser console is tailed via `e2e/fixtures.ts`.
 *
 * Manager PIN: The ManagerPinDialog uses a PINKeypad (button-based, no text input).
 * Tests enter the admin PIN by pressing the numeric keypad buttons. The PIN length
 * must match the ManagerPinDialog's PINKeypad maxLength (default: 6). If the
 * E2E_ADMIN_PIN is shorter than 6 digits, pad with zeros or adjust PINKeypad maxLength.
 */

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { assertStockMovement } from '../helpers/db-assertions';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Seed helper
// ---------------------------------------------------------------------------

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
  productId: string;
  orderItemIds: string[];
}

/**
 * Seed a fully paid tab with `itemCount` order_items at `unitPrice` each.
 * Creates a shift if needed. Sets tab.status = 'paid'. Inserts one payment row.
 * Returns tabId, paymentId, and orderItemIds.
 */
async function seedPaidTab(
  db: ReturnType<typeof getServiceClient>,
  itemCount: number,
  unitPrice: number
): Promise<SeededPaidTab> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  // Reuse open shift or create fresh
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

  // Create tab (start as open to satisfy constraints, then mark paid)
  const { data: tab } = await db
    .from('tabs')
    .insert({
      customer_name: 'E2E Refund Test',
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  // Create order
  const { data: order } = await db
    .from('orders')
    .insert({
      tab_id: tab.id,
      staff_id: profile.id,
      status: 'pending',
    })
    .select('id')
    .single();

  // Get any active product
  const { data: product } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  // Insert order_items
  const inserts = Array.from({ length: itemCount }, () => ({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: unitPrice,
    modifier_price_delta: 0,
  }));
  const { data: items } = await db.from('order_items').insert(inserts).select('id');
  const orderItemIds = (items as { id: string }[]).map(i => i.id);

  // Mark tab as paid
  // NOTE: tabs has a `bump_version_on_update` trigger (STALE_VERSION guard) requiring
  // every UPDATE to advance `version` by exactly +1 — freshly inserted tabs start at
  // version 1, so this update must set version: 2 or the trigger silently rejects it.
  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPaidTab: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  // Insert payment row (idempotency_key + processed_by are NOT NULL in schema)
  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: itemCount * unitPrice,
      tip_amount: 0,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-seed-refund-${(tab.id as string).slice(0, 8)}-${String(itemCount)}-${String(unitPrice)}`,
    })
    .select('id')
    .single();
  if (payErr) {
    throw new Error(`seedPaidTab: payments insert failed: ${payErr.message}`);
  }
  if (!payment) {
    throw new Error('seedPaidTab: payment row missing after insert');
  }

  return {
    tabId: tab.id as string,
    paymentId: payment.id as string,
    productId: product.id as string,
    orderItemIds,
  };
}

/**
 * Enter a PIN on the PINKeypad (button-based, aria-label "Key N").
 * Uses keyboard events which the PINKeypad globalListener handles.
 */
async function enterManagerPin(page: import('@playwright/test').Page, pin: string): Promise<void> {
  // The PINKeypad has keyboard support — type each digit
  // Also click the buttons as a fallback for environments without focus
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    const btn = page.getByRole('button', { name: label });
    // If button is visible (PINKeypad rendered), click it; otherwise rely on keyboard
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await btn.click();
    } else {
      // Fallback: keyboard type (PINKeypad handles window keydown)
      await page.keyboard.type(ch);
    }
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  requireIntegrationEnv();
  await resetTestState();
  await openCaja(570);
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  await logout(page).catch(() => undefined);
});

// ============================================================================
// T1-T4: Process refund on 2 items with manager PIN
// ============================================================================
test('T1-T4: process refund on 2 items with manager PIN (admin PIN from env)', async ({ page }) => {
  test.info().annotations.push({ type: 'requirement', description: 'S4-07, S4-11, S4-19' });

  const db = getServiceClient();
  const { paymentId, productId } = await seedPaidTab(db, 5, 10.0);
  const adminPin = process.env['E2E_ADMIN_PIN'] ?? '0000';

  await loginAs(page, 'admin');
  await gotoAuthed(page, '/payments');

  // T2: Refund button visible on paid payment row
  const refundBtn = page.getByRole('button', { name: 'Refund' }).first();
  await expect(refundBtn).toBeVisible({ timeout: 20_000 });

  // Open RefundSheet
  await refundBtn.click();
  // Scoped by accessible name — the AI assistant side panel is also role="dialog"
  const refundDialog = page.getByRole('dialog', { name: 'Process refund' });
  await expect(refundDialog).toBeVisible({ timeout: 10_000 });
  await expect(refundDialog.getByText(/process refund/i)).toBeVisible();

  // T3: Select first 2 items (checkboxes not disabled — items not yet refunded)
  // Scoped to refundDialog — the payments list behind the sheet has many rows
  // whose text (e.g. "$20.00") would otherwise cause strict-mode violations.
  // Also scoped to the "Select ... for refund" accessible name — each item row grows
  // an additional "Restock {name}" checkbox once selected, which shifts a plain
  // getByRole('checkbox') index list mid-loop and causes miscounted selections.
  const checkboxes = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i });
  await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
  const totalCheckboxes = await checkboxes.count();
  expect(totalCheckboxes).toBeGreaterThanOrEqual(2);

  // Select items that are not disabled
  let selectedCount = 0;
  for (let i = 0; i < totalCheckboxes && selectedCount < 2; i++) {
    const cb = checkboxes.nth(i);
    if (!(await cb.isDisabled())) {
      await cb.check();
      selectedCount++;
    }
  }
  expect(selectedCount).toBe(2);

  // D-10: check "Restock" for the selected items — restock defaults to false
  // (RefundSheet.tsx: `restock: override?.restock ?? false`), so without this
  // the restore_inventory_on_refund_item trigger's `IF NOT NEW.restock THEN
  // RETURN NEW` guard skips writing a stock_movements row entirely, and the
  // assertStockMovement call below would find nothing. Checking restock here
  // is what makes T1-T4 the positive (restock=true) counterpart to T6's
  // explicit restock=false case.
  const restockCheckboxes = refundDialog.getByRole('checkbox', { name: /^restock /i });
  const restockCount = await restockCheckboxes.count();
  for (let i = 0; i < restockCount; i++) {
    const rc = restockCheckboxes.nth(i);
    if (!(await rc.isChecked())) {
      await rc.check();
    }
  }

  // Set reason via the Select dropdown (SelectTrigger id="refund-reason")
  const reasonTrigger = refundDialog.locator('#refund-reason');
  await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
  await reasonTrigger.click();
  // Select "Wrong order" option
  const wrongOrderOption = page.getByRole('option', { name: /wrong.*order/i });
  await expect(wrongOrderOption).toBeVisible({ timeout: 5_000 });
  await wrongOrderOption.click();

  // Verify refund total shows ~$20 (2 items × $10)
  await expect(refundDialog.getByText(/20/)).toBeVisible({ timeout: 5_000 });

  // T4: Click "Request approval" → ManagerPinDialog opens
  await page.getByRole('button', { name: /request approval/i }).click();

  // Manager PIN dialog (AlertDialog)
  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await expect(pinDialog.getByText(/manager access required/i)).toBeVisible();

  // Enter admin PIN using PINKeypad buttons
  await enterManagerPin(page, adminPin);

  // After correct PIN: ManagerPinDialog closes and refund is submitted
  // Success toast: "Refund of $20.00 processed."
  await expect(page.getByText(/refund.*processed/i)).toBeVisible({ timeout: 15_000 });

  // T5 (DB assertions): refunds row exists
  const { data: refund } = await db
    .from('refunds')
    .select('id, amount')
    .eq('original_payment_id', paymentId)
    .single();
  expect(refund).not.toBeNull();
  expect(Number((refund as { amount: number }).amount)).toBeCloseTo(20.0, 1);

  // T5: negative payment row
  const { data: negPmt } = await db
    .from('payments')
    .select('amount, is_refund')
    .eq('refund_id', (refund as { id: string }).id)
    .single();
  expect(negPmt).not.toBeNull();
  expect((negPmt as { is_refund: boolean }).is_refund).toBe(true);
  expect(Number((negPmt as { amount: number }).amount)).toBeCloseTo(-20.0, 1);
  await assertStockMovement(productId, 1, 'refund');

  // T5: Refunds tab on PaymentsPage shows new row
  const refundsTab = page.getByRole('tab', { name: /refunds/i });
  if ((await refundsTab.count()) > 0) {
    await refundsTab.click();
    // Refund row should be visible — look for the payment ID prefix or amount
    await expect(
      page
        .getByText(paymentId.slice(0, 8))
        .or(page.getByText(/\-.*20/))
        .first()
    ).toBeVisible({ timeout: 8_000 });
  }
});

// ============================================================================
// T5: REFUND_EXCEEDS_ORIGINAL blocks double-refund
// ============================================================================
test('T5: REFUND_EXCEEDS_ORIGINAL blocks double-refund of fully-refunded payment', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'requirement', description: 'S4-07, S4-19' });

  const db = getServiceClient();
  const { tabId, paymentId, orderItemIds } = await seedPaidTab(db, 2, 10.0);

  // Pre-seed a full refund via DB (bypasses RPC so we can test the guard)
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();
  const { data: existingRefund } = await db
    .from('refunds')
    .insert({
      original_payment_id: paymentId,
      reason: 'wrong_order',
      amount: 20.0,
      created_by: profile.id,
    })
    .select('id')
    .single();
  await db.from('refund_items').insert(
    orderItemIds.map((id: string) => ({
      refund_id: existingRefund.id,
      order_item_id: id,
      qty: 1,
      amount: 10.0,
      restock: false,
    }))
  );
  await db.from('payments').insert({
    tab_id: tabId,
    amount: -20.0,
    tip_amount: 0,
    method: 'cash',
    is_refund: true,
    refund_id: existingRefund.id,
  });

  await loginAs(page, 'admin');
  await gotoAuthed(page, '/payments');

  // `RefundButton` (PaymentPane.tsx) returns null once a payment's refunded total
  // reaches its amount — the app's UI-level guard for a fully-refunded payment is
  // to never render a "Refund" affordance at all, not to render a disabled control.
  // The server-side guard (REFUND_EXCEEDS_ORIGINAL) is covered directly at the RPC
  // layer by src/features/process-refund/process-refund-rpc.integration.test.ts —
  // this E2E test verifies the UI-level guard the RPC test can't see.
  //
  // Scoped to this test's specific seeded payment row via data-testid — the
  // payments list accumulates real rows across the whole E2E run, many of
  // which ARE legitimately refundable, so a page-wide Refund-button count
  // assertion is not meaningful here.
  const paymentsRegion = page.getByText(/recent payments/i).locator('..');
  await expect(paymentsRegion).toBeVisible({ timeout: 20_000 });

  const seededRow = page.getByTestId(`payment-row-${paymentId}`);
  await expect(seededRow).toBeVisible({ timeout: 10_000 });
  await expect(seededRow.getByRole('button', { name: 'Refund' })).toHaveCount(0);
});

// ============================================================================
// T6: Refund remaining items with restock=false — no ledger change
// ============================================================================
test('T6: refund remaining 3 items with restock=false — no stock ledger change', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'requirement', description: 'S4-07, S4-19' });

  const db = getServiceClient();
  const { tabId, paymentId, productId, orderItemIds } = await seedPaidTab(db, 5, 10.0);
  const adminPin = process.env['E2E_ADMIN_PIN'] ?? '0000';

  const { count: stockMovementsBefore, error: stockMovementBeforeError } = await db
    .from('stock_movements')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('reason', 'refund');
  if (stockMovementBeforeError) throw stockMovementBeforeError;

  // Pre-seed partial refund: items[0] and [1] already refunded
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();
  const { data: partialRefund } = await db
    .from('refunds')
    .insert({
      original_payment_id: paymentId,
      reason: 'wrong_order',
      amount: 20.0,
      created_by: profile.id,
    })
    .select('id')
    .single();
  await db.from('refund_items').insert([
    {
      refund_id: partialRefund.id,
      order_item_id: orderItemIds[0],
      qty: 1,
      amount: 10.0,
      restock: false,
    },
    {
      refund_id: partialRefund.id,
      order_item_id: orderItemIds[1],
      qty: 1,
      amount: 10.0,
      restock: false,
    },
  ]);
  await db.from('payments').insert({
    tab_id: tabId,
    amount: -20.0,
    tip_amount: 0,
    method: 'cash',
    is_refund: true,
    refund_id: partialRefund.id,
  });

  await loginAs(page, 'admin');
  await gotoAuthed(page, '/payments');

  const refundBtn = page.getByRole('button', { name: 'Refund' }).first();
  await expect(refundBtn).toBeVisible({ timeout: 20_000 });
  await refundBtn.click();

  // Scoped by accessible name — the AI assistant side panel is also role="dialog"
  const refundDialog = page.getByRole('dialog', { name: 'Process refund' });
  await expect(refundDialog).toBeVisible({ timeout: 10_000 });

  // Wait for items to load
  // Scoped to refundDialog and to the item-select accessible name — avoids strict-mode
  // collisions with the payments list and index-shift from per-item "Restock" checkboxes.
  const checkboxes = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i });
  await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });

  // Select all non-disabled checkboxes (items[0] and [1] should be disabled/fully refunded)
  const total = await checkboxes.count();
  let selectedCount = 0;
  for (let i = 0; i < total; i++) {
    const cb = checkboxes.nth(i);
    if (!(await cb.isDisabled())) {
      await cb.check();
      selectedCount++;
    }
  }
  // Should have selected 3 remaining items
  expect(selectedCount).toBe(3);

  // Set restock=false: uncheck any "Restock" checkboxes that are checked
  const restockCheckboxes = refundDialog.getByRole('checkbox', { name: /^restock /i });
  const restockCount = await restockCheckboxes.count();
  for (let i = 0; i < restockCount; i++) {
    const rc = restockCheckboxes.nth(i);
    if (await rc.isChecked()) {
      await rc.uncheck();
    }
  }

  // Set reason
  const reasonTrigger = refundDialog.locator('#refund-reason');
  await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
  await reasonTrigger.click();
  await page.getByRole('option', { name: /wrong.*order/i }).click();

  // Request approval → PIN
  await page.getByRole('button', { name: /request approval/i }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await enterManagerPin(page, adminPin);

  // Success toast: "Refund of $30.00 processed."
  await expect(page.getByText(/refund.*processed/i)).toBeVisible({ timeout: 15_000 });

  // DB: second refund row for remaining 3 items ($30)
  const { data: secondRefund } = await db
    .from('refunds')
    .select('id, amount')
    .eq('original_payment_id', paymentId)
    .neq('id', partialRefund.id)
    .single();
  expect(secondRefund).not.toBeNull();
  expect(Number((secondRefund as { amount: number }).amount)).toBeCloseTo(30.0, 1);

  // restock=false: verify refund_items all have restock=false
  const { data: refundItems } = await db
    .from('refund_items')
    .select('restock')
    .eq('refund_id', (secondRefund as { id: string }).id);
  expect((refundItems as { restock: boolean }[]).every(i => i.restock === false)).toBe(true);

  const { count: stockMovementsAfter, error: stockMovementAfterError } = await db
    .from('stock_movements')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('reason', 'refund');
  if (stockMovementAfterError) throw stockMovementAfterError;
  expect(stockMovementsAfter).toBe(stockMovementsBefore);
});

// ============================================================================
// Generic fallback: unmapped process_refund RPC failure renders a translated
// toast, never raw Postgres text (ROADMAP SC3 / SALE-05)
// ============================================================================
test('generic: unmapped process_refund RPC failure shows translated toast, not raw Postgres text', async ({
  page,
}) => {
  test.info().annotations.push({ type: 'requirement', description: 'SALE-05' });

  const db = getServiceClient();
  await seedPaidTab(db, 1, 10.0);
  const adminPin = process.env['E2E_ADMIN_PIN'] ?? '0000';

  await loginAs(page, 'admin');
  await gotoAuthed(page, '/payments');

  const refundBtn = page.getByRole('button', { name: 'Refund' }).first();
  await expect(refundBtn).toBeVisible({ timeout: 20_000 });
  await refundBtn.click();

  const refundDialog = page.getByRole('dialog', { name: 'Process refund' });
  await expect(refundDialog).toBeVisible({ timeout: 10_000 });

  const checkbox = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i }).first();
  await expect(checkbox).toBeVisible({ timeout: 10_000 });
  await checkbox.check();

  const reasonTrigger = refundDialog.locator('#refund-reason');
  await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
  await reasonTrigger.click();
  await page.getByRole('option', { name: /wrong.*order/i }).click();

  // Force the process_refund RPC to fail with an unmapped, Postgres-shaped
  // error — it matches none of REFUND_EXCEEDS_ORIGINAL/ITEM_NOT_IN_ORIGINAL_ORDER/
  // AUTH_FORBIDDEN, so useProcessRefund's SUPABASE_ERROR fallback branch fires.
  // page.route() interception (not a DB-level delete) directly exercises the
  // client-side code path this task fixes without depending on RefundButton's
  // own UI-level guard for fully-refunded payments.
  await page.route('**/rest/v1/rpc/process_refund*', async route => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'relation "e2e_forced_unmapped_error" does not exist',
        code: '42P01',
        details: null,
        hint: null,
      }),
    });
  });

  await page.getByRole('button', { name: /request approval/i }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await enterManagerPin(page, adminPin);

  // Translated generic fallback (featOrders:processRefund.genericError,
  // en-US since E2E accounts are seeded with locale: 'en-US' — see
  // scripts/setup-dev-users.ts) — never the raw Postgres text forced above.
  await expect(
    page.getByText('Could not process refund. Check your connection and try again.')
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/relation|column|syntax error|does not exist/i)).toHaveCount(0);
});
