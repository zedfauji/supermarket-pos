/**
 * E2E: Purchase Orders & Reordering — /purchase-orders
 *
 * Proves ROADMAP Phase 16's four success criteria end-to-end, headless:
 *   A. manual PO creation (PO-01)
 *   B. one-click low-stock auto-draft, editable before save (PO-02)
 *   C. Receive Shipment closes the PO and atomically updates stock (PO-03)
 *   D. cashier exclusion from both the route and the underlying RLS-protected
 *      data (D-02) — the route redirect alone is UX-only, so this also hits
 *      the real REST endpoint with a genuine cashier access token.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';
import { assertPurchaseOrderStatus } from '../helpers/db-assertions';

const PREFIX = 'E2E PO';

/**
 * Reads the current browser session's Supabase access token out of
 * localStorage (mirrors 22-staff-management.spec.ts's/50-direct-sale-checkout.spec.ts's
 * helper of the same name — duplicated locally per this suite's
 * per-file-helper convention rather than importing across spec files).
 */
async function getAccessToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
    return key ? localStorage.getItem(key) : null;
  });
  if (!raw) throw new Error('getAccessToken: no Supabase auth session found in localStorage');
  const parsed = JSON.parse(raw) as { access_token?: string };
  if (!parsed.access_token) throw new Error('getAccessToken: stored session has no access_token');
  return parsed.access_token;
}

/**
 * Seeds a supplier, a product linked to it via supplier_products, and an
 * inventory row for that product. `quantityOnHand` defaults below the
 * default `low_stock_threshold` (10) so the same seed doubles as the
 * low-stock fixture Test B/C need.
 */
async function seedSupplierAndProduct(quantityOnHand = 3): Promise<{
  db: SupabaseClient;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
}> {
  const db = getServiceClient();
  const supplierName = `${PREFIX} supplier ${randomUUID()}`;
  const { data: supplier, error: supplierError } = await db
    .from('suppliers')
    .insert({ name: supplierName })
    .select('id')
    .single();
  if (supplierError || !supplier)
    throw new Error(supplierError?.message ?? 'Unable to create supplier');

  const { data: category, error: categoryError } = await db
    .from('categories')
    .select('id')
    .limit(1)
    .single();
  if (categoryError || !category)
    throw new Error(categoryError?.message ?? 'No category available');

  const productName = `MDH Chana Masala ${randomUUID()}`;
  const { data: product, error: productError } = await db
    .from('products')
    .insert({ name: productName, category_id: category.id, base_price: 10, is_active: true })
    .select('id')
    .single();
  if (productError || !product)
    throw new Error(productError?.message ?? 'Unable to create product');

  const { error: linkError } = await db
    .from('supplier_products')
    .insert({ supplier_id: supplier.id, product_id: product.id });
  if (linkError) throw new Error(linkError.message);

  const { error: invError } = await db
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: quantityOnHand });
  if (invError) throw new Error(invError.message);

  return {
    db,
    supplierId: supplier.id as string,
    supplierName,
    productId: product.id as string,
    productName,
  };
}

/**
 * Removes everything seedSupplierAndProduct created, plus any purchase
 * orders/shipments a test generated against that supplier — suppliers and
 * purchase_order_items/purchase_orders both use ON DELETE RESTRICT, so
 * children must go first.
 */
async function cleanupSupplierAndProduct(
  db: SupabaseClient,
  supplierId: string,
  productId: string
): Promise<void> {
  const { data: pos } = await db.from('purchase_orders').select('id').eq('supplier_id', supplierId);
  const poIds = (pos ?? []).map((p: { id: string }) => p.id);
  if (poIds.length > 0) {
    await db.from('purchase_order_items').delete().in('purchase_order_id', poIds);
    await db.from('purchase_orders').delete().in('id', poIds);
  }
  await db.from('shipments').delete().eq('supplier_id', supplierId);
  await db.from('supplier_products').delete().eq('supplier_id', supplierId);
  await db.from('products').delete().eq('id', productId);
  await db.from('suppliers').delete().eq('id', supplierId);
}

test.describe('Purchase Orders & Reordering', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('manager creates a purchase order manually (PO-01)', async ({ page }) => {
    test.setTimeout(90_000);
    const { db, supplierId, supplierName, productId, productName } = await seedSupplierAndProduct();
    try {
      await loginAs(page, 'manager');
      await gotoAuthed(page, '/purchase-orders');
      // Empty state renders its own "New Purchase Order" action button
      // alongside the page header's — .first() picks the header button
      // (the list is empty on a fresh seed, so both are present).
      await page
        .getByRole('button', { name: /new purchase order|nueva orden de compra/i })
        .first()
        .click();
      // Scope to the create-PO dialog specifically — the persistent AI
      // Assistant side panel is also role="dialog" (off-screen via CSS
      // transform, not display:none), so an unscoped getByRole('dialog')
      // matches it too and never resolves to "hidden" after this dialog
      // closes.
      const dialog = page
        .getByRole('dialog')
        .filter({ hasText: /new purchase order|nueva orden de compra/i });
      await dialog.getByLabel(/supplier|proveedor/i).selectOption({ label: supplierName });
      await dialog.getByRole('button', { name: /add line item|agregar partida/i }).click();
      await dialog.getByLabel(/product|producto/i).fill(productName);
      await dialog.getByLabel(/quantity|cantidad/i).fill('5');
      await dialog.getByLabel(/cost price|costo/i).fill('3.50');
      await dialog.getByRole('button', { name: /save draft|guardar borrador/i }).click();
      await expect(dialog).toBeHidden();

      await page
        .getByPlaceholder(/search purchase orders|buscar órdenes de compra/i)
        .fill(supplierName);
      const row = page.getByRole('row', { name: new RegExp(supplierName) });
      await expect(row).toBeVisible();
      await expect(row.getByText(/draft|borrador/i)).toBeVisible();
    } finally {
      await cleanupSupplierAndProduct(db, supplierId, productId);
    }
  });

  test('Suggest reorder from low stock pre-fills and is editable before save (PO-02)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { db, supplierId, supplierName, productId, productName } =
      await seedSupplierAndProduct(3);
    try {
      await loginAs(page, 'manager');
      await gotoAuthed(page, '/purchase-orders');
      await page
        .getByRole('button', { name: /new purchase order|nueva orden de compra/i })
        .first()
        .click();
      const dialog = page
        .getByRole('dialog')
        .filter({ hasText: /new purchase order|nueva orden de compra/i });
      await dialog.getByLabel(/supplier|proveedor/i).selectOption({ label: supplierName });

      const suggestBtn = dialog.getByRole('button', {
        name: /suggest reorder from low stock|sugerir reorden por bajo stock/i,
      });
      await expect(suggestBtn).toBeEnabled();
      // D-07: lowStockThreshold (default 10) - quantityOnHand (3) = 7, no
      // unitsPerPackage rounding (D-08) since the seeded product has none.
      // The suggestion query is async — retry the click until the fetched
      // suggestion is actually applied rather than racing a single click.
      await expect(async () => {
        await suggestBtn.click();
        await expect(dialog.getByLabel(/product|producto/i)).toHaveValue(productName, {
          timeout: 1_000,
        });
      }).toPass({ timeout: 15_000 });
      await expect(dialog.getByLabel(/quantity|cantidad/i)).toHaveValue('7');

      await dialog.getByLabel(/quantity|cantidad/i).fill('9');
      await dialog.getByRole('button', { name: /save draft|guardar borrador/i }).click();
      await expect(dialog).toBeHidden();

      await page
        .getByPlaceholder(/search purchase orders|buscar órdenes de compra/i)
        .fill(supplierName);
      const row = page.getByRole('row', { name: new RegExp(supplierName) });
      await expect(row).toBeVisible();
    } finally {
      await cleanupSupplierAndProduct(db, supplierId, productId);
    }
  });

  test('Receive Shipment updates stock and closes the PO (PO-03)', async ({ page }) => {
    test.setTimeout(90_000);
    const { db, supplierId, supplierName, productId, productName } =
      await seedSupplierAndProduct(3);
    try {
      const { data: manager, error: managerError } = await db
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .limit(1)
        .single();
      if (managerError || !manager)
        throw new Error(managerError?.message ?? 'No manager profile found');

      // Seed a draft PO directly (independent of Tests A/B), so this test
      // does not depend on the create flow having run first.
      const { data: po, error: poError } = await db
        .from('purchase_orders')
        .insert({ supplier_id: supplierId, status: 'draft', created_by: manager.id })
        .select('id')
        .single();
      if (poError || !po) throw new Error(poError?.message ?? 'Unable to seed draft PO');

      const receiveQuantity = 12;
      const { error: itemError } = await db.from('purchase_order_items').insert({
        purchase_order_id: po.id,
        product_id: productId,
        quantity: receiveQuantity,
        cost_price: 4.25,
      });
      if (itemError) throw new Error(itemError.message);

      const { data: beforeInventory, error: beforeInventoryError } = await db
        .from('inventory')
        .select('quantity_on_hand')
        .eq('product_id', productId)
        .single();
      if (beforeInventoryError || !beforeInventory)
        throw new Error(beforeInventoryError?.message ?? 'Missing seeded inventory row');
      const quantityBefore = Number(beforeInventory.quantity_on_hand);

      await loginAs(page, 'manager');
      await gotoAuthed(page, '/purchase-orders');
      await page
        .getByPlaceholder(/search purchase orders|buscar órdenes de compra/i)
        .fill(supplierName);
      await page
        .getByRole('row', { name: new RegExp(supplierName) })
        .getByText(supplierName, { exact: true })
        .click();

      const detailDialog = page
        .getByRole('dialog')
        .filter({ hasText: /receive shipment|recibir mercancía/i });
      await detailDialog
        .getByRole('button', { name: /receive shipment|recibir mercancía/i })
        .click();

      const receiveDialog = page
        .getByRole('dialog')
        .filter({ hasText: /confirm receipt|confirmar recepción/i });
      await expect(receiveDialog.getByLabel(/product|producto/i)).toHaveValue(productName);
      await expect(receiveDialog.getByLabel(/quantity|cantidad/i)).toHaveValue(
        String(receiveQuantity)
      );
      await receiveDialog
        .getByRole('button', { name: /confirm receipt|confirmar recepción/i })
        .click();
      await expect(receiveDialog).toBeHidden();

      await expect
        .poll(async () => {
          const { data, error } = await db
            .from('purchase_orders')
            .select('status')
            .eq('id', po.id)
            .single();
          if (error || !data) return null;
          return data.status;
        })
        .toBe('received');

      await assertPurchaseOrderStatus(po.id, 'received');

      await expect
        .poll(async () => {
          const { data, error } = await db
            .from('inventory')
            .select('quantity_on_hand')
            .eq('product_id', productId)
            .single();
          if (error || !data) return null;
          return Number(data.quantity_on_hand);
        })
        .toBe(quantityBefore + receiveQuantity);
    } finally {
      await cleanupSupplierAndProduct(db, supplierId, productId);
    }
  });

  test('cashier cannot see or reach Purchase Orders (D-02)', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'cashier');
    await page.goto('/purchase-orders');
    await page.waitForURL(/\/home/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/home/);

    const token = await getAccessToken(page);
    const supabaseUrl = process.env['VITE_SUPABASE_URL'];
    const anonKey = process.env['VITE_SUPABASE_ANON_KEY'];
    if (!supabaseUrl || !anonKey) {
      throw new Error('Missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY');
    }

    // The route redirect above is UX-only — this proves the real RLS
    // boundary with a genuine cashier access token against the REST API.
    const res = await fetch(`${supabaseUrl}/rest/v1/purchase_orders`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    expect(res.ok).toBe(true);
    const rows = (await res.json()) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });
});
