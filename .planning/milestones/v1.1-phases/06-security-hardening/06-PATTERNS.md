# Phase 6: Security hardening - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 9 (2 new, 7 modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/functions/agent-proxy/index.ts` (NEW) | edge-function (controller-equivalent) | request-response, proxy | `supabase/functions/process-payment/index.ts` | exact (auth pattern), partial (response shape must diverge — pass-through, not envelope) |
| `src/shared/lib/agent/brain.ts` | service (client-side orchestration) | request-response | itself (swap SDK call for `fetch()`, keep everything else) — secondary analog `callProcessPayment` in `edge-function-contracts.ts` | role-match |
| `src/shared/lib/agent/vision.ts` | service (client-side orchestration) | request-response | same as `brain.ts` | role-match |
| `src/shared/lib/edge-function-contracts.ts` (append `callAgentProxy`) | service (edge contract) | request-response | `callProcessPayment` (same file, lines 198-225+) | exact |
| `src/shared/lib/agent/brain.test.ts` | test | request-response | itself — restructure `vi.mock('@anthropic-ai/sdk')` → mock `global.fetch` | exact (self) |
| `src/shared/lib/agent/vision.test.ts` (NEW) | test | request-response | `brain.test.ts`'s new fetch-mock structure | role-match |
| `supabase/migrations/<ts>_receipt_settings.sql` (NEW) | migration | CRUD/DDL | `supabase/migrations/20260419000001_settings_and_backups.sql` (table+RLS shape) + `20260510000001_rls_rewrite_phase13.sql` lines 975-987 (exact drafted policy SQL) | exact |
| `src/entities/settings/model/queries.ts` (add `useReceiptSettings`/`useMutationUpdateReceiptSettings`) | model/query hook | CRUD | `useSettings`/`useMutationUpdateSetting` (same file, lines 185-262) | exact |
| `src/features/receipt-settings-rls/*.integration.test.ts` (NEW, name planner's choice) | test | CRUD, role-scoped | `src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts` | exact |

## Pattern Assignments

### `supabase/functions/agent-proxy/index.ts` (NEW)

**Analog:** `supabase/functions/process-payment/index.ts`

**Imports + CORS/response helpers** (lines 1-3, 50-60):
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
```

**Bearer-auth pattern — copy verbatim** (lines 83-121):
```typescript
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: { code: 'CONFIG', message: 'Server misconfigured' } }, 500);
  }

  // Verify the JWT via a direct HTTP call to /auth/v1/user.
  // admin.auth.getUser() in supabase-js@2.49.1 fails with ES256-signed tokens
  // ("Unsupported JWT algorithm ES256") — the Auth REST API handles ES256 correctly.
  const token = authHeader.slice(7);
  const authVerifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
  });
  if (!authVerifyResp.ok) {
    return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
  }
  const authUser = await authVerifyResp.json() as { id: string };
  // No manager/admin role check beyond this (D-03) — any authenticated staff may call.
  // authUser.id / admin client (createClient(supabaseUrl, serviceRoleKey)) not needed
  // unless the plan adds audit logging — this proxy does no DB write.
```

**Divergence from analog — response shape (D-01/A2, Pattern 3 in RESEARCH.md):**
Do NOT wrap the success response in `{ success, data }` like `process-payment` does. Forward the validated request body to `https://api.anthropic.com/v1/messages` via `fetch()` with `x-api-key: Deno.env.get('ANTHROPIC_API_KEY')` and `anthropic-version: 2023-06-01`, and return the raw Anthropic JSON body unchanged on success. Only the proxy's own failure modes (auth, validation, upstream error) use a small error envelope — callers (`brain.ts`/`vision.ts`) check `response.ok` first.

```typescript
// Body schema — zod, forwarded opaquely (mirrors process-payment's BodySchema pattern)
const BodySchema = z.object({
  model: z.string(),
  max_tokens: z.number().int().positive(),
  system: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()),
});
```

---

### `src/shared/lib/agent/brain.ts` / `src/shared/lib/agent/vision.ts`

**Current call site to replace (brain.ts lines 144, 149-155, 202-208; vision.ts lines 53-76, 90-100):**
```typescript
const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
let response = await client.messages.create({ model: getModel(), max_tokens: 1024, system: systemPrompt, tools: allToolDefinitions as unknown as Anthropic.Tool[], messages });
```

**Replacement pattern — copy `callProcessPayment`'s client fetch shape** (`src/shared/lib/edge-function-contracts.ts` lines 204-225):
```typescript
// supabase.functions getter creates a new FunctionsClient with static anon-key headers on
// every access — the user JWT is never injected. Use fetch() directly with the cached token.
const accessToken = getCachedAccessToken();
if (!accessToken) { /* map to AUTH_REQUIRED / fall through to ollama fallback */ }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const response = await fetch(`${supabaseUrl}/functions/v1/agent-proxy`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: supabaseAnonKey,
  },
  body: JSON.stringify({ model: getModel(), max_tokens: 1024, system: systemPrompt, tools: allToolDefinitions, messages }),
});
if (!response.ok) { /* throw or fall back — matches existing try/catch attempt-retry loop in brain.ts */ }
const anthropicMessage = await response.json() as Anthropic.Message; // same shape client already parses
```

**Critical constraint (Pattern 3 in RESEARCH.md):** `response.stop_reason` and `response.content.filter/find` parsing in `brain.ts` (lines 160-218) and `vision.ts` (lines 77-81, 101-104) must keep working unmodified — the edge function's raw pass-through preserves this; do not add any unwrapping/renaming.

**Recommendation (A3):** add a `callAgentProxy` function to `edge-function-contracts.ts` (consistent with `callProcessPayment`) rather than inlining `fetch()` twice in `brain.ts` and twice in `vision.ts`.

---

### `src/shared/lib/agent/brain.test.ts` (MODIFIED) / `vision.test.ts` (NEW)

**Current mock to remove** (lines 5-16):
```typescript
const { mockMessagesCreate, ... } = vi.hoisted(() => ({ mockMessagesCreate: vi.fn(), ... }));
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() { return { messages: { create: mockMessagesCreate } }; }
  return { default: MockAnthropic };
});
```

**Replacement:** mock `global.fetch` (or mock `callAgentProxy` from `edge-function-contracts.ts` if that's the chosen boundary) to return `{ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) }` — same `textResponse()` helper shape (lines 45-50) can stay, only the mock target changes from the SDK constructor to `fetch`/`callAgentProxy`. `vision.test.ts` is new — mirror this same fetch-mock structure since no test file exists today for `vision.ts`.

---

### `supabase/migrations/<timestamp>_receipt_settings.sql` (NEW)

**Analog table shape** — `supabase/migrations/20260419000001_settings_and_backups.sql` lines 1-14 (adapt columns to `ReceiptSettingsSchema`, domain.ts lines 808-822):
```sql
CREATE TABLE receipt_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_width_chars SMALLINT NOT NULL DEFAULT 32,
  show_cashier_name BOOLEAN NOT NULL DEFAULT true,
  show_customer_name BOOLEAN NOT NULL DEFAULT true,
  show_receipt_number BOOLEAN NOT NULL DEFAULT true,
  header_line_2 VARCHAR(48) NOT NULL DEFAULT '',
  footer_text VARCHAR(480) NOT NULL DEFAULT '',
  bold_totals BOOLEAN NOT NULL DEFAULT true,
  print_on_start BOOLEAN NOT NULL DEFAULT false,
  auto_cut BOOLEAN NOT NULL DEFAULT false,
  kds_enabled BOOLEAN NOT NULL DEFAULT false,
  logo_data_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE TRIGGER update_receipt_settings_updated_at BEFORE UPDATE ON receipt_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE receipt_settings ENABLE ROW LEVEL SECURITY;
```

**RLS policy SQL — already drafted, reuse verbatim** (`supabase/migrations/20260510000001_rls_rewrite_phase13.sql` lines 981-984, `DO $rs$` guard block; strip the `IF EXISTS` guard since the table now actually exists at migration time):
```sql
CREATE POLICY "receipt_settings_select_authenticated" ON receipt_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "receipt_settings_insert_admin" ON receipt_settings FOR INSERT TO authenticated WITH CHECK (get_user_role() IN ('manager', 'admin'));
CREATE POLICY "receipt_settings_update_admin" ON receipt_settings FOR UPDATE TO authenticated USING (get_user_role() IN ('manager', 'admin')) WITH CHECK (get_user_role() IN ('manager', 'admin'));
CREATE POLICY "receipt_settings_delete_admin" ON receipt_settings FOR DELETE TO authenticated USING (get_user_role() = 'admin');
```
Note: D-04 requires cashier to `SELECT` but not write — the `USING (true)` select policy already matches (any authenticated), and insert/update/delete are already `manager`/`admin`-only. No changes needed to this drafted SQL beyond activating it. D-06: leave old `settings` row `key='receipt'` behavior as a planner decision (delete vs. orphan) — not resolved by an existing pattern.

---

### `src/entities/settings/model/queries.ts` (add `receipt_settings` query/mutation pair)

**Analog:** `useSettings`/`useMutationUpdateSetting` in the same file (lines 185-262) — but `receipt_settings` is its own table now, not a `key`-scoped row inside `settings`, so the new hooks read/write `supabase.from('receipt_settings')` directly instead of going through `toSnapshot`/`SETTINGS_KEYS`.

```typescript
// Pattern to follow (adapt table name + drop the `key` dimension):
export function useReceiptSettings() {
  const query = useQuery({
    queryKey: ['receipt_settings'],
    queryFn: async (): Promise<Result<ReceiptSettings>> => {
      const res = await supabaseQuery(() =>
        supabase.from('receipt_settings').select('*').maybeSingle()
      );
      if (!res.ok) return res;
      return ok(res.data ? parseReceipt(res.data) : DEFAULT_RECEIPT); // DEFAULT_RECEIPT already exists, line 75-87
    },
    staleTime: 30 * 1000,
  });
  // ...same `r?.ok ? r.data : undefined` unwrap pattern as useSettings (lines 206-212)
}

export function useMutationUpdateReceiptSettings() {
  // same useMutation + supabaseMutation + upsert + queryClient.invalidateQueries shape
  // as useMutationUpdateSetting (lines 215-262), targeting 'receipt_settings' table,
  // no `key`/`onConflict: 'key'` — this table is a true singleton (D-04), so upsert
  // needs a fixed conflict target (e.g. a known fixed id, or select-then-insert/update).
}
```

**Reuse directly (no changes needed):** `ReceiptSettingsSchema` (`domain.ts:808-822`), `DEFAULT_RECEIPT` (`queries.ts:75-87`), `parseReceipt` (`queries.ts:139-142`).

**Consumers to repoint** (per RESEARCH.md, confirmed): `HardwareSettingsTab.tsx`, `LogoUploader.tsx` via `useUploadLogo.ts` — both currently go through `useSettings()`/`useMutationUpdateSetting({ key: 'receipt', ... })`; swap to the new hooks.

---

### Role-scoped RLS integration test (NEW)

**Analog:** `src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts` (724 lines) — copy structure wholesale, not just a snippet:

```typescript
// Source: reopen-tab-rpc.integration.test.ts:1-58 (verbatim, this session)
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const skip = !url || !anonKey || !serviceKey;

describe.skipIf(skip)('receipt_settings RLS (integration)', () => {
  const db = createClient(url!, serviceKey!) as any; // service-role seed/cleanup client

  async function createAuthStaff(role: 'manager' | 'cashier'): Promise<{ id: string; email: string; password: string }> {
    // db.auth.admin.createUser + db.from('profiles').upsert({ role, ... })
    // — copy verbatim from lines 60-86
  }
  async function signInClient(email: string, password: string) {
    // createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    //   .auth.signInWithPassword(...) — copy verbatim from lines 88+
  }

  // Test body: cashier client SELECT receipt_settings → succeeds;
  // cashier client INSERT/UPDATE/DELETE → RLS-denied (expect error);
  // manager client INSERT/UPDATE/DELETE → succeeds. Cleanup in afterEach/afterAll.
});
```

## Shared Patterns

### Bearer-JWT auth in edge functions
**Source:** `supabase/functions/process-payment/index.ts` lines 92-121
**Apply to:** `agent-proxy/index.ts` (only new edge function this phase touches)

### Client-side authenticated fetch to an edge function
**Source:** `src/shared/lib/edge-function-contracts.ts` lines 204-225 (`callProcessPayment`)
**Apply to:** new `callAgentProxy` helper; `brain.ts`/`vision.ts` callers

### `Result<T>` + `supabaseQuery`/`supabaseMutation` wrapping
**Source:** `src/entities/settings/model/queries.ts` (all existing hooks in the file)
**Apply to:** new `useReceiptSettings`/`useMutationUpdateReceiptSettings`

### RLS role-scoped policy shape (`get_user_role() IN (...)`)
**Source:** `supabase/migrations/20260419000001_settings_and_backups.sql` lines 36-71, and the already-drafted `receipt_settings` policy SQL in `20260510000001_rls_rewrite_phase13.sql` lines 981-984
**Apply to:** new `receipt_settings` migration

### Service-role integration test for RLS (not Playwright)
**Source:** `src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts` (full file — pattern, not excerpt)
**Apply to:** new `receipt_settings` RLS integration test — required because `/settings` is RBAC-gated admin-only, so a Playwright UI test structurally cannot exercise the cashier-write-denied path (see RESEARCH.md Pitfall 1)

## No Analog Found

None — every file this phase touches has a close, directly-reusable analog already live in the codebase (RESEARCH.md's own conclusion: "wiring, not design").

## Open Items Carried From Research (not pattern gaps, but decisions the planner must still make)

- Whether `settings-backup`/`settings-restore` edge functions get extended to include `receipt_settings` in this phase or deferred to Phase 7 (RESEARCH.md Open Question 1 / Pitfall 3) — no existing pattern resolves this, it's a scope decision.
- Whether the old `settings` row `key='receipt'` is deleted or left orphaned (D-06, Claude's Discretion).
- Exact name for the new edge function (`agent-proxy` used as placeholder throughout this doc, per RESEARCH.md A1).

## Metadata

**Analog search scope:** `supabase/functions/`, `supabase/migrations/`, `src/shared/lib/agent/`, `src/shared/lib/edge-function-contracts.ts`, `src/entities/settings/model/`, `src/features/reopen-tab/model/`
**Files scanned:** 9 (process-payment/index.ts, brain.ts, vision.ts, edge-function-contracts.ts, entities/settings/model/queries.ts, 20260419000001_settings_and_backups.sql, 20260510000001_rls_rewrite_phase13.sql, reopen-tab-rpc.integration.test.ts, brain.test.ts)
**Pattern extraction date:** 2026-08-17
