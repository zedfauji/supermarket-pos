---
phase: 24-tax-configuration-inclusive-exclusive-toggle
plan: 03
subsystem: payments
tags: [deno, supabase-edge-functions, zod, playwright, vitest]

# Dependency graph
requires:
  - phase: 24-tax-configuration-inclusive-exclusive-toggle/01
    provides: "supabase/functions/_shared/tax.ts decomposeTax(), BillingSettingsSchema.taxInclusive (default true)"
provides:
  - "process-payment's receiptData computed via decomposeTax (subtotal/taxAmount/taxRatePercent/taxInclusive), not subtotal===total"
  - "process-split-payment's per-leg receipts computed via decomposeTax, same fix mirrored"
  - "e2e/tabs/reopen-closed-ticket.spec.ts's seedPaidTabViaDirectSale is mode-aware (getBillingTaxConfig/computeAuthoritativeTotal), safe under Plan 01's live taxInclusive=true default"
  - "PaymentSchema.method reuses domain.ts's PaymentMethodSchema (includes bank_transfer) instead of a hand-rolled enum"
affects: [24-04]

# Actuals (#2632)
actuals:
  tokens: 4000
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Same settings.billing read + decomposeTax() call shape now applied identically across all three payment-producing edge functions (process-direct-sale, process-payment, process-split-payment) — no formula re-derived a third/fourth time"
    - "Live network-response interception (page.waitForResponse + response.json()) used to prove an edge function's real JSON shape in Playwright, rather than mocking the response"

key-files:
  created: []
  modified:
    - supabase/functions/process-payment/index.ts
    - supabase/functions/process-split-payment/index.ts
    - e2e/tabs/reopen-closed-ticket.spec.ts
    - e2e/payments/split-payment.spec.ts
    - src/entities/payment/model/types.ts
    - src/entities/payment/model/types.test.ts

key-decisions:
  - "This was a RESUME/closeout run: both production commits (83cb6b2, 24e112b) were already on HEAD from an earlier interrupted executor run. Verified rather than redone — diffed both commits against the plan's exact action text (line-for-line match), re-ran every acceptance criterion and both full Playwright specs live against the local Supabase stack."
  - "Added one regression-guard unit test (method: 'bank_transfer' parses) for the Rule 1 PaymentSchema fix already committed in 24e112b — the fix itself had no direct assertion in types.test.ts, only indirect E2E coverage via the reopen-tab test exercising /payments"

patterns-established: []

requirements-completed: [TAX-03, TAX-04, TAX-05]

coverage:
  - id: D1
    description: "process-payment's receiptData (reopen-tab / edit-paid-tab repay path) carries real decomposed subtotal/taxAmount/total via decomposeTax, not subtotal===total"
    requirement: "TAX-05"
    verification:
      - kind: e2e
        ref: "e2e/tabs/reopen-closed-ticket.spec.ts#manager reopens a closed/paid tab and repays it — process-payment's receipt shows a decomposed subtotal+tax+total shape"
        status: pass
    human_judgment: false
  - id: D2
    description: "process-split-payment's per-leg receipts carry real decomposed subtotal/taxAmount/total via decomposeTax, same fix mirrored"
    requirement: "TAX-05"
    verification:
      - kind: e2e
        ref: "e2e/payments/split-payment.spec.ts#T1: happy path — 2-method split close (cash + card)"
        status: pass
    human_judgment: false
  - id: D3
    description: "e2e/tabs/reopen-closed-ticket.spec.ts's seed helper is mode-aware (getBillingTaxConfig/computeAuthoritativeTotal) so every pre-existing test in the file keeps passing under Plan 01's live taxInclusive=true default, not just the new assertion"
    requirement: "TAX-03"
    verification:
      - kind: e2e
        ref: "e2e/tabs/reopen-closed-ticket.spec.ts (all 5 pre-existing tests + 1 new, full file)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No new tax formula written in either edge function — both process-payment and process-split-payment import and call the same _shared/tax.ts decomposeTax() Plan 01 already unit-tested"
    requirement: "TAX-04"
    verification:
      - kind: other
        ref: "grep -c \"decomposeTax(\" (both files) == 1; grep -c \"const total = subtotal;\" (both files) == 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "PaymentSchema.method reuses domain.ts's PaymentMethodSchema (single source of truth), fixing the hand-rolled enum that silently blanked /payments for any bank_transfer row"
    verification:
      - kind: unit
        ref: "src/entities/payment/model/types.test.ts#PaymentSchema > accepts bank_transfer method"
        status: pass
    human_judgment: false

duration: ~30min (execution, 83cb6b2 to 24e112b) + ~25min (this closeout/verification session)
completed: 2026-09-01
status: complete
---

# Phase 24 Plan 03: process-payment / process-split-payment Receipt Tax Fix Summary

**`process-payment` and `process-split-payment` both now compute receipt tax data via the shared `_shared/tax.ts` `decomposeTax()` (matching `process-direct-sale`'s Plan 01 fix), proven live against the local Supabase stack by two extended Playwright specs that intercept each edge function's real JSON response — closing the "reopened/split-payment receipts show flat tax-on-top while direct-sale receipts show it decomposed" inconsistency RESEARCH.md's Open Question 1 flagged.**

## Performance

- **Duration:** ~30 min execution (83cb6b2 → 24e112b, 2026-08-31 21:53–22:23) + ~25 min closeout/verification session (this run, 2026-09-01)
- **Completed:** 2026-09-01
- **Tasks:** 2 (both from the original execution)
- **Files modified:** 6 (4 from the original two commits, +2 from this closeout: `src/entities/payment/model/types.test.ts` new test, `.planning/REQUIREMENTS.md` traceability)

## Context: this was a resume/closeout, not a fresh execution

An earlier executor run for this plan was interrupted by a permission rejection **after** both production commits landed but **before** `SUMMARY.md` was written. This run:
1. Read `24-03-PLAN.md` and diffed both existing commits (`83cb6b2`, `24e112b`) against the plan's `<action>` text — confirmed line-for-line match, no gaps.
2. Re-ran every grep-based acceptance criterion from the plan.
3. Re-ran `npm run typecheck`, `npm run lint`, and both full Playwright specs live against the local Supabase stack (not from memory/cache).
4. Found one genuine gap (see Deviations) and closed it with a new atomic commit.
5. Wrote this SUMMARY, updated STATE.md/ROADMAP.md/REQUIREMENTS.md.

## Accomplishments
- `process-payment`'s `receiptData` reads `settings.billing` via the already-in-scope `admin` client and calls `decomposeTax(body.amount, taxRatePercent, taxInclusive)`, replacing the old `subtotal = total = body.amount` placeholder; `receiptData` now carries `taxAmount`/`taxRatePercent`/`taxInclusive` alongside `subtotal`/`total`.
- `process-split-payment` reads `settings.billing` once (outside the per-leg `.map()`, since every leg shares the same billing row) and calls `decomposeTax` per leg, replacing the identical placeholder; each leg's returned receipt object gains the same three fields.
- `e2e/tabs/reopen-closed-ticket.spec.ts`'s `getTaxRatePercent`/`computeAuthoritativeTotal` helpers renamed/made mode-aware (`getBillingTaxConfig`/`computeAuthoritativeTotal(subtotal, taxRatePercent, taxInclusive)`) — without this, every test in the file would fail at the seed step under Plan 01's live `taxInclusive=true` default (the RPC's anti-tamper guard would reject the old additive-only seeded amount).
- New live receipt-shape assertions added to both specs: `e2e/tabs/reopen-closed-ticket.spec.ts` intercepts `process-payment`'s real JSON response on a reopen-and-repay flow; `e2e/payments/split-payment.spec.ts` intercepts `process-split-payment`'s real JSON response on the existing 2-method split-close happy path. Both assert `subtotal + taxAmount === total` to the cent.
- [This closeout] `src/entities/payment/model/types.ts`'s `PaymentSchema.method` now reuses `domain.ts`'s `PaymentMethodSchema` (already fixed in `24e112b` as a Rule 1 blocking-bug fix); this closeout added the missing direct unit-test assertion (`method: 'bank_transfer'` parses) that the original fix lacked.

## Task Commits

Each task was committed atomically (both from the original interrupted run, verified not redone):

1. **Task 1: Fix process-payment's receiptData (reopen-tab / edit-paid-tab path)** - `83cb6b2` (fix)
2. **Task 2: Fix process-split-payment's per-leg receipts, prove both edge functions live via E2E** - `24e112b` (fix) — includes the Rule 1 `PaymentSchema.method` blocking-bug fix and the mode-aware e2e seed-helper fix

**This closeout session:**

3. **Regression-guard test for the Rule 1 `PaymentSchema.method` fix** - `45fd404` (test)

**Plan metadata:** (this SUMMARY's own commit, see below)

## Files Created/Modified
- `supabase/functions/process-payment/index.ts` - `receiptData` computed via `decomposeTax`, not `subtotal===total`
- `supabase/functions/process-split-payment/index.ts` - per-leg receipts computed via `decomposeTax`, same fix mirrored
- `e2e/tabs/reopen-closed-ticket.spec.ts` - mode-aware seed helper (`getBillingTaxConfig`/`computeAuthoritativeTotal`) + new live receipt-shape assertion
- `e2e/payments/split-payment.spec.ts` - new live receipt-shape assertion for `process-split-payment`'s first leg
- `src/entities/payment/model/types.ts` - `PaymentSchema.method` reuses `domain.ts`'s `PaymentMethodSchema` (Rule 1 fix, already committed)
- `src/entities/payment/model/types.test.ts` - new `accepts bank_transfer method` regression test (this closeout)

## Decisions Made
- Verified rather than re-executed — both commits' diffs matched the plan's `<action>` text exactly, so no rework was needed; effort went into re-running verification live rather than trusting the prior session's claims.
- Added a direct unit-test assertion for the `PaymentSchema.method` bank_transfer fix rather than relying solely on the existing indirect E2E coverage (the reopen-tab test exercises `/payments`, which would have caught a regression, but a dedicated schema-level test is the more direct and faster-failing guard for this specific bug class).
- Left `TAX-02` unmarked in REQUIREMENTS.md — it is not in this plan's `requirements` frontmatter (owned by `24-01` and `24-04`); only `TAX-03`/`TAX-04`/`TAX-05` (this plan's frontmatter) were marked complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] No direct unit test existed for the already-committed `PaymentSchema.method` bank_transfer fix**
- **Found during:** Closeout verification (re-running "relevant tests actually run" per this session's brief)
- **Issue:** `24e112b`'s Rule 1 fix (switching `PaymentSchema.method` from a hand-rolled `z.enum(['cash','card','rappi'])` to `domain.ts`'s `PaymentMethodSchema`) had no direct assertion in `src/entities/payment/model/types.test.ts` — only indirect coverage via the reopen-tab E2E test exercising `/payments`. A regression reintroducing the hand-rolled enum would not be caught until an E2E run happened to include a `bank_transfer` payment in the most recent 100 rows.
- **Fix:** Added `it('accepts bank_transfer method', ...)` to the existing `describe('PaymentSchema', ...)` block, asserting `PaymentSchema.safeParse({ ...validPayment, method: 'bank_transfer' }).success === true`.
- **Files modified:** `src/entities/payment/model/types.test.ts`
- **Verification:** `npx vitest run src/entities/payment/model/types.test.ts` — 6/6 pass (5 pre-existing + 1 new).
- **Committed in:** `45fd404`

---

**Total deviations:** 1 auto-fixed (1 missing critical test coverage — Rule 2)
**Impact on plan:** Closes a genuine regression-coverage gap for an already-shipped bug fix. No scope creep — same file the original fix touched.

## Issues Encountered

**Pre-existing, unrelated failures confirmed identical to those already logged in `deferred-items.md`** (found during `24-01`/`24-02`, re-confirmed here, not fixed — out of scope):
- `npm run typecheck`: 1 pre-existing `src/app/router.tsx` `BrowserRouter future` prop type error (react-router-dom version/types mismatch), unrelated to any file this plan touches.
- `npm run lint`: 5 pre-existing `@typescript-eslint/no-floating-promises` errors in `HomeDashboard.tsx` (3) and `PINLoginForm.tsx` (2), unrelated to any file this plan touches.

No new typecheck or lint failures introduced by this plan's files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three payment-producing edge functions (`process-direct-sale`, `process-payment`, `process-split-payment`) now agree on the same decomposed subtotal/tax/total shape — TAX-05 is closed across every receipt-producing surface, not just direct-sale checkout.
- `e2e/tabs/reopen-closed-ticket.spec.ts`'s `getBillingTaxConfig`/`computeAuthoritativeTotal` are now established with the exact function/parameter shape Plan 04 needs for its planned de-duplication swap onto the shared `e2e/helpers/tax.ts` module — a pure delete-local-definitions-and-import change with zero call-site edits.
- Plan 04 (e2e/unit fixture hardening, owns `requirements: [TAX-02, TAX-03, TAX-04, TAX-05]`) can proceed; it should also close out `TAX-02` in REQUIREMENTS.md, which this plan intentionally left untouched (not in this plan's own `requirements` frontmatter).

## Self-Check: PASSED

All modified files confirmed present on disk with the expected changes (`grep -c "decomposeTax("` == 1 in both edge functions, `grep -c "const total = subtotal;"` == 0 in both, `grep -c "function getTaxRatePercent"` == 0 in the e2e spec); all three commit hashes (`83cb6b2`, `24e112b`, `45fd404`) confirmed in `git log`; both full Playwright specs (`e2e/tabs/reopen-closed-ticket.spec.ts`, `e2e/payments/split-payment.spec.ts`) pass in full (8/8 tests) against the live local Supabase stack; `npx vitest run src/entities/payment/model/types.test.ts` and `src/shared/lib/__tests__/edge-tax.test.ts` pass.

---
*Phase: 24-tax-configuration-inclusive-exclusive-toggle*
*Completed: 2026-09-01*
