import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export type { Page };

/**
 * Filter for uncaught JS errors we still stream but should not fail the test.
 * (We do not assert on `console` level "error" — that includes CORS, 406, and
 * resource load noise in DevTools. Those are tailed to stdout for manual review.)
 */
function isBenignPageErrorMessage(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes('resizeobserver')) return true;
  if (t.includes('non-error promise rejection')) return true;
  if (t.includes('favicon')) return true;
  return false;
}

/**
 * Stream DevTools console + uncaught page errors to the test runner (stdout/stderr)
 * and record `error`-level console + `pageerror` for post-test assertion.
 */
function attachBrowserConsoleTail(
  page: Page,
  recorded: { pageErrors: string[] },
): void {
  page.on('console', (msg) => {
    const loc = msg.location();
    const where =
      loc.url && loc.url.length > 0
        ? ` ${loc.url}:${String(loc.lineNumber)}`
        : '';
    process.stdout.write(`[browser][${msg.type()}]${where} ${msg.text()}\n`);
  });
  page.on('pageerror', (err) => {
    process.stderr.write(`[browser][pageerror] ${err.message}\n`);
    if (err.stack) {
      process.stderr.write(`${err.stack}\n`);
    }
    recorded.pageErrors.push(err.message);
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const recorded = { pageErrors: [] as string[] };
    attachBrowserConsoleTail(page, recorded);
    await use(page);
    const badPage = recorded.pageErrors.filter((m) => !isBenignPageErrorMessage(m));
    expect(
      badPage,
      'Uncaught exceptions in the page (pageerror). Console stream is in stdout; fix app code or test.',
    ).toEqual([]);
  },
});

export { expect };
