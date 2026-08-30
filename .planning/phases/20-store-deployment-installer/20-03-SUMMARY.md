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
  - "e2e/remote-smoke/remote-backend-smoke.spec.ts: login + receiving + checkout+print legs proven green against the real remote project; staff-creation leg blocked pending a create-staff edge-function redeploy (see Issues Encountered)"
  - "scripts/seed-remote-e2e-admin.ts: idempotent seeder for a dedicated, permanent E2E fixture admin account, distinct from the real store owner's 'Vinty Owner' admin"
  - "Confirmed and RESOLVED (by the orchestrator, outside this plan's scope) a live production bug: remote checkout failed for every real cash/card sale due to a payments.tip_amount NOT NULL schema/edge-function-code mismatch"
  - "Confirmed a second live production bug (fixed in source by this plan, blocked on deploy permission): create-staff edge function has zero CORS handling, so the app's real 'Add Staff' dialog fails at CORS preflight against the remote backend"
affects: [store-deployment-installer, phase-20-verification, any future phase touching process_payment_atomic/process_direct_sale_atomic/create-staff]

actuals:
  tokens: 9500
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Sibling Playwright config (playwright.remote.config.ts) loads a distinct .env.remote-e2e via dotenv.config() before defineConfig(), relying on Vite's loadEnv() process.env precedence to point an unmodified dev server at a different backend with zero app/build changes"
    - "Remote-smoke E2E specs never call resetTestState()/openCaja()/forceCloseAllOpenTabs() — read-before-touch, narrowly-scoped service-role helpers only, since those bulk-mutate every row of their target tables project-wide against a real, production-intent database"
    - "Every edge function must set Access-Control-Allow-Origin/-Headers and handle an OPTIONS preflight (corsHeaders + early-return pattern in process-direct-sale/index.ts, receive-shipment/index.ts) — a function missing this is invisible to unit/integration tests (they call the function directly, not through a browser) and only surfaces via a real browser E2E hit against the deployed function, which is exactly what this plan's spec is for."

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
    - supabase/functions/create-staff/index.ts (added missing CORS headers + OPTIONS handler — fixed in source, not yet deployed)

key-decisions:
  - "Task 1's checkpoint (service_role key + fixture admin credentials) was pre-resolved by the calling instructions — executed straight through to Task 2 without re-asking."
  - "Fixture admin's profiles.locale is explicitly pinned to en-US at seed time — the app's cold-start default (es-MX) broke every English-text UI selector in the spec (e.g. the button read 'Cobro', not 'Checkout')."
  - "Step 0's caja/shift safety guard deviates from the plan's literal branch wording: the plan's 'close leftover XOR open new' branches would leave NO open caja session for a recovery run's own checkout leg. Fixed to always ensure exactly one open session (and a matching open shifts row, which the plan didn't mention at all — normally created by the app's own opening-cash dialog, which loginAsNamed skips once a caja session is already open) before proceeding — a Rule 1/3 correctness fix, not a scope change."
  - "The remote payments.tip_amount / migration-sync gap this plan discovered was fixed by the orchestrator directly (migration repair + db push on an upgraded Supabase CLI, outside this worktree) after this plan first surfaced it as a blocking checkpoint. This plan's job was to prove/expose the gap via the E2E spec, which it did — the fix itself was out of this plan's own scope and permission envelope."
  - "Fixed the create-staff CORS bug directly in source (Rule 1/2 — a missing-CORS bug is explicitly a Rule 2 example, and it's a small, well-scoped, revertible fix mirroring an established sibling pattern already in this exact file tree), but did NOT deploy it — `supabase functions deploy` was blocked by the same auto-mode permission classifier as the earlier migration-repair block. Surfaced as a second checkpoint rather than worked around."
  - "Found 5 other edge functions (settings-backup/restore/test-email/email-status, send-receipt-email) with the identical missing-CORS bug while auditing the pattern. Did NOT fix them — out of scope for this plan's spec (none of the 5 ROADMAP capabilities this plan proves touch them) — logged to .planning/WINDOWS.md instead."

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
    description: "Real shipment receiving + real cash checkout + print submission against the remote backend, proven end-to-end once the tip_amount migration gap was fixed"
    verification:
      - kind: e2e
        ref: "npm run test:e2e:remote-smoke — 'receiving -> checkout+print -> staff creation, then full self-verifying teardown' (progresses through receiving and checkout+print)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real staff-creation flow (Add Staff dialog -> create-staff edge function) against the remote backend"
    verification:
      - kind: e2e
        ref: "npm run test:e2e:remote-smoke — same test, staff-creation leg"
        status: fail
    human_judgment: true
    rationale: "Fails due to a confirmed, isolated, external bug: create-staff has zero CORS handling on the live deployed function, so the browser's preflight OPTIONS request is rejected before the real request is ever sent. Fixed in source (supabase/functions/create-staff/index.ts) but the fix requires `supabase functions deploy create-staff`, which was blocked by the auto-mode permission classifier — the same class of blocker this plan already hit once for the migration fix. Not a defect in this spec's own code."

duration: 150min
completed: 2026-08-30
status: halted
---

# Phase 20 Plan 03: Remote Backend E2E Smoke Pass Summary

**Proved login, real shipment receiving, and real cash checkout+print end-to-end against the live remote backend (after the orchestrator fixed a tip_amount migration-sync bug this plan's spec discovered) — and found a second, still-unresolved live bug: the deployed create-staff edge function has no CORS handling at all, so the real "Add Staff" dialog cannot work against the remote backend either.**

## Performance

- **Duration:** ~150 min total across the initial run and this resumption
- **Started:** 2026-08-30T12:13:00Z (approx, worktree spawn)
- **Completed:** 2026-08-30 (halted again, on a new/different blocker)
- **Tasks:** 2 of 3 executed (Task 1 pre-resolved/skipped; Task 2 complete and green; Task 3 code-complete, 4/5 of the scenario's legs now proven green, staff-creation leg blocked on a deploy)
- **Files modified:** 9 (excluding the two carried-over planning docs and the WINDOWS.md ledger)

## Accomplishments

- `playwright.remote.config.ts` + `npm run test:e2e:remote-smoke`: proven to point the dev server at the real remote Supabase project — excluded from the default `npm run test:e2e` suite (304 tests, zero from `e2e/remote-smoke/`).
- `scripts/seed-remote-e2e-admin.ts`: idempotent seeder for `E2E Remote Smoke Admin` — run repeatedly, correctly no-ops after first creation, pins `locale: 'en-US'`.
- **Login leg: passes for real**, proven multiple times.
- **Receiving leg: passes for real** — a real supplier + product created and received via the UI's Receive Shipment quick-add flow, stock confirmed via direct DB read.
- **Checkout+print leg: passes for real** — once the tip_amount migration gap (below) was fixed, a real cash sale processes end-to-end (including the app's real low-stock "Add anyway" confirmation gate) and the mocked `print_receipt` Tauri command is invoked.
- **Cleanup/refund leg: passes for real when reached** — the refund-approval flow (self-approval via the fixture admin's own PIN) completes and the caja session is closed correctly.
- **Discovered and the orchestrator resolved a live production-breaking bug**: the remote project's deployed schema was one migration behind the deployed edge-function code (`payments.tip_amount` NOT NULL vs. an edge function that never sends it), breaking every real cash/card sale. Fixed by the orchestrator via `supabase migration repair` + an upgraded-CLI `supabase db push`, confirmed via `payments.tip_amount` now returning `42703 column does not exist`.
- **Discovered a second live production-breaking bug, still unresolved**: `create-staff`'s deployed edge function has zero CORS handling (no `Access-Control-Allow-Origin`, no `OPTIONS` handler) — every real browser call to the app's own "Add Staff" dialog fails at CORS preflight. Fixed in source this session; deploy blocked (see Issues Encountered).

## Task Commits

1. **Docs: carry over gap-closure plan + verification report** — `38fddeb` (docs)
2. **Task 2 (tracer): remote-pointed Playwright config + fixture admin + real remote login** — `a163179` (feat)
3. **Task 3: expand smoke spec to receiving, checkout+print, staff creation, teardown** — `55bce38` (feat)
4. **Docs: initial SUMMARY (halted on tip_amount blocker)** — `e2b040d` (docs) — superseded by this SUMMARY after the orchestrator's fix and this resumption
5. **Fix: add missing CORS headers to create-staff edge function** — `eb6c8ee` (fix)
6. **Fix: bound refund-cleanup timeouts, verify staff creation via DB, precise error-response filters** — `39f6045` (fix)

**Plan metadata:** this SUMMARY commit (docs)

_Task 1 (`checkpoint:human-action`, collecting the service_role key and fixture admin credentials) was pre-resolved by the calling instructions — executed straight through, not re-asked, per instructions._

## Files Created/Modified

- `playwright.remote.config.ts` - new sibling Playwright config, loads `.env.remote-e2e`, `workers: 1`/`retries: 0`
- `e2e/remote-smoke/remote-backend-smoke.spec.ts` - the two-test remote-smoke spec (login; full scenario)
- `scripts/seed-remote-e2e-admin.ts` - idempotent fixture-admin seeder, pins `locale: 'en-US'`
- `e2e/helpers/requireEnv.ts` - added `requireRemoteSmokeEnv()`
- `e2e/helpers/supabase.ts` - fixed a pre-existing `noUncheckedIndexedAccess` type error in `getMigrationList()`
- `playwright.config.ts` - `testIgnore` gains `/remote-smoke\//`
- `package.json` - new `test:e2e:remote-smoke` script
- `.gitignore` - `.env.remote-e2e`, `e2e-results-remote-smoke/`, `playwright-report-remote-smoke/`
- `.env.remote-e2e` - created on disk, gitignored, never committed
- `supabase/functions/create-staff/index.ts` - added `corsHeaders` const + `OPTIONS` early-return + spread into every response's headers (mirrors `process-direct-sale/index.ts`)
- `.planning/WINDOWS.md` - two new entries (tip_amount deviation; 5-function CORS gap)

## Decisions Made

See `key-decisions` in frontmatter for full rationale on: locale pinning, Step 0's caja/shift guard fix, not attempting the migration fix directly, fixing create-staff's CORS bug in source but not deploying it, and not fixing the other 5 CORS-missing functions (out of scope).

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
- **Fix:** Added `{ timeout: 10_000 }` to the reason-trigger/option/approval clicks, an upfront `expect(itemCheckboxes.first()).toBeVisible()` + selected-count guard, and an `expect(requestApprovalBtn).toBeEnabled()` assertion before clicking.
- **Committed in:** `39f6045`

**6. [Rule 1 - Bug] Staff-creation UI assertion strengthened with a direct DB check**
- **Found during:** same re-run — the UI's `getByText(staffName, {exact:true})` assertion passed once even though no `profiles` row was ever created (later traced to the CORS bug; the UI assertion alone can't distinguish a real success from a stale/optimistic render)
- **Fix:** Added `expect.poll(() => db.from('profiles')...)` immediately after the UI assertion, so this leg proves the edge function actually ran, not just that the UI looked happy.
- **Committed in:** `39f6045`

**7. [Rule 1/2 - Bug/Missing Critical] create-staff edge function missing CORS headers entirely**
- **Found during:** this resumption, staff-creation leg consistently failing with `net::ERR_FAILED` / CORS preflight rejection after fixes #5/#6 above (which ruled out spec-side causes)
- **Issue:** `supabase/functions/create-staff/index.ts` had no `Access-Control-Allow-Origin`/`-Headers` and no `OPTIONS` handler at all — unlike every sibling function. Confirmed by checking all 12 deployed functions: 5 more (`settings-backup`, `settings-restore`, `settings-test-email`, `settings-email-status`, `send-receipt-email`) have the identical gap.
- **Fix:** Added the same `corsHeaders` + `OPTIONS`-early-return pattern already used by `process-direct-sale/index.ts` to `create-staff/index.ts` only (in scope — the other 5 aren't exercised by this plan's spec, logged to `.planning/WINDOWS.md` instead of fixed).
- **Files modified:** `supabase/functions/create-staff/index.ts`
- **Verification:** Fix is syntactically consistent with the working sibling pattern; **not yet verified live** — `supabase functions deploy create-staff` is blocked (see Issues Encountered).
- **Committed in:** `eb6c8ee`

---

**Total deviations:** 7 auto-fixed
**Impact on plan:** All necessary for the spec to progress; #7 is the most significant — a genuine, currently-live bug in shipped application code (not test code, not infra config), found only because this plan drives a real browser against the real deployed function instead of calling it directly.

## Issues Encountered

### 1. RESOLVED — remote schema one migration behind deployed code (payments.tip_amount)

Originally surfaced as this plan's blocking checkpoint (see prior commit `e2b040d`'s SUMMARY content, superseded by this one). The orchestrator resolved it outside this worktree:

1. `supabase migration repair --status reverted 20260828234316 20260828235834` — reconciled the two orphaned remote-only migration-ledger entries.
2. Upgraded the Supabase CLI (2.90.0 → 2.116.0) — the outdated CLI hit "cannot insert multiple commands into a prepared statement" (SQLSTATE 42601) applying `20260828000001_drop_tip_amount.sql`, a known CLI/pooler bug, confirmed to have touched nothing on the failed attempt (atomic failure at statement 0).
3. Re-ran `supabase db push` on the upgraded CLI — succeeded. `supabase migration list` now shows every local migration matching remote.
4. Verified directly: `payments.tip_amount` now returns `{"code":"42703","message":"column payments.tip_amount does not exist"}`.

Confirmed fixed this session: the receiving and checkout+print legs of the full scenario now pass for real against the remote backend.

### 2. UNRESOLVED, BLOCKING — create-staff edge function has no CORS handling

After the tip_amount fix, the full-scenario test progressed through receiving and checkout+print but failed at staff creation. Diagnostic trail:

1. First suspected a spec bug (staff creation had briefly, once, shown a false-positive UI success with no underlying DB row — fixed via deviation #6's DB-poll check).
2. With the DB-poll check in place, the leg failed deterministically. Widened a diagnostic `page.on('response', ...)` listener (initially mismatched on the dev server's own Vite-served source-file URLs for `create-staff` — fixed via deviation-adjacent filter narrowing to `functions/v1/create-staff` — see commit `39f6045`) and grepped the tailed browser console output (already streamed to stdout by `e2e/fixtures.ts`).
3. Found the real cause: `[browser][error] ... Access to fetch at '.../functions/v1/create-staff' ... blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present.`
4. Read `supabase/functions/create-staff/index.ts` in full: confirmed zero CORS handling anywhere, unlike `process-direct-sale/index.ts` (which defines `corsHeaders` and an `OPTIONS` early-return).
5. Audited all 12 deployed functions for the same pattern: 6 total (including create-staff) are missing it.

**Fixed in source** (`eb6c8ee`) but **not yet live** — `supabase functions deploy create-staff --project-ref mkvinyekkyennyegfoxq` was **blocked by the auto-mode permission classifier**, the same class of block hit earlier for the migration repair. Per the classifier's own instruction, no workaround was attempted (e.g. no alternate deploy path, no direct API call bypassing the CLI's own guardrails).

## CHECKPOINT REACHED

**Type:** human-action
**Gate:** blocking
**Plan:** 20-03
**Progress:** 4/5 of the full scenario's legs now proven green (login, receiving, checkout+print, cleanup/refund-when-reached); staff creation blocked on a deploy.

### What was attempted

`supabase functions deploy create-staff --project-ref mkvinyekkyennyegfoxq` — deploying this plan's own CORS fix (already committed, `eb6c8ee`) to the live remote project.

### Why it's blocked

The auto-mode permission classifier denies live-remote-project mutations from this agent, same as the earlier `supabase migration repair` block. Deploying an edge function is lower-risk than the earlier schema migration (stateless, instantly revertible by redeploying the prior version), but is still a live-remote-project write this agent cannot self-authorize.

### Awaiting

One of:
1. Grant permission for `supabase functions deploy create-staff --project-ref mkvinyekkyennyegfoxq`, then resume this plan so the staff-creation leg (and the full two-consecutive-runs idempotency proof) can be re-verified.
2. Run that command yourself, then signal resume.

### Notes

- All fixture/debug rows and sessions created during this session's diagnostic work were cleaned up before this SUMMARY was written (verified via direct service-role queries: zero stray `E2E-REMOTE-SMOKE`-prefixed suppliers/staff, zero open caja sessions). Deactivated fixture products from successful checkout runs remain (expected — they carry real `order_items` references and are never hard-deleted, matching the plan's own accepted-footprint design).
- `npm run typecheck` and `npm run lint` both still pass with all files (new and modified) included.
- `npx playwright test --list` under the default config still shows zero tests from `e2e/remote-smoke/`.

## User Setup Required

None beyond the CHECKPOINT above.

## Next Phase Readiness

- **Not yet ready to close ROADMAP Phase 20 Success Criterion 5.** 4 of 5 capabilities (login, receiving, checkout, print) are proven end-to-end against the real remote backend. The 5th (staff creation) is blocked purely on a deploy permission for an already-fixed, already-committed one-file change.
- Once unblocked: re-run `npm run test:e2e:remote-smoke` (should pass in full), then run it a second consecutive time immediately after (idempotency proof), then confirm `npm run typecheck`/`npm run lint` and the `/remote-smoke\//` exclusion one final time.
- `.planning/phases/20-store-deployment-installer/20-VERIFICATION.md`'s one confirmed blocking gap remains open until the above passes.
- `.planning/WINDOWS.md` carries two open entries from this plan: the (now-superseded, can be marked resolved) tip_amount deviation, and the 5-function CORS gap (genuinely still open, needs a follow-up phase).

## Self-Check: PASSED

- FOUND: `playwright.remote.config.ts`
- FOUND: `e2e/remote-smoke/remote-backend-smoke.spec.ts`
- FOUND: `scripts/seed-remote-e2e-admin.ts`
- FOUND: `e2e/helpers/requireEnv.ts` (modified)
- FOUND: `supabase/functions/create-staff/index.ts` (modified)
- FOUND: `.planning/phases/20-store-deployment-installer/20-03-PLAN.md`
- FOUND: `.planning/phases/20-store-deployment-installer/20-VERIFICATION.md`
- FOUND: commit `38fddeb`, `a163179`, `55bce38`, `e2b040d`, `eb6c8ee`, `39f6045`

---
*Phase: 20-store-deployment-installer*
*Completed: 2026-08-30 (halted)*
