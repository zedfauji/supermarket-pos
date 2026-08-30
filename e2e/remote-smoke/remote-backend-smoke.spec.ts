/**
 * E2E: Remote backend smoke pass (ROADMAP Phase 20 Success Criterion 5).
 *
 * Runs ONLY via `npm run test:e2e:remote-smoke` (playwright.remote.config.ts)
 * against the real remote Supabase project (mkvinyekkyennyegfoxq) — never as
 * part of the default `npm run test:e2e` local-backend suite (excluded via
 * playwright.config.ts's testIgnore).
 *
 * Authenticates as a dedicated, permanent E2E fixture admin account (created
 * by scripts/seed-remote-e2e-admin.ts) — never the real store owner's own
 * admin account ("Vinty Owner"). See
 * .planning/phases/20-store-deployment-installer/20-03-PLAN.md for full
 * rationale, threat model, and cleanup contract.
 */
import { test, expect } from '../fixtures';
import { loginAsNamed, logout } from '../helpers/auth';
import { requireRemoteSmokeEnv } from '../helpers/requireEnv';

test.describe('Remote backend smoke pass', () => {
  test('logs in as the dedicated fixture admin against the real remote project', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    requireRemoteSmokeEnv();

    const name = process.env.E2E_REMOTE_ADMIN_NAME as string;
    const pin = process.env.E2E_REMOTE_ADMIN_PIN as string;

    await loginAsNamed(page, name, pin);
    await expect(page).toHaveURL(/\/(home|pos)/);

    await logout(page);
  });
});
