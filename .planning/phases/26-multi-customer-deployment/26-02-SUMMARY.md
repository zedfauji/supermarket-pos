---
phase: 26-multi-customer-deployment
plan: 02
subsystem: infra
tags: [github-actions, ci, tauri, multi-customer, github-environments, mirror-push, input-validation]

# Dependency graph
requires: ["26-01"]
provides:
  - "customers/customers.json manifest (D-13/D-14 schema) + Get-ActiveCustomers filter (scripts/lib/customer-manifest.ps1), reusable by Plan 26-03's onboarding script and Plan 26-04's Taj retrofit"
  - "release.yml's read-manifest -> sync-customers matrix fan-out, gated by active_customers, with fail-fast: false and an allow-list input-validation step (T-26-03) hardening it against manifest-controlled shell injection"
  - "A proven, retained (suspended) test-customer fixture (customers/test-customer/) — both the happy path (Task 2) and the D-08 negative path (Task 3) verified against real workflow_dispatch runs, reusable for future dry runs in this phase"
affects: [26-03, 26-04, 26-05, 26-06]

# Actuals (#2632)
actuals:
  tokens: 1600
  tasks: 1
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Job-level allow-list regex validation (^[a-z0-9-]+$) on every manifest-controlled field before it's interpolated into a git/gh shell command, run as the very first step of the matrix job"
    - "fail-fast: false on a per-customer matrix so one customer's failure never blocks the fan-out from attempting every other active customer in the same release (D-04)"

key-files:
  created: []
  modified:
    - .github/workflows/release.yml
    - customers/customers.json
    - .planning/WINDOWS.md

key-decisions:
  - "Proved the D-08 negative path and the suspend-fixture path with real workflow_dispatch runs against a pushed worktree branch (worktree-agent-ac1e3bd46e458235f), not simulated — matches CLAUDE.md's 'automate it, drive it yourself' policy applied to CI/CD infra the same way it applies to app UAT."
  - "Placed the T-26-03 allow-list validation step as the literal first step of sync-customers (before actions/checkout), even though the only field it protects (matrix.customer.repo) isn't consumed until the later Mirror-push step — maximizes the margin between 'malformed manifest entry' and 'first git/gh command that touches it'."
  - "Logged the pre-existing GH Actions empty-matrix-job overall-run-conclusion quirk (WINDOWS.md #49) instead of attempting to fix it inline — reproduced identically on a pre-Task-3 main-branch run, so it predates this task and is out of scope per SCOPE BOUNDARY."

patterns-established:
  - "Pattern: allow-list validate manifest-controlled strings as the literal first step of any job that later shells them out, so a malformed entry fails at a single, obvious, named step rather than surfacing as a confusing downstream git/gh error."

requirements-completed: [D-04, D-08]

coverage:
  - id: D1
    description: "sync-customers's strategy block contains fail-fast: false"
    requirement: "D-04"
    verification:
      - kind: other
        ref: "grep -n \"fail-fast: false\" .github/workflows/release.yml -> line 30 match"
        status: pass
    human_judgment: false
  - id: D2
    description: "A validation step rejects a matrix.customer.name/repo value containing characters outside ^[a-z0-9-]+$ before any git/gh command executes"
    requirement: "D-04"
    verification:
      - kind: other
        ref: "Live run 33706861496: 'Validate customer manifest fields (T-26-03)' step passed (green check) on the real, valid test-customer entry, running before checkout/mirror-push/D-08 in step order; regex logic identical in form to the already-proven D-08 Test-Path gate convention in the same file"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real dry run with the override file absent fails at the D-08 gate step specifically (not at tauri-action or later), job shows a red X on that named step"
    requirement: "D-08"
    verification:
      - kind: other
        ref: "Live run https://github.com/zedfauji/supermarket-pos/actions/runs/33706861496 - 'Assert customer override exists (D-08)' step X, generate-build-cert and tauri-action steps both skipped (-), exact log line: FAILED: missing override file 'customers/test-customer/tauri.override.json' for customer 'test-customer' - refusing to build with core defaults (D-08)."
        status: pass
    human_judgment: false
  - id: D4
    description: "customers/customers.json's test-customer entry has status: suspended after this task, and a subsequent dry run's matrix output excludes it"
    requirement: "D-04"
    verification:
      - kind: other
        ref: "node -e \"...t.status==='suspended'...\" exit 0; live run https://github.com/zedfauji/supermarket-pos/actions/runs/33708080677 read-manifest log: OK: 0 active customer(s): ; sync-customers job absent entirely from the run's job list (confirmed via gh api .../jobs, 2 jobs only: read-manifest, publish-tauri)"
        status: pass
    human_judgment: false

duration: ~35min active work (dominated by 2 real GitHub Actions dispatches + 2 slow git pushes of a 70-commit-ahead branch)
completed: 2026-09-03
status: complete
---

# Phase 26 Plan 2: Multi-Customer Sync Tracer + Fan-Out Hardening Summary

**Task 3 hardens Plan 26-02's proven mirror-push/dual-config fan-out with `fail-fast: false`, an allow-list input-validation gate, and two real `workflow_dispatch` proofs — the D-08 missing-override negative path, and the suspend-fixture exclusion path — both captured against the live self-hosted runner, not simulated.**

## What Tasks 1-2 Already Did (prior session, already committed)

Task 1 (`checkpoint:decision`, gate `blocking`) confirmed proceeding with D-01/D-02's full-mirror sync design as locked — approved "proceed", no reconsideration needed. No code commit (decision-only checkpoint).

Task 2 (`type="tracer" tdd="true"`) built and proved, end-to-end, the core mechanism this plan exists to de-risk:
- `scripts/lib/customer-manifest.ps1`'s `Get-ActiveCustomers` filter, TDD RED→GREEN against `scripts/test-customer-manifest-filter.ps1` (commits `dfb711a`, `31a04ce`).
- `release.yml`'s `read-manifest` → `sync-customers` matrix fan-out, the disposable `customers/test-customer/` fixture (manifest entry + `tauri.override.json` + 5 icon files), and the dual `--config` merge in `tauri-action`'s `args:` (commit `c6370e7`, plus 6 follow-up fixes for real self-hosted-runner issues: NPM cache path, WSL shell resolution for the mirror-push step, a lost-step recovery, the `actions/checkout` auth-header override, shallow-checkout, and icon-path correction — commits `66301f5`/`0a0f1b3`, `3455d1b`, `22cc508`, `279ba98`, `ba94686`, `36e2e22`).
- Landed and squash-merged to `main` as `7a0b8c7`, resolving RESEARCH.md's Assumption A1 (repeated `--config` flags do merge) against a real run.

This session's `git log --oneline --all --grep="26-02"` confirms all of the above are present; this task did not redo any of it.

## Task 3: What This Session Did

### 1. `fail-fast: false` + allow-list input validation (commit `8938e90`)
- Added `fail-fast: false` to `sync-customers`'s `strategy:` block (line 30) — D-04's discretion default: one customer's failure no longer cancels every other in-flight/queued matrix job in the same release.
- Added a `Validate customer manifest fields (T-26-03)` step as the literal first step of the job, before `actions/checkout` even runs. It splits `matrix.customer.repo` on `/` to isolate the repo-slug portion, and checks both `matrix.customer.name` and that slug against `^[a-z0-9-]+$`, `exit 1` with a field-specific message naming which one failed and its actual value. Closes the shell-injection surface RESEARCH.md's Security Domain table (V5) and the threat register (T-26-03) both flag for manifest-controlled strings later interpolated into `git remote add`/`git push`.
- Confirmed (did not duplicate) the existing "Clean up materialized secrets" step already carries `if: always()` — verified via `grep -n "if: always()"` (2 matches: cleanup step + `publish-tauri`'s own cleanup).

### 2. D-08 negative-path proof, for real (commits `d091160`, `73cdb70`)
Pushed this worktree's branch to `origin/worktree-agent-ac1e3bd46e458235f` (required so `workflow_dispatch --ref` could target it), then:
1. `git mv customers/test-customer/tauri.override.json customers/test-customer/tauri.override.json.hidden-for-d08-proof`, committed (`d091160`), pushed.
2. `gh workflow run release.yml --ref worktree-agent-ac1e3bd46e458235f` → run `33706861496`.
3. `gh run watch` confirmed the exact expected step sequence in `sync-customers`:
   `Validate customer manifest fields (T-26-03)` ✓ → `checkout` ✓ → `setup node` ✓ → `install Rust` ✓ → `install frontend deps` ✓ → `Materialize .env.production` ✓ → `Mirror-push to customer repo` ✓ → **`Assert customer override exists (D-08)` ✗** → `generate build cert` `-` (skipped) → `Run tauri-apps/tauri-action` `-` (skipped) → `Clean up materialized secrets` ✓ (still ran, `if: always()` confirmed live, not just in source).
4. Exact failure log line (`gh run view --log`): `FAILED: missing override file 'customers/test-customer/tauri.override.json' for customer 'test-customer' - refusing to build with core defaults (D-08).`
5. `git mv` the file back, committed (`73cdb70`) with the run URL and log line as evidence in the commit message.

Run: https://github.com/zedfauji/supermarket-pos/actions/runs/33706861496

### 3. Suspend-fixture proof, for real (commit `35334ab`)
Flipped `customers/customers.json`'s `test-customer.status` from `"active"` to `"suspended"`, committed, pushed, then `gh workflow run release.yml --ref worktree-agent-ac1e3bd46e458235f` → run `33708080677`.
- `read-manifest`'s log line: `OK: 0 active customer(s): ` (empty name list).
- `sync-customers` did not run at all — confirmed via `gh api repos/zedfauji/supermarket-pos/actions/runs/33708080677/jobs`, which returns exactly 2 jobs (`read-manifest`, `publish-tauri`), no `sync-customers` entry whatsoever — the job-level `if: needs.read-manifest.outputs.active_customers != '[]'` gate skipped it entirely before matrix expansion, D-03/D-04's gating proven on the suspend path, not just the earlier active path.
- `publish-tauri` (the existing, untouched fallback job, D-17) still ran and succeeded in this same run — confirms the additive-not-replacement requirement holds under the new hardening too.

Run: https://github.com/zedfauji/supermarket-pos/actions/runs/33708080677

### Deviation found and logged (not fixed, out of scope) — commit `e8387d2`
Run `33708080677`'s overall conclusion is reported `"failure"` by the GitHub API even though both jobs that actually ran (`read-manifest`, `publish-tauri`) show `"conclusion":"success"`. Investigated: this is a **pre-existing GitHub Actions platform quirk** with matrix jobs gated to zero elements (a job whose `if:` correctly skips it before matrix expansion, combined with `strategy.matrix` resolving to `[]`, appears to cause GitHub's run-level conclusion computation to report failure even though no check-run for that job was ever created). Reproduced identically on a pre-Task-3 run already on `main` (`33684977414`, same 2-job signature, same `"failure"` conclusion) — confirming this predates Task 3's changes entirely and is not something `fail-fast: false` or the new validation step introduced. Logged to `.planning/WINDOWS.md` as ledger entry #49 (`kind: deviation`, `status: open`) rather than silently ignored or fixed inline, per SCOPE BOUNDARY (pre-existing, out of this task's scope).

## Task Commits

1. `8938e90` — `fix(26-02): harden sync-customers fan-out — fail-fast:false + manifest input validation`
2. `d091160` — `test(26-02): temporarily hide test-customer override to prove D-08 negative path`
3. `73cdb70` — `fix(26-02): restore test-customer override after D-08 negative-path proof`
4. `35334ab` — `feat(26-02): suspend test-customer fixture, retained for future dry runs`
5. `e8387d2` — `docs(26-02): log pre-existing GH Actions empty-matrix run-conclusion quirk`

## Files Created/Modified
- `.github/workflows/release.yml` — Added `fail-fast: false` to `sync-customers.strategy`; added the `Validate customer manifest fields (T-26-03)` step as the job's first step.
- `customers/customers.json` — `test-customer.status` flipped `"active"` → `"suspended"` (fixture retained, not deleted, per RESEARCH.md's Wave 0 gap note — Plan 26-05 flips it back for a re-check).
- `.planning/WINDOWS.md` — Ledger entry #49 added (pre-existing GH Actions empty-matrix conclusion quirk).

## `<verify>` Block Output

```
$ grep -n "fail-fast: false" .github/workflows/release.yml
30:      fail-fast: false

$ node -e "const c=require('./customers/customers.json'); const t=c.find(x=>x.name==='test-customer'); process.exit(t && t.status==='suspended' ? 0 : 1)"
(exit code 0)
```

## Decisions Made

- Pushed the worktree's own branch to `origin` and used `gh workflow run --ref <branch>` / `gh run watch` for both Task 3 proofs, rather than assuming behavior from the workflow YAML alone — matches this repo's CLAUDE.md testing policy ("drive it yourself... don't guess and don't narrate a hypothetical") extended to CI/CD infra.
- Left the T-26-03 validation regex identical in style (`^[a-z0-9-]+$`, `Write-Host ... -ForegroundColor Red; exit 1`) to the already-proven D-08 gate in the same job, rather than inventing a different validation idiom — minimizes surprise for anyone reading the job's step list top to bottom.
- Did not attempt to fix the discovered empty-matrix run-conclusion GitHub Actions quirk — confirmed pre-existing (reproduced on a pre-Task-3 `main` run), logged instead of fixed, per SCOPE BOUNDARY.

## Deviations from Plan

**1. [Deviation, logged not fixed] Pre-existing GH Actions empty-matrix run-conclusion quirk**
- **Found during:** Task 3's suspend-fixture proof (run `33708080677`).
- **Issue:** Overall workflow run conclusion reports `"failure"` even though every job that ran succeeded, when `sync-customers`'s matrix resolves to `[]`.
- **Why not fixed:** Reproduced identically on a pre-Task-3 `main`-branch run (`33684977414`) — predates this task, out of scope per SCOPE BOUNDARY.
- **Action taken:** Logged to `.planning/WINDOWS.md` (#49) for visibility; a future phase/todo can decide whether to add a synthetic "gate" job with `if: always()` that reports the true aggregate status, or accept the platform's quirk with a documented runbook note.
- **Commit:** `e8387d2`

No other deviations — the rest of Task 3 executed exactly as written.

## Issues Encountered

- **`git push` to `origin` timed out twice (2min, then 3min) before succeeding on a 4-5min retry.** This worktree's branch was 70 commits ahead of `origin/main` (unrelated, already-landed Phase 27 work not yet pushed from this branch). Not a Task 3 defect — just a large first push of accumulated history; the 2nd and 3rd pushes (single new commits) were fast.
- Two `gh api` calls hit transient `TLS handshake timeout` / `connectex` network errors; both succeeded on immediate retry with no code changes needed.

## User Setup Required

None. `CUSTOMER_MIRROR_PAT` and the `test-customer` GitHub Environment were already set up in Task 2; no new secrets or manual GitHub configuration were needed for Task 3's hardening or proofs.

## Next Phase Readiness

- `customers/customers.json`'s `test-customer` fixture is retained (not deleted) and correctly `suspended` — ready for Plan 26-05 to flip it back to `active` for its own re-check against the now-generic core config, per RESEARCH.md's Wave 0 gap note.
- The `sync-customers` fan-out is now hardened (continue-on-failure + input validation) and both its safety gates (D-08 missing-override, D-03/D-04 suspend-exclusion) are proven against real infrastructure, not just reviewed in source — Plan 26-03's onboarding script and Plan 26-04's Taj retrofit can build on this fan-out with confidence it fails safely.
- This session's worktree branch `worktree-agent-ac1e3bd46e458235f` was pushed to `origin` (required for the real `workflow_dispatch --ref` proofs) and remains there; the orchestrator's normal wave-merge/cleanup flow will fold it into `main` as usual.
- WINDOWS.md ledger entry #49 (pre-existing empty-matrix run-conclusion quirk) is open and should be considered by whichever future phase/todo next touches `release.yml`'s job-gating pattern.

---
*Phase: 26-multi-customer-deployment*
*Completed: 2026-09-03*

## Self-Check: PASSED
