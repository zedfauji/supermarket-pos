---
phase: 08-sale-payment-workflow-wiring-cleanup
plan: 04
subsystem: payments
tags: [i18n, refund, e2e, playwright]

requires:
  - phase: 08-sale-payment-workflow-wiring-cleanup
    provides: "08-02's ProcessRefundInputSchema validation and as-any removal in useProcessRefund.ts (this plan builds on that post-08-02 file state)"
provides:
  - "useProcessRefund.ts's SUPABASE_ERROR fallback returns a translated featOrders:processRefund.genericError message instead of the raw Postgres error.message"
  - "RefundSheet.tsx's dead '!== \"\"' empty-string ternary removed — toast always renders result.error.message directly"
  - "e2e/35-refund.spec.ts generic-fallback test proving the fix via a forced, unmapped process_refund RPC failure"
affects: [payments, refund, sale-payment-workflow, i18n]

actuals:
  tokens: 1286
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "page.route() interception of a Supabase RPC endpoint (**/rest/v1/rpc/<name>*) to force an unmapped/500 failure in E2E, rather than deleting DB rows and risking UI-level guards hiding the affordance under test"

key-files:
  created: []
  modified:
    - src/features/process-refund/model/useProcessRefund.ts
    - src/features/process-refund/ui/RefundSheet.tsx
    - e2e/35-refund.spec.ts

key-decisions:
  - "Used the page.route() interception approach (not a DB-level payment delete) for the new E2E test, per the plan's own preference — RefundButton's UI-level guard for fully-refunded payments (T5) would otherwise risk hiding the Refund affordance if the referenced payment row were deleted before opening the sheet."
  - "Forced RPC failure body shaped as a real Postgres error ({ message: 'relation \"e2e_forced_unmapped_error\" does not exist', code: '42P01', details: null, hint: null }) via a 500 response, matching the plan's explicit example and ensuring none of the three mapped error-code checks (REFUND_EXCEEDS_ORIGINAL/ITEM_NOT_IN_ORIGINAL_ORDER/AUTH_FORBIDDEN) accidentally match."

patterns-established:
  - "Confirmed pattern: E2E toast assertions use the literal en-US translated string (not a locale-agnostic regex) when the test account's profile.locale is seeded en-US (scripts/setup-dev-users.ts) and the string itself needs byte-for-byte proof of translation, as opposed to loose substring matches used elsewhere in the file for locale-agnostic assertions."

requirements-completed: [SALE-05]

coverage:
  - id: D1
    description: "useProcessRefund.ts's SUPABASE_ERROR fallback returns i18n.t('featOrders:processRefund.genericError'), never the raw RPC error.message, closing ROADMAP SC3's confirmed leak site."
    requirement: SALE-05
    verification:
      - kind: e2e
        ref: "e2e/35-refund.spec.ts#generic: unmapped process_refund RPC failure shows translated toast, not raw Postgres text"
        status: pass
    human_judgment: false
  - id: D2
    description: "RefundSheet.tsx's dead '!== \"\"' empty-string ternary is removed; toast.error(result.error.message) renders directly."
    requirement: SALE-05
    verification:
      - kind: other
        ref: "grep -c '!== \"\"' src/features/process-refund/ui/RefundSheet.tsx (0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Existing T1-T4, T5, T6 tests in e2e/35-refund.spec.ts remain green — REFUND_EXCEEDS_ORIGINAL/AUTH_FORBIDDEN paths and the mapped-error messages unaffected by the SUPABASE_ERROR-only change."
    requirement: SALE-05
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/35-refund.spec.ts (4 tests, all pass)"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-08-18
status: complete
---

# Phase 08 Plan 04: Refund SUPABASE_ERROR Fallback Translation Summary

**useProcessRefund.ts's confirmed raw-Postgres-error leak (ROADMAP SC3's literal example) is fixed by returning a translated `featOrders:processRefund.genericError` message from the SUPABASE_ERROR fallback branch instead of `error.message`, RefundSheet.tsx's now-dead empty-string ternary is removed, and a new Playwright test forces the exact failure path via `page.route()` RPC interception to prove the fix end to end.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-18T15:03Z (read plan/context)
- **Completed:** 2026-08-18T15:25Z (commit + summary)
- **Tasks:** 1 (tracer, single-task plan)
- **Files modified:** 3

## Accomplishments
- `useProcessRefund.ts`'s `SUPABASE_ERROR` fallback now returns `i18n.t('featOrders:processRefund.genericError')` instead of the raw `error.message`, while `raw: error` is preserved unchanged for logging/debugging paths.
- `RefundSheet.tsx`'s dead `result.error.message !== "" ? result.error.message : t("processRefund.genericError")` ternary is simplified to `toast.error(result.error.message)` — the empty-string fallback branch was unreachable since the hook is now guaranteed to never return an empty or raw string.
- New `e2e/35-refund.spec.ts` test (`generic: unmapped process_refund RPC failure shows translated toast, not raw Postgres text`) forces an unmapped RPC failure via `page.route()` interception of `**/rest/v1/rpc/process_refund*`, returning a Postgres-shaped 500 error, and asserts the visible toast text equals the translated en-US string and that no `/relation|column|syntax error|does not exist/i` text is rendered.

## Task Commits

Each task was committed atomically:

1. **Task 1: Translate useProcessRefund's SUPABASE_ERROR fallback, simplify RefundSheet's ternary, extend 35-refund.spec.ts** - `3b96c38` (fix)

## Files Created/Modified
- `src/features/process-refund/model/useProcessRefund.ts` - SUPABASE_ERROR fallback returns translated message
- `src/features/process-refund/ui/RefundSheet.tsx` - dead empty-string ternary removed
- `e2e/35-refund.spec.ts` - new generic-fallback test added after existing T6

## Decisions Made
- Used the plan's preferred `page.route()` interception approach for the new E2E test rather than deleting the payment row via the service client — this avoids risking a collision with `RefundButton`'s own UI-level guard (documented in the existing T5 test) that hides the Refund affordance once a payment's refunded total reaches its amount, and it directly exercises the exact client-side code path (`useProcessRefund`'s `SUPABASE_ERROR` branch) this task fixes.
- Asserted the toast text against the literal en-US translated string (`"Could not process refund. Check your connection and try again."`) rather than a locale-agnostic regex, since E2E test accounts are seeded with `locale: 'en-US'` (`scripts/setup-dev-users.ts`) and this test specifically needs to prove the *translated* string appears, not merely a string matching some pattern.

## Deviations from Plan

None — plan executed exactly as written. (Fresh worktree required `npm ci` and copying `.env.local` from the main checkout to run typecheck/lint/tests, matching the same environment-setup step 08-02 documented — not a code deviation, not committed.)

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ROADMAP SC3 ("Triggering a refund failure shows a translated, staff-facing message instead of a raw Postgres/RPC error string") is closed for the refund flow specifically.
- `REFUND_EXCEEDS_ORIGINAL`/`ITEM_NOT_IN_ORIGINAL_ORDER`/`AUTH_FORBIDDEN` mappings are unchanged — verified byte-identical by the existing T1-T4/T5/T6 tests remaining green.
- No blockers for sibling 08-* plans; this plan only touched the files listed in its `files_modified` frontmatter.

---
*Phase: 08-sale-payment-workflow-wiring-cleanup*
*Completed: 2026-08-18*
