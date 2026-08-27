---
phase: 04-reports-hardening
plan: 06
subsystem: testing
tags: [playwright, e2e, reports, timezone, gap-closure, layout-assertion]
requires:
  - phase: 04-05
    provides: Weighted Product Sales margin fix, corrected Staff Performance query, retained e2e/07-reports.spec.ts suite green at 26/26 (at the moment it happened to run)
provides:
  - e2e/07-reports.spec.ts's 6 date-based assertions computed via a local-calendar-date helper (localDateStr) that byte-for-byte mirrors src/pages/reports/index.tsx's toDateStr, structurally eliminating the UTC-vs-local mismatch class of flake
  - An automated Playwright DOM/bounding-box assertion proving the Product Sales Margin column has no header/body clipping or overlap at both the default desktop viewport (1280x800) and the app's documented minimum supported window size (1024x700)
  - Retained e2e/07-reports.spec.ts suite grown from 26 to 27 passing tests, fully green
affects: [reports, e2e-testing, product-sales]
actuals:
  tokens: 2167
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "E2E date assertions must reproduce the app's own local-calendar-date algorithm (getFullYear/getMonth+1/getDate) rather than new Date().toISOString().slice(0,10) (UTC), so the test's notion of 'today'/'yesterday' can never disagree with the app's default regardless of host timezone or time of day."
    - "A `verification: backstop` (human/visual) layout truth is provable with a Playwright DOM assertion: capture each columnheader's boundingBox(), sort by x, and assert no adjacent pair's right edge exceeds the next header's left edge (plus a small rounding tolerance) — catching real CSS/flex regressions structurally instead of via a screenshot diff or human eyeball."
key-files:
  created: []
  modified:
    - e2e/07-reports.spec.ts
key-decisions:
  - "Added a module-level `localDateStr(d: Date): string` helper (placed after the existing `enterManagerPin` helper) and replaced all 6 UTC-based date-string computations with calls to it, keeping every downstream assertion and variable name unchanged — a pure date-computation swap, no other test behavior changed."
  - "The new Margin-column layout test seeds two order_items rows on one shared order: seedOpenTab's own Budweiser default (never sets cost_price_snapshot, so it renders the aria-labelled '—' unknown-cost placeholder) plus a second row inserted directly via getServiceClient() (mirroring seedCashPayment's existing local-insert pattern) with cost_price_snapshot set to 40% of the product's base_price, so both of ProductSalesPanel's Margin-cell rendering branches are proven side-by-side with the other five columns, not just one."
  - "Layout breakage is asserted via two structural bounding-box checks rather than a visual screenshot diff: no adjacent columnheader x-overlap (catches collapsed/overlapping headers), and no header-row/first-body-row y-overlap (catches sticky/absolute-position regressions) — both re-run at 1280x800 and again at 1024x700 after page.setViewportSize()."
  - "Split the single-line `if (pErr || !otherProduct) throw ...` combined-condition idiom used elsewhere in this file into two separate `if` checks for the new test's own Supabase read, since the combined form produced 2 new ESLint no-unnecessary-condition instances beyond baseline; the split form produces only 1 (the file's pre-existing getServiceClient()-typed .single() idiom triggers this same rule 30 times already, unrelated to this plan and out of scope to fix — see Deviations)."
requirements-completed: [REP-02]
coverage:
  - id: D1
    description: "e2e/07-reports.spec.ts's date-based assertions ('today'/'yesterday') use the same local-calendar-date algorithm as the app's own default, so they can never disagree with the app regardless of host timezone or time of day."
    requirement: REP-02
    verification:
      - kind: e2e
        ref: 'npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0'
        status: pass
    human_judgment: false
  - id: D2
    description: "A Playwright test proves the Product Sales Margin column renders without header/body clipping or overlap at both the app's default desktop viewport (1280x800) and its minimum supported window size (1024x700), covering both a populated-margin row and the accessible '—' unknown-cost placeholder row."
    requirement: REP-02
    verification:
      - kind: e2e
        ref: 'e2e/07-reports.spec.ts#Product Sales: Margin column has no layout breakage at desktop and narrow viewports'
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-08-16
status: complete
---

# Phase 4 Plan 6: Reports Hardening Gap Closure (Timezone + Margin Layout Backstop) Summary

Closed the final 2 items from 04-VERIFICATION.md's re-verification (13/15) with test-only changes to `e2e/07-reports.spec.ts`: rewrote all 6 UTC-based date computations to use a local-calendar-date helper that mirrors the app's own `toDateStr` exactly, and added a new Playwright bounding-box assertion proving the Product Sales Margin column lays out correctly at both a supported desktop and the app's minimum window size — converting 04-02-PLAN.md's unresolved `verification: backstop` truth into an automated check. The retained suite is now fully green at 27/27 (up from 26), with no production code touched.

## What Was Built

**Task 1 — Local-calendar-date helper, replacing 6 UTC-based date computations (Gap G-04-1).** Added `localDateStr(d: Date): string` as a module-level helper in `e2e/07-reports.spec.ts`, placed after the existing `enterManagerPin` helper. It reproduces `src/pages/reports/index.tsx`'s `toDateStr` algorithm exactly: `getFullYear()`, `getMonth() + 1` zero-padded, `getDate()` zero-padded, hyphen-joined — a local-calendar-date computation, not UTC/ISO. Replaced all 6 sites that previously computed `today`/`yesterdayStr` via `new Date().toISOString().slice(0, 10)` with calls to this helper, changing nothing else at each site (same variable names, same downstream assertions). Because both the app and the test now derive their date string from the identical local-calendar-date algorithm evaluated on the same machine, they structurally cannot disagree again — this removes the whole UTC-vs-local bug class by construction, not just the specific evening-hours offset 04-VERIFICATION.md happened to reproduce it in. Verified independently: `npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0` → **26 passed** (the file's full retained-suite count at that point, before Task 2 added a 27th test).

**Task 2 — Playwright layout backstop for the Product Sales Margin column (Gap G-04-2).** Added a new test, "Product Sales: Margin column has no layout breakage at desktop and narrow viewports", immediately after the existing "Product Sales: date range filter to far past shows empty state" test. It seeds two `order_items` rows sharing one tab/order: `seedOpenTab({ customerName: 'E2E-Margin-Layout', withItem: true, productName: 'Budweiser' })` for the unknown-cost row (seedOpenTab never sets `cost_price_snapshot`, so it renders `ProductSalesPanel`'s aria-labelled `—` placeholder), then a second `order_items` insert via `getServiceClient()` directly (mirroring the existing `seedCashPayment` local-insert pattern) on a different product with `cost_price_snapshot` set to 40% of its `base_price`, exercising the populated-margin `MoneyDisplay` branch. At both the default desktop viewport (1280x800, Playwright's configured default) and the narrow/minimum-supported viewport (1024x700, per `src-tauri/tauri.conf.json`'s `minWidth`/`minHeight`), the test asserts: all six columnheaders visible; the Budweiser row's 6th cell has the `marginUnavailableAriaLabel` aria-label and the other row's 6th cell contains `$`-formatted text; no adjacent columnheader bounding box overlaps on the x-axis (each header's right edge stays at or before the next header's left edge, ±2px tolerance); and the header row doesn't overlap the first body row on the y-axis. This structurally proves "no layout breakage" without a screenshot diff or human eyeball, satisfying this project's CLAUDE.md ban on human-verification terminal states.

**Combined verification.** After both tasks landed, `npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0` → **27 passed** (5.3m) — the 26 from Task 1 plus the new Task 2 test, confirming the suite grew as expected and remains fully green. `npm run typecheck` passed with no errors both times.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Split a combined null/error check to avoid introducing new ESLint errors beyond baseline**
- **Found during:** Task 2, after writing the new test's `getServiceClient()` product lookup
- **Issue:** Writing the lookup in this file's established combined-condition idiom (`if (pErr || !otherProduct) throw new Error(...${pErr?.message})`) — the same shape used 8 times elsewhere in this file — produced 2 new `@typescript-eslint/no-unnecessary-condition` instances beyond the 30-error baseline 04-05-SUMMARY.md documented (all in unrelated lines 40-180).
- **Fix:** Split into two separate `if` statements (`if (pErr) throw ...; if (!otherProduct) throw ...`), which reduces the new-error count to 1 (`no-unnecessary-condition` on the `!otherProduct` check) — this single instance is the same rule/root-cause as the file's 30 pre-existing baseline instances (an artifact of `getServiceClient()`'s ungenerified `SupabaseClient` return type making `.single()`'s null-safety checks appear "unnecessary" to the type checker even though they're the file's established defensive convention). Not further reducible without either abandoning the defensive check (a real robustness regression) or reworking `getServiceClient()`'s typing file-wide, which is out of this plan's scope (`e2e/07-reports.spec.ts`-only, prohibited from touching other files).
- **Files modified:** `e2e/07-reports.spec.ts`
- **Verification:** `npx eslint e2e/07-reports.spec.ts` — 31 total errors (30 pre-existing baseline + 1 new, same rule/pattern as the baseline; `npm run lint`'s actual CI gate scopes only `src/`, not `e2e/`, so this does not block the project's lint gate).
- **Committed in:** `4f46d0a` (Task 2 commit)

None of the other auto-fix rules (2, 3, 4) applied — no missing critical functionality, no other blocking issues, no architectural changes were needed. Both gaps were closed exactly as scoped: test-only changes to `e2e/07-reports.spec.ts`, no production code touched (per the plan's explicit prohibition).

## Verification

- `npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0` — **27 passed** (5.3m), up from 26/26 after Task 1 alone and 20/26 at the prior 04-VERIFICATION.md re-verification run.
- `npm run typecheck` — passed, no errors.
- `npx eslint e2e/07-reports.spec.ts` — 31 errors total (30 pre-existing baseline, unchanged in content/location from 04-05-SUMMARY.md's documented baseline; 1 new instance of the same pre-existing rule/pattern, see Deviations above). `npm run lint` (the project's actual CI gate) scopes only `src/`, so this file's lint state does not affect that gate.

## Known Stubs

None — no stubs introduced.

## Threat Flags

None — both threats in this plan's `<threat_model>` (T-04-11, T-04-12) were internal, test-only changes (one more `getServiceClient()` service-role seed insert of an already-established kind, and a pure date-computation correctness fix); no new attack surface, no production code touched.

## Self-Check: PASSED

- FOUND: `/mnt/ai/POS/supermarket-pos/e2e/07-reports.spec.ts`
- FOUND commit `b61dbf3` (Task 1)
- FOUND commit `4f46d0a` (Task 2)

## Next Phase Readiness

Both remaining items from 04-VERIFICATION.md's re-verification (score 13/15) are closed: the retained `e2e/07-reports.spec.ts` suite is now structurally timezone-independent and fully green (27/27), and the Product Sales Margin column's layout is proven correct by an automated Playwright assertion at both supported viewport sizes. No outstanding backstop/human-verification items remain for Phase 4 — REP-02 (trustworthy, fully-automated report verification) is achieved. Phase 4 is ready for re-verification / closure.

---
*Phase: 04-reports-hardening*
*Completed: 2026-08-16*
