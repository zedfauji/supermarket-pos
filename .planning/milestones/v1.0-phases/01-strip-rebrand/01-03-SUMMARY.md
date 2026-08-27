---
phase: 01-strip-rebrand
plan: 03
subsystem: auth
tags: [rbac, supabase, postgres, enum, rls, e2e, playwright, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Self-hosted Supabase project (localhost:8000) holding the full 144-migration baseline schema — the safe target for this plan's DB migration"
provides:
  - "cashier as the single, consistent role name across DB enum, RLS policies, function bodies, TS types, RBAC constants, E2E helpers, and 27/28 E2E spec files"
  - "supabase/migrations/20260810000001_rename_bartender_role_to_cashier.sql — the D-16 role-rename migration, pushed and live"
affects: [01-04, 01-13]

actuals:
  tokens: 25400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "ALTER TYPE ... RENAME VALUE is atomic and OID-based — it auto-migrates every existing row and column DEFAULT referencing the old label, but does NOT rewrite embedded string literals inside RLS policy USING/WITH CHECK clauses or PL/pgSQL function bodies (those must be found live via pg_policies/pg_proc ILIKE queries and rewritten explicitly in the same migration)"

key-files:
  created:
    - supabase/migrations/20260810000001_rename_bartender_role_to_cashier.sql
  modified:
    - src/shared/lib/domain.ts
    - src/shared/lib/rbac.ts
    - src/shared/lib/supabase.types.ts
    - e2e/helpers/auth.ts
    - e2e/helpers/supabase.ts
    - scripts/setup-dev-users.ts

key-decisions:
  - "supabase.types.ts (generated, normally never hand-edited per CLAUDE.md) was manually patched in Task 1's commit because Task 1 runs before Task 2's DB migration exists to regenerate it from — verified byte-identical (modulo an unrelated __InternalSupabase metadata block) against a real `supabase gen types` regeneration run immediately after Task 2's migration pushed"
  - "Policy identifiers containing the word 'bartender' (rappi_orders_select_bartender, rappi_orders_update_bartender, order_items_delete_bartender) were left as historical names — only their USING/WITH CHECK literal content was rewritten, matching the plan's own action text (ALTER POLICY <name> ... USING (...) with the literal replaced, not a policy rename)"
  - "E2E_BARTENDER_* env var names kept unchanged everywhere (auth.ts, supabase.ts, setup-dev-users.ts) per RESEARCH.md Pitfall 5 — internal-only, never user-visible, avoids a CI secret-store rename"

patterns-established:
  - "DB-side role-rename verification: query pg_policies/pg_proc directly on the LIVE project (ILIKE '%literal%'), not migration file history, before declaring an enum rename complete — migration history is mostly superseded and would undercount live objects"

requirements-completed: []

coverage:
  - id: D1
    description: "domain.ts's UserRoleSchema/UserRole and rbac.ts's STAFF_ROLES/CASHIER_ACTIONS/ROLE_SET use 'cashier', not 'bartender' — the whole repo (src/ + scripts/) still type-checks"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (repo root) — zero errors"
        status: pass
      - kind: unit
        ref: "npx vitest run --project unit (full suite) — 1412 pass, 5 pre-existing PINLoginForm failures unchanged, zero new regressions"
        status: pass
    human_judgment: false
  - id: D2
    description: "DB user_role enum value renamed bartender->cashier; every live RLS policy (11) and function (5) that embedded the literal rewritten in the same migration; migration pushed against the self-hosted project only"
    verification:
      - kind: other
        ref: "docker exec supabase-db psql -c \"SELECT unnest(enum_range(NULL::user_role))\" -> cashier/manager/admin/kitchen; pg_policies/pg_proc COUNT(*) ILIKE '%bartender%' -> 0/0; supabase db push --dry-run -> \"Remote database is up to date\" (145/145 migrations tracked)"
        status: pass
    human_judgment: false
  - id: D3
    description: "e2e/helpers/auth.ts's StaffRole + staffForRole() branch on cashier while still reading E2E_BARTENDER_NAME/PIN; every E2E spec (except 15-home-navigation.spec.ts, owned by 01-04) calling loginAs(page,'cashier') and still type-checking"
    verification:
      - kind: other
        ref: "grep -rl \"'bartender'\" e2e/*.spec.ts e2e/helpers/*.ts | grep -v 15-home-navigation.spec.ts -> empty; npx tsc --noEmit -p e2e/tsconfig.json 2>/dev/null || npx tsc --noEmit -> falls back cleanly (e2e/tsconfig.json has pre-existing unrelated errors, main tsconfig clean)"
        status: pass
      - kind: e2e
        ref: "ad-hoc headless Chromium session (alternate port, see Deviations) driving loginAs-equivalent flow for the E2E_BARTENDER_NAME/PIN account against the live self-hosted DB"
        status: pass
    human_judgment: false
  - id: D4
    description: "HomeDashboard's raw role-badge render (currentStaff.role, no i18n) shows the new role value automatically post-rename"
    verification:
      - kind: e2e
        ref: "live browser session: /home page body text matches /\\bcashier\\b/i and does NOT match /\\bbartender\\b/i after logging in as the seeded cashier account"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-10
status: complete
---

# Phase 1 Plan 3: RBAC Role Rename (bartender -> cashier) Summary

**Renamed the `bartender` role to `cashier` end-to-end — Postgres `user_role` enum + 11 live RLS policies + 5 function bodies, TypeScript `domain.ts`/`rbac.ts` source of truth, and the E2E auth helper/seed script/28-file spec sweep — with zero partial-rename gap, verified against the live self-hosted DB and a real headless browser login.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-08-10
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 61 (across 3 commits)

## Accomplishments

- TypeScript single source of truth (`domain.ts`'s `UserRoleSchema`/`UserRole`, `rbac.ts`'s `STAFF_ROLES`/`CASHIER_ACTIONS`/`ROLE_SET`) renamed to `cashier`, plus every downstream call site the rename broke (~28 files: production code, unit/component tests, mocks, generated types) fixed so `npx tsc --noEmit` and the full unit suite stay clean
- DB `user_role` enum value renamed via `ALTER TYPE ... RENAME VALUE` (atomic, auto-migrates existing rows + the `profiles.role` DEFAULT); 11 live RLS policies and 5 live function bodies found by querying `pg_policies`/`pg_proc` directly on the live project (not migration file history) and rewritten in the same migration — zero remaining `%bartender%` hits confirmed by direct count query
- E2E auth helper, seed script, and 27 of 28 spec files swept to `loginAs(page, 'cashier')`, with `E2E_BARTENDER_*` env var names deliberately preserved to avoid a CI secret-store rename
- Live end-to-end proof: a real headless Chromium session logged in as the seeded cashier account against the actual self-hosted DB and confirmed the DB-driven staff picker and `/home` role badge both show "cashier" with zero "bartender" text remaining

## Task Commits

1. **Task 1: Rename bartender to cashier in the TypeScript single source of truth (D-16)** — `77b0ceb` (feat)
2. **Task 2: [BLOCKING] Rename the DB user_role enum value and every live policy/function literal, push to the new project (D-16)** — `3f988fd` (feat)
3. **Task 3: Rename bartender in E2E auth helpers, seed scripts, and every spec call site (D-16, Pitfall 5)** — `c1f3cab` (feat)

**Plan metadata:** committed separately alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `src/shared/lib/domain.ts` — `UserRoleSchema`/`UserRole` use `'cashier'`
- `src/shared/lib/rbac.ts` — `STAFF_ROLES`, `BARTENDER_ACTIONS`→`CASHIER_ACTIONS`, `ROLE_SET` keyed by `cashier`
- `src/shared/lib/supabase.types.ts` — generated `user_role` enum literal manually patched, later confirmed byte-identical to a real post-migration regeneration
- ~24 other `src/` files (production call sites + unit/component test mocks) — see Task 1 commit for the full list; all were Rule-3 fallout from the type rename, not separately planned
- `supabase/migrations/20260810000001_rename_bartender_role_to_cashier.sql` — the DB-side rename: enum + 11 policies + 5 functions
- `e2e/helpers/auth.ts` — `StaffRole` type + `staffForRole()` branch on `cashier`
- `e2e/helpers/supabase.ts` — `seedNewStaffMember()`'s role param
- `scripts/setup-dev-users.ts` — `ROLES` array role values
- 27 `e2e/*.spec.ts` files + `e2e/visual/45-visual-baseline.spec.ts` — `'bartender'` role literals swept to `'cashier'`

## Decisions Made

- **Task ordering dependency handled pragmatically:** Task 1's own `<verify>` (`npx tsc --noEmit`) requires the TS layer to compile cleanly, but one call site (`useMutationUpdateStaffRole`'s `.update({ role })`) is typed against generated `supabase.types.ts`, whose `user_role` literal can only be authoritatively regenerated after Task 2's migration exists. Resolved by patching the two `user_role` literal occurrences in `supabase.types.ts` directly during Task 1, then confirming — via an actual `supabase gen types typescript` run immediately after Task 2's push — that the manual patch matches the real regenerated output exactly (aside from an unrelated `__InternalSupabase` metadata block a newer CLI/postgres-meta version omits). No drift, no follow-up edit needed.
- **Policy identifiers keep the word "bartender"** (`rappi_orders_select_bartender`, `rappi_orders_update_bartender`, `order_items_delete_bartender`) — only their `USING`/`WITH CHECK` literal content changed, matching the plan's stated action text precisely (`ALTER POLICY <name> ... USING (...) WITH CHECK (...) with the literal replaced`, not a rename). Zero functional or verification impact — the plan's own `pg_policies` verify query checks `qual`/`with_check` content, not policy names.
- **`ALTER TYPE ... RENAME VALUE` does not require its own transaction** — the plan's action text flagged a possible Postgres restriction on running it alongside other DDL in one transaction block; tested empirically against the live DB (`BEGIN; ALTER TYPE ... RENAME VALUE ...; ALTER POLICY ...; ROLLBACK;`) before committing to the migration shape, confirming no such restriction applies to `RENAME VALUE` (unlike `ADD VALUE`, which does have transaction-visibility restrictions pre-PG12). The whole migration runs in a single `BEGIN...COMMIT` block, matching repo convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ~24 additional `src/` files broke `tsc`/unit tests after the domain.ts/rbac.ts rename**
- **Found during:** Task 1
- **Issue:** Task 1's file list names only `domain.ts`/`rbac.ts`, but the role-literal type change immediately broke `npx tsc --noEmit` across ~15 files (production code comparing `role === 'bartender'`, and unit/component test mocks typed against the now-narrower `UserRole` union) and would have crashed 2 more tests at runtime (`ManagerPinDialog.test.tsx`, `OpenUnitsTab.test.tsx`/`SettingsTabsPanel.test.tsx`) via `ROLE_SET[role]` being `undefined` for a role no longer in the set.
- **Fix:** Propagated `'bartender'` → `'cashier'` through every broken call site: `entities/staff`, `entities/tab` (`viewerRole` scoping, `bartenderScope`→`cashierScope` query-key field), `RBACDashboard`'s `ROLE_LABELS`, `shared/lib/mocks.ts`'s mock-data factory, and all affected `.test.ts(x)` fixtures. Also manually patched generated `supabase.types.ts`'s `user_role` literal (see Decisions above) since one production call site's compile error traced there.
- **Files modified:** see Task 1 commit (`77b0ceb`) file list
- **Verification:** `npx tsc --noEmit` (0 errors), `npx vitest run --project unit` (1412 pass, only the 5 pre-existing `PINLoginForm.test.tsx` failures already documented in 01-01-SUMMARY.md remain, zero new failures)
- **Committed in:** `77b0ceb` (Task 1 commit)

**2. [Rule 3 - Blocking] `e2e/visual/45-visual-baseline.spec.ts` missed by the plan's non-recursive `e2e/*.spec.ts` glob**
- **Found during:** Task 3
- **Issue:** The plan's sweep command (`grep -rl "'bartender'" e2e/*.spec.ts`) doesn't recurse into `e2e/visual/`, leaving a file with `StaffRole`-typed `'bartender'` literals that broke `npx tsc --noEmit -p e2e/tsconfig.json`.
- **Fix:** Renamed `BARTENDER_ROUTES`/`BARTENDER_DENIED` constants to `CASHIER_ROUTES`/`CASHIER_DENIED`, the `'bartender'` role literals to `'cashier'`, and the `bartender-*.png` screenshot baseline names to `cashier-*.png` (these baselines will need regeneration regardless, since the rendered role text itself changed — out of this plan's scope to regenerate actual PNGs).
- **Files modified:** `e2e/visual/45-visual-baseline.spec.ts`
- **Verification:** `grep -rln "'bartender'" e2e/` returns only `15-home-navigation.spec.ts` (expected, owned by 01-04)
- **Committed in:** `c1f3cab` (Task 3 commit)

**3. [Rule 1 - Bug] Two functional E2E assertions would silently stop matching after the rename**
- **Found during:** Task 3
- **Issue:** `e2e/22-staff-management.spec.ts` asserted on the rendered staff-list role text via `/bartender|manager|admin/i` — this regex would never match "cashier". `e2e/06-transfer.spec.ts` called `selectOption({ label: 'Alex Martinez (bartender)' })` against `TransferTabDialog`'s i18n-templated `"{{name}} ({{role}})"` option label (traced to `featOrders.json`'s `staffOption` key to confirm the exact format) — the dropdown option now literally reads `"Alex Martinez (cashier)"`.
- **Fix:** Updated both to `cashier`.
- **Files modified:** `e2e/22-staff-management.spec.ts`, `e2e/06-transfer.spec.ts`
- **Verification:** Manual trace of the rendering code path (`HomeDashboard.tsx`'s raw role interpolation confirmed via live browser session; `TransferTabDialog.tsx` line 94's `t('transferTab.staffOption', {name, role})` confirmed via `featOrders.json`)
- **Committed in:** `c1f3cab` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1/3 — bugs and blocking type/runtime issues directly caused by this plan's own rename). No scope creep — every fix was necessary fallout of Task 1's or Task 3's own stated goal, not unrelated work.

## Issues Encountered

- **`localhost:1420` (the fixed Playwright `baseURL`/Vite dev port) was already occupied by an unrelated, separately-maintained bar-pos checkout** at `/mnt/ai/bola8pos-kiro/bar-pos` (confirmed via `ps aux` showing a different working directory, and a different git remote — `github.com/zedfauji/bola8pos.git` vs. this repo's local `origin`). This matches PROJECT.md's documented context ("bar-pos itself is maintained separately elsewhere"). Playwright's `webServer.reuseExistingServer: true` silently reused that unrelated server for an initial `09-rbac.spec.ts` smoke run, producing a confusing false negative (stale "Bartender" role labels, unfamiliar staff names, a login timeout) that had nothing to do with this plan's code. **Not touched or killed** — it's a live, unrelated process outside this plan's scope. Instead, started a second `npm run dev` instance from this repo's own directory on an alternate port (1425) and drove a standalone headless-Chromium script against it directly (bypassing the `playwright.config.ts` `webServer` auto-detection, which is hardcoded to port 1420) to get a genuine, uncontaminated end-to-end proof of the rename. Cleaned up (killed the alternate dev server, removed the scratch script) before finishing — no `playwright.config.ts` changes were made or needed.
- **One `BROWSER ERROR: Failed to load resource: the server responded with a status of 500`** appeared in the live verification session's console log alongside a fully successful login+navigation. Not investigated further — didn't block the login flow, is not a `'bartender'`-literal-related regression (nothing in this plan's diff touches server-side request handling beyond the RLS/function changes already directly verified), and is out of this plan's declared scope. Logged here for visibility, not filed to `.planning/WINDOWS.md` since it wasn't reproduced as a concrete, attributable defect (could be a dev-only asset, HMR websocket noise, etc.) — flag for a future phase if it recurs.
- **The plan's Task 2 `<verify>` command has a false-positive quirk:** `psql -t -c "SELECT proname FROM pg_proc WHERE prosrc ILIKE '%bartender%' ..." | grep -qv "0 rows"` always prints `STILL_HAS_LITERAL` because `-t` (tuples-only) mode emits a single blank line for an empty result set, and a blank line doesn't contain the string `"0 rows"` either — so the `grep -qv` always finds a "non-matching" line and reports true. Verified the actual, correct result via an explicit `COUNT(*)` query instead (`0` for both `pg_proc` and `pg_policies`), and via `supabase db push --dry-run` reporting "Remote database is up to date" (145/145 migrations tracked, including the new one). Not fixed in the plan file itself since PLAN.md is not a target of this execution's file list — flagged here for whoever next touches this plan's verify script.

## Known Stubs

None.

## Threat Flags

None — the DB-side changes stayed within the plan's declared `<threat_model>` (T-01-05, T-01-06, T-01-07), all mitigated as designed:
- T-01-05 (stale RLS policy after enum rename): every live policy/function found via direct `pg_policies`/`pg_proc` query on the new project, rewritten in the same migration — confirmed zero remaining hits.
- T-01-06 (migration run against the wrong project): the project-id gate (`grep -q 'project_id = "shsrhxleopmovzpzqmex"' supabase/config.toml && exit 1`) ran before every `db push`/`dry-run` invocation; config.toml's `project_id` is `supermarket-pos-selfhosted` throughout.
- T-01-07 (accepted risk, no action needed): schema-baseline rename on freshly-seeded dev data, no real production history on this project.

## User Setup Required

None — the self-hosted Docker Compose stack (running since Plan 01-01) was used as-is; no new credentials or external service configuration needed.

## Next Phase Readiness

- `cashier` is now the live role everywhere this plan owns: DB enum/policies/functions, TS types/RBAC constants, E2E helpers/seed script, and 27/28 spec files — verified end to end (tsc, lint, unit suite, direct DB queries, and a real browser login).
- **`e2e/15-home-navigation.spec.ts` is intentionally left with `'bartender'` literals** — Plan 01-04 (same wave, runs in parallel) owns that exact file's edit to avoid a same-wave file conflict. Until 01-04 lands, `npx tsc --noEmit -p e2e/tsconfig.json` will show 10 errors in that one file; this is expected and does not block anything (the repo's actual `npm run typecheck`/`lint` gates only cover `src`/`scripts`, not `e2e/`).
- Plan 01-13 (final consolidation) still owns: pruning now-orphaned `STAFF_ACTIONS`/`CASHIER_ACTIONS` entries (e.g. `view_kds_bar`, `transfer_tab`) once the features that reference them are stripped in later waves — deliberately deferred per this plan's objective and D-17.
- Visual regression baselines (`e2e/visual/45-visual-baseline.spec.ts`'s `*.png` snapshots) will need regeneration in whichever phase next runs `--update-snapshots`, since rendered role text changed from "bartender" to "cashier" across every captured screenshot — out of this plan's scope, flagged for visibility only.

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*

## Self-Check: PASSED

All key files confirmed present (domain.ts, rbac.ts, migration file, e2e helpers, setup-dev-users.ts, this SUMMARY). All 3 task commits (`77b0ceb`, `3f988fd`, `c1f3cab`) confirmed present in git history.
