import { expect, test } from '../fixtures';
import { loginAs, loginAsNamed, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

test.describe('Role-Based Access', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(550);
    await page.goto('/');
  });

  test('Bartender cannot access Reports route', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
    await logout(page);
  });

  // Rewritten against the CURRENT direct-sale checkout UI (Plan 17-04's
  // proven scan/cart/pay pattern) — the old /pos "New Tab" -> OrderPanel
  // Close Tab/Pay button this test drove no longer exists (OrderPanel was
  // deleted wholesale in Phase 1, 01-11-SUMMARY.md "Deviations" #1). Same
  // underlying RBAC fact as before: a cashier-role session has close_tab
  // access and can reach + complete the pay step without a manager PIN gate
  // (src/shared/lib/rbac.ts CASHIER_ACTIONS includes close_tab).
  test('Cashier can reach and complete checkout payment (close_tab access, no manager PIN gate)', async ({
    page,
  }) => {
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
    await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    await logout(page);
  });

  test('Manager sees Reports on home dashboard and can access it', async ({ page }) => {
    await loginAs(page, 'manager');
    await expect(page.getByRole('button', { name: 'Reports' })).toBeVisible();
    await page.getByRole('button', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports/, { timeout: 15_000 });
    await logout(page);
  });

  test('Admin can access Settings', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 20_000 });
    await logout(page);
  });

  // D-07: /pos was deleted in Phase 1 (Plan 01-11) — the "new tab"/"open
  // tabs" drawer this test drives lived exclusively in OrderPanel, deleted
  // wholesale alongside /pos (01-11-SUMMARY.md "Deviations" #1); no other
  // route mounts that drawer. Additionally, this test's own premise no
  // longer holds independent of /pos: migration 20260420000006_rls_updates.sql
  // ("TABS — bartenders see all tabs (not restricted to own shift)") replaced
  // the earlier own-shift-scoped tabs_select_bartender RLS policy with one
  // gated only on the view_all_tabs permission — bartenders now see every
  // open tab, not just their own, at the RLS level. Skipped, not deleted
  // (this plan's scope was T6/T7/T10 + the two Close Tab/Pay tests only).
  test.skip("Bartender B does not see Bartender A's tab in drawer", async ({ page }) => {
    // ?? '' + test.skip(), not `!` non-null assertions, matches this
    // suite's established env-var-guard convention (see SM4 in
    // staff-management.spec.ts).
    const bartenderBName = process.env['E2E_BARTENDER_B_NAME'] ?? '';
    const bartenderBPin = process.env['E2E_BARTENDER_B_PIN'] ?? '';
    test.skip(!bartenderBName || !bartenderBPin, 'Set E2E_BARTENDER_B_NAME and E2E_BARTENDER_B_PIN for second bartender');

    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /new tab/i }).click();
    await page.getByLabel(/customer name/i).fill('RBAC Owner Tab A');
    await page.getByRole('button', { name: 'Open Tab' }).click();
    await expect(page.getByText(/tab opened/i)).toBeVisible({ timeout: 20_000 });
    await logout(page);

    await loginAsNamed(page, bartenderBName, bartenderBPin);
    await page.getByRole('button', { name: /open tabs/i }).click();
    await expect(page.getByRole('button', { name: /tab for rbac owner tab a/i })).toHaveCount(0);
    await logout(page);
  });

  // SALE-01 (Phase 5): the void-order feature (client component, edge function,
  // RBAC grants) was deleted end-to-end — see .planning/phases/05-delete-void-order-feature/.
  // This test proves the control is unreachable from any screen it could
  // plausibly have appeared on, replacing the deleted e2e/18-void-order.spec.ts
  // and the two dialog-behavior tests (T8/T9) that used to drive it via the
  // long-gone /pos tab-based flow. No seeded order is needed — this only
  // proves the trigger control's absence, not any order lifecycle.
  test('void-order control is absent from every screen it could plausibly appear on', async ({ page }) => {
    await loginAs(page, 'manager'); // manager/admin previously had the void_order grant
    for (const path of ['/pos', '/payments']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: /void order/i })).toHaveCount(0);
      await expect(page.getByRole('alertdialog', { name: /void order/i })).toHaveCount(0);
    }
    await logout(page);
  });

  // Rewritten against the CURRENT direct-sale checkout UI, same pattern as
  // the cashier test above. Same underlying RBAC fact: manager has close_tab
  // access too (MANAGER_ACTIONS inherits CASHIER_ACTIONS in rbac.ts).
  test('Manager can reach and complete checkout payment (close_tab access)', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
    await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    await logout(page);
  });

  test('T-RBAC-page: admin can access /rbac page and open per-row edit role dialog', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await page.goto('/rbac');
    await expect(page.getByRole('heading', { name: /roles & permissions/i })).toBeVisible({ timeout: 20_000 });

    // Staff table should render with Edit Role buttons
    const firstEditBtn = page.getByRole('button', { name: /edit role/i }).first();
    await expect(firstEditBtn).toBeVisible({ timeout: 10_000 });

    // Click first Edit Role button — dialog should open
    await firstEditBtn.click();
    await expect(page.getByRole('dialog', { name: /edit staff role/i })).toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('T-RBAC-redirect: non-admin (bartender) visiting /rbac is redirected to /home', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto('/rbac');
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
    await logout(page);
  });

  test('T12: non-admin (manager) visiting /rbac is redirected to /home', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/rbac');
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
    await logout(page);
  });

  test('T14: admin sees Roles & Permissions tile on home dashboard', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/home');
    await expect(
      page.getByRole('button', { name: /roles.*permissions/i })
    ).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });
});

test.describe('Phase 13: Permission Matrix', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(550);
    await page.goto('/');
  });

  test('T-RP-01: Admin sees permission matrix on /rbac page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAs(page, 'admin');
    await page.goto('/rbac');

    // Permission Matrix heading visible
    await expect(page.getByText('Permission Matrix')).toBeVisible({ timeout: 20_000 });

    // Table has 22 action rows — Plan 01-13 (commit 3cc9c7f) pruned 7 orphaned
    // STAFF_ACTIONS entries (transfer_tab, start_pool_timer, stop_pool_timer,
    // view_kds, view_kds_bar, produce_prep_batch, manage_waitlist) shrinking
    // STAFF_ACTIONS from 26 to 19; Phase 5 (SALE-01) then removed 'void_order'
    // (05-01-PLAN.md), shrinking it further from 19 to 18; Phase 23 added
    // confirm_transfer_payment/dispute_transfer_payment (18 -> 20); Phase 27
    // (PROMO-01/05, Plan 01) added manage_promotions/apply_custom_discount
    // (20 -> 22).
    // Each row has an action label in the first column
    await expect(page.getByText('create_order').first()).toBeVisible();
    await expect(page.getByText('manage_staff').first()).toBeVisible();
    await expect(page.getByText('clock_in').first()).toBeVisible();

    // Switch elements present (22 rows × 4 roles = 88 switches)
    const switches = page.getByRole('switch');
    await expect(switches).toHaveCount(88);

    expect(consoleErrors).toHaveLength(0);
  });

  test('T-RP-02: Admin can toggle a permission via the matrix', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAs(page, 'admin');
    await page.goto('/rbac');

    // Wait for matrix to load
    await expect(page.getByText('Permission Matrix')).toBeVisible({ timeout: 20_000 });

    // Find the 'kitchen / clock_in' switch (kitchen now grants only
    // clock_in/clock_out per Plan 01-13's RBAC prune — view_kds no longer
    // exists as an action, commit 3cc9c7f).
    const kitchenClockInSwitch = page.getByRole('switch', { name: 'Kitchen can clock_in', exact: true });
    await expect(kitchenClockInSwitch).toBeChecked();

    // Toggle it off
    await kitchenClockInSwitch.click();
    await expect(kitchenClockInSwitch).not.toBeChecked();

    // Toggle it back on
    await kitchenClockInSwitch.click();
    await expect(kitchenClockInSwitch).toBeChecked();

    expect(consoleErrors).toHaveLength(0);
  });

  test('T-RP-03: Bartender is redirected from /rbac to /home', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAs(page, 'cashier');
    await page.goto('/rbac');
    await page.waitForURL(/\/home/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/home/);

    expect(consoleErrors).toHaveLength(0);
  });

  test('T-RP-04: Kitchen user cannot read payments table (RLS blocks)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Log in as kitchen user
    await loginAs(page, 'kitchen');

    // Attempt to navigate to payments page — should either redirect or show empty
    await page.goto('/payments');

    // The payments page should not show any payment records
    // (RLS blocks kitchen from reading payments table)
    // Either: redirected away, or: shows empty state / no payment rows
    const paymentRows = page.locator('[data-testid="payment-row"]');
    await expect(paymentRows).toHaveCount(0);

    expect(consoleErrors).toHaveLength(0);
  });

  test('T-RP-05: process_refund is blocked for bartender at DB level', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAs(page, 'cashier');

    // Navigate to payments page — bartender can see payments, some may have refund buttons
    await page.goto('/payments');

    // Look for any refund button visible on the page
    const refundButton = page.getByRole('button', { name: /refund/i }).first();
    const refundVisible = await refundButton.isVisible({ timeout: 3_000 }).catch(() => false);

    if (refundVisible) {
      await refundButton.click();
      // The refund action should fail with an AUTH_FORBIDDEN toast
      // process_refund RPC is guarded to manager+ via get_user_role() check
      await expect(
        page.getByText(/forbidden|not allowed|unauthorized/i)
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // No refund button visible — bartender is already blocked at UI level
      // This is also acceptable: the UI hides the refund button for bartenders
      const stillNotVisible = !(await page
        .getByRole('button', { name: /refund/i })
        .isVisible()
        .catch(() => false));
      expect(stillNotVisible).toBe(true);
    }

    expect(consoleErrors).toHaveLength(0);
  });
});
