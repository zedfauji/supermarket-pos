/**
 * E2E: Payment Pane — /payments
 *
 * Tests the dedicated cashier station for processing open-tab payments.
 * Covers navigation paths, tab listing, PIN gates, cash payment completion, and item grouping.
 *
 * Dependencies tested in production:
 *   - src/widgets/PaymentPane/ui/PaymentPane.tsx
 *   - src/widgets/PaymentPane/ui/TabPaymentList.tsx
 *   - src/widgets/PaymentPane/ui/TabPaymentCard.tsx
 *   - src/features/manager-pin-gate/ui/ManagerPinDialog.tsx
 *   - src/widgets/PaymentModal/ui/PaymentForm.tsx
 *   - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    await page.getByRole('button', { name: label }).click();
  }
}

/** Navigate to /payments from the Home dashboard big-box grid. */
async function goToPaymentsViaHome(page: Page): Promise<void> {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Payments' }).click();
  await expect(page).toHaveURL(/\/payments/, { timeout: 15_000 });
}

/**
 * Create a tab with one item via the service client (bypasses UI, much faster).
 * Returns the tab id.
 */
async function ensureOpenShift(
  admin: ReturnType<typeof getServiceClient>
): Promise<{ id: string; staff_id: string }> {
  const { data: existing } = await admin
    .from('shifts')
    .select('id, staff_id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as { id: string; staff_id: string };

  // No open shift — clock in the manager profile
  const { data: mgr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();
  if (!mgr) throw new Error('ensureOpenShift: no manager profile found');

  const { data: shift, error } = await admin
    .from('shifts')
    .insert({ staff_id: mgr.id, clock_in: new Date().toISOString() })
    .select('id, staff_id')
    .single();
  if (error || !shift)
    throw new Error(`ensureOpenShift: failed to create shift — ${error?.message ?? 'no row'}`);
  return shift as { id: string; staff_id: string };
}

async function seedOpenTab(customerName: string): Promise<string> {
  const admin = getServiceClient();

  // Resolve shift id for the manager (create one if none is open)
  const shift = await ensureOpenShift(admin);

  // Resolve caja session
  const { data: caja } = await admin
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();

  if (!caja) throw new Error('seedOpenTab: no open caja session — run openCaja first');

  // Insert tab
  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: customerName,
      staff_id: shift.staff_id,
      shift_id: shift.id,
      caja_session_id: caja.id,
      status: 'open',
    })
    .select('id')
    .single();

  if (tabErr || !tab) throw new Error(`seedOpenTab failed: ${tabErr?.message ?? 'no row'}`);

  // Add one item from the seeded Indian grocery catalog.
  const { data: product } = await admin
    .from('products')
    .select('id, base_price')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .maybeSingle();

  if (product) {
    const { data: order } = await admin
      .from('orders')
      .insert({
        tab_id: tab.id,
        staff_id: shift.staff_id,
        status: 'served',
      })
      .select('id')
      .single();

    if (order) {
      await admin.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        quantity: 1,
        unit_price: product.base_price,
        modifier_price_delta: 0,
      });
    }
  }

  return tab.id as string;
}

/** Seed a tab with two identical items (same product) to verify grouping. */
async function seedTabWithDuplicateItems(customerName: string): Promise<string> {
  const admin = getServiceClient();

  const shift = await ensureOpenShift(admin);

  const { data: caja } = await admin
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();

  if (!caja) throw new Error('seedTabWithDuplicateItems: no open caja');

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: customerName,
      staff_id: shift.staff_id,
      shift_id: shift.id,
      caja_session_id: caja.id,
      status: 'open',
    })
    .select('id')
    .single();

  if (tabErr || !tab)
    throw new Error(`seedTabWithDuplicateItems failed: ${tabErr?.message ?? 'no row'}`);

  const { data: product } = await admin
    .from('products')
    .select('id, base_price')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .maybeSingle();

  if (product) {
    const { data: order } = await admin
      .from('orders')
      .insert({
        tab_id: tab.id,
        staff_id: shift.staff_id,
        status: 'served',
      })
      .select('id')
      .single();

    if (order) {
      // Two separate order_items rows for the same product
      await admin.from('order_items').insert([
        {
          order_id: order.id,
          product_id: product.id,
          quantity: 1,
          unit_price: product.base_price,
          modifier_price_delta: 0,
        },
        {
          order_id: order.id,
          product_id: product.id,
          quantity: 1,
          unit_price: product.base_price,
          modifier_price_delta: 0,
        },
      ]);
    }
  }

  return tab.id as string;
}

/**
 * Phase 27 Plan 09 (G-27-13): seeds a product + category + inventory row with
 * a caller-chosen base price (so discount math is predictable) and an open
 * tab that references it via `caja_session_id` (required for the tab to
 * appear in the PaymentPane's "tabs awaiting payment" list — see the local
 * `seedOpenTab` helper above). Mirrors
 * `e2e/payments/apply-promotion-and-custom-discount.spec.ts`'s `seedProduct`.
 */
async function seedDiscountTestTab(
  admin: SupabaseClient,
  customerName: string,
  basePrice: number
): Promise<{ tabId: string; productId: string; categoryId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: category, error: catErr } = await admin
    .from('categories')
    .insert({ name: `E2E PP Discount Category ${suffix}` })
    .select('id')
    .single();
  if (catErr || !category) throw new Error(`seedDiscountTestTab: category insert failed - ${catErr?.message}`);

  const { data: product, error: prodErr } = await admin
    .from('products')
    .insert({
      name: `E2E PP Discount Product ${suffix}`,
      category_id: category.id,
      base_price: basePrice,
      is_active: true,
      sold_by_weight: false,
    })
    .select('id')
    .single();
  if (prodErr || !product) throw new Error(`seedDiscountTestTab: product insert failed - ${prodErr?.message}`);

  const { error: invErr } = await admin
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: 100, cost_price: 1 });
  if (invErr) throw new Error(`seedDiscountTestTab: inventory insert failed - ${invErr.message}`);

  const shift = await ensureOpenShift(admin);
  const { data: caja } = await admin.from('caja_sessions').select('id').eq('status', 'open').maybeSingle();
  if (!caja) throw new Error('seedDiscountTestTab: no open caja session — run openCaja first');

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: customerName,
      staff_id: shift.staff_id,
      shift_id: shift.id,
      caja_session_id: caja.id,
      status: 'open',
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedDiscountTestTab: tab insert failed - ${tabErr?.message}`);

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: shift.staff_id, status: 'served' })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(`seedDiscountTestTab: order insert failed - ${orderErr?.message}`);

  const { error: itemErr } = await admin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: basePrice,
    modifier_price_delta: 0,
  });
  if (itemErr) throw new Error(`seedDiscountTestTab: order_item insert failed - ${itemErr.message}`);

  return { tabId: tab.id as string, productId: product.id as string, categoryId: category.id as string };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Payment Pane', () => {
  const seededDiscountProductIds: { productId: string; categoryId: string }[] = [];

  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async () => {
    if (seededDiscountProductIds.length === 0) return;
    const admin = getServiceClient();
    for (const { productId, categoryId } of seededDiscountProductIds) {
      await admin.from('inventory').delete().eq('product_id', productId);
      await admin.from('products').delete().eq('id', productId);
      await admin.from('categories').delete().eq('id', categoryId);
    }
    seededDiscountProductIds.length = 0;
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  test('T1: navigate to /payments from HomeDashboard big-box button', async ({ page }) => {
    await loginAs(page, 'manager');
    await goToPaymentsViaHome(page);
    await expect(page.getByText(/tabs awaiting payment/i)).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });

  test('T2: /payments route is directly reachable via URL navigation', async ({ page }) => {
    // Note: there is no persistent AppNav sidebar rendered anywhere in the app
    // (src/widgets/AppNav/ui/AppNav.tsx is not imported by any page/layout — it's
    // unused dead code). The only in-app entry point to /payments is the
    // HomeDashboard big-box button, already covered by T1. This test instead
    // verifies the /payments route itself is directly reachable via URL
    // navigation (e.g. deep link, bookmark, browser back/forward), independent
    // of which page login happens to land on (loginAsNamed can land on either
    // /home or /pos — see e2e/helpers/auth.ts).
    await loginAs(page, 'manager');
    await page.goto('/payments');
    await expect(page).toHaveURL(/\/payments/, { timeout: 15_000 });
    await expect(page.getByText(/tabs awaiting payment/i)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  // ── Left panel — tab listing ───────────────────────────────────────────────

  test('T3: left panel lists open tabs', async ({ page }) => {
    await loginAs(page, 'manager');
    await seedOpenTab('Pane List Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list).toBeVisible({ timeout: 20_000 });
    await expect(list.getByText('Pane List Test')).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });

  // ── Right panel — PIN gate ─────────────────────────────────────────────────

  test('T5: selecting a tab shows PIN prompt on right panel', async ({ page }) => {
    await loginAs(page, 'manager');
    await seedOpenTab('PIN Prompt Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('PIN Prompt Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab PIN Prompt Test/i }).click();

    await expect(page.getByRole('button', { name: /verify pin to process payment/i })).toBeVisible({
      timeout: 10_000,
    });
    await logout(page);
  });

  test('T6: entering wrong PIN shows error inside the dialog', async ({ page }) => {
    await loginAs(page, 'manager');
    await seedOpenTab('Wrong PIN Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Wrong PIN Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Wrong PIN Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });

    // Enter 6-digit wrong PIN
    await enterPin(page, '000000');
    await expect(pinDialog.getByText(/incorrect pin/i)).toBeVisible({ timeout: 5_000 });
    await logout(page);
  });

  test('T7: correct manager PIN unlocks PaymentForm', async ({ page }) => {
    await loginAs(page, 'manager');
    await seedOpenTab('Manager PIN Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Manager PIN Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Manager PIN Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });

    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);

    // Dialog closes, PaymentForm appears
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
    // PaymentForm shows the customer name in its header (h2 level in PaymentForm)
    await expect(page.getByRole('heading', { name: 'Manager PIN Test', level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('T8: correct cashier PIN also unlocks PaymentForm (RBAC: cashier has close_tab)', async ({
    page,
  }) => {
    await loginAs(page, 'cashier');
    await seedOpenTab('Cashier PIN Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Cashier PIN Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Cashier PIN Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });

    // The existing internal env variable retains its legacy name, but authenticates the cashier fixture.
    const cashierPin = process.env['E2E_BARTENDER_PIN'] ?? '';
    await enterPin(page, cashierPin);

    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });

  // ── Cash payment completes ─────────────────────────────────────────────────

  test('T9: cash payment completes — tab removed from list, receipt shown', async ({ page }) => {
    await loginAs(page, 'manager');
    await seedOpenTab('Cash Pay Pane Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Cash Pay Pane Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Cash Pay Pane Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    // PaymentForm is active — fill in cash
    await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('payment-btn-cash').click();
    await page.getByLabel(/amount tendered/i).fill('500');
    await page.getByRole('button', { name: /process payment/i }).click();

    // Receipt step appears
    await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });

    // Click Done — selection resets, right panel falls back to payment history
    // (PaymentPane shows <PaymentHistoryList /> when no tab is selected — see
    // src/widgets/PaymentPane/ui/PaymentPane.tsx)
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/recent payments|no payment records found/i)).toBeVisible({
      timeout: 10_000,
    });

    // The paid tab should no longer appear in the list
    await expect(list.getByText('Cash Pay Pane Test')).not.toBeVisible({ timeout: 5_000 });
    await logout(page);
  });

  // ── Back button ───────────────────────────────────────────────────────────

  test('T10: back button in right panel header clears selected tab', async ({ page }) => {
    await loginAs(page, 'manager');
    await seedOpenTab('Back Button Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Back Button Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Back Button Test/i }).click();
    await expect(page.getByRole('button', { name: /verify pin to process payment/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /back to tab list/i }).click();

    // Selected tab cleared — right panel falls back to payment history
    // (PaymentPane shows <PaymentHistoryList /> when no tab is selected — see
    // src/widgets/PaymentPane/ui/PaymentPane.tsx)
    await expect(page.getByText(/recent payments|no payment records found/i)).toBeVisible({
      timeout: 5_000,
    });
    await logout(page);
  });

  // ── Back-to-home navigation ───────────────────────────────────────────────

  test('T12: back button navigates from /payments to /home', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/payments');
    await page.getByRole('link', { name: /home/i }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
    await logout(page);
  });

  // ── Item grouping ─────────────────────────────────────────────────────────

  test('T11: items with same product appear grouped (e.g. "2×" prefix) in order review', async ({
    page,
  }) => {
    await loginAs(page, 'manager');
    await seedTabWithDuplicateItems('Group Items Test');
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Group Items Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Group Items Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    // PaymentForm shows order review — duplicate catalog items are merged.
    await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/2×\s*Haldiram's Aloo Bhujia 200g/i)).toBeVisible({
      timeout: 10_000,
    });
    await logout(page);
  });

  // ── Manager-PIN ad-hoc discount (Phase 27 Plan 09, G-27-13) ────────────────

  test('T13: reopened-tab ad-hoc discount requires a manager PIN and completes — process_payment_atomic path (G-27-13)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = getServiceClient();

    // Cashier operates the payment screen; a DIFFERENT manager's PIN
    // authorizes the ad-hoc discount — the real cashier-operates /
    // manager-authorizes scenario the debug session flagged (same class of
    // bug as G-27-13's primary finding, fixed for process_direct_sale_atomic
    // in Plan 08; this plan closes it for process_payment_atomic).
    //
    // Login FIRST: `useTabs()` filters the "tabs awaiting payment" list by
    // the current viewer's shift_id (src/entities/tab/model/queries.ts), and
    // logging in opens the cashier's own shift. Seeding before login would
    // make `ensureOpenShift` fall back to creating a manager shift (none
    // open yet after `resetTestState()`), tying the tab to a shift_id the
    // cashier's session never matches — the tab would silently never appear.
    await loginAs(page, 'cashier');
    await goToPaymentsViaHome(page);

    const { tabId, productId, categoryId } = await seedDiscountTestTab(
      admin,
      'PP Adhoc Discount Test',
      40
    );
    seededDiscountProductIds.push({ productId, categoryId });
    // Re-navigate: /payments' useTabs() query was already mounted (and cached
    // empty) before the tab existed — a fresh navigation forces a refetch.
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('PP Adhoc Discount Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab PP Adhoc Discount Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    // Identity-verification PIN gate (RBAC close_tab) — cashier's own PIN
    // unlocks PaymentForm (T8's exact pattern).
    let pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const cashierPin = process.env['E2E_BARTENDER_PIN'] ?? '';
    await enterPin(page, cashierPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });

    // Ad-hoc discount PIN gate — a distinct manager's real PIN.
    const discountToggle = page.locator('#discount-toggle');
    await expect(discountToggle).toBeVisible({ timeout: 10_000 });
    await discountToggle.click();
    pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    const discountInput = page.getByLabel(/discount %|discount amount/i);
    await expect(discountInput).toBeVisible({ timeout: 5_000 });
    await discountInput.fill('10');
    await expect(page.getByTestId('discount-applied-label')).toBeVisible();

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const afterDiscount = Math.round(40 * 0.9 * 100) / 100; // 36.00
    const expectedTotal = computeAuthoritativeTotal(afterDiscount, taxRatePercent, taxInclusive);

    await page.getByTestId('payment-btn-cash').click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page.getByRole('button', { name: /^process payment$/i }).click();

    await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('amount, discount_scope, discount_type, discount_value')
      .eq('tab_id', tabId)
      .order('processed_at', { ascending: false })
      .limit(1);
    if (paymentsError || !payments?.[0]) throw new Error(paymentsError?.message ?? 'Payment not found');
    const payment = payments[0] as {
      amount: number;
      discount_scope: string | null;
      discount_type: string | null;
      discount_value: number | null;
    };
    expect(payment.discount_scope).toBe('all');
    expect(payment.discount_type).toBe('percent');
    expect(Number(payment.discount_value)).toBeCloseTo(10, 1);
    expect(Number(payment.amount)).toBeCloseTo(expectedTotal, 2);
  });

  test('T14: split-tender ad-hoc discount on the reopened-tab payment screen — process_split_payment_atomic no longer rejects discountScope/discountType (G-27-13)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = getServiceClient();

    // See T13's comment: seed after login so `ensureOpenShift` reuses the
    // cashier's own shift instead of creating an unrelated manager one.
    await loginAs(page, 'cashier');
    await goToPaymentsViaHome(page);

    const { tabId, productId, categoryId } = await seedDiscountTestTab(
      admin,
      'PP Split Discount Test',
      50
    );
    seededDiscountProductIds.push({ productId, categoryId });
    await goToPaymentsViaHome(page);

    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('PP Split Discount Test')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab PP Split Discount Test/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    let pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const cashierPin = process.env['E2E_BARTENDER_PIN'] ?? '';
    await enterPin(page, cashierPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });

    const discountToggle = page.locator('#discount-toggle');
    await expect(discountToggle).toBeVisible({ timeout: 10_000 });
    await discountToggle.click();
    pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    const discountInput = page.getByLabel(/discount %|discount amount/i);
    await expect(discountInput).toBeVisible({ timeout: 5_000 });
    await discountInput.fill('10');
    await expect(page.getByTestId('discount-applied-label')).toBeVisible();

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const afterDiscount = Math.round(50 * 0.9 * 100) / 100; // 45.00
    const expectedTotal = computeAuthoritativeTotal(afterDiscount, taxRatePercent, taxInclusive);

    // Before Task 1's fix, process-split-payment/index.ts's BodySchema
    // declared discountScope: z.enum(['tab', 'item']) / discountType:
    // z.enum(['percentage', 'fixed']) — stale bar-pos-era values that never
    // matched what the client sends ('all' / 'percent'), so every
    // split-payment discount request was rejected by Zod with 400
    // VALIDATION_ERROR before ever reaching process_split_payment_atomic.
    const splitToggle = page.locator('#split-mode-toggle');
    await expect(splitToggle).toBeVisible({ timeout: 10_000 });
    await splitToggle.click();

    const leg1 = Math.round((expectedTotal / 2) * 100) / 100;
    const leg2 = Math.round((expectedTotal - leg1) * 100) / 100;

    const amountInputs = page.getByLabel('Amount', { exact: true });
    const tenderedInputs = page.getByLabel('Amount tendered', { exact: true });
    await expect(amountInputs).toHaveCount(2, { timeout: 10_000 });

    await amountInputs.nth(0).fill(leg1.toFixed(2));
    await tenderedInputs.nth(0).fill(leg1.toFixed(2));
    await amountInputs.nth(1).fill(leg2.toFixed(2));
    await tenderedInputs.nth(1).fill(leg2.toFixed(2));

    await page.getByRole('button', { name: /^process split payment$/i }).click();

    await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('amount, split_index, discount_scope, discount_type, discount_value')
      .eq('tab_id', tabId)
      .order('split_index', { ascending: true });
    if (paymentsError || !payments || payments.length !== 2) {
      throw new Error(paymentsError?.message ?? `Expected 2 split payment rows, got ${String(payments?.length)}`);
    }
    const rows = payments as {
      amount: number;
      split_index: number | null;
      discount_scope: string | null;
      discount_type: string | null;
      discount_value: number | null;
    }[];
    const leg0 = rows.find(r => r.split_index === 0);
    const leg1Row = rows.find(r => r.split_index === 1);
    if (!leg0 || !leg1Row) throw new Error('Expected split_index 0 and 1 rows');

    // Discount stored ONLY on split_index=0 (D-04) — the fix's whole point
    // is that this row is no longer silently rejected before insert.
    expect(leg0.discount_scope).toBe('all');
    expect(leg0.discount_type).toBe('percent');
    expect(Number(leg0.discount_value)).toBeCloseTo(10, 1);
    expect(leg1Row.discount_scope).toBeNull();

    expect(Number(leg0.amount) + Number(leg1Row.amount)).toBeCloseTo(expectedTotal, 2);
  });
});
