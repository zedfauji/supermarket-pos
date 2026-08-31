/**
 * E2E spec: Phase 21 — Idle Screen Lock (Plan 21-02)
 *
 * Closes Pitfall 3 (RESEARCH.md): CheckoutPanel's `useBarcodeScanner` hook
 * registers a genuinely global `window`-level keydown listener that would
 * otherwise keep firing -- and calling `ensurePeekWindowShown`, which opens
 * the Product Peek OS window via `plugin:webview|create_webview_window` --
 * while the idle-lock overlay visually blocks the screen. This spec proves
 * a raw barcode-scanner keystroke burst has zero externally observable
 * effect while locked, and that normal scanning resumes immediately after
 * unlock (T-21-06).
 */
import { expect, test, type Page } from '../fixtures';
import { enterPin, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { getPeekMockCalls, injectPeekWindowMock } from '../helpers/tauriPeekMock';

const TERMINAL_ID = process.env.VITE_TERMINAL_ID ?? 'POS-1';
const LOCK_TIMEOUT_SECONDS = 15;

async function seedLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
  if (error) throw new Error(`seedLockTimeout: ${error.message}`);
}

async function clearLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('terminal_lock_settings').delete().eq('terminal_id', TERMINAL_ID);
}

// Mirrors e2e/checkout/peek-window.spec.ts's local scanBarcode helper --
// dispatches a raw window-level keydown burst, exactly what a USB HID
// barcode scanner emits. No product needs to be seeded: any 4+ character
// string plus Enter is enough to exercise useBarcodeScanner's listener.
// Deliberately NON-digit (unlike peek-window.spec.ts's numeric fixture):
// while the overlay is open, PINKeypad ALSO registers a global window
// keydown listener for physical digit-key PIN entry (0-9 + Backspace,
// PINKeypad.tsx) -- a digit-only fake barcode would silently type into the
// PIN buffer and corrupt the subsequent real-PIN unlock. Letters are
// untouched by PINKeypad's digit filter but still satisfy
// useBarcodeScanner's generic `e.key.length === 1` buffering.
const FAKE_BARCODE = 'ABCDEFGHIJK';
async function scanBarcode(page: Page, barcode: string) {
  await page.evaluate(code => {
    for (const key of [...code, 'Enter']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
  }, barcode);
}

test.describe('Idle Screen Lock — barcode-scanner bypass resistance (T-21-06)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await seedLockTimeout();
  });

  test.afterEach(async () => {
    await clearLockTimeout();
  });

  test('a barcode-scanner keystroke burst while locked opens zero Product Peek windows; scanning resumes after unlock', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await openCaja(500);
    await injectPeekWindowMock(page);
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);

    const overlay = page.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // Defense-in-depth re-check (Plan 21-01 already covers this at the
    // component level via onEscapeKeyDown -- reconfirmed here at the E2E
    // layer per the plan's must_haves).
    await page.keyboard.press('Escape');
    await expect(overlay).toBeVisible();

    // The overlay is visible, but a raw scanner keystroke burst still
    // reaches `window` -- prove it has zero externally observable effect.
    await scanBarcode(page, FAKE_BARCODE);
    expect(await getPeekMockCalls(page, 'plugin:webview|create_webview_window')).toHaveLength(0);

    // Unlock with a valid staff PIN (D-04: any staff works).
    const cashierPin = process.env['E2E_BARTENDER_PIN'] ?? '';
    await enterPin(page, cashierPin);
    await expect(overlay).not.toBeVisible({ timeout: 10_000 });

    // Normal scanning resumes immediately after unlock, no reload required --
    // proves the gate is scoped to `locked`, not a permanent regression.
    await scanBarcode(page, FAKE_BARCODE);
    await expect
      .poll(async () => (await getPeekMockCalls(page, 'plugin:webview|create_webview_window')).length)
      .toBeGreaterThan(0);
  });
});
