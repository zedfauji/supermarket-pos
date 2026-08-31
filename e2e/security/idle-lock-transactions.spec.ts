/**
 * E2E spec: Phase 21 — Idle Screen Lock (Plan 21-02)
 *
 * Proves D-01's "no exemption, even mid-transaction" clause end-to-end: the
 * idle-lock overlay engages while /pos has an open cart AND an open payment
 * modal, without resetting either -- there is no checkout carve-out (D-01,
 * 21-CONTEXT.md: "Everywhere," explicit rejection of an exemption for
 * in-progress transaction state).
 */
import { expect, test } from '../fixtures';
import { enterPin, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const TERMINAL_ID = process.env.VITE_TERMINAL_ID ?? 'POS-1';
const LOCK_TIMEOUT_SECONDS = 15;
const PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";

async function seedLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
  if (error) throw new Error(`seedLockTimeout: ${error.message}`);
}

async function clearLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('terminal_lock_settings').delete().eq('terminal_id', TERMINAL_ID);
}

test.describe('Idle Screen Lock — mid-transaction no-exemption (D-01)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await seedLockTimeout();
  });

  test.afterEach(async () => {
    await clearLockTimeout();
  });

  test('cart contents and an open payment modal survive a lock/unlock cycle unchanged; the sale still completes', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await openCaja(500);
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);

    // Build a real cart, then open the payment modal (mirrors
    // e2e/checkout/happy-path.spec.ts's cart-building + payment-open steps).
    await page.getByPlaceholder(/search products/i).fill(PRODUCT_NAME);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT_NAME}`, 'i') }).click();
    await page.getByRole('button', { name: /^process payment$/i }).click();

    const itemsSummary = page.getByText(/item type.*total/i);
    const totalRow = page.getByText('Total', { exact: true }).locator('..');
    const itemsSummaryBefore = await itemsSummary.textContent();
    const totalTextBefore = await totalRow.getByText(/\$\d+\.\d{2}/).textContent();
    if (!itemsSummaryBefore || !totalTextBefore) {
      throw new Error('idle-lock-transactions: could not read payment modal cart summary/total');
    }

    await page.getByLabel(/amount tendered/i).fill('100');

    const overlay = page.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // D-01: no exemption for in-progress transactions -- the payment modal
    // is not closed/unmounted underneath the overlay; cart contents unchanged.
    await expect(itemsSummary).toBeVisible();
    await expect(itemsSummary).toHaveText(itemsSummaryBefore);
    await expect(totalRow.getByText(/\$\d+\.\d{2}/)).toHaveText(totalTextBefore);

    // The confirm button is occluded by the overlay's focus-trapping dialog
    // -- a bounded click against it must time out (Playwright's actionability
    // check fails on an occluded element), never actually submitting payment.
    const confirmBtn = page.getByRole('button', { name: /^process payment$/i });
    await expect(confirmBtn.click({ timeout: 2_000 })).rejects.toThrow();

    // Unlock with a valid staff PIN (D-04: any staff works here too).
    const cashierPin = process.env['E2E_BARTENDER_PIN'] ?? '';
    await enterPin(page, cashierPin);
    await expect(overlay).not.toBeVisible({ timeout: 10_000 });

    // Nothing was reset by the lock/unlock cycle: same cart total/line
    // count, same payment modal, same entered tendered amount.
    await expect(itemsSummary).toHaveText(itemsSummaryBefore);
    await expect(totalRow.getByText(/\$\d+\.\d{2}/)).toHaveText(totalTextBefore);
    await expect(page.getByLabel(/amount tendered/i)).toHaveValue('100.00');

    // The in-progress sale can still be completed successfully after
    // unlocking -- the lock/unlock cycle did not corrupt transaction state.
    await confirmBtn.click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /done/i }).click();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
  });
});
