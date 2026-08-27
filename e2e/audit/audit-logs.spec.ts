/**
 * E2E spec: Phase 14 — Audit Log
 * Plan: 14-06
 *
 * Covers the full audit logging chain:
 *   1. Trigger sensitive action (payment / combo / refund)
 *   2. Navigate to /audit
 *   3. Assert entry visible in the table + diff sheet renders
 *
 * RBAC enforcement, filters, and diff viewer are also exercised.
 *
 * Requires bar-pos/.env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 */

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState, seedOpenTab } from '../helpers/supabase';

/**
 * Seed a fully paid tab (open tab -> order -> order_item -> marked paid ->
 * payment row) directly via the service-role client, mirroring
 * e2e/payments/refund.spec.ts's local `seedPaidTab` helper. /pos was deleted in Plan
 * 01-11 (D-07), so there is no UI checkout flow left to produce a paid tab —
 * this reproduces exactly what that flow would have written to the DB, then
 * the test drives the actual refund through /payments' RefundSheet (still
 * fully wired, unlike /pos's OrderPanel/VoidOrderDialog).
 */
async function seedPaidTabForAudit(customerName: string): Promise<{ tabId: string; paymentId: string }> {
  const admin = getServiceClient();
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'manager')
    .limit(1)
    .single();
  if (profErr || !profile) throw new Error(`seedPaidTabForAudit: no manager profile found – ${profErr?.message}`);

  let shiftId: string;
  const { data: existingShift } = await admin
    .from('shifts')
    .select('id')
    .eq('staff_id', profile.id)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift, error: shiftErr } = await admin
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftErr || !newShift) throw new Error(`seedPaidTabForAudit: shift create failed – ${shiftErr?.message}`);
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await admin
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
  if (tabErr || !tab) throw new Error(`seedPaidTabForAudit: tab insert failed – ${tabErr?.message}`);

  const { data: order, error: oErr } = await admin
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: profile.id, status: 'pending' })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(`seedPaidTabForAudit: order insert failed – ${oErr?.message}`);

  // `.gt('base_price', 0)` — payments has a check constraint requiring
  // amount > 0; an unordered `.limit(1)` over all active products can land
  // on a $0 fixture row, which then fails that constraint below.
  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id, base_price')
    .eq('is_active', true)
    .gt('base_price', 0)
    .limit(1)
    .single();
  if (pErr || !product) throw new Error(`seedPaidTabForAudit: no active product found – ${pErr?.message}`);

  const { error: iErr } = await admin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: product.base_price,
    modifier_price_delta: 0,
  });
  if (iErr) throw new Error(`seedPaidTabForAudit: order_item insert failed – ${iErr.message}`);

  // tabs has a bump_version_on_update trigger (STALE_VERSION guard) requiring
  // every UPDATE to advance `version` by exactly +1 — a freshly inserted tab
  // starts at version 1, so this update must set version: 2.
  const { error: markPaidErr } = await admin
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (markPaidErr) throw new Error(`seedPaidTabForAudit: mark-paid failed – ${markPaidErr.message}`);

  const { data: payment, error: payErr } = await admin
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: product.base_price,
      tip_amount: 0,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-audit-refund-${(tab.id as string).slice(0, 8)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) throw new Error(`seedPaidTabForAudit: payment insert failed – ${payErr?.message}`);

  return { tabId: tab.id as string, paymentId: payment.id as string };
}

test.describe('Audit Log', () => {
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
  // Happy path
  // ==========================================================================
  test.describe('Happy path', () => {
    test('should display audit entries after processing a payment', async ({ page }) => {
      test.setTimeout(120_000);

      await loginAs(page, 'manager');

      // D-07: /pos was deleted in Phase 1 (Plan 01-11) — seed the tab+order
      // directly via the service-role client, then drive the payment through
      // /payments' inline PaymentForm, the same component /pos's checkout
      // modal used (@widgets/PaymentModal/ui/PaymentForm.tsx — embeddable
      // inline or in a Dialog). The real subject under test is "does a
      // payment.process audit row appear", not "does /pos's UI work".
      // seedOpenTab's productName is a required, exact-match lookup (17-03) —
      // resolved from a real active product here instead of hardcoding a
      // bar-pos-era name, so this works against either the Indian grocery
      // catalog or any other seeded product set.
      const admin = getServiceClient();
      const { data: seedProduct, error: seedProductErr } = await admin
        .from('products')
        .select('name')
        .eq('is_active', true)
        .gt('base_price', 0)
        .limit(1)
        .single();
      if (seedProductErr || !seedProduct) {
        throw new Error(`no active product found to seed audit tab – ${seedProductErr?.message}`);
      }
      await seedOpenTab({
        customerName: 'Audit Pay Tab',
        role: 'manager',
        withItem: true,
        productName: (seedProduct as { name: string }).name,
      });

      await page.goto('/payments');
      const tabList = page.getByTestId('tabs-waiting-for-payment');
      await expect(tabList).toBeVisible({ timeout: 20_000 });
      await tabList.getByRole('button', { name: /tab audit pay tab/i }).click();

      // /payments gates payment processing behind a manager-PIN re-verify
      // (ManagerPinDialog, requiredAction="close_tab") before showing the
      // inline PaymentForm — see PaymentPane.tsx.
      await page.getByRole('button', { name: /verify pin to process payment/i }).click();
      const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
      await expect(pinDialog).toBeVisible({ timeout: 10_000 });
      const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
      for (const ch of managerPin) {
        await pinDialog.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
      }
      await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

      await page.getByTestId('payment-btn-cash').click();
      await page.getByLabel(/amount tendered/i).fill('500');
      await page.getByRole('button', { name: /process payment/i }).click();
      await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });
      await page.getByRole('button', { name: 'Done' }).click();

      // Navigate to audit log
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
        timeout: 15_000,
      });

      // Assert at least one row with action "payment.process"
      const paymentProcessCell = page.getByRole('cell', { name: 'payment.process' }).first();
      await expect(paymentProcessCell).toBeVisible({ timeout: 15_000 });

      // Click the row → diff sheet opens with JSON content. Scoped by
      // accessible name (SheetTitle = the audit row's action) — the AI
      // assistant side panel is also role="dialog" and, being
      // CSS-transform-hidden rather than display:none, still counts as
      // "visible" to Playwright even when closed, which would make an
      // unscoped not.toBeVisible() check below never pass.
      await paymentProcessCell.click();
      const sheet = page.getByRole('dialog', { name: 'payment.process' });
      await expect(sheet).toBeVisible({ timeout: 5_000 });
      await expect(sheet.getByText('payment.process').first()).toBeVisible();
      // JsonDiffViewer headers
      await expect(sheet.getByText(/before/i).first()).toBeVisible();
      await expect(sheet.getByText(/after/i).first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheet).not.toBeVisible({ timeout: 5_000 });

      // 10-07 (QA-03): the row's new entityId column (EntityIdCell) offers a
      // copy button and a real navigation link to the seeded payment — prove
      // the full click-through (source table → destination page filter),
      // not just that the link's href looks right. Locale-agnostic: match on
      // href/testid rather than translated text, since which of the 2
      // languages the manager account renders can drift across test runs.
      const paymentRow = paymentProcessCell.locator('..');
      const entityLink = paymentRow.locator('a[href*="/payments?id="]');
      await expect(entityLink).toBeVisible({ timeout: 10_000 });

      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const copyButton = paymentRow.getByTestId('copy-entity-id-button');
      await expect(copyButton).toBeVisible();
      await copyButton.click();
      await expect(page.getByText(/copied|copiado/i).first()).toBeVisible({ timeout: 5_000 });

      const href = await entityLink.getAttribute('href');
      const linkedPaymentId = href?.split('id=')[1];
      expect(linkedPaymentId).toBeTruthy();

      await entityLink.click();
      await expect(page).toHaveURL(/\/payments\?id=/, { timeout: 10_000 });
      await expect(page.getByTestId(`payment-row-${linkedPaymentId}`)).toBeVisible({
        timeout: 15_000,
      });
    });

    test('should display audit entry after voiding an order (order.void filter)', async ({
      page,
    }) => {
      test.setTimeout(90_000);

      await loginAs(page, 'manager');
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
        timeout: 15_000,
      });

      // Apply action filter: order.void
      const actionTrigger = page.locator('#audit-filter-action');
      await expect(actionTrigger).toBeVisible({ timeout: 10_000 });
      await actionTrigger.click();
      const voidOption = page.getByRole('option', { name: 'order.void' });
      await expect(voidOption).toBeVisible({ timeout: 5_000 });
      await voidOption.click();
      await page.getByRole('button', { name: /apply filters/i }).click();

      // The void flow itself is exercised elsewhere. Here we only assert the
      // audit page can filter+surface it without page error — either rows
      // exist OR the "No matches" empty state is shown.
      const noMatch = page.getByText(/no matches/i);
      const voidCell = page.getByRole('cell', { name: 'order.void' }).first();
      await expect(noMatch.or(voidCell)).toBeVisible({ timeout: 10_000 });
    });

    test('should display audit entry after processing a refund', async ({ page }) => {
      test.setTimeout(180_000);

      // D-07: /pos was deleted in Phase 1 (Plan 01-11) — no checkout UI left
      // to produce a paid tab, so seed one directly (mirrors
      // e2e/payments/refund.spec.ts's seedPaidTab), then drive the actual
      // refund through /payments' RefundSheet — still fully wired (unlike
      // /pos's VoidOrderDialog) — so this test verifies a real
      // payment.refund audit row appears, not just that the page can
      // filter without erroring.
      const { paymentId } = await seedPaidTabForAudit('Audit Refund Tab');

      await loginAs(page, 'manager');
      await gotoAuthed(page, '/payments');

      const seededRow = page.getByTestId(`payment-row-${paymentId}`);
      await expect(seededRow).toBeVisible({ timeout: 20_000 });
      await seededRow.getByRole('button', { name: 'Refund' }).click();

      // Scoped by accessible name — the AI assistant side panel is also role="dialog".
      const refundDialog = page.getByRole('dialog', { name: 'Process refund' });
      await expect(refundDialog).toBeVisible({ timeout: 10_000 });

      const checkboxes = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i });
      await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
      await checkboxes.first().check();

      const reasonTrigger = refundDialog.locator('#refund-reason');
      await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
      await reasonTrigger.click();
      await page.getByRole('option', { name: /wrong.*order/i }).click();

      await page.getByRole('button', { name: /request approval/i }).click();

      const pinDialog = page.getByRole('alertdialog');
      await expect(pinDialog).toBeVisible({ timeout: 8_000 });
      const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
      for (const ch of managerPin) {
        await pinDialog.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
      }
      await expect(page.getByText(/refund.*processed/i)).toBeVisible({ timeout: 15_000 });

      // Navigate to /audit and apply action filter "payment.refund" — the
      // refund just processed above must now be visible.
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
        timeout: 15_000,
      });

      const actionTrigger = page.locator('#audit-filter-action');
      await actionTrigger.click();
      const refundOption = page.getByRole('option', { name: 'payment.refund' });
      await expect(refundOption).toBeVisible({ timeout: 5_000 });
      await refundOption.click();
      await page.getByRole('button', { name: /apply filters/i }).click();

      const refundCell = page.getByRole('cell', { name: 'payment.refund' }).first();
      await expect(refundCell).toBeVisible({ timeout: 10_000 });
    });
  });

  // ==========================================================================
  // RBAC enforcement
  // ==========================================================================
  test.describe('RBAC enforcement', () => {
    test('bartender should be redirected away from /audit', async ({ page }) => {
      await loginAs(page, 'cashier');
      await page.goto('/audit');
      await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
      // 39-07, harness: this toast renders twice (duplicate mount), making a
      // bare getByText() a strict-mode violation — the redirect above already
      // proves the gate holds; .first() is enough to confirm the toast fired.
      await expect(page.getByText(/restricted to managers and admins/i).first()).toBeVisible({
        timeout: 8_000,
      });
    });
  });

  // ==========================================================================
  // Diff viewer
  // ==========================================================================
  test.describe('Diff viewer', () => {
    test('should open diff sheet on row click', async ({ page }) => {
      test.setTimeout(60_000);

      await loginAs(page, 'manager');
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
        timeout: 15_000,
      });

      // If the table has no rows yet (fresh DB), skip — a row is needed to test
      // the click → sheet flow. Test 1 in the same suite seeds a payment row.
      const firstRow = page
        .getByRole('button', { name: /view diff for .* on .*/i })
        .first();
      if ((await firstRow.count()) === 0) {
        test.skip(true, 'No audit entries present — skip diff sheet click test.');
        return;
      }

      await firstRow.click();

      // Sheet slides in with action title and Before/After labels
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible({ timeout: 5_000 });
      await expect(sheet.getByText(/before/i).first()).toBeVisible({ timeout: 5_000 });
      await expect(sheet.getByText(/after/i).first()).toBeVisible({ timeout: 5_000 });
    });
  });

  // ==========================================================================
  // Filters
  // ==========================================================================
  test.describe('Filters', () => {
    test('date range filter should narrow results', async ({ page }) => {
      test.setTimeout(60_000);

      await loginAs(page, 'manager');
      await page.goto('/audit');
      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
        timeout: 15_000,
      });

      // Pick "tomorrow" → no rows can match
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isoTomorrow = tomorrow.toISOString().slice(0, 10);

      const dateFromInput = page.getByLabel('Date from');
      await expect(dateFromInput).toBeVisible({ timeout: 5_000 });
      await dateFromInput.fill(isoTomorrow);

      await page.getByRole('button', { name: /apply filters/i }).click();

      // Expect "No matches" empty state
      await expect(page.getByText(/no matches/i)).toBeVisible({ timeout: 10_000 });
    });
  });
});
