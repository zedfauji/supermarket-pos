/**
 * E2E spec — receipt category/modifier grouping (SC-2b).
 *
 * Verifies process-payment returns categoryId/categoryName/modifierNames per
 * line item, and buildThermalReceiptText renders them as category headers
 * plus an indented "  + <modifier>" line (see groupOrderItemsForReceipt.ts).
 *
 * Moved from e2e/49-receipt-category-grouping.spec.ts (Phase 17 Plan 10,
 * D-06/D-07). SC-4 (cross-surface comparison against the bar/pool-parlour
 * kitchen-display board) is deleted outright per D-08 — that board was
 * removed wholesale in Phase 1 with no substitute surface to compare the
 * receipt against; it is not ported here, not left as `test.skip`.
 *
 * Seeding: order rows are inserted directly via the service-role client
 * (mirrors e2e/payments/split-payment.spec.ts's seedOpenTab pattern) rather
 * than driven through the product-picker UI, so the test is not coupled to
 * which products/modifiers happen to be linked via product_modifiers.
 *
 * Requires .env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 */
import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

/** Illustrative modifier seeded on the Indian grocery catalog (scripts/seed-dev-data.ts). */
const MODIFIER_EXTRA_SPICY_NAME = 'Extra Spicy';

interface CategoryPick {
  modifierProductId: string;
  modifierProductUnitPrice: number;
  modifierProductCategoryName: string;
  modifierId: string;
  otherProductId: string;
  otherUnitPrice: number;
  otherCategoryName: string;
}

/**
 * Resolves the product carrying the seeded "Extra Spicy" modifier and a
 * second, differently-named category + product, both real rows from the
 * catalog — no fixture/mock products. Scoped to `routing: 'NONE'` categories
 * (every Indian-catalog category, per scripts/seed-dev-data.ts) so a stray
 * pre-Phase-1 bar/pool category left over in a shared dev database can't be
 * picked as the "second" category.
 */
async function pickTwoCategoryProducts(db: ReturnType<typeof getServiceClient>): Promise<CategoryPick> {
  const { data: modifier, error: modifierErr } = await db
    .from('modifiers')
    .select('id')
    .eq('name', MODIFIER_EXTRA_SPICY_NAME)
    .limit(1)
    .maybeSingle();
  if (modifierErr || !modifier) throw new Error(`pickTwoCategoryProducts: no "${MODIFIER_EXTRA_SPICY_NAME}" modifier found – ${modifierErr?.message}`);

  const { data: link, error: linkErr } = await db
    .from('product_modifiers')
    .select('product_id')
    .eq('modifier_id', (modifier as { id: string }).id)
    .limit(1)
    .maybeSingle();
  if (linkErr || !link) throw new Error(`pickTwoCategoryProducts: no product linked to "${MODIFIER_EXTRA_SPICY_NAME}" – ${linkErr?.message}`);

  const { data: modifierProduct, error: modifierProdErr } = await db
    .from('products')
    .select('id, base_price, category_id')
    .eq('id', (link as { product_id: string }).product_id)
    .eq('is_active', true)
    .maybeSingle();
  if (modifierProdErr || !modifierProduct) throw new Error(`pickTwoCategoryProducts: modifier-linked product not found or inactive – ${modifierProdErr?.message}`);

  const { data: modifierCat, error: modifierCatErr } = await db
    .from('categories')
    .select('id, name')
    .eq('id', (modifierProduct as { category_id: string }).category_id)
    .maybeSingle();
  if (modifierCatErr || !modifierCat) throw new Error(`pickTwoCategoryProducts: category not found for modifier product – ${modifierCatErr?.message}`);

  // Pick the second category+product in one joined query rather than
  // "any routing=NONE category" then "any active product in it" — a
  // routing=NONE category with zero active products (e.g. the shared
  // "Uncategorized" fallback category the agent-chat import pipeline
  // creates on first use, see menuTools.ts's resolveCategoryId) can
  // otherwise be picked and leave no product to seed the tab with.
  const { data: otherProduct, error: otherProdErr } = await db
    .from('products')
    .select('id, base_price, category_id, categories!inner(id, name, routing)')
    .eq('categories.routing', 'NONE')
    .neq('category_id', (modifierCat as { id: string }).id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (otherProdErr || !otherProduct) {
    throw new Error(`pickTwoCategoryProducts: no second category with an active product found – ${otherProdErr?.message}`);
  }
  const otherCat = (otherProduct as unknown as { categories: { id: string; name: string } }).categories;

  return {
    modifierProductId: (modifierProduct as { id: string }).id,
    modifierProductUnitPrice: Number((modifierProduct as { base_price: number }).base_price),
    modifierProductCategoryName: (modifierCat as { name: string }).name,
    modifierId: (modifier as { id: string }).id,
    otherProductId: (otherProduct as { id: string }).id,
    otherUnitPrice: Number((otherProduct as { base_price: number }).base_price),
    otherCategoryName: (otherCat as { name: string }).name,
  };
}

/**
 * Seed an open tab with two order_items spanning two categories; the
 * modifier-linked item carries the real "Extra Spicy" modifier via
 * `modifier_ids` (the array column both process-payment and the removed
 * kitchen-display feature's queries used to read from — see file header).
 * Owned by the exact "Manager Test"
 * fixture's shift — useTabs() unconditionally filters
 * `.eq('shift_id', shiftId)` on the CURRENT viewer's own shift
 * (src/entities/tab/model/queries.ts), so the seeded tab's shift must belong
 * to the same staff member that logs in to pay it. A plain `role: 'manager'`
 * filter is not safe on a shared dev DB carrying leftover synthetic manager
 * fixtures from other test suites (row order is unspecified without
 * ORDER BY) — match by E2E_MANAGER_NAME instead, the same env var
 * loginAs(page, 'manager') resolves to (helpers/auth.ts).
 */
async function seedTwoCategoryTabWithModifier(
  db: ReturnType<typeof getServiceClient>,
  customerName: string,
  pick: CategoryPick
): Promise<{ tabId: string }> {
  const managerName = process.env['E2E_MANAGER_NAME'] ?? '';
  if (!managerName) throw new Error('seedTwoCategoryTabWithModifier: missing E2E_MANAGER_NAME');
  const { data: profile } = await db.from('profiles').select('id').eq('name', managerName).eq('role', 'manager').limit(1).maybeSingle();
  if (!profile) throw new Error('seedTwoCategoryTabWithModifier: no manager profile found');

  let shiftId: string;
  const { data: existingShift } = await db
    .from('shifts')
    .select('id')
    .eq('staff_id', profile.id)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = (existingShift as { id: string }).id;
  } else {
    const { data: newShift, error: shiftErr } = await db
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftErr || !newShift) throw new Error(`seedTwoCategoryTabWithModifier: shift create failed – ${shiftErr?.message}`);
    shiftId = (newShift as { id: string }).id;
  }

  const { data: tab, error: tabErr } = await db
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
  if (tabErr || !tab) throw new Error(`seedTwoCategoryTabWithModifier: tab insert failed – ${tabErr?.message}`);

  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: profile.id, status: 'pending' })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(`seedTwoCategoryTabWithModifier: order insert failed – ${orderErr?.message}`);

  const { error: itemsErr } = await db.from('order_items').insert([
    {
      order_id: order.id,
      product_id: pick.modifierProductId,
      quantity: 1,
      unit_price: pick.modifierProductUnitPrice,
      modifier_price_delta: 0,
      modifier_ids: [pick.modifierId],
    },
    {
      order_id: order.id,
      product_id: pick.otherProductId,
      quantity: 1,
      unit_price: pick.otherUnitPrice,
      modifier_price_delta: 0,
      modifier_ids: [],
    },
  ]);
  if (itemsErr) throw new Error(`seedTwoCategoryTabWithModifier: order_items insert failed – ${itemsErr.message}`);

  return { tabId: tab.id as string };
}

/**
 * D-07 (pre-Phase-2 pivot): the old tabs-based /pos was deleted, so this
 * completed-sale checkout is driven through /payments' inline PaymentForm
 * instead — mirrors e2e/payments/core-payments.spec.ts's payment test.
 * Uses gotoAuthed (not a plain page.goto) — a full page.goto reload can
 * occasionally lose the race against ProtectedRoute's first render and
 * bounce to the staff picker (see helpers/auth.ts's gotoAuthed doc comment);
 * gotoAuthed retries once through the exact same bounce this test hit.
 */
async function selectTabAndVerifyPin(page: Page, customerName: string): Promise<void> {
  await gotoAuthed(page, '/payments');

  const tabList = page.getByTestId('tabs-waiting-for-payment');
  await expect(tabList).toBeVisible({ timeout: 20_000 });
  const escapedName = customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await tabList.getByRole('button', { name: new RegExp(`tab ${escapedName}`, 'i') }).click();

  await page.getByRole('button', { name: /verify pin to process payment/i }).click();
  const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });
  // E2E_MANAGER_PIN (not E2E_ADMIN_PIN) — the "Manager Test" E2E fixture's
  // `profiles.locale` is 'en-US', matching every English-text locator in this
  // helper; the "Admin Test" fixture is 'es-MX' by default and would render
  // "Verificar PIN para procesar el pago" etc., silently timing out every
  // English matcher below. Login is also 'manager' (not 'admin') for the
  // same reason — see the login calls in both tests.
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
  for (const ch of managerPin) {
    await pinDialog.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
  }
  await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
}

/** Pays cash, waits for the Receipt screen, and returns the rendered `<pre>` text. */
async function payCashAndGetReceiptText(page: Page): Promise<string> {
  await page.getByTestId('payment-btn-cash').click();
  await page.getByLabel(/amount tendered/i).fill('500');
  await page.getByRole('button', { name: /process payment/i }).click();
  // exact: true — Playwright's default substring match against a customer
  // name containing the word "Receipt" (e.g. "E2E Receipt Grouping ...")
  // would otherwise resolve to that unrelated heading instead of the
  // receipt view's own exact "Receipt" heading.
  await expect(page.getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const text = await page.locator('pre').first().innerText();
  await page.getByRole('button', { name: 'Done' }).click();
  return text;
}

test.describe('Receipt category grouping', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async ({ page }) => {
    await logout(page).catch(() => undefined);
  });

  test('SC-2b: receipt shows both category headers and an indented modifier line after a real cash payment', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const db = getServiceClient();
    const pick = await pickTwoCategoryProducts(db);

    // This local dev database is shared by every concurrently-running E2E
    // worker in this repo's parallel wave-execution setup, and
    // resetTestState()/openCaja() are global (not test-run-scoped) — another
    // worker's beforeEach can void this test's just-seeded open tab (or close
    // its manager shift) in the few seconds between seeding and this test
    // reaching the payments page. Retry the seed+pay flow a bounded number of
    // times rather than accept a hard failure caused by another test run's
    // unrelated cleanup.
    let receiptText = '';
    let lastError: unknown;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const customerName = `E2E Receipt Grouping ${String(Date.now())}-${String(attempt)}`;
      await seedTwoCategoryTabWithModifier(db, customerName, pick);
      await loginAs(page, 'manager');
      try {
        await selectTabAndVerifyPin(page, customerName);
        receiptText = await payCashAndGetReceiptText(page);
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        await logout(page).catch(() => undefined);
      }
    }
    if (lastError) throw lastError;

    expect(receiptText).toContain(pick.modifierProductCategoryName);
    expect(receiptText).toContain(pick.otherCategoryName);
    // formatModifierLines() convention: two-space indent + "+ " + name.
    expect(receiptText).toMatch(new RegExp(`\\+\\s*${MODIFIER_EXTRA_SPICY_NAME}`));
  });
});
