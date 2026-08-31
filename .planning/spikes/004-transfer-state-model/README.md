---
spike: 004
idea: bank-transfer-payment-tracking
name: transfer-state-model
type: standard
validates: "Given a sale marked pending bank transfer, when cashier marks it and manager+ later confirms/disputes it, then the state machine fits the project's existing payments/audit_logs/RBAC patterns with zero silent auto-confirm paths"
verdict: VALIDATED
related: [003]
tags: [state-machine, rbac, payments, schema]
---

# Spike 004: Transfer Payment State Model

## What This Validates

Given the reference-code design from Spike 003, when wired into a state machine that mirrors this
project's existing `process_refund`/`reopen_tab` pattern (cashier-originated, manager+
gated terminal action, every transition audit-logged — see CLAUDE.md's RBAC Actions table), then
the whole flow — mark pending, generate code, confirm/dispute by manager+, list pending — works
end-to-end with no path that bypasses the "always manual tap-to-confirm" requirement.

## Research

No new library — this is a schema/RBAC-fit question, answered by mirroring patterns already
proven in the real codebase rather than inventing new ones:

- **Role gate:** `src/shared/lib/rbac.ts`'s `cashier < manager < admin` hierarchy, same shape as
  `process_refund` (manager+) — reused directly (`hasRole()` mirrors the real hierarchy check).
- **Audit trail:** every transition logs an entry, mirroring `recordAudit()`'s usage pattern
  confirmed used across edge functions (per prior session's phase-22 admin-pin-reset work).
- **Terminal-action shape:** confirm/dispute follow `process_refund`'s pattern of a manager-PIN-
  gated action recorded against a already-completed sale, not a new concept.

This spike is a standalone in-memory mock (`state-model.cjs`), not a real Supabase migration —
consistent with CONVENTIONS.md's isolation principle (spike code stays out of the shipped app).
The real build (a future `/gsd-plan-phase`) would add this as columns on `payments` (or a sibling
table) rather than the map used here.

## How to Run

```
node state-model.cjs
```

(Depends on `../003-reference-code-design/reference-code.cjs` — run from this directory.)

## What to Expect

`All checks passed.` plus a printed summary and the confirmed record's shape — this shape (`saleId,
referenceCode, amount, customerName, customerPhone, status, createdAt, createdBy, confirmedBy,
confirmedAt`) is the field list a real migration would need.

## Investigation Trail

- First pass only modeled `pending -> confirmed`. Added `disputed` after re-reading the original
  idea: "if not, cashier is instructed to write customer name and phone" implies a real
  non-payment outcome needs its own terminal state with a required reason, not just an open-ended
  pending forever — added the reason requirement to `disputeTransfer()`.
- Explicitly tested that a **cashier cannot confirm their own marked-pending sale** — this wasn't
  in the original idea's literal ask but follows directly from the same-role-tier concern that
  makes `process_refund` manager-gated in the real app (an unsupervised staff member shouldn't be
  able to unilaterally mark money received).
- Explicitly tested the **same-amount-same-evening ambiguity case** raised in the align checkpoint
  (two customers, same amount) — confirmed each pending sale gets its own distinct reference code,
  so ambiguity is resolved by the code itself, not by amount+timestamp guessing. Manager still
  must manually enter/tap per the "always manual" decision — the design doesn't try to guess for
  them, only gives them an unambiguous key to type.
- A mistyped code is rejected by Luhn validation *before* it's even compared to the sale's real
  code — meaning "close but wrong" typos surface as "please re-enter" rather than silently
  matching (or worse, silently failing to match) the wrong sale.

## Results

**Verdict: VALIDATED.** The state model:
- Fits the existing RBAC hierarchy and refund-style manager-gate pattern with no new concepts.
- Produces a complete audit trail on every transition (5 entries for 3 sales + 1 confirm + 1
  dispute in the self-check).
- Has no auto-confirm path anywhere — every terminal transition requires an explicit manager+/
  admin actor, matching the align-checkpoint decision.
- Reuses Spike 003's reference-code generator/validator directly — no re-derivation needed.

**Impact on remaining spikes:** the field list above (`saleId, referenceCode, amount,
customerName, customerPhone, status, createdAt, createdBy, confirmedBy, confirmedAt`) is exactly
what Spike 005's pending-transfer list/export needs to display — used as-is.
