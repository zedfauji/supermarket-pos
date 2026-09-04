---
phase: 26-multi-customer-deployment
verified: 2026-09-04T00:00:00Z
status: gaps_found
score: 16/17 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Each active customer's own repo serves a genuine, live /releases/latest update channel through the phase's sole (post-cutover) release mechanism (sync-customers) — the phase's core promise (ROADMAP Phase 26 goal: 'their own genuine /releases/latest update channel'; D-17)."
    status: failed
    reason: >
      release.yml's "Publish release to customer repo via gh CLI (WINDOWS.md #55)" step
      (the mechanism WINDOWS.md #55 and Plan 26-06's SUMMARY both claim resolved
      customer-repo publishing) never un-drafts the release it uploads assets to.
      tauri-action's own release step is deliberately KEPT in the job (releaseDraft: true,
      per its `with:` block) purely for build+sign; now that GITHUB_REPOSITORY is
      correctly shadowed to matrix.customer.repo (the #51/#54/#55 fixes), that step
      always pre-creates a DRAFT release with the version's tag on the customer's own
      repo before the explicit gh-publish step runs. That step's existence check
      (`gh release view $tag --repo $repo`) then finds the pre-existing draft and takes
      the "already exists — upload with --clobber" branch, which uploads assets but never
      flips `isDraft` to false. This is deterministic and reproduces on every future
      release, not just one run.

      Live evidence (re-verified fresh, this session, against the real GitHub state):
      `gh release view v1.2.6 --repo zedfauji/supermarket-pos-taj --json isDraft` →
      `true`. `gh release list --repo zedfauji/supermarket-pos-taj` shows only
      `v1.2.3 Latest` and `v1.2.6 Draft` — no published v1.2.6. An unauthenticated
      `curl -sL https://github.com/zedfauji/supermarket-pos-taj/releases/latest/download/latest.json`
      (the exact URL a real installed Taj till's updater polls) returns
      `"version": "1.2.3"` — a stale release from Plan 26-05's one-off manual
      `gh release create` workaround — not v1.2.6, the actual final build the now-sole
      `sync-customers` mechanism produced in Plan 26-06's own cutover-completion run
      (33826290706).

      This was not caught by this phase's own verification chain: WINDOWS.md #55's own
      fix-verification note explicitly observed "core's own v1.2.6 release... still
      draft=true with its own 5 assets" for the identical symptom on CORE's copy, but
      did not check (or flag) the same condition on Taj's copy — the phase's coverage
      claim for this must-have (26-06-SUMMARY.md coverage id D4) verified only that the
      release/tag/assets exist ("`gh release view` ... confirms tag v1.2.6") and never
      checked `isDraft` or resolved `/releases/latest` to confirm the release is
      actually live.
    artifacts:
      - path: ".github/workflows/release.yml"
        issue: "The 'Publish release to customer repo via gh CLI' step (~lines 190-262) has no `gh release edit $tag --repo $repo --draft=false` (or equivalent) call in either its create or upload/--clobber branch. Because tauri-action's own release step (kept in the job for build+sign only) always pre-creates a draft release with that tag on the now-correctly-shadowed customer repo, the upload/--clobber branch is the one that always fires in practice — and it never publishes the release."
    missing:
      - "Add a step (or extend the existing publish step) that runs `gh release edit $tag --repo $repo --draft=false` after the create/upload branches, so every release actually goes live regardless of which branch fired."
      - "Re-run a real workflow_dispatch after the fix and confirm both: (1) `gh release view <tag> --repo zedfauji/supermarket-pos-taj --json isDraft` returns `false`, and (2) an unauthenticated `curl` to `/releases/latest/download/latest.json` returns that tag's version — not a stale one."
      - "Retroactively publish the existing stuck v1.2.6 draft on zedfauji/supermarket-pos-taj (`gh release edit v1.2.6 --repo zedfauji/supermarket-pos-taj --draft=false`) so Taj's real till is not permanently stuck polling v1.2.3."
deferred:
  - truth: "customers/<name>'s main branch on the customer mirror always reflects core's true current HEAD after a mirror-push (D-01/D-02)."
    addressed_in: "WINDOWS.md ledger #50 (open, logged by Plan 26-04)"
    evidence: "Explicitly disclosed by the phase's own SUMMARY/ledger as a known, open, cosmetic issue (stale local `refs/heads/main` on the self-hosted runner's persistent workspace vs. the freshly-fetched `refs/remotes/origin/main`) — the actively-dispatched branch and its build content are unaffected; only the customer mirror's `main` pointer is stale. Re-confirmed live this session (core main 0602257... vs. Taj mirror main 7a0b8c7...). Not gated as a new finding since the phase's own task context already named this open and non-blocking for Taj."
  - truth: "scripts/onboard-customer.ps1 defaults new customer repos to a visibility that actually works with Tauri's unauthenticated updater fetch (avoiding the same 404 #52 found for Taj)."
    addressed_in: "WINDOWS.md ledger #53 (open, logged by Plan 26-05, explicitly out of this phase's scope per its own framing)"
    evidence: "onboard-customer.ps1 line 66 still hardcodes `gh repo create $fullRepo --private` — confirmed by direct read this session. Explicitly disclosed by the phase context as an accepted, deferred gap: it does not affect Taj (the phase's only real customer, whose repo was manually flipped public per #52's fix) and is logged as future work for customer #2 onward."
human_verification: []
---

# Phase 26: Multi-Customer Deployment Verification Report

**Phase Goal:** Ship this same supermarket-pos codebase to multiple customers, each with a fully
isolated Supabase project and their own genuine `/releases/latest` update channel — a multi-instance
deployment model (full-mirror customer repos, active/suspended manifest gating, per-customer Tauri
identity merged at build time with a fail-loud gate, a scripted onboarding path, and Taj House of
Spices retrofitted via a parallel-run cutover).

**Verified:** 2026-09-04
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-18: ci.yml's tauri-build job builds the broker crate before cargo test | ✓ VERIFIED | Live `grep`: `cargo build --release`/`working-directory: broker` (lines 86-87) precede `Rust unit tests` (line 89) in `.github/workflows/ci.yml`. |
| 2 | D-18: Taj's Supabase URL/anon key never exist as a loose plaintext file after a release job completes | ✓ VERIFIED | `release.yml`'s `sync-customers` job materializes `.env.production` from `secrets.VITE_SUPABASE_ANON_KEY` + a derived URL, then an `if: always()` "Clean up materialized secrets" step (`Remove-Item -Path .env.production -Force`) runs as the job's last step (confirmed present at line 264-270 of the live file). |
| 3 | D-01/D-02/D-03: an active customer receives a real `git push --mirror`; a suspended customer receives nothing, gated by a one-line manifest edit with no build/release code changes | ✓ VERIFIED | Live `release.yml`: `sync-customers` job gated by `if: needs.read-manifest.outputs.active_customers != '[]'`, matrix fed by `Get-ActiveCustomers` (filters on `status: 'active'`). Real `workflow_dispatch` proofs in 26-02/26-06 SUMMARYs (runs 33708080677, 33825604846/33826290706) confirm a suspended entry is excluded from the matrix entirely. |
| 4 | D-06/D-07: a customer's build always carries that customer's own identifier/publisher/updater-endpoint/icon via a second `tauri-action --config`, without clobbering the cert-thumbprint override | ✓ VERIFIED | Live `release.yml` line 186-188: `args:` carries two `--config` values on disjoint keys (`bundle.windows.certificateThumbprint`/`digestAlgorithm`, then `customers/<name>/tauri.override.json`). Real-run proof in 26-02-SUMMARY (Assumption A1 resolved against a live build) and 26-04-SUMMARY (Taj's real installer carried both). |
| 5 | D-08: a customer with a missing/malformed override fails the build loudly before `tauri-action` ever runs | ✓ VERIFIED | Live `release.yml` "Assert customer override exists (D-08)" step (lines 140-148) precedes `generate build cert`/`tauri-action`. Re-proven against the FINAL placeholder core config in Plan 26-06 (real run 33825604846, job step log: `FAILED: missing override file ... refusing to build with core defaults (D-08)`, `tauri-action` step skipped). |
| 6 | D-04: one customer's mirror-push/build failure does not block the fan-out from attempting every other active customer | ✓ VERIFIED | Live `release.yml` line 30: `fail-fast: false` in `sync-customers.strategy`. |
| 7 | D-12: running `onboard-customer.ps1` twice for the same customer is safe — never a duplicate resource or error | ✓ VERIFIED | Script code reviewed (skip-if-exists on repo/Environment/override/manifest-entry, always-overwrite on the PAT secret only) — matches 26-03-SUMMARY's real double-run, hash-identical proof against `test-onboard-fixture`. |
| 8 | D-11: `onboard-customer.ps1` never triggers a build/release and never marks a new customer active | ✓ VERIFIED | Script (`scripts/onboard-customer.ps1`) contains no `git push`, `gh workflow run`, or release-trigger call; Step 5's manifest upsert hardcodes `status = 'suspended'` (line 155). |
| 9 | D-10: every manual step (PAT minting, Supabase project creation, `supabase db push`) is documented with exact commands/UI paths | ✓ VERIFIED | `docs/onboarding-new-customer.md` exists (tracked, `.gitignore` exception confirmed); contains the literal `supabase db push --project-ref` command and the phrase "Fine-grained tokens". |
| 10 | D-15/D-16: Taj's override file's identifier/publisher/updater-endpoint are byte-identical to the original production values | ✓ VERIFIED | `customers/taj-house-of-spices/tauri.override.json` (live read): `identifier: com.tajhouseofspices.supermarketpos`, `bundle.publisher: Taj House of Spice Supermarket POS`, `updater.endpoints: [".../supermarket-pos-taj/releases/latest/download/latest.json"]`. `verify-installer-integrity.ps1` Check 6 (lines 150-167) enforces this byte-for-byte on every future build. |
| 11 | D-17: during retrofit/transition, the old `publish-tauri` job and `src-tauri/tauri.conf.json`'s real values stayed untouched so Taj's live till never lost a working update path | ✓ VERIFIED | 26-04-SUMMARY/26-05-SUMMARY both show `git diff --stat` empty on those files at each stage; only after Plan 26-05's proven two-hop migration did Plan 26-06 touch them. |
| 12 | D-17: a real two-hop update cycle (old-path endpoint transition, then new-path-only continuation) was proven against a real, signed, signature-verified build chain | ✓ VERIFIED | 26-05-SUMMARY: 3 real `workflow_dispatch` builds, real `signtool.exe`-verified Authenticode chains, real extracted-binary `strings.exe` confirmation the baked endpoint migrated core→Taj across hop 1, and stayed on Taj-only across hop 2. Methodology note: the sandbox blocked a literal OS-level NSIS install/GUI-updater click cycle, so "Test Client A" was modeled via extraction of the real downloaded, signature-verified installer payload — a disclosed, non-simulated adaptation of this repo's own `verify-installer-integrity.ps1` artifact-inspection technique, not a fabricated result. |
| 13 | D-16: `src-tauri/tauri.conf.json` now carries a generic, non-production placeholder identity; no customer identity lives in core's own config | ✓ VERIFIED | Live read: `identifier: "com.example.supermarketpos"`, `plugins.updater.endpoints: []`. `bundle.publisher` is a generic non-production string. |
| 14 | D-17: the old `publish-tauri` job no longer exists; `sync-customers` is the sole release path | ✓ VERIFIED | Live `grep -c "publish-tauri:" .github/workflows/release.yml` → 0. Only `read-manifest`/`sync-customers` jobs remain in the file. |
| 15 | D-08 re-verified: the fail-loud gate still holds against the final placeholder config, not just the old real-valued one | ✓ VERIFIED | Re-proven in Plan 26-06 with a real `workflow_dispatch` (run 33825604846) after the strip — same "FAILED: missing override file..." step failure, before `tauri-action`. |
| 16 | D-13/D-14: `customers.json` carries the full manifest schema (`name/repo/status/supabase_project_ref/deployment_mode/github_environment`), `deployment_mode` present as an architectural door-open | ✓ VERIFIED | Live read of `customers/customers.json`: all 3 entries (`test-customer`, `test-onboard-fixture`, `taj-house-of-spices`) carry all 6 fields; `deployment_mode: "cloud"` throughout, no `self_hosted` code path exists anywhere (confirmed by grep — none found). |
| 17 | **Phase goal / D-17: each active customer's own repo serves a genuine, live `/releases/latest` update channel through the now-sole release mechanism** | ✗ FAILED | See `gaps` in frontmatter. Live-verified: Taj's `/releases/latest/download/latest.json` resolves to a stale v1.2.3 (a one-off manual publish from Plan 26-05), not v1.2.6 — the actual final build the sole `sync-customers` path produced in Plan 26-06's own cutover run. The release is stuck as a permanent GitHub Draft because the "explicit publish" step never un-drafts a release that tauri-action's own (intentionally-kept) draft-creation step always pre-creates first. This reproduces on every future release, not just this one. |

**Score:** 16/17 truths verified (1 failed, 0 present-but-behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Customer mirror's `main` branch pointer staying fresh after every mirror-push | WINDOWS.md #50 (open) | Explicitly disclosed as known/open by the phase itself; build content is unaffected, only the mirror's `main` ref is stale. Re-confirmed live this session (core `0602257...` vs. Taj mirror `main` at `7a0b8c7...`). |
| 2 | `onboard-customer.ps1` defaulting new customer repos to private (reproducing #52's 404 for customer #2+) | WINDOWS.md #53 (open) | Explicitly disclosed as known/open, out-of-scope-for-Taj by the phase itself; confirmed live this session (`onboard-customer.ps1` line 66 still `--private`). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/ci.yml` | broker build step before cargo test | ✓ VERIFIED | Confirmed live, order correct. |
| `.github/workflows/release.yml` | read-manifest + sync-customers fan-out, dual `--config`, D-08 gate, explicit gh-publish step | ✓ VERIFIED (mechanics) / ⚠️ publish-step incomplete | All jobs/steps present and correctly ordered; the final publish step's missing `--draft=false` is the gap above. |
| `customers/customers.json` | D-13/D-14 schema, active/suspended entries | ✓ VERIFIED | Live read matches schema; Taj active, 2 disposable fixtures suspended. |
| `customers/taj-house-of-spices/tauri.override.json` + icons | byte-identical real identity | ✓ VERIFIED | Live read matches; icons present (5 files). |
| `scripts/lib/customer-manifest.ps1` | `Get-ActiveCustomers`, `Add-OrUpdateCustomerEntry` | ✓ VERIFIED | Both functions present (grep confirmed). |
| `scripts/onboard-customer.ps1` | idempotent D-09 onboarding script | ✓ VERIFIED | Full read; SecureString PAT handling, skip-if-exists steps, never activates. |
| `docs/onboarding-new-customer.md` | D-10 runbook | ✓ VERIFIED | Present, tracked, contains required commands/phrases. |
| `scripts/verify-installer-integrity.ps1` | Check 6 (Taj identity byte-identical) | ✓ VERIFIED | Present, follows existing fail-fast-per-field shape. |
| `src-tauri/tauri.conf.json` | generic placeholder post-cutover | ✓ VERIFIED | Live read confirms. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `release.yml` `sync-customers` matrix | GitHub Environment secrets | `environment: { name: matrix.customer.github_environment }` (long form) | ✓ WIRED | Confirmed live, long/object form used (avoids Pitfall 2). |
| `read-manifest` → `sync-customers` | active-customer gating | `needs.read-manifest.outputs.active_customers` | ✓ WIRED | Confirmed live; matrix `if:` gate present. |
| `sync-customers` tauri-action step | customer identity override | dual `--config` args | ✓ WIRED | Confirmed live, both `--config` flags present and disjoint. |
| `sync-customers` gh-publish step | customer's own GitHub Release | `gh release create/upload --repo $repo` | ⚠️ PARTIALLY WIRED | Assets do land on the customer repo (confirmed live), but the release is never transitioned out of Draft — see gap #17 above. The "genuine channel" link is broken at the very last step. |

### Requirements Coverage

This is a CI/CD-only phase with no formal `REQUIREMENTS.md` REQ-IDs (confirmed via ROADMAP.md Phase 26 entry: "no formal REQUIREMENTS.md REQ-IDs for this phase... traced entirely via CONTEXT.md's locked decision IDs"). Traceability is against CONTEXT.md's D-01..D-18, cross-referenced against each plan's frontmatter `requirements:` field.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| D-01 | 26-02 | Full-mirror customer repos via `git push --mirror` | ✓ SATISFIED | Live code + real-run proof. |
| D-02 | 26-02 | Core's own release workflow triggers the sync (push-based) | ✓ SATISFIED | Live code — `sync-customers` runs inside `release.yml`. |
| D-03 | 26-02 | Sync gated by `status: active | suspended` manifest | ✓ SATISFIED | Live code + real-run proof (suspend path). |
| D-04 | 26-02 | Lockstep release cadence + suspend override + continue-on-failure default | ✓ SATISFIED | `fail-fast: false` confirmed live. |
| D-05 | 26-02 | Licensing/billing explicitly out of scope — only manual toggle built | ✓ SATISFIED | No licensing/billing code found anywhere in the phase's diff. |
| D-06 | 26-02 | Per-customer `tauri.override.json` merged via second `--config` | ✓ SATISFIED | Live code + real-run proof. |
| D-07 | 26-02 | Per-customer icons synced alongside override | ✓ SATISFIED | Confirmed live for `test-customer`/`taj-house-of-spices`/`test-onboard-fixture`. |
| D-08 | 26-02, 26-06 | Missing/malformed override fails loudly, never silent fallback | ✓ SATISFIED | Live code + two independent real-run negative-path proofs (old config, then re-proven against the final placeholder config). |
| D-09 | 26-03 | Scripted + documented onboarding | ✓ SATISFIED | `onboard-customer.ps1` + `docs/onboarding-new-customer.md` both present and real-proven. |
| D-10 | 26-03 | Manual steps (Supabase project/PAT) documented, not scripted | ✓ SATISFIED | Confirmed live in the runbook. |
| D-11 | 26-03 | Onboarding never triggers first release / never activates | ✓ SATISFIED | Script code confirms; `status: suspended` hardcoded. |
| D-12 | 26-03 | Onboarding is idempotent | ✓ SATISFIED | Real double-run hash-identical proof (26-03-SUMMARY) + code review. |
| D-13 | 26-02, 26-03 | Manifest field schema | ✓ SATISFIED | Live read of `customers.json`. |
| D-14 | 26-02, 26-03 | `deployment_mode` field, cloud-only implemented | ✓ SATISFIED | Live read; no `self_hosted` branch anywhere. |
| D-15 | 26-04 | Taj retrofitted into the new model | ✓ SATISFIED | Live artifacts + real-run proof. |
| D-16 | 26-04, 26-05, 26-06 | Byte-identical Taj identity, then core stripped to generic placeholder | ✓ SATISFIED | Live reads at every stage match the claimed values; Check 6 enforces going forward. |
| D-17 | 26-04, 26-05, 26-06 | Parallel-run cutover, real update cycle proven, then retirement — "genuine `/releases/latest` channel" | ✗ **BLOCKED** | The parallel-run/retrofit/retirement *mechanics* (old path untouched during transition, then correctly removed) are fully satisfied. The "genuine `/releases/latest` update channel" outcome D-17 exists to prove is **not currently true in the live state** — see Observable Truth #17 / gaps above. |
| D-18 | 26-01 | CI broker-order fix + secrets migration (prerequisite) | ✓ SATISFIED | Live code confirms both fixes. |

**17/18 D-numbers fully satisfied; D-17 is the one exception** (its parallel-run and retirement sub-requirements are satisfied, but its "real update cycle"/"genuine channel" outcome is currently broken in the live release path — see gap).

### Anti-Patterns Found

None of the classic stub/placeholder/TODO patterns were found in the phase's touched files (`release.yml`, `ci.yml`, `customers/*`, `scripts/onboard-customer.ps1`, `scripts/lib/customer-manifest.ps1`, `scripts/verify-installer-integrity.ps1`, `docs/onboarding-new-customer.md`, `src-tauri/tauri.conf.json`) — no `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` debt markers, no empty-return stubs. The one real defect found (draft-release publish gap) is a logic bug, not a stub, and is documented above with exact evidence and fix.

### Behavioral Spot-Checks / Probe Execution

Not applicable in the conventional sense (no unit-test suite for this CI/CD-only phase, matching RESEARCH.md's Validation Architecture note that this phase's "tests" are real infrastructure dry runs). Instead, this verification independently re-ran the equivalent real-infrastructure checks against the live GitHub state (not re-trusting SUMMARY claims):

| Check | Command | Result | Status |
|---|---|---|---|
| ci.yml broker-build ordering | `grep -n "cargo build --release\|Rust unit tests" .github/workflows/ci.yml` | broker build (86-87) precedes tests (89) | ✓ PASS |
| release.yml sole release path | `grep -c "publish-tauri:" .github/workflows/release.yml` | 0 | ✓ PASS |
| tauri.conf.json placeholder | live `node -e` read | `identifier=com.example.supermarketpos`, `endpoints=[]` | ✓ PASS |
| Taj override byte-identity | live file read | matches claimed production values | ✓ PASS |
| Taj repo visibility | `gh repo view zedfauji/supermarket-pos-taj --json isPrivate` | `false` (public, per #52 fix) | ✓ PASS |
| **Taj `/releases/latest` liveness** | `gh release view v1.2.6 --repo zedfauji/supermarket-pos-taj --json isDraft`; `curl -sL .../releases/latest/download/latest.json` | `isDraft: true`; resolves to stale `v1.2.3` | **✗ FAIL** |
| Core `main` vs. Taj mirror `main` | `git rev-parse main` vs. `gh api .../branches/main` | `0602257...` vs `7a0b8c7...` (stale, known #50) | ⚠️ Known/deferred |

### Human Verification Required

None. Every check above was independently re-run by this verifier against real, live GitHub/filesystem state — no manual click-through requested, per this repo's CLAUDE.md testing policy.

### Gaps Summary

The phase's CI/CD mechanics (mirror-push, manifest gating, dual `--config` identity merge, fail-loud
D-08 gate, idempotent onboarding, byte-identical Taj retrofit, and the retirement of the old release
path) are all real, live-verified, and working exactly as claimed — this is substantial, genuine
infrastructure work, not stubbed.

However, the phase's actual headline deliverable — "each customer... their own genuine
`/releases/latest` update channel" — is **currently broken** in the live state for the one real
customer this phase targeted. The newly-added "explicit `gh release` publish" step (the fix for
WINDOWS.md #51/#54/#55) reliably uploads the right assets to the right repo, but never removes the
Draft flag that tauri-action's own (intentionally-kept, non-authoritative) release step always applies
first — so every release this mechanism produces stays invisible to a real till's `/releases/latest`
poll. Taj's real repo is stuck showing v1.2.3 as "Latest" while v1.2.6 — the actual final,
fully-verified build from this phase's own closing task — sits unpublished. This is a small, precisely
located, one-line-fix gap (`gh release edit $tag --repo $repo --draft=false`), not a structural
redesign, but it directly negates the phase's own success condition and was not caught by any of this
phase's own verification passes (which checked "release/tag/assets exist," not "release is published").

---

*Verified: 2026-09-04*
*Verifier: Claude (gsd-verifier)*
