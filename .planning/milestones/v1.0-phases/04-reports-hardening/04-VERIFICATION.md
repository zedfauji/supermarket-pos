---
phase: 04-reports-hardening
verified: 2026-08-17T00:24:00Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/15
  gaps_closed:
    - "e2e/07-reports.spec.ts's 6 UTC-based date computations replaced with a localDateStr() helper that byte-for-byte mirrors src/pages/reports/index.tsx's toDateStr() — the retained suite is now structurally timezone-independent, not just accidentally green."
    - "The Product Sales Margin column's verification:backstop layout truth (04-02) is now proven by an automated Playwright bounding-box assertion at both 1280x800 and 1024x700, covering both the populated-margin and unknown-cost '—' rendering branches."
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 4: Reports & Hardening Verification Report

**Phase Goal:** The store can close out a day's business — reconcile cash and review sales performance — using a report set trimmed to what a supermarket needs, with the whole system verified to survive a realistic full day of checkout, receiving, and caja-close activity.
**Verified:** 2026-08-17T00:24:00Z
**Status:** passed
**Re-verification:** Yes — after 04-06 gap closure (timezone-proof date assertions + Margin column layout backstop)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | REP-01: close a caja and reconcile cash | ✓ VERIFIED | Regression: `git log` shows `supabase/migrations/20260818000005_close_caja_session_authoritative_closed_by.sql` and `e2e/55-full-day-soak.spec.ts` last touched by 04-04 commits (`034a49e`, `9144c47`, `b715286`); 04-06 touched only `e2e/07-reports.spec.ts` plus planning docs (`git diff --stat 81079f9..4f46d0a`). No regression possible. |
| 2 | Caja close is attributed to the authenticated closer | ✓ VERIFIED | Same regression evidence as #1 — migration untouched since 04-04. |
| 3 | REP-02: Daily, Product Sales, Hourly, and Payment Methods reports are available | ✓ VERIFIED | `src/pages/reports/index.tsx` still composes the four panels; 04-06 made no production code changes (test-only plan, confirmed by diff stat). |
| 4 | No bar/pool-specific report tabs are visible | ✓ VERIFIED | Unchanged since prior verification; no production files touched by 04-06. |
| 5 | Modifier Popularity is removed from the database | ✓ VERIFIED | `supabase/migrations/20260818000001_drop_modifier_popularity_report_rpc.sql` untouched by 04-06 (regression). |
| 6 | The retained e2e/07-reports.spec.ts suite passes green end-to-end, independent of time of day | ✓ VERIFIED | Independently re-ran `npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0` myself, twice, not trusting the SUMMARY's 27/27 claim: both runs → **27 passed, 0 failed**. Critically, this verification session ran at local 2026-08-16 18:23 CST while UTC was already 2026-08-17 00:23 — the exact UTC-vs-local mismatch window that caused the original 6 failures in the prior verification — and the suite still passed clean, directly proving the fix holds under the same conditions that broke it before. |
| 7 | Direct sale snapshots inventory cost server-side | ✓ VERIFIED | `process_direct_sale_atomic` migration unchanged (regression). |
| 8 | Product Sales margin uses correct historical cost, including weighted products | ✓ VERIFIED | Unchanged since 04-05 (regression) — `src/entities/tab/model/queries-reports.ts`'s `weightFactor` fix untouched by 04-06. |
| 9 | Unknown historical cost is excluded and rendered as accessible "—" | ✓ VERIFIED | `ProductSalesPanel.tsx` lines 76-86: `margin === null` renders `aria-label={t('productSalesPanel.marginUnavailableAriaLabel')}` — confirmed against `wAdmin.json` line 107 ("Margin unavailable — no recorded cost for this period"), and now also directly exercised by 04-06's new Playwright test (see #15). |
| 10 | Known-cost margin uses existing monetary presentation and exports | ✓ VERIFIED | Unchanged since prior verification (regression) — `excel.ts`/`pdf.tsx` Margin column export untouched. |
| 11 | Staff Performance's revenue/void aggregation queries real order_items/orders columns | ✓ VERIFIED | Unchanged since 04-05 (regression) — `src/entities/staff/model/queries.ts` untouched by 04-06. |
| 12 | Full-day soak proves sale/receiving atomicity and close idempotency | ✓ VERIFIED | Regression: `e2e/55-full-day-soak.spec.ts` untouched since 04-04 (per #1's git log evidence). |
| 13 | Soak waits for receiving persistence before near-expiry evidence | ✓ VERIFIED | Same file, same regression evidence as #12. |
| 14 | Soak uses retrying authenticated navigation after product mutation | ✓ VERIFIED | Same file, same regression evidence as #12. |
| 15 | Margin column has no layout breakage at supported desktop/narrow viewports | ✓ VERIFIED | Was `PRESENT_BEHAVIOR_UNVERIFIED` in the prior report. 04-06 added `e2e/07-reports.spec.ts`'s "Product Sales: Margin column has no layout breakage at desktop and narrow viewports" test — inspected the actual diff (commit `4f46d0a`): it seeds one unknown-cost row (`seedOpenTab`'s Budweiser default) and one populated-margin row (`getServiceClient()` insert with `cost_price_snapshot` = 40% of `base_price`) on the same order, then at both 1280x800 and 1024x700 asserts all 6 columnheaders are visible, both Margin-cell rendering branches are present (aria-label vs. `$`-text), no adjacent columnheader bounding boxes overlap on x, and the header row doesn't overlap the first body row on y. Independently re-ran this single test in isolation (`--grep "Margin column has no layout breakage"`) — **1 passed** (10.9s). This is a genuine structural DOM assertion, not a stub — it reads real `boundingBox()` geometry from the rendered table. |

**Score:** 15/15 truths verified (0 present-behavior-unverified, 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `e2e/07-reports.spec.ts` | Timezone-proof date assertions (localDateStr helper) | ✓ VERIFIED | Inspected diff `b61dbf3`: `localDateStr(d)` added (getFullYear/getMonth+1 padded/getDate padded, hyphen-joined) — compared byte-for-byte against `src/pages/reports/index.tsx`'s `toDateStr` (lines 16-20): identical algorithm. All 6 sites (4 `today`, 2 `yesterdayStr`) converted; no site still uses `.toISOString().slice(0,10)`. |
| `e2e/07-reports.spec.ts` | Margin column layout backstop test (27th test) | ✓ VERIFIED | Inspected diff `4f46d0a`: new test present, 102 lines added, matches plan's must_haves exactly (both rendering branches, both viewport sizes, structural bounding-box checks). |
| `e2e/07-reports.spec.ts` | Passing retained report proof (27/27, time-of-day-independent) | ✓ VERIFIED | Independently re-ran twice myself; 27/27 both times, including once during the exact UTC/local mismatch window that broke the suite in the prior verification run. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `localDateStr()` in the test | `toDateStr()` in `src/pages/reports/index.tsx` | Identical local-calendar-date algorithm | ✓ WIRED | Confirmed byte-for-byte match by direct source comparison of both functions. |
| New layout test's two seeded `order_items` rows | `ProductSalesPanel`'s two Margin-cell branches (`MoneyDisplay` vs. aria-labelled "—") | `cost_price_snapshot` set vs. unset | ✓ WIRED | Test asserts both branches render (`marginAriaLabel` on Budweiser row, `$` text on the other row) before the layout geometry checks run — proven, not assumed. |
| Reports page | Retained report panels | `TabsContent` composition | ✓ WIRED | Unchanged, regression-verified; 04-06 made no production code changes. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| Margin layout test | `headerBoxes` / `firstBodyRowBox` | Real `boundingBox()` calls against the rendered `<table>` in a live browser page, not mocked/hardcoded coordinates | Yes — geometry is read from the actual DOM after real Supabase-seeded rows render | ✓ FLOWING |
| Product Sales | `costTotal`, `margin` (weighted lines) | Real `order_items.weight_grams` × `cost_price_snapshot` | Unchanged since 04-05, regression-confirmed | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full retained Reports E2E suite, run #1 | `npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0` | 27 passed, 0 failed (5.3m) | ✓ PASS |
| Full retained Reports E2E suite, run #2 (during the UTC/local mismatch window) | Same command, re-run independently | 27 passed, 0 failed | ✓ PASS |
| New layout test in isolation | `npx playwright test e2e/07-reports.spec.ts --grep "Margin column has no layout breakage" --retries=0` | 1 passed (10.9s) | ✓ PASS |
| Type safety | `npm run typecheck` | Passed, no errors | ✓ PASS |
| Debt markers | `grep -n -E "TBD|FIXME|XXX" e2e/07-reports.spec.ts` | No matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REP-01 | 04-03, 04-04 | Close and reconcile caja safely | ✓ SATISFIED | Unchanged since prior VERIFIED re-verification; regression-confirmed 04-06 touched neither the closing migration nor the soak spec. `.planning/REQUIREMENTS.md` line 37 still shows REP-01 as `[ ]`/"Pending" — this is stale documentation (last synced before REP-01's own 04-03/04-04 work landed), not a phase blocker; flagged as an info-level doc-sync issue only. |
| REP-02 | 04-01, 04-02, 04-04, 04-05, 04-06 | Required reports with bar/pool tabs removed, margin correct, retained suite green and time-of-day-independent | ✓ SATISFIED | All prior fixes hold, plus the retained suite is now proven green independent of time of day (verified live, during the exact mismatch window), and the Margin column's layout backstop truth is closed with a real Playwright DOM assertion. `.planning/REQUIREMENTS.md` line 38/87 already marks this `[x]`/"Complete", consistent with this finding. |

No orphaned requirements — REP-01 and REP-02 are the only IDs mapped to Phase 4 in REQUIREMENTS.md, and both are claimed across the 6 plans.

### Anti-Patterns Found

None in the files touched by 04-06. `git diff --stat 81079f9..4f46d0a -- supermarket-pos/` confirms only `e2e/07-reports.spec.ts` (production-adjacent scope) plus planning docs (`ROADMAP.md`, `STATE.md`, `04-05-SUMMARY.md`, `04-06-PLAN.md`) changed — no production `src/` files touched, matching the plan's explicit prohibition.

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (carried from prior report, unchanged, out of Phase 4 scope) `src/entities/caja/model/tip-distribution-rpc.integration.test.ts` | 331-528 | Authenticated `close_caja_session` calls pass `p_closed_by: null`; exercises `tip_distribution_entries`, dropped in Phase 1 | ⚠️ WARNING | Explicitly deferred in `deferred-items.md` (Phase-1-strip cleanup debt). `*.integration.test.ts` excluded from `npm run test`'s unit project — does not block CI. No action needed for Phase 4. |
| `e2e/07-reports.spec.ts` | new code, lines ~354-456 | `no-unnecessary-condition` ESLint findings (1 new instance, same root cause/rule as 30 pre-existing baseline instances in this file) | ℹ️ INFO | Documented in 04-06-SUMMARY.md's Deviations. `npm run lint` (the actual CI gate) scopes only `src/`, not `e2e/`, so this does not block the project's lint gate. Not a functional defect — a defensive null-check the type checker considers redundant given `getServiceClient()`'s loose typing. |

No `TBD`/`FIXME`/`XXX` markers found in `e2e/07-reports.spec.ts`.

### Human Verification Required

None. All 15 must-haves are verified by automated evidence; no backstop/human-verification items remain open (the one remaining backstop truth from the prior report, #15, is now closed with a Playwright DOM assertion per this project's CLAUDE.md testing policy).

### Gaps Summary

None. Both items from the prior `04-VERIFICATION.md` (gaps_found, 13/15) are closed:

1. **G-04-1 (timezone flakiness)** — `e2e/07-reports.spec.ts`'s 6 date computations now use `localDateStr()`, byte-for-byte matching the app's own `toDateStr()`. This isn't just "happened to pass" — I independently re-ran the full suite twice, and the second run landed exactly inside the local/UTC calendar-date mismatch window (local Aug 16 18:23 CST vs. UTC already Aug 17) that caused the original 6 failures, and it still passed 27/27. The fix is structurally correct, not incidentally lucky.
2. **G-04-2 (Margin column layout backstop)** — a new Playwright test with real `boundingBox()` geometry assertions proves both Margin-cell rendering branches (known-cost `MoneyDisplay`, unknown-cost aria-labelled "—") lay out without header/body clipping or overlap at both the default (1280x800) and minimum-supported (1024x700, per `src-tauri/tauri.conf.json`) viewports. I re-ran this test in isolation and it passed independently of the rest of the suite.

`04-06` made zero production code changes (`git diff --stat` confirms only `e2e/07-reports.spec.ts` plus planning docs changed), consistent with its stated prohibition and with the prior verification's diagnosis that both gaps were test-only defects, not production bugs.

**Phase goal is achieved.** REP-01 and REP-02 are both satisfied, the full-day soak evidence is unchanged and intact, and the retained Reports E2E suite is now a trustworthy, time-of-day-independent regression proof with no outstanding backstop or human-verification items. Phase 4 is ready to be marked complete.

---

_Verified: 2026-08-17T00:24:00Z_
_Verifier: Claude (gsd-verifier)_
