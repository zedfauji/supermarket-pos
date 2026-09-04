---
phase: 27-promotions-discount-management
plan: 09
subsystem: payments
tags: [manager-pin, rbac, authorization, supabase-rpc, edge-function, split-payment, security-fix]

# Dependency graph
requires:
  - phase: 27-promotions-discount-management
    provides: Plan 08's manager-PIN server-side re-verification pattern for process_direct_sale_atomic, and the client-side DiscountInfo.managerPin / edge-function-contracts.ts schema fields (call-shape parity) this plan's edge functions now actually forward
provides:
  - "process_payment_atomic and process_split_payment_atomic independently re-verify a manager override against profiles.pin = p_manager_pin, mirroring process_direct_sale_atomic's Plan 08 pattern — before this, both RPCs accepted p_discount_amount with zero authorization check (T-27-12)"
  - "process-payment/index.ts forwards discountScope/discountType/discountValue/discountAmount/managerOverride/managerPin to process_payment_atomic (previously silently dropped by Zod)"
  - "process-split-payment/index.ts's discountScope/discountType enums fixed from stale bar-pos-era values ('tab'/'item', 'percentage'/'fixed') to the client's actual values ('all', 'percent'/'fixed') — every split-payment discount request was previously rejected with 400 VALIDATION_ERROR before reaching the RPC"
  - "process_direct_sale_atomic's internal delegation to both functions forwards its own already-validated p_manager_override/p_manager_pin, so its already-approved direct sales are not rejected a second time by the new inner check"
  - "Fixed a Postgres function-identity gap (CREATE OR REPLACE FUNCTION cannot truly replace a function whose parameter list grew) that left a stale pre-Plan-08 overload of process_direct_sale_atomic reachable and caused ambiguous-call errors — explicit DROP FUNCTION IF EXISTS added for all three functions this migration touches"
affects: ["process_refund, reopen_tab_rpc, edit_paid_tab_rpc, close_tab — share the identical structural gap (client PIN match discarded, RPC re-checks caller's own identity) but are explicitly out of scope for G-27-13's closure (documented in 27-08-SUMMARY.md, still open as of this plan)"]

# Actuals (#2632)
actuals:
  tokens: 16700
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side re-verification of a manager PIN via an independent DB lookup (profiles.pin = p_manager_pin) rather than trusting the caller's own session identity — same pattern as 27-08, now applied uniformly across all three checkout/payment RPCs"
    - "Explicit DROP FUNCTION IF EXISTS immediately before CREATE OR REPLACE FUNCTION whenever a plpgsql function's parameter list grows — Postgres identifies functions by name + ordered input-type list, so appending even a DEFAULT-valued parameter creates a distinct overload rather than truly replacing the prior signature, leaving it reachable and causing ambiguous-call errors on named-argument RPC calls that omit the new optional params"

key-files:
  created:
    - supabase/migrations/20260903091500_process_payment_manager_override_wiring.sql
  modified:
    - supabase/functions/process-payment/index.ts
    - supabase/functions/process-split-payment/index.ts
    - e2e/payments/payment-pane.spec.ts

key-decisions:
  - "Manager-PIN re-verification order in process_payment_atomic/process_split_payment_atomic mirrors process_direct_sale_atomic's ACTUAL code order exactly (PIN-validity check first, then the discount-requires-manager gate) rather than the plan task's prose listing order (which described them the other way) — 'mirror it exactly' was read as mirroring the real behavior, not the prose enumeration order."
  - "Added explicit DROP FUNCTION IF EXISTS for the pre-this-migration signature of all three functions (process_payment_atomic, process_split_payment_atomic, process_direct_sale_atomic) — discovered via local psql testing that CREATE OR REPLACE FUNCTION cannot truly replace a function whose parameter list grew (Postgres function identity = name + ordered input types), so appending p_manager_override/p_manager_pin without an explicit DROP left the OLD signature reachable as a second overload, causing 'function ... is not unique' ambiguous-call errors on any named-argument RPC call omitting the new optional params. This also retroactively cleans up the same leftover overload Plan 08 left behind for process_direct_sale_atomic (T-27-13-adjacent, Rule 1/3 auto-fix — see Deviations)."
  - "profiles.pin has no UNIQUE constraint (only a partial index); a PIN collision across two active staff resolves ambiguously — pre-existing app characteristic (same note as 27-08), left unfixed per plan scope."

requirements-completed: [PROMO-05, PROMO-07]

coverage:
  - id: D1
    description: "process-payment/index.ts and process-split-payment/index.ts forward discount + manager-override fields to their RPCs; process-split-payment's stale discountScope/discountType enum values are fixed to match what the client actually sends"
    requirement: "PROMO-05"
    verification:
      - kind: other
        ref: "npm run typecheck (clean) + grep -c \"z.enum(\\['tab'\" supabase/functions/process-split-payment/index.ts == 0 (Task 1 verify)"
        status: pass
    human_judgment: false
  - id: D2
    description: "process_payment_atomic and process_split_payment_atomic independently re-verify a manager override against profiles.pin = p_manager_pin before accepting any discount field; process_direct_sale_atomic forwards its own already-validated manager fields through its internal delegation calls so already-approved direct sales are unaffected"
    requirement: "PROMO-07"
    verification:
      - kind: other
        ref: "Migration applied via psql against local Supabase (supabase/migrations/20260903091500_process_payment_manager_override_wiring.sql); confirmed single overload per function post-migration (SELECT count(*) FROM pg_proc ... = 1 for all three); smoke-tested process_payment_atomic and process_split_payment_atomic directly via psql — no discount fields + manager_override=false returns DISCOUNT_REQUIRES_MANAGER, wrong PIN returns FORBIDDEN, correct manager PIN (100002) passes authorization and proceeds to real tab-lookup logic (NOT_FOUND_VERSIONED on a random tab id, confirming the auth gate was cleared)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A cashier session on the PaymentPane (reopened-tab) payment screen, with a real different manager's PIN, completes both a single-tender and a 2-leg split-tender payment with an ad-hoc discount recorded correctly"
    verification:
      - kind: e2e
        ref: "e2e/payments/payment-pane.spec.ts#T13 (process_payment_atomic path), e2e/payments/payment-pane.spec.ts#T14 (process_split_payment_atomic path) — written and typecheck-clean, NOT executed end-to-end in this sandboxed worktree (see Issues Encountered)"
        status: unknown
    human_judgment: true
    rationale: "The E2E specs could not be run against a correct dev server in this sandboxed parallel-worktree environment — the shared port-1520 dev server is bound to the main checkout's code, not this worktree's (confirmed by fetching a modified source file's transformed content and observing the main-repo absolute path in the Vite refresh-runtime registration, not this worktree's path). Same infrastructure limitation 27-08 hit. Unit tests covering the same discount/managerPin call-shape (payment-processor.test.ts, edge-function-contracts.test.ts) pass. A human/orchestrator must re-run `npx playwright test e2e/payments/payment-pane.spec.ts` once a dev server serving this worktree's (or the merged) code is available."

duration: 70min
completed: 2026-09-04
status: complete
---

# Phase 27 Plan 09: process-payment/process-split-payment Manager-PIN Wiring (G-27-13) Summary

**process_payment_atomic and process_split_payment_atomic gain the same PIN-based manager-override re-verification `process_direct_sale_atomic` got in Plan 08, both edge functions now forward the discount+manager fields correctly (fixing a stale bar-pos-era enum bug in process-split-payment that silently rejected every split discount request), and a Postgres function-overload bug discovered while applying the migration is fixed for all three RPCs.**

## Performance

- **Duration:** ~70 min (approximate — not precisely timestamped at spawn)
- **Completed:** 2026-09-04T05:18:00Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `process-payment/index.ts`'s `BodySchema` gains `discountScope`/`discountType`/`discountValue`/`discountAmount`/`managerOverride`/`managerPin` (mirroring `process-direct-sale`'s shape), forwarded to `process_payment_atomic` as `p_discount_scope`/`p_discount_type`/`p_discount_value`/`p_discount_amount`/`p_manager_override`/`p_manager_pin`
- `process-split-payment/index.ts`'s `discountScope`/`discountType` enums fixed from stale bar-pos-era values (`'tab'`/`'item'`, `'percentage'`/`'fixed'`) to the client's actual values (`'all'`, `'percent'`/`'fixed'`) — every split-payment discount request was previously rejected by Zod with 400 `VALIDATION_ERROR` before it ever reached the RPC; `managerOverride`/`managerPin` added and forwarded
- New migration re-keys `process_payment_atomic`'s and `process_split_payment_atomic`'s manager-override authorization from "no check at all" to an independent `profiles.pin = p_manager_pin` lookup gating any discount field (`DISCOUNT_REQUIRES_MANAGER`/`FORBIDDEN`) — closes T-27-12 (before this, either RPC accepted `p_discount_amount` with zero authorization check via a raw PostgREST call)
- `process_direct_sale_atomic` re-created to forward its own already-validated `p_manager_override`/`p_manager_pin` through both internal delegation calls, so its already-approved direct sales are not rejected a second time by the new inner checks (T-27-13)
- Discovered and fixed a genuine Postgres bug while applying the migration locally: `CREATE OR REPLACE FUNCTION` cannot truly replace a function whose parameter list grew (appending a parameter changes the function's identity/type signature), so the prior migrations (including Plan 08's) left stale old-signature overloads reachable, causing `function ... is not unique` ambiguous-call errors. Added explicit `DROP FUNCTION IF EXISTS` for all three functions' pre-this-migration signatures.
- Two new PaymentPane E2E tests (T13 single-tender, T14 2-leg split-tender) proving the ad-hoc discount + manager-PIN flow on the reopened-tab payment screen — written and typecheck-clean, execution blocked by the same shared-dev-server environment limitation 27-08 hit (see Issues Encountered)

## Task Commits

Each task was committed atomically:

1. **Task 1: process-payment and process-split-payment edge functions forward discount + manager fields correctly** - `8d69276` (feat)
2. **Task 2: process_payment_atomic + process_split_payment_atomic gain PIN-based manager-override authorization; process_direct_sale_atomic forwards through** - `a747ed1` (fix)
3. **Task 3: E2E proof on the PaymentPane (reopened-tab) path** - `7654c34` (test)

## Files Created/Modified
- `supabase/migrations/20260903091500_process_payment_manager_override_wiring.sql` - New migration: `process_payment_atomic`/`process_split_payment_atomic` gain `p_manager_override`/`p_manager_pin` params + PIN-based re-verification; `process_direct_sale_atomic` re-created to forward those params through its internal delegation calls; explicit `DROP FUNCTION IF EXISTS` for all three pre-this-migration signatures (deviation, see below)
- `supabase/functions/process-payment/index.ts` - `BodySchema` gains discount/manager fields, forwarded to the RPC call
- `supabase/functions/process-split-payment/index.ts` - Stale `discountScope`/`discountType` enums fixed; `managerOverride`/`managerPin` added and forwarded
- `e2e/payments/payment-pane.spec.ts` - New `seedDiscountTestTab` helper + T13 (single-tender manager-PIN discount) and T14 (2-leg split-tender manager-PIN discount) tests

## Decisions Made
- **PIN-check order mirrors actual code, not prose listing order:** `process_direct_sale_atomic`'s real code validates the manager PIN first, then gates on `DISCOUNT_REQUIRES_MANAGER` — the plan task's prose listed them in the opposite order. Mirrored the actual code order into `process_payment_atomic`/`process_split_payment_atomic` for consistent, predictable behavior across all three RPCs.
- **Explicit `DROP FUNCTION IF EXISTS` before each `CREATE OR REPLACE`:** discovered via local psql testing (see Deviations) — this is now the standard pattern for any future migration that grows one of these RPCs' parameter lists.
- **PIN collision ambiguity accepted as pre-existing** (same note as 27-08): `profiles.pin` has no UNIQUE constraint; out of scope to fix here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug/Blocking] Fixed a Postgres ambiguous-function-overload bug discovered while applying the migration locally**
- **Found during:** Task 2, verifying the migration against the local Supabase instance via psql
- **Issue:** `CREATE OR REPLACE FUNCTION` cannot truly replace a function whose parameter list grew — Postgres identifies a function by name + ORDERED INPUT TYPE LIST, so appending a new trailing parameter (even with a `DEFAULT`) creates a SECOND overload rather than replacing the first. Reproduced directly: `SELECT process_direct_sale_atomic(p_staff_id := ..., p_shift_id := ..., ...)` (omitting the newer optional params) returned `ERROR: function process_direct_sale_atomic(...) is not unique`. This affected all three functions this plan touches — `process_payment_atomic` and `process_split_payment_atomic` would have hit the same bug the moment this migration shipped, and `process_direct_sale_atomic` already had a stale pre-Plan-08 17-param overload left over from Plan 08's own `CREATE OR REPLACE` (same root cause, undiscovered until this plan touched the function again).
- **Fix:** Added explicit `DROP FUNCTION IF EXISTS` for each function's pre-this-migration signature, immediately before its `CREATE OR REPLACE FUNCTION`, in the same migration file.
- **Files modified:** `supabase/migrations/20260903091500_process_payment_manager_override_wiring.sql`
- **Verification:** Re-applied the full migration via psql against the local Supabase instance; `SELECT count(*) FROM pg_proc WHERE proname IN (...)` returned exactly 1 per function (previously 2); the same ambiguous-call reproduction now resolves correctly, returning the expected business error (`CAJA_CLOSED`) instead of "not unique". Smoke-tested `process_payment_atomic`/`process_split_payment_atomic`'s new authorization checks directly (`DISCOUNT_REQUIRES_MANAGER` with no override, `FORBIDDEN` with a wrong PIN, pass-through to real logic with the correct manager PIN `100002`).
- **Committed in:** `a747ed1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/blocking)
**Impact on plan:** Necessary — without this fix, the migration this plan ships would have broken every call to all three RPCs (ambiguous-function errors) the moment it landed, including in production if `process_direct_sale_atomic`'s pre-existing stale overload from Plan 08 is also present there. No scope creep — the fix is scoped entirely to the same migration file this plan already creates, applying the same "explicit DROP before CREATE OR REPLACE" fix uniformly to all three touched functions.

## Issues Encountered

**E2E specs (T13/T14) could not be executed end-to-end in this sandboxed worktree** — same infrastructure limitation 27-08 hit. `playwright.config.ts`'s `webServer` has `reuseExistingServer: true` and a hardcoded port (1520); the already-running dev server on that port is bound to the **main checkout** (`D:\Projects\Code\supermarket-pos\`), not this worktree. Confirmed by fetching `http://localhost:1520/src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` and observing Vite's `$RefreshReg$` registration path was `D:/Projects/Code/supermarket-pos/src/features/...` (the main repo's absolute path), not this worktree's path.

Mitigations applied instead (per the parallel-execution instructions and the fix-attempt-limit guidance):
1. Ran `npm run typecheck` (clean) and confirmed both new tests are type-correct.
2. Applied the migration directly to the local self-hosted Supabase instance via `psql` and independently verified the new authorization logic with direct RPC calls (see coverage D2 above) — the SQL logic itself is proven correct, independent of the E2E harness issue.
3. Ran the closest-related unit test suites (`payment-processor.test.ts`, `edge-function-contracts.test.ts`) — 55/57 pass (2 pre-existing `.todo` placeholders), confirming the discount/managerPin call-shape this plan's edge functions depend on is unaffected.

**Recommendation for the orchestrator/user:** after this wave merges (or in a clean single-agent session with its own port-1520 dev server), run `npx playwright test e2e/payments/payment-pane.spec.ts` to get the real pass/fail signal for T13/T14.

This is recorded on the broken-windows ledger (`.planning/WINDOWS.md`) as an `unrun-verify` entry, per the SUMMARY-creation instructions, so it stays visible at ship time.

## Known Stubs

None — no stub data or hardcoded placeholder values were introduced by this plan's code changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The ad-hoc discount + manager-PIN flow now has the SAME server-side authorization on both payment screens (direct-sale checkout from Plan 08, reopened-tab/PaymentPane from this plan) — G-27-13's core authorization gap is closed for both `process_payment_atomic` family RPCs.
- Follow-up still needed (unchanged from 27-08, not this plan's scope): `process_refund`, `reopen_tab_rpc`, `edit_paid_tab_rpc`, `close_tab` share the identical structural gap (client PIN match discarded, RPC re-checks the caller's own identity) — file a `.planning/todos/` entry if not already tracked.
- Blocker for full sign-off: T13/T14 (Task 3) need an actual green run once the shared dev-server/port-1520 environment issue is resolved — the SQL/edge-function logic is independently verified correct via psql and unit tests, but the specific end-to-end proof requested by the plan's success criteria was not obtainable from this sandbox.
- Any future migration that appends a parameter to `process_payment_atomic`, `process_split_payment_atomic`, or `process_direct_sale_atomic` MUST include an explicit `DROP FUNCTION IF EXISTS` for the prior signature first, or it will reproduce the same ambiguous-overload bug this plan just fixed.

## Self-Check: PASSED

All claimed files verified present on disk; all three task commits (`8d69276`, `a747ed1`, `7654c34`) verified present in `git log`; migration independently re-applied and smoke-tested against the local Supabase instance via psql, confirming single overload per function and correct authorization behavior.

---
*Phase: 27-promotions-discount-management*
*Completed: 2026-09-04*
