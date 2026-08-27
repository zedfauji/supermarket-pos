import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  clearStockThreshold,
  getInventoryQty,
  getLatestInventoryLog,
  openCaja,
  resetTestState,
  seedOpenTab,
  setInventoryQty,
  setStockThreshold,
} from '../helpers/supabase';

const PRODUCT = process.env.E2E_INVENTORY_PRODUCT_NAME?.trim() || 'MDH Garam Masala 100g';

test.describe('Inventory Decrement', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(560);
    await page.goto('/');
  });

  test.afterEach(async () => {
    // Both low-stock tests below set an explicit threshold — clear it so a
    // later spec file that relies on this product's seeded default
    // (stock_threshold: 15, per scripts/seed-dev-data.ts) doesn't inherit a
    // stale value left by these tests.
    await clearStockThreshold(PRODUCT).catch(() => undefined);
  });

  // This test's actual subject is the DB-level inventory-decrement trigger
  // (`trigger_decrement_inventory_on_order_item`, supabase/migrations/
  // 20260414000008_triggers.sql), which fires on any `order_items` INSERT
  // regardless of which client performed it — seeding the order directly via
  // `seedOpenTab` exercises the real decrement path without depending on any
  // particular checkout UI.
  test('Inventory decrements after order', async () => {
    const before = await getInventoryQty(PRODUCT);
    await seedOpenTab({ customerName: 'Inv Dec Tab', withItem: true, productName: PRODUCT });
    const after = await getInventoryQty(PRODUCT);
    expect(after).toBe(before - 1);
  });

  // The real current low-stock UI surface is entities/inventory's
  // `LowStockBadge` (data-testid="low-stock-badge") on /inventory — confirmed
  // this session that `widgets/LowStockAlert` (what these two tests
  // originally targeted) has zero callers anywhere in src/pages, src/widgets,
  // or src/app and is orphaned dead code from the pre-direct-sale-checkout
  // /pos page. LowStockBadge is the real surface that replaced it.
  //
  // Visibility-to-role: LowStockBadge previously rendered for every
  // authenticated role visiting /inventory (no gate at all — /inventory's
  // route itself only checks authentication, not adjust_inventory). That
  // didn't preserve either original test's assertion intent (visible to
  // manager, hidden from cashier), and the plan's own threat register
  // (T-17-12, Information Disclosure, disposition: mitigate) calls this out
  // as a real RBAC-adjacent visibility boundary, not a cosmetic one — so
  // src/pages/inventory/index.tsx now gates <LowStockBadge /> behind the same
  // adjust_inventory check already used for the Physical Count button.
  //
  //
  // bug-19 (commit f0fa31e) briefly added a route-level gate on /inventory
  // that redirected any non-adjust_inventory role to /home — that broke
  // Phase 27's D-11 decision (cashier/bartender must be able to reach
  // /inventory to open a unit; only correct/void require manager+, per
  // 27-08-PLAN's threat model T-27-19). Reverted: the route stays reachable
  // by any authenticated staff, and per-control gates (this badge, the
  // Physical Count button, Adjust/Export CSV) remain the only RBAC boundary.
  test('Low stock alert visible to manager', async ({ page }) => {
    await setStockThreshold(PRODUCT, 10);
    await setInventoryQty(PRODUCT, 1);
    await loginAs(page, 'manager');
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: /inventory/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('low-stock-badge')).toBeVisible({ timeout: 20_000 });
    await logout(page);
  });

  test('Low stock alert hidden from cashier', async ({ page }) => {
    await setStockThreshold(PRODUCT, 10);
    await setInventoryQty(PRODUCT, 1);
    await loginAs(page, 'cashier');
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: /inventory/i })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('low-stock-badge')).toHaveCount(0);
    await logout(page);
  });

  test('T4: manager adjusts inventory UP by 5 (delivery reason)', async ({ page }) => {
    test.setTimeout(120_000);
    const before = await getInventoryQty(PRODUCT);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const heading = page.getByRole('heading', { name: /inventory/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Find the product row
    const productRow = page.getByText(PRODUCT).first();
    await expect(productRow).toBeVisible({ timeout: 15_000 });

    // Click adjust button
    const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
    await expect(adjustBtn).toBeVisible({ timeout: 10_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const productSelect = dialog.getByLabel(/product/i).first();
    await productSelect.selectOption({ label: PRODUCT });
    const deltaInput = dialog.getByLabel(/quantity|delta|amount/i).first();
    await deltaInput.fill('5');
    const reasonSelect = dialog.getByLabel(/reason/i);
    await expect(reasonSelect).toBeVisible({ timeout: 5_000 });
    await reasonSelect.selectOption('delivery');
    await dialog.getByRole('button', { name: /save|adjust|apply|confirm/i }).click();
    await expect(page.getByText(/adjusted|updated|saved/i)).toBeVisible({ timeout: 15_000 });

    const after = await getInventoryQty(PRODUCT);
    expect(after).toBe(before + 5);

    const log = await getLatestInventoryLog(PRODUCT, 'delivery');
    expect(log).not.toBeNull();
    expect(log?.reason).toBe('delivery');
    expect(log?.quantity_delta).toBe(5);
    await logout(page);
  });

  // Confirms the fix in InventoryRow.tsx's QuantityAdjustCell (wrapping
  // <QuantityControl> in <ProtectedAction action="adjust_inventory">)
  // didn't regress the manager path — before this test, the stepper had
  // zero coverage in either direction.
  test('T4b: manager uses the inline quantity stepper to adjust stock', async ({ page }) => {
    test.setTimeout(90_000);
    const before = await getInventoryQty(PRODUCT);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const heading = page.getByRole('heading', { name: /inventory/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const productRow = page.getByRole('row', { name: new RegExp(PRODUCT) });
    await expect(productRow).toBeVisible({ timeout: 15_000 });

    const increaseBtn = productRow.getByRole('button', { name: /increase quantity/i });
    await expect(increaseBtn).toBeEnabled({ timeout: 10_000 });
    await increaseBtn.click();

    await expect
      .poll(async () => getInventoryQty(PRODUCT), { timeout: 15_000 })
      .toBe(before + 1);

    const log = await getLatestInventoryLog(PRODUCT, 'manual_adjustment');
    expect(log).not.toBeNull();
    expect(log?.reason).toBe('manual_adjustment');
    expect(log?.quantity_delta).toBe(1);

    await logout(page);
  });

  test('T5: manager adjusts inventory DOWN by 2 (waste reason)', async ({ page }) => {
    test.setTimeout(120_000);
    const before = await getInventoryQty(PRODUCT);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const heading = page.getByRole('heading', { name: /inventory/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
    await expect(adjustBtn).toBeVisible({ timeout: 10_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const productSelect = dialog.getByLabel(/product/i).first();
    await productSelect.selectOption({ label: PRODUCT });
    const deltaInput = dialog.getByLabel(/quantity|delta|amount/i).first();
    await deltaInput.fill('-2');
    const reasonSelect = dialog.getByLabel(/reason/i);
    await expect(reasonSelect).toBeVisible({ timeout: 5_000 });
    await reasonSelect.selectOption('waste');
    await dialog.getByRole('button', { name: /save|adjust|apply|confirm/i }).click();
    await expect(page.getByText(/adjusted|updated|saved/i)).toBeVisible({ timeout: 15_000 });

    const after = await getInventoryQty(PRODUCT);
    expect(after).toBe(before - 2);

    const log = await getLatestInventoryLog(PRODUCT, 'waste');
    expect(log).not.toBeNull();
    expect(log?.reason).toBe('waste');
    expect(log?.quantity_delta).toBe(-2);
    await logout(page);
  });

  test('T5b: reason picker exposes exactly 6 D-01 values, no bar-pos-era leaks', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const heading = page.getByRole('heading', { name: /inventory/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
    await expect(adjustBtn).toBeVisible({ timeout: 10_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const reasonSelect = dialog.getByLabel(/reason/i);
    await expect(reasonSelect).toBeVisible({ timeout: 5_000 });

    const optionValues = await reasonSelect.locator('option').evaluateAll(opts =>
      opts.map(o => (o as HTMLOptionElement).value).filter(v => v !== '')
    );
    expect(optionValues).toHaveLength(6);
    expect(optionValues).toEqual([
      'waste',
      'expired',
      'delivery',
      'correction',
      'manual_adjustment',
      'physical_count',
    ]);
    for (const deadValue of ['prep_production', 'prep_consumption', 'combo_component', 'refund', 'void']) {
      expect(optionValues).not.toContain(deadValue);
    }
    await logout(page);
  });

  test('T5c: manager adjusts inventory with "expired" reason — persists and reads back', async ({ page }) => {
    test.setTimeout(120_000);
    const before = await getInventoryQty(PRODUCT);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const heading = page.getByRole('heading', { name: /inventory/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
    await expect(adjustBtn).toBeVisible({ timeout: 10_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const productSelect = dialog.getByLabel(/product/i).first();
    await productSelect.selectOption({ label: PRODUCT });
    const deltaInput = dialog.getByLabel(/quantity|delta|amount/i).first();
    await deltaInput.fill('-1');
    const reasonSelect = dialog.getByLabel(/reason/i);
    await expect(reasonSelect).toBeVisible({ timeout: 5_000 });
    await reasonSelect.selectOption('expired');
    await dialog.getByRole('button', { name: /save|adjust|apply|confirm/i }).click();
    await expect(page.getByText(/adjusted|updated|saved/i)).toBeVisible({ timeout: 15_000 });

    const after = await getInventoryQty(PRODUCT);
    expect(after).toBe(before - 1);

    const log = await getLatestInventoryLog(PRODUCT, 'expired');
    expect(log).not.toBeNull();
    expect(log?.reason).toBe('expired');
    expect(log?.quantity_delta).toBe(-1);
    await logout(page);
  });

  test('T5d: submitting the batch-adjust form without a reason is blocked client-side', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const heading = page.getByRole('heading', { name: /inventory/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
    await expect(adjustBtn).toBeVisible({ timeout: 10_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const productSelect = dialog.getByLabel(/product/i).first();
    // Select a real product, leave delta at its default '1', but never touch
    // the reason picker — it must still default to '' (no default selection).
    const productOptionValues = await productSelect.locator('option').evaluateAll(opts =>
      opts.map(o => (o as HTMLOptionElement).value).filter(v => v !== '')
    );
    if (productOptionValues[0]) {
      await productSelect.selectOption(productOptionValues[0]);
    }
    await dialog.getByRole('button', { name: /save|adjust|apply|confirm/i }).click();
    await expect(page.getByText(/choose a product, quantity, and reason/i)).toBeVisible({
      timeout: 10_000,
    });
    // Dialog stays open — the mutation was never invoked.
    await expect(dialog).toBeVisible();
    await logout(page);
  });

  test('T6: cashier navigates to /inventory — read-only view, no Adjust access', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');
    await page.goto('/inventory');

    // Either redirected to /home or shows read-only view without adjust button
    const redirected = await page
      .waitForURL(/\/home/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!redirected) {
      // Read-only: shared/ui's ProtectedAction (src/shared/ui/ProtectedAction.tsx)
      // renders RBAC-denied actions disabled-with-tooltip rather than
      // unmounted, so the Adjust button is still present in the DOM — assert
      // it's disabled, not absent.
      const adjustBtn = page.getByRole('button', { name: /adjust/i }).first();
      const adjustBtnExists = await adjustBtn.count();
      if (adjustBtnExists > 0) {
        await expect(adjustBtn).toBeDisabled();
      }
    } else {
      expect(redirected).toBe(true);
    }
    await logout(page);
  });
});
