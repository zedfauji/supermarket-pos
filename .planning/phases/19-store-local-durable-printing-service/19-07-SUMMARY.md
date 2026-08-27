---
phase: 19-store-local-durable-printing-service
plan: 07
subsystem: printing
tags: [react, tanstack-table, tanstack-query, i18next, print-broker, audit]

requires:
  - phase: 19-store-local-durable-printing-service (plan 06)
    provides: entities/print-job (usePrintJobs, usePrintJob, PrintJobFilters/PrintJobDetail/PrintJobEvent types), PrintJobStatusBadge
provides:
  - "PrintJobsTable/PrintJobFilterBar/PrintJobDetailSheet widgets under src/widgets/PrintJobsTable/, structurally mirroring AuditLogTable's sibling components but broker-backed"
  - "/audit page's new 'Print Jobs' tab, alongside the unchanged 'Audit Log' tab, both behind the existing view_audit_log route gate"
  - "First-ever automated test coverage for src/pages/audit/index.tsx"
affects: []

actuals:
  tokens: 8200
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "PrintJobFilterBar/PrintJobDetailSheet/PrintJobsTable each mirror their AuditLogTable-sibling's exact structure and prop contract (staged/onStagedChange/onApply; row/open/onOpenChange), swapping the Supabase-backed entities/audit-log data source for the broker-backed entities/print-job one (Plan 19-06) — same UI composition, genuinely different data source."
    - "PrintJobDetailSheet takes a resolved `row: PrintJobDetail | null` prop (mirrors AuditLogDetailSheet exactly); PrintJobsTable is the one that calls usePrintJob(selectedRow.jobId) to resolve the full detail (including the events timeline) before handing it down — keeps the Sheet component itself a pure presentational mirror of AuditLogDetailSheet, with the broker-fetch responsibility living in the table (matches AuditLogTable/AuditLogDetailSheet's own split: AuditLogTable doesn't fetch anything extra since AuditLog rows already carry before/after; PrintJob list rows don't carry events, so PrintJobsTable is where the extra usePrintJob(jobId) call belongs)."
    - "EntityIdCell reused for the jobId cell with entityType='print_job' — not in EntityIdCell's LINKABLE_TYPES allowlist, so it renders as plain truncated mono text + a copy-to-clipboard button (no navigation link, correct since there is no /print-jobs route to link to)."

key-files:
  created:
    - src/widgets/PrintJobsTable/PrintJobFilterBar.tsx
    - src/widgets/PrintJobsTable/PrintJobFilterBar.test.tsx
    - src/widgets/PrintJobsTable/PrintJobDetailSheet.tsx
    - src/widgets/PrintJobsTable/PrintJobDetailSheet.test.tsx
    - src/widgets/PrintJobsTable/PrintJobsTable.tsx
    - src/widgets/PrintJobsTable/PrintJobsTable.test.tsx
    - src/widgets/PrintJobsTable/index.ts
    - src/pages/audit/index.test.tsx
  modified:
    - src/pages/audit/index.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/pages.json
    - src/shared/lib/i18n/locales/es-MX/pages.json

key-decisions:
  - "PrintJobStatusBadge's onReprint callback is a documented no-op in PrintJobsTable's status column. Reprinting a job needs the original print-triggering context (receipt data, caja summary payload, etc.) that only the point-of-origin caller (ReprintButton and future PaymentForm/PaymentPane/etc. callers per Plan 19-06's D-07) has — the audit/list view is read-only broker metadata with no access to that context, so there is nothing correct to call there. The badge still renders the right color/label/confirm-dialog UI for triage; only the 'No, print again' action is a no-op by design, not a missing feature."
  - "PrintJobDetailSheet takes a resolved `row: PrintJobDetail | null` prop (Task 1's own behavior tests require this shape) rather than a `jobId` prop that fetches internally — PrintJobsTable owns the usePrintJob(jobId) call and passes the resolved detail down, keeping the Sheet a pure mirror of AuditLogDetailSheet's prop shape."

requirements-completed: [PRN-05]

coverage:
  - id: D1
    description: "PrintJobFilterBar's Apply filters button calls onApply with exactly the staged filter object; staged changes call onStagedChange with the merged filters object."
    requirement: PRN-05
    verification:
      - kind: unit
        ref: "src/widgets/PrintJobsTable/PrintJobFilterBar.test.tsx (2 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PrintJobDetailSheet renders an ordered event timeline (3 events in ascending order, category + timestamp + optional error text), renders without throwing when winSpoolJobId is null and events is empty, and never imports/renders JsonDiffViewer."
    requirement: PRN-05
    verification:
      - kind: unit
        ref: "src/widgets/PrintJobsTable/PrintJobDetailSheet.test.tsx (3 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "PrintJobsTable's three-branch empty state (empty / filtered-no-matches / load-error) and loading-skeleton branch render correctly per usePrintJobs' status; clicking a row's sr-only trigger opens the detail Sheet; the Job ID cell truncates visually while the trigger's aria-label carries the full jobId."
    requirement: PRN-05
    verification:
      - kind: unit
        ref: "src/widgets/PrintJobsTable/PrintJobsTable.test.tsx (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/audit renders both AuditLogTable (default-active tab) and PrintJobsTable (behind a second tab trigger) inside one Tabs component; switching tabs swaps which widget is mounted."
    requirement: PRN-05
    verification:
      - kind: unit
        ref: "src/pages/audit/index.test.tsx (2 tests — first-ever automated coverage for this page)"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-27
status: complete
---

# Phase 19 Plan 07: Print Jobs Tab on /audit Summary

**PrintJobsTable/PrintJobFilterBar/PrintJobDetailSheet widgets structurally mirroring AuditLogTable but backed by entities/print-job (Plan 19-06), composed into /audit's new "Print Jobs" tab alongside the unchanged "Audit Log" tab — same UI patterns (DataTable, staged-filter-then-Apply, click-row-opens-Sheet), a genuinely different broker-backed data source, and an event timeline instead of a JSON diff.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3 completed
- **Files modified:** 13 (8 created, 5 modified)

## Accomplishments

- `PrintJobFilterBar.tsx` — origin (5-value Select), printer name (free-text Input), status (6-value Select from `PrintJobStatusSchema`), and date-range filters, staged-then-Apply UX identical to `AuditLogFilterBar`'s `{ staged, onStagedChange, onApply }` prop contract.
- `PrintJobDetailSheet.tsx` — mirrors `AuditLogDetailSheet`'s `Sheet`/`SheetContent`/`SheetHeader` wiring, but renders an ordered `<ol>` event timeline (category, timestamp, optional error detail — no truncation, vertical list) instead of `JsonDiffViewer`; shows `winSpoolJobId` in the description line when non-null; never references a `payload` field.
- `PrintJobsTable.tsx` — mirrors `AuditLogTable`'s `DataTable` composition (staged/appliedFilters/selectedRow/sheetOpen state, `usePrintJobs(appliedFilters)`, `openSheet`), with columns Job ID (`EntityIdCell`-style truncated + sr-only accessible trigger), Origin, Printer (`truncate`), Status (`PrintJobStatusBadge`), Attempts, Created at. Three-branch empty state (load-error / filtered-no-matches / genuinely-empty) exactly mirrors `AuditLogTable`. Row click resolves the full detail via `usePrintJob(selectedRow.jobId)` before handing it to `PrintJobDetailSheet`.
- `audit/index.tsx` rewritten to wrap the existing (unchanged) `<AuditLogTable />` and the new `<PrintJobsTable />` inside `Tabs defaultValue="auditLog"`, mirroring `ReportsPage`'s existing `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` pattern. No RBAC/route changes — `AuditRoute`'s existing `view_audit_log` gate covers both tabs automatically.
- New `src/pages/audit/index.test.tsx` — the first-ever automated test file for this page, mirroring `ReportsPage.test.tsx`'s mock-stub-and-assert pattern (default-tab-active, tab-switch).
- New i18n keys: `wAdmin:printJobFilterBar.*`, `wAdmin:printJobDetailSheet.*`, `wAdmin:printJobsTable.*` (both locales, genuine es-MX translations), `pages:audit.tabs.*` (both locales).

## Task Commits

1. **Task 1: PrintJobFilterBar + PrintJobDetailSheet (event timeline)** — `e39f5d0` (feat)
2. **Task 2: PrintJobsTable widget (DataTable composition + three-branch empty state)** — `e1b1c13` (feat)
3. **Task 3: Wrap /audit in Tabs: "Audit Log" (unchanged) + "Print Jobs" (new)** — `1b9a943` (feat)

**Plan metadata:** commit pending (this SUMMARY, worktree mode — orchestrator merges centrally; STATE.md/ROADMAP.md are NOT touched by this executor per orchestrator instruction)

## Files Created/Modified

- `src/widgets/PrintJobsTable/PrintJobFilterBar.tsx` + `.test.tsx` — filter controls
- `src/widgets/PrintJobsTable/PrintJobDetailSheet.tsx` + `.test.tsx` — event timeline Sheet
- `src/widgets/PrintJobsTable/PrintJobsTable.tsx` + `.test.tsx` — DataTable composition
- `src/widgets/PrintJobsTable/index.ts` — barrel export
- `src/pages/audit/index.tsx` — Tabs wrapper (Audit Log unchanged, Print Jobs new)
- `src/pages/audit/index.test.tsx` — first-ever test file for this page
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` — `printJobFilterBar.*`, `printJobDetailSheet.*`, `printJobsTable.*`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/pages.json` — `audit.tabs.*`

## Decisions Made

See `key-decisions` in frontmatter (PrintJobStatusBadge's no-op `onReprint` in the list context; `PrintJobDetailSheet`'s resolved-`row`-prop shape with `PrintJobsTable` owning the `usePrintJob` fetch).

## Deviations from Plan

None — plan executed exactly as written. The two `key-decisions` above are implementation choices within gaps the plan's action text left open (it didn't specify `PrintJobStatusBadge`'s required `onReprint` prop value in the list context, and it named `usePrintJob` in `key_links` without pinning which component calls it), not deviations from anything the plan explicitly required.

## Must-Haves Compliance (plan frontmatter)

All 8 `must_haves.truths` and both `prohibitions`, checked explicitly:

**Truths:**
1. "/audit gains a 'Print Jobs' tab alongside the unchanged 'Audit Log' tab, both behind the existing view_audit_log-gated route" — **met**. `audit/index.tsx` wraps both in one `Tabs`; `git diff` against base SHA shows zero changes to `src/app/audit-route.tsx` or `src/app/router.tsx`.
2. "PrintJobsTable's columns are Job ID, Origin, Printer, Status (PrintJobStatusBadge), Attempts, Created at, with row-click opening a detail Sheet and an sr-only accessible trigger per row..." — **met**. `PrintJobsTable.tsx`'s `columns` array; `PrintJobsTable.test.tsx` Test 5 asserts the sr-only trigger's full-jobId aria-label and the truncated visual cell.
3. "The detail Sheet renders an ordered event timeline... JsonDiffViewer is never reused here." — **met**. `grep -rn "JsonDiffViewer" src/widgets/PrintJobsTable/*.tsx` finds zero import/render references (only comments/test descriptions mention the name); `PrintJobDetailSheet.test.tsx` asserts 3 `listitem` rows in ascending order.
4. "Filters (origin, printer, status, date range) use the same staged-filter-then-Apply UX as AuditLogFilterBar..." — **met**. `PrintJobFilterBar`'s `{ staged, onStagedChange, onApply }` prop names match `AuditLogFilterBar` exactly; `PrintJobFilterBar.test.tsx` Test 1 asserts `onApply` receives exactly the staged object.
5. "Print Jobs tab has an empty state distinct from a filtered-no-matches state, a loading skeleton, and a load-error state..." — **met**. `PrintJobsTable.test.tsx` Tests 1-4 cover all three `EmptyState` branches plus the loading-skeleton branch (via `DataTable`'s `isLoading` prop, same as `AuditLogTable`).
6. "A Print Jobs tab with many rows uses DataTable's existing pagination/infinite-scroll 'Load more entries' behavior unmodified..." — **met**. `PrintJobsTable.tsx` reuses `DataTable`/`hasNextPage`/`fetchNextPage`/`isFetchingNextPage` from `usePrintJobs` exactly as `AuditLogTable` does — no new pagination code.
7. "Long printer names and error text truncate in the table cell... but wrap normally (no truncation) in the detail Sheet's timeline rows..." — **met**. `printerName` column cell has a `truncate` class; `PrintJobDetailSheet`'s timeline `<li>` rows use `text-sm text-muted-foreground` with no `truncate` class.
8. "A job whose payload has already been purged... does not break the detail Sheet — no payload preview is rendered by this phase's scope, so there is nothing to degrade, but the Sheet must not assume a payload field exists..." — **met**. `PrintJobDetailSheet.tsx` never references `.payload` anywhere; `PrintJobDetail` (from `entities/print-job`, Plan 19-06) has no `payload` field to begin with.

**Prohibitions:**
1. "MUST NOT reuse JsonDiffViewer for the Print Jobs detail Sheet..." — **met**, see Truth 3.
2. "MUST NOT gate the Print Jobs tab behind a new or different RBAC action than the existing route-level view_audit_log check..." — **met**. Zero diff on `src/app/audit-route.tsx`/`src/app/router.tsx` against base SHA `315eb32`; both tabs render inside the one `AuditRoute`-gated `AuditPage` component.

## Threat Flags

None. The plan's own `<threat_model>` declared one threat (T-19-17, Elevation of Privilege) already dispositioned "accept" by construction (no separate route for the Print Jobs tab to bypass through) — confirmed: `AuditPage` is the sole entry point, gated once by `AuditRoute`.

## Next Phase Readiness

- `/audit`'s "Print Jobs" tab is now a fully working, tested UI surface reading live broker data end-to-end (Plans 19-01/19-05/19-06's backend work is now visible/queryable by managers/admins), closing out PRN-05's UI requirement.
- No further plans in this phase depend on this plan's output (`affects: []`) — this is the phase's final UI-facing plan for the print-audit surface.

## Self-Check: PASSED

All 8 created files and 5 modified files verified present on disk; all three task commits (`e39f5d0`, `e1b1c13`, `1b9a943`) verified present in `git log --oneline -3`. Full verification suite re-run clean: `npx vitest run src/widgets/PrintJobsTable src/pages/audit` (12/12 passed), `npm run typecheck` (clean), `npm run lint` (0 errors/warnings, exit 0).

---
*Phase: 19-store-local-durable-printing-service*
*Completed: 2026-08-27*
