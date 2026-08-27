---
phase: 15-receipt-designer-layout-branding-logo-printing
plan: 03
subsystem: payments
tags: [receipts, tauri, printing, email, react-query, thermal-printer]

# Dependency graph
requires:
  - phase: 15-receipt-designer-layout-branding-logo-printing
    provides: "Plan 01's settings-aware buildThermalReceiptText signature; Plan 02's logoDataUrl/paperWidthChars print_receipt Tauri command args"
provides:
  - "Every production call site of buildThermalReceiptText/printReceipt/sendReceiptByEmail passes a real ReceiptSettings value"
  - "printReceipt's Tauri invoke sends logoDataUrl and paperWidthChars matching current ReceiptSettings"
affects: [15-04, receipt-preview, payment-modal, email-receipt-dialog]

# Actuals (#2632)
actuals:
  tokens: 5905
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "shared/lib functions (pos-printer.ts, email-receipt.ts) receive ReceiptSettings as an explicit parameter from their caller rather than reading TanStack Query cache directly, preserving FSD import direction"
    - "Component-level ReceiptSettingsSchema.parse({}) fallback covers only the useReceiptSettings() query's loading window; every field has a Zod .default() so the fallback is a fully valid ReceiptSettings, not a stub"

key-files:
  created: []
  modified:
    - src/shared/lib/pos-printer.ts
    - src/shared/lib/pos-printer.test.ts
    - src/shared/lib/email-receipt.ts
    - src/shared/lib/email-receipt.test.ts
    - src/features/process-payment/ui/ReceiptPreview.tsx
    - src/features/process-payment/ui/ReceiptPreview.test.tsx
    - src/features/process-payment/ui/EmailReceiptDialog.tsx
    - src/features/process-payment/ui/EmailReceiptDialog.test.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
    - src/widgets/PaymentModal/PaymentModal.test.tsx

key-decisions:
  - "Renamed PaymentForm's pre-existing useSettings() result from `settings` to `appSettings` to free the `settings` identifier for the new ReceiptSettings value, matching the plan's literal acceptance-criteria grep `printReceipt(receipt, settings)`"
  - "Fixed 2 printReceipt(receipt) assertions in PaymentModal.test.tsx that the plan assumed needed no change (printReceipt is mocked wholesale) but that failed once the real 2nd argument appeared in the mock's recorded call args"

patterns-established:
  - "Test fixture defaultReceiptSettings(overrides?) = ReceiptSettingsSchema.parse({...overrides}) — used in pos-printer.test.ts and email-receipt.test.ts as the standard way to construct a valid ReceiptSettings in shared/lib tests"

requirements-completed: [RCPD-01, RCPD-02]

coverage:
  - id: D1
    description: "receiptDataToPrinterLines/printReceiptWebFallback/printReceipt/sendReceiptByEmail in shared/lib require and forward a real ReceiptSettings parameter"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/pos-printer.test.ts#printReceipt"
        status: pass
      - kind: unit
        ref: "src/shared/lib/email-receipt.test.ts#sendReceiptByEmail"
        status: pass
    human_judgment: false
  - id: D2
    description: "printReceipt's Tauri invoke sends logoDataUrl and paperWidthChars matching the passed-in ReceiptSettings"
    requirement: "RCPD-02"
    verification:
      - kind: unit
        ref: "src/shared/lib/pos-printer.test.ts#sends logoDataUrl and paperWidthChars from settings on the Tauri invoke (RCPD-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ReceiptPreview and EmailReceiptDialog read real (or safely-defaulted) ReceiptSettings via useReceiptSettings() and forward them into the formatter/print/email calls"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/features/process-payment/ui/ReceiptPreview.test.tsx"
        status: pass
      - kind: unit
        ref: "src/features/process-payment/ui/EmailReceiptDialog.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 3 post-payment print call sites in PaymentForm.tsx (cash, card/other, split-payment loop) forward real ReceiptSettings"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx"
        status: pass
      - kind: unit
        ref: "src/widgets/PaymentModal/PaymentModal.test.tsx"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-24
status: complete
---

# Phase 15 Plan 03: Thread ReceiptSettings Through Every Print/Preview/Email Call Site Summary

**Every production receipt path (post-payment auto-print, manual reprint, email, Tauri invoke) now reads real `ReceiptSettings` instead of silently omitting it — closing the settings-persisted-but-unread gap from Plan 01/02.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-24T02:48:xx (worktree spawn)
- **Completed:** 2026-08-24T02:57:xx
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- `pos-printer.ts`'s `receiptDataToPrinterLines`, `printReceiptWebFallback`, and `printReceipt` all require and forward a `ReceiptSettings` parameter; `printReceipt`'s Tauri `invoke('print_receipt', ...)` call now sends `logoDataUrl` and `paperWidthChars` sourced from that settings value (previously hardcoded/absent)
- `email-receipt.ts`'s `sendReceiptByEmail` requires `settings` and forwards it into `buildThermalReceiptText`
- `ReceiptPreview.tsx` fetches settings via `useReceiptSettings()` (with a fully-valid `ReceiptSettingsSchema.parse({})` fallback for the query's loading window) and threads it into the formatter, print call, and `EmailReceiptDialog` (now a required typed prop)
- `PaymentForm.tsx`'s 3 post-payment auto-print call sites (cash, card/other, split-payment loop) all forward real settings
- New Vitest assertion in `pos-printer.test.ts` proves the Tauri invoke args (`logoDataUrl`, `paperWidthChars`) actually match the passed-in settings — the RCPD-02 IPC-wiring check the plan called for

## Task Commits

1. **Task 1: pos-printer.ts + email-receipt.ts** — `98a5b47` (feat)
2. **Task 2: ReceiptPreview.tsx + EmailReceiptDialog.tsx** — `d3871f1` (feat)
3. **[Rule 1 deviation] import/order fix in pos-printer.ts** — `9b27652` (fix)
4. **Task 3: PaymentForm.tsx** — `30ca688` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/shared/lib/pos-printer.ts` — `receiptDataToPrinterLines`/`printReceiptWebFallback`/`printReceipt` take `settings: ReceiptSettings`; Tauri invoke sends `logoDataUrl`/`paperWidthChars`
- `src/shared/lib/pos-printer.test.ts` — `defaultReceiptSettings()` fixture, all call sites updated, new logoDataUrl/paperWidthChars invoke-args test
- `src/shared/lib/email-receipt.ts` — `sendReceiptByEmail` takes `settings: ReceiptSettings`
- `src/shared/lib/email-receipt.test.ts` — `defaultReceiptSettings()` fixture, call sites and `buildSpy` assertion updated
- `src/features/process-payment/ui/ReceiptPreview.tsx` — reads `useReceiptSettings()`, threads into formatter/print/EmailReceiptDialog
- `src/features/process-payment/ui/ReceiptPreview.test.tsx` — new `@entities/settings` mock
- `src/features/process-payment/ui/EmailReceiptDialog.tsx` — `settings: ReceiptSettings` required prop, threaded into `sendReceiptByEmail`
- `src/features/process-payment/ui/EmailReceiptDialog.test.tsx` — `settings` prop added to all 4 render call sites
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` — reads `useReceiptSettings()`, threads into all 3 `printReceipt` call sites; renamed pre-existing `useSettings()` result to `appSettings`
- `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` — `useReceiptSettings` stub added to existing `@entities/settings` mock
- `src/widgets/PaymentModal/PaymentModal.test.tsx` — `useReceiptSettings` stub added to mock; 2 `printReceipt` assertions updated for the new 2nd argument

## Decisions Made

- Renamed `PaymentForm`'s pre-existing `useSettings()` destructure from `settings` to `appSettings` — the plan's action text introduced a second `const settings = ...` for `ReceiptSettings` that would have shadowed/collided with the existing app-settings variable; the acceptance criteria's literal grep `printReceipt(receipt, settings)` required the receipt-settings variable to actually be named `settings`, so the pre-existing one was renamed instead.
- Kept `ReceiptPreview` self-contained (fetches its own settings via `useReceiptSettings()`) rather than requiring `PaymentForm` to pass settings down as a prop, since `ReceiptPreview` is also used standalone elsewhere in the app.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import/order lint error in pos-printer.ts**
- **Found during:** Task 1 (full-project `npm run lint` verification pass)
- **Issue:** The new `import type { ReceiptSettings } from '@shared/lib/domain'` was placed after the existing `import type { ReceiptData } from '@shared/lib/edge-function-contracts'`, violating this project's `import/order` ESLint rule (alphabetical by module path)
- **Fix:** Reordered the two type imports
- **Files modified:** `src/shared/lib/pos-printer.ts`
- **Verification:** `npm run lint` clean; `npx vitest run src/shared/lib/pos-printer.test.ts` still 17/17 passing
- **Committed in:** `9b27652`

**2. [Rule 1 - Bug] Fixed 2 stale printReceipt assertions in PaymentModal.test.tsx**
- **Found during:** Task 3 (`npx vitest run` verification)
- **Issue:** The plan's Task 3 action text stated "`printReceipt` itself is already separately mocked wholesale in both files ..., so no assertion changes are needed there" — true for `PaymentForm.test.tsx`, but `PaymentModal.test.tsx` has 2 tests that assert `expect(printReceipt).toHaveBeenCalledWith(receipt)` (no settings arg), which broke once the real 2nd argument appeared in the recorded mock call
- **Fix:** Updated both assertions to `toHaveBeenCalledWith(receipt, expect.any(Object))`
- **Files modified:** `src/widgets/PaymentModal/PaymentModal.test.tsx`
- **Verification:** `npx vitest run src/widgets/PaymentModal/PaymentModal.test.tsx` — 21/21 passing (was 2 failing)
- **Committed in:** `30ca688`

**3. [Rule 1 - Bug] Renamed PaymentForm's existing `settings` variable to `appSettings`**
- **Found during:** Task 3 (implementation)
- **Issue:** The plan's action text for adding `const { data: receiptSettings } = useReceiptSettings(); const settings = receiptSettings ?? ReceiptSettingsSchema.parse({});` would have collided with `PaymentForm`'s pre-existing `const { data: settings } = useSettings();` (a different, app-wide settings object used for tip presets, payment methods, tax rate, and payment labels)
- **Fix:** Renamed the pre-existing `useSettings()` destructure and all 4 of its downstream usages (`tipPresets`, `enabledMethods`, `taxRatePercent`, `paymentLabels`) from `settings` to `appSettings`, freeing `settings` for the new `ReceiptSettings` value per the plan's own acceptance-criteria grep
- **Files modified:** `src/widgets/PaymentModal/ui/PaymentForm.tsx`
- **Verification:** `npm run typecheck` clean; `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` — all passing
- **Committed in:** `30ca688`

---

**Total deviations:** 3 auto-fixed (3 Rule 1 — bug/naming-collision/incorrect-plan-assumption fixes, all within the plan's own files and scope)
**Impact on plan:** All three were necessary to make the plan's own acceptance criteria pass and to keep the pre-existing test suite green. No scope creep — no files touched beyond the plan's declared `files_modified` list.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RCPD-01 and RCPD-02 are now fully wired end-to-end: no production code path builds/prints/emails a receipt without real `ReceiptSettings`.
- `npx vitest run` across all 6 modified test files: 70/70 passing. `npm run typecheck`: clean. `npm run lint`: clean (0 errors, 0 warnings).
- Ready for the next plan in Phase 15 (or phase verification/UAT).

## Self-Check: PASSED

- Verified all 11 files in `key-files.modified` exist on disk (`[ -f ]` checks).
- Verified all 4 commit hashes (`98a5b47`, `d3871f1`, `9b27652`, `30ca688`) exist via `git log --oneline --all`.
- Re-ran all 3 tasks' `<acceptance_criteria>`: all PASS (see Task Commits + grep output below).
- Re-ran the plan-level `<verification>`: `npx vitest run` (6 files, 70 tests) PASS; `npm run typecheck` PASS; `npm run lint` PASS (after Rule 1 fix).

---
*Phase: 15-receipt-designer-layout-branding-logo-printing*
*Completed: 2026-08-24*
