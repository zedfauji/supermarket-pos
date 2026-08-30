import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.remote-e2e') });

// This suite performs real writes against one shared remote Supabase project
// (mkvinyekkyennyegfoxq) — no parallel workers, no retries (a fixture-cleanup
// teardown re-running on a Playwright-level retry could double-create/
// double-delete fixtures).
export default defineConfig({
  testDir: './e2e/remote-smoke',
  outputDir: './e2e-results-remote-smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A single test drives five real UI flows against a real network backend,
  // not a local one — allow substantially more headroom than the default
  // config's 45-60s.
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-remote-smoke', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:1520',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: {} }],
  webServer: {
    // Same command as the default config — inherits the already-remote-valued
    // process.env from this same Node process (dotenv.config() above set
    // VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY before this file's export
    // resolves), so the spawned dev server serves the app pointed at the
    // remote project with zero Vite/build config changes needed.
    command: 'npm run dev',
    url: 'http://localhost:1520',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
