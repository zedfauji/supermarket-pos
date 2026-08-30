---
phase: 20-store-deployment-installer
verified: 2026-08-29T00:00:00Z
status: gaps_found
score: 4/5 must-haves verified (with caveats)
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "A real end-to-end smoke pass (login -> checkout -> print -> shipment receiving -> staff creation) succeeds against the remote backend with zero manual configuration steps beyond running the installer and clicking through the one SmartScreen prompt (ROADMAP Phase 20 Success Criterion 5)."
    status: failed
    reason: "Neither 20-01-PLAN.md nor 20-02-PLAN.md scoped this success criterion into any task, must_have, or acceptance criterion. 20-VALIDATION.md's own 'Manual-Only Verifications' table lists only the UAC/SmartScreen native-OS-UI item -- it does not list this smoke pass at all. No e2e spec targets the remote project (grep of e2e/ for the project ref 'mkvinyekkyennyegfoxq' returns zero files); playwright.config.ts's baseURL/webServer are wired to the local dev server only. There is no evidence -- automated or manual -- that login, checkout, print, shipment receiving, or staff creation were ever exercised against the deployed remote backend end-to-end. This is a distinct requirement from the accepted UAC/SmartScreen native-OS-UI carve-out and is not covered by it."
    artifacts:
      - path: "e2e/"
        issue: "No spec exercises the remote Supabase project; all specs run against localhost:1520 per playwright.config.ts"
      - path: ".planning/phases/20-store-deployment-installer/20-VALIDATION.md"
        issue: "'Manual-Only Verifications' table omits this success criterion entirely -- only the UAC/SmartScreen item is listed"
    missing:
      - "An automated Playwright spec (per this repo's CLAUDE.md mandatory-automated-testing policy) that points a built/dev client at the remote project (mkvinyekkyennyegfoxq) and exercises login -> checkout -> print (or a mockable/observable equivalent) -> shipment receiving -> staff creation, OR an explicit, reasoned override/deferral decision recorded in STATE.md or the decisions notes if this is intentionally out of scope for Phase 20."
behavior_unverified_items:
  - truth: "npm run tauri build produces an NSIS installer signed with a freshly-generated cert, and Get-AuthenticodeSignature's thumbprint matches exactly (DEP-01)."
    test: "Run `powershell -File scripts/generate-build-cert.ps1` to capture a thumbprint, then `npm run tauri build -- --config \"{...certificateThumbprint...}\"`, then `Get-AuthenticodeSignature` on the produced .exe."
    expected: "SignerCertificate.Thumbprint exactly equals the thumbprint generate-build-cert.ps1 printed in the same run."
    why_human: "src-tauri/target/release/ does not exist in this verification session (only target/debug/ is present) -- the 20-02 SUMMARY's build artifact never persisted (git-ignored, expected). Independently reproducing the build requires first recreating .env.production, which requires fetching the remote anon key via `supabase projects api-keys` -- that exact command was denied outright by this verification session's own command classifier (identical to the constraint the original executor documented in 20-01-SUMMARY.md Deviation #1), so a fresh end-to-end rebuild could not be attempted this session. All static wiring this build depends on (tauri.conf.json publisher/resources/installerHooks, windows/hooks.nsh's 4 ExecWait lines, generate-build-cert.ps1's LocalMachine/CurrentUser fallback logic) was independently confirmed present and correctly shaped."
  - truth: "scripts/verify-installer-integrity.ps1 run against a real build reports all 5 checks passing, and fails specifically at Check 2 with a deliberately wrong thumbprint (DEP-02)."
    test: "Run `powershell -File scripts/verify-installer-integrity.ps1 -InstallerPath <built .exe> -ExpectedThumbprint <thumb>` against a real build, then again with a wrong thumbprint."
    expected: "All 5 'OK:' lines + 'All checks passed', exit 0 on the correct run; 'FAILED: thumbprint mismatch...' and non-zero exit on the wrong-thumbprint run."
    why_human: "No built installer exists in this session to run the script against (same root cause as the item above). The script's source was read in full and independently confirmed to implement all 5 documented checks (7z payload listing with a documented 7z-absent fallback, thumbprint-only signature check that never asserts .Status, Zone.Identifier MOTW check, dist/assets grep for the remote project ref with a narrowed 127.0.0.1:54321 negative assertion, and a source-side hooks.nsh + tauri.conf.json wiring check) -- logic is sound and matches the plan's acceptance criteria; only live execution against a real artifact is unverified here."
---

# Phase 20: Store Deployment: Signed Elevated Installer Verification Report

**Phase Goal:** A `npm run tauri build` on this repo produces a single NSIS installer that a store owner can run with one UAC prompt to get a fully working, code-signed POS pointed at a fully deployed remote Supabase backend — no manual `supabase functions deploy`, no manual secret-setting, no SmartScreen warning (beyond the one accepted first-launch click-through), no localhost-baked build.

**Verified:** 2026-08-29
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to ROADMAP Phase 20 Success Criteria 1-5)

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | All 12 required Edge Functions deployed and reachable, verified by invoking each from a real build | ✓ VERIFIED | Independently reproduced this session: `supabase functions list --project-ref mkvinyekkyennyegfoxq` shows all 12 required names, all `ACTIVE`. Live `curl` against all 12 `https://mkvinyekkyennyegfoxq.supabase.co/functions/v1/<name>` URLs returned `401` (auth-required, i.e. reachable/deployed) for every one. Negative control against `.../functions/v1/typo-nonexistent` returned the exact `{"code":"NOT_FOUND","message":"Requested function was not found"}` body, proving the reachability signal is discriminating. |
| 2 | Every edge-function secret set on the remote project, verified by `secrets list` showing all required keys with non-empty digests | ✓ VERIFIED (with accepted, explicitly-flagged caveat) | Independently reproduced: `supabase secrets list --project-ref mkvinyekkyennyegfoxq` shows `ANTHROPIC_API_KEY`, `BAR_ADDRESS`, `BAR_NAME`, `RECEIPT_FROM_EMAIL`, `RESEND_API_KEY` all present with non-empty digests (plus Supabase's own auto-managed secrets). Per this task's explicit framing, `ANTHROPIC_API_KEY` is a deliberate, store-owner-approved placeholder (`sk-ant-demo-placeholder-REPLACE-BEFORE-LAUNCH`) — `agent-proxy` will 401 against Anthropic until replaced. This is an accepted, documented gap, not a verification failure. |
| 3 | `npm run tauri build` produces an installer that runs fully elevated (single UAC prompt) and registers the broker service, firewall rule, and Trusted-Root cert import in that one elevation | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (wiring VERIFIED; live build/install not reproduced this session) | `windows/hooks.nsh` independently confirmed to contain all 4 `ExecWait` lines (broker install, firewall rule, service start, `certutil -f -addstore Root`) inside one `NSIS_HOOK_POSTINSTALL` macro. `src-tauri/tauri.conf.json` independently confirmed to carry `"publisher": "Taj House of Spice Supermarket POS"`, a `bundle.resources` entry for `cert/selfsigned.cer`, and `bundle.windows.nsis.installerHooks` = `../windows/hooks.nsh`. `scripts/generate-build-cert.ps1` read in full — correctly generates a fresh CodeSigningCert, exports public-only, prints only the thumbprint to stdout. The actual signed build artifact (`src-tauri/target/release/bundle/nsis/*.exe`) does not exist in this session (only `target/debug/` is present) and could not be independently regenerated — recreating `.env.production` requires the remote anon key, and `supabase projects api-keys` was denied outright by this session's own command classifier, the identical constraint the original executor hit and documented. Real install (UAC/SmartScreen observation) remains this repo's one accepted CLAUDE.md manual-only carve-out — not re-litigated here. |
| 4 | An installer integrity-check script confirms the built artifact contains broker.exe, the signing cert, the correct baked remote URL, and the NSIS hooks | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (script logic VERIFIED; live execution not reproduced this session) | `scripts/verify-installer-integrity.ps1` read in full — independently confirmed to implement all 5 documented checks correctly (7z payload listing with a 7z-absent fallback; Authenticode thumbprint-only match, never `.Status`; Zone.Identifier MOTW absence check; `dist/assets/*.js` grep for the remote project ref with a narrowed local-port negative assertion; source-side `hooks.nsh` + `tauri.conf.json` wiring check). Could not be re-run against a live artifact for the same reason as Truth 3 (no built installer exists this session). |
| 5 | A real end-to-end smoke pass (login → checkout → print → shipment receiving → staff creation) succeeds against the remote backend with zero manual configuration beyond running the installer and the one accepted SmartScreen click-through | ✗ FAILED | Not addressed by either plan. `20-VALIDATION.md`'s "Manual-Only Verifications" table lists only the UAC/SmartScreen native-OS-UI item — this smoke pass is absent from it entirely. No e2e spec references the remote project (`grep -rl mkvinyekkyennyegfoxq e2e/` = 0 files); `playwright.config.ts`'s `baseURL`/`webServer` target the local dev server only. No automated or manual evidence exists that login/checkout/print/shipment-receiving/staff-creation were ever exercised against the deployed remote backend. |

**Score:** 2/5 truths fully VERIFIED, 2/5 PRESENT_BEHAVIOR_UNVERIFIED (wiring confirmed, live artifact unreproducible in this sandboxed session), 1/5 FAILED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/deploy-remote-backend.ps1` | Idempotent bulk deploy + secrets ops script | ✓ VERIFIED | Exists, committed (`0710505`, `1b2d8e0`); underlying effects (12 functions, 5 secrets) independently reproduced live |
| `scripts/generate-build-cert.ps1` | Fresh cert generation, thumbprint-only stdout | ✓ VERIFIED (substantive) | Read in full — correct `New-SelfSignedCertificate`/`Export-Certificate` (public-only) logic, `LocalMachine`→`CurrentUser` fallback, thumbprint-only `Write-Output` contract |
| `scripts/verify-installer-integrity.ps1` | 5-check pre-ship integrity script | ✓ VERIFIED (substantive) | Read in full — all 5 checks correctly implemented per plan spec |
| `windows/hooks.nsh` | 4 idempotent `ExecWait` lines in `NSIS_HOOK_POSTINSTALL` | ✓ VERIFIED | Independently read — all 4 lines present (broker install, firewall, service start, certutil Trusted-Root) |
| `src-tauri/tauri.conf.json` | `publisher` + cert `bundle.resources` entry + `installerHooks` pointer | ✓ VERIFIED | Independently parsed via `node` — all three present and correctly shaped |
| `.github/workflows/release.yml` | `gencert` step + `certificateThumbprint` arg wired into `tauri-action` | ✓ VERIFIED | Independently grepped — `id: gencert`, `generate-build-cert.ps1` invocation, `args: '--config {"bundle":{"windows":{"certificateThumbprint":"${{ steps.gencert.outputs.thumbprint }}"...` all present |
| `src-tauri/target/release/bundle/nsis/*.exe` (built installer) | Real signed installer artifact | ✗ MISSING (this session) | Does not exist on disk; only `target/debug/` present. Expected to not persist across sessions (git-ignored build output) — not itself a phase defect, but means the DEP-01/DEP-02 live-artifact claims could not be independently re-executed here (see behavior_unverified_items) |
| `.env.production` | Remote `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, git-ignored | ✗ MISSING (this session) but correctly gitignored | `Test-Path` returns `False`; `git check-ignore -v .env.production` confirms it would be ignored if it existed. Same non-persistence as above. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scripts/deploy-remote-backend.ps1` | Remote Edge Functions runtime | `supabase functions deploy` / `functions list` | ✓ WIRED | Independently confirmed live: 12/12 `ACTIVE`, 12/12 return 401 not 404 |
| `scripts/deploy-remote-backend.ps1` | Remote secrets store | `supabase secrets set --env-file` / `secrets list` | ✓ WIRED | Independently confirmed live: 5/5 required names present with digests |
| `scripts/generate-build-cert.ps1` | `npm run tauri build --config certificateThumbprint` | thumbprint capture | ⚠️ Present, not re-exercised live this session | Static wiring confirmed (tauri.conf.json + script contract); original SUMMARY documents an exact matching-thumbprint result from a real run |
| `windows/hooks.nsh` `certutil -addstore Root` | `scripts/verify-print-broker-install.ps1` Check 6 | `-ExpectedThumbprint` param | ✓ WIRED (source-side) | `verify-print-broker-install.ps1` extension not independently re-read this session beyond SUMMARY's own claim, but `hooks.nsh`'s side of the link is confirmed |
| `.github/workflows/release.yml` `gencert` step | `tauri-apps/tauri-action` build args | `${{ steps.gencert.outputs.thumbprint }}` | ✓ WIRED | Independently grepped, output reference present in the `args` value |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| 12 edge functions reachable | `curl` against all 12 function URLs | All 401 | ✓ PASS |
| Negative control distinguishes deployed vs. not | `curl .../functions/v1/typo-nonexistent` | `404 "Requested function was not found"` | ✓ PASS |
| 5 secrets present by name | `supabase secrets list --project-ref mkvinyekkyennyegfoxq` | All 5 present with digests | ✓ PASS |
| Real signed build reproducible this session | attempted `.env.production` recreation via `supabase projects api-keys` | Denied by sandbox command classifier | ? SKIP (documented, same constraint as original executor) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DEP-03 | 20-01 | All 12 edge functions deployed | ✓ SATISFIED | Live `functions list` + curl reachability, independently reproduced |
| DEP-04 | 20-01 | All 5 secrets set | ✓ SATISFIED (ANTHROPIC_API_KEY placeholder explicitly accepted per task framing) | Live `secrets list`, independently reproduced |
| DEP-01 | 20-02 | Signed, single-UAC-prompt elevated installer | ⚠️ NEEDS HUMAN / re-run to reconfirm live artifact | Wiring fully verified; live build not reproduced this session due to sandbox anon-key restriction |
| DEP-02 | 20-02 | Pre-ship integrity-check script | ⚠️ NEEDS HUMAN / re-run to reconfirm live artifact | Script logic fully verified; live execution not reproduced this session |

**Orphaned requirement check:** `.planning/REQUIREMENTS.md` still shows DEP-01 through DEP-04 as unchecked `[ ]` checkboxes and the Phase/Status table (lines 219-222) still lists all four as "Pending". This is a documentation-hygiene gap, not a code gap — REQUIREMENTS.md was not updated to reflect completion, but this does not affect the phase-goal verdict.

### Anti-Patterns Found

None found in the files this phase modified (`scripts/deploy-remote-backend.ps1`, `scripts/generate-build-cert.ps1`, `scripts/verify-installer-integrity.ps1`, `windows/hooks.nsh`, `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`) — no TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers, no stub returns, no hardcoded-empty data flowing to output.

### Human Verification Required

### 1. Real signed build + install reproduction (DEP-01/DEP-02)

**Test:** On an unrestricted machine (not this sandboxed verification session), run `scripts/generate-build-cert.ps1`, then `npm run tauri build -- --config "..."`, then `scripts/verify-installer-integrity.ps1` against the result.
**Expected:** All 5 integrity checks pass; `Get-AuthenticodeSignature` thumbprint matches the generated cert's thumbprint.
**Why human/re-run needed:** This verification session's own command classifier denies `supabase projects api-keys` (needed to recreate `.env.production`), an environment restriction, not a code defect — identical to the constraint the original executor hit and documented in 20-01-SUMMARY.md. The original SUMMARY's specific, detailed claims (exact matching thumbprint, exact installer filename, a deliberate wrong-thumbprint negative test) are credible and consistent with the independently-verified static wiring, but a truly independent re-execution of the live build/sign/verify chain could not be performed in this session.

### 2. End-to-end remote-backend smoke pass (ROADMAP Success Criterion 5) — BLOCKING GAP

**Test:** Build the installer per DEP-01, install it (or run the built app pointed at `.env.production`), and exercise: login → checkout → print → shipment receiving → staff creation, all against the remote project `mkvinyekkyennyegfoxq`.
**Expected:** All five flows succeed with zero manual configuration beyond running the installer and the one accepted SmartScreen click-through.
**Why human/action needed:** This is not the accepted UAC/SmartScreen carve-out — it is a distinct, unaddressed functional requirement. Per this repo's CLAUDE.md, this should be automated via Playwright (pointing a build at the remote backend) rather than left as a manual step; no such automation exists, and no manual pass was recorded either. **This is the primary blocker for phase completion.**

### Gaps Summary

Phase 20's backend half (DEP-03/DEP-04) is solidly and independently verified: all 12 edge functions are live and reachable, and all 5 required secrets are set (with the `ANTHROPIC_API_KEY` placeholder correctly flagged as an accepted, non-blocking interim state per the task's own explicit framing — not counted as a gap).

The installer-signing half (DEP-01/DEP-02) has fully correct, independently-confirmed static wiring (cert generation script, NSIS hooks, `tauri.conf.json`, CI workflow, integrity-check script logic) but its live-artifact claims could not be re-executed in this sandboxed verification session for the same documented reason the original executor hit (a blocked `supabase projects api-keys` call needed to recreate `.env.production`). This is flagged for a re-run on an unrestricted machine rather than treated as a failure, given the strength of the corroborating static evidence and the original SUMMARY's specific, falsifiable claims.

The one confirmed blocking gap is **ROADMAP Phase 20 Success Criterion 5**: a real end-to-end smoke pass (login → checkout → print → shipment receiving → staff creation) against the deployed remote backend. This was never scoped into either plan's tasks or must-haves, is absent from `20-VALIDATION.md`'s manual-verification table, and has no automated or manual evidence of ever having been executed. This is distinct from — and not covered by — the accepted UAC/SmartScreen native-OS-UI carve-out, and per this repo's CLAUDE.md mandatory-automated-testing policy it should have been closed with a Playwright spec rather than omitted.

---

*Verified: 2026-08-29*
*Verifier: Claude (gsd-verifier)*
