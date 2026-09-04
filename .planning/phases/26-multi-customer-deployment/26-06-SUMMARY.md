---
phase: 26-multi-customer-deployment
plan: 06
subsystem: infra
tags: [tauri, github-actions, ci-cd, updater, multi-tenant]

requires:
  - phase: 26-multi-customer-deployment
    provides: "26-05's proof that a real controlled client migrates cleanly across two in-place updates to the sync-customers channel; 26-02's original D-08 gate; the #51/#52/#54/#55 infra fixes (mirror repo reachability, release-target misdirection, PAT scope) that had to be verified working before this cutover could proceed"
provides:
  - "src-tauri/tauri.conf.json stripped to a generic, obviously-non-production placeholder identity (com.example.supermarketpos, empty updater.endpoints) — no customer identity lives in core's own config anymore"
  - "release.yml's old publish-tauri job removed entirely — sync-customers is now the sole release path for every active customer including Taj"
  - "A fresh, real D-08 negative-path proof against the final placeholder config (not inherited from Plan 26-02's proof against the old real-valued config)"
  - "A fresh, real confirmation that a normal Taj build still succeeds end-to-end through sync-customers alone, publishing correctly to zedfauji/supermarket-pos-taj"
affects: [release-engineering, multi-customer-onboarding]

actuals:
  tokens: 1274
  tasks: 1
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Transient-flip-and-restore pattern for re-proving a negative-path CI gate: flip fixture to active, hide its override, dispatch, assert failure message + step ordering, restore both fields in a follow-up commit — never left as lasting drift."

key-files:
  created: []
  modified:
    - src-tauri/tauri.conf.json
    - .github/workflows/release.yml
    - customers/customers.json (transiently, restored to original state)
    - customers/test-customer/tauri.override.json (transiently renamed and restored)

key-decisions:
  - "Combined the D-08 negative-path re-proof and Taj's positive-path proof into the same first workflow_dispatch (matrix runs both test-customer and taj-house-of-spices when both are active) rather than two fully separate dispatches, then ran one more clean dispatch (test-customer restored to suspended) to get an unambiguous Taj-only confirmation of the final steady state."
  - "A transient 'socket hang up' in actions/setup-node on the test-customer matrix job (unrelated npm-registry network flake, not caused by this task's config changes) was treated as out-of-scope per the deviation-rules scope boundary and resolved by re-running just that job (gh run rerun --job), not by modifying any workflow logic."

requirements-completed: [D-16, D-17]

coverage:
  - id: D1
    description: "tauri.conf.json identifier/publisher/updater.endpoints stripped to generic placeholder values; version/window/bundle.resources/nsis/pubkey/installMode untouched"
    requirement: D-16
    verification:
      - kind: other
        ref: "node -e assertion: identifier==='com.example.supermarketpos' && updater.endpoints.length===0"
        status: pass
    human_judgment: false
  - id: D2
    description: "publish-tauri job removed entirely from release.yml; read-manifest/sync-customers are the only jobs"
    requirement: D-17
    verification:
      - kind: other
        ref: "grep -c 'publish-tauri:' .github/workflows/release.yml == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-08 fail-loud gate re-proven against the now-placeholder core config: missing override for test-customer fails the job at the 'Assert customer override exists (D-08)' step, before tauri-action runs"
    requirement: D-17
    verification:
      - kind: e2e
        ref: "GitHub Actions run 33825604846, job 100878954947 (real workflow_dispatch) — step log: FAILED: missing override file 'customers/test-customer/tauri.override.json' for customer 'test-customer' - refusing to build with core defaults (D-08)."
        status: pass
    human_judgment: false
  - id: D4
    description: "Normal Taj build succeeds end-to-end through sync-customers alone (no publish-tauri fallback exists), publishing correctly to zedfauji/supermarket-pos-taj via the explicit gh-release-publish step"
    requirement: D-17
    verification:
      - kind: e2e
        ref: "GitHub Actions run 33826290706, job 100879612339 (real workflow_dispatch, clean state — only taj-house-of-spices active) — step log: OK: published v1.2.6 to zedfauji/supermarket-pos-taj via explicit gh release (WINDOWS.md #55); confirmed via `gh release list --repo zedfauji/supermarket-pos-taj`"
        status: pass
    human_judgment: false
  - id: D5
    description: "customers/customers.json's test-customer entry ends the task at status: suspended again (transient flip-and-back left no lasting drift)"
    verification:
      - kind: other
        ref: "node -e assertion: test-customer.status === 'suspended'"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-09-04
status: complete
---

# Phase 26 Plan 06: Retire the Legacy Release Path Summary

**Stripped `tauri.conf.json` to a generic non-production placeholder identity, deleted the legacy `publish-tauri` job from `release.yml`, and re-proved D-08's fail-loud negative-path gate plus a full Taj positive-path build against the final placeholder config with two real `workflow_dispatch` runs — `sync-customers` is now the phase's sole, irreversible release path.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-04T01:20:00Z
- **Completed:** 2026-09-04T01:42:00Z
- **Tasks:** 1 (Task 1's checkpoint:decision was already resolved by the orchestrator before this agent was spawned)
- **Files modified:** 4 (2 lasting: `tauri.conf.json`, `release.yml`; 2 transient-then-restored: `customers/customers.json`, `customers/test-customer/tauri.override.json`)

## Accomplishments

- `src-tauri/tauri.conf.json`'s `identifier` is now `com.example.supermarketpos`, `bundle.publisher` is a generic non-production placeholder string, and `plugins.updater.endpoints` is `[]` — every other field (version `1.2.6`, window config, `bundle.resources`, `bundle.windows.nsis`, `plugins.updater.pubkey`/`windows.installMode`) is untouched, exactly per D-16's identity-only strip.
- The entire `publish-tauri` job (81 lines) was deleted from `.github/workflows/release.yml`. `read-manifest` and `sync-customers` are now the only jobs triggered by `workflow_dispatch` / `push: tags: 'v*'`.
- Re-ran the D-08 negative-path proof from Plan 26-02, this time against the final placeholder config: flipped `test-customer` to `active`, hid its `tauri.override.json`, triggered a real `workflow_dispatch`. The "Assert customer override exists (D-08)" step failed the job with its exact expected message, before `tauri-action` or the gh-release-publish step ran. Restored both fields (`test-customer` back to `suspended`, override file un-hidden) in a follow-up commit.
- Triggered one more real `workflow_dispatch` with a clean state (only `taj-house-of-spices` active). It succeeded end-to-end through `sync-customers` alone — no `publish-tauri` fallback exists — and the explicit gh-release-publish step (added in the prior #55 fix) landed the release correctly on `zedfauji/supermarket-pos-taj` (confirmed via `gh release list`).

## Task Commits

1. **Task 2 (part 1): Strip config, remove legacy job** - `3543999` (feat)
2. **Task 2 (part 2): Transient D-08 re-proof setup** - `31627a2` (test)
3. **Task 2 (part 3): Restore transient state after D-08 re-proof** - `a8af11a` (test)

**Plan metadata:** committed by the orchestrator after this worktree agent's work is merged (per this plan's explicit instruction not to touch STATE.md/ROADMAP.md).

## Files Created/Modified

- `src-tauri/tauri.conf.json` - `identifier`, `bundle.publisher`, `plugins.updater.endpoints` stripped to generic placeholder values
- `.github/workflows/release.yml` - `publish-tauri` job removed entirely (81 lines); `sync-customers` is now the sole release path
- `customers/customers.json` - `test-customer` transiently flipped to `active` then restored to `suspended` (no lasting drift)
- `customers/test-customer/tauri.override.json` - transiently renamed to `.hidden` then restored to its original name/content

## Decisions Made

- Combined the D-08 negative-path re-proof and a first positive-path Taj signal into a single `workflow_dispatch` (both `test-customer` and `taj-house-of-spices` were active simultaneously, matrix `fail-fast: false` kept them independent), then ran a second, clean dispatch (only Taj active) as the unambiguous final-state confirmation the plan's acceptance criteria calls for.
- Treated a transient `socket hang up` inside `actions/setup-node` on the `test-customer` matrix job as an out-of-scope infra flake (unrelated npm-registry network blip, not caused by this task's diff) rather than a deviation requiring a workflow change — resolved by `gh run rerun --job` on just that job, consistent with the deviation-rules scope boundary ("only auto-fix issues directly caused by the current task's changes").

## Deviations from Plan

None — plan executed exactly as written. The one transient CI flake encountered (network `socket hang up` in `actions/setup-node`) was pre-existing infra noise unrelated to this task's config changes and was resolved by re-running the affected job, not by any code/workflow change.

## Issues Encountered

- First `workflow_dispatch` (run `33825604846`) had its `test-customer` matrix job fail at the `setup node` step with a transient `socket hang up` before reaching the D-08 gate step — this was a network flake in `actions/setup-node`'s Node-version-manifest resolution, not related to the config strip. Re-ran just that job (`gh run rerun 33825604846 --job=100877563913`); the re-run succeeded through to the D-08 gate step and failed there with the exact expected message, confirming the gate holds. Taj's job in the same original dispatch was unaffected and succeeded fully.

## User Setup Required

None - no external service configuration required. This plan only ran CI dispatches against already-configured GitHub Environments/secrets.

## Next Phase Readiness

- D-16/D-17's cutover is complete: core's `tauri.conf.json` carries no real customer identity, `publish-tauri` no longer exists, and D-08's fail-loud gate is the sole, freshly-proven safety net for every future customer build.
- This was the phase's last irreversible step (per this plan's own `<objective>` framing) — Phase 26 (multi-customer-deployment) is now fully executed. No further plans depend on this one within the phase.
- Onboarding a new customer going forward means: add an entry to `customers/customers.json`, create `customers/<name>/tauri.override.json` with that customer's real `identifier`/`publisher`/`updater.endpoints`, and let `sync-customers` do the rest — there is no other release path to keep in sync.

## Self-Check: PASSED

- FOUND: src-tauri/tauri.conf.json
- FOUND: .github/workflows/release.yml
- FOUND: .planning/phases/26-multi-customer-deployment/26-06-SUMMARY.md
- FOUND commit: 3543999
- FOUND commit: 31627a2
- FOUND commit: a8af11a

---
*Phase: 26-multi-customer-deployment*
*Completed: 2026-09-04*
