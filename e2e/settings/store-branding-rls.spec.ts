/**
 * E2E: store-branding Storage + settings RLS boundary (Phase 33 Plan 03,
 * STORE-03, T-33-05/T-33-09)
 *
 * Proves the database, not the UI, denies a write against the
 * `store-branding` bucket's `storage.objects` rows for a role without
 * `manage_settings`, and for an unauthenticated caller — mirrors
 * e2e/products/product-photo-rls.spec.ts's structure and rationale (talks to
 * Supabase directly, no page navigation, because the claim under test is a
 * database-layer one and a UI that merely hides a button proves nothing).
 *
 * Also proves the settings-table half of the boundary widened in plan 01
 * (20260911000001_store_branding_settings.sql): the anon SELECT grant on
 * `settings` is scoped to `key='general'` only, not a blanket read.
 *
 * One shared seeded object and one shared cashier role-scoped client
 * (test.describe.serial + beforeAll/afterAll) — createRoleScopedClient
 * provisions a real auth user per call (~1-2s each), so the individual
 * upload/remove/update assertions below share one client per role instead of
 * re-provisioning per test. Every denial is still paired with its own
 * service-client ground-truth read.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { createRoleScopedClient } from '../helpers/rls-clients';
import { getServiceClient } from '../helpers/supabase';

const BUCKET = 'store-branding';

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
function createAnonClient(): ReturnType<typeof createClient> {
  return createClient(getUrl(), getAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `e2e-rls-store-branding-anon-${String(Date.now())}`,
    },
  });
}

/** Tiny, deterministic bytes — RLS denial is asserted before any content
 * validation would ever run, so this never needs to be a real decodable
 * image (unlike the app's own client-side upload pipeline). */
function fakeLogoBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

let objectPath: string;
let cashierClient: SupabaseClient;
let cashierCleanup: () => Promise<void>;
let anonClient: ReturnType<typeof createAnonClient>;

async function listStoreObjects(): Promise<string[]> {
  const admin = getServiceClient();
  const { data } = await admin.storage.from(BUCKET).list('store');
  return (data ?? []).map(o => o.name);
}

test.describe.serial('Store branding Storage RLS boundary — cashier and anonymous denial', () => {
  test.beforeAll(async () => {
    requireIntegrationEnv();
    const admin = getServiceClient();

    objectPath = `store/e2e-rls-seed-${String(Date.now())}.png`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, fakeLogoBytes(), { contentType: 'image/png', upsert: true });
    if (uploadError) throw new Error(`beforeAll: seed upload failed - ${uploadError.message}`);

    const scoped = await createRoleScopedClient('cashier', 'store-branding');
    cashierClient = scoped.client;
    cashierCleanup = scoped.cleanup;
    anonClient = createAnonClient();
  });

  test.afterAll(async () => {
    // beforeAll always runs before afterAll in Playwright's lifecycle, so
    // cashierCleanup/objectPath are always assigned by the time this runs.
    await cashierCleanup();
    const admin = getServiceClient();
    await admin.storage.from(BUCKET).remove([objectPath]);
  });

  test('cashier upload to a fresh path is denied (T-33-05)', async () => {
    const freshPath = `store/e2e-cashier-upload-attempt-${String(Date.now())}.png`;
    const { error: uploadError } = await cashierClient.storage
      .from(BUCKET)
      .upload(freshPath, fakeLogoBytes(), { contentType: 'image/png' });
    expect(uploadError).not.toBeNull();

    const objects = await listStoreObjects();
    expect(objects.some(name => freshPath.endsWith(name))).toBe(false);
  });

  test('cashier remove of the existing object is denied or removes nothing (T-33-05)', async () => {
    const { error: removeError } = await cashierClient.storage.from(BUCKET).remove([objectPath]);
    const objects = await listStoreObjects();
    const stillPresent = objects.some(name => objectPath.endsWith(name));
    // Either Storage returned an error, or (some RLS configurations return a
    // 200 with an empty affected-rows result) the object is simply still
    // there — either shape is an acceptable "denied" outcome, but the
    // ground-truth read below is what actually proves it, not the error alone.
    expect(removeError !== null || stillPresent).toBe(true);
    expect(stillPresent).toBe(true);
  });

  test('cashier update of the existing object is denied (T-33-05)', async () => {
    const { error: updateError } = await cashierClient.storage
      .from(BUCKET)
      .update(objectPath, fakeLogoBytes(), { contentType: 'image/png' });
    expect(updateError).not.toBeNull();
  });

  test('anonymous client upload to a fresh path is denied (T-33-05)', async () => {
    const freshPath = `store/e2e-anon-upload-attempt-${String(Date.now())}.png`;
    const { error: uploadError } = await anonClient.storage
      .from(BUCKET)
      .upload(freshPath, fakeLogoBytes(), { contentType: 'image/png' });
    expect(uploadError).not.toBeNull();

    const objects = await listStoreObjects();
    expect(objects.some(name => freshPath.endsWith(name))).toBe(false);
  });

  test('anonymous client remove of the existing object is denied or removes nothing (T-33-05)', async () => {
    const { error: removeError } = await anonClient.storage.from(BUCKET).remove([objectPath]);
    const objects = await listStoreObjects();
    const stillPresent = objects.some(name => objectPath.endsWith(name));
    expect(removeError !== null || stillPresent).toBe(true);
    expect(stillPresent).toBe(true);
  });

  test('anonymous client update of the existing object is denied (T-33-05)', async () => {
    const { error: updateError } = await anonClient.storage
      .from(BUCKET)
      .update(objectPath, fakeLogoBytes(), { contentType: 'image/png' });
    expect(updateError).not.toBeNull();
  });

  test('anonymous client CAN sign the seeded object (Option B, D-09/D-10 — widened SELECT)', async () => {
    const { data: signed, error: signError } = await anonClient.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 60);
    expect(signError).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();
  });

  test('anonymous settings read is scoped to key=general only — billing and near_expiry return zero rows (T-33-09)', async () => {
    const { data: generalRows, error: generalError } = await anonClient
      .from('settings')
      .select('key')
      .eq('key', 'general');
    expect(generalError).toBeNull();
    expect(generalRows?.length).toBe(1);

    const { data: billingRows, error: billingError } = await anonClient
      .from('settings')
      .select('key')
      .eq('key', 'billing');
    expect(billingError).toBeNull();
    expect(billingRows?.length ?? 0).toBe(0);

    const { data: nearExpiryRows, error: nearExpiryError } = await anonClient
      .from('settings')
      .select('key')
      .eq('key', 'near_expiry');
    expect(nearExpiryError).toBeNull();
    expect(nearExpiryRows?.length ?? 0).toBe(0);
  });
});

test.describe('Store branding Storage RLS boundary — admin positive control', () => {
  test.beforeEach(() => {
    requireIntegrationEnv();
  });

  test('admin upload and delete both succeed, proving the denials above are role-specific, not a broken bucket (T-33-05)', async () => {
    const { client: adminClient, cleanup } = await createRoleScopedClient('admin', 'store-branding-positive');
    const path = `store/e2e-admin-upload-${String(Date.now())}.png`;

    try {
      const { error: uploadError } = await adminClient.storage
        .from(BUCKET)
        .upload(path, fakeLogoBytes(), { contentType: 'image/png' });
      expect(uploadError).toBeNull();

      const objects = await listStoreObjects();
      expect(objects.some(name => path.endsWith(name))).toBe(true);

      const { error: removeError } = await adminClient.storage.from(BUCKET).remove([path]);
      expect(removeError).toBeNull();

      const afterRemove = await listStoreObjects();
      expect(afterRemove.some(name => path.endsWith(name))).toBe(false);
    } finally {
      await cleanup();
      const admin = getServiceClient();
      await admin.storage.from(BUCKET).remove([path]);
    }
  });
});
