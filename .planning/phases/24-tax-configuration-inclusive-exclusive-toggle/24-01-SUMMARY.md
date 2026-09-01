---
phase: 24-tax-configuration-inclusive-exclusive-toggle
plan: 01
subsystem: payments
tags: [zod, postgres, plpgsql, deno, supabase-edge-functions, react-query, i18n, playwright, fast-check]

# Dependency graph
requires: []
provides:
  - "BillingSettingsSchema.taxInclusive (default true, D-01) threaded through DEFAULT_BILLING"
  - "process_direct_sale_atomic mode-aware tax computation (17-arg signature preserved)"
  - "supabase/functions/_shared/tax.ts decomposeTax() shared helper, importable from Vitest"
  - "PaymentForm.tsx mode-aware checkout tax preview (taxAmount/subtotalWithTax useMemo)"
  - "ReceiptDataSchema taxAmount/taxRatePercent/taxInclusive optional fields"
  - "buildThermalReceiptText renders the new tax line (es-MX/en-US receipt.tax key)"
  - "process-direct-sale's buildSaleReceipt reads settings.billing and populates real subtotal/tax/total"
affects: [24-02, 24-03, 24-04]

# Actuals (#2632)
actuals:
  tokens: 9502
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode-aware tax decomposition: subtotal computed by division first, tax by subtraction (never independently re-derived) — applied identically in SQL, client TS, and the new Deno shared helper"
    - "Cross-edge-function shared code via supabase/functions/_shared/ (tax.ts mirrors the existing audit.ts import precedent)"
    - "Pure function imported directly from a Vitest src/ test despite living under supabase/functions/ (no bundler/test-runner scanning needed since it has zero imports itself)"

key-files:
  created:
    - supabase/migrations/20260831000005_tax_inclusive_mode.sql
    - supabase/functions/_shared/tax.ts
    - src/shared/lib/__tests__/edge-tax.test.ts
    - e2e/checkout/tax-inclusive-mode.spec.ts
    - .planning/phases/24-tax-configuration-inclusive-exclusive-toggle/deferred-items.md
  modified:
    - src/shared/lib/domain.ts
    - src/shared/lib/billing-settings.test.ts
    - src/entities/settings/model/queries.ts
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
    - supabase/functions/process-direct-sale/index.ts
    - src/shared/lib/edge-function-contracts.ts
    - src/shared/lib/receipt-format.ts
    - src/shared/lib/i18n/locales/es-MX/receipt.json
    - src/shared/lib/i18n/locales/en-US/receipt.json

key-decisions:
  - "Fixed a real zero-row COALESCE gap in the migration's v_tax_inclusive read (Rule 1) — added while verifying D-01's 'missing settings row defaults to true' requirement, since this local DB genuinely has no 'billing' settings row at all"
  - "PaymentForm.test.tsx's static useSettings mock converted to a vi.hoisted mutable object so per-test tax-mode overrides are possible without a full module remock; beforeEach resets it to the pre-existing degenerate default (taxRatePercent:0) so every prior test stays unaffected"
  - "Added data-testid='tax-row'/'total-row' to PaymentForm.tsx's totals section (minimal test-support addition) since MoneyDisplay's aria-label alone wasn't a reliable/unambiguous query target for the new tax-mode assertions"
  - "Corrected a self-contradictory decomposeTax(100, 16, false) test case from the plan's <behavior> text (it specified total:116 for a chargedAmount of 100, which contradicts the action section's own total:=chargedAmount formula) — used decomposeTax(116, 16, false) instead, which is internally consistent with the actual implementation and RESEARCH.md's Pattern 2"

patterns-established:
  - "vi.hoisted mutable settings mock pattern for per-test settings overrides in PaymentForm.test.tsx — reusable by Plan 02/03 if they need further settings-dependent test cases in this file"

requirements-completed: [TAX-01, TAX-02, TAX-03, TAX-04, TAX-05]

coverage:
  - id: D1
    description: "BillingSettingsSchema gains taxInclusive boolean, defaults true (D-01), threaded through DEFAULT_BILLING"
    requirement: "TAX-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/billing-settings.test.ts#BillingSettingsSchema taxInclusive"
        status: pass
    human_judgment: false
  - id: D2
    description: "Inclusive mode: PaymentForm.tsx checkout preview keeps total unchanged, decomposes tax backward"
    requirement: "TAX-02"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx#PaymentForm — tax modes (Phase 24) > inclusive mode"
        status: pass
      - kind: e2e
        ref: "e2e/checkout/tax-inclusive-mode.spec.ts#inclusive-mode checkout charges exactly the catalog price"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exclusive mode: PaymentForm.tsx keeps today's additive math unchanged at a nonzero rate"
    requirement: "TAX-03"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx#PaymentForm — tax modes (Phase 24) > exclusive mode"
        status: pass
    human_judgment: false
  - id: D4
    description: "process_direct_sale_atomic recomputes tax mode-aware server-side; anti-tamper guard accepts inclusive-mode totals equal to the catalog sum; exactly one function overload exists post-migration"
    requirement: "TAX-04"
    verification:
      - kind: e2e
        ref: "e2e/checkout/tax-inclusive-mode.spec.ts#inclusive-mode checkout charges exactly the catalog price"
        status: pass
      - kind: other
        ref: "SELECT count(*) FROM pg_proc WHERE proname = 'process_direct_sale_atomic' -> 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "process-direct-sale's receipts carry real decomposed subtotal/taxAmount/total (not subtotal===total); buildThermalReceiptText prints the tax line in both locales"
    requirement: "TAX-05"
    verification:
      - kind: e2e
        ref: "e2e/checkout/tax-inclusive-mode.spec.ts#inclusive-mode checkout charges exactly the catalog price"
        status: pass
      - kind: unit
        ref: "src/shared/lib/__tests__/edge-tax.test.ts#decomposeTax"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-09-01
status: complete
---

# Phase 24 Plan 01: Mode-Aware Tax Core + Direct-Sale Receipt Fix Summary

**Mode-aware `taxInclusive` toggle wired end-to-end for the direct-sale checkout: `BillingSettingsSchema`, `PaymentForm.tsx`'s client preview, `process_direct_sale_atomic`'s server-side anti-tamper RPC, and `process-direct-sale`'s receipt now all agree on the same subtotal/tax/total split, proven by a real Playwright checkout against the migrated local DB.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-01
- **Tasks:** 2 (Task 1 RED, Task 2 [BLOCKING] GREEN)
- **Files modified:** 14 (10 modified, 4 created) + 1 deferred-items log

## Accomplishments
- `BillingSettingsSchema`/`DEFAULT_BILLING` gain `taxInclusive: boolean` (default `true`, D-01)
- `PaymentForm.tsx`'s checkout-time tax preview branches on `taxInclusive`, both modes fully implemented (D-04) — inclusive decomposes backward (subtotal-first, tax-by-subtraction), exclusive is the unchanged additive math
- `process_direct_sale_atomic` replaced via `CREATE OR REPLACE FUNCTION`, exact current 17-arg signature preserved (Pitfall 1 avoided — confirmed exactly one overload in `pg_proc`), mode-aware tax section, applied to the live local Supabase DB
- New `supabase/functions/_shared/tax.ts` (`decomposeTax`) shared by `process-direct-sale`'s `buildSaleReceipt` (process-payment/process-split-payment fixed in Plan 03)
- `ReceiptDataSchema` gains `taxAmount`/`taxRatePercent`/`taxInclusive` (optional, `exactOptionalPropertyTypes`-safe); `buildThermalReceiptText` renders the new line between subtotal and total in both es-MX/en-US
- New `e2e/checkout/tax-inclusive-mode.spec.ts`: authored RED (failed with a 409 `AMOUNT_MISMATCH` against the pre-migration additive-only RPC — confirmed the correct RED reason), now GREEN against the migrated RPC
- New `src/shared/lib/__tests__/edge-tax.test.ts`: unit + fast-check property test proving `subtotal + taxAmount === total` to the cent across the full rate/mode space (RESEARCH.md Open Question 2)
- Found and fixed a genuine zero-row `COALESCE` gap in the migration (D-01's "old settings row defaults to true" requirement) — see Deviations

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the mode-aware tax core + one receipt path + failing E2E proof (RED)** - `e11e59e` (test)
2. **Task 2 [BLOCKING]: Push the migration, regenerate types, drive to GREEN** - `f86fd65` (fix)

_Note: TDD plan — Task 1 is the RED commit (new tests exist and correctly fail/pass per their pre-migration expectations), Task 2 is the GREEN commit (migration applied, all tests pass)._

## Files Created/Modified
- `supabase/migrations/20260831000005_tax_inclusive_mode.sql` - `CREATE OR REPLACE FUNCTION public.process_direct_sale_atomic` with mode-aware tax section, applied to the live local DB
- `supabase/functions/_shared/tax.ts` - `decomposeTax(chargedAmount, taxRatePercent, taxInclusive)` pure function
- `src/shared/lib/__tests__/edge-tax.test.ts` - unit + property tests for `decomposeTax`
- `e2e/checkout/tax-inclusive-mode.spec.ts` - real Playwright checkout proving TAX-02 end-to-end
- `.planning/phases/24-tax-configuration-inclusive-exclusive-toggle/deferred-items.md` - logs 3 pre-existing, unrelated `npm run test` failures found during verification
- `src/shared/lib/domain.ts` - `BillingSettingsSchema.taxInclusive: z.boolean().default(true)`
- `src/shared/lib/billing-settings.test.ts` - new `taxInclusive` schema tests
- `src/entities/settings/model/queries.ts` - `DEFAULT_BILLING.taxInclusive: true`
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - mode-aware `taxAmount`/`subtotalWithTax` useMemo, `data-testid` additions for test targeting
- `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` - mutable settings mock + new "tax modes" describe block (concrete + property tests)
- `supabase/functions/process-direct-sale/index.ts` - `buildSaleReceipt` now reads `settings.billing` and calls `decomposeTax`
- `src/shared/lib/edge-function-contracts.ts` - `ReceiptDataSchema` optional tax fields
- `src/shared/lib/receipt-format.ts` - new tax line in `buildThermalReceiptText`
- `src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json` - `receipt.tax` key

## Decisions Made
- Followed RESEARCH.md's correction that only one live `process_direct_sale_atomic` exists (not two) — wrote the mode-aware formula once, in the current `20260831000003`-sourced body
- `receipt.tax` label wording left to discretion per CONTEXT.md: "Impuesto" (es-MX) / "Tax" (en-US), matching the plain register of neighboring `subtotal`/`total` keys (RESEARCH.md Assumption A1)
- Added `data-testid="tax-row"`/`"total-row"` to `PaymentForm.tsx` as minimal test-support scaffolding — not previously present, needed for unambiguous DOM queries in the new mode tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration's `v_tax_inclusive` silently defaulted to exclusive mode when no `settings` row exists at all**
- **Found during:** Task 2 (verifying D-01's "old settings row still resolves to true" acceptance criterion against the live local DB, which genuinely has zero `billing` rows)
- **Issue:** `SELECT COALESCE(...) INTO v_tax_rate, v_tax_inclusive FROM settings WHERE key = 'billing'` leaves both variables `NULL` when the query returns zero rows (Postgres semantics: `SELECT INTO` with no matching rows assigns `NULL` regardless of any inline `COALESCE`, since the `COALESCE` never runs against a returned row). The pre-existing `v_tax_rate := COALESCE(v_tax_rate, 16);` line already guarded against this for the rate, but no equivalent line existed for `v_tax_inclusive` — so `IF v_tax_inclusive THEN` would evaluate `IF NULL THEN` (false in PL/pgSQL), silently falling through to the exclusive/additive branch. This directly violated D-01/T-24 threat register's explicit requirement that a missing settings row must default to `true`.
- **Fix:** Added `v_tax_inclusive := COALESCE(v_tax_inclusive, true);` immediately after the existing `v_tax_rate` fallback line.
- **Files modified:** `supabase/migrations/20260831000005_tax_inclusive_mode.sql`
- **Verification:** Re-applied to the live DB (`CREATE OR REPLACE FUNCTION`, confirmed exactly one `pg_proc` overload); `e2e/checkout/tax-inclusive-mode.spec.ts` passes against the actual zero-row local `settings` table, exercising this exact path.
- **Committed in:** `f86fd65`

**2. [Rule 1 - Bug] Plan's `<behavior>` test case for `decomposeTax` was self-contradictory**
- **Found during:** Task 1 (writing `edge-tax.test.ts`)
- **Issue:** PLAN.md's `<behavior>` block specified `decomposeTax(100, 16, false)` returns `{ subtotal: 100, taxAmount: 16, total: 116 }` — but the same plan's `<action>` section (and RESEARCH.md's Pattern 2/PATTERNS.md's worked example) both define `total: chargedAmount` for the exclusive branch too, meaning the correct result for `decomposeTax(100, 16, false)` is `{ subtotal: 86.21, taxAmount: 13.79, total: 100 }`, not the stated values.
- **Fix:** Used `decomposeTax(116, 16, false)` instead — internally consistent with the actual `_shared/tax.ts` implementation (at `chargedAmount=116`, `rate=16`, both the inclusive and exclusive decomposition formulas independently agree on the same 100/16 split), and still demonstrates the exclusive branch's correctness.
- **Files modified:** `src/shared/lib/__tests__/edge-tax.test.ts`
- **Verification:** Test passes against the actual `decomposeTax` implementation; the property-based test in the same file independently proves the `subtotal + taxAmount === total` invariant across the full rate/mode space, so this single concrete case is not the only correctness proof.
- **Committed in:** `e11e59e`

---

**Total deviations:** 2 auto-fixed (2 bugs — Rule 1)
**Impact on plan:** Both fixes were necessary for correctness (one a real production-facing default-mode bug, one a test-authoring error) and directly within this plan's scope. No scope creep.

## Issues Encountered

**3 pre-existing, unrelated `npm run test` failures found during Task 2's full-suite verification** (`src/entities/staff/model/queries.clock.test.ts`, `src/features/close-tab/tests/useCloseTab.test.ts`) — root-caused via a direct `signInWithPassword` probe to auth credential drift on the seeded `alex@barpos.dev` account on this local Supabase stack (`Invalid login credentials`), confirmed to predate this plan (the local DB also already had an unapplied `20260831000004` migration and a stray `concurrent_agent_placeholder` schema_migrations row before this plan's Task 2 ran). Not fixed per the scope-boundary rule — logged to `deferred-items.md`. This plan's own verification surface (`edge-tax.test.ts`, `billing-settings.test.ts`, `PaymentForm.test.tsx`, `e2e/checkout/tax-inclusive-mode.spec.ts`) is fully green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `_shared/tax.ts`, the live mode-aware RPC, and `BillingSettingsSchema.taxInclusive` are all correct, merged, and proven end-to-end — Plans 02 (admin UI toggle), 03 (the other two edge functions), and 04 (e2e/unit fixture hardening) can now build on this proven core.
- Blocker to flag for whoever plans/executes Plan 04 or a future ops pass: the `alex@barpos.dev` local auth credential drift documented in `deferred-items.md` will keep failing `queries.clock.test.ts`/`useCloseTab.test.ts` until reset — unrelated to Phase 24 but will show up in any future full-suite run on this same local DB.

## Self-Check: PASSED

All files created/modified confirmed present on disk; both task commit hashes (`e11e59e`, `f86fd65`) confirmed in `git log`.

---
*Phase: 24-tax-configuration-inclusive-exclusive-toggle*
*Completed: 2026-09-01*
