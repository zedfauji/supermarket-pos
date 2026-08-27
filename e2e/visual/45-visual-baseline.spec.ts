/**
 * e2e/visual/45-visual-baseline.spec.ts
 *
 * Visual regression baseline: photographs the current supermarket-pos UI.
 * Route list is rebuilt directly from `src/app/router.tsx`'s live registration
 * (Plan 17-16) — the bar-pos-era route/role matrix (pool sessions, kitchen
 * display, waitlist, delivery) this file previously exercised no longer exists
 * in the app.
 * Admin — all 12 registered routes accessible to an authenticated role
 * (everything in router.tsx except `/login`, tested separately unauthenticated).
 * Cashier/Manager — their own route-gate-accessible subset, derived from each
 * route's actual gate component (`ReportsRoute`/`RbacRoute`/`AuditRoute`/
 * `EditHistoryRoute`/`PurchaseOrdersRoute`), not assumed from CLAUDE.md's page-level
 * feature-gating notes — `/inventory`, `/suppliers`, `/staff`, `/settings`, and
 * `/payments` have no route-level role gate (`ProtectedRoute` is auth-only); any
 * RBAC restriction on those pages is an in-page control, not a route redirect.
 *
 * Run in isolation via `npm run test:e2e:visual` (playwright.visual.config.ts —
 * headless, bundled Chromium, no slowMo/channel; unchanged by this plan).
 *
 * Seeding: `resetTestState()` + `openCaja()` only — no extra fixture seeding is
 * needed since the only route in this file exercising sale/session content is
 * `/staff` (via CajaDashboard/StaffDashboard), which is masked, not asserted on.
 *
 * Known flake: if `npm run dev` is cold-starting (this suite's own first request
 * of the session), `waitForPageReady()` can occasionally stabilize on a loading
 * skeleton instead of real content on a TanStack-Query-heavy route (seen on
 * /pos). Re-run once before treating a failure as a real regression — a second
 * run against the already-warm dev server has been reliable. If a retry still
 * fails, that's a real diff (or `waitForPageReady()` needs to check for absence
 * of a skeleton marker, not just stable text length) — don't just retry forever.
 */

import type { Locator } from '@playwright/test';
import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs, logout, WHO_ARE_YOU_RE } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

function toastMask(page: Page): Locator {
  return page.locator('[data-sonner-toaster]');
}

/**
 * Per-route mask array. `/staff` masks two additional regions beyond the toast
 * (Rule 2 — required for Task 2's two-run zero-diff gate to pass, not just
 * cosmetic):
 *  - StaffDashboard's "Clock in"/"Shift duration" columns: `loginAs()` auto-starts
 *    a shift (opening-cash dialog) for whichever role is currently logged in when
 *    no open shift exists, so the just-logged-in role's row always shows a
 *    real, ticking `clock_in`/duration value that is freshly `now()` on every
 *    suite run — not something `resetTestState()` alone can neutralize, since it
 *    runs BEFORE this suite's own logins re-create the shift.
 *  - CajaDashboard's "Opened: <time>" line (StaffPage renders CajaDashboard above
 *    StaffDashboard): this suite's own `openCaja()` call stamps `opened_at = now()`
 *    on every run, so the printed timestamp differs between the seed run and any
 *    later verification run.
 *  - `/audit` and `/edit-history` mask their whole `DataTable` (AuditLogTable /
 *    EditHistoryTable): both list every action taken anywhere in the app,
 *    newest-first, and this suite runs against a Supabase instance shared by
 *    every concurrent worktree's own E2E fixtures — any other suite's write
 *    (a refund, an edit, a clock-in) reorders or appends a row here between
 *    the seed run and the verification run. Row count/order is not something
 *    this test can control, only mask.
 */
function masksFor(page: Page, route: string): Locator[] {
  const toast = toastMask(page);
  if (route === '/staff') {
    return [
      toast,
      page.getByText(/^Opened:/),
      page.locator('table tbody tr td:nth-child(3)'),
      page.locator('table tbody tr td:nth-child(4)'),
    ];
  }
  if (route === '/audit' || route === '/edit-history') {
    return [toast, page.locator('table')];
  }
  return [toast];
}

type RouteSpec = { path: string; slug: string };

/**
 * Wait for the SPA to have actually painted route content before screenshotting.
 * `gotoAuthed()` only waits for `domcontentloaded`; every route component is
 * `React.lazy()` + `Suspense` and fetches its own data via TanStack Query, so a
 * screenshot taken immediately after navigation reliably captures a blank frame
 * (confirmed empirically — every route lacking a preceding `toBeVisible()`
 * assertion seeded as a fully blank PNG). How long that takes varies a lot per
 * route (Reports/Settings/RBAC's heavier bundles are noticeably slower than
 * POS/Inventory), so a single fixed delay under- or over-waits depending on the
 * route — poll `document.body`'s text length until it stops changing instead.
 * `networkidle` is not used here because the Supabase Realtime WebSocket retries
 * continuously in this dev environment and would make every wait time out at
 * its own timeout instead of resolving.
 */
async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  let previousLength = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const length = await page
      .evaluate(() => document.body.innerText.trim().length)
      .catch(() => 0);
    if (length > 0 && length === previousLength) break;
    previousLength = length;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => document.fonts.ready);
}

async function captureRoute(page: Page, role: string, route: RouteSpec): Promise<void> {
  await gotoAuthed(page, route.path);
  await waitForPageReady(page);
  await expect.soft(page).toHaveScreenshot(`${role}-${route.slug}.png`, {
    fullPage: true,
    mask: masksFor(page, route.path),
  });
}

// ---------------------------------------------------------------------------
// Route × role matrix, derived from the actual route-gate components in
// src/app/*-route.tsx (not from CLAUDE.md's page-level RBAC notes, which
// describe in-page feature gates, not route-level redirects):
//   - `/reports`  -> ReportsRoute (`view_reports`, manager+)
//   - `/rbac`     -> RbacRoute (`manage_staff`, admin only)
//   - `/audit`    -> AuditRoute (`view_audit_log`, manager+)
//   - `/edit-history` -> EditHistoryRoute (`view_audit_log`, manager+)
//   - `/purchase-orders` -> PurchaseOrdersRoute (`manage_products`, manager+)
//   - everything else (`/home`, `/pos`, `/inventory`, `/suppliers`, `/staff`,
//     `/settings`, `/payments`) is only `ProtectedRoute`-gated (auth only).
// ---------------------------------------------------------------------------

const CASHIER_ROUTES: RouteSpec[] = [
  { path: '/home', slug: 'home' },
  { path: '/pos', slug: 'pos' },
  { path: '/inventory', slug: 'inventory' },
  { path: '/suppliers', slug: 'suppliers' },
  { path: '/staff', slug: 'staff' },
  { path: '/settings', slug: 'settings' },
  { path: '/payments', slug: 'payments' },
];
const CASHIER_DENIED = ['/reports', '/rbac', '/edit-history', '/purchase-orders'];

const MANAGER_ROUTES: RouteSpec[] = [
  ...CASHIER_ROUTES,
  { path: '/reports', slug: 'reports' },
  { path: '/edit-history', slug: 'edit-history' },
  { path: '/purchase-orders', slug: 'purchase-orders' },
  { path: '/audit', slug: 'audit' },
];
const MANAGER_DENIED = ['/rbac'];

const ADMIN_ROUTES: RouteSpec[] = [...MANAGER_ROUTES, { path: '/rbac', slug: 'rbac' }];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.serial('Visual regression baseline (Phase 17)', () => {
  test.beforeEach(() => {
    requireIntegrationEnv();
  });

  test.beforeAll(async () => {
    await resetTestState();
    await openCaja(300);
  });

  test.afterAll(async () => {
    await resetTestState();
  });

  // Pitfall 7 — /login redirects to /home when already authenticated. Runs first
  // in a fresh, never-logged-in context (default Playwright per-test isolation).
  test('login page (unauthenticated)', async ({ page }) => {
    await page.goto('/login');
    const heading = page.getByRole('heading', { name: WHO_ARE_YOU_RE });
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // The employee-picker list below the heading renders every active
    // `profiles` row, and this suite runs against a Supabase instance shared
    // by every concurrent worktree's own E2E fixtures — its length (and thus
    // full-page height) is not under this test's control. Cap the list's
    // rendered height so the page height is deterministic, and mask its
    // content since which staff show up varies run to run.
    const employeeList = heading.locator('xpath=following-sibling::div[1]');
    await employeeList.evaluate(el => {
      el.style.maxHeight = '400px';
      el.style.overflow = 'hidden';
    });
    await page.evaluate(() => document.fonts.ready);
    await expect.soft(page).toHaveScreenshot('login.png', {
      fullPage: true,
      mask: [toastMask(page), employeeList],
    });
  });

  test('admin — all accessible routes', async ({ page }) => {
    test.setTimeout(300_000);
    await loginAs(page, 'admin');
    for (const route of ADMIN_ROUTES) {
      await captureRoute(page, 'admin', route);
    }
    await logout(page);
  });

  test('cashier — accessible routes + denied redirects', async ({ page }) => {
    test.setTimeout(300_000);
    await loginAs(page, 'cashier');
    for (const route of CASHIER_ROUTES) {
      await captureRoute(page, 'cashier', route);
    }

    for (const denied of CASHIER_DENIED) {
      await gotoAuthed(page, denied);
      await expect(page).toHaveURL(/\/home$/);
    }

    // /audit is the one denied route that IS screenshotted — AuditRoute renders
    // a distinguishing sonner toast on top of /home before the redirect settles.
    // React StrictMode double-invokes AuditRoute's render in dev mode, so
    // toast.error() fires twice — `.first()` avoids a strict-mode locator
    // violation (toast stacking on a double-invoked guard is correct UX, not a
    // bug to route around).
    await gotoAuthed(page, '/audit');
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    await expect.soft(page).toHaveScreenshot('cashier-audit-denied.png', { fullPage: true });

    await logout(page);
  });

  test('manager — accessible routes + denied redirects', async ({ page }) => {
    test.setTimeout(300_000);
    await loginAs(page, 'manager');
    for (const route of MANAGER_ROUTES) {
      await captureRoute(page, 'manager', route);
    }

    for (const denied of MANAGER_DENIED) {
      await gotoAuthed(page, denied);
      await expect(page).toHaveURL(/\/home$/);
    }

    await logout(page);
  });
});
