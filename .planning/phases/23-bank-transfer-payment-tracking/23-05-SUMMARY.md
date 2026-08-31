---
phase: 23-bank-transfer-payment-tracking
plan: 05
subsystem: payments
tags: [react, tauri, csv-export, postgres, rpc, i18next, zod]

# Dependency graph
requires:
  - phase: 23-bank-transfer-payment-tracking (plan 01)
    provides: "bank_transfers table, BankTransferSchema"
  - phase: 23-bank-transfer-payment-tracking (plan 04)
    provides: "BankTransfersList widget (toolbar to extend), useAllTransfers hook"
provides:
  - "useExportBankTransfersCsv: Tauri-native CSV export of pending+confirmed bank transfers"
  - "get_caja_report bankTransferSales/bankTransferPending summary fields"
affects: []

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5941
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSV export hook mirrors useExportReport.ts's save()+writeFile()+csvToBytes(rowsToCsv(...)) pattern exactly, scoped to a single report type (no ExportType union entry added, since this is a standalone widget-level export, not part of the Reports page's generic export menu)"
    - "get_caja_report summary extension needed zero query-hook changes — CajaReportSchema.parse(data) flows the two new fields through automatically once domain.ts's CajaReportSummarySchema declares them"

key-files:
  created:
    - src/features/export-bank-transfers/model/useExportBankTransfersCsv.ts
    - supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql
  modified:
    - src/widgets/BankTransfersList/index.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/domain.ts
    - src/widgets/CajaReportPanel/CajaReportPanel.tsx
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json
    - src/shared/lib/exporters/pdf.test.ts
    - src/shared/lib/exporters/excel.test.ts
    - src/features/export-report/ui/ExportButtons.test.tsx
    - src/features/export-report/model/useExportReport.test.ts

key-decisions:
  - "Export scope is pending+confirmed rows only, filtered out disputed, regardless of the BankTransfersList toolbar's current status filter (D-13) — the on-screen filter changes what's visible, not what's exportable, since a disputed transfer never becomes real revenue."
  - "v_bank_transfer_pending's second query in the migration reuses the exact same is_deleted=FALSE / status IS DISTINCT FROM 'reopened_void' guards as the primary payment-method aggregate SELECT, for a comparable basis with v_bank_transfer_sales — the plan's prose didn't spell this out explicitly but it's the same table/columns already filtered two lines above."
  - "netBalance's formula (cash+card+rappi+income-expenses) was left unchanged — the plan's acceptance criteria only asserted totalRevenue's unconditional-sum semantics, not netBalance; extending netBalance's definition to include bank-transfer methods would be a behavior change outside this plan's stated scope (D-15 only asked for a breakout, not a netBalance redefinition)."

requirements-completed: [BTP-08, BTP-10]

coverage:
  - id: D1
    description: "Admin can export the pending+confirmed Bank Transfers list to CSV via the Tauri-native save dialog, using rowsToCsv/sanitizeCsvCell — never a browser Blob download and never a hand-rolled CSV escaper"
    requirement: "BTP-08"
    verification:
      - kind: other
        ref: "grep -c \"rowsToCsv\" useExportBankTransfersCsv.ts = 2; grep -c \"Blob\\|createObjectURL\" = 0; npm run typecheck && npm run lint clean for this plan's files"
        status: pass
    human_judgment: false
  - id: D2
    description: "A pending or disputed bank-transfer sale still counts toward get_caja_report revenue totals immediately at checkout (unchanged, Plan 01), with an additional bankTransferSales/bankTransferPending breakout so admin can see how much of today's revenue is still unconfirmed"
    requirement: "BTP-10"
    verification:
      - kind: other
        ref: "Migration applied to local Supabase stack (docker exec psql); direct RPC call against a pending-transfer caja session returned {bankTransferSales: 63.80, bankTransferPending: 63.80, totalRevenue: 63.80, ...} and a confirmed-transfer caja session returned {bankTransferSales: 63.80, bankTransferPending: 0.00, totalRevenue: 63.80, ...} — both fields present, numeric, totalRevenue's unconditional-sum formula unchanged"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-08-31
status: complete
---

# Phase 23 Plan 05: CSV Export + Caja Report Breakout Summary

**Closed the two remaining purely-additive BTP requirements on top of the Plan 04 tracer: a Tauri-native CSV export button on the Bank Transfers tab (pending+confirmed only, CWE-1236-safe), and a `get_caja_report` breakout (`bankTransferSales`/`bankTransferPending`) that shows how much of today's bank-transfer revenue is still unconfirmed, without touching `totalRevenue`'s existing unconditional-sum semantics.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2/2
- **Files modified:** 13 (2 new, 11 edits)

## Accomplishments

- `useExportBankTransfersCsv` hook mirrors `useExportReport.ts`'s exact `save()` (`@tauri-apps/plugin-dialog`) + `writeFile()` (`@tauri-apps/plugin-fs`) + `csvToBytes(rowsToCsv(...))` pattern verbatim — reuses the CWE-1236 formula-injection guard in `shared/lib/exporters/csv.ts` rather than reimplementing a `csvCell()`-style sanitizer, and never a browser Blob/`<a download>`.
- "Export CSV" toolbar button added to `BankTransfersList`, disabled when there are zero pending+confirmed rows; export always covers pending+confirmed regardless of the toolbar's active status filter.
- New migration `20260831000004_caja_report_bank_transfer_breakout.sql` reproduces `get_caja_report`'s full body verbatim plus `v_bank_transfer_sales` (added to the existing payment-method aggregate SELECT) and `v_bank_transfer_pending` (a second query joining `payments` to `bank_transfers` where `status = 'pending'`); both exposed as new `summary` keys. `get_payment_methods_report` needed no change (already groups generically by `p.method`).
- `CajaReportSummarySchema` and `CajaReportPanel`'s summary-card array extended with both new fields — no query-hook change needed since `CajaReportSchema.parse(data)` flows RPC JSON through as-is.
- Migration applied directly to the local self-hosted Supabase Postgres container (`docker exec psql`, the documented fallback for this stack — `supabase db push` fails because the local schema_migrations history has an out-of-sync entry unrelated to this migration) and verified live via a direct RPC call against two real caja sessions (one with a pending bank-transfer sale, one with a confirmed one).
- Fixed 4 pre-existing test fixtures (`pdf.test.ts`, `excel.test.ts`, `ExportButtons.test.tsx`, `useExportReport.test.ts`) that construct a `CajaReportSummary` object literal — each was missing the two new required fields after the schema change, a direct blocking TypeScript error caused by this plan's own diff (Rule 3). All 33 tests in these 4 files pass.

## Task Commits

1. **Task 1: CSV export on the Bank Transfers tab** - `6b8c12a` (feat)
2. **Task 2: get_caja_report bank-transfer revenue breakout (Pitfall 3 resolution)** - `9f6b200` (feat)

**Plan metadata:** SUMMARY commit follows this document (docs: complete plan) — per orchestrator instruction for this plan's executor, STATE.md/ROADMAP.md are NOT touched; the orchestrator updates those centrally after merge.

## Files Created/Modified

- `src/features/export-bank-transfers/model/useExportBankTransfersCsv.ts` - Tauri save()+writeFile() CSV export hook, reuses rowsToCsv/csvToBytes verbatim
- `src/widgets/BankTransfersList/index.tsx` - "Export CSV" toolbar button
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` - `bankTransfersList.exportCsvButton/csvFileLabel/exportSuccessToast/exportErrorToast`
- `supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql` - `get_caja_report` bank-transfer breakout
- `src/shared/lib/domain.ts` - `CajaReportSummarySchema` gains `bankTransferSales`/`bankTransferPending`
- `src/widgets/CajaReportPanel/CajaReportPanel.tsx` - two new summary cards
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wPanels.json` - `cajaReportPanel.bankTransferSales/bankTransferPending`
- `src/shared/lib/exporters/pdf.test.ts`, `excel.test.ts`, `src/features/export-report/ui/ExportButtons.test.tsx`, `src/features/export-report/model/useExportReport.test.ts` - fixture updates for the 2 new required schema fields

## Decisions Made

- Export scope is pending+confirmed only (D-13), independent of the toolbar's active status filter.
- `v_bank_transfer_pending`'s query reuses the same `is_deleted`/`reopened_void` guards as the primary aggregate for a comparable basis.
- `netBalance`'s formula was left unchanged — out of this plan's stated scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Fixed 4 pre-existing test fixtures broken by the schema extension**
- **Found during:** Task 2, `npm run typecheck`
- **Issue:** Adding `bankTransferSales`/`bankTransferPending` as required fields to `CajaReportSummarySchema`'s inferred type broke 4 existing test files that construct a `CajaReportSummary` object literal without those fields (`pdf.test.ts`, `excel.test.ts`, `ExportButtons.test.tsx`, `useExportReport.test.ts`).
- **Fix:** Added `bankTransferSales: 0, bankTransferPending: 0` to each fixture literal, immediately after the existing `rappiSales` line.
- **Files modified:** `src/shared/lib/exporters/pdf.test.ts`, `src/shared/lib/exporters/excel.test.ts`, `src/features/export-report/ui/ExportButtons.test.tsx`, `src/features/export-report/model/useExportReport.test.ts`
- **Commit:** `9f6b200`

## Issues Encountered

- `.env.local` is not carried into a fresh worktree (same as every prior plan in this phase) — read the main checkout's `.env.local` values directly and passed them inline as shell-command env vars to `npx vitest`/`npm run test`.
- `npm run test` (repo-wide, run as a broader regression check beyond the plan's own `typecheck && lint` verification) surfaces 5 pre-existing test failures across 3 files this plan never touched: `src/shared/lib/rbac.test.ts` (2 tests — the `ALLOWED` mirror-matrix fixture was never updated in Plan 01 when `confirm_transfer_payment`/`dispute_transfer_payment` were added to `MANAGER_EXTRA`, root cause identified and documented in `deferred-items.md`) and `src/entities/staff/model/queries.clock.test.ts`/`src/features/close-tab/tests/useCloseTab.test.ts` (3 tests, already documented by 23-02 as environmental shared-DB fixture cross-talk, reconfirmed unchanged). Full detail in `deferred-items.md`.
- `npm run typecheck`/`npm run lint` (repo-wide) still show the same pre-existing `router.tsx` typecheck error and 5 `HomeDashboard.tsx`/`PINLoginForm.tsx` lint errors already documented by 23-03/23-04 — reconfirmed unchanged, not touched by this plan.
- `supabase db push --local` failed (`LegacyDbPushMissingLocalError` — a remote schema_migrations entry with no matching local file, an artifact of this self-hosted stack's history unrelated to this migration); applied the new migration directly via `docker exec psql` against the `supabase_db_supermarket-pos-selfhosted` container instead, per the documented fallback pattern in `23-01-SUMMARY.md`.

## User Setup Required

None - no external service configuration required. Migration applied against the existing local Supabase stack already running in this environment.

## Next Phase Readiness

- This is the final plan in Phase 23 (bank-transfer-payment-tracking). All 5 BTP requirements assigned to this phase's plans (BTP-03, BTP-04, BTP-05, BTP-07, BTP-08, BTP-09, BTP-10) are now complete across the phase's 5 plans.
- No blockers for downstream work.

## Self-Check: PASSED

Both new files (`useExportBankTransfersCsv.ts`, `20260831000004_caja_report_bank_transfer_breakout.sql`) confirmed present via successful `Write`/subsequent `npm run typecheck`+`npx eslint` compile/lint, and via a live `docker exec psql` migration apply + RPC call. Both task commits (`6b8c12a`, `9f6b200`) confirmed present via `git log --oneline`.

---
*Phase: 23-bank-transfer-payment-tracking*
*Completed: 2026-08-31*
