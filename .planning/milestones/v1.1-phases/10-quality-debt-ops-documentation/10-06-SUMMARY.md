---
phase: 10-quality-debt-ops-documentation
plan: 06
subsystem: ui
tags: [react-router-dom, useSearchParams, DataTable, i18next, playwright]

requires:
  - phase: 10-quality-debt-ops-documentation (plan 05)
    provides: EntityIdCell shared component (not consumed directly by this plan — parallel foundation work)
provides:
  - "PaymentPane.tsx client-side ID filter seeded from ?id= query param"
  - "StaffDashboard.tsx scroll+highlight of the staff row matching ?id="
  - "e2e/58-entity-id-crosslink.spec.ts proving both behaviors end-to-end"
affects: [quality-debt, entity-id-crosslinking, staff-dashboard, payment-pane]

actuals:
  tokens: 5200
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "First use of react-router-dom's useSearchParams in this codebase — seeded once via useState initializer, not re-synced on every searchParams change, so the filter/highlight remains freely editable/removable after initial load"
    - "DataTable row highlighting via the existing getRowClassName prop + a scoped querySelector scroll-into-view effect, without adding a controlled search value to DataTable's public API"

key-files:
  created:
    - e2e/58-entity-id-crosslink.spec.ts
  modified:
    - src/widgets/PaymentPane/ui/PaymentPane.tsx
    - src/widgets/PaymentPane/ui/PaymentPane.test.tsx
    - src/widgets/StaffDashboard/StaffDashboard.tsx
    - src/widgets/StaffDashboard/StaffDashboard.test.tsx
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json
    - eslint.config.js
    - e2e/helpers/supabase.ts

key-decisions:
  - "Added 'get' to the i18next/no-literal-string ESLint rule's callees exclude list — URLSearchParams.get('id') is a technical API lookup, not translatable UI copy, same category as the already-excluded Supabase query-builder callees (eq, order, etc.)"
  - "Fixed e2e/helpers/supabase.ts's seedClosedTab: its payment insert was missing the NOT NULL idempotency_key column and had no error check, silently leaving seeded tabs with zero payment rows — root-caused and fixed in the shared helper rather than duplicating a local seed function"

patterns-established:
  - "Query-param-seeded local state: `useState(() => (searchParams.get('id') ?? '').trim())` — one-time seed via initializer, so subsequent user edits to the filter aren't clobbered by the URL"

requirements-completed: [QA-03]

coverage:
  - id: D1
    description: "Visiting /payments?id={paymentId} filters PaymentPane's payment list down to that ID"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentPane/ui/PaymentPane.test.tsx#seeds the ID filter from ?id= and shows only the matching payment row"
        status: pass
      - kind: e2e
        ref: "e2e/58-entity-id-crosslink.spec.ts#/payments?id= seeds the filter and shows the matching payment row"
        status: pass
    human_judgment: false
  - id: D2
    description: "Visiting /staff?id={staffId} scrolls to and highlights that staff member's row"
    requirement: "QA-03"
    verification:
      - kind: unit
        ref: "src/widgets/StaffDashboard/StaffDashboard.test.tsx#highlights the staff row matching ?id="
        status: pass
      - kind: e2e
        ref: "e2e/58-entity-id-crosslink.spec.ts#/staff?id= highlights and scrolls the matching staff row into view"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-18
status: complete
---

# Phase 10 Plan 06: Entity-ID Cross-Link Read Side Summary

**PaymentPane and StaffDashboard now read `?id=` query params — a client-side ID filter on `/payments` and a `getRowClassName`-driven highlight+scroll on `/staff` — proven end-to-end with a new Playwright spec, independent of the `EntityIdCell` link source that will point at them.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 9 (8 modified, 1 created)

## Accomplishments
- `PaymentPane.tsx`'s `PaymentHistoryList` seeds a `SearchInput` filter from `useSearchParams().get('id')`, filtering the already-fetched `payments` array client-side (no new Supabase query); the filter stays freely editable after the initial seed.
- `StaffDashboard.tsx` reads `?id=` and passes a highlight class to `DataTable`'s existing `getRowClassName` prop, plus a `useEffect` that scrolls the highlighted row into view — `DataTable.tsx` itself is untouched (verified via empty diff).
- `e2e/58-entity-id-crosslink.spec.ts` drives both behaviors directly by URL against a real Supabase-backed dev server, headless, via Playwright — both tests pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: PaymentPane.tsx — ID filter seeded from ?id=** - `56679a0` (feat)
2. **Task 2: StaffDashboard.tsx — scroll+highlight seeded from ?id=** - `09fe846` (feat)
3. **Task 3: E2E proof — both query-param behaviors** - `9636eeb` (test)

_Note: this worktree branch does not carry a separate plan-metadata commit — the orchestrator commits STATE.md/ROADMAP.md updates after merge, per the parallel-execution contract._

## Files Created/Modified
- `src/widgets/PaymentPane/ui/PaymentPane.tsx` - Added `useSearchParams`-seeded ID filter (`SearchInput`) above the payment history list
- `src/widgets/PaymentPane/ui/PaymentPane.test.tsx` - Wrapped all 8 `renderWithProviders(<PaymentPane />)` call sites in `<MemoryRouter>`; added a filter-seeding test
- `src/widgets/StaffDashboard/StaffDashboard.tsx` - Added `useSearchParams`-driven `getRowClassName` highlight + scroll-into-view effect
- `src/widgets/StaffDashboard/StaffDashboard.test.tsx` - Wrapped all 3 `renderWithProviders(<StaffDashboard />)` call sites in `<MemoryRouter>`; added a highlight test
- `src/shared/lib/i18n/locales/en-US/wPanels.json` / `es-MX/wPanels.json` - Added `paymentPane.filterByIdPlaceholder`
- `eslint.config.js` - Added `get` to `i18next/no-literal-string`'s callees exclude list (URLSearchParams.get is not UI copy)
- `e2e/58-entity-id-crosslink.spec.ts` - New E2E spec proving both behaviors end-to-end
- `e2e/helpers/supabase.ts` - Fixed `seedClosedTab`'s silently-failing payment insert (missing `idempotency_key`, no error check)

## Decisions Made
- Seed the filter/highlight state once via a `useState` initializer reading `searchParams.get('id')`, rather than syncing on every `searchParams` change — the user can then freely edit or clear the filter without the URL fighting back on re-render.
- Colocated the new `filterByIdPlaceholder` i18n key inside the existing `paymentPane` namespace group in `wPanels.json`, matching every other `PaymentPane`-scoped string already there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StaffDashboard's scroll effect crashed under jsdom (unit tests)**
- **Found during:** Task 2 (StaffDashboard.tsx scroll+highlight)
- **Issue:** `Element.scrollIntoView` is not implemented by jsdom; the new `useEffect` threw `TypeError: highlighted?.scrollIntoView is not a function` when the new unit test rendered the component with a matching `?id=`.
- **Fix:** Guarded the call with `typeof highlighted?.scrollIntoView === 'function'` before invoking it.
- **Files modified:** `src/widgets/StaffDashboard/StaffDashboard.tsx`
- **Verification:** `npx vitest run src/widgets/StaffDashboard/StaffDashboard.test.tsx` passes (4 passed, 3 todo).
- **Committed in:** `09fe846` (Task 2 commit)

**2. [Rule 3 - Blocking] `i18next/no-literal-string` rejected `searchParams.get('id')` and the Tailwind highlight class**
- **Found during:** Task 1 and Task 2 (first use of `useSearchParams` in this codebase; RESEARCH.md flagged this as net-new territory)
- **Issue:** ESLint's `i18next/no-literal-string` (`mode: 'all'`, catches call arguments) flagged `searchParams.get('id')` as UI copy in `PaymentPane.tsx`. In `StaffDashboard.tsx`, the same rule additionally flagged the `querySelector('tr.bg-accent\/40')` selector and the `'bg-accent/40'` Tailwind class literal.
- **Fix:** Added `'get'` to the rule's `callees.exclude` list in `eslint.config.js` (same category as the already-excluded Supabase query-builder callees `eq`, `order`, etc.) to cover the `PaymentPane.tsx` case project-wide; added scoped `// eslint-disable-next-line i18next/no-literal-string` comments (matching the existing established pattern used elsewhere in this codebase, e.g. `DataTable.tsx:206`) for the two `StaffDashboard.tsx` CSS-literal cases, since a CSS selector/class string is not a good candidate for a blanket callee exclusion.
- **Files modified:** `eslint.config.js`, `src/widgets/StaffDashboard/StaffDashboard.tsx`
- **Verification:** `npm run lint` clean (0 errors) on both.
- **Committed in:** `56679a0` (Task 1), `09fe846` (Task 2)

**3. [Rule 3 - Blocking] `seedClosedTab` E2E helper silently produced zero payment rows**
- **Found during:** Task 3 (E2E spec's seed step)
- **Issue:** `e2e/helpers/supabase.ts`'s `seedClosedTab` inserts a `payments` row without `idempotency_key`, which is `NOT NULL` on the `payments` table (`20260417000001_payment_processing.sql`); the insert call also has no `.select()`/error check, so the failure was silent. This left every seeded "closed" tab with zero payment rows, making `payments?id={paymentId}` impossible to test via this helper (`.single()` lookup on `payments` errored with "Cannot coerce the result to a single JSON object").
- **Fix:** Added a deterministic `idempotency_key` (mirroring the pattern already used in `e2e/35-refund.spec.ts`'s local `seedPaidTab`) and a thrown error on insert failure.
- **Files modified:** `e2e/helpers/supabase.ts`
- **Verification:** `npx playwright test e2e/58-entity-id-crosslink.spec.ts` — both tests pass headless.
- **Committed in:** `9636eeb` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three were necessary to get to a genuinely passing, non-flaky verification suite (unit + E2E). No scope creep — each fix was scoped to the exact line(s) blocking the current task.

## Issues Encountered
- Playwright's locator API is `page.getByPlaceholder(...)`, not Testing Library's `getByPlaceholderText(...)` — caught immediately by the first E2E run and corrected before the second run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The destination side of QA-03's cross-linking (`/payments?id=`, `/staff?id=`) is complete, tested, and independent of the `EntityIdCell` source-side link work from plan 10-05 — a later, dependent plan can wire `EntityIdCell` links in `AuditLogTable`/`EditHistoryTable`/the two Reports widgets to point at these routes without any further changes here.
- No blockers identified for downstream plans.

---
*Phase: 10-quality-debt-ops-documentation*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: e2e/58-entity-id-crosslink.spec.ts
- FOUND: src/widgets/PaymentPane/ui/PaymentPane.tsx
- FOUND: src/widgets/StaffDashboard/StaffDashboard.tsx
- FOUND: .planning/phases/10-quality-debt-ops-documentation/10-06-SUMMARY.md
- FOUND commit: 56679a0 (Task 1)
- FOUND commit: 09fe846 (Task 2)
- FOUND commit: 9636eeb (Task 3)
- FOUND commit: c68d5db (SUMMARY.md)
