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
import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient } from '../helpers/supabase';

const GENERAL_KEY = 'general';
const UNCONFIGURED_FALLBACK = 'Supermarket POS';
const STORE_BRANDING_BUCKET = 'store-branding';

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

async function openGeneralSettingsTab(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(page.getByTestId('settings-store-logo-dropzone')).toBeVisible({ timeout: 15_000 });
}

/**
 * Generates a real, decodable PNG in-page and injects it through the real
 * `<input type="file">` via a DataTransfer + native 'change' event — same
 * technique as e2e/products/product-photo-upload.spec.ts. `mimeType`
 * overrides only the File's declared type (bytes stay real PNG), letting a
 * caller simulate a mislabeled/unsupported-type upload without needing real
 * bytes of that format — validateStoreLogoFile rejects on the declared type
 * before any decode is attempted.
 */
async function injectGeneratedLogo(
  page: Page,
  testId: string,
  width: number,
  height: number,
  mimeType = 'image/png'
): Promise<void> {
  await page.evaluate(
    async ({ testId, width, height, mimeType }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#3366ff';
      ctx.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('toBlob failed'));
        }, 'image/png');
      });
      const file = new File([blob], 'e2e-store-logo.png', { type: mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const input = document.querySelector(`[data-testid="${testId}"]`);
      if (!input) throw new Error(`input [data-testid="${testId}"] not found`);
      (input as HTMLInputElement).files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { testId, width, height, mimeType }
  );
}

const uploadedLogoPaths: string[] = [];

async function cleanupUploadedLogos(): Promise<void> {
  if (uploadedLogoPaths.length === 0) return;
  const admin = getServiceClient();
  await admin.storage.from(STORE_BRANDING_BUCKET).remove(uploadedLogoPaths);
}

test.describe.serial('Login screen store branding', () => {
  test.beforeAll(() => {
    requireIntegrationEnv();
  });

  test.afterAll(async () => {
    // Restore a known seeded value so the rest of the suite is unaffected.
    await writeGeneral(SEEDED_VALUE);
    await cleanupUploadedLogos();
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

  test('store logo: upload renders on the login hero, an unsupported type is rejected, Remove clears it, and saving General text fields leaves storeLogoPath untouched', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await writeGeneral(SEEDED_VALUE);
    await loginAs(page, 'admin');
    await openGeneralSettingsTab(page);

    // Empty state.
    await expect(page.getByTestId('settings-store-logo-remove')).toHaveCount(0);

    // Upload.
    await injectGeneratedLogo(page, 'settings-store-logo-file-input', 800, 600);
    await expect(page.getByTestId('settings-store-logo-preview')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('settings-store-logo-replace')).toBeVisible();
    await expect(page.getByTestId('settings-store-logo-remove')).toBeVisible();

    await expect
      .poll(async () => (await readGeneral()).storeLogoPath, { timeout: 20_000 })
      .not.toBeNull();
    let stored = await readGeneral();
    const uploadedPath = stored.storeLogoPath as string;
    expect(uploadedPath).toMatch(/^store\/[0-9a-f-]{36}\.(webp|jpg)$/);
    expect(stored.storeName).toBe(SEEDED_VALUE.storeName);
    expect(stored.address).toBe(SEEDED_VALUE.address);
    expect(stored.timezone).toBe(SEEDED_VALUE.timezone);
    expect(stored.currency).toBe(SEEDED_VALUE.currency);
    expect(stored.receiptFooterText).toBe(SEEDED_VALUE.receiptFooterText);
    uploadedLogoPaths.push(uploadedPath);

    // The pre-auth login screen renders the uploaded logo.
    await logout(page);
    await page.goto('/login');
    const heroLogo = page.getByTestId('login-store-logo');
    await expect(heroLogo).toBeVisible({ timeout: 20_000 });
    expect(await heroLogo.getAttribute('src')).toBeTruthy();

    // Unsupported type: rejected inline, storeLogoPath unchanged.
    await loginAs(page, 'admin');
    await openGeneralSettingsTab(page);
    await expect(page.getByTestId('settings-store-logo-preview')).toBeVisible({ timeout: 20_000 });
    await injectGeneratedLogo(page, 'settings-store-logo-file-input', 400, 300, 'image/heic');
    await expect(page.getByRole('alert').filter({ hasText: /heic/i })).toBeVisible({ timeout: 10_000 });
    stored = await readGeneral();
    expect(stored.storeLogoPath).toBe(uploadedPath);

    // Remove behind the destructive confirm.
    await page.getByTestId('settings-store-logo-remove').click();
    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /remove logo|quitar logotipo/i }).click();
    await expect(page.getByTestId('settings-store-logo-preview')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId('settings-store-logo-dropzone')).toBeVisible();

    await expect
      .poll(async () => (await readGeneral()).storeLogoPath, { timeout: 20_000 })
      .toBeNull();

    await logout(page);
    await page.goto('/login');
    await expect(page.getByTestId('login-store-logo')).toHaveCount(0);
    // Name is still configured — the hero tile stays hero-size, just with the
    // fallback icon instead of a broken/missing image.
    await expect(page.locator('div.size-32')).toBeVisible();
    await expect(page.getByTestId('login-store-name')).toHaveText(SEEDED_VALUE.storeName);

    // Saving General's text fields must not resurrect or otherwise disturb
    // storeLogoPath (RESEARCH.md Pitfall 2 — a whole-blob write).
    await loginAs(page, 'admin');
    await openGeneralSettingsTab(page);
    const updatedName = `${SEEDED_VALUE.storeName} Updated`;
    await page.locator('#settings-store-name').fill(updatedName);
    await page.getByRole('button', { name: /save general|guardar general/i }).click();

    await expect
      .poll(async () => (await readGeneral()).storeName, { timeout: 10_000 })
      .toBe(updatedName);
    stored = await readGeneral();
    expect(stored.storeLogoPath).toBeNull();

    await logout(page);
  });
});
