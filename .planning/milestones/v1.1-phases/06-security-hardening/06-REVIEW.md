---
phase: 06-security-hardening
reviewed: 2026-08-18T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - supabase/functions/agent-proxy/index.ts
  - src/shared/lib/agent/anthropic-types.ts
  - src/shared/lib/agent/vision.test.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/agent/vision.ts
  - src/shared/lib/agent/brain.ts
  - src/shared/lib/agent/brain.test.ts
  - src/shared/lib/edge-function-contracts.test.ts
  - package.json
  - package-lock.json
  - supabase/migrations/20260819000001_receipt_settings.sql
  - src/entities/settings/model/queries.ts
  - src/entities/settings/model/index.ts
  - src/entities/settings/index.ts
  - src/entities/settings/model/receipt-settings-rls.integration.test.ts
  - supabase/migrations/20260819000002_receipt_settings_delete_manager.sql
  - src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx
  - src/features/upload-logo/model/useUploadLogo.ts
  - src/widgets/LogoImage/index.tsx
  - src/widgets/CajaDashboard/CajaDashboard.tsx
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-08-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 6's two deliverables were reviewed: (1) `agent-proxy`, a Bearer-authenticated Deno edge function that moves the Anthropic API key server-side, with `brain.ts`/`vision.ts`/`edge-function-contracts.ts` migrated off `@anthropic-ai/sdk`; and (2) a new `receipt_settings` table + RLS policies replacing an unaudited row in the generic `settings` table.

The Anthropic-key migration itself is sound: `dangerouslyAllowBrowser: true` and the client-side API key are both gone, `@anthropic-ai/sdk` is fully removed from `package.json`/`package-lock.json`, and the edge function correctly verifies the caller's JWT via `/auth/v1/user` before forwarding to Anthropic. However the new endpoint accepts unbounded `max_tokens`/message/tool payloads from any authenticated staff member with no rate limiting, which converts "the client can't steal the key" into "any staff JWT can run up unlimited Anthropic billing" — a gap the phase's own stated goal (moving the key server-side to control exposure) should have closed.

The `receipt_settings` migration correctly activates role-scoped RLS (read: any authenticated; write: manager+admin), confirmed by a real integration test — but the table that's documented as a "true one-row singleton" has no database-level constraint enforcing that invariant, and the review found the project's own integration test proving a second/third row can be freely inserted by any manager, which would break the `.maybeSingle()` read path used by every screen in the app. There's also a real inconsistency between this new RLS grant (manager+admin can write) and the app's existing RBAC model, which gates the only UI entry point to this data behind an admin-only action.

## Critical Issues

### CR-01: `receipt_settings` singleton has no DB-level enforcement — any extra row breaks every read

**File:** `supabase/migrations/20260819000001_receipt_settings.sql:20-48`
**Issue:** `receipt_settings` is documented (queries.ts:105-109, migration comment lines 13-16) as a "true one-row singleton," enforced only by client-side convention: every write goes through `useMutationUpdateReceiptSettings` (`src/entities/settings/model/queries.ts:349-382`), which always `upsert`s onto a hardcoded constant id (`RECEIPT_SETTINGS_SINGLETON_ID`). Nothing in the schema stops a second row from being created — there is no `UNIQUE`/`CHECK` constraint on `id`, no partial unique index, and the INSERT policy (`receipt_settings_insert_admin`, line 46) has no `WITH CHECK (id = ...)` clause restricting it to the singleton id.

The project's own integration test proves this is exploitable, not theoretical: `src/entities/settings/model/receipt-settings-rls.integration.test.ts:181-190` has a manager successfully `insert({ paper_width_chars: 40 })` **without specifying `id`** (it relies on the column's `DEFAULT gen_random_uuid()`), and RLS accepts it.

Every read of receipt settings goes through `src/entities/settings/model/queries.ts:328`:
```ts
const { data, error } = await supabase.from('receipt_settings').select('*').maybeSingle();
```
`.maybeSingle()` errors (PGRST116) if more than one row is returned. As soon as any manager/admin (via a script, Supabase Studio, a future code path that calls `.insert()` instead of the app's `upsert(...,{onConflict:'id'})`, or simply retrying a failed write against a stale client) creates a second row, `useReceiptSettings()` starts failing for **every authenticated user** — receipt printing, the logo, and the Hardware Settings tab all read through this hook. This is app-wide breakage caused by a missing constraint the migration should have added.

**Fix:** Enforce the singleton at the DB layer, not just the client convention. Cheapest fix — tighten the INSERT policy to the known id and drop the `gen_random_uuid()` default:
```sql
ALTER TABLE receipt_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE receipt_settings ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000001';

DROP POLICY IF EXISTS "receipt_settings_insert_admin" ON receipt_settings;
CREATE POLICY "receipt_settings_insert_manager_admin" ON receipt_settings
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('manager', 'admin') AND id = '00000000-0000-0000-0000-000000000001');
```
(or add a `CHECK (id = '00000000-...')` constraint directly on the table). Either way, ship a migration that also collapses any rows that may already exist beyond the singleton id before adding the constraint.

## Warnings

### WR-01: `agent-proxy` has no cap on cost-driving request size — any staff JWT can run up unlimited Anthropic billing

**File:** `supabase/functions/agent-proxy/index.ts:27-33`, `src/shared/lib/edge-function-contracts.ts:396-402`
**Issue:** `BodySchema`/`AgentProxyRequestSchema` validate that `max_tokens` is a positive integer but set no upper bound, and `messages`/`tools` are `z.array(z.unknown())` with no length or payload-size limit. Per the file's own comment (agent-proxy/index.ts:9-10, D-03 locked), *any* authenticated staff member — cashier and up — can call this endpoint with no role check. Combined, a single leaked or misused cashier JWT can issue requests with an arbitrarily large `max_tokens` (e.g. `1_000_000`) and/or an oversized `messages` array, directly inflating the store's Anthropic bill with no server-side guardrail. The system prompt in `brain.ts:77` even tells the model "the system will block excess calls" for write tools, but no such throttling exists anywhere in the reviewed files for the proxy itself.

Moving the API key server-side removes the key-theft risk but, without a request cap, doesn't reduce the blast radius of a compromised/leaked staff session — it just changes who pays.

**Fix:** Add a hard `max_tokens` ceiling (e.g. `z.number().int().positive().max(4096)`) and a reasonable bound on `messages`/`tools` array length/serialized size in `BodySchema`, and consider per-user rate limiting (e.g. a `Deno.env`-configurable token-bucket keyed on the verified `authUser.id`, or delegate to Supabase's built-in per-user function rate limits if available).

### WR-02: `receipt_settings` write RLS (manager+admin) is broader than the app's own RBAC gate (admin-only) for the same data

**File:** `supabase/migrations/20260819000001_receipt_settings.sql:46-48`, `src/shared/lib/rbac.ts:24,61`, `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:78-82`
**Issue:** The RLS policies grant INSERT/UPDATE to `get_user_role() IN ('manager', 'admin')`. But the only UI path to write receipt settings, `HardwareSettingsTab`, is gated by `<ProtectedAction action="manage_settings" ...>`, and `manage_settings` is defined in `rbac.ts` as part of `ADMIN_EXTRA` — i.e. admin-only, matching CLAUDE.md's "Settings page requires `manage_settings` (admin only)". There is no RBAC action anywhere in `rbac.ts` that represents "manager can write receipt settings."

In practice this means a `manager`-role account — which the app UI never lets touch this screen — can still write to `receipt_settings` directly via the Supabase client (the anon key and the manager's own valid session JWT are both already in their hands; no exploit needed beyond opening devtools or a script), bypassing the app's own admin-only intent for this data. The migration's comment attributes this to a locked decision (D-04), but it's inconsistent with the app's existing single source of truth for authorization (`rbac.ts`) and isn't reflected there, so it's effectively an undocumented escalation path from the app's perspective.

**Fix:** Either (a) add a `manage_receipt_settings`-style RBAC action to `rbac.ts` granted to manager+admin so the UI/DB grants agree and the exception is documented in one place, or (b) if admin-only was actually intended, tighten the RLS policies back to `admin` only to match `manage_settings`.

### WR-03: `logo_data_url` has no DB-side size limit — client's 200KB cap is trivially bypassable

**File:** `supabase/migrations/20260819000001_receipt_settings.sql:32`, `src/features/upload-logo/model/useUploadLogo.ts:4-5,60-70`
**Issue:** `logo_data_url TEXT` has no length constraint. The only size enforcement is client-side, in `encodeLogoDataUrl()` (`LOGO_MAX_BYTES = 200 * 1024`), which any caller can bypass by writing directly to `receipt_settings` via the Supabase client with a manager/admin JWT (same access path as WR-02) instead of going through `LogoUploader`. Since `receipt_settings_select_authenticated` grants unrestricted `SELECT` to every authenticated role (`USING (true)`), a multi-megabyte (or larger) data URL written this way is fetched on every `useReceiptSettings()` call by every logged-in user, on every device, indefinitely.

**Fix:** Add a `CHECK (logo_data_url IS NULL OR length(logo_data_url) <= 300000)` (or similar) constraint on the column to enforce the size limit server-side as well.

## Info

### IN-01: `receipt_settings_insert_admin` policy name doesn't match what it grants

**File:** `supabase/migrations/20260819000001_receipt_settings.sql:46`
**Issue:** The policy is named `receipt_settings_insert_admin` but its condition is `get_user_role() IN ('manager', 'admin')` — it grants manager too, not admin-only. The name will mislead anyone auditing policies by name alone (e.g. a future migration author skimming `pg_policies` and assuming admin-only). `receipt_settings_delete_admin` had exactly this admin-vs-manager+admin mismatch and needed a follow-up migration (`20260819000002`) to fix the *behavior*; this INSERT policy has the same kind of naming drift, just cosmetic this time since the WITH CHECK is already correct.
**Fix:** Rename to `receipt_settings_insert_manager_admin` (matching the naming convention used for the DELETE fix in `20260819000002_receipt_settings_delete_manager.sql:14`) in a follow-up migration for consistency.

### IN-02: `vision.ts`'s `findTextBlock` type guard doesn't verify the `text` field actually exists

**File:** `src/shared/lib/agent/vision.ts:44-46,79-81`
**Issue:** `findTextBlock` narrows on `b.type === 'text'` only:
```ts
function findTextBlock(content: { type: string }[]): { type: 'text'; text: string } | undefined {
  return content.find((b): b is { type: 'text'; text: string } => b.type === 'text');
}
```
It asserts the shape `{ type: 'text'; text: string }` via a type predicate but never checks that a `text: string` property is actually present. The client-side validator that produces this data (`AnthropicMessageResponseSchema` in `edge-function-contracts.ts:419-424`) is deliberately loose (`z.object({ type: z.string() }).loose()`) and does not guarantee a `text` field exists on `type: 'text'` blocks. If Anthropic (or a compromised/misbehaving proxy) ever returns a `text`-typed block without a `text` string, `textBlock.text` would be `undefined` at runtime despite the type saying `string`, and gets passed into `parseProducts(responseText: string)`, where `responseText.match(...)` would throw — currently swallowed only because that call happens to sit inside `parseProducts`'s own `try/catch`. It's not exploitable today, but it's fragile: any refactor that moves the `.match()` call outside that try block would turn a malformed response into an unhandled TypeError.
**Fix:** Either check `typeof block.text === 'string'` in the type guard, or accept `unknown` and validate before calling `.match()`.

### IN-03: `brain.ts`'s system prompt and tool framing still describe the old bar-pos product, not supermarket-pos

**File:** `src/shared/lib/agent/brain.ts:63,68-77,93`
**Issue:** Pre-existing (not touched beyond the Anthropic-SDK-to-proxy migration in this phase — confirmed via `git log`/`git show 52282fa`), but present in the reviewed file: the system prompt still says `'You are the AI assistant for Bola 8 POS, a bar and restaurant point-of-sale system.'` and references `close_tab`, `deactivate_product`, `bulk_import_products`, and "the menu" — all bar-pos/pool-parlour-era concepts CLAUDE.md says were stripped end-to-end in Phase 1. This is out of Phase 6's scope to fix, but flagging it since it was in the file set under review: an AI assistant confidently telling supermarket staff it's "Bola 8 POS, a bar and restaurant" system, or offering to `deactivate_product`/`close_tab` tools that may no longer map to anything real in this codebase, is a product-quality/trust issue worth a follow-up ticket.
**Fix:** Update the system prompt copy and confirm `allToolDefinitions`/`executeTool` (`./tools/index`, not in this review's scope) still expose tools that are meaningful for the supermarket domain.

---

_Reviewed: 2026-08-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
