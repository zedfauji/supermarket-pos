---
phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry
plan: 02
subsystem: inventory
tags: [postgres, zod, react, playwright, i18n, rbac]

requires:
  - phase: 14-01
    provides: "queries-analytics.ts sibling-file convention, InventoryAnalyticsPanel composer widget"
provides:
  - "'expired' as a live, DB-enforced, Zod-validated stock_movements/inventory-adjust reason"
  - "Required D-01 6-value reason picker on InventoryPagePanel's batch-adjust dialog (waste, expired, delivery, correction, manual_adjustment, physical_count)"
  - "Hardened e2e/10-inventory.spec.ts reason-picker coverage (T4/T5/T5b/T5c/T5d) reading real persisted stock_movements rows back via getLatestInventoryLog"
affects: [14-03, 14-04]

actuals:
  tokens: 4200
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Reason picker is a literal 6-value hardcoded <option> list in D-01's declared order, never derived from StockMovementReasonSchema.options (Pitfall 5) — StockMovementReasonSchema stays a superset carrying bar-pos-era dead values (prep_production, prep_consumption, combo_component, refund, void) that must never reach staff-facing UI"

key-files:
  created:
    - supabase/migrations/20260819000005_add_expired_reason.sql
  modified:
    - src/shared/lib/domain.ts
    - src/widgets/InventoryPagePanel.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - e2e/10-inventory.spec.ts

key-decisions:
  - "D-01 promote (not add-alongside): 'expired' was added to BOTH InventoryAdjustReasonSchema and StockMovementReasonSchema in the same commit as the DB migration, keeping one canonical accepted-values set instead of two diverging lists (Pitfall 4) — verified by a >=2-match grep gate and a clean npm run typecheck before commit."
  - "Reason categorization stays inside the existing ProtectedAction action=\"adjust_inventory\" (manager+) gate — no new RBAC action, no second loss-reason taxonomy, per the plan's prohibitions."

patterns-established:
  - "TDD-via-Playwright for UI-behavior tasks in this E2E-only-testing project: RED = hardened/new e2e assertions confirmed failing against the current UI, GREEN = UI implementation confirmed passing, committed as separate test(...)/feat(...) commits."

requirements-completed: [INVR-02, INVR-03]

coverage:
  - id: D1
    description: "'expired' is accepted by the live stock_movements_reason_check CHECK constraint on the local Supabase Docker instance (migration applied, not just authored) and by both InventoryAdjustReasonSchema and StockMovementReasonSchema"
    requirement: "INVR-02"
    verification:
      - kind: integration
        ref: "docker exec supabase-db psql -c \"INSERT INTO stock_movements (...) VALUES (..., 'expired', ...)\" — succeeded with no CHECK violation"
        status: pass
      - kind: unit
        ref: "src/entities/inventory/model/queries.test.ts (7/7 passing after domain.ts edit)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manager+ selects 'Expired' in the batch-adjust reason picker; the resulting stock_movements row persists reason='expired' and reads back correctly via useInventoryLog"
    requirement: "INVR-02"
    verification:
      - kind: e2e
        ref: "e2e/10-inventory.spec.ts#T5c: manager adjusts inventory with \"expired\" reason — persists and reads back back"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reason picker exposes exactly the 6 D-01 values in declared order (waste, expired, delivery, correction, manual_adjustment, physical_count) with zero bar-pos-era dead values leaking in"
    requirement: "INVR-03"
    verification:
      - kind: e2e
        ref: "e2e/10-inventory.spec.ts#T5b: reason picker exposes exactly 6 D-01 values, no bar-pos-era leaks"
        status: pass
    human_judgment: false
  - id: D4
    description: "Submitting the batch-adjust form without a reason is blocked client-side with the extended toast; the mutation is never invoked"
    requirement: "INVR-03"
    verification:
      - kind: e2e
        ref: "e2e/10-inventory.spec.ts#T5d: submitting the batch-adjust form without a reason is blocked client-side"
        status: pass
    human_judgment: false
  - id: D5
    description: "'delivery' and 'waste' reason selections persist through the batch-adjust dialog and read back correctly (regression coverage for the pre-existing reasons alongside the new picker)"
    requirement: "INVR-03"
    verification:
      - kind: e2e
        ref: "e2e/10-inventory.spec.ts#T4 (delivery), #T5 (waste)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-19
status: complete
---

# Phase 14 Plan 02: 'Expired' Reason + D-01 Reason Picker Summary

**'expired' is now a live, DB-enforced, Zod-validated stock_movements reason, and the existing batch-adjust dialog on `/inventory` requires staff to pick one of exactly 6 D-01 loss reasons (no more silent `manual_adjustment` default) — proven end-to-end by 5 Playwright tests reading real persisted rows back via `getLatestInventoryLog`.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-19T18:19:00Z (approx)
- **Completed:** 2026-08-19T18:47:56Z (last commit 12:47:56-06:00)
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- New migration `20260819000005_add_expired_reason.sql` extends the live `stock_movements_reason_check` CHECK constraint with `'expired'` — **applied directly to the running local Supabase Docker instance** (`docker exec -i supabase-db psql ... < migration.sql`, no pooler container present so the documented fallback path was used) and registered in `supabase_migrations.schema_migrations`, confirmed via a real INSERT against the live table (not just authored on disk).
- `domain.ts`: `'expired'` added to both `InventoryAdjustReasonSchema`/`InventoryAdjustReason` and `StockMovementReasonSchema`/`StockMovementReason` in the same edit (Pitfall 4 — a single-schema edit would silently break `useInventoryLog`'s render on the first real `expired` row).
- `InventoryPagePanel.tsx`: new `batchReason` state, required alongside product+delta in `handleBatchSubmit`'s guard; the hardcoded `InventoryAdjustReason.MANUAL_ADJUSTMENT` default is gone — the mutation now persists exactly what staff selected. New `FormField`-wrapped `<select>` with a "Select a reason" placeholder (no default selection) and exactly 6 hardcoded `<option>`s in D-01's declared order.
- Full `en-US`/`es-MX` copy for the new validation toast and reason-picker label/placeholder/options, matching UI-SPEC's locked Copywriting Contract.
- `e2e/10-inventory.spec.ts` hardened and extended: T4/T5 now assert real persisted `stock_movements` rows via `getLatestInventoryLog` instead of soft-checking a field that used to no-op; two new tests (T5b: exactly-6-options/no-dead-values regression guard, T5c: `'expired'` round-trip); one new validation test (T5d: empty-reason submission is blocked client-side).

## Task Commits

Each task was committed atomically (Task 2 is TDD — RED via hardened/new Playwright assertions, then GREEN implementation):

1. **Task 1: [BLOCKING] Add 'expired' reason — migration, apply, dual-enum domain.ts edit** — `bcd12df` (feat)
2. **Task 2: Reason picker UI (D-01) + validation + E2E hardening**
   - `e5c94db` (test) — RED: hardened T4/T5 + 3 new tests, confirmed failing against the current UI (no reason picker existed)
   - `150969c` (feat) — GREEN: reason picker UI + i18n + two pre-existing test bugs fixed (submit-button regex, missing product selection), confirmed all 7 active tests passing

## Files Created/Modified
- `supabase/migrations/20260819000005_add_expired_reason.sql` — new migration, DROP+ADD CONSTRAINT ... NOT VALID pattern
- `src/shared/lib/domain.ts` — `'expired'` in both `InventoryAdjustReasonSchema`/`StockMovementReasonSchema`
- `src/widgets/InventoryPagePanel.tsx` — `batchReason` state, required-reason guard, reason `<select>`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` — reason-picker + extended validation-toast copy
- `e2e/10-inventory.spec.ts` — T4/T5 hardened, T5b/T5c/T5d added

## Decisions Made
- D-01 enforced as a "promote" not "add-alongside": both Zod enums carry `'expired'` in one commit with the migration, so there's exactly one canonical accepted-values set, gated by a `grep` count check and a clean `npm run typecheck`.
- Reason categorization stays inside the existing `adjust_inventory` (manager+) RBAC gate — no new action, no second taxonomy, per the plan's prohibitions.
- TDD for this UI task was executed via Playwright (RED = failing e2e assertions against the current UI, GREEN = passing after implementation) rather than a component-level Vitest RED/GREEN cycle, consistent with this project's mandatory-automated-E2E testing policy (CLAUDE.md) and the absence of any pre-existing `InventoryPagePanel` unit test file to extend.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed submit-button regex that never matched the dialog's actual button text**
- **Found during:** Task 2 GREEN verification run
- **Issue:** `e2e/10-inventory.spec.ts`'s pre-existing T4/T5 tests clicked `dialog.getByRole('button', { name: /save|adjust|confirm/i })` to submit the batch-adjust dialog, but the actual button label is "Apply" (`inventoryPagePanel.apply`), which matches none of those three substrings — the click always timed out. This bug predates this plan (present in the file before any of this plan's edits) and was masked by the tests' prior soft-check/skip branches.
- **Fix:** Extended the regex to `/save|adjust|apply|confirm/i` across all 4 occurrences in the file.
- **Files modified:** e2e/10-inventory.spec.ts
- **Verification:** Full spec re-run confirmed the click now resolves.
- **Committed in:** `150969c` (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Fixed T4/T5/T5c never selecting a product in the dialog's own product `<select>`**
- **Found during:** Task 2 GREEN verification run (after fix #1)
- **Issue:** T4/T5's original code only asserted the product's name was visible in the underlying inventory table row, then opened the generic "Adjust" batch dialog (which has its own independent product `<select>`, defaulting to "Select…") — it never selected a product inside that dialog. With `batchProductId` empty, the client-side guard silently blocked every submission, so the mutation was never actually exercised end-to-end despite the tests appearing to "pass" via their old soft-check branches.
- **Fix:** Added `await dialog.getByLabel(/product/i).first().selectOption({ label: PRODUCT })` before filling delta/reason in T4, T5, and T5c.
- **Files modified:** e2e/10-inventory.spec.ts
- **Verification:** Full spec re-run — all 7 active tests pass, including real `getLatestInventoryLog` round-trip assertions.
- **Committed in:** `150969c` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — pre-existing bugs in the tests this plan was directed to harden, blocking the plan's own verification).
**Impact on plan:** Both fixes were required to make T4/T5's assertions real rather than silent no-ops, directly serving the plan's stated goal ("all proven by hardened E2E tests"). No scope creep — no other files touched.

## Issues Encountered
- No `supabase-pooler` container exists in this local Docker stack (only `supabase-db` and 6 others) — used the plan's documented fallback (`docker exec -i supabase-db psql ... < migration.sql` + manual `schema_migrations` INSERT) directly rather than attempting the pooler path first.
- The Task 1 acceptance-criteria verification INSERT (`... VALUES (..., -1, 'expired', ...)` against the Budweiser product, per the plan's exact acceptance-criteria command) left one real `stock_movements` audit row in the local dev DB. Confirmed harmless: `stock_movements` inserts have no trigger that mutates `inventory.quantity_on_hand`, so no report/reconciliation figures are affected; left in place as evidence the constraint accepts real writes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `'expired'` is now a fully wired, DB-enforced adjustment reason with real UI capture — 14-03 (Shrinkage/Waste + Expiry-Loss reports) can now aggregate real `waste`/`expired`-tagged `stock_movements` rows instead of having zero qualifying data.
- Pre-Phase-14 `stock_movements` rows remain tagged `manual_adjustment` as designed (D-02) — 14-03's "unclassified adjustments" bucket handles those, not a data migration here.
- No blockers.

## Known Stubs
None.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260819000005_add_expired_reason.sql
- FOUND: bcd12df (feat commit)
- FOUND: e5c94db (test commit)
- FOUND: 150969c (feat commit)

---
*Phase: 14-inventory-analytics-reports-valuation-shrinkage-waste-expiry*
*Completed: 2026-08-19*
