---
phase: 01-strip-rebrand
plan: 02
subsystem: infra
tags: [tauri, i18n, branding, rebrand]

# Dependency graph
requires:
  - phase: 01-strip-rebrand plan 01
    provides: self-hosted Supabase stack, baseline schema, verified login/nav/caja
provides:
  - "package.json name field renamed to supermarket-pos"
  - "Tauri productName and window title renamed to Supermarket POS"
  - "Browser tab title renamed to Supermarket POS"
  - "Receipt/PDF header (pdf.appTitle) renamed to Supermarket POS in both es-MX and en-US"
  - "Orphaned homeDashboard.managerLabels.bartender i18n key removed from both locales"
affects: [strip-rebrand later plans (kds-bar tile removal), RBAC role rename plan]

actuals:
  tokens: 816
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - package.json
    - src-tauri/tauri.conf.json
    - index.html
    - src/shared/lib/i18n/locales/es-MX/receipt.json
    - src/shared/lib/i18n/locales/en-US/receipt.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json
    - src/shared/lib/i18n/locales/en-US/wPanels.json

key-decisions:
  - "README.md does not exist in this repo (only in an unrelated sibling checkout) — no edit needed, not created"
  - "Left tauri.conf.json identifier (com.yourcompany.barpos) untouched per D-03/RESEARCH.md Open Question 3 — OS-level identifier, out of scope"
  - "Left the HomeDashboard.tsx reference to the now-deleted i18n key (/kds-bar tile's managerLabelKey) as-is — that tile is removed in a later plan in this phase, and a missing i18n key is not a build-breaking reference (string literal, not typed import)"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "App window title, browser tab title, and installer productName all read Supermarket POS"
    verification:
      - kind: other
        ref: "grep -c 'Supermarket POS' package.json src-tauri/tauri.conf.json index.html (3 hits)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Printed receipts and PDF exports show Supermarket POS in both es-MX and en-US locales"
    verification:
      - kind: other
        ref: "grep -c 'Supermarket POS' receipt.json (es-MX + en-US), 2 hits"
        status: pass
    human_judgment: false
  - id: D3
    description: "package.json name field is supermarket-pos"
    verification:
      - kind: other
        ref: "package.json line 2"
        status: pass
    human_judgment: false
  - id: D4
    description: "Orphaned homeDashboard.managerLabels.bartender i18n key removed from both locale wPanels.json files"
    verification:
      - kind: other
        ref: "grep -q '\"bartender\":' wPanels.json (es-MX + en-US) returns no match"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-10
status: complete
---

# Phase 01 Plan 02: App Identity Rebrand Summary

**Renamed every app-identity string (package name, Tauri window/productName, browser title, receipt/PDF header) from Bar POS variants to Supermarket POS across config and both i18n locales, and removed the orphaned bartender i18n label.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-10T22:16:33Z
- **Completed:** 2026-08-10T22:20:14Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `package.json` `name`: `bar-pos` → `supermarket-pos`
- `src-tauri/tauri.conf.json` `productName` and window `title` → `Supermarket POS` (identifier left untouched)
- `index.html` `<title>` → `Supermarket POS`
- Both `receipt.json` locales' `pdf.appTitle` → `Supermarket POS`
- Both `wPanels.json` locales: removed the orphaned `homeDashboard.managerLabels.bartender` key

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename app identity in config, window, and browser title (D-01/D-03)** - `ad9bfb6` (feat)
2. **Task 2: Rename receipt/PDF header in both locales, remove orphaned bartender i18n label, grep README (D-01/D-03/D-22)** - `0ad5fe8` (feat)

**Plan metadata:** (this commit) `docs(01-02): complete app identity rebrand plan`

## Files Created/Modified
- `package.json` - `name` field renamed to `supermarket-pos`
- `src-tauri/tauri.conf.json` - `productName` and window `title` renamed to `Supermarket POS`; `identifier` left as `com.yourcompany.barpos`
- `index.html` - `<title>` renamed to `Supermarket POS`
- `src/shared/lib/i18n/locales/es-MX/receipt.json` - `pdf.appTitle` renamed to `Supermarket POS`
- `src/shared/lib/i18n/locales/en-US/receipt.json` - `pdf.appTitle` renamed to `Supermarket POS`
- `src/shared/lib/i18n/locales/es-MX/wPanels.json` - removed `homeDashboard.managerLabels.bartender` key
- `src/shared/lib/i18n/locales/en-US/wPanels.json` - removed `homeDashboard.managerLabels.bartender` key

## Decisions Made
- README.md does not exist in this repo (verified via repo-wide `find`; only similarly-named files exist in an unrelated sibling `bar-pos` checkout at `/mnt/ai/bola8pos-kiro/bar-pos/`) — no edit made, none needed. Acceptance criterion ("README.md has zero remaining case-insensitive hits") is vacuously true.
- `tauri.conf.json`'s `identifier` field (`com.yourcompany.barpos`) left unchanged per plan's explicit scope boundary (OS-level app data-directory identifier, RESEARCH.md Open Question 3).

## Deviations from Plan

None - plan executed exactly as written (README.md's absence is a pre-existing repo state, not a deviation requiring a fix — nothing in the plan required creating a README).

## Issues Encountered
- `HomeDashboard.tsx` still references the deleted i18n key (`homeDashboard.managerLabels.bartender`) via the `/kds-bar` tile's `managerLabelKey` field, per the plan's own note that this tile's removal happens in a later plan in this phase. Confirmed this is a string literal (not a typed import), so `npm run typecheck` passes clean with the key removed — verified via `npm run typecheck` (0 errors). No fix needed now; the later plan that removes the `/kds-bar` tile will also remove this reference.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- App identity rebrand (D-01/D-03) is complete for all config, window, browser, and receipt/PDF surfaces.
- The `homeDashboard.managerLabels.bartender` key removal is a leading edge of D-22's per-feature i18n cleanup; the `/kds-bar` tile removal plan should account for its now-dangling `managerLabelKey` reference (harmless at runtime, but should be cleaned up when that tile's array entry is deleted).
- No blockers for subsequent Phase 1 plans (bar/pool domain strip, RBAC role rename).

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*

## Self-Check: PASSED

All 7 modified files and the SUMMARY.md itself confirmed present on disk; both task commits (`ad9bfb6`, `0ad5fe8`) confirmed present in git log.
