---
phase: 24-tax-configuration-inclusive-exclusive-toggle
verified: 2026-09-01T16:45:00Z
status: passed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 24: Tax Configuration (Inclusive/Exclusive Toggle) Verification Report

**Phase Goal:** Checkout and every server-side/receipt tax calculation are mode-aware — when
`taxInclusive` is on (the new default), tax is decomposed backward from already-inclusive catalog
prices instead of added on top, fixing the live overcharge bug; when off, today's additive math is
unchanged. Both `process_direct_sale_atomic` and all three payment-completing edge functions apply
the same formula as the client, and every receipt (thermal/PDF/email) shows a real decomposed
subtotal+tax+total.

**Verified:** 2026-09-01
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `BillingSettingsSchema.taxInclusive` exists, defaults `true` (D-01) | ✓ VERIFIED | `src/shared/lib/domain.ts:820` — `taxInclusive: z.boolean().default(true)` |
| 2 | Inclusive-mode direct-sale checkout charges exactly the catalog price sum; receipt shows decomposed subtotal/tax/total (TAX-02) | ✓ VERIFIED | `PaymentForm.tsx:287-301` mode-aware `useMemo`; `process_direct_sale_atomic` in live DB confirmed mode-aware (`v_tax_inclusive` present, `pg_proc` count=1); `e2e/checkout/tax-inclusive-mode.spec.ts` per 24-UAT.md live re-run 2026-09-01 |
| 3 | Exclusive-mode checkout keeps today's additive math unchanged at nonzero rate (TAX-03) | ✓ VERIFIED | `PaymentForm.tsx:296-297` unchanged branch; `src/shared/lib/__tests__/edge-tax.test.ts` (5/5 pass, live re-run this session) |
| 4 | `process_direct_sale_atomic` re-reads `settings.billing` server-side, mode-aware anti-tamper guard, exactly one function overload (TAX-04) | ✓ VERIFIED | Live DB query this session: `SELECT count(*) FROM pg_proc WHERE proname='process_direct_sale_atomic'` → 1; `prosrc ILIKE '%v_tax_inclusive%'` → true; migration `20260831000005` confirmed applied (`schema_migrations` row present) |
| 5 | `process-payment` and `process-split-payment` edge functions apply the same `decomposeTax` formula, not a re-derived one (TAX-04/05) | ✓ VERIFIED | `grep -n decomposeTax` both files → import + one call site each; both use shared `_shared/tax.ts` |
| 6 | Every receipt (thermal/PDF/email) shows a real decomposed subtotal+tax+total, not `subtotal===total` (TAX-05) | ✓ VERIFIED | `buildThermalReceiptText` (`receipt-format.ts:224-225`) renders `receipt.tax` line when `taxAmount != null`; `receipt-pdf.tsx` and `email-receipt.ts` both call `buildThermalReceiptText` directly (single shared renderer — no separate PDF/email tax logic needed) |
| 7 | Admin can toggle `taxInclusive` in Billing Settings, seeded from live data, persists on save (TAX-01) | ✓ VERIFIED | `BillingSettingsTab.tsx` — `taxInclusive` threaded through form type/`DEFAULT_FORM`/seed/save payload (lines 21,28,64,96); toggle JSX at 128-146 |
| 8 | Reprint path (`fetchReceiptDataForPayment`) shows the same decomposed tax as the original sale receipt — CR-01 fix genuinely applied, not just claimed | ✓ VERIFIED | `src/entities/payment/model/queries.ts:20,131,179-193` — imports `decomposeTax`, fetches `billing` settings row, populates `taxAmount`/`taxRatePercent`/`taxInclusive`; `receipt-reconstruction.integration.test.ts` — 4/4 pass, live re-run against local Supabase this session |
| 9 | Rappi payments show `$0` tax on the receipt, matching the `$0` shown on the payment screen — WR-01 fix genuinely applied | ✓ VERIFIED | `_shared/tax.ts:38-51` `decomposeTaxForMethod` rappi carve-out; both `process-payment/index.ts:319` and `process-split-payment/index.ts:341` call it (not the raw `decomposeTax`) |
| 10 | Toggling `taxInclusive` in Billing Settings requires confirmation before it silently reinterprets every catalog price store-wide — WR-03 fix genuinely applied | ✓ VERIFIED | `BillingSettingsTab.tsx:222-241` — `ConfirmDialog` gates save when `form.taxInclusive !== data.billing.taxInclusive` |
| 11 | No task in this phase retroactively rewrites historical `payments`/`tabs` rows | ✓ VERIFIED | `grep -i "UPDATE payments\|UPDATE tabs\|UPDATE orders"` on the migration file → no hits; migration is `CREATE OR REPLACE FUNCTION` only |
| 12 | No e2e spec anywhere hardcodes an additive-only/`*1.16` tax formula outside the shared helper | ✓ VERIFIED | `grep -rln "\* 1\.16\|function computeAuthoritativeTotal\|function getTaxRatePercent" e2e/ | grep -v e2e/helpers/tax.ts` — confirmed empty per 24-04-SUMMARY.md and file inspection of `e2e/helpers/tax.ts` |
| 13 | `npm run typecheck && npm run lint && npm run test` pass with zero errors | ✓ VERIFIED | Fresh live run this session: typecheck clean, lint clean (0 errors, pre-existing boundary-plugin config warning only), 1309/1309 unit tests pass |
| 14 | Requirements TAX-01..05 all traced and closed in REQUIREMENTS.md | ✓ VERIFIED | `.planning/REQUIREMENTS.md:221-225,331-335` — all 5 marked `[x]`/`Complete`, matching this phase's declared `requirements` frontmatter across all 4 plans |

**Score:** 14/14 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260831000005_tax_inclusive_mode.sql` | Mode-aware `process_direct_sale_atomic`, 17-arg signature preserved | ✓ VERIFIED | Applied to live DB, exactly 1 overload, `v_tax_inclusive` present in `prosrc` |
| `supabase/functions/_shared/tax.ts` | `decomposeTax`/`decomposeTaxForMethod` pure functions | ✓ VERIFIED | Both exported, zero imports, rappi carve-out present |
| `src/shared/lib/domain.ts` | `BillingSettingsSchema.taxInclusive` | ✓ VERIFIED | Line 820, `.default(true)` |
| `src/shared/lib/edge-function-contracts.ts` | `ReceiptDataSchema` +taxAmount/taxRatePercent/taxInclusive | ✓ VERIFIED (via passing schema-dependent tests) | Confirmed by `receipt-reconstruction.integration.test.ts` and `edge-tax.test.ts` passing |
| `e2e/checkout/tax-inclusive-mode.spec.ts` | Real E2E proof of inclusive-mode checkout | ✓ VERIFIED | Exists, referenced as passing in 24-UAT.md live re-run |
| `e2e/helpers/tax.ts` | Shared mode-aware e2e helper | ✓ VERIFIED | Exists; grep confirms no other file defines/hardcodes the old formula |
| `src/entities/payment/model/queries.ts` | `fetchReceiptDataForPayment` mode-aware (CR-01) | ✓ VERIFIED | Imports and calls `decomposeTax`, live integration test passes |
| `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` | Admin toggle + confirm dialog (TAX-01, WR-03) | ✓ VERIFIED | Toggle + `ConfirmDialog` both present and wired |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `PaymentForm.tsx` tax `useMemo` | `process_direct_sale_atomic`'s `v_tax`/`v_derived_total` | identical subtotal-first-then-subtract rounding discipline | ✓ WIRED | Client formula (lines 287-301) and live DB function body (`ROUND(v_subtotal / (1 + v_tax_rate/100.0), 2)` pattern) match; confirmed by 24-01-SUMMARY's cross-checked property test and this session's live DB introspection |
| `process-direct-sale/index.ts` `buildSaleReceipt` | `decomposeTax` (`_shared/tax.ts`) | settings.billing read + `decomposeTax` call | ✓ WIRED | `grep -n decomposeTax supabase/functions/process-direct-sale/index.ts` → import + 1 call site |
| `process-payment/index.ts` | `decomposeTaxForMethod` (`_shared/tax.ts`) | settings.billing read before constructing `receiptData` | ✓ WIRED | Confirmed via direct file read, line 319 |
| `process-split-payment/index.ts` | `decomposeTaxForMethod` (`_shared/tax.ts`) | settings.billing read once, outside per-leg map | ✓ WIRED | Confirmed via direct file read, line 341 |
| `src/entities/payment/model/queries.ts` (`fetchReceiptDataForPayment`) | `decomposeTax` (`_shared/tax.ts`) | cross-tree relative import (`../../../../supabase/functions/_shared/tax.ts`) | ✓ WIRED | Confirmed via direct file read, line 20; live integration test exercises this path and passes |
| `buildThermalReceiptText` | PDF export / email delivery | Both `receipt-pdf.tsx` and `email-receipt.ts` call `buildThermalReceiptText` directly | ✓ WIRED | Single shared renderer — TAX-05's "thermal/PDF/email" requirement is satisfied by one code path, not three separately-verified ones |

### Behavioral Spot-Checks / Live Re-Verification (this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration applied to live DB | `docker exec ... SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260831000005'` | 1 row returned | ✓ PASS |
| Exactly one RPC overload | `docker exec ... SELECT count(*) FROM pg_proc WHERE proname='process_direct_sale_atomic'` | `1` | ✓ PASS |
| RPC body is mode-aware | `docker exec ... SELECT prosrc ILIKE '%v_tax_inclusive%' FROM pg_proc ...` | `t` | ✓ PASS |
| Full unit suite | `npm run test` | 139 files / 1309 tests passed, 0 failed | ✓ PASS |
| Typecheck | `npm run typecheck` | clean | ✓ PASS |
| Lint | `npm run lint` | 0 errors (1 pre-existing config-level plugin warning, unrelated) | ✓ PASS |
| CR-01 reprint fix, live | `npx vitest run src/entities/payment/model/receipt-reconstruction.integration.test.ts` | 4/4 pass against local Supabase | ✓ PASS |
| edge-tax unit + property tests | `npx vitest run src/shared/lib/__tests__/edge-tax.test.ts` | 5/5 pass | ✓ PASS |
| Key tax-affected E2E specs, live | `npx playwright test e2e/checkout/tax-inclusive-mode.spec.ts e2e/tabs/reopen-closed-ticket.spec.ts e2e/payments/split-payment.spec.ts e2e/receipts/reprint.spec.ts` | 10 passed, 1 failed | ⚠️ see below |

**The one E2E failure** (`e2e/receipts/reprint.spec.ts` — "reprinting a split sale prints one receipt
with both tender legs") reproduces the exact `Cannot read properties of undefined (reading
'unregisterListener')` uncaught page error documented in `deferred-items.md` and scoped as a new
Phase 25 (`E2E Receipt Print-Mock Consolidation`, confirmed present in `ROADMAP.md`). `git log --
e2e/receipts/reprint.spec.ts` confirms this file was touched only once by Phase 24 (a `*1.16`
literal fix in `25ec052`, Plan 04) — never by CR-01's fix commits (`929406c`/`0334d35`, which touched
`queries.ts` and a separate integration test). The failure is a page-level Tauri mock teardown race
pre-existing since before Phase 24, not a tax-content assertion failure; CR-01's actual data-shape
fix is independently proven by the passing `receipt-reconstruction.integration.test.ts` above. This
matches Step 9b's deferral criteria (explicit, specific evidence in a later phase's roadmap entry)
and does not block this phase's goal.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TAX-01 | 24-01, 24-02 | Billing settings gains `taxInclusive` toggle | ✓ SATISFIED | Schema field + admin UI toggle both present and wired |
| TAX-02 | 24-01, 24-04 | Inclusive mode: total unchanged, tax decomposed backward | ✓ SATISFIED | Client + server formulas confirmed, E2E proof documented and referenced |
| TAX-03 | 24-01, 24-03, 24-04 | Exclusive mode: additive math unchanged | ✓ SATISFIED | Unit tests pass, e2e helper mode-aware |
| TAX-04 | 24-01, 24-03, 24-04 | RPC + all 3 edge functions mode-aware, anti-tamper guard correct | ✓ SATISFIED | DB introspection confirms 1 overload, mode-aware body; all 3 edge functions call shared `decomposeTax`/`decomposeTaxForMethod` |
| TAX-05 | 24-01, 24-03, 24-04 | Every receipt (thermal/PDF/email) shows decomposed subtotal+tax+total | ✓ SATISFIED | Single shared `buildThermalReceiptText` renderer covers all 3 surfaces; reprint path (CR-01) also fixed, closing the gap code review found |

No orphaned requirements — `.planning/REQUIREMENTS.md`'s Phase 24 mapping (lines 331-335) lists
exactly TAX-01 through TAX-05, all accounted for across the 4 plans' `requirements` frontmatter.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX` debt markers found in the phase's modified files. The one
known limitation (WR-02 — split-payment per-leg item-list vs. subtotal mismatch) is a **pre-existing**
quirk (documented as "D-09" in `process-split-payment/index.ts`'s own header comment, predating
Phase 24) that Phase 24's tax-decomposition change made more visible but did not introduce. It is
explicitly and reasonably documented in `deferred-items.md` with two concrete fix options, both of
which require a product/contract decision (scaling printed item lines, or adding a new `ReceiptData`
field) rather than a mechanical patch — not a cop-out avoiding real work, and not a TAX-05 blocker,
since TAX-05 only requires the subtotal+tax+total split to be real and decomposed (which it is); the
item-list-vs-total reconciliation was never a phase 24 must-have.

### Gaps Summary

None. All 5 requirement IDs (TAX-01 through TAX-05) are genuinely implemented and wired across every
layer the phase goal specifies: `PaymentForm.tsx` client preview, `process_direct_sale_atomic` (live
DB, mode-aware, single overload confirmed), `process-payment`/`process-split-payment` edge functions,
the reprint path (`fetchReceiptDataForPayment`, code-review-driven CR-01 fix), and the shared
`buildThermalReceiptText` renderer feeding thermal/PDF/email surfaces alike. The 3 code-review
findings from `24-REVIEW.md` (CR-01, WR-01, WR-03) were independently re-verified in this session's
codebase inspection, not merely trusted from `24-REVIEW-FIX.md`'s claims — all three fixes are
genuinely present in the current working tree. WR-02 remains a reasonably-documented, pre-existing,
non-blocking limitation. The single E2E failure observed live in this session
(`reprint.spec.ts`'s split-receipt test) is a confirmed pre-existing, unrelated Tauri-mock teardown
race, already scoped to a stubbed Phase 25 in `ROADMAP.md` — not a Phase 24 regression.

---

_Verified: 2026-09-01_
_Verifier: Claude (gsd-verifier)_
