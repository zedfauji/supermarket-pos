import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { assertCajaEntry } from '../helpers/db-assertions';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openEntryDialog(page: import('@playwright/test').Page) {
  const btn = page.getByRole('button', { name: 'Register Expense / Income' });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await btn.click();
  const dlg = page.getByRole('dialog', { name: 'Register Expense / Income' });
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  return dlg;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Caja Entries (Expenses & Income)', () => {
  let cajaSessionId = '';

  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'manager');
    await page.goto('/staff');
    await expect(page.getByRole('heading', { name: 'Staff', level: 2 }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  // -------------------------------------------------------------------------
  // Test 1 — register expense
  // -------------------------------------------------------------------------
  test('Manager registers an expense during open caja', async ({ page }) => {
    const dlg = await openEntryDialog(page);

    // "Expense" is the default type — no click needed, just fill the fields
    await dlg.getByLabel(/amount/i).fill('500');
    await dlg.getByLabel(/concept/i).fill('Proveedor especias');
    await dlg.getByRole('button', { name: 'Save Entry' }).click();

    // Toast confirms success
    await expect(page.getByText(/expense recorded/i)).toBeVisible({ timeout: 15_000 });

    // Entry appears in the "Recent Entries" list
    await expect(page.getByText('Proveedor especias')).toBeVisible({ timeout: 10_000 });
    // Pinned E2E accounts are en-US (setup-dev-users.ts / resetTestState):
    // formatMoney(-500) => '-$500.00', not the es-MX 'MX$'-prefixed form.
    await expect(page.getByText('-$500.00')).toBeVisible();

    // D-10: direct DB assertion alongside the UI assertion.
    await assertCajaEntry(cajaSessionId, 'expense', 500);

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 2 — register income
  // -------------------------------------------------------------------------
  test('Manager registers an income entry', async ({ page }) => {
    const dlg = await openEntryDialog(page);

    // Switch to Income
    await dlg.getByRole('button', { name: 'Income' }).click();
    await dlg.getByLabel(/amount/i).fill('200');
    await dlg.getByLabel(/concept/i).fill('Fondo chico');
    await dlg.getByRole('button', { name: 'Save Entry' }).click();

    // Toast confirms success
    await expect(page.getByText(/income recorded/i)).toBeVisible({ timeout: 15_000 });

    // Entry appears with an "income" badge
    await expect(page.getByText('Fondo chico')).toBeVisible({ timeout: 10_000 });
    // The badge text is the entry type rendered with .capitalize class
    await expect(page.getByText('income', { exact: true }).first()).toBeVisible();

    await assertCajaEntry(cajaSessionId, 'income', 200);

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 3 — expense reduces the Net card
  // -------------------------------------------------------------------------
  test('Expense reduces net balance in dashboard', async ({ page }) => {
    // Locate the Net card — it is the SummaryCard with label "Net"
    // We read the text content before registering the expense.
    const netCard = page
      .locator('div')
      .filter({ has: page.locator('span', { hasText: 'Net' }) })
      .first();

    await expect(netCard).toBeVisible({ timeout: 30_000 });

    const beforeText = await netCard.textContent();
    // Extract the dollar amount string from the card text (e.g. "$1,200.00" → "1200.00")
    const beforeMatch = /\$[\d,]+\.\d{2}/.exec(beforeText ?? '');
    const beforeAmount = parseFloat((beforeMatch?.[0] ?? '$0').replace(/[$,]/g, ''));

    // Register a $100 expense
    const dlg = await openEntryDialog(page);
    await dlg.getByLabel(/amount/i).fill('100');
    await dlg.getByLabel(/concept/i).fill('Test reduccion');
    await dlg.getByRole('button', { name: 'Save Entry' }).click();
    await expect(page.getByText(/expense recorded/i)).toBeVisible({ timeout: 15_000 });

    // Wait for the entry to appear, which means the summary has re-fetched
    await expect(page.getByText('Test reduccion')).toBeVisible({ timeout: 10_000 });

    const afterText = await netCard.textContent();
    const afterMatch = /\$[\d,]+\.\d{2}/.exec(afterText ?? '');
    const afterAmount = parseFloat((afterMatch?.[0] ?? '$0').replace(/[$,]/g, ''));

    expect(afterAmount).toBeLessThan(beforeAmount);

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 4 — entry appears in caja closing report
  // -------------------------------------------------------------------------
  test('Entry appears in caja closing report', async ({ page }) => {
    // Register the expense first
    const dlg = await openEntryDialog(page);
    await dlg.getByLabel(/amount/i).fill('50');
    await dlg.getByLabel(/concept/i).fill('Limpieza');
    await dlg.getByRole('button', { name: 'Save Entry' }).click();
    await expect(page.getByText(/expense recorded/i)).toBeVisible({ timeout: 15_000 });

    // Navigate to reports (manager can see /reports)
    await page.goto('/home');
    await page.getByRole('button', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports/, { timeout: 15_000 });

    // The "Expenses & Income" section heading should be visible
    await expect(page.getByRole('heading', { name: /expenses & income/i })).toBeVisible({
      timeout: 30_000,
    });

    // The entry row shows "Limpieza" concept and the amount
    await expect(page.getByText('Limpieza')).toBeVisible({ timeout: 10_000 });
    // Pinned E2E accounts are en-US: formatMoney(-50) => '-$50.00'.
    await expect(page.getByText('-$50.00')).toBeVisible();

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 5 — cashier cannot see the Register Entry button (RBAC)
  // -------------------------------------------------------------------------
  test('Cashier cannot see Register Expense / Income button', async ({ page }) => {
    // We are already logged in as manager — log out first
    await logout(page);

    await loginAs(page, 'cashier');
    await page.goto('/staff');

    // Cashiers do not have manage_caja — the button must not be visible
    const registerBtn = page.getByRole('button', { name: 'Register Expense / Income' });
    await expect(registerBtn).not.toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 6 — form validation: empty concept
  // -------------------------------------------------------------------------
  test('Form validation — empty concept shows required error', async ({ page }) => {
    const dlg = await openEntryDialog(page);

    await dlg.getByLabel(/amount/i).fill('100');
    // Concept is intentionally left empty
    await dlg.getByRole('button', { name: 'Save Entry' }).click();

    // Validation error appears inside the dialog
    await expect(dlg.getByText(/concept is required/i)).toBeVisible({ timeout: 5_000 });

    // Dialog should still be open (submission was blocked)
    await expect(dlg).toBeVisible();

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 7 — form validation: invalid amount
  // -------------------------------------------------------------------------
  test('Form validation — zero amount shows positive-amount error', async ({ page }) => {
    const dlg = await openEntryDialog(page);

    await dlg.getByLabel(/concept/i).fill('Test');
    // Amount field is left at empty / 0
    await dlg.getByRole('button', { name: 'Save Entry' }).click();

    // Validation error appears inside the dialog
    await expect(dlg.getByText(/amount must be greater than 0/i)).toBeVisible({ timeout: 5_000 });

    // Dialog should still be open (submission was blocked)
    await expect(dlg).toBeVisible();

    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 8 — concept at exactly 200 chars (ported from 19-caja-entries.spec.ts's
  // CE4 — the one intent 23-caja-entries.spec.ts had no equivalent for)
  // -------------------------------------------------------------------------
  test('Concept at exactly 200 chars saves successfully', async ({ page }) => {
    const dlg = await openEntryDialog(page);

    await dlg.getByLabel(/amount/i).fill('10');
    await dlg.getByLabel(/concept/i).fill('A'.repeat(200));
    await dlg.getByRole('button', { name: 'Save Entry' }).click();

    await expect(page.getByText(/expense recorded/i)).toBeVisible({ timeout: 15_000 });

    await assertCajaEntry(cajaSessionId, 'expense', 10);

    await logout(page);
  });
});
