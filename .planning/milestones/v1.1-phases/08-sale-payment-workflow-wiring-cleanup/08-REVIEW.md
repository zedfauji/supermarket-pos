---
phase: 08-sale-payment-workflow-wiring-cleanup
reviewed: 2026-08-18T15:32:58Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - e2e/22-staff-management.spec.ts
  - e2e/35-refund.spec.ts
  - e2e/50-direct-sale-checkout.spec.ts
  - src-tauri/tauri.conf.json
  - src/entities/caja/model/queries.test.ts
  - src/entities/caja/model/queries.ts
  - src/entities/refund/index.ts
  - src/entities/refund/model/queries.ts
  - src/entities/refund/model/types.ts
  - src/features/checkout-sale/model/useCheckoutSale.ts
  - src/features/create-staff/index.ts
  - src/features/create-staff/model/useCreateStaff.ts
  - src/features/create-staff/ui/CreateStaffDialog.tsx
  - src/features/edit-paid-tab/model/useEditPaidTab.test.ts
  - src/features/edit-paid-tab/model/useEditPaidTab.ts
  - src/features/process-refund/model/useProcessRefund.test.ts
  - src/features/process-refund/model/useProcessRefund.ts
  - src/features/process-refund/ui/RefundSheet.tsx
  - src/features/remove-tab-item/useRemoveTabItem.test.ts
  - src/features/remove-tab-item/useRemoveTabItem.ts
  - src/features/reopen-tab/model/useReopenTab.test.ts
  - src/features/reopen-tab/model/useReopenTab.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/i18n/locales/en-US/featOrders.json
  - src/shared/lib/i18n/locales/en-US/staff.json
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/featOrders.json
  - src/shared/lib/i18n/locales/es-MX/staff.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - src/widgets/StaffDashboard/StaffDashboard.tsx
  - supabase/functions/create-staff/index.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-18T15:32:58Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 08 closes five requirements: a critical create-staff auth bypass (SALE-02), an offline-checkout hang (SALE-04), several raw-Postgres-error UI leaks (SALE-05), missing Zod validation on the refund RPC payload (SALE-06), and a Tauri identifier rebrand (OPS-01). Four of the five are implemented correctly and match their plans closely — the offline-checkout guard, the raw-error-leak sweep (remove-tab-item/reopen-tab/edit-paid-tab/caja-entries/refund), the refund Zod validation with duplicate-item detection, and the Tauri identifier change all hold up under inspection, including their edge cases (order preservation, `SUPABASE_ERROR`-only interception leaving mapped codes untouched, i18n key parity across both locales).

SALE-02's fix, however, is incomplete: it closes the "any anon-key holder can create an admin account" hole but replaces it with a narrower — still critical — one: a `manager`-role caller (who does **not** have the `manage_staff` client-side permission per this codebase's own RBAC table, and therefore never sees the "Add Staff" UI) can still call the `create-staff` edge function directly and successfully create a new **admin**-role account, because the function's role gate treats `admin` and `manager` callers identically and imposes no restriction on which `role` value a caller may assign to the profile being created. This is a real, provable elevation-of-privilege path and is not covered by the phase's own negative test (`SM7`, which only checks a `cashier` caller and an unauthenticated request).

Two secondary robustness gaps were also found (refund flow's own resilience to a thrown/network exception during `supabase.rpc()`, and a stale-branding artifact left over in the exact file this phase's auth work touched).

## Critical Issues

### CR-01: `create-staff` edge function lets a manager mint a new admin account, undermining SALE-02's own fix

**File:** `supabase/functions/create-staff/index.ts:56` (role gate) and `:9` (body schema's unrestricted `role` enum)
**File:** `e2e/22-staff-management.spec.ts:137` (SM7 — negative test does not cover this path)

**Issue:** The new auth block correctly verifies the caller's Bearer token and requires `profiles.role` to be `admin` or `manager` (line 56: `!['admin', 'manager'].includes(callerProfile.role)` → 403 otherwise). That part matches D-05 exactly. But the request body's `role` field (`BodySchema`, line 9: `z.enum(['cashier', 'manager', 'admin', 'kitchen'])`) is accepted verbatim and written straight into `profiles.insert(...)` with **no check that the value being assigned is at or below the caller's own privilege level**.

Cross-referencing this against the codebase's own RBAC model (`src/shared/lib/rbac.ts`) shows the client-side gate around the "Add Staff" button is `manage_staff`, which is in `ADMIN_EXTRA` — i.e. **only `admin`, not `manager`, has `manage_staff`** (`ROLE_SET.manager` = `CASHIER_ACTIONS ∪ MANAGER_EXTRA`, and `manage_staff` is not in either). `StaffDashboard.tsx`'s `<ProtectedAction action="manage_staff">` therefore never renders the "Add Staff" trigger for a manager. The `/staff` route itself, however, is gated only by generic `<ProtectedRoute>` (`src/app/router.tsx:58-64`), so a manager can reach `/staff`, and — critically — the edge function is reachable directly by any authenticated caller regardless of UI visibility.

Concretely: a manager's own valid session token, POSTed to `POST {SUPABASE_URL}/functions/v1/create-staff` with `{ name, pin, role: 'admin' }`, passes the 401/403 gate (caller role is `manager`, which is on the allow-list) and successfully creates a new **admin** account — bypassing this app's own RBAC boundary that explicitly reserves staff management for admins only. This is the same class of bug SALE-02 was opened to close (any-caller → admin-account creation), just narrowed from "anyone with the anon key" to "any manager." Given `manager` accounts are a normal, lower-trust operational role in this POS (cashiers get promoted to manager routinely for caja/refund duties), this is a realistic, high-impact escalation path, not a theoretical one.

`SM7` (the phase's own negative-auth test) proves only that a `cashier` is rejected (403) and an unauthenticated request is rejected (401) — it never asserts that a `manager` is prevented from creating an `admin` account, so this gap shipped without any red test catching it.

**Fix:** Restrict the role a caller may assign based on the caller's own role — at minimum, only an `admin` caller should be able to create an `admin` (or arguably `manager`) account; a `manager` caller should be capped at `cashier`/`kitchen` (or whatever this business decides `manager`-created accounts should be limited to). Example:

```ts
// after the existing admin/manager role-gate, before touching auth.admin.createUser:
if (parsed.data.role === 'admin' && callerProfile.role !== 'admin') {
  return new Response(JSON.stringify({ error: 'Insufficient role' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}
// (optionally also cap manager-role assignment to admin-only callers, per this
// business's intended staff-management policy)
```

Add a companion negative test (e.g. `SM8`) asserting a `manager` caller POSTing `{ role: 'admin', ... }` gets 403 and no profile row is created — mirroring `SM7`'s existing DB-side assertion.

## Warnings

### WR-01: `useProcessRefund`'s `supabase.rpc()` call has no offline guard or exception handling — same hang/silent-failure class SALE-04 fixed elsewhere, left open here

**File:** `src/features/process-refund/model/useProcessRefund.ts:31-36`
**File:** `src/features/process-refund/ui/RefundSheet.tsx:163-178`

**Issue:** Unlike `useReopenTab`/`useEditPaidTab` (both wrap their RPC call in `supabaseMutation()`, which catches thrown/network exceptions and converts them into a `Result`) and unlike `useCheckoutSale.submit()` (which this same phase gave an explicit `isOnline()` fail-fast guard for SALE-04), `useProcessRefund`'s `mutationFn` calls `await supabase.rpc('process_refund', ...)` directly with no `isOnline()` check and no `try/catch`. If the call throws (offline, DNS failure, etc. — the exact scenario SALE-04 was written to guard against for checkout) rather than resolving with `{ error }`, the exception propagates out of `mutationFn`, `mutation.mutateAsync(...)` in `RefundSheet.handleSubmitRefund` (line 165, no `try/catch` around the `await`) rejects, and the `if (!result.ok) toast.error(...)` branch is never reached — the user sees no error, no toast, and the manager-PIN-gated refund attempt silently fails with nothing but an unhandled promise rejection in the console. This phase touched this exact file twice (08-02, 08-04) for adjacent concerns (Zod validation, error-message translation) without closing this related gap.

**Fix:** Wrap the RPC call the same way `useReopenTab`/`useEditPaidTab` do (`supabaseMutation(() => supabase.rpc(...))`), or add the same `isOnline()` fail-fast guard `useCheckoutSale.submit()` now has, so a network failure during refund resolves to a translated `NETWORK_OFFLINE`/`SUPABASE_ERROR` toast instead of a silently-swallowed rejection.

### WR-02: `create-staff`'s generated account email still uses the pre-rebrand `@barpos.local` domain

**File:** `supabase/functions/create-staff/index.ts:84`

**Issue:** `const email = `${staffId}@barpos.local`` predates this phase (not touched by the diff) but sits in the exact file this phase heavily modified for its own rebrand-adjacent requirement (OPS-01, which fixed the analogous `com.yourcompany.barpos` Tauri identifier in the same phase). It's a cosmetic/consistency issue, not a functional bug (the email is never delivered to, or expected to be reachable by, an outside party), but it's a leftover from the bar-pos → supermarket-pos pivot that this phase's own OPS-01 work was specifically about cleaning up elsewhere.

**Fix:** Low priority — consider renaming to a project-neutral placeholder domain (e.g. `@supermarketpos.local`) in a future pass, ideally alongside any other remaining `barpos`-branded internal identifiers.

## Info

### IN-01: `CreateStaffSuccessSchema` error-status mapping collapses body-validation failures into `SUPABASE_ERROR`

**File:** `src/shared/lib/edge-function-contracts.ts:316-320`

**Issue:** `mapCreateStaffEdgeError` maps HTTP 400 (which covers both a malformed body per the edge function's own Zod check, and an `auth.admin.createUser`/`profiles.insert` failure) to the generic `SUPABASE_ERROR` code rather than `VALIDATION_ERROR`. Not user-visible (the dialog always shows a fixed generic-failure toast, never `result.error.message`), but it means any future caller of `callCreateStaff` that *does* want to branch on `VALIDATION_ERROR` vs. a genuine backend failure can't distinguish them from the 400 status alone.

**Fix:** Optional — have the edge function return a distinguishable error code/status for the Zod-validation-failure branch specifically, or have `mapCreateStaffEdgeError` inspect the response body shape rather than status alone, if this distinction becomes needed.

### IN-02: `SM7`'s negative-auth coverage is limited to `cashier` + unauthenticated — no coverage for the `manager` role-assignment gap (see CR-01)

**File:** `e2e/22-staff-management.spec.ts:137-178`

**Issue:** This is the direct test-coverage counterpart of CR-01: the phase's stated goal for SALE-02 included "verified by both a positive (SM2) and negative (SM7) real HTTP-level test," but the negative test's scope stopped at "a caller with insufficient role is rejected entirely," never exercising "a caller with sufficient role assigns an excessive role to the new account." Noted separately from CR-01 so the missing-test gap is trackable independently of the underlying fix.

**Fix:** See CR-01's suggested `SM8` addition.

---

_Reviewed: 2026-08-18T15:32:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
