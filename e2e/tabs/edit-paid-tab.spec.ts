/**
 * E2E spec: Phase 22 — Edit Paid Ticket + History
 * Plan: 22-01 (scaffold) / activated in 22-05 (SC-3, SC-4)
 *
 * SC-3: a manager+ PIN-gated dialog corrects a paid tab from /payments.
 * SC-4: the correction is recorded and browsable on /edit-history with an
 * openable before/after diff (mirrors e2e/audit/audit-logs.spec.ts's DOM/a11y
 * contract — sr-only "View diff" trigger, row click opens the sheet).
 *
 * Note on RBAC shape: `EditTicketButton` (PaymentPane.tsx) renders for every
 * role — there is no route/visibility gate on /payments, mirroring the
 * existing RefundButton pattern. The manager+ restriction on `edit_paid_tab`
 * (22-01 MANAGER_EXTRA) is enforced entirely by `ManagerPinDialog`'s
 * eligibleStaff check: a bartender's own PIN is rejected, so a bartender can
 * open the dialog but cannot self-approve a save. /edit-history IS route-gated
 * (view_audit_log, manager+) via EditHistoryRoute.
 *
 * Requires bar-pos/.env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 */
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Seed helper — mirrors e2e/payments/refund.spec.ts's seedPaidTab (single item).
// ---------------------------------------------------------------------------

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
  orderItemIds: string[];
}

async function seedPaidTab(
  db: ReturnType<typeof getServiceClient>,
  unitPrice: number,
): Promise<SeededPaidTab> {
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

  const { data: tab } = await db
    .from('tabs')
    .insert({
      customer_name: 'E2E Edit Paid Tab Test',
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  const { data: order } = await db
    .from('orders')
    .insert({
      tab_id: tab.id,
      staff_id: profile.id,
      status: 'pending',
    })
    .select('id')
    .single();

  const { data: product } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  const { data: items } = await db
    .from('order_items')
    .insert({
      order_id: order.id,
      product_id: product.id,
      quantity: 1,
      unit_price: unitPrice,
      modifier_price_delta: 0,
    })
    .select('id');
  const orderItemIds = (items as { id: string }[]).map(i => i.id);

  // tabs has bump_version_on_update (STALE_VERSION guard) — a freshly inserted
  // tab starts at version 1, so this update must set version: 2.
  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPaidTab: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: unitPrice,
      tip_amount: 0,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-seed-edit-paid-${(tab.id as string).slice(0, 8)}`,
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
    orderItemIds,
  };
}

/**
 * Enter a PIN on the PINKeypad (button-based, aria-label "Key N").
 */
async function enterManagerPin(
  page: import('@playwright/test').Page,
  pin: string,
): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    const btn = page.getByRole('button', { name: label });
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await btn.click();
    } else {
      await page.keyboard.type(ch);
    }
  }
}

/**
 * Full SC-3 UI flow: open /payments, click "Editar ticket" (es-MX, the
 * default test-profile locale per resetTestState) on the seeded payment row,
 * change the item's unit price, fill a reason, save, and pass the manager
 * PIN gate. Asserts the success toast and dialog close.
 */
async function editPaidTabViaUi(
  page: import('@playwright/test').Page,
  seeded: SeededPaidTab,
  pin: string,
  reason: string,
  newUnitPrice: number,
): Promise<void> {
  await gotoAuthed(page, '/payments');

  // Locale-agnostic (mirrors e2e/helpers/auth.ts's approach): the pinned
  // E2E_MANAGER_NAME account is en-US, not es-MX, despite this flow's
  // Spanish-looking name — match both so this helper doesn't silently break
  // whenever the pinned account's locale is whatever a prior locale-switch
  // test/reset last left it at.
  const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /edit ticket|editar ticket/i }).click();

  const dialog = page.getByRole('dialog', { name: /edit paid ticket|editar ticket pagado/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const priceInput = dialog.locator(`#edit-price-${seeded.orderItemIds[0]}`);
  await expect(priceInput).toBeVisible({ timeout: 10_000 });
  await priceInput.fill(String(newUnitPrice));

  await dialog.locator('#edit-paid-tab-reason').fill(reason);
  await dialog.getByRole('button', { name: /save correction|guardar corrección/i }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await enterManagerPin(page, pin);

  await expect(
    page.getByText(/ticket correction saved|corrección del ticket guardada/i)
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.describe('Edit Paid Tab', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(540);
    await page.goto('/');
  });

  test.afterEach(async ({ page }) => {
    await logout(page).catch(() => undefined);
  });

  // ==========================================================================
  // SC-3: edit a paid tab from /payments
  // ==========================================================================
  test.describe('SC-3: edit a paid tab from /payments', () => {
    test('manager opens EditPaidTabDialog from a paid tab, passes the PIN gate, edits an item and reason, and saves', async ({
      page,
    }) => {
      test.setTimeout(90_000);

      const db = getServiceClient();
      const seeded = await seedPaidTab(db, 15);
      const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
      const reason = 'E2E price correction';

      await loginAs(page, 'manager');
      await editPaidTabViaUi(page, seeded, managerPin, reason, 20);

      const { data: item } = await db
        .from('order_items')
        .select('unit_price')
        .eq('id', seeded.orderItemIds[0])
        .single();
      expect(Number((item as { unit_price: number }).unit_price)).toBeCloseTo(20, 1);

      const { data: auditRow } = await db
        .from('audit_logs')
        .select('id, after')
        .eq('entity_id', seeded.tabId)
        .eq('action', 'tab.edit_paid')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(auditRow).not.toBeNull();
      const after = (auditRow as { after: { reason?: string } }).after;
      expect(after.reason).toBe(reason);
    });

    test('bartender cannot self-approve the edit-paid-tab PIN gate (manager+ only)', async ({
      page,
    }) => {
      test.setTimeout(60_000);

      const db = getServiceClient();
      const seeded = await seedPaidTab(db, 15);
      const bartenderPin = process.env['E2E_BARTENDER_PIN'] ?? '';

      await loginAs(page, 'cashier');
      await gotoAuthed(page, '/payments');

      const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole('button', { name: /edit ticket|editar ticket/i }).click();

      const dialog = page.getByRole('dialog', { name: /edit paid ticket|editar ticket pagado/i });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator('#edit-paid-tab-reason').fill('Bartender self-approval attempt');
      await dialog.getByRole('button', { name: /save correction|guardar corrección/i }).click();

      const pinDialog = page.getByRole('alertdialog');
      await expect(pinDialog).toBeVisible({ timeout: 8_000 });
      await enterManagerPin(page, bartenderPin);

      // Bartender is not in ManagerPinDialog's eligibleStaff list for
      // edit_paid_tab (manager+ only) — rejected with an error, dialog stays open.
      await expect(pinDialog.getByText(/incorrect pin/i)).toBeVisible({ timeout: 8_000 });
      await expect(dialog).toBeVisible();

      const { data: item } = await db
        .from('order_items')
        .select('unit_price')
        .eq('id', seeded.orderItemIds[0])
        .single();
      expect(Number((item as { unit_price: number }).unit_price)).toBeCloseTo(15, 1);
    });
  });

  // ==========================================================================
  // SC-4: /edit-history lists edits and opens the diff viewer
  // ==========================================================================
  test.describe('SC-4: /edit-history lists edits and opens the diff viewer', () => {
    test('manager sees the edit in /edit-history and row click opens the JsonDiffViewer', async ({
      page,
    }) => {
      test.setTimeout(90_000);

      const db = getServiceClient();
      const seeded = await seedPaidTab(db, 15);
      const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
      const reason = `E2E history check ${String(Date.now())}`;

      await loginAs(page, 'manager');
      await editPaidTabViaUi(page, seeded, managerPin, reason, 25);

      await gotoAuthed(page, '/edit-history');
      await expect(
        page.getByRole('heading', { name: /edit history|historial de ediciones/i })
      ).toBeVisible({
        timeout: 15_000,
      });

      const actionCell = page.getByRole('cell', { name: 'tab.edit_paid' }).first();
      await expect(actionCell).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(reason)).toBeVisible({ timeout: 10_000 });

      await actionCell.click();
      const sheet = page.getByRole('dialog', { name: 'tab.edit_paid' });
      await expect(sheet).toBeVisible({ timeout: 5_000 });
      await expect(sheet.getByText(/before/i).first()).toBeVisible({ timeout: 5_000 });
      await expect(sheet.getByText(/after/i).first()).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
      await expect(sheet).not.toBeVisible({ timeout: 5_000 });

      // 10-07 (QA-03): EditHistoryTable's ticket column now renders a real
      // navigation link (EntityIdCell, entityType="tab") — prove clicking it
      // navigates to the seeded tab's payment record end-to-end.
      const editHistoryRow = actionCell.locator('..');
      const ticketLink = editHistoryRow.locator('a[href*="/payments?id="]');
      await expect(ticketLink).toBeVisible({ timeout: 10_000 });
      await expect(ticketLink).toHaveAttribute('href', `/payments?id=${seeded.tabId}`);
      await ticketLink.click();
      await expect(page).toHaveURL(`/payments?id=${seeded.tabId}`, { timeout: 10_000 });

      // Task 2's wiring: the same seeded tab also shows the link/copy
      // affordance on Reports' post-close Deletions (Corrections) surface.
      await gotoAuthed(page, '/reports');
      await page.getByRole('tab', { name: /corrections|correcciones/i }).click();
      const postCloseLink = page.locator(`a[href="/payments?id=${seeded.tabId}"]`);
      await expect(postCloseLink).toBeVisible({ timeout: 15_000 });
    });

    test('bartender is redirected away from /edit-history', async ({ page }) => {
      await loginAs(page, 'cashier');
      await gotoAuthed(page, '/edit-history');
      await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
      await expect(page.getByText(/restricted to managers and admins/i).first()).toBeVisible({
        timeout: 8_000,
      });
    });
  });
});
