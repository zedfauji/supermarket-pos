---
phase: 07-backend-data-integrity
verified: 2026-08-17T20:00:00Z
reverified: 2026-08-18T00:56:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
gap_closure_note: >
  The single gap below (SC3 proof artifact failing at runtime) was closed by the orchestrator
  directly after this report: e2e/56-settings-backup-restore.spec.ts line 22's locator was
  rescoped from `page.locator('div').filter({ hasText: 'Manual backup' })` (matched the ancestor
  list wrapper, causing a strict-mode violation on the Restore button) to
  `page.locator('div.rounded-md.border').filter({ hasText: 'Manual backup' })` (the row's own
  class, per BackupSettingsTab.tsx line 85-87). Re-ran `npx playwright test
  e2e/56-settings-backup-restore.spec.ts --retries=0` three consecutive times: 3/3 passed
  (~28s each). Committed as 80f8bbe. Gap record retained below for audit trail.
gaps_closed:
  - truth: "settings-backup and settings-restore edge functions complete successfully end-to-end with no pool_tables reference, verified by an integration/E2E test exercising both functions against the current schema (ROADMAP Phase 7 Success Criterion #3)."
    status: closed
    reason: >
      The underlying code fix IS correct: `grep pool_tables` across both edge functions returns zero matches,
      a line-by-line read of both files confirms a clean symmetric deletion (no dangling destructuring/error-check/
      snapshot-field), and a live browser run against the running app + live supabase-edge-functions container
      independently confirmed both "Backup created." and "Backup restored." toasts fire successfully end-to-end
      with zero pool_tables errors. However, the specific artifact this Success Criterion names as its proof —
      e2e/56-settings-backup-restore.spec.ts — fails deterministically on every real run (verified twice, including
      through Playwright's built-in retry) with a strict-mode locator violation, before the restore flow is ever
      exercised. Per this project's CLAUDE.md testing policy ("every verification MUST be automated Playwright E2E"
      and "a phase is not complete until its verification is passed via automated E2E"), a reproducibly-failing
      required E2E spec means SC3 is not met by a passing automated test today, even though the feature itself works.
      07-02-SUMMARY.md also claims this was "logged to the broken-windows ledger (.planning/WINDOWS.md, entry #1)"
      for post-merge follow-up — no such entry exists in the current WINDOWS.md (entry #1 there is an unrelated
      Phase 01 caja-close flake). The re-run-after-merge step described in the SUMMARY appears not to have happened,
      or happened and was not fixed.
    artifacts:
      - path: "e2e/56-settings-backup-restore.spec.ts"
        issue: >
          Line 22's locator `page.locator('div').filter({ hasText: 'Manual backup' }).first()` is not scoped to a
          single backup-history row. Because every ancestor `div` up the DOM tree also contains the text "Manual
          backup" (React's nested wrapper structure), `.first()` resolves to a container that wraps the ENTIRE
          backup history list, not just the newest row. The following
          `.getByRole('button', { name: 'Restore' })` then matches every "Restore" button in the whole history
          (3-6 elements observed across two live runs, since prior test runs accumulate backup rows in the shared
          dev DB), producing a Playwright strict-mode violation and failing the test before restore is exercised.
    missing:
      - >
        Scope the locator to exactly one row, e.g. `page.getByRole('button', { name: 'Restore', exact: true }).first()`
        directly (verified working via an ad hoc diagnostic run using the plan's own beforeEach/fixtures: "Backup
        created." then "Backup restored." both appeared, confirming the underlying fix and only the test's locator
        needs correcting), or add a stable `data-testid`/scoped row locator (e.g. `page.locator('[data-slot=...]').first()`
        restricted to a leaf row element, not an ancestor `div`).
      - "Re-run `npx playwright test e2e/56-settings-backup-restore.spec.ts` after the locator fix and confirm a real pass."
---

# Phase 7: Backend Data Integrity Verification Report

**Phase Goal:** Restocking a product never silently destroys prior cost/expiry data, and the settings backup/restore edge functions work end-to-end against the current schema.
**Verified:** 2026-08-17T20:00:00Z
**Re-verified:** 2026-08-18T00:56:00Z — gap closed, see `gap_closure_note` in frontmatter
**Status:** passed
**Re-verification:** Yes — locator fix (80f8bbe) confirmed 3/3 real passes after initial `gaps_found`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Receiving the same product twice at different cost/expiry produces a weighted-average `cost_price` and the earlier of the two expiry dates (SC1) | ✓ VERIFIED | Migration `20260819000003_receive_shipment_weighted_avg_cost.sql` confirmed live via `pg_get_functiondef` on `supabase-db` — matches the committed file byte-for-byte (FOR UPDATE lock, D-02 zero-stock branch, D-01/D-03 weighted-avg + COALESCE/LEAST merge). Re-ran `npx vitest run src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts` myself against the live DB: **5/5 passed** (happy path, zero-stock replace-outright, 3-case NULL-expiry truth table). |
| 2 | Historical margin numbers for sales completed before a restock are unchanged after that restock (SC2) | ✓ VERIFIED | Re-ran `npx vitest run src/entities/tab/model/product-sales-report.integration.test.ts` myself: **7/7 passed**, including the new `D-06: receive_shipment does not alter a previously-sold item margin` test (asserts margin/costTotal/revenue unchanged after a `receive_shipment` call using a cost of 50 vs. a snapshot of 5 — an accidental live-cost read would be obvious). |
| 3 | `settings-backup`/`settings-restore` complete end-to-end with zero `pool_tables` references, verified by an E2E test (SC3) | ✗ FAILED | Code fix confirmed clean (`grep pool_tables` = 0 matches in both files; manual read confirms symmetric deletion, no dangling references). Feature itself independently proven working via a live browser run (see below). But the *required proof artifact*, `e2e/56-settings-backup-restore.spec.ts`, fails deterministically on every real run — see Gaps. |
| 4 | `supabase.types.ts` includes `suppliers`/`shipments`/`receipt_settings`/`receive_shipment`, `npm run typecheck` clean, no remaining `as any` for those tables (SC4) | ✓ VERIFIED | `grep -c "suppliers:\|shipments:\|receipt_settings:\|receive_shipment:" src/shared/lib/supabase.types.ts` = 4. `grep "as any" src/entities/settings/model/queries.ts` and `grep "as any\|as unknown as" src/entities/supplier/model/queries.ts` both return zero matches. Ran `npm run typecheck` myself: 0 errors. |

**Score:** 3/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260819000003_receive_shipment_weighted_avg_cost.sql` | Weighted-avg/earliest-expiry merge, live | ✓ VERIFIED | Present, matches live DB function definition exactly. |
| `src/features/receive-shipment/model/receive-shipment-weighted-avg.integration.test.ts` | 5 passing integration tests | ✓ VERIFIED | 276 lines, 5/5 pass against live DB (re-run by verifier). |
| `src/entities/tab/model/product-sales-report.integration.test.ts` (D-06 addition) | Margin regression test | ✓ VERIFIED | New `it()` present at line 476, 7/7 tests pass (re-run by verifier). |
| `supabase/functions/settings-backup/index.ts` | pool_tables removed | ✓ VERIFIED | Clean 104-line file, zero `pool_tables` references, `Promise.all` array/error-check/snapshot object all consistent (5 elements, not 6). |
| `supabase/functions/settings-restore/index.ts` | pool_tables removed | ✓ VERIFIED | Clean 150-line file, `Snapshot` type/read/upsert block for `pool_tables` fully removed, no dangling references. |
| `e2e/56-settings-backup-restore.spec.ts` | Passing E2E proof of SC3 | ✗ STUB-LIKE (fails at runtime) | File exists (30 lines), is substantive (real assertions against real UI), is wired (imports real helpers/fixtures) — but **fails on every actual run** due to an ambiguous locator (see Gaps). Exists+substantive+wired is not sufficient; it does not pass. |
| `src/shared/lib/supabase.types.ts` | Regenerated with 4 new surfaces | ✓ VERIFIED | `grep -c` confirms all 4 present; `npm run typecheck` clean repo-wide. |
| `src/entities/settings/model/queries.ts` | No `receipt_settings` cast | ✓ VERIFIED | Zero `as any` matches. |
| `src/entities/supplier/model/queries.ts` | No `suppliers`/`supplier_products` cast | ✓ VERIFIED | Zero `as any`/`as unknown as` matches. |

### Data-Flow / Live Verification (beyond static checks)

| Check | Method | Result |
|-------|--------|--------|
| `receive_shipment` live function body | `docker exec supabase-db psql ... pg_get_functiondef` | Matches committed migration exactly — confirmed live, not just committed. |
| `receive_shipment` weighted-avg integration suite | `npx vitest run` (re-executed by verifier, not trusted from SUMMARY) | 5/5 passed |
| Margin regression suite | `npx vitest run` (re-executed by verifier) | 7/7 passed |
| `settings-backup`/`settings-restore` live behavior | Direct browser automation (verifier-authored diagnostic script, admin login → create backup → restore backup) against the running dev server + live `supabase-edge-functions` container | Both "Backup created." and "Backup restored." toasts fired — confirms the code fix works live, independent of the broken E2E spec |
| Delivered E2E spec `e2e/56-settings-backup-restore.spec.ts` | `npx playwright test e2e/56-settings-backup-restore.spec.ts` (re-executed by verifier, twice) | **FAILED both times** — strict-mode locator violation (see Gaps) |
| Repo-wide regression gate | `npm run typecheck`, `npm run lint`, `npm run test` (all re-executed by verifier, not trusted from SUMMARY) | typecheck: 0 errors. lint: 0 errors (boundaries-plugin info-level warning only, pre-existing/unrelated). test: 1107 passed, 15 todo, 0 failed — matches SUMMARY's claimed numbers exactly. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DATA-01 | 07-01-PLAN.md | `receive_shipment` weighted-avg cost + earliest-expiry, no retroactive margin distortion | ✓ SATISFIED | Live migration + 12 passing tests (5 + 7), re-verified independently. |
| DATA-02 | 07-02-PLAN.md | `settings-backup`/`settings-restore` no longer query `pool_tables`, both work end-to-end | ⚠ SATISFIED (code) / gap (proof) | Code-level fix fully satisfies the requirement text; the ROADMAP's specific "verified by E2E test" bar is not met by a currently-passing test (see gap above). |
| DATA-03 | 07-03-PLAN.md | `supabase.types.ts` regenerated, `as any` casts removed | ✓ SATISFIED | Types present, casts removed, typecheck/lint/test all clean repo-wide, re-verified independently. |

### Anti-Patterns Found

None. Scanned every file touched by this phase (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/empty-implementation patterns) — zero matches in all 9 files.

### Documentation Accuracy Note (not a gap, but relevant to trust calibration)

- `.planning/ROADMAP.md` lines 154/155/159 still show `[ ]` (unchecked) for all three Phase 7 plans, despite all three being merged to `main` — a bookkeeping gap, not a functional one; flagged for whoever runs `/gsd-ship` next.
- 07-02-SUMMARY.md's claim of a WINDOWS.md ledger entry logging the unrun E2E verify does not match the actual `.planning/WINDOWS.md` (no Phase 07 entry exists there — entry #1 is an unrelated Phase 01 item). Combined with the E2E spec still failing on a real run today, this suggests the "run it for real after merge" follow-up described in the SUMMARY did not happen (or happened and silently failed without being logged).

### Gaps Summary

Two of three plans (07-01, 07-03) are fully and independently verified — live DB function confirmed, all integration tests re-executed and passing, full repo-wide typecheck/lint/unit-test gate re-run clean. The core DATA-01 and DATA-03 fixes are solid.

07-02 (DATA-02)'s underlying code fix is also solid and was independently proven to work via a live, from-scratch browser automation run against the actual running app and edge-function container — both the backup and restore calls succeed with zero `pool_tables` errors. The one real gap is narrow and mechanical: the delivered `e2e/56-settings-backup-restore.spec.ts` uses a `div`-text-filter locator that isn't scoped to a single backup row, so it throws a Playwright strict-mode violation on every run once more than one backup row exists in the shared dev database (which is now permanently true, since every past test run leaves rows behind). This is a one-line locator fix (`page.getByRole('button', { name: 'Restore', exact: true }).first()` was verified working in an ad hoc diagnostic run). Per this project's explicit CLAUDE.md policy that every verification must be a passing automated Playwright E2E test — not "the feature works when I drove it by hand" — this phase cannot be marked fully passed until that one-line fix lands and the spec is confirmed green on a real run.

---

_Verified: 2026-08-17T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
