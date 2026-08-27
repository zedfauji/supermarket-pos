# Phase 8: Sale/payment workflow wiring + cleanup - Research

**Researched:** 2026-08-17
**Domain:** Backend wiring/cleanup — Supabase Edge Function auth, TanStack mutation-hook error contracts, offline-guard UX, Zod payload validation, Tauri config. No new technology introduced.
**Confidence:** HIGH — every claim below was verified by reading the actual source file this session (not grepped-and-assumed); the only `[ASSUMED]` items are copy/UX judgment calls explicitly left to the planner by CONTEXT.md and UI-SPEC.md.

## Summary

This phase is five independent wiring/cleanup fixes on an already-built codebase — there is no new library, framework, or architecture to research. CONTEXT.md (produced by a very thorough discuss-phase session) already nails every file, line number, and pattern decision. This document's job is narrower and different from a normal RESEARCH.md: (1) map each of the 5 ROADMAP success criteria to a concrete, already-runnable-pattern Playwright/Vitest verification method, and (2) surface risks CONTEXT.md's decisions don't yet cover, found by reading the actual call sites this session rather than trusting the discuss-phase's citations at face value.

Three risks surfaced that CONTEXT.md does not address and the planner needs a stance on before writing tasks:

1. **SALE-04's blocking dialog cannot be wired from `PaymentForm.tsx` without widening an error-shape narrowing that currently strips `AppError.code`.** `PaymentForm.tsx`'s `runPayment()` returns `Result<{ receiptData }, { message: string }>` — it discards `result.error.code` when unwrapping `processors.processCashPayment()`'s result (`PaymentForm.tsx:381`). `handlePrimary()` (`PaymentForm.tsx:391-394`) only ever sees `result.error.message`, never the code, and renders it as **inline `errorMessage` state** (not a toast — confirmed by reading the component, contradicting an assumption a planner might make from CONTEXT.md's "not the generic toast-error path" framing in D-08). To show a distinct blocking dialog only for `NETWORK_OFFLINE`, the code must survive from `submit()` through both processor wrapper functions and `runPayment()`'s return type into `handlePrimary()`.
2. **An E2E test for SALE-02 already exists and self-skips today** (`e2e/22-staff-management.spec.ts` `SM2`, `test.skip(true, 'UI not implemented — EXPECTED FAIL: add staff button not found on /staff')`). Building the dialog does not automatically make it pass: `SM2` uses `roleSelect.selectOption('cashier')` and `dialog.getByLabel(/pin/i)` — both break against the UI-SPEC's actual design (shadcn `Select` is a Radix combobox, not a native `<select>`, so `selectOption()` won't find it; two fields will match `/pin/i` once "PIN" and "Confirm PIN" both exist, an ambiguous-locator failure in Playwright strict mode). The planner must schedule an SM2 rewrite as an in-scope task, not assume the existing spec "just passes."
3. **D-10's grep sweep scope ("`featOrders`/`wPanels`") is narrower than the actual raw-`error.message` leak surface.** A project-wide grep this session found the same `toast.error(result.error.message)` / `toast.error(x, { description: result.error.message })` pattern in at least 12 files spanning `featMgmt` (`manage-categories`, `manage-products`, `edit-staff-role`), `wAdmin` (`RBACDashboard/PermissionMatrix.tsx`, `SettingsTabsPanel/EmailReceiptsSettingsTab.tsx`), and other `featOrders` sites CONTEXT.md didn't name (`remove-tab-item`, `reopen-tab`, `edit-paid-tab`, `register-caja-entry`, `clock-out-staff`, `physical-count`). SALE-05's requirement text ("refund and any remaining error paths") is genuinely ambiguous about whether this phase covers the full list or only the `featOrders`/`wPanels` slice CONTEXT.md scoped. See Open Questions.

**Primary recommendation:** Follow CONTEXT.md's decisions verbatim (they are all confirmed accurate against current source in this session) — this document only adds the verification-method mapping and the three risks above for the planner to resolve before task-writing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Staff-creation caller-role check (SALE-02) | API / Backend (Edge Function) | — | Auth/authorization must be enforced server-side; a client-side role gate on the "Add Staff" button is UX only, not security — `create-staff/index.ts` is the actual trust boundary since it's callable with just the anon key today |
| Staff-creation form/dialog (SALE-02) | Frontend Server / Browser (React) | — | Pure UI composition, no new client-side data ownership |
| Offline detection (SALE-04) | Browser / Client | Frontend feature (mutation hook) | `navigator.onLine` is a browser API; the guard lives in the mutation hook per D-07, not centralized, matching existing `isOnline()` call sites |
| Error-message translation (SALE-05) | Frontend feature (mutation hook + UI) | — | AppError → i18n string mapping happens client-side; raw errors still flow server→client over the RPC/edge response, translation is purely a presentation-layer concern |
| Refund payload validation (SALE-06) | Frontend feature (mutation hook) | Database (RPC) | Client-side Zod is a fast-fail UX layer; DB-side business-rule checks (`REFUND_EXCEEDS_ORIGINAL`) remain the authoritative validation per D-12 — this is defense-in-depth, not a replacement |
| Tauri identifier (OPS-01) | Build/Ops config | — | Static config value read at build time by the Tauri bundler; no runtime code path |

## Standard Stack

No new libraries. This phase composes already-installed dependencies only:

| Library | Version (from `package.json`) | Purpose in this phase |
|---------|-------------------------------|------------------------|
| `zod` | `^4.3.6` [VERIFIED: package.json] | SALE-06's new `ProcessRefundInput` schema |
| `react-i18next` | `17.0.10` [VERIFIED: package.json] | All new UI copy (Add Staff dialog, offline dialog, generic-fallback error string) |
| `@tanstack/react-query` | `^5.99.0` [VERIFIED: package.json] | New `create-staff` mutation hook, existing `useProcessRefund`/`useCheckoutSale` hooks being modified |
| `@supabase/supabase-js` | already in use in edge functions (`https://esm.sh/@supabase/supabase-js@2` import, Deno runtime) [VERIFIED: supabase/functions/create-staff/index.ts:2] | `create-staff` edge function's admin client, and the Bearer-auth verify pattern to transplant from `process-payment` |

No `npm install` / `pip install` / `cargo add` needed for this phase. **Package Legitimacy Audit is not applicable** — no new external packages are introduced.

## Architecture Patterns

### System Architecture Diagram (SALE-02 caller-role check — the one genuinely new code path)

```
Browser (Add Staff dialog)
   │  POST with Authorization: Bearer <caller JWT>, body {name, pin, role, locale}
   ▼
create-staff Edge Function (Deno)
   │
   ├─ 1. Authorization header present? ── no ──▶ 401 UNAUTHORIZED
   │         │ yes
   ├─ 2. GET {SUPABASE_URL}/auth/v1/user  with caller's Bearer token + anon apikey
   │         │ (NOT admin.auth.getUser() — fails on ES256 tokens, see process-payment comment)
   │         │ not ok ──▶ 401 UNAUTHORIZED
   │         │ ok → authUser.id
   ├─ 3. service-role client: SELECT role FROM profiles WHERE id = authUser.id
   │         │ role not in ('admin','manager') ──▶ 403 FORBIDDEN
   │         │ else continue
   ├─ 4. admin.auth.admin.createUser(...) + profiles insert (existing logic, unchanged)
   └─ 5. recordAudit(...) (existing call, MUST remain — audit-edge-coverage.test.ts asserts on it)
   ▼
Response {id, email, name, role} or {error}
```

### Recommended file layout for new code

```
src/features/create-staff/
├── model/
│   └── useCreateStaff.ts       # mutation hook, Result<T>/err()/ok() convention
├── ui/
│   └── CreateStaffDialog.tsx   # composes shadcn Dialog/Select/Input/Label per UI-SPEC
└── index.ts                    # public exports

supabase/functions/create-staff/
└── index.ts                    # add Bearer-auth + role-check block, mirroring process-payment/index.ts:92-121
```

### Pattern 1: Bearer-auth + caller-role check (transplant from `process-payment`)
**What:** Verify the caller's JWT via a direct `fetch` to `/auth/v1/user` (not the SDK's `admin.auth.getUser()`), then look up `profiles.role` for that caller and reject if not `admin`/`manager`.
**When to use:** Any edge function that must restrict who can call it beyond "holds the anon key."
**Verified source (this session):**
```typescript
// Source: supabase/functions/process-payment/index.ts, lines 92-119 [VERIFIED: supabase/functions/process-payment/index.ts:92-119]
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
  headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
});
if (!authVerifyResp.ok) {
  return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
}
const authUser = await authVerifyResp.json() as { id: string };
const admin = createClient(supabaseUrl, serviceRoleKey);
```
**Current `create-staff/index.ts` has none of this** — verified full file this session, it reads `const { name, role, pin } = await req.json()` with zero auth check before creating a user [VERIFIED: supabase/functions/create-staff/index.ts:5-6].

### Pattern 2: Per-mutation `isOnline()` fail-fast guard
**What:** Synchronous check at the top of the mutation's `mutationFn`, before any network call, returning `err(networkOfflineError())`.
**Verified existing instances (this session):**
```typescript
// Source: src/entities/tab/model/queries.ts:346-349 [VERIFIED: src/entities/tab/model/queries.ts:346-349]
mutationFn: async (input: CreateTab): Promise<Result<Tab>> => {
  if (!isOnline()) {
    return err(networkOfflineError());
  }
  ...

// Source: src/features/remove-tab-item/useRemoveTabItem.ts:33-36 [VERIFIED: src/features/remove-tab-item/useRemoveTabItem.ts:33-36]
mutationFn: async (input: RemoveTabItemInput): Promise<Result<void>> => {
  if (!isOnline()) {
    return err(networkOfflineError());
  }
  ...
```
`isOnline()` itself: `typeof navigator !== 'undefined' ? navigator.onLine : true` [VERIFIED: src/shared/lib/connectivity.ts:7-9]. `networkOfflineError()`: `{ code: 'NETWORK_OFFLINE', message: 'No internet connection. Working offline.' }` [VERIFIED: src/shared/lib/result.ts:229-232] — this default message is the generic one; D-08's dialog needs its own translated copy per UI-SPEC, not this raw string, since UI-SPEC's contract is "You're offline" / "Checkout needs a connection. Reconnect and try again."

**`useCheckoutSale.submit()` currently has none of this** — verified full file this session; `submit()` goes straight from the CAJA_CLOSED guard to building the RPC payload and calling `callProcessDirectSale(...)` with no `isOnline()` call anywhere [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:101-129].

### Pattern 3: Error-code plumbing gap in `PaymentForm.tsx` (the SALE-04 dialog wiring risk)
**What:** `runPayment()`'s return type discards `AppError.code`, so `handlePrimary()` cannot currently distinguish `NETWORK_OFFLINE` from any other failure to route it to a dialog instead of the existing inline error text.
**Verified (this session):**
```typescript
// Source: src/widgets/PaymentModal/ui/PaymentForm.tsx:324-327, 381 [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:324-327,381]
const runPayment = async (): Promise<
  Result<{ receiptData: ReceiptData }, { message: string }>   // <-- no `code` field
> => {
  ...
    if (!r.ok) return { ok: false, error: { message: r.error.message } };  // code dropped here
```
```typescript
// Source: src/widgets/PaymentModal/ui/PaymentForm.tsx:385-394 [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:385-394]
const handlePrimary = async () => {
  setErrorMessage(null);
  setIsProcessing(true);
  const result = await runPayment();
  setIsProcessing(false);
  if (!result.ok) {
    setErrorMessage(result.error.message);   // renders inline, not a toast
    logger.warn('payment.failed', { tabId: tab.id, code: 'client' });
    return;
  }
  ...
```
**Implication for the planner:** widen `runPayment()`'s error type to `{ message: string; code?: AppErrorCode }` (or similar), thread `r.error.code` through both `processCashPayment`/`processCardPayment`/`processSplitPayment` wrappers (which already return the full `Result<T, AppError>` from `submit()` unmodified until `runPayment()` narrows it), and branch in `handlePrimary()` on `code === 'NETWORK_OFFLINE'` to open the new dialog instead of calling `setErrorMessage`.

### Pattern 4: Zod `safeParse` + `err()` on validation failure (mutation-hook convention)
**What:** Validate the RPC payload with `schema.safeParse(input)` before the network call; on failure, `return err({ code: 'VALIDATION_ERROR', ... })` — never `.parse()` + throw.
**No existing instance of this exact pattern in `process-refund` today** (there's no client-side shape check at all — `useProcessRefund.ts` calls `db.rpc('process_refund', {...})` directly with the raw input [VERIFIED: src/features/process-refund/model/useProcessRefund.ts:37-42]). The closest sibling pattern in this codebase for "validate then err()" is `edit-role`'s `UserRoleSchema.safeParse(selectedRole)` check before submit [VERIFIED: src/features/edit-staff-role/ui/EditRoleDialog.tsx:63 — grep-confirmed presence, not full quote since it's a UI-layer safeParse not a mutation-hook one, included as directional pattern only].

### Anti-Patterns to Avoid
- **Casting away the type error instead of fixing the shape (`supabase as any`):** exactly what SALE-06 is removing. Both `entities/refund/model/queries.ts:17` and `features/process-refund/model/useProcessRefund.ts:18` currently do `const db = supabase as any` [VERIFIED: both files, lines quoted below in Code Examples] with stale comments claiming `refunds` isn't in `supabase.types.ts` yet — it has been since Phase 7 (`refunds:` type block confirmed present) [VERIFIED: src/shared/lib/supabase.types.ts:1098-1122].
- **Polling/auto-retry on the offline dialog:** UI-SPEC explicitly rules this out — "Try Again" is user-initiated only, no silent loop [CITED: 08-UI-SPEC.md "Interaction Contract" §Offline-blocking dialog, point 3].
- **`toast.error(result.error.message)` for any Postgres/RPC-originated error:** the exact anti-pattern SALE-05 removes; still present project-wide (see Open Questions for the full list found this session).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| JWT verification in an edge function | A custom JWT decode/verify | `fetch(`${SUPABASE_URL}/auth/v1/user`)` with the caller's Bearer token | Already solved and battle-tested in `process-payment/index.ts`; hand-rolling JWT verification (including the ES256 gotcha) is a well-documented footgun this codebase already paid the cost of once |
| Offline detection | A custom network-probe/ping mechanism | `navigator.onLine` via `isOnline()` | Browser-native, already wired into `useOnlineStatus()`/`OfflineBanner`; Playwright's `page.context().setOffline()` toggles this exact browser signal, so no new test infra needed either |
| Client-side jsonb shape validation | Manual `if` chains checking `Array.isArray`, `typeof x.qty === 'number'`, etc. | `z.array(z.object({...}))` via Zod, matching every other mutation input in this codebase | Zod is already the single source of truth for domain shapes (`domain.ts`); a hand-rolled validator would be a second, divergent source of truth |

**Key insight:** every "don't hand-roll" item in this phase already has a working, in-repo reference implementation — the work is transplant/wire, not invent.

## Common Pitfalls

### Pitfall 1: `SM2` E2E spec locators don't match the UI-SPEC's actual component choices
**What goes wrong:** `roleSelect.selectOption('cashier')` silently fails or throws "element not a `<select>`" against a shadcn/Radix `Select`; `dialog.getByLabel(/pin/i)` throws a strict-mode ambiguity error once both "PIN" and "Confirm PIN" fields exist.
**Why it happens:** `SM2` was written speculatively before this phase's UI existed (`test.skip(true, 'UI not implemented...')` — it's a placeholder, not a validated contract) [VERIFIED: e2e/22-staff-management.spec.ts:59-79].
**How to avoid:** Rewrite `SM2`'s selectors as part of this phase's SALE-02 task: click the `Select` trigger + click the option `getByRole('option', { name: ... })` (Radix pattern), and scope PIN fields with exact labels (e.g. `getByLabel('PIN', { exact: true })` vs `getByLabel(/confirm pin/i)`) once the dialog's actual `Label`/`htmlFor` wiring is implemented.
**Warning signs:** `SM2` "passing" without ever exercising the real select/PIN-confirm UI (e.g. if the role-select branch is wrapped in an `isVisible().catch(() => false)` skip-if-missing check, it can pass while silently not testing role selection at all — check the test doesn't quietly no-op).

### Pitfall 2: `page.context().setOffline(true)` previously stalled `fetch()` indefinitely on unguarded mutations
**What goes wrong:** Without an `isOnline()` early-exit, a Playwright `setOffline(true)` test hangs until the action timeout, rather than failing fast.
**Why it happens:** This is the exact documented history in this repo — a prior pool-session offline test was permanently skipped for this reason: `test.skip(true, 'Skipped — Playwright setOffline stalls fetch() indefinitely on pool session mutations... Fix requires isOnline() early-exit in mutationFn.')` [VERIFIED: e2e/11-offline.spec.ts:78].
**How to avoid:** This is precisely what SALE-04's guard fixes — once `submit()` has the `isOnline()` check, `page.context().setOffline(true)` will make the guard trigger deterministically and fast (no real network round-trip needed), which is what makes this requirement Playwright-testable at all.
**Warning signs:** A new SALE-04 E2E test that takes the full `actionTimeout` (10-15s per `playwright.config.ts`) to fail — that means the guard isn't actually short-circuiting before the network call.

### Pitfall 3: Adding the caller-role check must not remove the `recordAudit` call `audit-edge-coverage.test.ts` checks for
**What goes wrong:** A rewrite of `create-staff/index.ts` that reorganizes the function body could accidentally drop or comment out the `recordAudit(...)` call or its import, silently breaking `audit-edge-coverage.test.ts`.
**Why it happens:** The test does a source-text check, not a runtime check: `source.includes("from '../_shared/audit.ts'")` and `source.includes('recordAudit(')` [VERIFIED: src/shared/lib/__tests__/audit-edge-coverage.test.ts:48-49], with comment-stripping first (`raw.replace(/^\s*\/\/.*$/gm, '')`) — so even a *commented-out* call would fail differently (the strip only removes full-line `//` comments, so an inline-commented call could still pass falsely, but a genuinely removed call fails correctly).
**How to avoid:** Keep the existing `import { recordAudit } from '../_shared/audit.ts'` and the `await recordAudit(...)` call in `create-staff/index.ts` exactly as-is; only insert the new auth/role-check block before the existing logic.
**Warning signs:** `npm run test` failing on `audit-edge-coverage.test.ts` after touching `create-staff/index.ts`.

### Pitfall 4: `exactOptionalPropertyTypes` will reject a naive `ProcessRefundInput` Zod inference if the RPC payload builder uses `?:` loosely
**What goes wrong:** Per this project's CLAUDE.md, `prop?: string` on a mutation input type fails strict typecheck expectations; must be `prop: string | undefined`.
**Why it happens:** `tsconfig.json`'s `exactOptionalPropertyTypes: true` is project-wide.
**How to avoid:** When defining `ProcessRefundInputSchema` in `domain.ts` (per D-13's recommended option (a)), any genuinely-optional field must resolve to `T | undefined` in the inferred type, not `T?`. `originalPaymentId`/`reason`/`items` are all required per D-12, so this likely doesn't apply unless the planner adds an optional field — flagged so it doesn't get missed if scope shifts.

## Code Examples

### `refunds` table confirmed in `supabase.types.ts` (SALE-06's cast-removal justification)
```typescript
// Source: src/shared/lib/supabase.types.ts:1098-1114 [VERIFIED: src/shared/lib/supabase.types.ts:1098-1114]
refunds: {
  Row: {
    amount: number
    created_at: string
    created_by: string
    id: string
    original_payment_id: string
    reason: string
  }
  Insert: {
    amount: number
    created_at?: string
    created_by: string
    id?: string
    original_payment_id: string
    reason: string
  }
  ...
```

### Existing `RefundReasonSchema` to reuse for `reason` (D-12)
```typescript
// Source: src/shared/lib/domain.ts:1377-1383 [VERIFIED: src/shared/lib/domain.ts:1377-1383]
export const RefundReasonSchema = z.enum([
  'wrong_order',
  'quality_issue',
  'customer_complaint',
  'billing_error',
  'other',
]);
```

### The two `as any` casts to remove (SALE-06)
```typescript
// Source: src/entities/refund/model/queries.ts:9-10,17 [VERIFIED: src/entities/refund/model/queries.ts:9-10,17]
// TanStack Query hooks for refund data.
// Uses `const db = supabase as any` pre-regen cast — refunds table not yet
// in supabase.types.ts until Phase 6 types are transcribed.
...
const db = supabase as any;
```
```typescript
// Source: src/features/process-refund/model/useProcessRefund.ts:6-7,18 [VERIFIED: src/features/process-refund/model/useProcessRefund.ts:6-7,18]
// Maps REFUND_EXCEEDS_ORIGINAL, ITEM_NOT_IN_ORIGINAL_ORDER, and AUTH_FORBIDDEN
// error codes to typed AppError results. Uses `supabase as any` pre-regen cast —
// refunds table not yet in supabase.types.ts until Phase 6 types are transcribed.
...
const db = supabase as any;
```
Both comments are stale (Phase 7's DATA-03 regen already added `refunds`) and should be deleted along with the cast, per D-11.

### `RefundSheet.tsx`'s confirmed raw-error leak (SALE-05)
```tsx
// Source: src/features/process-refund/ui/RefundSheet.tsx:175-181 [VERIFIED: src/features/process-refund/ui/RefundSheet.tsx:175-181]
if (!result.ok) {
  toast.error(
    result.error.message !== ""
      ? result.error.message
      : t("processRefund.genericError")
  );
  return;
}
```
`result.error.message` for an unmapped `process_refund` RPC error is set directly from `error.message as string` in `useProcessRefund.ts`'s fallback branch [VERIFIED: src/features/process-refund/model/useProcessRefund.ts:53 — `return err({ code: 'SUPABASE_ERROR' as AppErrorCode, message: error.message as string, raw: error });`], i.e. the raw Postgres error text.

### Tauri identifier — current placeholder value (OPS-01)
```json
// Source: src-tauri/tauri.conf.json:5 [VERIFIED: src-tauri/tauri.conf.json:5]
"identifier": "com.yourcompany.barpos",
```
Target value per STATE.md: `com.tajhouseofspices.supermarketpos` [CITED: .planning/STATE.md line 109].

## Runtime State Inventory

Not applicable — this phase is not a rename/refactor/migration. No stored data, live service config, OS-registered state, secrets, or build artifacts carry a string being renamed. OPS-01 changes `tauri.conf.json`'s `identifier`, which is a Tauri-bundler-time value (affects the installed app's OS-level app ID on future builds) — this has migration implications for an *already-installed* build (Windows would treat it as a different app, losing any app-scoped local storage), but since this app has not yet shipped to the customer (per STATE.md's "user will provision the real API key... immediately before shipping"), there is no existing installed instance to migrate. No action beyond the config edit.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependency. Everything needed (Supabase CLI/project, Node/npm, Playwright with `channel: 'chrome'`) is already required and presumably available per existing phases 1-7's successful execution.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit) + Playwright v1.59 (E2E) [VERIFIED: package.json "vitest"/"@playwright/test" entries referenced in CLAUDE.md; Playwright config confirmed at playwright.config.ts] |
| Config file | `vitest.config.ts` (unit, not read this session — standard project config referenced by `npm run test`); `playwright.config.ts` (E2E) [VERIFIED: playwright.config.ts:1-65] |
| Quick run command | `npx vitest run <file>` / `npx playwright test <spec>` |
| Full suite command | `npm run test` (unit) / `npm run test:e2e` (E2E) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| SALE-02 (positive) | Admin/manager creates staff via UI → account created, forced-PIN-change on first login | E2E | `npx playwright test e2e/22-staff-management.spec.ts -g "SM2"` | ⚠️ Exists but self-skips (`test.skip(true, 'UI not implemented...')`) and has locator mismatches — must be rewritten, not just un-skipped (see Pitfall 1) |
| SALE-02 (negative) | Non-admin/manager caller (e.g. cashier or anon-key-only request) is rejected by `create-staff`'s new role check | E2E or integration | New Playwright test asserting a direct edge-function call with a cashier JWT (or no JWT) returns 401/403, OR a Vitest integration test hitting the deployed function directly (mirrors `process-refund-rpc.integration.test.ts`'s pattern of calling a real endpoint with env-gated credentials) | ❌ Wave 0 — no existing negative-auth test for `create-staff` |
| SALE-04 | Offline checkout shows blocking dialog, not a hang or silent queue | E2E | New Playwright test in `e2e/50-direct-sale-checkout.spec.ts` (or a new file) using `page.context().setOffline(true)` before triggering checkout submit, asserting the dialog text appears within a short timeout (not the full `actionTimeout`) — see Pitfall 2 for why the guard is what makes this fast/deterministic | ❌ Wave 0 — no existing offline test for direct-sale checkout (the only prior offline-checkout-shaped test, `e2e/11-offline.spec.ts`'s pool-session one, is permanently skipped and pool-sessions don't exist in this codebase anymore) |
| SALE-05 | Refund/checkout error paths show translated message, no raw Postgres string | E2E | Extend `e2e/35-refund.spec.ts` with a test that forces an unmapped RPC error (e.g. malformed manager PIN bypass or a seeded state that trips `SUPABASE_ERROR`) and asserts the rendered toast/error text matches the generic fallback copy, not a raw error substring (e.g. assert absence of `/relation|column|syntax error/i`) | ⚠️ `35-refund.spec.ts` exists (T1-T6 covering success + `REFUND_EXCEEDS_ORIGINAL`) but has no test forcing the generic-fallback path — Wave 0 gap |
| SALE-06 | `process-refund` has no `as any`; malformed `p_items` rejected by Zod before the RPC call | Vitest unit | New `src/features/process-refund/model/useProcessRefund.test.ts` — mock `supabase.rpc` (e.g. `vi.mock('@shared/lib/supabase')`), call the hook's `mutationFn` with a malformed payload (e.g. `items: []`, or `qty: -1`), assert `result.ok === false && result.error.code === 'VALIDATION_ERROR'` **and** assert the mocked `rpc()` was never called (proves fail-fast before network) | ❌ Wave 0 — no unit test file exists for `useProcessRefund` today (only `refund-math.test.ts` for pure math and the live-DB `process-refund-rpc.integration.test.ts`) |
| SALE-06 (no `as any`) | Static check | Direct file inspection (or a cheap grep-based Vitest assertion, mirroring `audit-edge-coverage.test.ts`'s file-source-text-check style) confirming `entities/refund/model/queries.ts` and `features/process-refund/model/useProcessRefund.ts` no longer contain the literal string `as any` | N/A — this is a code-content check, not a behavior test; `npm run typecheck`/`npm run lint` (no `any` without justification comment, per CLAUDE.md) also indirectly enforces this |
| OPS-01 | `tauri.conf.json` identifier is the real value | Direct file inspection | Read `src-tauri/tauri.conf.json`, confirm `"identifier": "com.tajhouseofspices.supermarketpos"` | N/A — config-value fact, consistent with this project's documented exception (STATE.md decisions log) |

### Sampling Rate
- **Per task commit:** relevant single Vitest/Playwright file only (e.g. `npx vitest run src/features/process-refund/model/useProcessRefund.test.ts`, `npx playwright test e2e/22-staff-management.spec.ts`)
- **Per wave merge:** `npm run typecheck && npm run lint && npm run test` (unit, fast); full `npm run test:e2e` if time allows given it requires a running dev server and `.env.local` E2E credentials
- **Phase gate:** Full `npm run test:e2e` green (or the 5 phase-relevant specs at minimum: `22-staff-management`, `35-refund`, `50-direct-sale-checkout`, `11-offline`, plus `npm run test` for the new SALE-06 unit test) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/features/process-refund/model/useProcessRefund.test.ts` — new Vitest unit test covering SALE-06's Zod-rejection path (mock `supabase.rpc`, assert no network call on invalid input)
- [ ] `e2e/22-staff-management.spec.ts` `SM2` — rewrite locators for Radix `Select` + disambiguated PIN/Confirm-PIN fields; add a negative-auth sub-test or new test for the caller-role rejection (SALE-02)
- [ ] New offline-checkout E2E test (direct-sale path) — `e2e/50-direct-sale-checkout.spec.ts` or a new file, using `page.context().setOffline(true)` (SALE-04)
- [ ] `e2e/35-refund.spec.ts` — add a generic-fallback-error assertion test (SALE-05)
- [ ] Framework install: none — Vitest and Playwright are already configured project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | yes | Bearer-JWT verification via `/auth/v1/user` (existing pattern, transplanted into `create-staff`) |
| V3 Session Management | no | No new session mechanism introduced |
| V4 Access Control | yes | Server-side role check (`profiles.role` in `('admin','manager')`) in the edge function — the actual authorization boundary; client-side `ProtectedAction` gating is UX-only defense-in-depth, not the security control |
| V5 Input Validation | yes | Zod `safeParse` on the refund RPC payload (SALE-06); the existing `create-staff` body is currently destructured with zero validation (`const { name, role, pin } = await req.json()` [VERIFIED: supabase/functions/create-staff/index.ts:6] — no Zod/shape check at all) — **flag for planner:** SALE-02's scope per CONTEXT.md is the caller-role check specifically; whether to also add basic body-shape validation to `create-staff` while already editing that file is a cheap, in-scope-adjacent hardening the planner may choose to fold in (not requested by CONTEXT.md, so treat as discretionary, not mandatory) |
| V6 Cryptography | no | No crypto work in this phase — PIN storage mechanism (hash vs plaintext) is unchanged from existing `create-staff` behavior and out of this phase's scope per CONTEXT.md (D-15's discretion note explicitly excludes touching the synthetic-email/PIN storage mechanism unless it blocks something) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Privilege escalation via unauthenticated edge function call (the exact current `create-staff` bug) | Elevation of Privilege | Bearer-JWT verify + server-side role check before any mutation — this is precisely SALE-02's fix |
| Information disclosure via raw DB error strings reaching the UI | Information Disclosure | Generic fallback message client-side; full detail only to `logger.error` (server-side/dev-tools-only) — SALE-05 |
| Client-side-only validation bypass (malformed refund payload sent directly to the RPC, bypassing the UI) | Tampering | Zod validation is a UX fail-fast layer; the actual authoritative check remains the `process_refund` RPC's server-side business-rule checks (`REFUND_EXCEEDS_ORIGINAL`, `ITEM_NOT_IN_ORIGINAL_ORDER`) per D-12 — client Zod does not replace this |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|-----------------|
| A1 | `vitest.config.ts` exists and governs `npm run test` the standard way (not read this session) | Validation Architecture | Low — this is an existing, working project convention across 7 prior phases; not something this phase changes |
| A2 | The `edit-staff-role`-style `UserRoleSchema.safeParse` client-side check is a reasonable "closest sibling pattern" reference for SALE-06's validate-then-`err()` convention, even though it's a UI-layer check rather than a mutation-hook one | Code Examples / Pattern 4 | Low — D-14 already specifies the exact convention (`safeParse` in `mutationFn`, `err({code:'VALIDATION_ERROR'})`), this is just supporting context, not a load-bearing claim |
| A3 | No existing unit test file exists for `useProcessRefund`'s `mutationFn` today (confirmed via `find`, but a file could theoretically exist under a name not matched by the glob used) | Validation Architecture (SALE-06 Wave 0 gap) | Low — `find /mnt/ai/POS/supermarket-pos/src/features/process-refund -type f` was run and returned exactly 4 files, none named `useProcessRefund.test.ts` |

## Open Questions

1. **Does SALE-05's scope extend beyond `featOrders`/`wPanels` (D-10's stated boundary) to the ~12 other raw-`error.message` toast sites found this session?**
   - What we know: `toast.error(result.error.message)` or `toast.error(x, { description: result.error.message })` patterns exist, verified via project-wide grep this session, in: `remove-tab-item/ui/RemoveTabItemDialog.tsx:63`, `reopen-tab/ui/ReopenTabDialog.tsx:77`, `physical-count/ui/PhysicalCountForm.tsx:90`, `register-caja-entry/ui/RegisterCajaEntryDialog.tsx:86`, `SettingsTabsPanel/tabs/EmailReceiptsSettingsTab.tsx:45,55`, `force-pin-change/ui/ForcePinChangeDialog.tsx:28`, `edit-paid-tab/ui/EditPaidTabDialog.tsx:212`, `clock-out-staff/ui/ClockOutDialog.tsx:56`, `manage-categories/ui/CategoryTreeEditor.tsx:372,388`, `edit-staff-role/ui/EditRoleDialog.tsx:76`, `RBACDashboard/PermissionMatrix.tsx:42`, `manage-products/ui/CatalogProductsTab.tsx:168` — none of these are in `featOrders`/`wPanels` per this codebase's namespace table (they're `featMgmt`/`wAdmin`/`staff`).
   - What's unclear: whether SALE-05's requirement text ("Refund and any remaining error paths show staff a clear, translated message") was intended by the roadmap/requirements author to cover this full list, or whether CONTEXT.md's narrower `featOrders`/`wPanels` scoping (chosen during discuss-phase, presumably deliberately) is the actual phase boundary and the rest is out-of-scope debt for a later phase.
   - Recommendation: the planner should either (a) explicitly re-confirm the `featOrders`/`wPanels` scope boundary as final and note the other ~12 sites as a documented follow-up/backlog item (fastest, matches CONTEXT.md as written), or (b) fold the full list into this phase's SALE-05 tasks if judged in-scope. Given this phase's "wiring/cleanup bundle" framing and that CONTEXT.md was produced by a thorough dedicated discuss-phase session that scoped it narrowly on purpose, **(a) is the safer default** — flag it to the user/CONTEXT rather than silently expanding scope.

2. **Should the SALE-02 negative-auth E2E test call the deployed edge function directly, or drive it through the UI with a seeded low-privilege session?**
   - What we know: `process-refund-rpc.integration.test.ts` establishes a precedent for a Vitest integration test that authenticates as a specific role and calls a Supabase endpoint directly, gated behind env vars (`hasAuthEnv`/`hasBartenderEnv`) with `it.skip` fallback when unavailable.
   - What's unclear: whether ROADMAP's success criterion 1 ("a non-admin/manager caller is rejected... verified by Playwright E2E") mandates the negative case specifically be Playwright (browser-driven) rather than a Vitest integration test hitting the function URL directly.
   - Recommendation: ROADMAP's wording says "both verified by Playwright E2E" for SC1 as a whole — read literally this means the negative case should also be a Playwright test (e.g., log in as a cashier, attempt some path that would call `create-staff` — though there's no UI path for a cashier to reach that dialog since it's gated by `ProtectedAction action="manage_staff"`, so the negative test likely needs to call `fetch()` directly from within `page.evaluate()` or via `page.request.post()` using a cashier's captured JWT). Planner's call on the exact mechanics; either approach satisfies the requirement's intent (server rejects unauthorized callers) even if the letter of "Playwright E2E" needs the `page.request` API rather than UI-click-through, since there's no UI surface for the negative case by design.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| SALE-02 | Admin/manager can create staff via UI wired to `create-staff`; edge function gets a caller-role check it currently lacks | Bearer-auth pattern verified at `process-payment/index.ts:92-119`; current `create-staff/index.ts` confirmed to have zero auth check; existing (self-skipping, locator-stale) E2E test `SM2` identified as the verification vehicle, needs rewrite not just un-skip |
| SALE-04 | Checkout fails fast offline with a clear message, using `isOnline()`/`networkOfflineError()` | Existing guard pattern verified at `tab/model/queries.ts:346-349` and `remove-tab-item/useRemoveTabItem.ts:33-36`; `useCheckoutSale.submit()` confirmed to have no guard; critical gap found in `PaymentForm.tsx`'s error-code-stripping that must be fixed for the dialog to distinguish offline from other errors; prior `setOffline()`-hang pitfall documented in this repo's own `e2e/11-offline.spec.ts` explains why the guard is what makes this testable |
| SALE-05 | Refund/checkout error paths show translated messages, not raw Postgres/RPC strings | Confirmed leak sites at `RefundSheet.tsx:175-181` and `useProcessRefund.ts:53`; project-wide grep found a materially larger leak surface than D-10's stated scope — flagged as Open Question 1 for planner/user to resolve the exact boundary |
| SALE-06 | `process-refund`'s `as any` removed; `p_items` gets Zod validation | Both `as any` casts and their stale comments located and quoted verbatim; `refunds` table type confirmed present in `supabase.types.ts:1098-1122`; `RefundReasonSchema` located at `domain.ts:1377-1383` for reuse; no existing unit test file for the hook — Wave 0 gap identified with a concrete test-writing approach (mock `supabase.rpc`, assert no call on invalid input) |
| OPS-01 | Tauri identifier set to real value | Current placeholder confirmed at `tauri.conf.json:5`; target value cited from STATE.md; verification method is direct file inspection per project's documented exception |
</phase_requirements>

## Sources

### Primary (HIGH confidence — read directly this session)
- `supabase/functions/process-payment/index.ts` — Bearer-auth verification pattern (lines 92-129)
- `supabase/functions/create-staff/index.ts` — full current function body, no auth/role check
- `src/features/checkout-sale/model/useCheckoutSale.ts` — full file, confirms no `isOnline()` guard
- `src/shared/lib/connectivity.ts` — `isOnline()`/`useOnlineStatus()` full implementation
- `src/entities/tab/model/queries.ts` (lines 330-359) — existing `isOnline()` guard instance
- `src/shared/lib/result.ts` (lines 210-239) — `AppError` type, `networkOfflineError()`
- `src/features/remove-tab-item/useRemoveTabItem.ts` — full file, another guard instance
- `src/features/process-refund/model/useProcessRefund.ts` — full file, `as any` cast + error mapping
- `src/entities/refund/model/queries.ts` — full file, `as any` cast + stale comment
- `src/entities/refund/model/types.ts` — full file, re-export-only convention
- `src/shared/lib/domain.ts` (lines 1370-1424) — `RefundReasonSchema`/`RefundSchema` definitions
- `src/shared/lib/supabase.types.ts` (lines 1085-1129) — `refunds` table type block
- `src/features/process-refund/ui/RefundSheet.tsx` (lines 160-199) — raw-error toast site
- `src/shared/lib/edge-function-contracts.ts` (lines 140-219) — `mapProcessPaymentEdgeError`, no raw pass-through found in this mapper
- `src/shared/lib/__tests__/audit-edge-coverage.test.ts` — full file, confirms source-text-based assertion mechanics
- `src-tauri/tauri.conf.json` (lines 1-15) — current `identifier` placeholder
- `playwright.config.ts` — full file, confirms headless-always, `channel: 'chrome'`, timeout values
- `e2e/11-offline.spec.ts` — full file, documents the `setOffline()`-stall pitfall and its prior fix requirement
- `e2e/22-staff-management.spec.ts` (lines 1-110) — existing `SM2` test, confirms self-skip and stale locators
- `e2e/35-refund.spec.ts` (lines 1-50) — existing refund E2E structure to extend
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` (lines 300-424) — confirms error-code-stripping gap, actual call site for checkout submit
- `src/widgets/StaffDashboard/StaffDashboard.tsx` (lines 1-200) — `ProtectedAction`/dialog composition pattern
- `src/features/edit-staff-role/ui/EditRoleDialog.tsx` (grep-scoped) — `Select`/`safeParse` reference pattern
- `src/shared/ui/ConfirmDialog.tsx` — full file, base component for the offline dialog
- `src/features/process-refund/process-refund-rpc.integration.test.ts` (lines 1-60) — existing integration-test env-gating pattern
- `package.json` (grepped) — confirms `zod@^4.3.6`, `react-i18next@17.0.10`, `@tanstack/react-query@^5.99.0`, no new deps needed
- `.planning/phases/08-sale-payment-workflow-wiring-cleanup/08-CONTEXT.md` — upstream user decisions, all cross-checked against source this session
- `.planning/phases/08-sale-payment-workflow-wiring-cleanup/08-UI-SPEC.md` — upstream UI contract for the two new dialogs
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (lines 155-184), `.planning/STATE.md` — requirement/success-criteria/decision source of truth

### Secondary (MEDIUM confidence)
- Project-wide `grep -rn "toast.error"` sweep across `src/features` and `src/widgets` — confirms the broader raw-error-leak surface referenced in Open Question 1; each hit was read in context via the grep output itself (not individually opened in full), so file-level surrounding logic beyond the matched line is not independently verified.

### Tertiary (LOW confidence)
- None used — no WebSearch/Context7 lookups were needed for this phase (no new external library or unfamiliar API).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, versions read directly from `package.json`
- Architecture: HIGH — every pattern cited was read from the actual source file this session, not inferred from CONTEXT.md's citations alone
- Pitfalls: HIGH — all four pitfalls are grounded in code read this session (including the repo's own prior documented `setOffline()` failure and the currently-self-skipping E2E test)
- Validation architecture: HIGH for framework/commands (existing, working project convention); MEDIUM for the exact new-test file names/assertions proposed (reasonable, consistent with existing patterns, but not yet written/run)

**Research date:** 2026-08-17
**Valid until:** 30 days (stable, internal codebase — no external API drift risk for this phase's scope)
