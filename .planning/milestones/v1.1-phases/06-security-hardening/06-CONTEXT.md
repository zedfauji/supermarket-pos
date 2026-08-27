# Phase 6: Security hardening - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent hardening fixes, bundled because both are auth/access-control gaps:

1. **SEC-01:** The Anthropic API call currently happens client-side in `src/shared/lib/agent/brain.ts` (agent chat, multi-turn tool loop) and `src/shared/lib/agent/vision.ts` (single-shot image/invoice extraction) using `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` with a `VITE_ANTHROPIC_API_KEY` baked into the shipped bundle. Move every Anthropic API call server-side into one shared, Bearer-authenticated Supabase Edge Function; remove the client-side key and `@anthropic-ai/sdk` dependency entirely.
2. **SEC-02:** `receipt_settings` is referenced in CLAUDE.md's table doc and in a defensive `IF EXISTS` guard in `20260510000001_rls_rewrite_phase13.sql`, but was **never actually created** by any migration on this DB. Receipt settings currently live as a single row (`key = 'receipt'`) in the generic `settings` table. Give `receipt_settings` a real, migration-tracked `CREATE TABLE` + RLS policies, and move the client off the generic `settings` table for this data.

</domain>

<decisions>
## Implementation Decisions

### Anthropic edge function architecture
- **D-01:** The edge function is a **thin per-call proxy**, not a server-side agent loop. It does: Bearer-auth check (same pattern as `process-payment`) → forward the Anthropic request (messages/tools/config) → call Anthropic server-side with the env-stored key → return the raw response. — **Reversibility:** costly — **rationale:** `brain.ts`'s existing multi-turn tool loop (2 calls to `client.messages.create` per turn, tool execution via `executeTool`, RAG context via `retrieveContext`) and `vision.ts`'s single-shot image call both keep their current client-side orchestration logic; only the `new Anthropic(...).messages.create(...)` call is swapped for a `fetch()` to the edge function. Moving the full loop server-side later would require re-plumbing tool execution and RAG (both depend on client-side Zustand/query-cache state) into a Deno function — a much bigger rewrite than reversing this decision. Matches SEC-01's literal wording ("one shared Bearer-authenticated Supabase Edge Function for every Anthropic request") and success criterion #2 ("a Vitest test mocking the edge-function boundary").
- **D-02:** The client-side local-Ollama fallback path in `brain.ts` (llama3.2, `stream: false`, hits `http://localhost:11434` directly) is **out of scope** — it's a local dev-only fallback, not a client-exposed third-party secret, so SEC-01 doesn't touch it.

### Abuse / cost controls
- **D-03:** No rate limiting or per-user daily cap. Auth-gating (any authenticated staff member, cashier+) is sufficient — matches today's behavior (any logged-in user can already trigger these calls) and stays within SEC-01's literal scope. — **Reversibility:** reversible — a rate limiter can be added to the same edge function later without touching callers.

### receipt_settings scope
- **D-04:** `receipt_settings` is a **store-wide singleton**, not per-terminal. One row for the whole store (mirroring today's actual single `settings` row behavior), migration-tracked `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY`. RLS: any authenticated staff can `SELECT`; only `manager`/`admin` can `INSERT`/`UPDATE`/`DELETE` (mirrors the existing `settings_select_manager_admin`/admin-write pattern in `20260419000001_settings_and_backups.sql`, but read access is broadened to all authenticated roles since every checkout needs receipt config, not just managers). — **Reversibility:** costly — **rationale:** the app has no terminal/device-identity concept anywhere in its schema (no login-to-terminal binding); inventing one now would be new capability, not a security fix, and would need its own phase if ever wanted.
- **D-05 (planner/researcher note — roadmap reinterpretation):** ROADMAP.md's Success Criterion #4 says "a cashier-role session cannot read/write another terminal's `receipt_settings` row while manager/admin can." Per D-04 there is only ever one row (no terminals), so this criterion should be read/implemented as: **a cashier-role session can `SELECT` but not `INSERT`/`UPDATE`/`DELETE` the single `receipt_settings` row; manager/admin can do all four.** The Playwright/integration test should assert role-scoped write isolation, not multi-terminal isolation.

### Migration of existing data
- **D-06:** The new `receipt_settings` table starts **empty** — no backfill from the existing `settings` row (`key = 'receipt'`). The app's existing `DEFAULT_RECEIPT` constant in `src/entities/settings/model/queries.ts` covers the empty-table case until a manager/admin saves settings once. — **Reversibility:** reversible — **rationale:** this is pre-production/dev data with no real customized receipt settings at risk; a manual backfill migration can still be written later if a real deployment needs it. Planner should still decide (and document) whether the old `settings` row for `key = 'receipt'` is deleted or just left unused/orphaned — user did not specify either way.

### Claude's Discretion
- Whether the old `settings` table's `key = 'receipt'` row is deleted or left orphaned once the client moves to the new `receipt_settings` table (D-06).
- Exact edge function name/route (follow existing naming convention, e.g. `supabase/functions/agent-chat/` or `anthropic-proxy/` — planner's call, consistent with `process-payment`/`process-direct-sale` naming).
- Whether `vision.ts` and `brain.ts` share one edge function or each gets its own — SEC-01 says "one shared" function, so default to one, but the planner should confirm both call shapes (chat messages+tools vs. single image message) fit cleanly into one endpoint before committing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` (SEC-01, SEC-02 definitions, lines ~12-13)
- `.planning/ROADMAP.md` §"Phase 6: Security hardening" (lines 115-127) — success criteria; note D-05's reinterpretation of criterion #4

### Existing Bearer-auth edge function pattern to follow
- `supabase/functions/process-payment/index.ts` — Bearer-auth check (lines ~92-112: `Authorization` header parse, `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` env vars, manual token-based user lookup instead of `admin.auth.getUser()` due to an ES256-token compatibility issue noted inline)
- `supabase/functions/_shared/audit.ts` — existing shared edge-function helper, check for reuse

### Client-side Anthropic call sites to replace
- `src/shared/lib/agent/brain.ts` — agent chat, multi-turn tool loop (`client.messages.create` at lines ~149 and ~202), local Ollama fallback (line ~106, out of scope per D-02)
- `src/shared/lib/agent/vision.ts` — single-shot image/invoice extraction (`client.messages.create` at lines ~54 and ~91)
- `src/features/agent-chat/model/useAgent.ts` — caller of `extractProductsFromImage`/`extractProductsFromText` and `runAgent`
- `src/shared/lib/agent/tools/index.ts`, `src/shared/lib/agent/rag.ts` — tool execution and RAG context, stay client-side per D-01

### receipt_settings existing (mis)state
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (lines ~28, ~46, ~248-253, ~975-984) — defensive `IF EXISTS` guards and dropped policies referencing a `receipt_settings` table that was never created; new migration must actually `CREATE TABLE`
- `supabase/migrations/20260419000001_settings_and_backups.sql` (lines ~5-14) — the generic `settings` table pattern (RLS: manager/admin write) to mirror for `receipt_settings`
- `src/entities/settings/model/queries.ts` (lines ~40-46, ~94, ~111, ~114, ~176-178) — `ReceiptSettingsSchema`, `DEFAULT_RECEIPT`, current `settings` table read/write for `key='receipt'` — must be repointed to the new table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `process-payment`'s Bearer-auth block is the exact pattern to copy for the new Anthropic edge function (auth header check, manual JWT-based user lookup, env var reads).
- `src/entities/settings/model/queries.ts` already has `ReceiptSettingsSchema` and `DEFAULT_RECEIPT` — reuse both; only the table name and RLS-driven access change.

### Established Patterns
- Edge functions in this repo use Zod (`https://deno.land/x/zod@v3.23.8/mod.ts`) for request body validation and a shared `corsHeaders`/`jsonResponse` helper pattern (see `process-payment/index.ts` lines ~1-59) — follow this for the new Anthropic proxy function.
- RLS policies for role-scoped tables use `get_user_role() IN ('manager', 'admin')` — reuse directly for `receipt_settings` write policies.

### Integration Points
- `brain.ts`/`vision.ts` swap `new Anthropic(...).messages.create(...)` for an authenticated `fetch()` to the new edge function — signature/return shape should stay close to the Anthropic SDK's response so downstream parsing logic (`parseProducts`, tool-call parsing in `brain.ts`) doesn't need rewriting.
- `src/entities/settings/model/queries.ts` gets a new query/mutation pair for `receipt_settings` (separate from the generic `settings` key/value queries), following the existing `supabaseQuery`/`supabaseMutation` `Result<T>` pattern used elsewhere in that file.

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX requirements — this phase is backend/security plumbing with no user-facing behavior change (same receipt-settings UI, same agent-chat UI; only the transport and schema underneath change).

</specifics>

<deferred>
## Deferred Ideas

- **Real per-terminal `receipt_settings` isolation** — would require inventing a terminal/device-identity concept from scratch (no login-to-terminal binding exists anywhere today). Explicitly deferred per D-04; note for a future phase if multi-terminal ever becomes a real requirement.
- **Rate limiting / per-user cost caps on the Anthropic edge function** — deferred per D-03; noted in REQUIREMENTS.md's v1.2 backlog ("Full client-side-secret-leak sweep beyond the Anthropic key") as a related follow-up area.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 06-security-hardening*
*Context gathered: 2026-08-17*
