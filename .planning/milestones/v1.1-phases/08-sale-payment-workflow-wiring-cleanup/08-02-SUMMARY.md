---
phase: 08-sale-payment-workflow-wiring-cleanup
plan: 02
subsystem: payments
tags: [zod, refund, tanstack-query, supabase, tdd]

requires:
  - phase: 07-backend-data-integrity
    provides: "supabase.types.ts regenerated with the refunds table, enabling removal of the `as any` casts"
provides:
  - "ProcessRefundInputSchema (Zod) + inferred ProcessRefundInput type as the single source of truth for the refund RPC payload"
  - "useProcessRefund fail-fast client-side validation before calling supabase.rpc('process_refund', ...)"
  - "entities/refund/queries.ts and process-refund/useProcessRefund.ts free of `as any` casts"
affects: [payments, refund, sale-payment-workflow]

actuals:
  tokens: 4272
  tasks: 1
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Client-side Zod safeParse as defense-in-depth ahead of a SECURITY DEFINER RPC, while cross-row/DB-state business rules stay server-side only"

key-files:
  created:
    - src/features/process-refund/model/useProcessRefund.test.ts
  modified:
    - src/shared/lib/domain.ts
    - src/entities/refund/model/types.ts
    - src/entities/refund/index.ts
    - src/entities/refund/model/queries.ts
    - src/features/process-refund/model/useProcessRefund.ts
    - src/shared/lib/i18n/locales/en-US/featOrders.json
    - src/shared/lib/i18n/locales/es-MX/featOrders.json

key-decisions:
  - "ProcessRefundInputSchema and its re-export are also added to the entities/refund barrel (index.ts), not just model/types.ts, so useProcessRefund.ts's import (`from '@entities/refund'`) matches the FSD boundary convention documented in that barrel's own header comment (deep imports into entity model/ disallowed from outside the entity)."
  - "Removing the `any` casts surfaced two now-redundant lint findings (unnecessary `?? []` after error-narrowing in queries.ts, unnecessary `as string`/`as string[]` type assertions in useProcessRefund.ts) — cleaned up as part of GREEN rather than left for a separate refactor commit, since ESLint's no-unnecessary-condition/no-unnecessary-type-assertion rules blocked the commit at `max-warnings 0`."

patterns-established:
  - "Defense-in-depth Zod validation ahead of a security-definer RPC: safeParse + err() on failure, never .parse() + throw, and never duplicate the RPC's own cross-row authoritative checks client-side."

requirements-completed: [SALE-06]

coverage:
  - id: D1
    description: "ProcessRefundInputSchema rejects empty items, qty<=0, amount<=0, duplicate order_item_id, non-uuid originalPaymentId, and unknown reason; accepts a well-formed payload and preserves item order"
    requirement: SALE-06
    verification:
      - kind: unit
        ref: "src/features/process-refund/model/useProcessRefund.test.ts#ProcessRefundInputSchema"
        status: pass
    human_judgment: false
  - id: D2
    description: "useProcessRefund's mutationFn returns VALIDATION_ERROR and never calls supabase.rpc on malformed input; calls supabase.rpc with the validated payload and returns ok on success"
    requirement: SALE-06
    verification:
      - kind: unit
        ref: "src/features/process-refund/model/useProcessRefund.test.ts#useProcessRefund"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both `const db = supabase as any` casts (queries.ts, useProcessRefund.ts) and their stale pre-regen comments removed"
    requirement: SALE-06
    verification:
      - kind: other
        ref: "grep -c 'as any' src/entities/refund/model/queries.ts src/features/process-refund/model/useProcessRefund.ts (both 0)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-18
status: complete
---

# Phase 08 Plan 02: Refund Payload Zod Validation Summary

**ProcessRefundInputSchema (Zod, in domain.ts) validates the process_refund RPC's p_items jsonb payload client-side — fail-fast on empty/malformed/duplicate refund lines before any network call — while removing both `as any` casts left over from before the Phase 7 supabase.types.ts regen.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-18T08:46 (first RED commit)
- **Completed:** 2026-08-18T08:50 (GREEN commit)
- **Tasks:** 1 (TDD RED → GREEN)
- **Files modified:** 7 (1 created, 6 modified)

## RED

Created `src/features/process-refund/model/useProcessRefund.test.ts` following `useRemoveTabItem.test.ts`'s mocking pattern (`vi.mocked(supabase.rpc)`, `renderHook` + `QueryClientProvider`). Wrote:
- 8 schema-level `ProcessRefundInputSchema.safeParse(...)` cases (valid payload, empty items, qty<=0, amount<=0, duplicate `order_item_id`, non-uuid `originalPaymentId`, unknown `reason`, item-order preservation).
- 2 hook-level cases: malformed input returns `VALIDATION_ERROR` with `supabase.rpc` never called; well-formed input calls `supabase.rpc('process_refund', ...)` with the validated payload shape and returns `ok`.

Ran `npx vitest run src/features/process-refund/model/useProcessRefund.test.ts` — failed as expected: `ProcessRefundInputSchema` did not exist (`Cannot read properties of undefined (reading 'safeParse')`) and the hook-level malformed-input test failed because the pre-existing `useProcessRefund` called `db.rpc` unconditionally with no validation branch. Committed as `test(08-02)`.

**Environment note (not a plan deviation):** this worktree had no `node_modules` (fresh worktree checkout) and no `.env.local` (gitignored, required by `src/test/global-setup.ts`'s live-Supabase-reachability check that all Vitest projects share). Ran `npm ci` and copied `.env.local` from the main checkout before RED would even execute — both are local dev-environment setup, not code changes, and neither is committed (`.env.local` remains gitignored).

## GREEN

- `src/shared/lib/domain.ts`: added `ProcessRefundInputSchema` (Zod object: `originalPaymentId: UuidSchema`, `items: z.array({order_item_id, qty: positive int, amount: positive, restock}).nonempty()`, `reason: RefundReasonSchema`) with a `.refine()` rejecting duplicate `order_item_id` values, plus the inferred `ProcessRefundInput` type — inserted directly after the existing `RefundReasonSchema` block.
- `src/entities/refund/model/types.ts` + `src/entities/refund/index.ts`: re-export `ProcessRefundInputSchema`/`ProcessRefundInput` from `@shared/lib/domain`, both at the model level and the FSD entity barrel (needed because `useProcessRefund.ts` imports from `@entities/refund`, not a deep `model/` path, per the barrel's own "no deep imports from outside the entity" convention).
- `src/features/process-refund/model/useProcessRefund.ts`: removed `const db = supabase as any`, the stale pre-regen doc comment, and the local `RefundItemInput`/`ProcessRefundInput` interfaces. `mutationFn` now calls `ProcessRefundInputSchema.safeParse(input)` first; on failure returns `err({code: 'VALIDATION_ERROR', message: i18n.t('featOrders:processRefund.invalidPayload')})` without calling `supabase.rpc`. On success, calls `supabase.rpc('process_refund', { p_original_payment_id: parsed.data.originalPaymentId, p_items: parsed.data.items, p_reason: parsed.data.reason, p_manager_pin: '' })` — same call shape as before, now using validated `parsed.data`. `ProcessRefundInput` is still re-exported from this file (`export type { ProcessRefundInput }`) so `features/process-refund/index.ts`'s existing export line needed no change.
- `src/entities/refund/model/queries.ts`: removed `const db = supabase as any` and its stale comment; both `refunds` query functions now call `supabase.from('refunds')...` directly.
- Added `featOrders:processRefund.invalidPayload` to both `en-US` and `es-MX` locale files.

Ran `npx vitest run src/features/process-refund/model/useProcessRefund.test.ts` — all 10 cases pass. Also ran the broader `src/entities/refund src/features/process-refund` test scope (18 tests, all pass) to catch regressions in sibling files that import from the same barrel. `npm run typecheck` clean. `npm run lint` initially flagged 7 errors surfaced by the now-real types replacing `any` (`no-unnecessary-condition` on two `?? []` fallbacks in `queries.ts` that were dead now that `data` is non-null after the error check; `no-unnecessary-type-assertion` on five now-redundant `as string`/`as string[]` casts in `useProcessRefund.ts` now that `supabase.rpc`'s generated return type is already `string`). Cleaned those up in the same GREEN commit (Rule 1 — bug/correctness cleanup directly caused by this task's own change, not out-of-scope). Re-ran `npm run lint` — clean. Committed as `feat(08-02)`.

## REFACTOR

None needed — no genuinely awkward import path or duplication surfaced after GREEN.

## Commits

1. `d74ee36` — `test(08-02): add failing test for refund payload validation` (RED)
2. `6032656` — `feat(08-02): implement refund payload validation` (GREEN)

## Files Created/Modified

- `src/features/process-refund/model/useProcessRefund.test.ts` — new Vitest unit test file (10 cases: 8 schema-level, 2 hook-level)
- `src/shared/lib/domain.ts` — `ProcessRefundInputSchema` + `ProcessRefundInput` type
- `src/entities/refund/model/types.ts` — re-exports the new schema/type
- `src/entities/refund/index.ts` — barrel re-exports the new schema/type
- `src/entities/refund/model/queries.ts` — `as any` cast removed, `supabase.from()` used directly, dead `?? []` fallbacks removed
- `src/features/process-refund/model/useProcessRefund.ts` — `as any` cast removed, safeParse gate added before `supabase.rpc`, redundant type assertions removed
- `src/shared/lib/i18n/locales/en-US/featOrders.json` / `es-MX/featOrders.json` — `processRefund.invalidPayload` key added

## Decisions Made

- Re-exported `ProcessRefundInputSchema`/`ProcessRefundInput` from the `entities/refund` barrel (not just `model/types.ts`) so `useProcessRefund.ts`'s import matches the codebase's own documented FSD boundary rule for that entity.
- Cleaned up the lint findings (`no-unnecessary-condition`, `no-unnecessary-type-assertion`) that removing the `any` casts surfaced, in the same GREEN commit rather than deferring — they are directly caused by this task's change (real types now flow through where `any` previously hid them) and `npm run lint` runs at `max-warnings 0`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing `node_modules` and `.env.local`**
- **Found during:** RED (first attempt to run the failing test)
- **Issue:** Fresh git worktree had no `node_modules` (gitignored, not carried into worktree checkouts) and no `.env.local` (gitignored; `src/test/global-setup.ts` requires `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to reach a live Supabase instance before any Vitest project — including unit — can start).
- **Fix:** Ran `npm ci` in the worktree; copied `.env.local` from the main checkout (`/mnt/ai/POS/supermarket-pos/.env.local`) into the worktree. Neither is a code change; `.env.local` stays gitignored and was not committed.
- **Verification:** `npx vitest run ...` subsequently executed and reported real pass/fail results instead of a startup error.

**2. [Rule 1 - Bug] Removed lint-flagged dead code surfaced by real types replacing `any`**
- **Found during:** GREEN, post-implementation `npm run lint` (max-warnings 0)
- **Issue:** `entities/refund/model/queries.ts` had `(data ?? [])` fallbacks that were already dead (TS narrows `data` non-null after the `if (error)` check) but only became lint-visible once `data`'s type was real instead of `any`. Similarly, `useProcessRefund.ts` had five `as string`/type-assertion casts that became unnecessary once `supabase.rpc`'s generated return type resolved for real.
- **Fix:** Removed the dead `?? []` fallbacks and the now-redundant assertions.
- **Files modified:** `src/entities/refund/model/queries.ts`, `src/features/process-refund/model/useProcessRefund.ts`
- **Verification:** `npm run lint` clean; `npm run typecheck` clean; full test scope (18 tests) still passes.
- **Committed in:** `6032656` (GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking — worktree environment setup, 1 bug — lint cleanup surfaced by real types)
**Impact on plan:** Both necessary to complete the task as specified (a genuinely failing/passing TDD cycle, and a lint-clean commit per project policy). No scope creep beyond the plan's stated files.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ProcessRefundInputSchema` is now the single source of truth for refund payload shape and is available via `@entities/refund` for any future refund-adjacent feature.
- `REFUND_EXCEEDS_ORIGINAL`/`ITEM_NOT_IN_ORIGINAL_ORDER` remain enforced solely by the `process_refund` RPC — unchanged by this plan, confirmed by `useProcessRefund.ts` still forwarding those two RPC-side codes.
- No blockers for sibling 08-* plans in this wave; this plan only touched refund-specific files listed in its `files_modified` frontmatter.

---
*Phase: 08-sale-payment-workflow-wiring-cleanup*
*Completed: 2026-08-18*
