---
phase: 19-store-local-durable-printing-service
plan: 04
subsystem: frontend
tags: [i18n, error-handling, print-broker, react]

requires:
  - phase: 19-store-local-durable-printing-service (plan 03)
    provides: printReceipt()/openCashDrawer()/printRawText()/testPrint() all returning Result<{jobId}>, common:printJobError.{brokerUnreachable,rejected,failed} i18n keys, HardwareSettingsTab's Plan-19-03 local mapErrorToCopyKey (this plan replaces it)
provides:
  - printJobErrorCopyKey(code) — single shared export in pos-printer.ts selecting the three locked printJobError.* copy keys for every UI-originated caller
  - Every one of the five print-call-site files (PaymentForm, CajaDashboard, ReceiptPreview, ReprintButton, HardwareSettingsTab) explicitly branching on the broker-submission Result, never discarding it
  - No-toast-on-success behavior applied uniformly across all five callers
affects: [19-05, 19-06]

actuals:
  tokens: 26000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "printJobErrorCopyKey(code: AppErrorCode) -> i18n key string (not translated text) — callers pass the key through their own t(); single source of truth replacing four independent ad-hoc mappings."
    - "vi.mock('@shared/lib/pos-printer', async importOriginal => ({ ...await importOriginal(), fnUnderTest: vi.fn() })) — partial-mock pattern used across all touched test files so printJobErrorCopyKey stays the real implementation instead of needing a duplicate mock definition per file."

key-files:
  created:
    - src/features/reprint-receipt/ui/ReprintButton.test.tsx
    - .planning/phases/19-store-local-durable-printing-service/deferred-items.md
  modified:
    - src/shared/lib/pos-printer.ts
    - src/shared/lib/pos-printer.test.ts
    - src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx
    - src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.test.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
    - src/widgets/PaymentModal/PaymentModal.test.tsx
    - src/widgets/CajaDashboard/CajaDashboard.tsx
    - src/widgets/CajaDashboard/CajaDashboard.test.tsx
    - src/features/process-payment/ui/ReceiptPreview.tsx
    - src/features/process-payment/ui/ReceiptPreview.test.tsx
    - src/features/reprint-receipt/ui/ReprintButton.tsx
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "Removed the pre-existing success toasts on HardwareSettingsTab's Test Print/Open Cash Drawer buttons and CajaDashboard's Print Summary button, even though Task 1's <action> text didn't explicitly call this out. The plan's must_haves.truths and UI-SPEC's Interaction Contract are unambiguous that the no-success-toast rule applies to 'all five callers ... not just the ones that already had this behavior' — HardwareSettingsTab and CajaDashboard were the only two of the five with a pre-existing success toast, so bringing them into compliance was required to satisfy the plan's own stated truths, not optional scope creep."
  - "Removed the now-fully-unused cajaDashboard.printFailed AND cajaDashboard.summaryPrinted i18n keys from both locale files. The plan's action text only named printFailed for removal (tied to dropping the {message} interpolation), but summaryPrinted became equally dead once the success toast was removed for the same must_haves reason above — leaving one dead key and removing its sibling would have been an inconsistent half-cleanup."
  - "Used a vi.mock(..., async importOriginal => ({...actual, fn: vi.fn()})) partial-mock pattern (already precedented elsewhere in this codebase, e.g. AuditLogTable.test.tsx) in every test file that imports printJobErrorCopyKey, instead of re-declaring the mapping logic inside each mock factory. Keeps the real shared implementation under test rather than a parallel hand-maintained copy that could drift from pos-printer.ts."
  - "Fixed PaymentModal.test.tsx (Rule 3 — blocking, not in this plan's files_modified list) whose whole-module pos-printer mock broke once PaymentForm.tsx started importing printJobErrorCopyKey — the module mock replaced pos-printer entirely with only printReceipt/openCashDrawer/testPrint keys, so calling the now-imported printJobErrorCopyKey threw, landing in PaymentForm's outer catch block and producing the generic 'Print or drawer failed unexpectedly.' toast instead of the expected translated copy. This is a direct, unavoidable consequence of Task 1's signature/import change (same class of fix as Plan 19-03's own deviation 2), not new scope."

requirements-completed: [PRN-04]

coverage:
  - id: D1
    description: "printJobErrorCopyKey(code) is exported from pos-printer.ts and is the single shared implementation choosing between the three locked common:printJobError.* keys for every one of the five callers (D-11)."
    requirement: PRN-04
    verification:
      - kind: unit
        ref: "src/shared/lib/pos-printer.test.ts#printJobErrorCopyKey (3 tests: brokerUnreachable, rejected, failed-fallback incl. PRINT_JOB_UNKNOWN and an unrelated code)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every one of the five print-call-site files explicitly branches on the broker-submission Result and never discards it — ReceiptPreview.tsx's bare void printReceipt(...).finally() silent-discard is closed, and ReprintButton.tsx's previously-unread Result is now inspected."
    requirement: PRN-04
    verification:
      - kind: unit
        ref: "src/features/process-payment/ui/ReceiptPreview.test.tsx (rejected-copy-on-failure + no-toast-on-success tests)"
        status: pass
      - kind: unit
        ref: "src/features/reprint-receipt/ui/ReprintButton.test.tsx (new file — failed-Result toast, no-toast-on-success, distinct data-fetch-failure fallback)"
        status: pass
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx (brokerUnreachable-copy-on-failure + no-toast-on-success tests)"
        status: pass
      - kind: unit
        ref: "src/widgets/CajaDashboard/CajaDashboard.test.tsx (rejected-copy-on-failure + no-toast-on-success tests)"
        status: pass
      - kind: unit
        ref: "src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.test.tsx (failed-fallback-copy test updated; no-silent-discard/no-success-toast test added)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A successful durable acceptance shows no toast on any of the five callers (no-success-toast rule, UI-SPEC Interaction Contract)."
    requirement: PRN-04
    verification:
      - kind: unit
        ref: "One 'no toast on success' test per caller across all five touched test files (see D2 refs) plus removal of the two pre-existing success toasts (HardwareSettingsTab, CajaDashboard)"
        status: pass
    human_judgment: false

duration: ~1h
completed: 2026-08-27
status: complete
---

# Phase 19 Plan 04: Print Result Handling Hardening Summary

**Every existing print call site (PaymentForm, CajaDashboard, ReceiptPreview, ReprintButton, HardwareSettingsTab) now explicitly branches on the broker-submission `Result` through one shared `printJobErrorCopyKey()` helper — ReceiptPreview's silent `.finally()` discard is closed, ReprintButton's previously-unread `Result` is now inspected, and every caller stays silent on a successful durable acceptance.**

## Performance

- **Duration:** ~1h
- **Tasks:** 3/3 completed
- **Files modified:** 15 (2 created, 13 modified)

## Accomplishments

- Added `printJobErrorCopyKey(code: AppErrorCode): string` to `pos-printer.ts` — the single shared source of truth mapping `PRINT_BROKER_UNREACHABLE`/`PRINT_JOB_REJECTED`/everything-else onto the three locked `common:printJobError.*` i18n keys. Returns the key, not translated text, so every caller passes it through its own `t()`.
- `HardwareSettingsTab.tsx`: deleted its Plan-19-03 local `mapErrorToCopyKey`, routed `runTestPrint`/`runOpenDrawer` through the shared helper, and removed both pre-existing success toasts (`testPrintSent`/`cashDrawerSent`) — the fallback for any non-print `AppErrorCode` changed from the raw `error.message` to the locked `failed` copy, unifying behavior with the other four callers.
- `PaymentForm.tsx`: `logHardwareFail` (used by both `handlePrimary` and `handleSplitPrimary`) now shows the translated failure-class toast instead of the raw broker error message; the structured `logger.warn` call still receives the raw message unchanged.
- `CajaDashboard.tsx`: Print Summary's failure toast now uses the shared helper instead of the raw message; removed the success toast and the now-fully-unused `cajaDashboard.printFailed`/`summaryPrinted` i18n keys from both locale files.
- `ReceiptPreview.tsx`: replaced the bare `void printReceipt(...).finally(() => setPrintBusy(false))` — this phase's one confirmed D-11 silent-discard violation — with an explicit `await`ed Result branch (`toast.error` on failure, no toast on success), `setPrintBusy(false)` still guaranteed via an outer `finally`.
- `ReprintButton.tsx`: `handleClick` now captures and branches on `printReceipt`'s returned Result — previously called but its return value was never read, a second, subtler silent-discard than the one the plan named up front. A broker rejection now shows the translated copy; the existing generic `reprintDataFailed` toast remains scoped to a genuine data-fetch failure only.
- New `src/features/reprint-receipt/ui/ReprintButton.test.tsx` (no test file existed for this component before this plan): covers the failed-print-Result toast, no-toast-on-success, and that a data-fetch failure still shows the distinct generic copy.
- Added one explicit "does not silently discard a failed print Result" / "no toast on success" test pair to every one of the five caller test files (added within Task 1/2's commits rather than a separate Task 3 commit — see Decisions).

## Task Commits

1. **Task 1: Shared printJobErrorCopyKey() helper; wire into HardwareSettingsTab/PaymentForm/CajaDashboard** — `ea06b58` (feat)
2. **Task 2: Fix ReceiptPreview's silent Result discard; harden ReprintButton's error mapping** — `a8c585c` (fix)
3. **Task 3: Per-caller Vitest coverage proving no silent discard** — satisfied within commits 1-2 (see Decisions); no separate commit, since every required test was already added alongside its corresponding production-code change.

**Plan metadata:** commit pending (this SUMMARY, worktree mode — orchestrator merges centrally; STATE.md/ROADMAP.md are NOT touched by this executor per orchestrator instruction)

## Files Created/Modified

- `src/shared/lib/pos-printer.ts` — new exported `printJobErrorCopyKey(code)`
- `src/shared/lib/pos-printer.test.ts` — 3 new tests for `printJobErrorCopyKey`
- `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` — local `mapErrorToCopyKey` deleted; routes through shared helper; success toasts removed
- `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.test.tsx` — fallback test updated to the translated `failed` copy; new no-discard/no-success-toast test
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` — `logHardwareFail` now takes an `AppErrorCode` and shows translated copy in both `handlePrimary`/`handleSplitPrimary`
- `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` — new brokerUnreachable-copy-on-failure + no-toast-on-success tests
- `src/widgets/PaymentModal/PaymentModal.test.tsx` — pos-printer mock switched to partial-mock (importOriginal) pattern; one pre-existing assertion updated to the translated `failed`-fallback copy (Rule 3)
- `src/widgets/CajaDashboard/CajaDashboard.tsx` — Print Summary routes through shared helper; success toast removed
- `src/widgets/CajaDashboard/CajaDashboard.test.tsx` — new rejected-copy-on-failure + no-toast-on-success tests
- `src/features/process-payment/ui/ReceiptPreview.tsx` — explicit Result branch replaces the bare `void ...finally()` discard
- `src/features/process-payment/ui/ReceiptPreview.test.tsx` — new rejected-copy-on-failure + no-toast-on-success tests
- `src/features/reprint-receipt/ui/ReprintButton.tsx` — `handleClick` now inspects `printReceipt`'s Result
- `src/features/reprint-receipt/ui/ReprintButton.test.tsx` — new file, 3 tests
- `src/shared/lib/i18n/locales/en-US/wPanels.json`, `src/shared/lib/i18n/locales/es-MX/wPanels.json` — removed unused `cajaDashboard.printFailed`/`summaryPrinted` keys
- `.planning/phases/19-store-local-durable-printing-service/deferred-items.md` — new file, logs one pre-existing out-of-scope test failure (see Issues Encountered)

## Decisions Made

See `key-decisions` in frontmatter (no-success-toast scope expansion to HardwareSettingsTab/CajaDashboard, sibling i18n-key cleanup, partial-mock test pattern, PaymentModal.test.tsx blocking fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality per plan's own must_haves] Removed pre-existing success toasts on HardwareSettingsTab and CajaDashboard**
- **Found during:** Task 1, reading the plan's `must_haves.truths` and UI-SPEC's Interaction Contract against the current code
- **Issue:** `HardwareSettingsTab.tsx`'s `runTestPrint`/`runOpenDrawer` and `CajaDashboard.tsx`'s `handlePrintSummary` each showed a `toast.success(...)` on a successful print job. The plan's frontmatter explicitly states the no-success-toast rule applies to "all five callers touched in this plan, not just the ones that already had this behavior" — Task 1's `<action>` text didn't spell out removing these two toasts, but leaving them in place would have left the plan's own stated truth unmet.
- **Fix:** Removed both success toasts; `PaymentForm.tsx`/`ReceiptPreview.tsx`/`ReprintButton.tsx` already had no success toast to begin with.
- **Files modified:** `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx`, `src/widgets/CajaDashboard/CajaDashboard.tsx`
- **Verification:** New "no toast on success" tests added to both files' test suites; full targeted suite passes.
- **Committed in:** `ea06b58` (Task 1 commit)

**2. [Rule 3 — blocking] Fixed PaymentModal.test.tsx's pos-printer module mock**
- **Found during:** Task 1, running the full `npm run test` suite after wiring `printJobErrorCopyKey` into `PaymentForm.tsx`
- **Issue:** `PaymentModal.test.tsx` (outside this plan's `files_modified` list) replaced the entire `@shared/lib/pos-printer` module with a mock exporting only `printReceipt`/`openCashDrawer`/`testPrint`. Once `PaymentForm.tsx` started importing `printJobErrorCopyKey` from the same module, calling it inside the mocked test environment threw (`printJobErrorCopyKey is not a function`), which was caught by `PaymentForm`'s outer catch block — producing the generic "Print or drawer failed unexpectedly." toast instead of the expected translated hardware-error copy, breaking one pre-existing test.
- **Fix:** Switched the mock to the `importOriginal`-based partial-mock pattern (matching every other test file touched in this plan) and updated the one affected assertion from the old raw-message expectation (`'Drawer failed'`) to the new translated `failed`-fallback copy (`TAURI_ERROR` has no dedicated locked key).
- **Files modified:** `src/widgets/PaymentModal/PaymentModal.test.tsx`
- **Verification:** `npm run test` — full suite green for this file; re-ran twice to confirm stability.
- **Committed in:** `ea06b58` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 must_haves-completeness fix, 1 Rule 3 blocking test fix).
**Impact on plan:** No scope creep beyond what the plan's own frontmatter required — both fixes are direct, necessary consequences of satisfying this plan's stated `must_haves.truths` and its own signature/import changes.

## Issues Encountered

- **Vitest global-setup requires a reachable Supabase instance** — same pre-existing project-wide constraint noted in Plan 19-03's summary. A local self-hosted Supabase stack was already running at `127.0.0.1:54321`; passed `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` inline on the `npx vitest run`/`npm run test` commands (no `.env.local` created or committed).
- **Pre-existing, unrelated test failures** — `src/features/open-product-peek-window/model/useProductPeekWindow.test.ts` (3 tests) fails both in the full suite and in isolation, confirmed unrelated to this plan (this worktree's `isTauri()` in `pos-printer.ts` is unmodified by Plan 19-04). Per this plan's parallel-execution brief, a separate non-GSD Claude Code session is independently fixing an `isTauri()` correctness bug directly in the main working tree (uncommitted); this worktree forked before that fix landed. Logged to `deferred-items.md` per the executor's scope-boundary rule rather than fixed here.

## Verification Results (this session)

- `npm run typecheck` — **PASS**, clean across the whole repo.
- `npm run lint` (full `src/`, `--max-warnings 0`) — **PASS**, clean (only the same pre-existing `boundaries` plugin informational warnings noted in prior phase summaries).
- `npx vitest run src/shared/lib/pos-printer.test.ts src/widgets/PaymentModal/ui/PaymentForm.test.tsx src/widgets/CajaDashboard/CajaDashboard.test.tsx src/features/process-payment/ui/ReceiptPreview.test.tsx src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.test.tsx src/features/reprint-receipt/ui/ReprintButton.test.tsx` — **PASS**: 83/83.
- `npm run test` (full suite) — **PASS**: 1225/1250 (7 skipped, 15 todo, 3 pre-existing unrelated failures in `useProductPeekWindow.test.ts` — see Issues Encountered); re-ran twice for stability, identical result both times.

## Must-Haves Compliance (plan frontmatter)

All 4 `must_haves.truths` and both `prohibitions`, checked explicitly:

**Truths:**
1. "Every one of the five print-call-site files ... explicitly branches on the submission Result and never discards it (D-11)." — **met**. `PaymentForm.tsx` (`logHardwareFail` branches on `code`), `CajaDashboard.tsx` (`if (!result.ok)`), `ReceiptPreview.tsx` (explicit `await`ed branch replacing the old `.finally()` discard), `ReprintButton.tsx` (`const printed = await printReceipt(...); if (!printed.ok)`), `HardwareSettingsTab.tsx` (`if (!result.ok)` in both `runTestPrint`/`runOpenDrawer`) — grep confirms no remaining bare `void printReceipt`/unread `printReceipt`/`printRawText`/`testPrint`/`openCashDrawer` call across all five files.
2. "ReceiptPreview.tsx's manual 'Print Receipt' button no longer discards printReceipt()'s Result via a bare .finally()." — **met**, closed in commit `a8c585c`.
3. "A successful durable acceptance shows no toast on any of the five callers." — **met**. Verified by one dedicated "no toast on success" test per caller (5 total) plus removal of the two pre-existing success toasts (HardwareSettingsTab, CajaDashboard) — see Deviation 1.
4. "All five callers select their toast copy from the same shared printJobErrorCopyKey(code) helper." — **met**. Every caller imports `printJobErrorCopyKey` from `@shared/lib/pos-printer`; grep confirms zero remaining independent error-to-copy-key mapping functions (HardwareSettingsTab's Plan-19-03 local copy deleted).

**Prohibitions:**
1. "MUST NOT show a toast on a successful durable acceptance ... this applies to all five callers." — **met**, see Truth 3.
2. "MUST NOT let a background/non-UI caller silently swallow a failed print Result via an unawaited or un-.catch()'d promise." — **met**. Every caller's print/drawer call is `await`ed and its Result explicitly branched on; `PaymentForm.tsx`'s post-payment print IIFE remains wrapped in `try/catch` (unchanged from before this plan) so an unexpected throw still surfaces via the existing generic `printOrDrawerFailed` toast, and the normal Result-based failure path now uses the translated copy instead of the raw message.

## Known Stubs

None — this plan's scope (hardening existing call sites) introduced no new stubs or placeholders. `common:printJobError.failed`'s wiring status is unchanged from Plan 19-03 (documented there); this plan is the first to actually reach it as a live default-case fallback (via `printJobErrorCopyKey`'s `default` branch), closing that prior "defined but unreachable" gap for every non-locked `AppErrorCode`.

## Next Phase Readiness

- All five UI-originated print call sites now share one Result-handling contract (`printJobErrorCopyKey` + explicit branch + no-success-toast), ready for Plan 19-05/19-06's status-badge/confirm-dialog work to layer on top without re-touching this error-toast logic.
- `deferred-items.md` created for this phase — future plans/sessions should check it before assuming a clean baseline test suite.

## Self-Check: PASSED

All files created/modified in this plan verified present on disk (`git status`/`git log` after each commit); both task commits (`ea06b58`, `a8c585c`) verified present in `git log --oneline -5`.
