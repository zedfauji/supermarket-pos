/**
 * e2e/visual/login-branding-baseline.spec.ts
 *
 * STORE-03 (Phase 33 Plan 03) — visual-regression baseline of LoginPage's
 * desktop brand-panel aside in its configured (real ASCII store name +
 * uploaded logo) and unconfigured (fallback) states, each paired with a
 * deterministic measurement per 46-product-dialog-baseline.spec.ts's
 * convention, so a failure says which of the two broke: for "hero-size,
 * dominant" (D-04) that measurement is the hero tile's boundingBox() being
 * at least 120px on both axes.
 *
 * Pre-auth page — no loginAs/openCaja needed, only the service client to
 * write/clear settings.general (and seed a real Storage object for the
 * configured state — a fake byte buffer would leave <img> broken) before
 * each case via a plain page.goto('/login'). LiveTimeDisplay ticks every
 * second and the date label above it rolls over daily — both are masked
 * before every screenshot, or the baseline flakes.
 *
 * test.describe.serial: playwright.visual.config.ts sets fullyParallel: true
 * (unlike the functional playwright.config.ts, which pins workers: 1), so
 * without .serial the configured and unconfigured cases would race each
 * other writing the same singleton settings row.
 *
 * STORE-03/encoding: this baseline pins an ASCII fixture store name so the
 * PNG diff is deterministic across machines/fonts; non-Latin name rendering
 * is asserted textually in e2e/settings/store-branding.spec.ts's unicode
 * case instead, where it is a string comparison rather than a pixel one.
 *
 * NOTE on baseline image storage: `.gitignore` has a project-wide rule
 * (`e2e/visual/**\/*-snapshots/`) excluding every visual-regression spec's
 * generated PNGs from version control — baselines are local,
 * regenerated-on-first-run artifacts per machine, not committed alongside
 * this spec (same convention as 46-product-dialog-baseline.spec.ts).
 */
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from '../fixtures';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient } from '../helpers/supabase';

const GENERAL_KEY = 'general';
const BUCKET = 'store-branding';
const FIXTURE_STORE_NAME = 'Visual Test Grocers';
const FIXTURE_LOGO_PATH = 'store/e2e-visual-baseline-logo.png';

type GeneralValue = {
  storeName: string;
  address: string;
  timezone: string;
  currency: string;
  receiptFooterText: string;
  storeLogoPath: string | null;
};

// GeneralSettingsSchema.address is `min(1)` — an empty address fails
// safeParse and silently falls back to DEFAULT_GENERAL (storeName too),
// so "unconfigured" here means an empty storeName, not an empty row.
const UNCONFIGURED_VALUE: GeneralValue = {
  storeName: '',
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

/** A tiny, real, decodable 1x1 PNG. The hero tile is object-contain over a
 * padded backdrop, so the baseline's pixels come from the tile chrome, not
 * fine image detail — a larger real image would only add decode-timing
 * flake risk without changing what this baseline actually verifies. */
function fixtureLogoPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
}

async function seedLogoObject(): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(FIXTURE_LOGO_PATH, fixtureLogoPng(), { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`seedLogoObject failed: ${error.message}`);
}

async function removeLogoObject(): Promise<void> {
  const admin = getServiceClient();
  await admin.storage.from(BUCKET).remove([FIXTURE_LOGO_PATH]);
}

/** Masks the date-label + LiveTimeDisplay pair together — both change
 * between the baseline-writing run and any later comparison run. */
function clockMask(page: Page): Locator {
  return page.locator('aside .space-y-2').first();
}

type Box = { x: number; y: number; width: number; height: number };

/** Playwright's `boundingBox()` types as nullable (element could be detached
 * mid-call); every call site here has already asserted the element visible,
 * so a null result is a genuine failure worth a clear message rather than a
 * `!` assertion. */
function requireBox(box: Box | null): Box {
  if (!box) throw new Error('boundingBox() returned null — element not visible or not attached');
  return box;
}

test.describe.serial('Login screen brand-panel visual baseline (Phase 33 Plan 03, STORE-03)', () => {
  test.beforeAll(async () => {
    requireIntegrationEnv();
    await seedLogoObject();
  });

  test.afterAll(async () => {
    await writeGeneral(UNCONFIGURED_VALUE);
    await removeLogoObject();
  });

  test('configured: real store name and uploaded logo render hero-size, dominant (D-04)', async ({
    page,
  }) => {
    await writeGeneral({
      ...UNCONFIGURED_VALUE,
      storeName: FIXTURE_STORE_NAME,
      storeLogoPath: FIXTURE_LOGO_PATH,
    });

    await page.goto('/login');
    const heroTile = page.locator('div.size-32');
    await expect(heroTile).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('login-store-logo')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('login-store-name')).toHaveText(FIXTURE_STORE_NAME);
    await page.evaluate(() => document.fonts.ready);

    // D-04's "hero-size, dominant" as a testable claim, not just a screenshot.
    const box = requireBox(await heroTile.boundingBox());
    expect(box.width).toBeGreaterThanOrEqual(120);
    expect(box.height).toBeGreaterThanOrEqual(120);

    await expect(page.locator('aside')).toHaveScreenshot('login-brand-panel-configured.png', {
      mask: [clockMask(page)],
    });
  });

  test('unconfigured: no store name and no logo render the untouched small-icon fallback (D-03)', async ({
    page,
  }) => {
    await writeGeneral(UNCONFIGURED_VALUE);

    await page.goto('/login');
    await expect(page.getByTestId('login-store-name')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('div.size-32')).not.toBeAttached();
    await expect(page.getByTestId('login-store-logo')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.locator('aside')).toHaveScreenshot('login-brand-panel-unconfigured.png', {
      mask: [clockMask(page)],
    });
  });
});
