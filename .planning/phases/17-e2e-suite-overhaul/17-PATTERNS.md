# Phase 17: E2E Suite Overhaul - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** ~55 (50 existing specs to move/rewrite/delete, plus ~6 new/modified support files)
**Analogs found:** 6 / 6 support-file categories (spec-content rewrite work uses the existing spec files themselves as analogs — this is an audit-and-rewrite phase, not new-pattern authoring)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `e2e/<domain>/*.spec.ts` (all moved/rewritten specs, D-06/D-07) | test | request-response (UI) + CRUD (DB assertions) | the existing spec file being moved (same content, new home) | exact |
| `e2e/helpers/db-assertions.ts` (new, D-12) | utility (test helper) | CRUD (read-only queries) | `e2e/helpers/supabase.ts` (`getServiceClient`, existing query helpers) | exact |
| `e2e/global-teardown.ts` (`SUITE_MAP`/`classify()` rewrite, Pitfall 1) | utility (report generator) | transform | same file, current `SUITE_MAP` (being replaced, not analog from elsewhere) | exact |
| `playwright.config.ts` (D-15/D-16 changes) | config | — | same file, current `projects`/`use` block | exact |
| `package.json` (`test:e2e:ui` script, D-17) | config | — | same file, existing `test:e2e`/`test:e2e:report` scripts | exact |
| `scripts/seed-dev-data.ts` (Indian catalog rewrite, D-01) | utility (seed script) | batch/CRUD | same file, current bar-food seed logic (idempotent upsert-by-natural-key pattern kept, only content changes) | exact |
| `supabase/seed.sql` (Indian catalog rewrite, D-01) | migration/seed | batch | same file | exact |
| RLS-boundary E2E checks (D-13, likely new `e2e/<domain>/*-rls.spec.ts` files) | test | request-response | `src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts` (Vitest, not Playwright — client-construction shape is the reusable part) | role-match |

## Pattern Assignments

### `e2e/<domain>/*.spec.ts` — moved/rewritten spec files (D-06/D-07/D-08/D-10/D-11)

**Analog:** the file's own current version, e.g. `e2e/53-supplier-receiving.spec.ts`, `e2e/50-direct-sale-checkout.spec.ts`

**Imports pattern** (`e2e/53-supplier-receiving.spec.ts:1-6`):
```typescript
import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures';
import { gotoAuthed, loginAs } from './helpers/auth';
import { requireIntegrationEnv } from './helpers/requireEnv';
import { getServiceClient, resetTestState } from './helpers/supabase';
```
After the D-06 move into folders, these relative imports become `../fixtures`, `../helpers/auth`, `../helpers/requireEnv`, `../helpers/supabase` (and `../helpers/db-assertions` for D-12). `test`/`expect` MUST come from the local `./fixtures` wrapper (console/pageerror tailing), never straight from `@playwright/test`.

**Env-gate + reset pattern** (`e2e/53-supplier-receiving.spec.ts:33-36`):
```typescript
test.describe('Supplier receiving quick-add', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });
```
Every DB-touching spec starts this way — keep as-is in rewrites.

**Service-role seeding pattern** (`e2e/53-supplier-receiving.spec.ts:8-15`):
```typescript
async function createSupplier() {
  const db = getServiceClient();
  const name = `${PREFIX} supplier ${randomUUID()}`;
  const { data, error } = await db.from('suppliers').insert({ name }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Unable to create supplier');
  return { db, id: data.id, name };
}
```
Fixtures use a `randomUUID()`-suffixed name/prefix (`PREFIX` const) for test-run isolation under serial execution (D-14 keeps this — no per-worker isolation needed, just per-run uniqueness).

**UI-driving pattern** (`e2e/53-supplier-receiving.spec.ts:18-29`):
```typescript
async function openQuickAdd(page, supplierName: string, search: string) {
  await gotoAuthed(page, '/suppliers');
  await page.getByRole('button', { name: /receive shipment|recibir/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/supplier|proveedor/i).selectOption({ label: supplierName });
  ...
}
```
Locale-agnostic regex matchers (`/foo|bar/i`) are the house style everywhere — matches both es-MX and en-US per `e2e/helpers/auth.ts`'s comment on cold-start locale. Every rewritten spec must keep this bilingual-regex convention, not hardcode one locale's copy.

**RPC-mirroring assertion pattern** (`e2e/50-direct-sale-checkout.spec.ts:15-35`, for D-11 forced-failure RPC tests):
```typescript
async function getTaxRatePercent(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const rate = (data?.value as { taxRatePercent?: number } | null)?.taxRatePercent;
  return typeof rate === 'number' ? rate : 16;
}
function computeAuthoritativeTotal(subtotal: number, taxRatePercent: number): number {
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}
```
New forced-failure tests (D-11) for `receive_shipment`/`process_refund`/`close_caja_session` should mirror this style: compute the RPC's authoritative expected value/rejection client-side, then assert the DB has NOT partially applied it.

---

### `e2e/helpers/db-assertions.ts` (new, D-12)

**Analog:** `e2e/helpers/supabase.ts`

**Client construction to reuse verbatim** (`e2e/helpers/supabase.ts:9-26`):
```typescript
function getUrl(): string {
  const u = process.env.VITE_SUPABASE_URL;
  if (!u) throw new Error('Missing VITE_SUPABASE_URL');
  return u;
}
function getServiceKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return k;
}
export function getServiceClient(): SupabaseClient {
  return createClient(getUrl(), getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

**Assertion helper shape** (from RESEARCH.md Code Examples, table name corrected per Pitfall 2 — `stock_movements`, NOT `inventory_log`):
```typescript
import { getServiceClient } from './supabase';

export async function assertStockMovement(
  productId: string,
  expectedDelta: number,
  expectedReason: 'sale' | 'manual_adjustment' | 'waste' | 'delivery' | 'correction' | 'physical_count' | 'expired',
): Promise<void> {
  const admin = getServiceClient();
  const { data, error } = await admin
    .from('stock_movements')
    .select('quantity_delta, reason')
    .eq('product_id', productId)
    .eq('reason', expectedReason)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.quantity_delta !== expectedDelta) {
    throw new Error(`Expected stock_movements row for product ${productId} ...`);
  }
}
```
Add sibling helpers following the same shape for `audit_logs`, `payments`, `caja_entries`, `purchase_orders`/`purchase_order_items` rows per D-10's flow list. Never inline a service-role key — always route through `getServiceClient()`.

---

### `e2e/global-teardown.ts` — `SUITE_MAP`/`classify()` rewrite (Pitfall 1)

**Current (to be replaced)** (`e2e/global-teardown.ts:31-56`):
```typescript
const SUITE_MAP: { match: RegExp; label: string }[] = [
  { match: /^01-ci/, label: 'CI Checks' },
  { match: /^02-caja/, label: 'Caja Management' },
  ... // 26 entries anchored on numeric-prefixed basenames
];
```
This is consumed via `path.basename(file)` matching (`e2e/global-teardown.ts:83-84, 119-124`). **Replace with folder-path classification** — e.g. `file.split(path.sep)` and take the first segment under `e2e/` as the label (title-cased), since D-07 removes numeric prefixes entirely. Do this in the same commit as the D-06 file moves, per RESEARCH.md's explicit warning — otherwise every rewritten spec silently falls into the pre-existing `'Other'` bucket.

---

### `playwright.config.ts` — D-15/D-16 changes

**Current** (`playwright.config.ts:58`):
```typescript
projects: [{ name: 'chromium', use: { channel: 'chrome', headless: true } }],
```

**Target shape** (RESEARCH.md Code Examples — remove `channel`, add `launchOptions.executablePath`, per Pitfall 5 do not set both):
```typescript
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';
import path from 'node:path';

function findAgentBrowserChrome(): string | undefined {
  const browsersDir = path.join(homedir(), '.agent-browser', 'browsers');
  let entries: string[];
  try {
    entries = readdirSync(browsersDir);
  } catch {
    return undefined;
  }
  const versions = entries
    .filter((e) => e.startsWith('chrome-'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const highest = versions.at(-1);
  return highest ? path.join(browsersDir, highest, 'chrome') : undefined;
}

const chromePath = findAgentBrowserChrome();
projects: [{
  name: 'chromium',
  use: {
    headless: true,
    launchOptions: chromePath ? { executablePath: chromePath } : {},
  },
}],
```
D-15's `trace`/`video`/`screenshot` fields live in the same top-level `use` block above `projects` in the current file — switch `'on'` to `'retain-on-failure'`/`'on-first-retry'`/`'only-on-failure'` respectively there, not per-project.

---

### `package.json` — `test:e2e:ui` script (D-17)

**Current** (`package.json:28-30`):
```json
"test:e2e": "playwright test",
"test:e2e:report": "playwright show-report",
"test:e2e:visual": "playwright test --config=playwright.visual.config.ts",
```

**Add:**
```json
"test:e2e:ui": "playwright test --ui",
```

---

### RLS-boundary E2E checks (D-13)

**Analog:** `src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts:1-55` (Vitest integration test — reuse the client-construction shape, not the test framework)

```typescript
const db = createClient(url!, serviceKey!, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'po-rls-test-service-role' },
});
const managerClient = createClient(url!, anonKey!, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'po-rls-test-manager' },
});
const cashierClient = createClient(url!, anonKey!, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'po-rls-test-cashier' },
});
```
**Critical:** the distinct `storageKey` per client is load-bearing — without it, multiple signed-in clients in the same process clobber each other's session. In Playwright specs (browser-driven, not raw-client), D-13 checks can instead sign in a second `SupabaseClient` (anon key + `signInWithPassword`) inside the test to attempt the denied mutation directly against Postgres, asserting a `42501`/RLS-denial error — never use `getServiceClient()` for the "should be denied" assertion (would produce a false-negative pass, since service-role bypasses RLS).

---

## Shared Patterns

### Locale-agnostic UI matching
**Source:** `e2e/helpers/auth.ts:6-14`
**Apply to:** every rewritten spec's `getByRole`/`getByLabel` calls
```typescript
export const WHO_ARE_YOU_RE = /who are you|quién eres/i;
const OPENING_CASH_RE = /opening cash|fondo de caja/i;
```
Cold-start locale is es-MX with no fallback; always match both locales with a combined regex, never assume en-US.

### Env-gated integration tests
**Source:** `e2e/helpers/requireEnv.ts:13-19`
**Apply to:** every DB-touching spec (all of them, given D-10)
```typescript
export function requireIntegrationEnv(): void {
  const missing = INTEGRATION_KEYS.filter(k => !process.env[k]?.trim());
  if (missing.length > 0) {
    test.skip(true, `Missing bar-pos/.env.local keys: ${missing.join(', ')}`);
  }
}
```
Note: `INTEGRATION_KEYS` list itself may need a new entry if any new env var is introduced; none is expected for this phase.

### Console/pageerror tailing wrapper
**Source:** `e2e/fixtures.ts:1-40` (`isBenignPageErrorMessage`, `attachBrowserConsoleTail`)
**Apply to:** every spec — always import `test`/`expect` from `./fixtures` (or the folder-adjusted relative path), never `@playwright/test` directly. This is what fails a test on uncaught page errors.

### Idempotent upsert-by-natural-key seeding
**Source:** `scripts/seed-dev-data.ts:1-20` (module doc + idempotency contract)
**Apply to:** the Indian-catalog rewrite of `scripts/seed-dev-data.ts` and `supabase/seed.sql` (D-01) — keep the "match by natural key (name), insert-if-missing, update-in-place on content fields" contract; only the seeded content (bar-food → Indian grocery) changes, not the upsert mechanism. Do not touch the `resources`/pool-table non-overwrite guard mentioned in the doc comment — that table is already dropped (Phase 1), so this whole paragraph of the doc comment is now dead and should be deleted as part of the rewrite, not carried forward.

### Service-role key handling
**Source:** `e2e/helpers/supabase.ts:9-19`
**Apply to:** `db-assertions.ts` and any new helper — always `process.env.SUPABASE_SERVICE_ROLE_KEY`, throw if missing, never hardcode.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| New Indian-grocery SKU fixture data (D-02 catalog content itself) | config/fixture data | batch | No prior Indian-product content exists in the repo — this is genuinely new content authored against `.planning/PROJECT.md`'s category list, not a code pattern to copy. Existing bar-food seed rows in `supabase/seed.sql`/`scripts/seed-dev-data.ts` are the structural template (column shape), not a content analog. |

## Metadata

**Analog search scope:** `e2e/` (all 50 spec files + helpers/fixtures/global-teardown), `playwright.config.ts`, `playwright.visual.config.ts`, `package.json`, `scripts/seed-dev-data.ts`, `supabase/seed.sql`, `src/entities/*/model/*rls.integration.test.ts`, `src/shared/lib/supabase.types.ts`, `src/shared/lib/domain.ts`
**Files scanned:** ~20 read directly this pass (RESEARCH.md's prior session already read all 50 spec files + helpers in full — this pass reused those findings rather than re-reading unchanged ranges)
**Pattern extraction date:** 2026-08-25
