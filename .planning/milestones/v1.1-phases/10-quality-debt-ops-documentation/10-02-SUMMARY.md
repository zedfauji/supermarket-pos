---
phase: 10-quality-debt-ops-documentation
plan: 02
subsystem: testing
tags: [storybook, shared-ui, tanstack-table, i18next]

# Dependency graph
requires:
  - phase: n/a
    provides: no cross-phase dependency — plan is self-contained tooling/config work
provides:
  - Working `.storybook/` config for the repo (never existed before this plan, despite 15 pre-existing `.stories.tsx` files and package.json/vitest.config.ts scripts assuming it)
  - Storybook coverage for the 6 shared/ui primitives named in QA-02
affects: []

# Actuals (#2632)
actuals:
  tokens: 1622
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generic React components (e.g. DataTable<T>) need a concrete wrapper component for Storybook Meta/StoryObj typing — `typeof Component<Row>` instantiation expressions lose the generic under exactOptionalPropertyTypes, producing ColumnDef<unknown> mismatches. Wrap in a non-generic function component typed against the concrete row type instead of pointing Meta directly at the generic."

key-files:
  created:
    - .storybook/main.ts
    - .storybook/preview.ts
    - src/shared/ui/EmptyState.stories.tsx
    - src/shared/ui/ConfirmDialog.stories.tsx
    - src/shared/ui/POSButton.stories.tsx
    - src/shared/ui/DataTable.stories.tsx
    - src/shared/ui/MoneyDisplay.stories.tsx
    - src/shared/ui/MoneyInput.stories.tsx
  modified: []

key-decisions:
  - "Force-added .storybook/main.ts and .storybook/preview.ts with `git add -f` despite the repo's existing `.gitignore` entry for `.storybook/` — the plan explicitly required both files as committed deliverables (must_haves.artifacts) while also explicitly instructing not to remove the .gitignore line itself. The two are compatible: the directory-level ignore still blocks accidental local-only Storybook artifacts, while these two specific config files are tracked."
  - "DataTable.stories.tsx wraps DataTable<Row> in a concrete DataTableStory function component rather than using `Meta<typeof DataTable<Row>>` directly — the direct generic-instantiation form type-checked the meta's `args.columns`/`args.data` against `ColumnDef<unknown>[]`/`unknown[]` instead of the Row-typed versions under `exactOptionalPropertyTypes: true`, failing typecheck."

patterns-established:
  - "Story files for shared/ui primitives follow Button.stories.tsx's shape exactly: `title: 'Shared/UI/<Name>'`, `component`, `parameters: { layout: 'centered' }` (or 'padded' for table-shaped components), `tags: ['autodocs']`, `satisfies Meta<typeof X>`."

requirements-completed: [QA-02]

coverage:
  - id: D1
    description: "Working `.storybook/main.ts` + `.storybook/preview.ts` — Storybook has never been runnable in this repo before this plan"
    requirement: QA-02
    verification:
      - kind: other
        ref: "npm run build-storybook (exits 0, storybook-static/ produced)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Storybook stories for EmptyState, ConfirmDialog, POSButton, DataTable, MoneyDisplay, MoneyInput — all render without error in the static build"
    requirement: QA-02
    verification:
      - kind: other
        ref: "npm run build-storybook (all 23 .stories.tsx files build, zero errors)"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run lint"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-08-19
status: complete
---

# Phase 10 Plan 02: Storybook Config + 6 Shared/UI Stories Summary

**Hand-authored `.storybook/main.ts`/`preview.ts` (the repo never had a working Storybook config despite 15 pre-existing `.stories.tsx` files) plus 6 new stories for EmptyState, ConfirmDialog, POSButton, DataTable, MoneyDisplay, and MoneyInput — `npm run build-storybook` now exits 0 with all 23 story files.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 8 (all created)

## Accomplishments

- Scaffolded `.storybook/main.ts` (framework: `@storybook/react-vite`, stories glob, the exact addon set already present in `package.json` devDependencies) and `.storybook/preview.ts` (imports Tailwind `globals.css` and the i18next singleton so translated component text resolves with no provider wrapper, mirroring `test-setup.ts`'s technique)
- Added `EmptyState.stories.tsx` (Default + WithAction), `ConfirmDialog.stories.tsx` (Default + Destructive), `POSButton.stories.tsx` (Default + XLarge touchSize)
- Added `DataTable.stories.tsx` (Default/Loading/Empty, via a concrete-Row wrapper component), `MoneyDisplay.stories.tsx` (Positive/Negative/Large), `MoneyInput.stories.tsx` (Default + Labeled)
- `npm run build-storybook` exits 0 with all 23 `.stories.tsx` files (17 pre-existing + this plan's 6 — the plan's estimate of "15 pre-existing" was off by 2, confirmed by directory listing; does not affect the acceptance criterion, which is the build passing with all files present)
- `npm run typecheck` and `npm run lint` remain clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold .storybook/main.ts + preview.ts** - `c7e32fd` (feat)
2. **Task 2: Add stories for EmptyState, ConfirmDialog, POSButton** - `82fb84e` (feat)
3. **Task 3: Add stories for DataTable, MoneyDisplay, MoneyInput** - `80b5066` (feat)

## Files Created/Modified

- `.storybook/main.ts` - Storybook framework/stories-glob/addons config (force-added despite `.gitignore`'s `.storybook/` entry — see Decisions)
- `.storybook/preview.ts` - Global preview parameters; imports Tailwind CSS + i18next singleton
- `src/shared/ui/EmptyState.stories.tsx` - Default + WithAction stories
- `src/shared/ui/ConfirmDialog.stories.tsx` - Default + Destructive variant stories
- `src/shared/ui/POSButton.stories.tsx` - Default + XLarge touchSize stories
- `src/shared/ui/DataTable.stories.tsx` - Default/Loading/Empty stories via a concrete `DataTableStory` wrapper component
- `src/shared/ui/MoneyDisplay.stories.tsx` - Positive/Negative/Large stories
- `src/shared/ui/MoneyInput.stories.tsx` - Default + Labeled stories

## Decisions Made

- Force-added the two `.storybook/` config files with `git add -f` since the directory is gitignored but the plan requires these exact files as committed artifacts (see `key-decisions` in frontmatter for full rationale).
- Wrapped `DataTable<Row>` in a concrete, non-generic `DataTableStory` component for the Storybook `Meta`/`StoryObj` typing — pointing `Meta` directly at `typeof DataTable<Row>` lost the `Row` type parameter under `exactOptionalPropertyTypes: true`, producing `ColumnDef<unknown>` typecheck errors (see `key-decisions`).

## Deviations from Plan

None - plan executed exactly as written. The DataTable generic-typing wrapper was implementation detail needed to satisfy the plan's own acceptance criterion ("`npm run typecheck` remains clean") — not a scope change, no new files beyond what the plan specified.

## Issues Encountered

- Initial `DataTable.stories.tsx` (typed as `Meta<typeof DataTable<Row>>` per a literal reading of the plan's action text) failed `npm run typecheck` with `ColumnDef<Row>[]` not assignable to `ColumnDef<unknown>[]` under `exactOptionalPropertyTypes: true`. Resolved by wrapping `DataTable` in a concrete `DataTableStory` function component typed against `DataTableProps<Row>` and pointing `Meta`/`component` at the wrapper instead — same rendered output, correct typing. Re-ran `npm run build-storybook`, `npm run typecheck`, and `npm run lint`, all pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

QA-02 fully satisfied — Storybook is now runnable in this repo (previously it never was) and all 6 required shared/ui primitives have stories that build without error. No blockers for subsequent Phase 10 plans; this plan has no dependents (`affects: []`).

---
*Phase: 10-quality-debt-ops-documentation*
*Completed: 2026-08-19*
