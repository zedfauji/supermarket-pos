---
phase: 20-store-deployment-installer
plan: 03
subsystem: testing
tags: [playwright, e2e, supabase, remote-smoke, migrations, tip_amount, cors, edge-functions]

requires:
  - phase: 20-store-deployment-installer (20-01, 20-02)
    provides: remote Supabase project (mkvinyekkyennyegfoxq) with 12 deployed edge functions and 5 secrets set; signed NSIS installer pipeline
provides:
  - "playwright.remote.config.ts + npm run test:e2e:remote-smoke: an opt-in Playwright suite that points the dev server at the real remote Supabase backend"
  - "e2e/remote-smoke/remote-backend-smoke.spec.ts: full scenario (login, receiving, checkout+print, staff creation, self-verifying teardown) passing for real against the remote project, proven twice consecutively (idempotency)"
  - "scripts/seed-remote-e2e-admin.ts: idempotent seeder for a dedicated, permanent E2E fixture admin account, distinct from the real store owner's 'Vinty Owner' admin"
  - "Confirmed and RESOLVED (by the orchestrator, outside this plan's scope) a live production bug: remote checkout failed for every real cash/card sale due to a payments.tip_amount NOT NULL schema/edge-function-code mismatch (migration sync gap)"
  - "Confirmed and RESOLVED (fixed in source by this plan, deployed by the orchestrator) a second live production bug: 6 of 12 edge functions (create-staff plus 5 settings/email functions) had zero CORS handling, breaking every real browser call to those features"
affects: [store-deployment-installer, phase-20-verification]

actuals:
  tokens: 10500
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Sibling Playwright config (playwright.remote.config.ts) loads a distinct .env.remote-e2e via dotenv.config() before defineConfig(), relying on Vite's loadEnv() process.env precedence to point an unmodified dev server at a different backend with zero app/build changes"
    - "Remote-smoke E2E specs never call resetTestState()/openCaja()/forceCloseAllOpenTabs() — read-before-touch, narrowly-scoped service-role helpers only, since those bulk-mutate every row of their target tables project-wide against a real, production-intent database"
    - "Every edge function must set Access-Control-Allow-Origin/-Headers and handle an OPTIONS preflight (corsHeaders + early-return pattern, established in process-direct-sale/index.ts and receive-shipment/index.ts). A function missing this is invisible to unit/integration tests (they call the function directly, not through a browser) and only surfaces via a real browser E2E hit against the deployed function — exactly what this plan's spec exists to do."

key-files:
  created:
    - playwright.remote.config.ts
    - e2e/remote-smoke/remote-backend-smoke.spec.ts
    - scripts/seed-remote-e2e-admin.ts
    - .env.remote-e2e (gitignored, not committed)
  modified:
    - playwright.config.ts (testIgnore gains /remote-smoke\//)
    - e2e/helpers/requireEnv.ts (new requireRemoteSmokeEnv())
    - e2e/helpers/supabase.ts (pre-existing noUncheckedIndexedAccess bug fix in getMigrationList())
    - package.json (new test:e2e:remote-smoke script)
    - .gitignore (.env.remote-e2e, e2e-results-remote-smoke/, playwright-report-remote-smoke/)
    - supabase/functions/create-staff/index.ts (added missing CORS headers + OPTIONS handler; deployed live by the orchestrator)

key-decisions:
  - "Task 1's checkpoint (service_role key + fixture admin credentials) was pre-resolved by the calling instructions — executed straight through to Task 2 without re-asking."
  - "Fixture admin's profiles.locale is explicitly pinned to en-US at seed time — the app's cold-start default (es-MX) broke every English-text UI selector in the spec (e.g. the button read 'Cobro', not 'Checkout')."
  - "Step 0's caja/shift safety guard deviates from the plan's literal branch wording: the plan's 'close leftover XOR open new' branches would leave NO open caja session for a recovery run's own checkout leg. Fixed to always ensure exactly one open session (and a matching open shifts row, which the plan didn't mention at all — normally created by the app's own opening-cash dialog, which loginAsNamed skips once a caja session is already open) before proceeding — a Rule 1/3 correctness fix, not a scope change."
  - "The remote payments.tip_amount / migration-sync gap this plan discovered was fixed by the orchestrator directly (migration repair + db push on an upgraded Supabase CLI, outside this worktree) after this plan surfaced it as a blocking checkpoint. This plan's job was to prove/expose the gap via the E2E spec, which it did — the fix itself was out of this plan's own scope and permission envelope."
  - "Fixed the create-staff CORS bug directly in source (Rule 1/2 — a missing-CORS bug is an explicit Rule 2 example, and it's a small, well-scoped, revertible fix mirroring an established sibling pattern already in this exact file tree). Did NOT self-deploy it — `supabase functions deploy` was blocked by the same auto-mode permission classifier as the migration-repair block. Surfaced as a checkpoint; the orchestrator deployed it (plus the same fix for 5 other affected functions, found during this plan's audit but out of its own scope to fix) directly to the remote project."

requirements-completed: []

coverage:
  - id: D1
    description: "Remote-pointed Playwright config (playwright.remote.config.ts) + dedicated E2E fixture admin account, proven via a real login against the remote project mkvinyekkyennyegfoxq"
    verification:
      - kind: e2e
        ref: "npm run test:e2e:remote-smoke — 'logs in as the dedicated fixture admin against the real remote project'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full ordered scenario (real shipment receiving -> real cash checkout+print -> real staff creation -> self-verifying teardown) proving ROADMAP Phase 20 Success Criterion 5 end-to-end against the real remote backend, run twice consecutively (idempotency)"
    verification:
      - kind: e2e
        ref: "npm run test:e2e:remote-smoke — 'receiving -> checkout+print -> staff creation, then full self-verifying teardown' (2 consecutive runs, both green)"
        status: pass
    human_judgment: false

duration: 200min
completed: 2026-08-30
status: complete
---

# Phase 20 Plan 03: Remote Backend E2E Smoke Pass Summary

**ROADMAP Phase 20 Success Criterion 5 is closed: login, real shipment receiving, real cash checkout+print, and real staff creation all pass end-to-end against the live remote backend (proven twice consecutively) — after this plan's own spec discovered and drove the fix for two separate, real, live production bugs (a tip_amount migration-sync gap, and 6 edge functions with zero CORS handling).**

## Performance

- **Duration:** ~200 min total across the initial run and two resumptions
- **Started:** 2026-08-30T12:13:00Z (approx, worktree spawn)
- **Completed:** 2026-08-30
- **Tasks:** 3 of 3 (Task 1 pre-resolved/skipped per calling instructions; Task 2 and Task 3 both complete and fully green)
- **Files modified:** 9 (excluding the two carried-over planning docs and the WINDOWS.md ledger)

## Accomplishments

- `playwright.remote.config.ts` + `npm run test:e2e:remote-smoke`: proven to point the dev server at the real remote Supabase project — excluded from the default `npm run test:e2e` suite (304 tests, zero from `e2e/remote-smoke/`, reconfirmed after all fixes).
- `scripts/seed-remote-e2e-admin.ts`: idempotent seeder for `E2E Remote Smoke Admin` — run repeatedly, correctly no-ops after first creation, pins `locale: 'en-US'`.
- **Full scenario passes end-to-end, twice consecutively** (fresh random-suffixed fixture names each run, proving idempotency): real login → real shipment receiving (supplier + product created via the UI's quick-add flow, stock confirmed via DB) → real cash checkout including the app's genuine low-stock "Add anyway" confirm gate → mocked `print_receipt` invocation confirmed → real staff creation via the Add Staff dialog, confirmed via a direct DB poll (not just UI text) → self-verifying teardown (refund with restock, product deactivated, supplier hard-deleted, staff hard-deleted, caja session closed) — final assertions inside the test itself confirm zero residue.
- **Discovered and drove the fix for a live production-breaking bug #1**: the remote project's deployed schema was one migration behind the deployed edge-function code (`payments.tip_amount` NOT NULL vs. an edge function that never sends it), breaking every real cash/card sale. The orchestrator resolved it via `supabase migration repair` + an upgraded-CLI `supabase db push`; confirmed fixed via `payments.tip_amount` now returning `42703 column does not exist`.
- **Discovered and drove the fix for a live production-breaking bug #2**: `create-staff`'s deployed edge function had zero CORS handling, so the app's real "Add Staff" dialog failed at CORS preflight against the remote backend. Fixed in source this session (mirroring the established `corsHeaders`/`OPTIONS` pattern already in `process-direct-sale/index.ts`); auditing all 12 deployed functions found 5 more with the identical gap (`settings-backup`, `settings-restore`, `settings-test-email`, `settings-email-status`, `send-receipt-email`). The orchestrator deployed this plan's `create-staff` fix plus the same fix for the other 5, verified live via a real preflight `OPTIONS` request.

## Task Commits

1. **Docs: carry over gap-closure plan + verification report** — `38fddeb` (docs)
2. **Task 2 (tracer): remote-pointed Playwright config + fixture admin + real remote login** — `a163179` (feat)
3. **Task 3: expand smoke spec to receiving, checkout+print, staff creation, teardown** — `55bce38` (feat)
4. **Docs: interim SUMMARY (halted on tip_amount blocker)** — `e2b040d` (docs) — superseded
5. **Fix: add missing CORS headers to create-staff edge function** — `eb6c8ee` (fix)
6. **Fix: bound refund-cleanup timeouts, verify staff creation via DB, precise error-response filters** — `39f6045` (fix)
7. **Docs: interim SUMMARY update (tip_amount resolved, create-staff CORS found)** — `835ed48` (docs) — superseded by this SUMMARY

**Plan metadata:** this SUMMARY commit (docs)

_Task 1 (`checkpoint:human-action`, collecting the service_role key and fixture admin credentials) was pre-resolved by the calling instructions — executed straight through, not re-asked, per instructions._

## Files Created/Modified

- `playwright.remote.config.ts` - new sibling Playwright config, loads `.env.remote-e2e`, `workers: 1`/`retries: 0`
- `e2e/remote-smoke/remote-backend-smoke.spec.ts` - the two-test remote-smoke spec (login; full scenario) — passing
- `scripts/seed-remote-e2e-admin.ts` - idempotent fixture-admin seeder, pins `locale: 'en-US'`
- `e2e/helpers/requireEnv.ts` - added `requireRemoteSmokeEnv()`
- `e2e/helpers/supabase.ts` - fixed a pre-existing `noUncheckedIndexedAccess` type error in `getMigrationList()`
- `playwright.config.ts` - `testIgnore` gains `/remote-smoke\//`
- `package.json` - new `test:e2e:remote-smoke` script
- `.gitignore` - `.env.remote-e2e`, `e2e-results-remote-smoke/`, `playwright-report-remote-smoke/`
- `.env.remote-e2e` - created on disk, gitignored, never committed
- `supabase/functions/create-staff/index.ts` - added `corsHeaders` const + `OPTIONS` early-return + spread into every response's headers (mirrors `process-direct-sale/index.ts`) — deployed live by the orchestrator, also mirrored on `main` at commit `67d24a9`
- `.planning/WINDOWS.md` - 3 entries (tip_amount, create-staff CORS, 5-function CORS gap) all marked `fixed`

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing noUncheckedIndexedAccess type error in e2e/helpers/supabase.ts**
- **Found during:** Task 2, first `npm run typecheck` run
- **Fix:** `const timestamp = name.split('_')[0] ?? name;`
- **Committed in:** `a163179`

**2. [Rule 1 - Bug] Fixture admin locale forced to en-US**
- **Found during:** Task 3, first full-scenario run (timed out on a button literally labeled "Cobro")
- **Fix:** `scripts/seed-remote-e2e-admin.ts` sets `locale: 'en-US'` on both the create and already-exists paths.
- **Committed in:** `55bce38`

**3. [Rule 1/3 - Bug/Blocking] Step 0 always opens a fresh caja session + shift**
- **Found during:** Task 3, second full-scenario run
- **Fix:** Always ensure exactly one open caja session and one open `shifts` row for the fixture admin before proceeding, mirroring `seedOpenTab()`'s find-or-create pattern.
- **Committed in:** `55bce38`

**4. [Rule 1 - Bug] Low-stock "Add anyway" confirm gate handled explicitly**
- **Found during:** Task 3, third full-scenario run
- **Fix:** Wait for and click "Add anyway" if it appears, rather than sizing around the real safety feature.
- **Committed in:** `55bce38`

**5. [Rule 1 - Bug] Refund-cleanup click calls bounded with explicit timeouts**
- **Found during:** re-run after the tip_amount fix landed — a disabled "Request approval" button retried for the entire remaining test budget instead of failing fast into the surrounding try/catch
- **Fix:** Added `{ timeout: 10_000 }` to the reason-trigger/option/approval clicks, an upfront checkbox-visibility + selected-count guard, and an `expect(requestApprovalBtn).toBeEnabled()` assertion before clicking.
- **Committed in:** `39f6045`

**6. [Rule 1 - Bug] Staff-creation UI assertion strengthened with a direct DB check**
- **Found during:** same re-run — the UI's `getByText(staffName, {exact:true})` assertion passed once even though no `profiles` row was ever created (later traced to the CORS bug; the UI assertion alone can't distinguish a real success from a stale/optimistic render)
- **Fix:** Added `expect.poll(() => db.from('profiles')...)` immediately after the UI assertion, so this leg actually proves the edge function ran, not just that the UI looked happy.
- **Committed in:** `39f6045`

**7. [Rule 1/2 - Bug/Missing Critical] create-staff edge function missing CORS headers entirely**
- **Found during:** staff-creation leg consistently failing with `net::ERR_FAILED` / CORS preflight rejection after fixes #5/#6 above ruled out spec-side causes
- **Issue:** `supabase/functions/create-staff/index.ts` had no `Access-Control-Allow-Origin`/`-Headers` and no `OPTIONS` handler at all — unlike every sibling function. Auditing all 12 deployed functions found 5 more with the identical gap.
- **Fix:** Added the same `corsHeaders` + `OPTIONS`-early-return pattern already used by `process-direct-sale/index.ts` to `create-staff/index.ts`. The orchestrator applied the identical fix to the other 5 and deployed all 6.
- **Files modified:** `supabase/functions/create-staff/index.ts`
- **Verification:** Confirmed live: the full scenario's staff-creation leg now passes, twice consecutively.
- **Committed in:** `eb6c8ee`

---

**Total deviations:** 7 auto-fixed
**Impact on plan:** All necessary for the spec to progress; #7 is the most significant — a genuine, currently-live bug in shipped application code (not test code, not infra config), found only because this plan drives a real browser against the real deployed function instead of calling it directly.

## Issues Encountered — both RESOLVED

### 1. Remote schema one migration behind deployed code (payments.tip_amount)

Surfaced by this plan as a blocking checkpoint; resolved by the orchestrator outside this worktree:
1. `supabase migration repair --status reverted 20260828234316 20260828235834` — reconciled two orphaned remote-only migration-ledger entries (an undocumented prior drop-then-revert of the same migration under different version numbers).
2. Upgraded the Supabase CLI (2.90.0 → 2.116.0) — the outdated CLI hit "cannot insert multiple commands into a prepared statement" (SQLSTATE 42601) applying `20260828000001_drop_tip_amount.sql`, a known CLI/pooler bug; confirmed the failed attempt touched nothing (atomic failure at statement 0).
3. Re-ran `supabase db push` on the upgraded CLI — succeeded. `supabase migration list` now shows every local migration matching remote.
4. Verified: `payments.tip_amount` now returns `42703 column does not exist`.

**Confirmed fixed:** the full scenario's receiving and checkout+print legs pass for real.

### 2. create-staff (and 5 sibling functions) missing all CORS handling

Surfaced by this plan (root-caused via the tailed browser console's own CORS preflight error, after ruling out two spec-side false leads). Fixed in source (`eb6c8ee`); the orchestrator deployed `create-staff` plus the identical fix for `settings-backup`, `settings-restore`, `settings-test-email`, `settings-email-status`, and `send-receipt-email` (commit `67d24a9` on `main`), verified live via a real preflight `OPTIONS` request against `create-staff` (200, `Access-Control-Allow-Origin: *`).

**Confirmed fixed:** the full scenario's staff-creation leg passes, twice consecutively.

## Final Verification (all green)

- `npm run test:e2e:remote-smoke` — **2 tests passed** (login leg; full scenario), run **twice consecutively** — both fully green, no failures.
- Post-run service-role query after both runs: zero fixture suppliers, zero fixture staff profiles, zero open caja sessions. Fixture products from successful runs are `is_active: false` (never hard-deleted — they carry real `order_items` references, matching this plan's accepted-footprint design).
- `npx playwright test --list` under the default `playwright.config.ts` — **304 tests, zero from `e2e/remote-smoke/`** (exclusion holds).
- `npm run typecheck` — passes.
- `npx tsc --noEmit -p e2e/tsconfig.json` — zero errors in `e2e/remote-smoke/remote-backend-smoke.spec.ts` or any file this plan touched (pre-existing errors in unrelated e2e files, out of scope, untouched).
- `npm run lint` — passes (no new warnings/errors; one pre-existing, unrelated boundaries-plugin config warning).

## User Setup Required

None. `.env.remote-e2e` is fully populated and gitignored; the fixture admin account, edge-function fixes, and migration sync are all live.

## Next Phase Readiness

- **ROADMAP Phase 20 Success Criterion 5 is closed.** `.planning/phases/20-store-deployment-installer/20-VERIFICATION.md`'s one confirmed blocking gap is resolved with automated evidence — a real, repeatable Playwright spec proves login, shipment receiving, checkout, print submission, and staff creation all work end-to-end against the deployed remote backend, with zero permanent fixture residue.
- `.planning/WINDOWS.md` entries from this plan (tip_amount, create-staff CORS, 5-function CORS gap) are all marked `fixed` — no open items carried forward from this plan.
- No further action needed on this plan.

## Self-Check: PASSED

- FOUND: `playwright.remote.config.ts`
- FOUND: `e2e/remote-smoke/remote-backend-smoke.spec.ts`
- FOUND: `scripts/seed-remote-e2e-admin.ts`
- FOUND: `e2e/helpers/requireEnv.ts` (modified)
- FOUND: `supabase/functions/create-staff/index.ts` (modified)
- FOUND: `.planning/phases/20-store-deployment-installer/20-03-PLAN.md`
- FOUND: `.planning/phases/20-store-deployment-installer/20-VERIFICATION.md`
- FOUND: commits `38fddeb`, `a163179`, `55bce38`, `e2b040d`, `eb6c8ee`, `39f6045`, `835ed48`
- CONFIRMED: `npm run test:e2e:remote-smoke` passed twice consecutively this session (raw output above)

---
*Phase: 20-store-deployment-installer*
*Completed: 2026-08-30*
