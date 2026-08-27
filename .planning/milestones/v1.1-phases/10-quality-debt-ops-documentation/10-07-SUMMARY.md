---
phase: 10-quality-debt-ops-documentation
plan: 07
subsystem: ui
tags: [react, react-router-dom, i18next, tanstack-table, playwright, vitest]

requires:
  - phase: 10-quality-debt-ops-documentation (plan 05)
    provides: EntityIdCell shared/ui primitive (payment/tab/staff -> Link, everything else -> copy-only text)
  - phase: 10-quality-debt-ops-documentation (plan 06)
    provides: PaymentPane ?id= filter and StaffDashboard ?id= scroll+highlight (EntityIdCell's link destinations)
provides:
  - "AuditLogTable: new entityId column composing EntityIdCell"
  - "EditHistoryTable: ticket column upgraded from plain truncated text to EntityIdCell (entityType=tab)"
  - "DeletionsPostCloseReport: tabId column composing EntityIdCell (entityType=tab, linkable)"
  - "DeletionsPreSendPanel: orderId column composing EntityIdCell (entityType=order_item, copy-only)"
  - "E2E proof of the full click-through: source table link -> destination page filter/highlight, for both AuditLogTable and EditHistoryTable"
affects: [10-quality-debt-ops-documentation]

actuals:
  tokens: 5155
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Propagation-stopping wrapper div around EntityIdCell when composed into a DataTable row that already has onRowClick — without it, clicking the entity-ID link/copy button also fires the row's own click handler"
    - "Scope a Playwright dialog locator by accessible name (SheetTitle text) rather than bare role=dialog — an always-mounted, CSS-transform-hidden 'AI Assistant' side panel is also role=dialog and still counts as 'visible' to Playwright"
    - "E2E text assertions in this codebase must be locale-agnostic (dual-regex matching en-US and es-MX) rather than assuming one locale, since pinned E2E login accounts' locale can drift"

key-files:
  created:
    - src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.test.tsx
    - .planning/phases/10-quality-debt-ops-documentation/deferred-items.md
  modified:
    - src/widgets/AuditLogTable/AuditLogTable.tsx
    - src/widgets/AuditLogTable/AuditLogTable.test.tsx
    - src/widgets/EditHistoryTable/EditHistoryTable.tsx
    - src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx
    - src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/ui/EntityIdCell.tsx
    - e2e/38-audit-logs.spec.ts
    - e2e/47-edit-paid-tab.spec.ts

key-decisions:
  - "Wrapped EntityIdCell in a stopPropagation() div wherever it's composed into a row with onRowClick (AuditLogTable, EditHistoryTable) — otherwise clicking the copy button or link also opens the row's diff sheet, since click bubbles to the <tr> handler"
  - "Added data-testid=\"copy-entity-id-button\" to EntityIdCell's copy button (not in the original plan's files_modified list) — needed for locale-agnostic E2E targeting instead of matching translated aria-label text"
  - "Fixed e2e/47-edit-paid-tab.spec.ts's editPaidTabViaUi helper (and its 2 duplicated call sites) to match button/dialog text in both en-US and es-MX — the pinned E2E_MANAGER_NAME/E2E_BARTENDER_NAME accounts are actually en-US, not es-MX as the file's own stale comments assumed, which was silently breaking all 4 tests in that file before this plan touched it"

patterns-established:
  - "EntityIdCell composition into an existing DataTable row: import, cell renderer, propagation-stop wrapper if the table has onRowClick"

requirements-completed: [QA-03]

coverage:
  - id: D1
    description: "AuditLogTable shows a new copyable/clickable entityId column (payment rows link to /payments?id=)"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/widgets/AuditLogTable/AuditLogTable.test.tsx#renders the action cell as plain text and an accessible diff button; clicking opens the sheet"
        status: pass
      - kind: e2e
        ref: "e2e/38-audit-logs.spec.ts#should display audit entries after processing a payment"
        status: pass
    human_judgment: false
  - id: D2
    description: "EditHistoryTable's ticket column is upgraded from plain truncated text to a copyable/clickable entity-ID link"
    requirement: "QA-03"
    verification:
      - kind: e2e
        ref: "e2e/47-edit-paid-tab.spec.ts#manager sees the edit in /edit-history and row click opens the JsonDiffViewer"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both Reports Deletions surfaces (post-close tabId, pre-send orderId) show the entity-ID treatment, not just the one named during discussion"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.test.tsx#renders the orderId as copy-only text (no navigation link) since order_item is not linkable"
        status: pass
      - kind: e2e
        ref: "e2e/47-edit-paid-tab.spec.ts#manager sees the edit in /edit-history and row click opens the JsonDiffViewer (Reports Corrections-tab assertion)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Clicking an entity-ID link navigates end-to-end to a filtered/highlighted destination page (proven, not just asserted by href)"
    requirement: "QA-03"
    verification:
      - kind: e2e
        ref: "e2e/38-audit-logs.spec.ts#should display audit entries after processing a payment (entity link click -> /payments?id= -> payment-row-{id} visible)"
        status: pass
      - kind: e2e
        ref: "e2e/47-edit-paid-tab.spec.ts#manager sees the edit in /edit-history and row click opens the JsonDiffViewer (ticket link click -> /payments?id=<tabId>)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-08-18
status: complete
---

# Phase 10 Plan 07: Entity-ID Cross-Link Composition Summary

**EntityIdCell (plan 10-05) composed into AuditLogTable, EditHistoryTable, and both Reports Deletions surfaces, with Playwright proving the full click-through into PaymentPane/StaffDashboard's `?id=` handling from plan 10-06 — QA-03 closed end-to-end.**

## Performance

- **Duration:** ~55 min (includes E2E debugging: a dialog-locator ambiguity fix and a pre-existing locale-mismatch bug blocking `e2e/47-edit-paid-tab.spec.ts`)
- **Tasks:** 3/3 completed
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments

- `AuditLogTable.tsx` gained a new `entityId` column (payment rows render a real `/payments?id=` link; other entity types render copy-only text), without disturbing the existing action/entityType/actor/createdAt/source columns or the sr-only diff-trigger DOM contract.
- `EditHistoryTable.tsx`'s existing `ticket` column was upgraded from `row.original.entityId?.slice(0, 8)` plain text to `<EntityIdCell entityType="tab" .../>`.
- Both Reports Deletions surfaces now compose `EntityIdCell`: `DeletionsPostCloseReport`'s `tabId` (linkable, `entityType="tab"`) and `DeletionsPreSendPanel`'s `orderId` (copy-only, `entityType="order_item"` — not in the D-02 allowlist, per RESEARCH.md Pitfall 3, the surface the discussion-phase UI-SPEC didn't name by name).
- `e2e/38-audit-logs.spec.ts` and `e2e/47-edit-paid-tab.spec.ts` were extended to click through a real entity-ID link end-to-end: source table → destination page → filtered/highlighted row visible — proving plans 10-05, 10-06, and 10-07 compose correctly, not just that hrefs look right.

## Task Commits

Each task was committed atomically:

1. **Task 1: AuditLogTable new entityId column + EditHistoryTable ticket column upgrade** - `ffe89f4` (feat)
2. **Task 2: DeletionsPostCloseReport + DeletionsPreSendPanel — both Reports surfaces** - `5815eab` (feat)
3. **Task 3: E2E full click-through — AuditLogTable and EditHistoryTable links actually navigate** - `ba8327d` (test)

_Note: this worktree branch does not carry a separate plan-metadata commit for STATE.md/ROADMAP.md — the orchestrator commits those updates after merge, per the parallel-execution contract._

## Files Created/Modified

- `src/widgets/AuditLogTable/AuditLogTable.tsx` - New `entityId` ColumnDef; propagation-stop wrapper so the link/copy button doesn't also open the row's diff sheet
- `src/widgets/AuditLogTable/AuditLogTable.test.tsx` - Wrapped both `renderWithProviders` call sites in `MemoryRouter`; added an entity-link href assertion
- `src/widgets/EditHistoryTable/EditHistoryTable.tsx` - `ticket` column cell swapped to `EntityIdCell entityType="tab"`, same propagation-stop wrapper
- `src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx` - `tabId` column cell swapped to `EntityIdCell entityType="tab"`
- `src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx` - `orderId` column cell swapped to `EntityIdCell entityType="order_item"` (copy-only)
- `src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.test.tsx` - New; confirms the copy-only wiring (no link, copy button present)
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` - Added `auditLogTable.columnEntityId`
- `src/shared/ui/EntityIdCell.tsx` - Added `data-testid="copy-entity-id-button"` to the copy button (E2E targeting, locale-agnostic)
- `e2e/38-audit-logs.spec.ts` - Extended the payment.process happy-path test with entity-link/copy/navigate assertions; scoped the diff-sheet dialog locator by accessible name
- `e2e/47-edit-paid-tab.spec.ts` - Extended SC-4 with ticket-link click-through + Reports Corrections-tab assertion; fixed a pre-existing locale-mismatch bug in `editPaidTabViaUi` and its 2 duplicated call sites

## Decisions Made

- **Propagation-stop wrapper for EntityIdCell inside clickable rows:** `AuditLogTable` and `EditHistoryTable` both have `onRowClick` (opens the diff sheet) on the whole `<tr>`. Without stopping propagation on the new cell, clicking the entity-ID link or copy button would also fire the row's click handler, opening the diff sheet at the same time as navigating or copying — confusing and untested behavior. Fixed with a plain `onClick={e => e.stopPropagation()}` div wrapper (Rule 1 — bug).
- **`data-testid` on EntityIdCell's copy button:** not in this plan's declared `files_modified`, but needed to write locale-agnostic E2E assertions (Rule 3 — blocking). Additive, doesn't change EntityIdCell's rendered output or existing `EntityIdCell.test.tsx` assertions.
- **Locale-agnostic E2E text matching:** discovered mid-Task-3 that `e2e/47-edit-paid-tab.spec.ts`'s hardcoded Spanish button/dialog text ("Editar ticket", "Guardar corrección", "Historial de ediciones") never matched, because the pinned `E2E_MANAGER_NAME`/`E2E_BARTENDER_NAME` accounts are actually `en-US` locale (confirmed via direct DB query), not `es-MX` as the file's own comments assumed. Fixed the shared `editPaidTabViaUi` helper and its 2 duplicated inline call sites to match both locales via regex, mirroring the existing pattern already used in `e2e/helpers/auth.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Entity-ID link/copy click also opened the row's diff sheet**
- **Found during:** Task 1 (AuditLogTable/EditHistoryTable composition)
- **Issue:** Both tables' rows have `onRowClick` on the whole `<tr>`. Clicking the new link/copy button would bubble and also trigger `openSheet`.
- **Fix:** Wrapped the cell content in a `<div onClick={e => e.stopPropagation()}>`.
- **Files modified:** `src/widgets/AuditLogTable/AuditLogTable.tsx`, `src/widgets/EditHistoryTable/EditHistoryTable.tsx`
- **Verification:** `npx vitest run src/widgets/AuditLogTable/AuditLogTable.test.tsx` passes; confirmed in Task 3's E2E run that clicking the entity link navigates cleanly without the diff sheet also opening.
- **Committed in:** `ffe89f4`

**2. [Rule 3 - Blocking] `page.getByRole('dialog')` (unscoped) never resolves to "not visible" — an always-mounted AI Assistant panel is also `role="dialog"`**
- **Found during:** Task 3 (E2E run of `e2e/38-audit-logs.spec.ts`)
- **Issue:** The app renders a persistent "AI Assistant" side panel with `role="dialog" aria-modal="false"`, hidden via CSS `translate-x-full` (not `display:none`). Playwright's actionability checks still count it as "visible". My new `await expect(sheet).not.toBeVisible()` assertion (added right after closing the diff sheet) used the pre-existing unscoped `sheet = page.getByRole('dialog')` locator and never passed, because the AI Assistant panel element always satisfied "visible".
- **Fix:** Scoped the locator by accessible name — `page.getByRole('dialog', { name: 'payment.process' })` — mirroring the pattern already used elsewhere in the same file (`refundDialog`) and in `e2e/47-edit-paid-tab.spec.ts`.
- **Files modified:** `e2e/38-audit-logs.spec.ts`
- **Verification:** `npx playwright test e2e/38-audit-logs.spec.ts -g "should display audit entries after processing a payment"` passes.
- **Committed in:** `ba8327d`

**3. [Rule 3 - Blocking] `e2e/47-edit-paid-tab.spec.ts` was entirely broken (all 4 tests) before this plan touched it — hardcoded Spanish text vs. an en-US pinned test account**
- **Found during:** Task 3 (E2E run of `e2e/47-edit-paid-tab.spec.ts`)
- **Issue:** `editPaidTabViaUi` and 2 duplicated inline call sites clicked/asserted hardcoded Spanish strings ("Editar ticket", "Editar ticket pagado", "Guardar corrección", "corrección del ticket guardada", "Historial de ediciones"). The pinned `E2E_MANAGER_NAME`/`E2E_BARTENDER_NAME` accounts are `en-US` locale (verified via direct Supabase query against the local instance: `Manager Test` → `locale: 'en-US'`), so these never matched — every test in the file timed out at the very first "click the edit button" step, before reaching this plan's Task 3 additions.
- **Fix:** Made all 4 hardcoded-text spots dual-locale regex matches (`/edit ticket|editar ticket/i`, `/edit paid ticket|editar ticket pagado/i`, `/save correction|guardar corrección/i`, `/ticket correction saved|corrección del ticket guardada/i`, `/edit history|historial de ediciones/i`), matching the dual-locale approach `e2e/helpers/auth.ts` already documents and uses.
- **Files modified:** `e2e/47-edit-paid-tab.spec.ts`
- **Verification:** `npx playwright test e2e/47-edit-paid-tab.spec.ts` — 4/4 pass (previously 0/4 passed for reasons unrelated to plan 10-07's scope, but blocking Task 3's SC-4 extension).
- **Committed in:** `ba8327d`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three were necessary to reach a genuinely passing verification suite. Deviation #3 fixed 3 tests outside this plan's direct scope (SC-3 × 2, plus SC-4's own pre-existing brokenness) as a side effect of fixing the one shared root cause SC-4 needed — no separate unscoped work was done.

## Issues Encountered

- `Diff viewer > should open diff sheet on row click` (`e2e/38-audit-logs.spec.ts`) remains failing — confirmed via an isolated run (`-g` filter, fresh `resetTestState()`) that it reproduces against an old `payment.refund` row unrelated to any row this plan seeds or touches; its `firstRow` locator matches "the first diff button anywhere in the whole audit log," which is inherently order/state-dependent on however much history has accumulated in the shared local Supabase instance. Confirmed pre-existing and out of this plan's scope per the Scope Boundary rule — logged to `deferred-items.md` and `.planning/WINDOWS.md` (entry #16, kind `deviation`), not fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

QA-03 (ROADMAP Success Criterion 3) is fully satisfied: Audit Log, Edit History, and both Reports Deletions surfaces display entity IDs as copyable and/or clickable links to the related record, verified end-to-end via Playwright (link click → navigate → destination-page filter/highlight visible), not just by unit-testing `EntityIdCell` in isolation. No blockers for downstream work.

---
*Phase: 10-quality-debt-ops-documentation*
*Completed: 2026-08-18*
