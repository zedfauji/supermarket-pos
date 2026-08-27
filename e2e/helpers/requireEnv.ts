import { test } from '@playwright/test';

const INTEGRATION_KEYS = [
  'E2E_BARTENDER_NAME',
  'E2E_BARTENDER_PIN',
  'E2E_MANAGER_NAME',
  'E2E_MANAGER_PIN',
  'E2E_ADMIN_NAME',
  'E2E_ADMIN_PIN',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Skip file when required Playwright + Supabase env is missing. */
export function requireIntegrationEnv(): void {
  const missing = INTEGRATION_KEYS.filter(k => !process.env[k]?.trim());
  if (missing.length > 0) {
    test.skip(true, `Missing bar-pos/.env.local keys: ${missing.join(', ')}`);
  }
}
