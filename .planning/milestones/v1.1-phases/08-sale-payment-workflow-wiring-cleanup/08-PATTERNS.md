# Phase 8: Sale/payment workflow wiring + cleanup - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 11 (5 new, 6 modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/functions/create-staff/index.ts` (modify) | route (edge function) | request-response | `supabase/functions/process-payment/index.ts` | exact (auth block) |
| `src/features/create-staff/model/useCreateStaff.ts` (new) | service (mutation hook) | request-response | `src/entities/staff/model/queries.ts` (`useMutationUpdateStaffRole`/`useMutationUpdateStaffLocale`, same file family as dialogs below) | role-match |
| `src/features/create-staff/ui/CreateStaffDialog.tsx` (new) | component (dialog) | request-response | `src/features/edit-staff-role/ui/EditRoleDialog.tsx` + `src/features/edit-staff-locale/ui/EditLocaleDialog.tsx` | exact (composite) |
| `src/widgets/StaffDashboard/StaffDashboard.tsx` (modify — add trigger) | component (widget) | request-response | same file, existing `EditRoleDialog`/`ClockInModal` trigger wiring | exact |
| `src/features/checkout-sale/model/useCheckoutSale.ts` (modify — add guard) | service (mutation hook) | request-response | `src/entities/tab/model/queries.ts` (`useMutationOpenTab`, lines 345-349) / `src/features/remove-tab-item/useRemoveTabItem.ts` (lines 33-36) | exact |
| `src/widgets/PaymentModal/ui/PaymentForm.tsx` (modify — offline dialog + error-code plumbing) | component (widget) | request-response | `src/shared/ui/ConfirmDialog.tsx` (dialog base) | role-match |
| new offline-blocking dialog component (component, exact file TBD by planner — e.g. `src/shared/ui/OfflineBlockingDialog.tsx` or inline in `PaymentModal`) | component | request-response | `src/shared/ui/ConfirmDialog.tsx` | exact |
| `src/features/process-refund/ui/RefundSheet.tsx` (modify — remove raw error) | component | request-response | same file's existing structure; sibling pattern `src/features/edit-staff-role/ui/EditRoleDialog.tsx` (toast + `t()` usage) | role-match |
| `src/features/process-refund/model/useProcessRefund.ts` (modify — remove `as any`, add Zod, translate SUPABASE_ERROR) | service (mutation hook) | request-response | `src/features/remove-tab-item/useRemoveTabItem.ts` (typed Result/err mutation shape) | role-match |
| `src/entities/refund/model/queries.ts` (modify — remove `as any`) | model (query hooks) | CRUD (read) | same file, post-cast-removal target: any already-typed `entities/*/model/queries.ts` using `supabase` directly (e.g. `src/entities/tab/model/queries.ts`) | role-match |
| `src/shared/lib/domain.ts` (modify — add `ProcessRefundInputSchema`) | model (Zod schema) | transform | same file's existing `RefundSchema`/`RefundItemSchema`/`RefundReasonSchema` block (lines 1377-1406) | exact |
| `src-tauri/tauri.conf.json` (modify — identifier value) | config | — | n/a (single scalar edit) | n/a |

## Pattern Assignments

### `supabase/functions/create-staff/index.ts` (route, request-response)

**Analog:** `supabase/functions/process-payment/index.ts`

**Bearer-auth + role-check block to transplant** (source lines 92-119):
```typescript
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
// admin.auth.getUser() in supabase-js@2.49.1 fails with ES256-signed tokens...
const token = authHeader.slice(7);
const authVerifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
});
if (!authVerifyResp.ok) {
  return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
}
const authUser = await authVerifyResp.json() as { id: string };
const admin = createClient(supabaseUrl, serviceRoleKey);
```
`create-staff` doesn't have `jsonResponse`/`corsHeaders` helpers today — check whether `process-payment` defines them locally or imports from `_shared/`; replicate whichever it does. After the transplanted block, add the role lookup (not present verbatim anywhere — new code, following the same service-role-client style already used below in `create-staff` for `profiles`):
```typescript
const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', authUser.id).single();
if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
  return jsonResponse({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } }, 403);
}
```

**Current file body — everything after the new auth block must remain unchanged** (verified full file):
```typescript
const { name, role, pin } = await req.json()
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const staffId = crypto.randomUUID()
const email = `${staffId}@barpos.local`
// ...auth.admin.createUser, profiles.insert, recordAudit(...) — keep recordAudit exactly as-is (Pitfall 3, audit-edge-coverage.test.ts checks source text)
```
D-02 requires extending the destructure/insert to accept optional `locale`: `const { name, role, pin, locale } = await req.json()`, then pass `locale` into the `profiles.insert(...)` call (only if provided — `profiles.locale` already defaults to `es-MX` in the DB/domain schema).

**Do not remove:** `import { recordAudit } from '../_shared/audit.ts'` and the `await recordAudit(...)` call — `src/shared/lib/__tests__/audit-edge-coverage.test.ts` does a source-text check for both.

---

### `src/features/create-staff/model/useCreateStaff.ts` (service, request-response) — new file

**Analog:** existing staff mutation hooks pattern (`useMutationUpdateStaffRole`/`useMutationUpdateStaffLocale` in `src/entities/staff/model/queries.ts`) + edge-function-calling convention.

**Core pattern to follow** — every mutation hook in this codebase returns `Promise<Result<T>>` via `err()`/`ok()`, never throws:
```typescript
// Shape mirrored from src/features/remove-tab-item/useRemoveTabItem.ts
export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStaffInput): Promise<Result<{ id: string; email: string; name: string; role: string }>> => {
      if (!isOnline()) {
        return err(networkOfflineError());
      }
      // call the create-staff edge function with Authorization: Bearer <session token>
      // (see edge-function-contracts.ts for the existing fetch-wrapper convention used
      // for other edge functions, e.g. mapProcessPaymentEdgeError's caller)
      ...
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.all }); // or equivalent staff list key
    },
  });
}
```
Check `src/shared/lib/edge-function-contracts.ts` for how other edge functions are invoked from the client (Bearer token attachment, base URL) — reuse that helper rather than a raw `fetch()`.

---

### `src/features/create-staff/ui/CreateStaffDialog.tsx` (component, request-response) — new file

**Analog:** `src/features/edit-staff-role/ui/EditRoleDialog.tsx` (Select + submit pattern) and `src/features/edit-staff-locale/ui/EditLocaleDialog.tsx` (Locale select + default value).

**Imports pattern** (from `EditRoleDialog.tsx` lines 1-24):
```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Staff } from '@shared/lib/domain';
import { UserRoleSchema } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import { POSButton } from '@shared/ui/POSButton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import { Label } from '@shared/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
```
Add `Input` from `@shared/ui/input` for Name/PIN/Confirm PIN fields (not present in either analog since neither has free-text input — check `src/shared/ui/input.tsx` exists, confirmed by UI-SPEC's Registry Safety section).

**Dialog/field-stack structure** (from `EditRoleDialog.tsx` lines 91-138, `EditLocaleDialog.tsx` locale-select block lines 82-104):
```tsx
<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader>
      <DialogTitle>{t('...')}</DialogTitle>
      <DialogDescription>{t('...')}</DialogDescription>
    </DialogHeader>
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="...">...</Label>
        {/* Input or Select per field */}
      </div>
      {/* repeat for Name, PIN, Confirm PIN, Role, Locale */}
    </div>
    <DialogFooter>
      <POSButton type="button" variant="outline" touchSize="default" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
        {t('common:actions.cancel')}
      </POSButton>
      <POSButton type="button" touchSize="default" onClick={() => { void handleSubmit(); }} disabled={!canSubmit}>
        {mutation.isPending ? t('common:actions.saving') : t('...createStaff')}
      </POSButton>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Submit + validation pattern** (from `EditRoleDialog.tsx` lines 59-89, adapted for D-03's PIN-match check):
```typescript
async function handleSubmit() {
  if (pin !== confirmPin) {
    toast.error(t('createStaff.pinMismatch')); // "PINs do not match" per UI-SPEC copy contract
    return;
  }
  const result = await mutation.mutateAsync({ name, pin, role, locale });
  if (!result.ok) {
    logger.error('create-staff.submit.failed', { message: result.error.message });
    toast.error(t('createStaff.genericFailure')); // SALE-05 generic fallback — NOT result.error.message
    return; // dialog stays open per UI-SPEC step 5
  }
  toast.success(t('createStaff.successToast', { name }));
  handleOpenChange(false);
}
```
Role `Select` options: `UserRoleSchema.options` (exact pattern, `EditRoleDialog.tsx` line 32/117-127). Locale `Select` options: `LocaleSchema.options`, default `staff?.locale ?? 'es-MX'` pattern from `EditLocaleDialog.tsx` line 38.

---

### `src/widgets/StaffDashboard/StaffDashboard.tsx` (modify — add trigger)

**Analog:** same file's existing dialog-trigger wiring for `EditRoleDialog`/`ClockInModal` — inspect how those dialogs' `open`/`onOpenChange` state and `ProtectedAction action="manage_staff"`-gated trigger button are wired, and replicate identically for the new "Add Staff" `POSButton` + `CreateStaffDialog`.

---

### `src/features/checkout-sale/model/useCheckoutSale.ts` (modify — offline guard, SALE-04)

**Analog:** `src/entities/tab/model/queries.ts` lines 345-349 and `src/features/remove-tab-item/useRemoveTabItem.ts` lines 33-36.

**Guard pattern to insert at the top of `submit()`, before the CAJA_CLOSED check** (verified source):
```typescript
// Source: src/entities/tab/model/queries.ts:346-349
if (!isOnline()) {
  return err(networkOfflineError());
}
```
Need to add imports if not already present: `import { isOnline } from '@shared/lib/connectivity';` and `networkOfflineError` from `@shared/lib/result.ts`. Verified current `submit()` goes straight from staff/shift/caja checks to `callProcessDirectSale(...)` with zero `isOnline()` call — insert the guard as the very first check (before or after the `CAJA_CLOSED` check per planner's call; CONTEXT.md doesn't specify ordering, but "fail fast" framing favors offline-first).

`networkOfflineError()` source (`src/shared/lib/result.ts` lines 228-232):
```typescript
export const networkOfflineError = (): AppError => ({
  code: 'NETWORK_OFFLINE',
  message: 'No internet connection. Working offline.',
});
```
UI-SPEC requires distinct dialog copy ("You're offline" / "Checkout needs a connection...") — this raw message is NOT what renders in the new dialog; the dialog owns its own i18n strings, triggered by checking `code === 'NETWORK_OFFLINE'` on the returned error.

---

### `src/widgets/PaymentModal/ui/PaymentForm.tsx` (modify — error-code plumbing + offline dialog)

**Analog:** `src/shared/ui/ConfirmDialog.tsx` for the dialog shell; same file's existing `runPayment()`/`handlePrimary()` for the plumbing to widen.

**Current narrowing to fix** (verified `PaymentForm.tsx` lines 324-327, 381, 385-394):
```typescript
const runPayment = async (): Promise<
  Result<{ receiptData: ReceiptData }, { message: string }>   // <-- code dropped
> => {
  ...
  if (!r.ok) return { ok: false, error: { message: r.error.message } };  // widen to include r.error.code
```
```typescript
const handlePrimary = async () => {
  setErrorMessage(null);
  setIsProcessing(true);
  const result = await runPayment();
  setIsProcessing(false);
  if (!result.ok) {
    setErrorMessage(result.error.message);   // branch here: if result.error.code === 'NETWORK_OFFLINE', open offline dialog instead
    logger.warn('payment.failed', { tabId: tab.id, code: 'client' });
    return;
  }
  ...
```
Widen `runPayment()`'s return type to `Result<{ receiptData }, { message: string; code?: AppErrorCode }>` and thread `r.error.code` through all three `if (!r.ok) return { ok: false, error: { message: r.error.message } }` sites (cash/card/rappi legs, each already has the full `Result<T, AppError>` before narrowing — just stop dropping `.code`).

**Offline-blocking dialog component** — build on `ConfirmDialog` (source `src/shared/ui/ConfirmDialog.tsx` full file, 160 lines):
```tsx
<ConfirmDialog
  open={showOfflineDialog}
  title={t('...offlineTitle')}          // "You're offline"
  description={t('...offlineBody')}     // "Checkout needs a connection. Reconnect and try again."
  confirmLabel={t('...tryAgain')}       // "Try Again"
  cancelLabel={t('common:actions.cancel')}
  onConfirm={() => { void handlePrimary(); }}  // re-invokes isOnline() check via submit() path
  onCancel={() => setShowOfflineDialog(false)}
/>
```
`ConfirmDialog` already supports `isLoading`, keyboard Enter/Escape, and generic default/destructive variants — no destructive variant needed here per UI-SPEC (neither action is destructive). This satisfies D-08's "thin wrapper around `ConfirmDialog`" discretion option with less new code than a fully custom dialog.

---

### `src/features/process-refund/ui/RefundSheet.tsx` (modify — SALE-05)

**Current raw-error leak** (verified lines 175-181):
```tsx
if (!result.ok) {
  toast.error(
    result.error.message !== ""
      ? result.error.message
      : t("processRefund.genericError")
  );
  return;
}
```
**Fix pattern** — remove the `result.error.message` branch entirely; always show the mapped/translated message (the hook itself should already return a translated `message` for known codes, and the SALE-05 generic fallback for `SUPABASE_ERROR`/`UNKNOWN_ERROR` — see `useProcessRefund.ts` pattern below). Simplify to:
```tsx
if (!result.ok) {
  toast.error(result.error.message); // now always translated — hook guarantees no raw string
  return;
}
```

---

### `src/features/process-refund/model/useProcessRefund.ts` (modify — SALE-05 + SALE-06)

**Cast + stale comment to remove** (verified lines 1-19):
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any, ... */
/**
 * ...Uses `supabase as any` pre-regen cast — refunds table not yet
 * in supabase.types.ts until Phase 6 types are transcribed.
 */
...
const db = supabase as any;
```
Delete the eslint-disable header (once `db` typed), the stale comment sentence, and `const db = supabase as any;` — replace all `db.rpc(...)` call sites with `supabase.rpc(...)`.

**SUPABASE_ERROR fallback to genericize** (verified line 53, the exact leak site):
```typescript
return err({ code: 'SUPABASE_ERROR' as AppErrorCode, message: error.message as string, raw: error });
```
Fix per D-09/UI-SPEC generic-fallback copy:
```typescript
return err({
  code: 'SUPABASE_ERROR' as AppErrorCode,
  message: i18n.t('featOrders:common.genericFailure'), // "Something went wrong. Please try again or ask a manager for help."
  raw: error, // full detail preserved for logger.error, never shown to UI
});
```
(`i18n` is already imported in this file per the existing `REFUND_EXCEEDS_ORIGINAL`/`ITEM_NOT_IN_ORIGINAL_ORDER` branches — same `i18n.t(...)` call convention, just a new translated key.)

**Zod validation to add (SALE-06, D-14)** — closest sibling pattern is `edit-staff-role`'s `UserRoleSchema.safeParse` (UI-layer, directional only) plus this codebase's mutation-hook `err()` convention:
```typescript
mutationFn: async (input: ProcessRefundInput): Promise<Result<string>> => {
  const parsed = ProcessRefundInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: 'VALIDATION_ERROR' as AppErrorCode, message: i18n.t('featOrders:processRefund.invalidPayload') });
  }
  if (!isOnline()) {
    return err(networkOfflineError());
  }
  const { data, error } = await supabase.rpc('process_refund', { ... });
  ...
```
(Add `isOnline()` guard here too since D-07's convention is "every mutation hook checks before its network call" — not explicitly requested for SALE-06 but consistent with the phase's SALE-04 pattern; planner's call whether in scope.)

---

### `src/entities/refund/model/queries.ts` (modify — SALE-06)

**Cast + stale comment to remove** (verified lines 1-17):
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any, ... */
/**
 * TanStack Query hooks for refund data.
 * Uses `const db = supabase as any` pre-regen cast — refunds table not yet
 * in supabase.types.ts until Phase 6 types are transcribed.
 */
...
const db = supabase as any;
```
Delete eslint-disable header, stale comment, and the cast; replace `db.from('refunds')...` with `supabase.from('refunds')...` — this now type-checks cleanly against `supabase.types.ts:1098-1122`'s `refunds:` table block, so the manual `mapRefundRow` row-casting (`row['id'] as string` etc.) can likely stay as-is (defensive mapping) or be tightened — planner's call, not required by SALE-06's stated scope (cast removal + Zod on the RPC payload only).

---

### `src/shared/lib/domain.ts` (modify — add `ProcessRefundInputSchema`, D-13 option (a))

**Analog / insertion point:** directly after the existing `RefundSchema`/`RefundItemSchema`/`RefundReasonSchema` block (verified lines 1377-1406):
```typescript
export const RefundReasonSchema = z.enum([
  'wrong_order', 'quality_issue', 'customer_complaint', 'billing_error', 'other',
]);
export const RefundItemSchema = z.object({
  id: UuidSchema, refundId: UuidSchema, orderItemId: UuidSchema,
  qty: z.number().int().min(1), amount: z.number().positive(), restock: z.boolean(),
  createdAt: TimestampSchema,
});
```
**New schema to add**, per D-12's exact field list:
```typescript
export const ProcessRefundInputSchema = z.object({
  originalPaymentId: UuidSchema,
  items: z.array(z.object({
    order_item_id: UuidSchema,
    qty: z.number().int().positive(),
    amount: z.number().positive(),
    restock: z.boolean(),
  })).nonempty(),
  reason: RefundReasonSchema,
});
export type ProcessRefundInput = z.infer<typeof ProcessRefundInputSchema>;
```
Then in `src/entities/refund/model/types.ts`, add to the existing re-export block (current full file):
```typescript
export type { Refund, RefundItem, RefundReason, ProcessRefundInput } from '@shared/lib/domain';
export { ProcessRefundInputSchema } from '@shared/lib/domain';
```
This satisfies both D-13's user-preference import location (`entities/refund/model/types.ts`) and the codebase's stated single-source-of-truth convention (schema physically lives in `domain.ts`). `useProcessRefund.ts`'s existing local `ProcessRefundInput`/`RefundItemInput` interfaces (verified lines 21-30) should be deleted and replaced with the import from `types.ts`.

---

### `src-tauri/tauri.conf.json` (config, OPS-01)

**Analog:** none needed — single scalar value edit.
```json
// Source: src-tauri/tauri.conf.json:5
"identifier": "com.yourcompany.barpos",
```
Change to:
```json
"identifier": "com.tajhouseofspices.supermarketpos",
```

## Shared Patterns

### Mutation hook Result/err() convention
**Source:** `src/features/remove-tab-item/useRemoveTabItem.ts` (full file), `src/entities/tab/model/queries.ts`
**Apply to:** `useCreateStaff`, `useCheckoutSale` (guard addition), `useProcessRefund` (Zod addition)
```typescript
mutationFn: async (input: X): Promise<Result<Y>> => {
  if (!isOnline()) {
    return err(networkOfflineError());
  }
  const { data, error } = await supabase.rpc(...);
  if (error) {
    logger.error('...', { error });
    return err({ code: 'SUPABASE_ERROR' as AppErrorCode, message: i18n.t('...genericFailure'), raw: error });
  }
  return ok(data);
}
```

### Dialog shell (shadcn Dialog + POSButton footer)
**Source:** `src/features/edit-staff-role/ui/EditRoleDialog.tsx`, `src/features/edit-staff-locale/ui/EditLocaleDialog.tsx`
**Apply to:** `CreateStaffDialog.tsx`
```tsx
<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader><DialogTitle>...</DialogTitle><DialogDescription>...</DialogDescription></DialogHeader>
    <div className="flex flex-col gap-4 py-2">{/* fields, each: flex flex-col gap-2 */}</div>
    <DialogFooter>{/* outline Cancel + default Submit POSButton, touchSize="default" */}</DialogFooter>
  </DialogContent>
</Dialog>
```

### Blocking confirm/interrupt dialog
**Source:** `src/shared/ui/ConfirmDialog.tsx` (full file)
**Apply to:** the new offline-blocking dialog (SALE-04)
Already handles: keyboard Enter/Escape, `isLoading` spinner, `confirmClassName` passthrough. Just supply `title`/`description`/`confirmLabel`/`cancelLabel` via i18n and wire `onConfirm`/`onCancel` to retry/cancel logic — no new dialog primitive needed.

### Generic-fallback error translation (SALE-05)
**Source:** `src/features/process-refund/model/useProcessRefund.ts`'s existing `REFUND_EXCEEDS_ORIGINAL`/`ITEM_NOT_IN_ORIGINAL_ORDER` branches (i18n.t pattern), applied to the `SUPABASE_ERROR`/`UNKNOWN_ERROR` fallback
**Apply to:** `useProcessRefund.ts`, `useCreateStaff.ts`, any other mutation hook touched by the SALE-05 sweep
```typescript
return err({ code: 'SUPABASE_ERROR' as AppErrorCode, message: i18n.t('<ns>:common.genericFailure'), raw: error });
```
Never pass `error.message` (raw Postgres/RPC text) into the returned `AppError.message` — only into `raw` (log-only) or a `logger.error(...)` call.

## No Analog Found

None — all 11 files/edits in this phase have a strong existing analog; this phase is explicitly "wiring/cleanup" with no new architecture (confirmed by RESEARCH.md's Standard Stack section: no new libraries).

## Open Risk Flagged for Planner (from RESEARCH.md, relevant to pattern application)

- `PaymentForm.tsx`'s `runPayment()` narrows away `AppError.code` at three call sites (cash/card/rappi) — the offline-dialog pattern above only works once all three are widened to preserve `.code`. This is a prerequisite edit, not optional, for the SALE-04 dialog to distinguish `NETWORK_OFFLINE` from other failures.
- `e2e/22-staff-management.spec.ts`'s `SM2` test has stale locators (`selectOption()` against a Radix `Select`, ambiguous `/pin/i` matcher) — rewriting it is in scope alongside `CreateStaffDialog.tsx`, not a separate follow-up.

## Metadata

**Analog search scope:** `src/features/edit-staff-role/`, `src/features/edit-staff-locale/`, `src/features/remove-tab-item/`, `src/entities/tab/model/`, `src/entities/refund/model/`, `src/features/process-refund/`, `src/features/checkout-sale/model/`, `src/widgets/PaymentModal/ui/`, `src/widgets/StaffDashboard/`, `src/shared/ui/ConfirmDialog.tsx`, `src/shared/lib/domain.ts`, `src/shared/lib/result.ts`, `supabase/functions/process-payment/index.ts`, `supabase/functions/create-staff/index.ts`
**Files scanned:** ~15 read in full or targeted ranges this session
**Pattern extraction date:** 2026-08-17
