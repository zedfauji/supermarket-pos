import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';
import { assertStockMovement } from '../helpers/db-assertions';

const PREFIX = 'E2E receiving';

async function createSupplier() {
  const db = getServiceClient();
  const name = `${PREFIX} supplier ${randomUUID()}`;
  const { data, error } = await db.from('suppliers').insert({ name }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Unable to create supplier');
  return { db, id: data.id, name };
}

async function openQuickAdd(
  page: Parameters<typeof loginAs>[0],
  supplierName: string,
  search: string
) {
  await gotoAuthed(page, '/suppliers');
  await page.getByRole('button', { name: /receive shipment|recibir/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/supplier|proveedor/i).selectOption({ label: supplierName });
  await dialog.getByRole('button', { name: /add line item|agregar partida/i }).click();
  await dialog.getByLabel(/product|producto/i).fill(search);
  await dialog.getByRole('button', { name: /add product|agregar producto/i }).click();
  return dialog;
}

test.describe('Supplier receiving quick-add', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('quick-add creates a sellable product and receives it in the same shipment', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { db, id: supplierId, name: supplierName } = await createSupplier();
    const barcode = `990${String(Date.now()).slice(-10)}`;
    const productName = `Everest Chana Masala ${randomUUID()}`;

    await loginAs(page, 'manager');
    const dialog = await openQuickAdd(page, supplierName, barcode);
    await dialog.getByLabel(/^name|^nombre/i).fill(productName);
    await dialog.getByLabel(/barcode|código de barras/i).fill(barcode);
    await dialog.getByLabel(/sale price|precio de venta/i).fill('12.34');
    await dialog
      .getByRole('button', { name: /add product|agregar producto/i })
      .last()
      .click();
    await expect(dialog.getByLabel(/product|producto/i)).toHaveValue(productName);
    await dialog.getByLabel(/quantity|cantidad/i).fill('4');
    await dialog.getByLabel(/cost price|costo/i).fill('5.67');
    await dialog.getByLabel(/expiry date|fecha de caducidad/i).fill('2030-01-02');
    await dialog.getByRole('button', { name: /confirm receipt|confirmar recepción/i }).click();

    const { data: product, error: productError } = await db
      .from('products')
      .select('id, is_active, base_price')
      .eq('barcode', barcode)
      .single();
    if (productError || !product)
      throw new Error(productError?.message ?? 'Quick-added product not found');
    expect(product.is_active).toBe(true);
    expect(Number(product.base_price)).toBe(12.34);
    await expect
      .poll(async () => {
        const { data, error } = await db
          .from('inventory')
          .select('quantity_on_hand, cost_price, expiry_date')
          .eq('product_id', product.id)
          .single();
        if (error || !data) return null;
        return {
          quantity: Number(data.quantity_on_hand),
          cost: Number(data.cost_price),
          expiry: data.expiry_date,
        };
      })
      .toEqual({ quantity: 4, cost: 5.67, expiry: '2030-01-02' });

    await assertStockMovement(product.id, 4, 'delivery');

    await db.from('shipments').delete().eq('supplier_id', supplierId);
    await db.from('products').delete().eq('id', product.id);
    await db.from('suppliers').delete().eq('id', supplierId);
  });

  test('quick-add rejects a barcode that already belongs to another product', async ({ page }) => {
    test.setTimeout(120_000);
    const { db, id: supplierId, name: supplierName } = await createSupplier();
    const barcode = `991${String(Date.now()).slice(-10)}`;
    const { data: category, error: categoryError } = await db
      .from('categories')
      .select('id')
      .limit(1)
      .single();
    if (categoryError || !category)
      throw new Error(categoryError?.message ?? 'No category available');
    const { data: existing, error: existingError } = await db
      .from('products')
      .insert({
        name: `MDH Garam Masala ${randomUUID()}`,
        category_id: category.id,
        base_price: 1,
        barcode,
        is_active: true,
      })
      .select('id')
      .single();
    if (existingError || !existing)
      throw new Error(existingError?.message ?? 'Unable to seed duplicate barcode');
    const countBefore = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('barcode', barcode);

    await loginAs(page, 'manager');
    const dialog = await openQuickAdd(page, supplierName, `Parle-G Biscuits ${randomUUID()}`);
    await dialog.getByLabel(/^name|^nombre/i).fill(`Haldiram's Namkeen ${randomUUID()}`);
    await dialog.getByLabel(/barcode|código de barras/i).fill(barcode);
    await dialog.getByLabel(/sale price|precio de venta/i).fill('12.34');
    await dialog
      .getByRole('button', { name: /add product|agregar producto/i })
      .last()
      .click();
    await expect(dialog.getByText(/already in your catalog|ya está en tu catálogo/i)).toBeVisible();
    const countAfter = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('barcode', barcode);
    expect(countAfter.count).toBe(countBefore.count);

    await db.from('products').delete().eq('id', existing.id);
    await db.from('suppliers').delete().eq('id', supplierId);
  });

  test('rejects a later invalid line without receiving earlier lines', async () => {
    const { db, id: supplierId } = await createSupplier();
    const { data: manager, error: managerError } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'manager')
      .limit(1)
      .single();
    const { data: inventory, error: inventoryError } = await db
      .from('inventory')
      .select('product_id, quantity_on_hand')
      .limit(1)
      .single();
    if (managerError || !manager || inventoryError || !inventory) {
      throw new Error(managerError?.message ?? inventoryError?.message ?? 'Missing receiving fixture');
    }

    const beforeQuantity = Number(inventory.quantity_on_hand);
    const { count: beforeShipments, error: beforeShipmentsError } = await db
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplierId);
    if (beforeShipmentsError) throw new Error(beforeShipmentsError.message);

    try {
      const result = await db.rpc('receive_shipment', {
        p_staff_id: manager.id,
        p_supplier_id: supplierId,
        p_items: [
          { product_id: inventory.product_id, quantity: 2, cost_price: 1, expiry_date: null },
          { product_id: randomUUID(), quantity: 1, cost_price: 1, expiry_date: null },
        ],
      });

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
      const { data: afterInventory, error: afterInventoryError } = await db
        .from('inventory')
        .select('quantity_on_hand')
        .eq('product_id', inventory.product_id)
        .single();
      if (afterInventoryError || !afterInventory) throw new Error(afterInventoryError?.message);
      expect(Number(afterInventory.quantity_on_hand)).toBe(beforeQuantity);
      const { count: afterShipments, error: afterShipmentsError } = await db
        .from('shipments')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplierId);
      if (afterShipmentsError) throw new Error(afterShipmentsError.message);
      expect(afterShipments).toBe(beforeShipments);
    } finally {
      await db.from('shipments').delete().eq('supplier_id', supplierId);
      await db.from('inventory').update({ quantity_on_hand: beforeQuantity }).eq('product_id', inventory.product_id);
      await db.from('suppliers').delete().eq('id', supplierId);
    }
  });
});
