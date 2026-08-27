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

import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Payment Pane', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
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
});
