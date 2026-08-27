# Phase 6: Security hardening - Research

**Researched:** 2026-08-17
**Domain:** Supabase Edge Functions (Deno) as a secrets boundary; Postgres RLS for a singleton settings table
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The edge function is a **thin per-call proxy**, not a server-side agent loop. It does: Bearer-auth check (same pattern as `process-payment`) → forward the Anthropic request (messages/tools/config) → call Anthropic server-side with the env-stored key → return the raw response. `brain.ts`'s existing multi-turn tool loop and `vision.ts`'s single-shot image call both keep their current client-side orchestration logic; only `new Anthropic(...).messages.create(...)` is swapped for a `fetch()` to the edge function. Reversibility: costly.
- **D-02:** The client-side local-Ollama fallback path in `brain.ts` is **out of scope** for SEC-01 — local dev-only fallback, not a client-exposed third-party secret.
- **D-03:** No rate limiting or per-user daily cap. Auth-gating (any authenticated staff member, cashier+) is sufficient. Reversibility: reversible.
- **D-04:** `receipt_settings` is a **store-wide singleton**, not per-terminal. One row for the whole store, migration-tracked `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY`. RLS: any authenticated staff can `SELECT`; only `manager`/`admin` can `INSERT`/`UPDATE`/`DELETE`. Reversibility: costly.
- **D-05 (roadmap reinterpretation):** ROADMAP.md Success Criterion #4 ("a cashier-role session cannot read/write another terminal's `receipt_settings` row while manager/admin can") should be implemented as: a cashier-role session can `SELECT` but not `INSERT`/`UPDATE`/`DELETE` the single `receipt_settings` row; manager/admin can do all four. Test should assert role-scoped write isolation, not multi-terminal isolation.
- **D-06:** The new `receipt_settings` table starts **empty** — no backfill from `settings` (`key = 'receipt'`). `DEFAULT_RECEIPT` in `queries.ts` covers the empty-table case. Reversibility: reversible. Planner must still decide (and document) whether the old `settings` row for `key = 'receipt'` is deleted or left orphaned.

### Claude's Discretion

- Whether the old `settings` table's `key = 'receipt'` row is deleted or left orphaned once the client moves to the new `receipt_settings` table (D-06).
- Exact edge function name/route (follow existing naming convention, e.g. `supabase/functions/agent-chat/` or `anthropic-proxy/`).
- Whether `vision.ts` and `brain.ts` share one edge function or each gets its own — SEC-01 says "one shared," so default to one, but confirm both call shapes (chat messages+tools vs. single image message) fit cleanly into one endpoint before committing.

### Deferred Ideas (OUT OF SCOPE)

- Real per-terminal `receipt_settings` isolation — no terminal/device-identity concept exists anywhere in this schema; inventing one now would be new capability, not a security fix.
- Rate limiting / per-user cost caps on the Anthropic edge function (deferred per D-03; noted in REQUIREMENTS.md's v1.2 backlog).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| SEC-01 | Move the Anthropic API call (vision.ts + brain.ts) server-side into one shared Bearer-authenticated Supabase Edge Function, remove client-side key/SDK entirely, confirm via build-output grep. | Confirmed exact call sites, exact `Anthropic.MessageParam`/response shape both files depend on, exact Bearer-auth pattern to copy from `process-payment`, exact Anthropic REST endpoint/headers (CITED, official docs), exact Vitest mock currently in place that must be restructured to satisfy Success Criterion #2. |
| SEC-02 | Give `receipt_settings` a real migration-tracked `CREATE TABLE` + RLS, move client off the generic `settings` table. | Confirmed the table has never existed on this DB (guarded by three separate defensive blocks across one migration), confirmed the exact RLS policy SQL already written but never executed (in the `DO $rs$ ... END $rs$` guard), confirmed both client consumers (`HardwareSettingsTab.tsx`, `LogoUploader.tsx` via `useUploadLogo.ts`) go through the same two `queries.ts` exports, confirmed no other file bypasses `queries.ts` to read the `settings` table directly. |

</phase_requirements>

## Summary

Both fixes are narrow, mechanical, and follow patterns already fully built out elsewhere in this codebase — there is no new architecture to invent, only two existing patterns (`process-payment`'s Bearer-auth edge function shape, and the `settings_and_backups` RLS migration shape) to replicate for a new target. The main risk in both cases is *scope creep disguised as thoroughness*: SEC-01 must NOT become a server-side agent-loop rewrite (D-01 forecloses this explicitly), and SEC-02 must NOT invent a terminal-identity concept (D-04 forecloses this explicitly). The actual engineering work is small: one new edge function forwarding a already-fully-formed Anthropic request, two `fetch()` swaps in `brain.ts`/`vision.ts` that must preserve the exact `Anthropic.Message` response shape those files already parse, one new migration file, and a `queries.ts` addition mirroring the existing `settings` read/write pair.

The one piece of real design judgment is the **test strategy** for Success Criterion #4 (role-scoped RLS). This project's Settings page is already gated to `admin`-only at the RBAC/route layer (`manage_settings` action), so a cashier session can never reach the Settings UI to attempt a write — a Playwright browser test driven through the UI cannot exercise the RLS policy at all, because RBAC blocks the attempt before it reaches the database. The correct test is a **Vitest integration test hitting Supabase directly** (service-role client creates temp cashier/manager auth users, `signInWithPassword`, then attempt `INSERT`/`UPDATE` against `receipt_settings` as each role) — this exact pattern already exists in this repo (`reopen-tab-rpc.integration.test.ts`) and should be copied, not invented.

A second design judgment worth flagging: this phase's move of receipt settings off the generic `settings` table will silently make `settings-backup`/`settings-restore` stop capturing/restoring receipt settings going forward (those edge functions currently back up `settings` wholesale, which happens to include the `key='receipt'` row today). SEC-02's literal wording doesn't ask for backup/restore coverage, and Phase 7 (DATA-02) already touches these same two edge functions for an unrelated `pool_tables` fix — the planner should explicitly decide whether to extend `settings-backup`/`settings-restore` to include `receipt_settings` now, defer it to Phase 7, or accept the gap as a documented Open Question. This is not covered by CONTEXT.md and needs a decision.

**Primary recommendation:** Copy `process-payment`'s Bearer-auth block verbatim into one new edge function (e.g. `supabase/functions/agent-proxy/index.ts`) that forwards `{ model, max_tokens, system?, tools?, messages }` to `https://api.anthropic.com/v1/messages` via `fetch()` with `x-api-key`/`anthropic-version: 2023-06-01` headers and returns the raw Anthropic JSON unchanged; swap the two `client.messages.create(...)` calls in `brain.ts` and the two in `vision.ts` for authenticated `fetch()` calls to that endpoint using the exact `getCachedAccessToken()` + `fetch(...)` pattern already used by `callProcessPayment` in `edge-function-contracts.ts`. For SEC-02, write a migration mirroring `20260419000001_settings_and_backups.sql`'s `settings` table shape but with `ReceiptSettingsSchema`'s exact columns, and reuse the already-drafted (but never-executed) RLS policy SQL sitting inside the `DO $rs$` guard in `20260510000001_rls_rewrite_phase13.sql`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Anthropic API key custody | API / Backend (Edge Function) | — | Secret must never reach the client bundle; edge function is the only tier with `Deno.env.get()` access to a server-only secret. |
| Agent tool-loop orchestration (multi-turn, tool execution, RAG) | Frontend Server / Client (Tauri renderer) | — | Stays client-side per D-01 — tool execution touches Zustand store state and TanStack Query cache that only exist in the renderer; moving this server-side is out of scope. |
| Vision/invoice extraction (single-shot) | Frontend Server / Client (Tauri renderer) | API / Backend (Edge Function, proxy only) | Orchestration (file read, base64 encode, `parseProducts`) stays client-side; only the outbound Anthropic call moves server-side. |
| receipt_settings persistence | Database / Storage (Postgres + RLS) | API / Backend (implicit via PostgREST, no new edge function needed) | This is a pure CRUD table with role-scoped policies — Postgres RLS is the correct enforcement point, no edge function required (same pattern as the `settings` table itself). |
| receipt_settings read (checkout, receipt printing) | Frontend Server / Client (Tauri renderer) | Database / Storage | Client reads via PostgREST (`supabase.from('receipt_settings')`), RLS enforces role at the DB tier. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@supabase/supabase-js` | `2.49.1` (esm.sh, Deno) | Edge function DB/auth client | Already the exact version pinned by every other edge function in this repo (`process-payment`, `_shared/audit.ts`) — must match for consistency, not re-verified per-function. `[VERIFIED: supabase/functions/process-payment/index.ts:2]` — quote: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';` |
| `zod` | `v3.23.8` (deno.land/x, Deno) | Edge function request body validation | Already the exact version pinned by every other edge function in this repo. `[VERIFIED: supabase/functions/process-payment/index.ts:3]` — quote: `import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';` |
| Anthropic Messages REST API | `2023-06-01` (anthropic-version header) | Server-side LLM call, replacing the client SDK | `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. `[CITED: platform.claude.com/docs/en/api/messages]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | — | — | This phase installs no new npm/Deno packages — it is a removal (`@anthropic-ai/sdk`) plus a proxy built from stdlib `fetch()`, matching D-01's "thin proxy" framing. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `fetch()` to Anthropic REST API in the edge function | `import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.91.1'` in Deno | The SDK adds a dependency + version-drift surface in Deno for no real benefit — the edge function is a thin, single-endpoint proxy that only ever calls `messages.create`; raw `fetch()` matches how `process-payment` already talks to Supabase Auth's REST API (`fetch(supabaseUrl + '/auth/v1/user')`) rather than an SDK helper. Recommended: raw `fetch()`. |

**Installation:**

No new packages to install. Removal only:

```bash
npm uninstall @anthropic-ai/sdk
```

**Version verification:** No new package versions to verify for this phase — `@supabase/supabase-js@2.49.1` and `zod@v3.23.8` (Deno) are pinned to match the exact strings already present in `process-payment/index.ts`, confirmed by direct file read this session, not by registry lookup (matching an existing in-repo convention, not introducing a new dependency).

## Package Legitimacy Audit

No external packages are installed by this phase. `@anthropic-ai/sdk` is **removed** (uninstall, not install) — it is the package this phase's SEC-01 requirement explicitly targets for removal from client `package.json`. No new npm or Deno third-party import is introduced; the edge function's two imports (`@supabase/supabase-js@2.49.1`, `zod@v3.23.8`) are copy-pasted from an already-deployed, already-trusted sibling edge function (`process-payment/index.ts`), not newly sourced.

**Packages removed due to `[SLOP]` verdict:** none — `@anthropic-ai/sdk` is a legitimate, actively-maintained Anthropic-published package (current registry version `0.117.1` per `npm view`, confirmed this session); it is removed for architectural reasons (client-side secret exposure), not because it is illegitimate.
**Packages flagged as suspicious `[SUS]`:** none.

## Architecture Patterns

### System Architecture Diagram

```
SEC-01: Anthropic call path (after)
──────────────────────────────────

┌─────────────────────────┐        ┌──────────────────────────────┐        ┌───────────────────────┐
│ Tauri renderer (client)  │        │ Supabase Edge Function        │        │ Anthropic API          │
│                          │        │ (new: agent-proxy/index.ts)   │        │                        │
│ brain.ts: runAgent()     │        │                                │        │                        │
│  1. build system prompt  │        │ 1. verify Bearer JWT via       │        │                        │
│  2. build messages[]     │──POST─▶│    GET {SUPABASE_URL}/auth/    │        │                        │
│     + tools[]            │ Bearer │    v1/user (same as            │        │                        │
│                          │  JWT   │    process-payment)             │        │                        │
│                          │        │ 2. parse+validate body (zod)   │        │                        │
│                          │        │ 3. forward to Anthropic ───────┼──POST─▶│ POST /v1/messages      │
│                          │        │    x-api-key: ANTHROPIC_API_KEY│        │ (server-only secret)   │
│                          │        │    anthropic-version:2023-06-01│        │                        │
│                          │        │ 4. return raw JSON unchanged ◀─┼────────┤ { content, stop_reason,│
│  3. response.stop_reason │◀───────│                                │        │   usage, ... }         │
│     response.content[]   │  JSON  │                                │        │                        │
│  4. tool_use loop (local)│        │                                │        │                        │
│     executeTool() ── RAG │        │                                │        │                        │
│     stays entirely       │        │                                │        │                        │
│     client-side (D-01)   │        │                                │        │                        │
└─────────────────────────┘        └──────────────────────────────┘        └───────────────────────┘

vision.ts follows the identical path for its two single-shot calls
(extractProductsFromImage, extractProductsFromText) — no tool loop,
one request/response round trip each.


SEC-02: receipt_settings read/write path (after)
─────────────────────────────────────────────────

┌─────────────────────────┐                              ┌───────────────────────────┐
│ HardwareSettingsTab.tsx  │                              │ Postgres: receipt_settings │
│ LogoUploader.tsx         │──PostgREST (supabase-js)────▶│ (new table, RLS enforced)  │
│  via queries.ts:         │  SELECT: any authenticated   │                            │
│  useReceiptSettings()    │  INSERT/UPDATE/DELETE:       │  single row (D-04          │
│  useMutationUpdate       │  manager/admin only           │  singleton, no terminal_id)│
│  ReceiptSettings()        │  (RLS policy, DB-enforced,   │                            │
│                          │   not just RBAC UI-gate)      │                            │
└─────────────────────────┘                              └───────────────────────────┘
```

### Recommended Project Structure

```
supabase/functions/
├── agent-proxy/               # NEW — name is planner's discretion; suggested
│   └── index.ts                #   to follow kebab-case verb-first convention
│                                #   already used (process-payment, receive-shipment)
supabase/migrations/
├── <timestamp>_receipt_settings.sql   # NEW — CREATE TABLE + RLS, timestamp > 20260818000006
src/entities/settings/model/
├── queries.ts                  # MODIFIED — add receipt_settings query/mutation pair
src/shared/lib/agent/
├── brain.ts                    # MODIFIED — swap 2x client.messages.create() for fetch()
├── vision.ts                   # MODIFIED — swap 2x client.messages.create() for fetch()
├── brain.test.ts               # MODIFIED — swap vi.mock('@anthropic-ai/sdk') for fetch mock
├── vision.test.ts              # NEW — no test file exists today; SC2 requires edge-boundary mock coverage for vision.ts too
```

### Pattern 1: Bearer-auth edge function (copy from `process-payment`)

**What:** Manual JWT verification via a direct `fetch()` to `/auth/v1/user`, not `admin.auth.getUser()`.
**When to use:** Every new edge function that must authenticate the calling staff member's session.
**Why not `admin.auth.getUser()`:** documented inline in the source — ES256-signed tokens break the bundled JWT library in `supabase-js@2.49.1`.

```typescript
// Source: supabase/functions/process-payment/index.ts:92-121 (verbatim, this session)
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
// ("Unsupported JWT algorithm ES256") because the bundled JWT library predates
// Supabase's switch from RS256 → ES256. The Auth REST API handles ES256 correctly.
const token = authHeader.slice(7); // strip "Bearer "
const authVerifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'apikey': supabaseAnonKey,
  },
});

if (!authVerifyResp.ok) {
  return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
}

const authUser = await authVerifyResp.json() as { id: string };
```

**For the new Anthropic proxy:** no `manager`/`admin` role check is needed after this block — D-03 says any authenticated staff (cashier+) may call it, matching today's behavior where any logged-in user can already trigger `runAgent`/`extractProductsFromImage`. `authUser.id` is not otherwise used by the proxy (no DB write, no audit row) — it only needs to exist to prove a valid session.

### Pattern 2: Client-side authenticated `fetch()` to an edge function (copy from `callProcessPayment`)

**What:** Because `supabase.functions.invoke()` creates a `FunctionsClient` with static anon-key headers and never injects the current user's JWT, this codebase's convention for edge functions that need the caller's identity is a raw `fetch()` with `getCachedAccessToken()`.

```typescript
// Source: src/shared/lib/edge-function-contracts.ts:204-224 (verbatim, this session)
// supabase.functions getter creates a new FunctionsClient with static anon-key headers on
// every access — the user JWT is never injected. Use fetch() directly with the cached token.
// getCachedAccessToken() is populated by onAuthStateChange (set at signIn, cleared at signOut)
// and is reliable in all environments including Playwright where getSession() can return null.
const accessToken = getCachedAccessToken();
if (!accessToken) {
  return err({ code: 'AUTH_REQUIRED', message: 'Not authenticated' });
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const response = await fetch(`${supabaseUrl}/functions/v1/process-payment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: supabaseAnonKey,
  },
  body: JSON.stringify(validatedRequest),
});
```

**Gotcha for `brain.ts`/`vision.ts` specifically:** these two files are NOT in `edge-function-contracts.ts` today — they live in `src/shared/lib/agent/`. The planner must decide whether to (a) add the new proxy call to `edge-function-contracts.ts` alongside the other edge functions (consistent with the existing single-source-of-truth pattern for edge contracts) and have `brain.ts`/`vision.ts` import from there, or (b) inline the `fetch()` call directly in `brain.ts`/`vision.ts`. Given `edge-function-contracts.ts` is explicitly the place "Edge function contracts are defined" per CLAUDE.md, option (a) is the pattern-consistent choice.

### Pattern 3: `Anthropic.Message` response shape that callers already parse — must be preserved exactly

**What goes wrong if not preserved:** `brain.ts` and `vision.ts` do NOT just read `.text` off the response — they inspect `response.stop_reason` and filter `response.content` by block `.type`. If the edge function reshapes the Anthropic response (e.g. unwraps it, renames fields, or returns only the text), both files' existing parsing logic breaks silently or throws.

```typescript
// Source: src/shared/lib/agent/brain.ts:149-168 (verbatim, this session) — exact shape brain.ts depends on
let response = await client.messages.create({ model: getModel(), max_tokens: 1024, system: systemPrompt, tools: allToolDefinitions as unknown as Anthropic.Tool[], messages });

while (response.stop_reason === 'tool_use' && loopCount < MAX_TOOL_LOOPS) {
  const toolBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  );
  messages.push({ role: 'assistant', content: response.content });
  // ... tool execution ...
}

const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
```

```typescript
// Source: src/shared/lib/agent/vision.ts:77-81 (verbatim, this session) — exact shape vision.ts depends on
const textBlock = response.content.find(
  (b): b is Anthropic.TextBlock => b.type === 'text'
);
if (!textBlock) return [];
return parseProducts(textBlock.text);
```

**Because the Anthropic Messages REST API's raw JSON body already has this exact `{ id, type, role, content: [{type, text|...}], stop_reason, ... }` shape** `[CITED: platform.claude.com/docs/en/api/messages]`, the correct edge function design is: forward the request body through, return the Anthropic response body through **unchanged** (pass-through proxy, D-01's "return the raw response"). Do not wrap it in `{ success, data }` like `process-payment` does — that envelope pattern would break `response.stop_reason`/`response.content` access in both callers unless they're also rewritten to unwrap it. Recommendation: keep the proxy's success response as the bare Anthropic JSON body; use HTTP status codes + a distinct error-envelope shape only for the proxy's own failure modes (missing auth, Anthropic API error) so callers can still `if (!response.ok) { ...structured error... } else { const anthropicMessage = await response.json(); }`.

### Anti-Patterns to Avoid

- **Rebuilding the tool loop server-side:** D-01 explicitly forecloses this. The tool loop's `executeTool()` calls touch Zustand store state (`useAgentStore`) and depend on client-only context — moving it into Deno would require re-plumbing RAG and every tool function, a much larger and explicitly out-of-scope rewrite.
- **Wrapping the Anthropic response in a custom envelope:** breaks `response.stop_reason`/`response.content` parsing in both callers (see Pattern 3).
- **Adding a `manager`/`admin` role check to the new edge function:** D-03 says cashier+ (any authenticated staff) — matches current behavior exactly; do not silently tighten this without a discussed decision.
- **Testing SC4 (role-scoped RLS) via Playwright browser UI:** the Settings page is already RBAC-gated to `admin` at the route layer — a cashier session can never reach the UI to attempt a write, so a browser-driven Playwright test cannot exercise the RLS policy at all. See Validation Architecture below.
- **Backfilling `receipt_settings` from the old `settings` row:** explicitly out of scope per D-06 — the empty-table + `DEFAULT_RECEIPT` fallback is intentional.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|------|
| JWT verification in the edge function | A custom JWT decode/verify routine | The existing `fetch(supabaseUrl + '/auth/v1/user')` pattern from `process-payment` | Already solves the ES256 compatibility issue that a naive `admin.auth.getUser()` call would hit; documented inline, battle-tested in production. |
| RLS policy SQL for `receipt_settings` | New policy logic from scratch | The already-drafted SQL sitting inert inside the `DO $rs$ ... END $rs$` guard in `20260510000001_rls_rewrite_phase13.sql:978-987` | That block was written by a prior migration anticipating this exact table and role split (`get_user_role() IN ('manager','admin')` for write, `USING (true)` for select) — it has simply never executed because the table never existed. Reuse it verbatim rather than re-deriving the policy shape. |
| Request/response schema validation in the edge function | Hand-rolled `if` checks on `req.json()` fields | `zod` (`https://deno.land/x/zod@v3.23.8/mod.ts`), same as every other edge function in this repo | Consistency with `process-payment`'s `BodySchema.safeParse` pattern; free structured error messages via `.flatten().fieldErrors`. |

**Key insight:** Nearly everything this phase needs is already written somewhere in this repo — either as a live pattern to copy (`process-payment`'s auth block, `callProcessPayment`'s client-side fetch pattern) or as dead-but-correct code waiting to be activated (the `receipt_settings` RLS policy SQL). The main engineering task is *wiring*, not *design*.

## Common Pitfalls

### Pitfall 1: Testing RLS role-scoping through a route that's already RBAC-blocked

**What goes wrong:** A Playwright E2E test tries to log in as `cashier`, navigate to `/settings`, and attempt to save receipt settings to prove RLS blocks the write — but `/settings` requires the `manage_settings` RBAC action (admin-only, per CLAUDE.md's Routes table and `SettingsPage`'s existing route guard), so the cashier never reaches the form. The test either fails for the wrong reason (route redirect) or has to be written against a route the cashier can't visit, producing a false sense of coverage.
**Why it happens:** RBAC (UI/route layer) and RLS (DB layer) are two independent, overlapping defenses; a UI test can only exercise whichever layer the UI reaches first.
**How to avoid:** Write a Vitest **integration test** hitting Supabase directly (service-role client, seed temp `cashier` and `manager` auth users, `signInWithPassword`, then attempt writes as each role against `receipt_settings`), following the exact structure already used in `src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts` (`describe.skipIf(skip)`, `SUPABASE_SERVICE_ROLE_KEY` env guard, `db.auth.admin.createUser`, cleanup in `afterEach`/`afterAll`).
**Warning signs:** A plan that lists a `checkpoint:human-verify` or a Playwright spec as the sole verification for SC4 — this project's CLAUDE.md bans human verification outright, and Playwright-through-the-UI is structurally unable to reach this code path for the cashier role.

### Pitfall 2: Wrapping the Anthropic response and breaking `brain.ts`/`vision.ts` parsing

**What goes wrong:** The edge function returns `{ success: true, data: <anthropic response> }` (matching `process-payment`'s envelope convention) instead of the raw Anthropic JSON. `brain.ts`'s `response.stop_reason` and `response.content.filter(...)` calls now operate on `undefined`, causing either a silent empty response or a runtime `TypeError`.
**Why it happens:** Copying `process-payment`'s *response* shape along with its *auth* pattern, without checking that `process-payment`'s callers (`edge-function-contracts.ts`) already unwrap that specific envelope, while `brain.ts`/`vision.ts` do not and were never written to.
**How to avoid:** Keep the proxy's success-path response as the Anthropic API's own JSON body unchanged (see Pattern 3). Use a distinct, minimal error envelope only for the proxy's own failure cases (auth failure, Anthropic API error, validation error) — and have `brain.ts`/`vision.ts` check `response.ok` before trying to parse it as an `Anthropic.Message`.

### Pitfall 3: `receipt_settings` silently disappearing from settings-backup/restore

**What goes wrong:** `settings-backup`'s edge function (`supabase/functions/settings-backup/index.ts:70,90`) backs up the entire `settings` table wholesale (`serviceClient.from('settings').select('*')`) into a JSON snapshot; `settings-restore` (`supabase/functions/settings-restore/index.ts:140`) upserts that same table back. Once receipt settings move to a separate `receipt_settings` table, these two edge functions keep working (no crash) but silently stop capturing/restoring receipt configuration — a manager who restores a pre-Phase-6 backup will get their general/billing/payment-label settings back but not their receipt settings, with no error surfaced.
**Why it happens:** `settings-backup`/`settings-restore` were written when all settings lived in one generic table; SEC-02's literal scope ("move the client off the generic `settings` table for this data") doesn't mention these two edge functions, and they're not touched by any file CONTEXT.md names.
**How to avoid:** This is not resolved by CONTEXT.md — flagged as an Open Question below for the planner to decide explicitly (extend backup/restore now vs. defer to Phase 7, which already touches these same two functions for the unrelated `pool_tables` fix).
**Warning signs:** A plan that touches `queries.ts`/the new migration but never mentions `settings-backup`/`settings-restore` — that's fine only if the decision to defer was made consciously, not by omission.

### Pitfall 4: `getModel()`'s fallback model string is stale training-data knowledge, not something this phase should touch

**What goes wrong:** `brain.ts`/`vision.ts` both default to `'claude-sonnet-4-6'` when `VITE_AGENT_MODEL` is unset (`brain.ts:34`, `vision.ts:14`). This is pre-existing, working code, not part of SEC-01's scope — the edge function should forward whatever `model` string the client already sends, unmodified.
**Why it happens:** Reviewers reading `getModel()` for the first time may be tempted to "fix" or verify the model name during a security-focused edge-function pass.
**How to avoid:** Leave `getModel()`, `getOllamaUrl()`, and the Ollama fallback path entirely untouched (D-02). The proxy only needs to know how to forward `model`/`max_tokens`/`system`/`tools`/`messages` as opaque fields — it does not need to validate the model string against a known-good list.

## Code Examples

### Anthropic Messages REST API request shape (what the edge function forwards)

```bash
# Source: platform.claude.com/docs/en/api/messages (fetched this session)
curl https://api.anthropic.com/v1/messages \
    -H 'Content-Type: application/json' \
    -H 'anthropic-version: 2023-06-01' \
    -H "X-Api-Key: $ANTHROPIC_API_KEY" \
    -d '{
          "max_tokens": 1024,
          "messages": [{ "content": "Hello, world", "role": "user" }],
          "model": "claude-opus-4-6"
        }'
```

### Existing sensitive-mutation edge function audit-coverage guard (context, not required for this phase)

```typescript
// Source: src/shared/lib/__tests__/audit-edge-coverage.test.ts:22 (verbatim, this session)
const SENSITIVE_EDGE_FUNCTIONS = ['create-staff', 'settings-restore'];
```
The new Anthropic proxy is a **read/forward-only** function — it never writes to the database (no `recordAudit` call needed, no `admin.from(...).insert(...)`), so it should NOT be added to this allowlist. `receipt_settings` writes go through PostgREST directly from the client (RLS-enforced), not through an edge function, so this allowlist doesn't apply to SEC-02 either.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` client-side | Server-side edge function proxy, client calls `fetch()` with a Bearer JWT | This phase (Phase 6) | Removes the client-exposed API key from the shipped Tauri bundle; `@anthropic-ai/sdk` dependency and its `dangerouslyAllowBrowser` escape hatch are deleted entirely. |
| `receipt_settings` referenced only in defensive `IF EXISTS`/`DROP POLICY IF EXISTS` guards, never actually created | Real migration-tracked `CREATE TABLE receipt_settings` + `ENABLE ROW LEVEL SECURITY` | This phase (Phase 6) | Makes the table's security posture auditable from migration history instead of silently absent; activates RLS policy SQL that has sat unexecuted since `20260510000001_rls_rewrite_phase13.sql`. |

**Deprecated/outdated:**
- `VITE_ANTHROPIC_API_KEY` env var: removed entirely once SEC-01 lands — replace with a server-only `ANTHROPIC_API_KEY` set via Supabase Edge Function secrets (`supabase secrets set`), never a `VITE_`-prefixed (client-bundled) variable.
- The generic `settings` table's `key = 'receipt'` row: superseded by `receipt_settings`; Claude's Discretion (D-06) on whether to delete or leave it orphaned.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|----------|-----------------|
| A1 | Suggested edge function name `agent-proxy` (or similar) — no name is mandated by CONTEXT.md, only "planner's discretion, consistent with existing naming." | Recommended Project Structure | Low — purely cosmetic, easy to rename before deploy. |
| A2 | The Anthropic proxy's success response should be the bare, unwrapped Anthropic JSON body (not a `{success, data}` envelope) to preserve `brain.ts`/`vision.ts` parsing without rewriting their response-handling logic. | Pattern 3, Pitfall 2 | Medium — if the planner instead chooses to unwrap on the client side (rewriting `brain.ts`/`vision.ts` to expect an envelope and unwrap it there), that's also valid; either approach works as long as the two are consistent. Flagging as assumed because CONTEXT.md doesn't dictate which side does the unwrapping. |
| A3 | `edge-function-contracts.ts` is the correct home for the new proxy's client-side caller function, rather than inlining `fetch()` directly in `brain.ts`/`vision.ts`. | Pattern 2 | Low — either location works functionally; `edge-function-contracts.ts` is recommended for consistency with CLAUDE.md's stated convention ("Edge function contracts are defined in `src/shared/lib/edge-function-contracts.ts`"), but CONTEXT.md doesn't explicitly require it. |

**If this table is empty:** N/A — see entries above. All three assumptions are low/medium-risk implementation-detail choices, not compliance or security-posture claims; none require user confirmation before planning proceeds, but the planner should state its choice explicitly in PLAN.md.

## Open Questions

1. **Should `settings-backup`/`settings-restore` be extended to include `receipt_settings` in this phase, or deferred?**
   - What we know: these two edge functions currently back up/restore the generic `settings` table wholesale (which happens to include `key='receipt'` today); after this phase, that snapshot will silently stop reflecting receipt configuration. Phase 7 (DATA-02) already touches both functions for an unrelated `pool_tables` cleanup.
   - What's unclear: CONTEXT.md is silent on this — it's not named in SEC-02's literal wording or in the canonical references.
   - Recommendation: the planner should make an explicit call (extend now / defer to Phase 7 / accept as a documented gap) rather than let it fall through silently. Given Phase 7 already opens both files for `pool_tables`, bundling a `receipt_settings` addition there is the lowest-diff option — but that decision belongs to Phase 6 or 7 planning, not to research.

2. **Does the new edge function need a `[functions.<name>]` entry in `supabase/config.toml`?**
   - What we know: only `process-payment` and `send-receipt-email` have explicit `verify_jwt = true` entries in `config.toml:372-376`; the other 10 edge functions (including `create-staff`, `receive-shipment`) have no entry and rely on the Supabase CLI's default (`verify_jwt = true`).
   - What's unclear: whether the two existing entries exist for a specific historical reason (e.g. local-dev testing without a JWT) or are simply inconsistently applied.
   - Recommendation: omit an explicit entry (matching the majority of existing functions) unless the planner finds a specific reason `process-payment`/`send-receipt-email` needed one — default behavior already requires a valid JWT, which the function's own Bearer-auth check also enforces at the application layer.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|----------|-----------|
| Supabase CLI (`supabase functions deploy`) | Deploying the new edge function | Not verified this session (no deploy script found in `scripts/` or `package.json`) | — | Manual `supabase functions deploy <name>` against the self-hosted stack, same undocumented-but-established process already used for the other 12 edge functions. |
| `ANTHROPIC_API_KEY` server-side secret | New edge function's Anthropic call | Not applicable pre-deploy — must be set via `supabase secrets set ANTHROPIC_API_KEY=...` on the self-hosted stack before the function can succeed | — | None — this is a hard requirement; the function will 500 on every call until set. Document in the plan as a `checkpoint:human-action` (setting a real API key is a credential step, not a verification step — CLAUDE.md's "no manual verification" ban does not cover this category, see role note in CLAUDE.md's Testing Policy). |
| `npm view @anthropic-ai/sdk` (registry check) | Confirming current published version before removal | ✓ | `0.117.1` (registry latest; irrelevant to removal, confirmed only to verify the package is legitimate/still maintained, not stale-abandoned) | — |

**Missing dependencies with no fallback:**
- `ANTHROPIC_API_KEY` must be set as a Supabase Edge Function secret before the new proxy works in any environment (local self-hosted stack or otherwise) — this is a `checkpoint:human-action`, not a code task.

**Missing dependencies with fallback:**
- Edge function deployment tooling — falls back to the same manual CLI invocation already used for all 12 existing edge functions; no automation exists for any of them, so this phase doesn't need to newly solve deployment automation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|--------------------|
| V2 Authentication | yes | Bearer JWT verification via `fetch(SUPABASE_URL + '/auth/v1/user')`, matching `process-payment`'s existing pattern — required for the new Anthropic proxy edge function. |
| V3 Session Management | no | No new session state introduced; reuses the existing Supabase Auth session/JWT lifecycle already in place app-wide. |
| V4 Access Control | yes | RLS policies on `receipt_settings` (`get_user_role() IN ('manager','admin')` for write, `USING (true)` for select) — DB-enforced, not just UI-gated. The Anthropic proxy intentionally has NO role check beyond "authenticated" per D-03. |
| V5 Input Validation | yes | `zod` schema validation on the edge function's request body (mirrors `BodySchema.safeParse` in `process-payment`), and `ReceiptSettingsSchema` (Zod, already defined in `src/shared/lib/domain.ts:808-822`) validates `receipt_settings` values client-side before write. |
| V6 Cryptography | no | No new crypto — reuses Supabase's existing JWT signing (ES256) and TLS to Anthropic's API; never hand-roll signing/verification. |
| V8 Data Protection | yes | The core purpose of SEC-01: `ANTHROPIC_API_KEY` moves from client-bundled (`VITE_`-prefixed, shipped in the Tauri binary) to server-only (`Deno.env.get()`, never serialized to any client-reachable artifact). Build-output grep (Success Criterion #1) is the verification control for this. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Client-bundled third-party API key (current state, pre-Phase-6) | Information Disclosure | Move the secret server-side behind an authenticated proxy (this phase's core fix); never ship a paid third-party API key in a distributable desktop binary. |
| Missing RLS on a sensitive settings table (current state, pre-Phase-6 — `receipt_settings` doesn't even exist, so it has zero access control, not just weak access control) | Elevation of Privilege | `CREATE TABLE ... ENABLE ROW LEVEL SECURITY` + explicit role-scoped policies, verified via an integration test that actually attempts a cross-role write (Pitfall 1) rather than trusting UI-layer RBAC alone. |
| RBAC-only access control with no matching RLS (defense-in-depth gap) | Elevation of Privilege | Every table holding config/business data should have RLS matching (or exceeding) its route-layer RBAC gate — this phase closes exactly this gap for `receipt_settings`, which today has RBAC (admin-only route) but zero RLS (table doesn't exist). |

## Sources

### Primary (HIGH confidence)

- `supabase/functions/process-payment/index.ts` (read in full this session) — Bearer-auth pattern, error envelope shape
- `supabase/functions/_shared/audit.ts` (read in full this session) — audit helper, not needed by this phase's new function (no DB write)
- `src/shared/lib/agent/brain.ts` (read in full this session) — exact call sites, tool loop, response parsing
- `src/shared/lib/agent/vision.ts` (read in full this session) — exact call sites, response parsing
- `src/shared/lib/agent/brain.test.ts` (read in full this session) — existing `vi.mock('@anthropic-ai/sdk')` pattern that SC2 requires restructuring
- `src/features/agent-chat/model/useAgent.ts` (read in full this session) — confirms `runAgent`/`extractProductsFromImage`/`extractProductsFromText` call sites, no RBAC gate on agent-chat feature (matches D-03)
- `src/shared/lib/edge-function-contracts.ts` (read relevant sections this session) — `callProcessPayment`'s client-side fetch pattern, `getCachedAccessToken()` usage, `EDGE_FUNCTIONS` registry
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (read relevant sections this session) — confirms `receipt_settings` was never created; the drafted-but-inert RLS policy SQL
- `supabase/migrations/20260419000001_settings_and_backups.sql` (read in full this session) — `settings` table shape/RLS pattern to mirror
- `src/entities/settings/model/queries.ts` (read in full this session) — `ReceiptSettingsSchema`/`DEFAULT_RECEIPT` usage, both consumers confirmed
- `src/shared/lib/domain.ts` (read relevant sections this session) — `ReceiptSettingsSchema` exact field list, `SettingsKeySchema` exact enum
- `src/shared/lib/result.ts` (read relevant sections this session) — `AppErrorCode` full union, confirms `AGENT_ERROR`/`TOOL_EXECUTION_ERROR` already exist for edge-function-failure mapping
- `src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts` (read relevant sections this session) — the RLS/role-scoped integration test pattern to copy for SC4
- `e2e/08-settings-receipt.spec.ts` (read in full this session) — existing admin-only receipt-settings E2E coverage, confirms no cashier-path test exists today
- `supabase/functions/settings-backup/index.ts`, `supabase/functions/settings-restore/index.ts` (read relevant sections this session) — confirms the `settings`-table-wholesale backup gap (Pitfall 3)
- `supabase/config.toml` (read in full this session) — confirms only 2 of 12 functions have explicit `verify_jwt` entries; self-hosted stack (not linked Supabase Cloud)
- `src/vite-env.d.ts` (read in full this session) — confirms `VITE_ANTHROPIC_API_KEY` was never in the typed env interface
- `package.json` (grepped this session) — `@anthropic-ai/sdk: ^0.91.1` under `dependencies` (line 36)
- `platform.claude.com/docs/en/api/messages` (fetched this session) — Anthropic Messages API endpoint, method, headers `[CITED]`

### Secondary (MEDIUM confidence)

- `npm view @anthropic-ai/sdk version` (run this session) — confirms registry latest `0.117.1`, package still actively maintained/legitimate (relevant only to confirming the removal target isn't itself a red flag, not to any new install)

### Tertiary (LOW confidence)

- None used as authoritative — the one general WebSearch performed (Anthropic API header conventions) was superseded by a direct docs fetch and is not cited standalone.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; every version/pattern cited is a direct read of already-deployed, already-working code in this repo.
- Architecture: HIGH — both target patterns (Bearer-auth edge function, RLS-scoped settings table) already exist live in this codebase for other tables/functions; this phase replicates, not invents.
- Pitfalls: HIGH for Pitfalls 1, 2, 4 (each grounded in a specific file/line read this session); MEDIUM for Pitfall 3 (grounded in code read this session, but the *resolution* is an open planning decision, not a settled fact).

**Research date:** 2026-08-17
**Valid until:** 30 days (stable, no fast-moving external dependency other than the Anthropic API itself, which is unlikely to break a `/v1/messages` contract already in GA use elsewhere in this ecosystem)
