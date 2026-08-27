---
phase: 15-receipt-designer-layout-branding-logo-printing
plan: 01
subsystem: receipts
tags: [zod, vitest, tdd, receipt-format, thermal-printing]

# Dependency graph
requires: []
provides:
  - "buildThermalReceiptText(receipt, locale, settings) — settings-aware paper width, show* toggles, headerLine2, footerText"
affects: [15-02, 15-03, 15-04]

# Actuals (#2632)
actuals:
  tokens: 5300
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "centerLine/lineLeftRight/divider take an optional trailing `width: number = LINE` param — LINE stays the untouched default for buildPreChequeText, settings.paperWidthChars threads through only buildThermalReceiptText"
    - "Conditional-emission pattern (existing `if (receipt.terminalReference) ...` shape) extended to settings.showCashierName/showCustomerName/showReceiptNumber/headerLine2/footerText"
    - "footerText wraps via the same width-sized padRight chunking loop already used for barAddress — never truncated via a single centerLine() call"

key-files:
  created: []
  modified:
    - src/shared/lib/receipt-format.ts
    - src/shared/lib/receipt-format.test.ts

key-decisions:
  - "buildThermalReceiptText's 3rd settings parameter is required, non-optional, with no default — this is deliberate per RESEARCH.md Pitfall 1 (a default fallback would silently reproduce today's hardcoded behavior). It intentionally breaks typecheck at the other 3 call sites (pos-printer.ts, email-receipt.ts, ReceiptPreview.tsx) until a later plan in this phase threads real settings through them."
  - "buildPreChequeText and its 58mm/32-column LINE=32 default are completely untouched — only buildThermalReceiptText reads settings."

requirements-completed: [RCPD-01]

coverage:
  - id: D1
    description: "buildThermalReceiptText(receipt, locale, settings) requires a non-optional settings argument; settings.paperWidthChars drives every centered/divider/left-right line's byte width"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#settings.paperWidthChars=40 produces a divider() of exactly 40 UTF-8 bytes, not 32"
        status: pass
    human_judgment: false
  - id: D2
    description: "settings.showCashierName/showCustomerName/showReceiptNumber toggle their respective output lines"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#settings.showCashierName toggles the cashier line"
        status: pass
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#settings.showCustomerName toggles the customer line"
        status: pass
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#settings.showReceiptNumber toggles the receipt-number footer line"
        status: pass
    human_judgment: false
  - id: D3
    description: "settings.headerLine2, when non-empty, renders sanitized+centered directly under the store-name header line; empty emits nothing"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#settings.headerLine2, when non-empty, renders as one centered line directly under the store-name header line"
        status: pass
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#headerLine2 containing control characters has them stripped before rendering"
        status: pass
    human_judgment: false
  - id: D4
    description: "settings.footerText wraps across multiple sanitized, width-padded lines (never truncated to one line)"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#footerText of ~100 chars wraps across multiple padRight-padded lines, never truncated to one line"
        status: pass
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#footerText containing control characters has them stripped before rendering"
        status: pass
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#empty footerText (schema default) emits no divider/footer lines, same total line count as receipt without footerText"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildPreChequeText's own 58mm/32-column output is byte-for-byte unaffected by this change"
    requirement: "RCPD-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#buildPreChequeText (full existing describe block, 0 changed assertions)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-23
status: complete
---

# Phase 15 Plan 01: Settings-Aware buildThermalReceiptText Summary

**`buildThermalReceiptText(receipt, locale, settings)` now reads `ReceiptSettings` for paper width, cashier/customer/receipt-number toggles, `headerLine2`, and a correctly multi-line-wrapped `footerText`, closing RESEARCH.md's Pitfall 1 (settings persisted since Phase 6 but never read).**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 (both TDD, RED → GREEN)
- **Files modified:** 2 (`receipt-format.ts`, `receipt-format.test.ts`)
- **Commits:** 4 (test/feat pairs per task)

## Accomplishments

- `buildThermalReceiptText` takes a required 3rd `settings: ReceiptSettings` parameter — no default fallback, so callers must supply real settings
- `centerLine`/`lineLeftRight`/`divider` gained an optional `width: number = LINE` parameter; `buildPreChequeText` and every other unaffected caller keeps the `LINE = 32` default unchanged
- `settings.paperWidthChars` (32/40/48) now drives every centered/divider/left-right/padded line's byte width inside `buildThermalReceiptText`
- `settings.showCashierName`/`showCustomerName`/`showReceiptNumber` gate their respective output lines, mirroring the existing `terminalReference` conditional-emission shape
- `settings.headerLine2`, when non-empty, renders sanitized + centered directly under the store-name header line
- `settings.footerText`, when non-empty, wraps across as many full-width lines as needed via the same `padRight` chunking loop already used for `barAddress` — never truncated to one line via a single `centerLine()` call (UI-SPEC.md's explicit correction to RESEARCH.md's truncating example)
- Both new free-text fields (`headerLine2`, `footerText`) are routed through the existing `sanitize()` helper before being pushed into output — defense-in-depth control-byte stripping on top of the DB's `VARCHAR(48)`/`VARCHAR(480)` length backstop (T-15-03)

## Task Commits

Each task followed the RED → GREEN TDD gate with its own commit pair:

1. **Task 1: Tracer — settings-aware buildThermalReceiptText**
   - `1d35bdd` test(15-01): add failing tests for settings-aware buildThermalReceiptText
   - `e759dea` feat(15-01): make buildThermalReceiptText settings-aware (paper width, show* toggles, headerLine2)
2. **Task 2: footerText multi-line wrap + sanitize()**
   - `86925e3` test(15-01): add failing tests for footerText multi-line wrap and sanitize()
   - `5ee122e` feat(15-01): wrap footerText across multiple lines instead of truncating

**Plan metadata:** committed separately by the wave orchestrator after this SUMMARY (worktree mode — STATE.md/ROADMAP.md are not touched by this agent).

## Files Created/Modified

- `src/shared/lib/receipt-format.ts` — `buildThermalReceiptText` signature change + settings-driven width/toggles/headerLine2/footerText; `centerLine`/`lineLeftRight`/`divider` gained optional `width` param; `buildPreChequeText` untouched
- `src/shared/lib/receipt-format.test.ts` — added `defaultReceiptSettings()` fixture (`ReceiptSettingsSchema.parse`), threaded it through all 16 existing `buildThermalReceiptText` call sites, added 10 new RED→GREEN tests (paper width, 3 show* toggles, headerLine2 non-empty/empty, footerText wrap/sanitize/empty, headerLine2 sanitize)

## Decisions Made

- The new `settings` parameter is required with no default — matches RESEARCH.md Pitfall 1's explicit guidance not to silently reproduce today's hardcoded behavior. This is a deliberate, plan-scoped TypeScript break at the 3 other call sites (`pos-printer.ts`, `email-receipt.ts`, `ReceiptPreview.tsx`); threading real settings through them is out of scope for this plan and belongs to a later plan in this phase.
- `buildPreChequeText` was not touched in any way — confirmed via 0 changed assertions in its own `describe` block.

## Deviations from Plan

None — plan executed exactly as written. Task 1 and Task 2 actions were followed literally; the only adjustment was internal to test-writing (fixed an overly broad `filter(l => l.includes('F'))` line filter in the footerText-wrap test that accidentally matched the unrelated `Fecha` date line, and an overly broad ` -` sanitize-assertion regex that matched the `\n` line-join character rather than the injected `\x00`/`\x01` control bytes — both are test-only self-corrections during RED authoring, not deviations from the plan's implementation instructions).

## Issues Encountered

- This worktree had no `node_modules` or `.env.local` (fresh worktree checkout, both are gitignored and not automatically provisioned). Symlinked both from the main repo checkout (`/mnt/ai/POS/supermarket-pos/node_modules`, `.env.local`) to run `npx vitest`, then removed the symlinks after verification — `git status --short` confirmed zero tracked changes from this (both paths are gitignored).

## Next Phase Readiness

- The settings-aware 3-parameter `buildThermalReceiptText` signature now exists and is fully tested — every other plan in this phase (call-site threading in `pos-printer.ts`/`email-receipt.ts`/`ReceiptPreview.tsx`, and the Settings UI live preview) can build on it directly.
- The 3 other call sites currently fail to typecheck (intentional, by design) until a subsequent plan updates them to pass real `ReceiptSettings`.

---
*Phase: 15-receipt-designer-layout-branding-logo-printing*
*Completed: 2026-08-23*

## Self-Check: PASSED

- FOUND: src/shared/lib/receipt-format.ts
- FOUND: src/shared/lib/receipt-format.test.ts
- FOUND commit: 1d35bdd (test(15-01): add failing tests for settings-aware buildThermalReceiptText)
- FOUND commit: e759dea (feat(15-01): make buildThermalReceiptText settings-aware)
- FOUND commit: 86925e3 (test(15-01): add failing tests for footerText multi-line wrap and sanitize())
- FOUND commit: 5ee122e (feat(15-01): wrap footerText across multiple lines instead of truncating)
