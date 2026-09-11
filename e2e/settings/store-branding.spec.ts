/**
 * Login screen store branding (STORE-01/STORE-02, Phase 33 Plan 01).
 *
 * Talks to Supabase directly (service-role client) in each test rather than
 * through the app UI, because the login screen is pre-auth — there is no
 * "log in, go to Settings, save" UI path to configure the store name before
 * observing it on this same page. `test.describe.serial` because
 * `settings` where `key='general'` is a store-wide singleton row; two tests
 * writing it concurrently would observe/clobber each other's writes.
 *
 * Deliberately no staff sign-in and no caja session — every case here runs
 * unauthenticated, that is the behaviour under test (the anon-scoped
 * `settings_select_branding_anon` RLS policy from
 * 20260911000001_store_branding_settings.sql).
 */
import { expect, test } from '../fixtures';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient } from '../helpers/supabase';

const GENERAL_KEY = 'general';
const UNCONFIGURED_FALLBACK = 'Supermarket POS';

type GeneralValue = {
  storeName: string;
  address: string;
  timezone: string;
  currency: string;
  receiptFooterText: string;
  storeLogoPath: string | null;
};

const SEEDED_VALUE: GeneralValue = {
  storeName: 'Taj House of Spices',
  address: 'Av. Revolucion 123, CDMX',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  receiptFooterText: '',
  storeLogoPath: null,
};

async function writeGeneral(value: GeneralValue): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin
    .from('settings')
    .upsert({ key: GENERAL_KEY, value }, { onConflict: 'key' });
  if (error) throw new Error(`writeGeneral failed: ${error.message}`);
}

/** Sibling-field preservation check (RESEARCH.md Pitfall 2): proves a write
 * never silently drops address/timezone alongside storeName. */
async function readGeneral(): Promise<GeneralValue> {
  const admin = getServiceClient();
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('key', GENERAL_KEY)
    .single();
  if (error) throw new Error(`readGeneral failed: ${error.message}`);
  return (data as { value: GeneralValue }).value;
}

test.describe.serial('Login screen store branding', () => {
  test.beforeAll(() => {
    requireIntegrationEnv();
  });

  test.afterAll(async () => {
    // Restore a known seeded value so the rest of the suite is unaffected.
    await writeGeneral(SEEDED_VALUE);
  });

  test('configured storeName renders in the login hero', async ({ page }) => {
    await writeGeneral(SEEDED_VALUE);

    await page.goto('/login');
    await expect(page.getByTestId('login-store-name')).toHaveText(SEEDED_VALUE.storeName);
    // UI-SPEC §1 hero tile (size-32) — present only when storeName is configured.
    await expect(page.locator('div.size-32')).toBeVisible();

    const stored = await readGeneral();
    expect(stored.address).toBe(SEEDED_VALUE.address);
    expect(stored.timezone).toBe(SEEDED_VALUE.timezone);
  });

  test('unconfigured storeName falls back to the generic string', async ({ page }) => {
    await writeGeneral({ ...SEEDED_VALUE, storeName: '' });

    await page.goto('/login');
    await expect(page.getByTestId('login-store-name')).toHaveText(UNCONFIGURED_FALLBACK);
    // D-03: unconfigured state renders the pre-phase small (size-11) tile,
    // never the hero (size-32) tile.
    await expect(page.locator('div.size-32')).not.toBeAttached();

    const stored = await readGeneral();
    expect(stored.address).toBe(SEEDED_VALUE.address);
    expect(stored.timezone).toBe(SEEDED_VALUE.timezone);
  });

  test('unicode storeName round-trips byte-for-byte', async ({ page }) => {
    const unicodeName = 'Tienda \u{1F336}\u{FE0F} \u{00CD}ndia';
    await writeGeneral({ ...SEEDED_VALUE, storeName: unicodeName });

    await page.goto('/login');
    // toHaveText (not a one-shot .textContent() read) auto-retries until the
    // async useSettings() fetch resolves — a bare textContent() call can win
    // the race against the fetch and capture the pending-state fallback text.
    await expect(page.getByTestId('login-store-name')).toHaveText(unicodeName);

    const stored = await readGeneral();
    expect(stored.storeName).toBe(unicodeName);
    expect(stored.address).toBe(SEEDED_VALUE.address);
    expect(stored.timezone).toBe(SEEDED_VALUE.timezone);
  });
});
