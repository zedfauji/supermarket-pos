---
phase: 26-multi-customer-deployment
plan: 04
subsystem: infra
tags: [tauri, github-actions, mirror-push, powershell, customer-onboarding, verification]

# Dependency graph
requires:
  - phase: "26-02"
    provides: "sync-customers matrix fan-out + customers.json manifest schema + Get-ActiveCustomers filter"
  - phase: "26-03"
    provides: "onboard-customer.ps1 conventions (repo/Environment/PAT idioms) reused manually for Taj's real infra"
provides:
  - "customers/taj-house-of-spices/tauri.override.json + icons - Taj's real identity, byte-identical to src-tauri/tauri.conf.json (D-16)"
  - "customers.json's taj-house-of-spices entry, active, reusing Plan 26-01's GitHub Environment"
  - "verify-installer-integrity.ps1 Check 6 - identifier/publisher/updater-endpoint byte-for-byte comparison, RED/GREEN proven"
  - "A real, private zedfauji/supermarket-pos-taj repo with a real CUSTOMER_MIRROR_PAT secret and a real signed installer built + verified through the new fan-out path"
affects: [26-05, 26-06]

# Actuals (#2632)
actuals:
  tokens: 2400
  tasks: 1
  commits: 5

tech-stack:
  added: []
  patterns:
    - "-TauriOverridePath optional param (default $PSScriptRoot-relative) added to verify-installer-integrity.ps1, following the same pattern as every other check's $PSScriptRoot-relative path — allows Check 6 to be exercised against a different file for negative-path testing without touching the mandatory InstallerPath/ExpectedThumbprint contract."

key-files:
  created:
    - customers/taj-house-of-spices/tauri.override.json
    - customers/taj-house-of-spices/icons/32x32.png
    - customers/taj-house-of-spices/icons/128x128.png
    - customers/taj-house-of-spices/icons/128x128@2x.png
    - customers/taj-house-of-spices/icons/icon.icns
    - customers/taj-house-of-spices/icons/icon.ico
  modified:
    - scripts/verify-installer-integrity.ps1
    - customers/customers.json
    - .planning/WINDOWS.md

key-decisions:
  - "Task 1's checkpoint:decision (D-16 byte-identical-copy confirmation) was already resolved by the orchestrator before this session started ('proceed' selected) - not re-presented."
  - "Minting the fine-grained CUSTOMER_MIRROR_PAT is genuinely unautomatable (gh CLI/REST API has no fine-grained-PAT creation endpoint, confirmed by this same phase's Plan 26-03 finding) - stopped with a checkpoint:human-action rather than fabricating a workaround, matching the <authentication_gates> protocol. Coordinator confirmed the secret was set by hand before this session resumed."
  - "Pushed this worktree's own branch to origin and used gh workflow run --ref/gh run watch for the real proof, following Plan 26-02's established precedent, rather than assuming behavior from workflow YAML alone."
  - "A real, reproducible defect was found in the ALREADY-LANDED sync-customers mirror-push step (stale local `main` ref pushed instead of core's current main, caused by self-hosted-runner workspace persistence) but NOT fixed in this task, because fixing it requires editing release.yml, which this plan's own D-17 zero-diff gate on release.yml explicitly forbids touching. Logged to WINDOWS.md (#50) instead, matching Plan 26-02's precedent (#49) for a pre-existing quirk found during a real proof run."

patterns-established:
  - "Byte-identical field proofs are diffed programmatically (node -e string comparison against the live source file, run this session) rather than eyeballed, matching the CLAUDE.md automation-first policy applied to config parity checks."

requirements-completed: [D-15, D-16, D-17]

coverage:
  - id: D1
    description: "verify-installer-integrity.ps1's Check 6 fails specifically (not generically) when run against a missing override file"
    requirement: "D-16"
    verification:
      - kind: other
        ref: "Scoped probe (mirrors Check 6's real logic exactly) run before the override file existed: 'FAILED: Taj override file not found at customers/taj-house-of-spices/tauri.override.json.', exit 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Check 6 passes only when identifier/bundle.publisher/plugins.updater.endpoints[0] all match exactly, and fails with a field-specific message on a mismatch"
    requirement: "D-16"
    verification:
      - kind: other
        ref: "GREEN: scoped probe against the real Taj override -> 'OK: Taj's tauri.override.json identity fields ... are byte-identical', exit 0. Negative: same probe against customers/test-customer/tauri.override.json -> 'FAILED: ... field identifier mismatch: got com.example.testcustomer.supermarketpos, expected com.tajhouseofspices.supermarketpos.', exit 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "customers/taj-house-of-spices/tauri.override.json's three identity fields are character-for-character identical to src-tauri/tauri.conf.json's values, diffed not eyeballed"
    requirement: "D-16"
    verification:
      - kind: other
        ref: "node -e string-equality comparison of identifier/bundle.publisher/plugins.updater.endpoints[0] between src-tauri/tauri.conf.json and the new override -> 3/3 MATCH"
        status: pass
    human_judgment: false
  - id: D4
    description: "src-tauri/tauri.conf.json and release.yml's publish-tauri job remain byte-for-byte unchanged after this task (D-17)"
    requirement: "D-17"
    verification:
      - kind: other
        ref: "git diff --stat src-tauri/tauri.conf.json .github/workflows/release.yml -> empty, checked twice (immediately after scaffolding and again after the real workflow_dispatch run)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real workflow_dispatch of the sync-customers fan-out builds and ships a real signed Taj installer through the new path, passing all 6 verify-installer-integrity.ps1 checks including Check 4's baked remote Supabase ref"
    requirement: "D-17"
    verification:
      - kind: other
        ref: "Real run https://github.com/zedfauji/supermarket-pos/actions/runs/33771536782 - all 3 jobs succeeded (read-manifest 25s, publish-tauri 3m44s, sync-customers/taj-house-of-spices 4m1s). verify-installer-integrity.ps1 run against the real built installer (src-tauri/target/release/bundle/nsis/Supermarket POS_1.2.0_x64-setup.exe, on the self-hosted runner's own workspace) with -ExpectedThumbprint 5F9379C7CB7592D814E4B68CEA3621D94979751B: all 6 checks OK, ending 'All checks passed', exit 0"
        status: pass
    human_judgment: false

duration: ~55min active work (dominated by a real ~4min self-hosted-runner Tauri build + signing, plus a checkpoint pause for manual PAT minting)
completed: 2026-09-03
status: complete
---

# Phase 26 Plan 4: Taj House of Spices Retrofit Summary

**Retrofitted Taj House of Spices — the one real existing customer — into Plan 26-02's proven mirror-push mechanism: created `customers/taj-house-of-spices/tauri.override.json` with byte-identical real identity values, registered Taj `active` in `customers.json` reusing Plan 26-01's Environment, and proved a real signed installer through the new fan-out path (`workflow_dispatch` run 33771536782), while `src-tauri/tauri.conf.json` and `release.yml`'s `publish-tauri` job stayed completely untouched (D-17).**

## Task 1: Checkpoint (already resolved)

Task 1 (`checkpoint:decision`, gate `blocking`, D-16) was resolved by the orchestrator before this session began — "proceed with the byte-identical copy" was selected. Not re-presented this session.

## Task 2: What This Session Did

### 1. Check 6 RED (commit `bcf7fc6`)
Added Check 6 to `scripts/verify-installer-integrity.ps1` (a new optional `-TauriOverridePath` param, default `$PSScriptRoot`-relative to `customers/taj-house-of-spices/tauri.override.json`), following Check 2's exact fail-fast-per-field shape: reads the override via `ConvertFrom-Json`, compares `.identifier`/`.bundle.publisher`/`.plugins.updater.endpoints[0]` against the three hardcoded expected values, `Fail`s naming the first mismatched field. RED proven via a scoped probe of the identical logic (the full script can't run standalone here — `-InstallerPath`/`-ExpectedThumbprint` are mandatory and no installer existed yet): `FAILED: Taj override file not found at 'customers/taj-house-of-spices/tauri.override.json'.`, exit 1.

### 2. Check 6 GREEN + override file + icons (commit `063e303`)
Created `customers/taj-house-of-spices/tauri.override.json` with `identifier`/`bundle.publisher`/`plugins.updater.endpoints[0]` copied byte-for-byte from `src-tauri/tauri.conf.json` (diffed via a `node -e` string-equality check, not eyeballed — 3/3 fields matched exactly), `bundle.icon` using the same `../customers/<name>/icons/*` relative-path shape `test-customer`'s proven override uses. Copied the 5 icon files verbatim from `src-tauri/icons/` (diff-confirmed byte-identical). Re-ran the scoped Check 6 probe: GREEN against the real file, and a negative probe against `test-customer`'s override correctly named `identifier` as the mismatched field — proving the fail-fast-per-field message actually names the failing field, not a generic error.

### 3. customers.json registration (commit `cebbd1d`)
Appended Taj as `active`: `repo: zedfauji/supermarket-pos-taj`, `supabase_project_ref: mkvinyekkyennyegfoxq` (confirmed in `scripts/deploy-remote-backend.ps1` line 61), `deployment_mode: cloud`, `github_environment: taj-house-of-spices`. Confirmed via `gh api` that Plan 26-01's `taj-house-of-spices` Environment already existed with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — no second Environment created.

### 4. Real repo creation + checkpoint for the unautomatable PAT step
Created the real private repo `zedfauji/supermarket-pos-taj` via `gh repo create --private`. Minting a fine-grained PAT scoped to `contents: write` cannot be done via `gh` CLI or the REST API (no such endpoint exists — confirmed by this same phase's Plan 26-03 finding, `docs/onboarding-new-customer.md` §3). Stopped with a `checkpoint:human-action` rather than fabricate a workaround. The coordinator confirmed `CUSTOMER_MIRROR_PAT` was set on the `taj-house-of-spices` Environment by hand (verified via `gh secret list --env taj-house-of-spices --repo zedfauji/supermarket-pos`, present alongside the existing `VITE_SUPABASE_*` secrets) before resuming.

### 5. Real `workflow_dispatch` proof
Pushed this worktree's branch to `origin` (`worktree-agent-aa7fe12c0c8086762`, required so `workflow_dispatch --ref` could target it, matching Plan 26-02's precedent) and dispatched `release.yml`. Watched the run synchronously to completion (real self-hosted-runner Rust/Tauri build + signing, ~4 minutes for the Taj job):

**Run:** https://github.com/zedfauji/supermarket-pos/actions/runs/33771536782
- `read-manifest`: 25s, success
- `publish-tauri` (existing, untouched fallback job, D-17): 3m44s, success
- `sync-customers` (taj-house-of-spices, `zedfauji/supermarket-pos-taj`): 4m1s, success

**Mirror-push proof:** the dispatched branch (`worktree-agent-aa7fe12c0c8086762`) mirrored byte-identical — `cebbd1dd78f73cc38bcb2d6cd270be87dd800f66` on both core and `zedfauji/supermarket-pos-taj` (`gh api .../git/refs/heads/worktree-agent-aa7fe12c0c8086762`).

**Real installer + signature proof:** since the self-hosted runner is this same machine, the actual built artifact was inspected directly at `C:\actions-runner\_work\supermarket-pos\supermarket-pos\src-tauri\target\release\bundle\nsis\Supermarket POS_1.2.0_x64-setup.exe`. The job's `generate build cert` step's thumbprint (`5F9379C7CB7592D814E4B68CEA3621D94979751B`) was confirmed both from the job log and independently via `Get-AuthenticodeSignature` on the file directly.

**`verify-installer-integrity.ps1`, all 6 checks, run against the real installer:**
```
OK: 7z payload listing contains both broker.exe and selfsigned.cer.
OK: installer signature thumbprint matches expected (5F9379C7CB7592D814E4B68CEA3621D94979751B).
OK: installer carries no Mark-of-the-Web.
OK: dist/assets/*.js contains the remote project ref and no dev-loopback Supabase URL.
OK: windows/hooks.nsh contains all 4 expected ExecWait lines and tauri.conf.json points at it.
OK: Taj's tauri.override.json identity fields (identifier/publisher/updater endpoint) are byte-identical to tauri.conf.json (D-16).
All checks passed
```
(Check 4 confirms the baked Supabase ref is `mkvinyekkyennyegfoxq`, correctly sourced from `customers.json`, not a stale/local value.)

**D-17 zero-diff proof (checked twice — before and after the real run):**
```
$ git diff --stat src-tauri/tauri.conf.json .github/workflows/release.yml
(empty)
```

## Real Defect Found and Logged (not fixed — out of this task's scope)

While confirming the mirror-push, `zedfauji/supermarket-pos-taj`'s `main` branch was found to be **stale** (`7a0b8c7`, an old ancestor commit, not core's current main `4239f0b`) even though the actively-dispatched branch mirrored correctly. Root-caused: the self-hosted runner's persistent workspace never refreshes its local `refs/heads/main` because `actions/checkout` only updates the ref it explicitly checks out (the dispatched branch, not `main`); `git push --mirror` mirrors local `refs/heads/*`, not the freshly-fetched `refs/remotes/origin/*`. The actual build content was unaffected (it used the correctly-checked-out dispatched branch, confirmed by Check 4's ref match) — only the customer repo's `main` branch *pointer* is stale. Fixing this requires editing `release.yml`'s `sync-customers` job, which this plan's own D-17 zero-diff gate explicitly forbids this task from touching. Logged to `.planning/WINDOWS.md` as ledger entry **#50** (`kind: deviation`, `status: open`), matching Plan 26-02's established precedent (#49) for a real, reproducible pre-existing issue surfaced during a real proof run.

## Task Commits

1. `bcf7fc6` — `test(26-04): add Check 6 (Taj identity byte-identical) to verify-installer-integrity.ps1 - RED`
2. `063e303` — `feat(26-04): create Taj's tauri.override.json + icon set - GREEN (D-16)`
3. `cebbd1d` — `feat(26-04): register Taj House of Spices as active in customers.json`
4. `bd52afe` — `docs(26-04): log pre-existing stale-main-ref mirror-push defect (WINDOWS.md #50)`

(Repo creation, PAT minting/secret-set, branch push, and workflow dispatch were real infra/GitHub-side actions with no local file diff to commit.)

## Files Created/Modified

- `scripts/verify-installer-integrity.ps1` — Check 6 added (identity byte-identical comparison), new `-TauriOverridePath` param.
- `customers/taj-house-of-spices/tauri.override.json` (created) — real byte-identical identity values.
- `customers/taj-house-of-spices/icons/*` (created) — 5 files copied verbatim from `src-tauri/icons/`.
- `customers/customers.json` — Taj registered `active`.
- `.planning/WINDOWS.md` — ledger entry #50 added.
- `src-tauri/tauri.conf.json`, `.github/workflows/release.yml` — **untouched** (verified zero-diff, D-17).

## Decisions Made

- Task 1's checkpoint was already resolved before this session; not re-presented.
- Stopped with `checkpoint:human-action` for the fine-grained PAT mint rather than attempting any workaround — genuinely unautomatable, matching this same phase's own established precedent (Plan 26-03).
- Followed Plan 26-02's precedent of pushing this worktree's own branch to `origin` and using real `gh workflow run --ref`/`gh run watch` for the proof, rather than simulating.
- Logged the stale-main-ref mirror-push defect instead of fixing it in-task, since fixing it would violate D-17's explicit zero-diff gate on `release.yml`.

## Deviations from Plan

**1. [Auth gate, not a deviation] Fine-grained PAT minting required a checkpoint:human-action pause**
- **Found during:** Task 2, after real repo creation.
- **Issue:** `gh` CLI/REST API has no endpoint to create a fine-grained PAT — GitHub only allows it via browser UI.
- **Resolution:** Stopped, provided exact manual steps + a `gh secret set` command the coordinator could run without ever exposing the token to this session. Coordinator confirmed the secret was set; work resumed.

**2. [Found, logged, not fixed — pre-existing, out of scope per D-17] Stale `main`-branch pointer on customer mirror**
- **Found during:** Task 2's real `workflow_dispatch` proof.
- **Issue:** `zedfauji/supermarket-pos-taj`'s `main` branch received a stale local ref instead of core's current main, due to self-hosted-runner workspace persistence in the mirror-push step.
- **Why not fixed:** The fix touches `release.yml`, which this task's own D-17 zero-diff gate explicitly forbids modifying.
- **Action taken:** Logged to `.planning/WINDOWS.md` (#50) for a future plan/todo to address.

No other deviations — the rest of Task 2 executed exactly as written.

## Issues Encountered

- None beyond the two items documented above (the auth gate and the logged pre-existing defect).

## User Setup Required

None further. The one manual step (minting `CUSTOMER_MIRROR_PAT` via GitHub's Fine-grained tokens UI) was already completed by the coordinator during this session's checkpoint pause.

## Next Phase Readiness

- Taj is fully retrofitted into the new mechanism: `active` in `customers.json`, a real private mirror repo with a working `CUSTOMER_MIRROR_PAT`, and a real, verified signed installer built through the new path.
- The old `publish-tauri` direct-from-core path remains completely intact and untouched (confirmed by a real run in the same workflow dispatch) — no window where Taj's live store lacked a working update path (D-17's parallel-run requirement holds).
- `verify-installer-integrity.ps1` now has 6 checks; Plan 26-05/26-06 (or any future customer-repo work) should be aware of the still-open WINDOWS.md #50 stale-main-ref defect in the mirror-push mechanism before relying on customer mirrors' `main` branch content directly.
- This session's worktree branch (`worktree-agent-aa7fe12c0c8086762`) was pushed to `origin` for the real proof and remains there — the orchestrator's normal wave-merge/cleanup flow will fold it into `main` as usual.

---
*Phase: 26-multi-customer-deployment*
*Completed: 2026-09-03*

## Self-Check: PASSED

All claimed files verified present on disk (scripts/verify-installer-integrity.ps1, customers/taj-house-of-spices/tauri.override.json, customers/taj-house-of-spices/icons/icon.ico, customers/customers.json, .planning/WINDOWS.md). All 4 task commits verified present in `git log` (bcf7fc6, 063e303, cebbd1d, bd52afe).
