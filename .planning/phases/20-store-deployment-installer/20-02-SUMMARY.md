---
phase: 20-store-deployment-installer
plan: 02
subsystem: infra
tags: [tauri, nsis, code-signing, powershell, windows, ci-cd]

# Dependency graph
requires:
  - phase: 20-store-deployment-installer/01
    provides: "Remote Supabase backend completeness (12 edge functions + 5 secrets deployed) — independent of this plan's installer-packaging work but part of the same phase"
provides:
  - "scripts/generate-build-cert.ps1 — per-build fresh self-signed CodeSigningCert generation, public .cer export, thumbprint stdout contract"
  - "windows/hooks.nsh extended with a 4th idempotent certutil Trusted-Root import ExecWait line"
  - "src-tauri/tauri.conf.json wired with publisher + cert bundle.resources entry (with a corrected relative path — see Deviations)"
  - "scripts/verify-installer-integrity.ps1 — 5-check pre-ship integrity script (7z payload, signature thumbprint, MOTW absence, baked-URL grep, hooks.nsh source-side check), no elevation required"
  - "scripts/verify-print-broker-install.ps1 extended with Check 6 (Trusted-Root cert presence) and -ExpectedThumbprint param"
  - ".github/workflows/release.yml wired to generate a fresh cert and sign the CI-built installer the same way as a local build"
affects: [installer-delivery, future-phase-if-updater-motw-investigated]

actuals:
  tokens: 4100
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Fail-fast PowerShell verification-script shape (CmdletBinding/param, $ErrorActionPreference='Stop', Fail helper, per-check try/catch + colored OK/FAILED Write-Host), extended to a second new script this phase"
    - "Self-signed cert generated fresh per build, public-only Export-Certificate, thumbprint threaded through --config JSON-merge-patch into `tauri build`"
    - "ASCII-only PowerShell script content — em dashes and other non-ASCII punctuation corrupt double-quoted string literals when Windows PowerShell 5.1 reads a BOM-less .ps1 file under a non-UTF-8 system codepage (see Issues Encountered)"

key-files:
  created:
    - scripts/generate-build-cert.ps1
    - scripts/verify-installer-integrity.ps1
  modified:
    - windows/hooks.nsh
    - src-tauri/tauri.conf.json
    - scripts/verify-print-broker-install.ps1
    - .gitignore
    - .github/workflows/release.yml
  not-committed-git-ignored:
    - .env.production (remote VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY, confirmed git-ignored before creation)
    - src-tauri/cert/selfsigned.cer (build-regenerated resource, fresh thumbprint every build)

key-decisions:
  - "Fixed a resource-path bug present in the plan/RESEARCH.md/PATTERNS.md text: all three docs specified `\"../cert/selfsigned.cer\"` for the new bundle.resources key, but tauri.conf.json resource paths resolve relative to src-tauri/ (confirmed by the existing broker.exe entry's `../broker/...` reaching the repo-root broker/ dir, and icons/ using no prefix for src-tauri/icons/). Since generate-build-cert.ps1 writes to src-tauri/cert/selfsigned.cer (as the plan itself specifies), the correct key is `\"cert/selfsigned.cer\"` with no `../` — the documented path would have pointed at a nonexistent repo-root cert/ directory and failed the build. Fixed per Rule 1 (bug)."
  - "Cert:\\LocalMachine\\My generation failed with Access Denied in this non-elevated sandbox session, exactly as environment_notes anticipated. Added a documented fallback to Cert:\\CurrentUser\\My (loud Write-Host warning, only triggered on an access-denied/elevation-specific error) so the full signed-build pipeline could be proven end-to-end in this session. signtool.exe signs identically from either store; a production build machine (the store owner's own machine, or the self-hosted CI runner) is expected to run elevated, which uses the primary Cert:\\LocalMachine\\My path unchanged."
  - "Narrowed Check 4's negative baked-URL assertion from RESEARCH.md's literal `grep -rL \"127.0.0.1\\|localhost\"` pattern to specifically `127\\.0\\.0\\.1:54321` (the actual .env.local Supabase port). Verified empirically that @supabase/supabase-js's minified internals unconditionally contain the string `http://localhost:9999` (an internal GoTrue constant) and a hostname-validation regex referencing `localhost`, regardless of which .env file was baked in — the broader pattern would have made this check permanently fail as a false positive on every single build. The positive assertion (project ref substring) and the narrower negative assertion (54321) are what actually distinguish a correct remote-URL build from a stale local-URL build."
  - "Used the legacy JWT-format anon key (`supabase projects api-keys` `id: anon`) for VITE_SUPABASE_ANON_KEY in .env.production, matching the format already used in .env.local and consumed by createClient() in src/shared/lib/supabase.ts, rather than the newer sb_publishable_ key format also returned by the same command."
  - "Did not attempt to run the built NSIS installer for real on this shared dev/build machine — doing so would install a real Windows service, firewall rule, and Trusted-Root cert import on this machine via an interactive, non-automatable UAC elevation prompt. This matches this repo's CLAUDE.md carve-out for native OS UI (UAC/SmartScreen dialogs have no supported automation hook) — documented as the accepted manual-only observation, not attempted or delegated to a human to click through."

requirements-completed: [DEP-01, DEP-02]

coverage:
  - id: D1
    description: "npm run tauri build produces a real, signed NSIS installer (and MSI) whose Get-AuthenticodeSignature thumbprint exactly matches the thumbprint generate-build-cert.ps1 printed in the same run; hooks.nsh carries all 4 ExecWait lines; tauri.conf.json carries publisher + the corrected cert resource entry"
    requirement: "DEP-01"
    verification:
      - kind: other
        ref: "Real run this session: npm run tauri build -- --config \"...certificateThumbprint=E5E5DC822EA5A402AEEC2C50C633C621320626D6...\" produced src-tauri/target/release/bundle/nsis/Supermarket POS_1.1.4_x64-setup.exe and the .msi; Get-AuthenticodeSignature on the .exe returned SignerCertificate.Thumbprint = E5E5DC822EA5A402AEEC2C50C633C621320626D6 (exact match)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Single UAC prompt covering all elevated post-install steps, and the expected one-time SmartScreen click-through on first launch — observed on a real install"
    requirement: "DEP-01"
    verification: []
    human_judgment: true
    rationale: "Native OS UI (UAC elevation dialog, SmartScreen dialog) with no supported automation hook — this repo's CLAUDE.md documents exactly one carve-out for native Tauri window shell/OS chrome, which this falls under. Not attempted on this shared dev/build machine (would install a real Windows service/firewall rule/Trusted-Root cert), and not delegated to a human to click through per the task instructions — recorded here as the accepted, documented manual-only observation."
  - id: D3
    description: "scripts/verify-installer-integrity.ps1: all 5 checks pass against the real build (7z payload listing, signature thumbprint match, no Mark-of-the-Web, baked remote URL present with no dev-loopback URL, hooks.nsh + tauri.conf.json wiring); a deliberately wrong thumbprint fails specifically at Check 2 with the exact 'thumbprint mismatch' message and non-zero exit"
    requirement: "DEP-02"
    verification:
      - kind: other
        ref: "Real run this session against the Task 1 build: all 5 'OK:' lines + 'All checks passed', exit 0. Negative-case run with thumbprint DEADBEEF...DEADBEEF: 'FAILED: thumbprint mismatch: installer signed with E5E5DC822EA5A402AEEC2C50C633C621320626D6, expected DEADBEEF...', exit 1"
        status: pass
    human_judgment: false
  - id: D4
    description: ".github/workflows/release.yml generates a fresh build cert on the self-hosted Windows runner and signs the CI-produced installer the same way a local build does, so the artifact attached to the public GitHub Release is signed too"
    requirement: "DEP-01"
    verification:
      - kind: other
        ref: "node -e structural check (plan's own <verify> command) confirms generate-build-cert.ps1 and certificateThumbprint are present in release.yml; js-yaml parse confirms the args value round-trips to the exact intended JSON string; git diff shows only additive lines (no existing input removed/changed)"
        status: pass
    human_judgment: true
    rationale: "A real CI-triggered run (an actual tag push) is explicitly excluded from this task's routine verification per the plan's own acceptance criteria — it would cut a real public GitHub Release as a side effect. Full end-to-end confirmation is deferred to the next real release cut, consistent with this phase's documented single-operator manual-process limitation."

duration: 45min
completed: 2026-08-30
status: complete
---

# Phase 20 Plan 02: Signed Elevated Installer — Cert Generation, NSIS Wiring, Integrity Check, CI Signing Summary

**Self-signed cert generation + Trusted-Root NSIS import wired into the existing print-broker installer pipeline, proven with a real `npm run tauri build` whose Authenticode thumbprint matches exactly, plus a 5-check pre-ship integrity script and the same signing mechanism wired into the CI release workflow.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-30T01:25:00Z (approx)
- **Completed:** 2026-08-30T02:12:00Z
- **Tasks:** 3 (all complete)
- **Files modified:** 7 (2 new PowerShell scripts, 3 existing files extended, 1 CI workflow extended, 1 gitignore addition); plus 2 git-ignored artifacts (`.env.production`, `src-tauri/cert/selfsigned.cer`) never committed

## Accomplishments
- `scripts/generate-build-cert.ps1` generates a fresh self-signed `CodeSigningCert` per build, exports only the public `.cer` (never the private key), and prints the thumbprint as the sole stdout contract for the build invocation to capture.
- `windows/hooks.nsh`'s `NSIS_HOOK_POSTINSTALL` macro extended with a 4th idempotent `certutil -f -addstore Root` line, composing with Phase 19's 3 existing lines in the one file Tauri v2's `installerHooks` mechanism allows.
- `src-tauri/tauri.conf.json` carries a new `"publisher"` field matching the cert's CN, and a corrected `bundle.resources` entry for the cert (see Deviations — the plan's own documented path was wrong).
- A real, unmocked `npm run tauri build -- --config "..."` run produced both an NSIS installer and an MSI, and `Get-AuthenticodeSignature` on the NSIS `.exe` confirmed the signature thumbprint exactly matches the freshly-generated cert's thumbprint from the same run.
- `scripts/verify-installer-integrity.ps1` (new, no elevation required) runs 5 checks against a built installer — all pass on the real build, and a deliberate wrong-thumbprint negative test fails specifically and correctly at the signature-match check.
- `scripts/verify-print-broker-install.ps1` (Phase 19's file) extended with a 6th check (Trusted-Root cert presence) and an `-ExpectedThumbprint` parameter — logic present and correctly shaped, though it can only be exercised for real on a machine that has actually run the installer (same elevation-boundary limitation already documented for Checks 1-5).
- `.github/workflows/release.yml` extended, purely additively, to generate a fresh build cert on the self-hosted Windows runner and pass its thumbprint into the existing `tauri-apps/tauri-action` step's build args — confirmed via a Level-1 fetch of the action's current `action.yml` that `args` is the correct input name.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cert generation + NSIS Trusted-Root import + signed real build (DEP-01)** - `a7b44a6` (feat)
2. **Task 2: Pre-ship installer integrity-check script (DEP-02)** - `eb1c011` (feat)
3. **Task 3: Wire the same signed-build pipeline into the CI release workflow** - `be075ad` (feat)

## Files Created/Modified
- `scripts/generate-build-cert.ps1` - New. `New-SelfSignedCertificate` (CodeSigningCert, 5-year validity, Code Signing EKU), `Export-Certificate` (public-only) to `src-tauri/cert/selfsigned.cer`, prints thumbprint. Falls back `Cert:\LocalMachine\My` → `Cert:\CurrentUser\My` on an access-denied/elevation-specific error, with a loud warning.
- `windows/hooks.nsh` - Extended `NSIS_HOOK_POSTINSTALL` with a 4th `ExecWait 'certutil -f -addstore Root ...'` line plus a matching idempotency-justification comment.
- `src-tauri/tauri.conf.json` - Added `"publisher"` and a second `bundle.resources` key (`"cert/selfsigned.cer": "cert/selfsigned.cer"` — corrected path, see Deviations).
- `scripts/verify-print-broker-install.ps1` - Added `-ExpectedThumbprint` mandatory param and Check 6 (Trusted-Root presence).
- `.gitignore` - Added `src-tauri/cert/` (build-regenerated resource, never a source input).
- `scripts/verify-installer-integrity.ps1` - New. 5 checks: 7z payload listing, Authenticode thumbprint match, Mark-of-the-Web absence, baked remote URL + no dev-loopback URL, hooks.nsh + tauri.conf.json source-side wiring check.
- `.github/workflows/release.yml` - Added a `gencert` step (runs `generate-build-cert.ps1`, writes thumbprint to `$GITHUB_OUTPUT`) immediately before the existing `tauri-apps/tauri-action@v0.6.2` step, and a new `args` input referencing that output inside the same `certificateThumbprint` JSON-merge-patch value used locally.
- `.env.production` (not committed, git-ignored) - `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` for the remote project, fetched via `supabase projects api-keys --project-ref mkvinyekkyennyegfoxq -o json` (legacy anon JWT).

## Decisions Made
- Fixed the `bundle.resources` cert path (`"cert/selfsigned.cer"` not `"../cert/selfsigned.cer"`) — see Deviations, this was a bug present across the plan, RESEARCH.md, and PATTERNS.md.
- Added a `Cert:\CurrentUser\My` fallback to `generate-build-cert.ps1` for non-elevated sessions, to allow a real end-to-end signed build in this sandboxed environment while keeping `Cert:\LocalMachine\My` as the primary path for production/CI machines.
- Narrowed the integrity script's baked-URL negative assertion to the specific local Supabase port (`127.0.0.1:54321`) instead of a bare `localhost`/`127.0.0.1` substring search, after confirming the broader pattern is a permanent false positive against `@supabase/supabase-js`'s own minified internals.
- Used the legacy anon JWT key format for `.env.production`, matching `.env.local`'s existing convention.
- Did not run the real installer on this shared dev/build machine (native-OS-UI carve-out — see Coverage D2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tauri.conf.json` cert resource path was wrong in the plan/RESEARCH.md/PATTERNS.md**
- **Found during:** Task 1
- **Issue:** All three planning docs specified `"../cert/selfsigned.cer": "cert/selfsigned.cer"` as the new `bundle.resources` entry. `tauri.conf.json` resource paths resolve relative to `src-tauri/` (its own directory) — confirmed by the existing `broker.exe` entry (`"../broker/target/release/broker.exe"` correctly reaches the repo-root `broker/` dir) and the `icon` array (no `../` prefix, correctly reaching `src-tauri/icons/`). Since `generate-build-cert.ps1` writes to `src-tauri/cert/selfsigned.cer` (as the plan itself specifies), `"../cert/selfsigned.cer"` would have pointed at a nonexistent `repo-root/cert/selfsigned.cer` and failed the build with a missing-resource error.
- **Fix:** Used `"cert/selfsigned.cer": "cert/selfsigned.cer"` (no `../`) instead.
- **Files modified:** `src-tauri/tauri.conf.json`
- **Verification:** Real `npm run tauri build` completed successfully and produced both bundles with the cert resource correctly included (confirmed via `verify-installer-integrity.ps1` Check 1's 7z payload listing showing `selfsigned.cer` present).
- **Committed in:** `a7b44a6`

**2. [Rule 3 - Blocking] `Cert:\LocalMachine\My` denied in this non-elevated sandbox session**
- **Found during:** Task 1
- **Issue:** This execution session's PowerShell is not running elevated (`IsInRole(Administrator)` returns `False`). `New-SelfSignedCertificate -CertStoreLocation Cert:\LocalMachine\My` failed with `Access denied. 0x80090010 (NTE_PERM)`, exactly as this task's `environment_notes` anticipated.
- **Fix:** Per the explicit environment guidance, added a documented fallback in `generate-build-cert.ps1`: on an access-denied/elevation-specific error against `Cert:\LocalMachine\My`, retry against `Cert:\CurrentUser\My` with a loud `Write-Host` warning. `signtool.exe` signs identically regardless of which store the cert lives in.
- **Files modified:** `scripts/generate-build-cert.ps1`
- **Verification:** Real build ran end-to-end using the `Cert:\CurrentUser\My` fallback; `Get-AuthenticodeSignature` thumbprint matched exactly. The primary `Cert:\LocalMachine\My` path is unchanged and is what a production build machine (elevated, per this phase's locked decisions) will use.
- **Committed in:** `a7b44a6`

**3. [Rule 1 - Bug] Integrity script's baked-URL negative assertion was a permanent false positive**
- **Found during:** Task 2
- **Issue:** RESEARCH.md Pattern 5's literal example (`grep -rL "127.0.0.1\|localhost" dist/assets/*.js`) fails on every real build, correct or not: `@supabase/supabase-js`'s minified bundle unconditionally contains the string `http://localhost:9999` (an internal GoTrue library constant, unrelated to app configuration) and a hostname-validation regex referencing `localhost`. A first real run of the script against a correctly-built installer (remote URL confirmed present, verified separately that `127.0.0.1:54321` — the actual `.env.local` value — was absent) failed at this check.
- **Fix:** Narrowed the negative assertion to the specific local Supabase stack URL `127\.0\.0\.1:54321` (the literal value in `.env.local`), which is the actual signal RESEARCH.md's own Pitfall 3 describes ("A built installer that connects to 127.0.0.1:54321..."). The positive assertion (remote project ref substring) is unchanged.
- **Files modified:** `scripts/verify-installer-integrity.ps1`
- **Verification:** Re-ran against the same build: Check 4 now passes; confirmed via direct inspection that the false-positive matches were all inside `@supabase/supabase-js` library internals, not the app's own configured URL.
- **Committed in:** `eb1c011`

---

**Total deviations:** 3 auto-fixed (1 Rule 1 config-path bug, 1 Rule 3 environment/elevation constraint, 1 Rule 1 check-logic bug)
**Impact on plan:** All three were necessary for the plan's own tasks to actually complete and prove what they claim to prove. No scope creep — no files touched beyond what the plan named.

## Issues Encountered

**Windows PowerShell 5.1 encoding pitfall (not a plan deviation, a scripting-environment note):** An early draft of `scripts/generate-build-cert.ps1` used em dash (`—`) characters in comments and a string literal. Without a BOM, Windows PowerShell 5.1 reads a `.ps1` file using the system's active codepage rather than UTF-8; the UTF-8 em-dash byte sequence gets misinterpreted byte-by-byte, and one of the resulting garbled characters renders as a stray double-quote, corrupting an otherwise-valid double-quoted string and producing confusing cascading parser errors ("string missing terminator", "missing closing '}'") several lines away from the actual cause. Fixed by rewriting the script with plain ASCII (hyphens instead of em dashes), matching this repo's existing PowerShell scripts' style. Verified via `[System.Management.Automation.Language.Parser]::ParseFile` before every subsequent run. No repo files carry this risk going forward since both new scripts are now ASCII-only.

## Next Phase Readiness
- DEP-01 and DEP-02 are both closed. Combined with Plan 20-01's DEP-03/DEP-04, Phase 20 has no remaining automatable work.
- **One documented manual-only observation remains, per this repo's CLAUDE.md carve-out for native OS UI:** a single UAC prompt covering all elevated post-install steps, and the expected one-time SmartScreen "More info → Run anyway" click-through on first launch. Not attempted in this session (would install a real Windows service/firewall rule/Trusted-Root cert on the shared dev/build machine via a non-automatable interactive elevation dialog) and not delegated to a human to click through — recorded as the accepted carve-out (Coverage D2), consistent with the phase's already-locked delivery decision (self-signed cert + Trusted-Root import + accepted one-time SmartScreen click-through, not a real CA cert).
- Before the next real CI release cut: confirm the new `gencert` step and `args` wiring actually produce a signed artifact end-to-end on the self-hosted Windows runner (Coverage D4 — deferred by design, not a gap).
- `.env.production`'s `ANTHROPIC_API_KEY`-adjacent concern from Plan 20-01 (placeholder value) is unrelated to this plan and remains an open follow-up documented there.

## Self-Check: PASSED
- FOUND: scripts/generate-build-cert.ps1
- FOUND: scripts/verify-installer-integrity.ps1
- FOUND: windows/hooks.nsh (contains 4 ExecWait lines)
- FOUND: src-tauri/tauri.conf.json (contains publisher + cert resource)
- FOUND: .github/workflows/release.yml (contains generate-build-cert.ps1 + certificateThumbprint)
- FOUND commit: a7b44a6
- FOUND commit: eb1c011
- FOUND commit: be075ad

---
*Phase: 20-store-deployment-installer*
*Completed: 2026-08-30*
