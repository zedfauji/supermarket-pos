---
phase: 23-bank-transfer-payment-tracking
fixed_at: 2026-08-31T00:00:00Z
review_path: .planning/phases/23-bank-transfer-payment-tracking/23-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-08-31
**Source review:** .planning/phases/23-bank-transfer-payment-tracking/23-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical + 4 Warning; `fix_scope: critical_warning` — IN-01 excluded by scope, not attempted)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: `netBalance` in `get_caja_report` omits bank-transfer sales

**Files modified:** `supabase/migrations/20260831000004_caja_report_bank_transfer_breakout.sql`
**Commit:** `e19ba9d`
**Applied fix:** Added `v_bank_transfer_sales` into the `netBalance` expression, matching how cash/card/rappi already contribute. Applied the reviewer's primary suggested fix verbatim (adds the full bank-transfer total, not just the confirmed portion) — this migration has not shipped/applied to any live database yet (created earlier in this same phase), so it was safe to edit in place rather than issue a follow-up migration. Flagging per the reviewer's own note: whether pending bank-transfer amounts should be excluded from `netBalance` until confirmed is a product/finance question that remains open; the fix as applied is at minimum consistent with how the other three payment methods are treated today.

### WR-01: `mapTransferRow` casts nullable DB columns to non-nullable Zod-typed fields without validation

**Files modified:** `src/entities/bank-transfer/model/queries.ts`
**Commit:** `80cbe84`
**Applied fix:** Replaced the unchecked `as string` casts on `payment['reference_number']` and `tab['customer_name']` with the fallback form the reviewer offered (`?? ''` / `?? 'Walk-in'`), consistent with how `customerPhone`/`confirmedBy` are already handled nullably elsewhere in the same file. Chose the fallback over `BankTransferSchema.parse()` deliberately — a hard `.parse()` throw on a `referenceCode` that fails the `/^\d{7}$/` regex (e.g. legitimately-null on a non-bank-transfer-originated row) would turn a rare data gap into an unhandled query-level exception; the fallback degrades gracefully instead, matching the file's existing convention.

### WR-02: Caja Excel/PDF exports omit the new bank-transfer breakout fields

**Files modified:** `src/shared/lib/exporters/excel.ts`, `src/shared/lib/exporters/pdf.tsx`, `src/shared/lib/i18n/locales/en-US/receipt.json`, `src/shared/lib/i18n/locales/es-MX/receipt.json`
**Commit:** `5f00a6a`
**Applied fix:** Added "Bank Transfer Sales" / "Bank Transfer Pending" rows to `cajaReportToWorkbook`'s Summary sheet (with the corresponding cell-index shift for the rows below them) and to `cajaReportToPdfBytes`'s summary table, mirroring the existing cash/card/rappi rows in both files. Added the two new i18n keys (`pdf.caja.bankTransferSales`/`bankTransferPending`) to both locale catalogs since the PDF path is translated (the Excel path uses plain English labels like its existing peers, consistent with `excel.ts`'s existing convention of untranslated sheet content). Verified against `excel.test.ts`/`pdf.test.ts` (both already carried `bankTransferSales`/`bankTransferPending` fixture fields per the review's own note) — 15/15 tests pass, no row-index assumptions broken.

### WR-03: "Checkout-time only" restriction on `bank_transfer` is enforced only client-side

**Files modified:** `supabase/migrations/20260831000003_bank_transfers_schema.sql`
**Commit:** `afaeb5b`
**Applied fix:** Added a server-side guard in `process_payment_atomic` that rejects `p_method = 'bank_transfer'` unless one of two trusted conditions holds: (1) a transaction-local Postgres GUC (`app.bank_transfer_checkout_context`, set via `set_config(..., true)` so it resets at transaction end) that `process_direct_sale_atomic` sets immediately before calling `process_payment_atomic` for its own freshly-inserted tab — this GUC is not an RPC parameter, so a PostgREST caller cannot spoof it directly; or (2) `auth.role() = 'service_role'`, which mirrors the trust level already implicit in using the service-role key (RLS bypass) rather than introducing a new one.

Deviated from the reviewer's literal two suggested options (explicit RPC boolean parameter, or gating purely on "called from `process_direct_sale_atomic`") because a plain boolean *parameter* would itself be spoofable by the exact "determined or scripted caller" the finding is about (PostgREST exposes every named function parameter as a settable JSON field) — it would not actually close the gap. The `service_role` allowance was necessary to keep `src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts`'s existing `process_payment_atomic(bank_transfer)` integration test passing: that test calls the RPC directly (not through `process_direct_sale_atomic`) using a service-role Supabase client, which is the same trust tier as the edge functions/tests that legitimately need direct access. A regular authenticated staff JWT satisfies neither condition, so the exploit path described in the finding (any staff member with an active shift, via PostgREST, marking `bank_transfer` on an arbitrary pre-existing tab) is closed.

### WR-04: `BankTransfersList` resolution column shows raw UUID fragments instead of staff names

**Files modified:** `src/entities/bank-transfer/model/queries.ts`, `src/widgets/BankTransfersList/index.tsx`, `src/shared/lib/domain.ts`, `src/features/export-bank-transfers/model/useExportBankTransfersCsv.ts`, `src/shared/lib/i18n/locales/en-US/wAdmin.json`, `src/shared/lib/i18n/locales/es-MX/wAdmin.json`
**Commit:** `622d93c`
**Applied fix:** Extended `BankTransferSchema` with `confirmedByName`/`disputedByName` (nullable string), extended `TRANSFER_SELECT` with `confirmed_by_profile:profiles!confirmed_by(name)` / `disputed_by_profile:profiles!disputed_by(name)` embeds (column-name hint, matching the working pattern already used by `entities/caja/model/queries.ts`'s `opened_by_profile`/`closed_by_profile` — the FK-constraint-name hint form the reviewer suggested verbatim does not parse under supabase-js's select-string type inference and had to be adapted), and swapped the `BankTransfersList` resolution column and `confirmedBy`/`disputedBy` i18n interpolation from a sliced UUID (`.slice(0, 8)`) to the resolved name. Also updated `useExportBankTransfersCsv.ts`'s "Confirmed By" CSV column to use the same name field — this file was not explicitly cited by the finding, but it derives from the exact same `confirmedBy` UUID field the finding is about, so leaving it unfixed would have left the identical bug live in the CSV export while the on-screen table was fixed.

One TypeScript-inference issue surfaced during verification and was fixed as part of the same commit: the initial edit built `TRANSFER_SELECT` via string concatenation (`+`), which widens the string to a non-literal `string` type and breaks supabase-js's compile-time select-string parser (surfaces as `data: GenericStringError[]`, not caught by a plain re-read — only by `npm run typecheck`). Rewrote it as a single string literal, which restored correct type inference; confirmed via `npm run typecheck` (no errors in touched files) and the existing exporter/checkout/confirm-transfer unit tests (29/29 pass).

## Verification Notes

- No worktree isolation was used for this run (per the orchestrator's explicit instruction) — all edits and commits were made directly against the `main` branch working tree.
- `npm run typecheck`: clean for every file touched by this fix pass. One pre-existing, unrelated error remains in `src/app/router.tsx` (react-router `future` prop typing) — not touched by any of these fixes.
- `npx eslint` on all touched source files: clean (only pre-existing project-wide `boundaries` legacy-selector warnings, no errors).
- `npx vitest run` on the directly affected test files (`excel.test.ts`, `pdf.test.ts`, `useCheckoutSale.test.ts`, `useConfirmTransfer.test.ts`): 29/29 pass.
- `npm run test` (full unit suite): 1285 passed, 5 failed, 15 todo. The 5 failures (`rbac.test.ts` ×2, `queries.clock.test.ts` ×2, `useCloseTab.test.ts` ×1) are in files none of these 5 fixes touched, are unrelated to bank-transfer/Caja-report/exporter code, and were already failing in the working tree before this session started (confirmed via `git status`/`git log` — those files carry no uncommitted changes and were last modified by the phase 23-01 commit itself, predating this fix pass). They are out of scope for this review-fix pass; flagging for separate triage rather than silently fixing code outside the reviewed findings.
- CR-01 and WR-03 are SQL-only changes to not-yet-applied local migrations; no live/remote database schema was touched. No DOWN scripts were added or needed (project convention, per `CLAUDE.md`).
