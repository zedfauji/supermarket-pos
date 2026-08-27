import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  testDir: './e2e/visual',
  outputDir: './e2e-results-visual',
  fullyParallel: true,
  workers: undefined,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-visual', open: 'never' }],
  ],
  use: {
    // Distinct from sibling project /mnt/ai/bola8pos-kiro/bar-pos, which is fixed on 1420/1421.
    baseURL: 'http://localhost:1520',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: {} }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1520',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
