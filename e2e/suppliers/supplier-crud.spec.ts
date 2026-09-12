/**
 * E2E: Supplier CRUD — /suppliers
 *
 * Covers the redesigned supplier dialog + list:
 *   A. create with contact details and a linked product (search + checkbox)
 *   B. inline validation (required name, invalid email) keeps the dialog open
 *   C. edit via row click — title switches to "Edit Supplier", changes persist
 *   D. delete is blocked with a clear toast when the supplier has a PO
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

const PREFIX = 'E2E supplier-crud';

async function seedProduct(db: SupabaseClient) {
  const { data: category, error: categoryError } = await db
    .from('categories')
    .select('id')
    .limit(1)
    .single();
  if (categoryError || !category) throw new Error(categoryError?.message ?? 'No category');
  const name = `${PREFIX} product ${randomUUID()}`;
  const { data, error } = await db
    .from('products')
    .insert({ name, category_id: category.id, base_price: 5, is_active: true })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Unable to create product');
  return { id: data.id as string, name };
}

async function seedSupplier(db: SupabaseClient, extra: Record<string, unknown> = {}) {
  const name = `${PREFIX} ${randomUUID()}`;
  const { data, error } = await db
    .from('suppliers')
    .insert({ name, ...extra })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Unable to create supplier');
  return { id: data.id as string, name };
}

async function cleanupSupplier(db: SupabaseClient, supplierId: string) {
  const { data: pos } = await db.from('purchase_orders').select('id').eq('supplier_id', supplierId);
  const poIds = (pos ?? []).map((p: { id: string }) => p.id);
  if (poIds.length) {
    await db.from('purchase_order_items').delete().in('purchase_order_id', poIds);
    await db.from('purchase_orders').delete().in('id', poIds);
  }
  await db.from('supplier_products').delete().eq('supplier_id', supplierId);
  await db.from('suppliers').delete().eq('id', supplierId);
}

const supplierDialog = (page: Parameters<typeof loginAs>[0]) =>
  page.getByRole('dialog', { name: /new supplier|nuevo proveedor|edit supplier|editar proveedor/i });

test.describe('Supplier CRUD', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('manager creates a supplier with contact details and a linked product', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const db = getServiceClient();
    const product = await seedProduct(db);
    const supplierName = `${PREFIX} ${randomUUID()}`;
    let supplierId: string | null = null;
    try {
      await loginAs(page, 'manager');
      await gotoAuthed(page, '/suppliers');
      await page
        .getByRole('button', { name: /new supplier|nuevo proveedor/i })
        .first()
        .click();

      const dialog = supplierDialog(page);
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(/^(name|nombre)\s*\*?$/i).fill(supplierName);
      await dialog.getByLabel(/contact name|nombre de contacto/i).fill('Ravi Patel');
      await dialog.getByLabel(/phone|teléfono/i).fill('+52 55 1234 5678');
      await dialog.getByLabel(/^(email|correo electrónico)$/i).fill('ravi@example.com');

      // Product picker: filter, then tick the seeded product.
      await dialog.getByPlaceholder(/search by name|buscar por nombre/i).fill(product.name);
      const checkbox = dialog.getByRole('checkbox', { name: new RegExp(product.name) });
      await expect(checkbox).toBeVisible();
      await checkbox.click();
      await expect(dialog.getByText(/1 (selected|seleccionados)/i)).toBeVisible();

      await dialog.getByRole('button', { name: /save supplier|guardar proveedor/i }).click();
      await expect(dialog).toBeHidden();

      // Table shows the new row with contact + email columns populated.
      const row = page.getByRole('row', { name: new RegExp(supplierName) });
      await expect(row).toBeVisible();
      await expect(row.getByText('Ravi Patel')).toBeVisible();
      await expect(row.getByText('ravi@example.com')).toBeVisible();

      // DB: supplier row + supplier_products link both written.
      const { data: supplier } = await db
        .from('suppliers')
        .select('id, contact_name, phone, email')
        .eq('name', supplierName)
        .single();
      expect(supplier).not.toBeNull();
      supplierId = supplier!.id as string;
      expect(supplier!.contact_name).toBe('Ravi Patel');
      expect(supplier!.email).toBe('ravi@example.com');
      const { data: links } = await db
        .from('supplier_products')
        .select('product_id')
        .eq('supplier_id', supplierId);
      expect((links ?? []).map((l: { product_id: string }) => l.product_id)).toEqual([product.id]);
    } finally {
      if (supplierId) await cleanupSupplier(db, supplierId);
      await db.from('products').delete().eq('id', product.id);
    }
  });

  test('validation: empty name and bad email keep the dialog open with field errors', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'manager');
    await gotoAuthed(page, '/suppliers');
    await page
      .getByRole('button', { name: /new supplier|nuevo proveedor/i })
      .first()
      .click();
    const dialog = supplierDialog(page);
    await dialog.getByLabel(/^(email|correo electrónico)$/i).fill('not-an-email');
    await dialog.getByRole('button', { name: /save supplier|guardar proveedor/i }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/name is required|el nombre es obligatorio/i)).toBeVisible();
    await expect(
      dialog.getByText(/enter a valid email|escribe un correo electrónico válido/i)
    ).toBeVisible();
    // Dialog stays open — nothing was submitted.
    await expect(dialog).toBeVisible();
  });

  test('clicking a row opens Edit Supplier and saves changes', async ({ page }) => {
    test.setTimeout(90_000);
    const db = getServiceClient();
    const supplier = await seedSupplier(db, { phone: '111' });
    try {
      await loginAs(page, 'manager');
      await gotoAuthed(page, '/suppliers');
      await page.getByPlaceholder(/search suppliers|buscar proveedores/i).fill(supplier.name);
      await page
        .getByRole('row', { name: new RegExp(supplier.name) })
        .getByText(supplier.name, { exact: true })
        .click();

      const dialog = page.getByRole('dialog', { name: /edit supplier|editar proveedor/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel(/^(name|nombre)\s*\*?$/i)).toHaveValue(supplier.name);
      await dialog.getByLabel(/phone|teléfono/i).fill('222');
      await dialog.getByRole('button', { name: /save supplier|guardar proveedor/i }).click();
      await expect(dialog).toBeHidden();

      await expect
        .poll(async () => {
          const { data } = await db
            .from('suppliers')
            .select('phone')
            .eq('id', supplier.id)
            .single();
          return data?.phone ?? null;
        })
        .toBe('222');
    } finally {
      await cleanupSupplier(db, supplier.id);
    }
  });

  test('deleting a supplier with a purchase order is blocked with a clear message', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const db = getServiceClient();
    const supplier = await seedSupplier(db);
    try {
      const { data: manager } = await db
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .limit(1)
        .single();
      if (!manager) throw new Error('No manager profile');
      const { error: poError } = await db
        .from('purchase_orders')
        .insert({ supplier_id: supplier.id, status: 'draft', created_by: manager.id });
      if (poError) throw new Error(poError.message);

      await loginAs(page, 'manager');
      await gotoAuthed(page, '/suppliers');
      await page.getByPlaceholder(/search suppliers|buscar proveedores/i).fill(supplier.name);
      const row = page.getByRole('row', { name: new RegExp(supplier.name) });
      await row.getByRole('button', { name: /^(delete|eliminar)$/i }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: /^(delete|eliminar)$/i })
        .click();

      await expect(page.getByText(/can't delete|no se puede eliminar/i)).toBeVisible();
      const { data: still } = await db.from('suppliers').select('id').eq('id', supplier.id);
      expect(still?.length).toBe(1);
    } finally {
      await cleanupSupplier(db, supplier.id);
    }
  });
});
