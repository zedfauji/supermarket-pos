---
title: Audit process_refund/reopen_tab_rpc/edit_paid_tab_rpc/close_tab for the same manager-PIN identity bug fixed in G-27-13
date: 2026-09-04
priority: high
---

## What

G-27-13 (Phase 27, plans 27-08/27-09) fixed a class of bug where a manager-PIN override was
verified client-side only: `ManagerPinDialog` checked the PIN matched *some* manager, but the
backend RPC (`process_direct_sale_atomic`, `process_payment_atomic`, `process_split_payment_atomic`)
never re-derived the authorizing staff from the entered PIN — it trusted the caller's own
`p_staff_id`/session. A cashier who got a real manager to type their PIN could swap cart contents
before submitting, or (found in code review, fixed the same day) an edge function could send an
explicit SQL `NULL` for the override flag and silently bypass the check entirely (see
`.planning/phases/27-promotions-discount-management/27-REVIEW.md` and commit `4e5163e`).

Both gap-closure plans (`27-08-SUMMARY.md`, `27-09-SUMMARY.md`) explicitly flagged that this same
identity-verification gap likely exists in other manager-PIN-gated RPCs that were never audited as
part of Phase 27:

- `process_refund`
- `reopen_tab_rpc`
- `edit_paid_tab_rpc`
- `close_tab`

Neither plan filed this as a tracked todo — the Phase 27 verifier (re-verification after
27-08/27-09/27-10 landed) caught the gap and requested it be filed.

## Fix

For each of the four RPCs above:
1. Check whether it accepts a manager-override/PIN parameter for any privileged action (refund,
   reopen, edit-paid-tab, close without full payment, etc).
2. If so, confirm the RPC independently re-derives the authorizing staff from the entered PIN
   (`profiles.pin = p_manager_pin`, joined against `role_permissions` for the relevant action) —
   not from the caller's own `p_staff_id`/session identity.
3. Confirm the override parameter is never nullable in a way that silently disables the check
   (the exact CR-01 bug: `?? null` instead of `?? false` at the edge-function layer, or a raw
   `IF p_override THEN` / `IF NOT p_override THEN` pair in PL/pgSQL that both skip on `NULL`).
   Consider adding the same `COALESCE(p_override, false)` defense-in-depth pattern used in
   `supabase/migrations/20260903093000_manager_override_null_coalesce_guard.sql` if any of these
   RPCs are directly `EXECUTE`-granted to `authenticated` (check
   `information_schema.routine_privileges`).
4. Add regression test coverage (integration test calling the RPC directly with the override
   explicitly `NULL`) for any RPC that needed a fix, mirroring
   `src/entities/payment/model/manager-override-null-coalesce.integration.test.ts`.

## Why it matters

This is the same class of authorization bypass as G-27-13 — a cashier could apply a refund, reopen
a closed tab, or edit a paid tab's line items with no real manager authorization, either by racing
a legitimately-entered manager PIN against a swapped request, or (if any of these RPCs share the
NULL-coalesce pattern) by omitting the override field from the request entirely. `process_refund`
is the highest-priority check — it's the sole staff-facing reversal path for a completed sale
(`AppErrorCode` / RBAC docs in `CLAUDE.md`) and moves real money.
