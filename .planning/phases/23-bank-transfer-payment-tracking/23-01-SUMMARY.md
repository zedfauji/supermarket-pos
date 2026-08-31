---
phase: 23-bank-transfer-payment-tracking
plan: 01
subsystem: payments
tags: [postgres, plpgsql, supabase-rpc, zod, luhn, rls, audit]

# Dependency graph
requires: []
provides:
  - "bank_transfers table (1:1 with payments, sibling to refunds) with RLS"
  - "bank_transfer_luhn_check_digit / bank_transfer_is_valid_code / bank_transfer_generate_unique_code PL/pgSQL functions"
  - "process_payment_atomic + process_direct_sale_atomic accept method='bank_transfer', generate server-side reference code"
  - "confirm_transfer_payment / dispute_transfer_payment manager+-gated RPCs"
  - "payment_method enum value 'bank_transfer'"
  - "BankTransferSchema / ConfirmTransferInputSchema / DisputeTransferInputSchema Zod contracts in domain.ts"
  - "confirm_transfer_payment / dispute_transfer_payment RBAC actions in rbac.ts"
  - "payment.transfer_marked_pending / payment.transfer_confirmed / payment.transfer_disputed audit actions"
affects: [23-02, 23-03, 23-04, 23-05]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 14176
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bank-transfer reconciliation state machine (pending -> confirmed | disputed) mirrors process_refund's manager+ auth-check + record_audit shape exactly"
    - "Reference code generated server-side inside process_payment_atomic (SECURITY DEFINER), never client-supplied"

key-files:
  created:
    - supabase/migrations/20260831000002_bank_transfer_payment_method.sql
    - supabase/migrations/20260831000003_bank_transfers_schema.sql
    - src/entities/bank-transfer/model/types.ts
    - src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts
  modified:
    - src/shared/lib/rbac.ts
    - src/shared/lib/audit-actions.ts
    - src/shared/lib/domain.ts
    - src/shared/lib/supabase.types.ts

key-decisions:
  - "Checkpoint decision (human, blocking-human gate): extend payment_method ENUM with 'bank_transfer' rather than converting to text+CHECK or adding a boolean flag — smallest change, consistent with existing cash/card/rappi representation, accepted the one-way-door tradeoff (no ALTER TYPE ... DROP VALUE)."
  - "Reference code stored in payments.reference_number (existing free-text column already used for card auth codes) rather than a new column, per RESEARCH.md's Claude's Discretion note."
  - "No explicit GRANT EXECUTE was needed for process_payment_atomic/process_direct_sale_atomic (Postgres PUBLIC default covers them, matching their entire migration history); added explicit GRANT EXECUTE ... TO authenticated for the two new RPCs anyway, mirroring process_refund's own migration for defense-in-depth consistency."

requirements-completed: [BTP-01, BTP-02, BTP-03, BTP-04, BTP-05, BTP-06, BTP-09, BTP-10]

coverage:
  - id: D1
    description: "process_payment_atomic(method='bank_transfer') generates a unique 7-digit Luhn reference code and stores it on payments.reference_number"
    requirement: "BTP-01"
    verification:
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#process_payment_atomic(bank_transfer): generates a unique 7-digit Luhn code, creates a pending bank_transfers row, closes the tab"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backend half of checkout-time bank-transfer: payment finalizes normally (tab reaches 'paid'), pending bank_transfers row created in the same transaction. Checkout UI (code shown/printed for customer) is out of this backend-only plan's scope — no UI exists yet."
    requirement: "BTP-02"
    verification:
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#process_payment_atomic(bank_transfer)..."
        status: pass
    human_judgment: true
    rationale: "This plan only proves the backend contract (RPC layer). BTP-02's customer-facing checkout UI (code shown/printed) ships in a later plan in this phase; flagging so it isn't mistaken for fully closed."
  - id: D3
    description: "confirm_transfer_payment Luhn-validates the entered code before comparing to the real code; a mistyped (Luhn-invalid) code and a Luhn-valid-but-wrong code are both rejected with VALIDATION_ERROR, transfer stays pending"
    requirement: "BTP-03"
    verification:
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#confirm_transfer_payment: manager entering the real code confirms the transfer"
        status: pass
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#confirm_transfer_payment: Luhn-invalid code is rejected before ever comparing to the real code"
        status: pass
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#confirm_transfer_payment: Luhn-valid but wrong code is rejected"
        status: pass
    human_judgment: false
  - id: D4
    description: "dispute_transfer_payment rejects an empty reason with VALIDATION_ERROR; a real reason is stored and the transfer moves to 'disputed'"
    requirement: "BTP-04"
    verification:
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#dispute_transfer_payment: requires a non-empty reason"
        status: pass
    human_judgment: false
  - id: D5
    description: "No auto-confirm path exists anywhere — only confirm_transfer_payment/dispute_transfer_payment ever mutate bank_transfers.status, and both require an explicit manager+-supplied argument (p_entered_code / p_reason) from a real tap"
    requirement: "BTP-05"
    verification: []
    human_judgment: true
    rationale: "Absence-of-a-path is a structural/negative claim across the whole migration, not a single assertable test outcome. Confirmed by code review: only 2 functions write bank_transfers.status in the entire schema, both SECURITY DEFINER with an explicit auth.uid()-based role check and no code path that sets status without a caller-supplied code/reason."
  - id: D6
    description: "Every state transition (mark pending / confirm / dispute) calls record_audit() in the same transaction, using action strings pre-registered in AuditActionSchema"
    requirement: "BTP-06"
    verification:
      - kind: unit
        ref: "src/shared/lib/__tests__/audit-actions.test.ts"
        status: pass
      - kind: integration
        ref: "docker exec psql: select action, count(*) from audit_logs where action like 'payment.transfer_%' group by action — returned all 3 actions with nonzero counts after the test run"
        status: pass
    human_judgment: false
  - id: D7
    description: "A cashier-role account calling confirm_transfer_payment or dispute_transfer_payment directly is rejected server-side with AUTH_FORBIDDEN, independent of any client-side gate (no UI exists yet in this plan)"
    requirement: "BTP-09"
    verification:
      - kind: integration
        ref: "src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts#confirm_transfer_payment / dispute_transfer_payment: AUTH_FORBIDDEN blocks a cashier-role account"
        status: pass
    human_judgment: false
  - id: D8
    description: "No bank-statement import/PSP webhook/bank-API client introduced anywhere in this plan; bank-transfer sales flow through the same payments table the existing revenue reports already sum (get_caja_report/get_payment_methods_report untouched)"
    requirement: "BTP-10"
    verification: []
    human_judgment: true
    rationale: "Negative/scope-exclusion claim (nothing was added) plus a reporting-breakout metric explicitly deferred to a later plan in this phase — not a single testable assertion this plan can auto-pass."

duration: 45min
completed: 2026-08-31
status: complete
---

# Phase 23 Plan 01: Bank Transfer Backend Contract Summary

**New `bank_transfers` table + Luhn reference-code PL/pgSQL functions + `confirm_transfer_payment`/`dispute_transfer_payment` manager+-gated RPCs, wired into `process_payment_atomic`/`process_direct_sale_atomic` via a `bank_transfer` payment_method enum value, proven green against a real local Supabase instance.**

## Performance

- **Duration:** ~45 min (includes a mid-execution worktree-recreation detour, see Issues Encountered)
- **Started:** 2026-08-31T11:07Z (worktree creation)
- **Completed:** 2026-08-31T11:19Z
- **Tasks:** 2/2
- **Files modified:** 7 (2 new migrations, 4 shared-lib edits, 1 regenerated types file) + 2 new entity files

## Accomplishments
- `bank_transfers` table (sibling to `refunds`, 1:1 FK to `payments`) with RLS enabled and exactly one SELECT policy — every write goes exclusively through the SECURITY DEFINER RPCs below
- Three PL/pgSQL Luhn functions ported verbatim from `.planning/spikes/003-reference-code-design/reference-code.cjs`: `bank_transfer_luhn_check_digit`, `bank_transfer_is_valid_code`, `bank_transfer_generate_unique_code` (retries only against currently-`pending` codes, per D-02)
- `process_payment_atomic` and `process_direct_sale_atomic` extended (new trailing `p_customer_phone` param, widened method whitelist) to generate the reference code server-side and create the pending `bank_transfers` row + `payment.transfer_marked_pending` audit entry in the same transaction as the payment insert
- `confirm_transfer_payment`/`dispute_transfer_payment` RPCs mirror `process_refund`'s exact manager+/admin auth-check and audit shape; Luhn validation runs strictly before the equality compare (D-08); dispute requires a non-empty reason (D-10)
- `payment_method` enum extended with `'bank_transfer'` in its own migration/transaction (Pitfall 4), confirmed via grep acceptance criteria
- RBAC (`confirm_transfer_payment`/`dispute_transfer_payment` added to `STAFF_ACTIONS`/`MANAGER_EXTRA`) and audit-actions (`payment.transfer_marked_pending`/`_confirmed`/`_disputed`) registries updated before any migration referenced them (Pitfall 1)
- New real RPC integration test (6 cases, no mocks) proves mark-pending → confirm/dispute end-to-end against a live local Postgres instance — RED before migrations applied, GREEN after

## Task Commits

1. **Task 1: Author the full backend contract — schema, RPCs, RBAC, audit, Zod types (RED)** - `824ed06` (test)
2. **Task 2: Apply migrations, regenerate types, drive the integration test to GREEN** - `e2dfa32` (feat)

**Plan metadata:** SUMMARY commit follows this document (docs: complete plan) — per orchestrator instruction for this parallel wave, STATE.md/ROADMAP.md are NOT touched by this plan's executor; the wave orchestrator updates those centrally after merge.

## Files Created/Modified
- `supabase/migrations/20260831000002_bank_transfer_payment_method.sql` - `ALTER TYPE payment_method ADD VALUE 'bank_transfer'`, alone in its own transaction
- `supabase/migrations/20260831000003_bank_transfers_schema.sql` - table + RLS, Luhn functions, extended `process_payment_atomic`/`process_direct_sale_atomic`, new `confirm_transfer_payment`/`dispute_transfer_payment` RPCs
- `src/shared/lib/rbac.ts` - `confirm_transfer_payment`/`dispute_transfer_payment` added to `STAFF_ACTIONS` + `MANAGER_EXTRA`
- `src/shared/lib/audit-actions.ts` - 3 new `payment.transfer_*` action strings
- `src/shared/lib/domain.ts` - `PaymentMethodSchema` gains `'bank_transfer'`; new `BankTransferSchema`/`BankTransferStatusSchema`/`ConfirmTransferInputSchema`/`DisputeTransferInputSchema`
- `src/entities/bank-transfer/model/types.ts` - pure re-export file mirroring `entities/refund/model/types.ts`
- `src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts` - 6-case real RPC integration test (no mocks)
- `src/shared/lib/supabase.types.ts` - regenerated after migrations applied (new `bank_transfers` table, `bank_transfer` enum value)

## Decisions Made
- **Checkpoint decision (blocking-human, resolved by coordinator):** `enum-extend` selected over `text-check`/`boolean-flag` for representing `bank_transfer` on `payments.method` — see `key-decisions` in frontmatter for full rationale.
- Reference code lives in the existing `payments.reference_number` column (not a new column), per RESEARCH.md's Claude's-Discretion note.
- No explicit `GRANT EXECUTE` needed for the two extended pre-existing RPCs (Postgres PUBLIC-default privilege already covers them, matching their entire migration history — confirmed via grep across all prior migrations); added explicit `GRANT EXECUTE ... TO authenticated` for the two brand-new RPCs anyway, matching `process_refund`'s own migration pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was force-removed between the checkpoint-decision return and the coordinator's resume message**
- **Found during:** Resuming after the coordinator resolved the `enum-extend` decision
- **Issue:** The wave-1 worktree (`agent-a4f1d9b104f902b8e` / branch `worktree-agent-a4f1d9b104f902b8e`) had already been force-removed per the standard "worktree is force-removed after you return" lifecycle, even though the return was a checkpoint (not a final completion). No commits existed in it yet, so nothing was lost.
- **Fix:** Recreated the identical worktree (`git worktree add -b worktree-agent-a4f1d9b104f902b8e <path> 200cabe7...`, the same base SHA/branch name reported in the original `<worktree_metadata>`), then symlinked (NTFS junction) `node_modules` from the main checkout to avoid a full `npm ci`, and copied the gitignored `.env.local` from the main checkout so the live-DB integration tests could run.
- **Files modified:** None (infrastructure-only; no source files affected)
- **Verification:** `git rev-parse --show-toplevel`/`--abbrev-ref HEAD` confirmed the recreated worktree matched the original path/branch; a sanity run of the pre-existing `process-refund-rpc.integration.test.ts` (4/4 pass) confirmed the recreated environment could reach the live local Supabase stack before any new code was written.
- **Committed in:** N/A (no commit needed — filesystem/environment setup only)

---

**Total deviations:** 1 auto-fixed (1 blocking — environment recovery)
**Impact on plan:** No scope creep; purely recovering the isolated execution environment the orchestrator expected. All plan-scoped work proceeded exactly as specified afterward.

## Issues Encountered
- The `.env.local` file (gitignored, holds `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`E2E_MANAGER_*`/`E2E_BARTENDER_*`) is not carried into a fresh git worktree automatically (it's untracked in the main checkout). Copied it in manually so the integration tests could run against the live local Supabase stack — this will be needed again for any future worktree-isolated plan in this repo that runs `*.integration.test.ts` files.
- `npx supabase gen types typescript --local > file 2>&1` corrupts the output file by interleaving the CLI's stderr "new version available" notice into the redirected stdout. Regenerated with stderr routed to a separate log instead; confirmed the resulting `supabase.types.ts` ends cleanly with `} as const`.
- The local stack is a self-hosted Docker Compose deployment (`supabase_db_supermarket-pos-selfhosted` container), not the standard `supabase start` CLI-managed stack — `docker exec -e PGPASSWORD=postgres supabase_db_supermarket-pos-selfhosted psql -U supabase_admin -d postgres` was the working connection pattern (differs slightly from 16-01-SUMMARY.md's `supabase-db` container name reference, but the credential/apply pattern was otherwise identical).

## User Setup Required
None - no external service configuration required. All work applied to the existing local Supabase stack already running in this environment.

## Next Phase Readiness
- The full backend contract (schema, RLS, Luhn functions, both extended checkout RPCs, both new reconciliation RPCs, RBAC, audit actions, Zod types) is proven end-to-end against a live database and ready for Plan 02 (checkout UI) to build against without any backend redesign risk.
- BTP-02 and BTP-10 are only backend-complete here — their UI-visible halves (reference code shown/printed at checkout; "pending bank transfer" revenue breakout on reports) are explicitly out of this plan's scope and belong to later plans in this phase (checkout UI, reconciliation UI/reports per the phase's plan sequence).
- BTP-07/BTP-08 (the "Bank Transfers" tab on `/payments` and its CSV export) are entirely untouched by this plan, as planned — no UI exists yet.
- No blockers for Plan 02+.

## Self-Check: PASSED

All 9 files (2 migrations, 5 shared-lib/entity files, 1 regenerated types file, this SUMMARY) confirmed present via `[ -f ... ]`. Both task commits (`824ed06`, `e2dfa32`) confirmed present via `git log --oneline --all`.

---
*Phase: 23-bank-transfer-payment-tracking*
*Completed: 2026-08-31*
