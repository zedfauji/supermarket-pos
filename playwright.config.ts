import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

function findAgentBrowserChrome(): string | undefined {
  const browsersDir = path.join(homedir(), '.agent-browser', 'browsers');
  try {
    const highest = readdirSync(browsersDir)
      .filter(entry => entry.startsWith('chrome-'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .at(-1);
    return highest ? path.join(browsersDir, highest, 'chrome') : undefined;
  } catch {
    return undefined;
  }
}

const chromePath = findAgentBrowserChrome();

const fastE2e = process.env.FAST_E2E === '1' || process.env.FAST_E2E === 'true';
// Headless is the default and non-negotiable per project policy
// (.planning/decisions/2026-08-07-mandatory-automated-testing-no-manual-verification.md)
// and to avoid bugging the user with a popping-up browser window. Watch execution
// via the HTML report dashboard instead: npm run test:e2e:report
const slowMo = fastE2e ? 0 : 400;
const testTimeout = fastE2e ? 45_000 : 60_000;
const webServerTimeout = fastE2e ? 75_000 : 120_000;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  // /visual\// — the visual-regression suite runs separately via
  // playwright.visual.config.ts (npm run test:e2e:visual), not the default run.
  // \.test\.ts$ — e2e/helpers/*.test.ts files are plain Vitest unit tests for
  // the helpers themselves (not Playwright specs); Playwright's default
  // testMatch would otherwise also pick them up during full-suite discovery,
  // and loading a file that imports from 'vitest' inside Playwright's test
  // runner throws `Cannot redefine property: Symbol($$jest-matchers-object)`
  // and silently aborts discovery for the entire run (0 tests found).
  testIgnore: [/visual\//, /\.test\.ts$/],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: testTimeout,
  expect: {
    timeout: fastE2e ? 5_000 : 10_000,
  },
  globalTeardown: path.join(__dirname, 'e2e', 'global-teardown.ts'),
  reporter: [
    ['blob', { outputDir: 'e2e-blob-reports' }],
    ['list'],
    ['json', { outputFile: 'e2e-results/results.json' }],
    // Dashboard: always generated, never auto-opens a browser tab.
    // View progress/results any time with `npm run test:e2e:report`.
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    // E2E specs import `test` from `e2e/fixtures.ts` so every test tails browser
    // `console` + `pageerror` to the runner process.
    // Distinct from sibling project /mnt/ai/bola8pos-kiro/bar-pos, which is fixed on 1420/1421.
    baseURL: 'http://localhost:1520',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    slowMo,
    actionTimeout: fastE2e ? 10_000 : 15_000,
    navigationTimeout: fastE2e ? 15_000 : 30_000,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      headless: true,
      slowMo,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { launchOptions: chromePath ? { executablePath: chromePath } : {}, headless: true },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1520',
    reuseExistingServer: true,
    timeout: webServerTimeout,
  },
});
