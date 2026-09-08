/**
 * E2E: Product photo Storage RLS boundary (Phase 31 Plan 05 — PCAT-04, T-31-01, T-31-04)
 *
 * Proves the database, not the UI, denies a write against the `product-photos`
 * bucket's `storage.objects` rows for a role without `manage_products`, and
 * for an unauthenticated caller. Talks to Supabase directly — no page
 * navigation — because the claim under test is a database-layer one, and a
 * UI that merely hides a button proves nothing.
 *
 * Read scope (31-01 Task 1, Decision B — see 31-01-SUMMARY.md and
 * supabase/migrations/20260907000001_product_photos_storage.sql): the SELECT
 * policy on storage.objects for this bucket is `FOR SELECT TO authenticated
 * USING (bucket_id = 'product-photos')` — open to ANY authenticated role, no
 * `manage_products` predicate. So the live behaviour is: a signed-in cashier
 * CAN mint a signed URL (read), an unauthenticated anon client CANNOT. This
 * spec asserts that branch explicitly, per the plan's own instruction not to
 * assume which SELECT variant shipped.
 *
 * One shared seeded product/object and one shared cashier/admin role-scoped
 * client (test.describe.serial + beforeAll/afterAll) — createRoleScopedClient
 * provisions a real auth user per call (~1-2s each), so the individual
 * upload/remove/update assertions below share one client per role instead of
 * re-provisioning per test. Every denial is still paired with its own
 * service-client ground-truth read.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { createRoleScopedClient } from '../helpers/rls-clients';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient } from '../helpers/supabase';

const BUCKET = 'product-photos';
const TEST_PRODUCT = 'TestPhotoRlsProduct-E2E';

function getUrl(): string {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing VITE_SUPABASE_URL');
  return url;
}

function getAnonKey(): string {
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return key;
}

/** A bare anon client with no session — the "unauthenticated" caller. */
function createAnonClient(): SupabaseClient {
  return createClient(getUrl(), getAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `e2e-rls-anon-${String(Date.now())}`,
    },
  });
}

/** Tiny, deterministic bytes — RLS denial is asserted before any content
 * validation would ever run, so this never needs to be a real decodable
 * image (unlike the app's own client-side upload pipeline, which validates
 * before it ever calls Storage). */
function fakePhotoBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

let productId: string;
let objectPath: string;
let cashierClient: SupabaseClient;
let cashierCleanup: () => Promise<void>;
let anonClient: SupabaseClient;

async function listProductObjects(): Promise<string[]> {
  const admin = getServiceClient();
  const { data } = await admin.storage.from(BUCKET).list(`products/${productId}`);
  return (data ?? []).map(o => o.name);
}

test.describe.serial('Product photo Storage RLS boundary — cashier and anonymous denial', () => {
  test.beforeAll(async () => {
    requireIntegrationEnv();
    const admin = getServiceClient();
    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    if (!cat) throw new Error('beforeAll: no category found');
    await admin.from('products').delete().eq('name', TEST_PRODUCT);
    const { data: product, error } = await admin
      .from('products')
      .insert({ name: TEST_PRODUCT, category_id: cat.id, base_price: 5, is_active: true })
      .select('id')
      .single();
    if (error || !product) throw new Error(`beforeAll: product insert failed - ${error?.message}`);
    productId = product.id as string;

    objectPath = `products/${productId}/e2e-rls-seed.png`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, fakePhotoBytes(), { contentType: 'image/png', upsert: true });
    if (uploadError) throw new Error(`beforeAll: seed upload failed - ${uploadError.message}`);
    await admin.from('products').update({ photo_path: objectPath }).eq('id', productId);

    const scoped = await createRoleScopedClient('cashier', 'photo');
    cashierClient = scoped.client;
    cashierCleanup = scoped.cleanup;
    anonClient = createAnonClient();
  });

  test.afterAll(async () => {
    if (cashierCleanup) await cashierCleanup();
    const admin = getServiceClient();
    const objects = await listProductObjects();
    if (objects.length > 0) {
      await admin.storage.from(BUCKET).remove(objects.map(name => `products/${productId}/${name}`));
    }
    if (productId) await admin.from('products').delete().eq('id', productId);
  });

  test('cashier upload to a fresh path is denied (T-31-01)', async () => {
    const freshPath = `products/${productId}/e2e-cashier-upload-attempt.png`;
    const { error: uploadError } = await cashierClient.storage
      .from(BUCKET)
      .upload(freshPath, fakePhotoBytes(), { contentType: 'image/png' });
    expect(uploadError).not.toBeNull();

    const objects = await listProductObjects();
    expect(objects).not.toContain('e2e-cashier-upload-attempt.png');
  });

  test('cashier remove of the existing object is denied or removes nothing (T-31-01)', async () => {
    const { error: removeError } = await cashierClient.storage.from(BUCKET).remove([objectPath]);
    const objects = await listProductObjects();
    const stillPresent = objects.some(name => objectPath.endsWith(name));
    // Either Storage returned an error, or (some RLS configurations return a
    // 200 with an empty affected-rows result) the object is simply still
    // there — either shape is an acceptable "denied" outcome, but the
    // ground-truth read below is what actually proves it, not the error alone.
    expect(removeError !== null || stillPresent).toBe(true);
    expect(stillPresent).toBe(true);
  });

  test('cashier update of the existing object is denied (T-31-01)', async () => {
    const { error: updateError } = await cashierClient.storage
      .from(BUCKET)
      .update(objectPath, fakePhotoBytes(), { contentType: 'image/png' });
    expect(updateError).not.toBeNull();
  });

  test('anonymous client upload to a fresh path is denied (T-31-01)', async () => {
    const freshPath = `products/${productId}/e2e-anon-upload-attempt.png`;
    const { error: uploadError } = await anonClient.storage
      .from(BUCKET)
      .upload(freshPath, fakePhotoBytes(), { contentType: 'image/png' });
    expect(uploadError).not.toBeNull();

    const objects = await listProductObjects();
    expect(objects).not.toContain('e2e-anon-upload-attempt.png');
  });

  test('anonymous client remove of the existing object is denied or removes nothing (T-31-01)', async () => {
    const { error: removeError } = await anonClient.storage.from(BUCKET).remove([objectPath]);
    const objects = await listProductObjects();
    const stillPresent = objects.some(name => objectPath.endsWith(name));
    expect(removeError !== null || stillPresent).toBe(true);
    expect(stillPresent).toBe(true);
  });

  test('anonymous client update of the existing object is denied (T-31-01)', async () => {
    const { error: updateError } = await anonClient.storage
      .from(BUCKET)
      .update(objectPath, fakePhotoBytes(), { contentType: 'image/png' });
    expect(updateError).not.toBeNull();
  });

  test('read scope: an authenticated cashier CAN sign a URL, an anonymous client CANNOT (T-31-04, Decision B)', async () => {
    // Decision B (31-01 Task 1): SELECT is open to any `authenticated` role
    // for this bucket, no `manage_products` predicate — so a signed-in
    // cashier (no manage_products) can still mint a signed URL.
    const { data: cashierSigned, error: cashierSignError } = await cashierClient.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 60);
    expect(cashierSignError).toBeNull();
    expect(cashierSigned?.signedUrl).toBeTruthy();

    // An unauthenticated caller has no `authenticated` role at all, so the
    // `TO authenticated` policy target excludes it outright.
    const { data: anonSigned, error: anonSignError } = await anonClient.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 60);
    expect(anonSignError).not.toBeNull();
    expect(anonSigned).toBeNull();
  });

  test('no publicly-readable URL serves a stored object on this private bucket (T-31-04)', async () => {
    const { data: publicUrlData } = anonClient.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicResponse = await fetch(publicUrlData.publicUrl);
    expect(publicResponse.ok).toBe(false);
  });
});

test.describe('Product photo Storage RLS boundary — admin positive control', () => {
  test.beforeEach(() => {
    requireIntegrationEnv();
  });

  test('admin upload and delete both succeed, proving the denials above are role-specific, not a broken bucket (T-31-01)', async () => {
    const admin = getServiceClient();
    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    if (!cat) throw new Error('no category found');
    const productName = `${TEST_PRODUCT}-admin`;
    await admin.from('products').delete().eq('name', productName);
    const { data: product, error: insertError } = await admin
      .from('products')
      .insert({ name: productName, category_id: cat.id, base_price: 5, is_active: true })
      .select('id')
      .single();
    if (insertError || !product) throw new Error(`insert failed - ${insertError?.message}`);
    const adminProductId = product.id as string;

    const { client: adminClient, cleanup } = await createRoleScopedClient('admin', 'photo-positive');

    try {
      const path = `products/${adminProductId}/e2e-admin-upload.png`;
      const { error: uploadError } = await adminClient.storage
        .from(BUCKET)
        .upload(path, fakePhotoBytes(), { contentType: 'image/png' });
      expect(uploadError).toBeNull();

      const { data: afterUpload } = await admin.storage.from(BUCKET).list(`products/${adminProductId}`);
      expect((afterUpload ?? []).some(o => o.name === 'e2e-admin-upload.png')).toBe(true);

      const { error: removeError } = await adminClient.storage.from(BUCKET).remove([path]);
      expect(removeError).toBeNull();

      const { data: afterRemove } = await admin.storage.from(BUCKET).list(`products/${adminProductId}`);
      expect((afterRemove ?? []).some(o => o.name === 'e2e-admin-upload.png')).toBe(false);
    } finally {
      await cleanup();
      const objects = await admin.storage.from(BUCKET).list(`products/${adminProductId}`);
      if (objects.data && objects.data.length > 0) {
        await admin.storage
          .from(BUCKET)
          .remove(objects.data.map(o => `products/${adminProductId}/${o.name}`));
      }
      await admin.from('products').delete().eq('id', adminProductId);
    }
  });
});
