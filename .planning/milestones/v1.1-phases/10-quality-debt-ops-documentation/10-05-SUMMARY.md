---
phase: 10-quality-debt-ops-documentation
plan: 05
subsystem: ui
tags: [react, i18next, react-router-dom, sonner, vitest, react-testing-library, clipboard]

requires: []
provides:
  - "EntityIdCell shared/ui primitive: entityType/entityId -> real navigation Link (payment/tab -> /payments?id=, staff -> /staff?id=) or plain copy-only mono text for every other entityType"
  - "Copy-to-clipboard affordance with full-ID tooltip, success/error toast feedback"
  - "common.copyId/idCopied/copyIdFailed and wAdmin.viewPaymentAriaLabel/viewStaffAriaLabel i18n keys (en-US + es-MX)"
affects: [10-quality-debt-ops-documentation]

actuals:
  tokens: 2793
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Entity-ID cell renderer: exact-Set allowlist branching (LINKABLE_TYPES) rather than fuzzy/case-insensitive matching"
    - "Local TooltipProvider wrap per-component (matches ProtectedAction.tsx), not an app-root provider"

key-files:
  created:
    - src/shared/ui/EntityIdCell.tsx
    - src/shared/ui/EntityIdCell.test.tsx
  modified:
    - src/shared/lib/i18n/locales/en-US/common.json
    - src/shared/lib/i18n/locales/es-MX/common.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json

key-decisions:
  - "userEvent.setup() must be called before installing a navigator.clipboard mock — its default writeToClipboard: true option silently replaces navigator.clipboard with its own working stub, overriding any mock installed beforehand"
  - "aria-label key selection done via if/else t() calls (not a ternary producing a dynamic key string) so eslint-plugin-i18next recognizes each as a real translation call rather than flagging the key literals as untranslated UI strings"

patterns-established:
  - "EntityIdCell: the exact-Set allowlist + local Tooltip-wrap pattern for future entity-ID-rendering primitives"

requirements-completed: [QA-03]

coverage:
  - id: D1
    description: "EntityIdCell renders payment/tab/staff entity IDs as real navigation links (D-01/D-02) and every other entityType as plain copy-only text"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#renders a payment link to /payments?id={entityId} with the full id and truncated display text"
        status: pass
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#renders a tab entityType linking to /payments?id={entityId} (D-03: payment and tab share the target)"
        status: pass
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#renders a staff link to /staff?id={entityId} with the staff aria-label pattern"
        status: pass
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#renders plain copy-only mono text (no link) for a non-allowlisted entityType"
        status: pass
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#renders plain copy-only mono text (no link) for another non-allowlisted entityType (order_item)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The full (untruncated) entity ID, never the 8-char truncated display string, is what actually gets copied and linked"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#always renders a copy button that copies the FULL entityId (not the truncated display text) on click"
        status: pass
    human_judgment: false
  - id: D3
    description: "A clipboard-write rejection surfaces a visible error toast, never a silent no-op or thrown/unhandled rejection (UI-SPEC backstop row, T-10-03)"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#shows an error toast (never a thrown/unhandled rejection) when clipboard write rejects"
        status: pass
      - kind: unit
        ref: "src/shared/ui/EntityIdCell.test.tsx#shows a success toast when clipboard write resolves"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-18
status: complete
---

# Phase 10 Plan 05: EntityIdCell Summary

**Shared `src/shared/ui/EntityIdCell.tsx` primitive: payment/tab/staff entity IDs render as real `react-router-dom` links (exact-Set allowlist), every other entityType renders plain copy-only mono text, all with a copy-to-clipboard button and full-ID tooltip — built via strict RED/GREEN TDD.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-18T19:29:00Z (approx.)
- **Completed:** 2026-08-18T19:38:24Z
- **Tasks:** 2/2 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Built `EntityIdCell` — the foundation primitive QA-03's `AuditLogTable`/`EditHistoryTable`/`DeletionsPostCloseReport` will compose in a later, dependent plan
- Full RED/GREEN TDD cycle: 9-case behavior spec written and confirmed failing (module didn't exist) before any implementation code was written
- Discovered and fixed a subtle test-infrastructure gotcha: `@testing-library/user-event`'s `setup()` installs its own working `navigator.clipboard` stub by default (`writeToClipboard: true`), silently overriding any clipboard mock installed beforehand — documented in the test file and this summary for future test authors
- All acceptance criteria met: `npx vitest run` (9/9 pass), `npm run typecheck` clean, `npm run lint` clean

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): EntityIdCell.test.tsx — full behavior spec** - `bcc5279` (test)
2. **Task 2 (GREEN): Implement EntityIdCell.tsx + i18n keys** - `a996226` (feat)

_No refactor commit needed — GREEN implementation required only lint-driven cleanup (ternary → if/else for i18next-plugin recognition, arrow-function brace fix), folded into the same GREEN commit since it was applied before the commit was made, not after._

## Files Created/Modified

- `src/shared/ui/EntityIdCell.tsx` - The primitive: allowlist branching, Link/plain-text rendering, copy button with success/error toast feedback, local TooltipProvider wrap
- `src/shared/ui/EntityIdCell.test.tsx` - 9-case RTL/Vitest behavior spec covering allowlist branching, undefined-id placeholder, full-vs-truncated-ID copy/link target, and clipboard success/rejection toast paths
- `src/shared/lib/i18n/locales/en-US/common.json` / `es-MX/common.json` - Added `copyId`, `idCopied`, `copyIdFailed` flat top-level keys
- `src/shared/lib/i18n/locales/en-US/wAdmin.json` / `es-MX/wAdmin.json` - Added `viewPaymentAriaLabel`, `viewStaffAriaLabel` flat top-level keys

## Decisions Made

- **Clipboard mock ordering:** `navigator.clipboard.writeText` must be mocked *after* calling `userEvent.setup()`, not before — `userEvent.setup()`'s default `writeToClipboard: true` option calls `attachClipboardStubToView`, replacing `navigator.clipboard` with its own real (non-spy) in-memory clipboard implementation. Mocking before `setup()` gets silently clobbered; the resulting real stub still resolves successfully on `writeText()`, which is why the false-positive was easy to miss (the "success" path test passed even against the wrong implementation — only the spy-assertion and rejection-path tests exposed it).
- **Aria-label key selection via if/else, not a ternary building a dynamic key string:** `eslint-plugin-i18next`'s `no-literal-string` rule only recognizes `t('literal.key')` as a translation call when the first argument is itself a string literal; a ternary expression computing the key defeats that detection and gets flagged as two raw literal strings. Splitting into `isStaff ? t('wAdmin:viewStaffAriaLabel', {...}) : t('wAdmin:viewPaymentAriaLabel', {...})` keeps both calls as literal-first-arg `t()` invocations the plugin recognizes correctly.

## Deviations from Plan

None — plan executed exactly as written. The clipboard-mock-ordering issue and the i18next-lint ternary issue were both resolved within Task 2's GREEN implementation before the task's `<verify>`/acceptance criteria were satisfied and the commit made; neither required touching files outside the plan's declared `files_modified` list.

## Issues Encountered

The clipboard test-infrastructure issue above took the bulk of the debugging time in this plan (isolating that `userEvent.setup()`, not vitest/jsdom environment isolation, was resetting `navigator.clipboard` between mock-setup and the test body). No production code changes resulted from this — it was purely a test-authoring correction, documented above and in the test file's `mockClipboardWriteText` helper comment so future EntityIdCell-adjacent tests don't rediscover it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`EntityIdCell` is ready to be composed into `AuditLogTable`, `EditHistoryTable`, `DeletionsPostCloseReport`, and `DeletionsPreSendPanel` in a dependent QA-03 plan — not yet wired into any consumer (per this plan's explicit scope: "zero blast radius if reverted"). No blockers.

---
*Phase: 10-quality-debt-ops-documentation*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: src/shared/ui/EntityIdCell.tsx
- FOUND: src/shared/ui/EntityIdCell.test.tsx
- FOUND: .planning/phases/10-quality-debt-ops-documentation/10-05-SUMMARY.md
- FOUND: bcc5279 (test commit)
- FOUND: a996226 (feat commit)
