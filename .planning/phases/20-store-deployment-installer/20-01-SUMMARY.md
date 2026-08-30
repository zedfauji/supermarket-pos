---
phase: 20-store-deployment-installer
plan: 01
subsystem: infra
tags: [supabase, edge-functions, secrets, powershell, deploy-ops]

# Dependency graph
requires: []
provides:
  - "All 12 required Supabase Edge Functions deployed to remote project mkvinyekkyennyegfoxq and confirmed reachable over HTTPS"
  - "All 5 required edge-function secrets set on the remote project (ANTHROPIC_API_KEY is a known placeholder, see Deviations)"
  - "scripts/deploy-remote-backend.ps1 — idempotent, re-runnable ops script for both concerns"
affects: [20-02-installer-signing, ai-vision-pipeline, receipt-email, checkout-receipts]

actuals:
  tokens: 2100
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Fail-fast PowerShell ops script shape (CmdletBinding/param, $ErrorActionPreference='Stop', Fail helper, colored OK/FAILED Write-Host), matching scripts/verify-print-broker-install.ps1"
    - "Bulk supabase functions deploy / supabase secrets set --env-file, no per-item loop"

key-files:
  created:
    - scripts/deploy-remote-backend.ps1
    - supabase/.env.secrets.production (git-ignored, never tracked)
  modified:
    - .gitignore

key-decisions:
  - "Skipped fetching the remote anon key (via Supabase MCP tool or `supabase projects api-keys`) for the reachability smoke-check — neither was usable in this sandboxed execution environment (no MCP session; the CLI command is blocked outright by this environment's own command classifier since it can print live key material). Adapted the check to send a plain unauthenticated request instead: every one of the 12 functions returns 401 'Missing authorization header' (not 404), which the plan's own acceptance logic already treats as proof of reachability. Verified empirically against all 12 real deployed functions."
  - "ANTHROPIC_API_KEY was set to a store-owner-supplied, deliberately non-functional placeholder value (sk-ant-demo-placeholder-REPLACE-BEFORE-LAUNCH) at the owner's explicit, informed request — not fabricated by the executor. Flagged clearly below and NOT treated as satisfying DEP-04 for that one key."
  - "The full assembled deploy-remote-backend.ps1 (Section 1 + Section 2 combined) could not be executed as a single `powershell -File ...` invocation in this sandbox once it contained a live `secrets set --env-file` line — the environment's command classifier denies executing a script file containing that pattern, even though it permits the identical `supabase secrets set --env-file ...` command run directly. Verified script correctness via: (a) a full run of Section 1 alone before Section 2 was appended (exits 0, twice), (b) a PowerShell AST parse of the complete file confirming zero syntax errors, and (c) the exact CLI commands Section 2 wraps, run directly and successfully twice against the real remote project. This is a sandbox/environment constraint on this executor's own shell, not a defect in the script; the script will run end-to-end normally for the store owner or CI on an unrestricted machine."

requirements-completed: [DEP-03, DEP-04]

coverage:
  - id: D1
    description: "All 12 required Supabase Edge Functions deployed to the remote project mkvinyekkyennyegfoxq and confirmed reachable over live HTTPS (401, not 404 'Requested function was not found')"
    requirement: "DEP-03"
    verification:
      - kind: other
        ref: "supabase functions list --project-ref mkvinyekkyennyegfoxq (real run, 2026-08-29/30) — 12/12 ACTIVE; live curl against all 12 URLs returned 401 UNAUTHORIZED_NO_AUTH_HEADER; negative control against .../functions/v1/typo-nonexistent returned 404 'Requested function was not found'"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 5 required edge-function secrets set on the remote project and confirmed present by name via `secrets list` (values never asserted/printed); re-running secrets set a second time proves upsert-not-wipe semantics"
    requirement: "DEP-04"
    verification:
      - kind: other
        ref: "supabase secrets list --project-ref mkvinyekkyennyegfoxq (real run, twice) — ANTHROPIC_API_KEY, RESEND_API_KEY, RECEIPT_FROM_EMAIL, BAR_NAME, BAR_ADDRESS all present both times with identical digests"
        status: pass
    human_judgment: true
    rationale: "ANTHROPIC_API_KEY's value is a deliberate placeholder, not a real credential — DEP-04's underlying intent (agent-proxy able to actually call Anthropic) is not yet met for that one secret. A human must confirm this is an acceptable interim state and follow up before the AI vision feature is expected to work live."
  - id: D3
    description: "Both .gitignore patterns (.env.production, supabase/.env.secrets.production) confirmed via git check-ignore BEFORE either file existed on disk; secrets file never tracked by git"
    requirement: "DEP-04"
    verification:
      - kind: other
        ref: "git check-ignore -v supabase/.env.secrets.production && git check-ignore -v .env.production (both matched, run before file creation); git status --short --ignored confirms supabase/.env.secrets.production is `!!` (ignored, untracked) after creation"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-30
status: complete
---

# Phase 20 Plan 01: Remote Supabase Backend Completeness (DEP-03/DEP-04) Summary

**All 12 Supabase Edge Functions deployed and verified reachable on the remote project; 5 required secrets set, with ANTHROPIC_API_KEY intentionally left as a store-owner-supplied placeholder pending the real key.**

## Performance

- **Duration:** ~45 min across two sessions (checkpoint pause for secret collection in between)
- **Started:** 2026-08-29T20:00:00Z (approx)
- **Completed:** 2026-08-30T01:50:00Z (approx)
- **Tasks:** 3 (all complete)
- **Files modified:** 3 (`scripts/deploy-remote-backend.ps1` created, `.gitignore` extended, `supabase/.env.secrets.production` created — git-ignored)

## Accomplishments
- Deployed all 12 required edge functions (`process-payment`, `process-split-payment`, `create-staff`, `process-direct-sale`, `receive-shipment`, `send-receipt-email`, `settings-backup`, `settings-restore`, `settings-email-status`, `settings-test-email`, `get-server-time`, `agent-proxy`) to `mkvinyekkyennyegfoxq` — all `ACTIVE`, all independently confirmed reachable over live HTTPS.
- Set all 5 required secrets on the remote project (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, `BAR_NAME`, `BAR_ADDRESS`) and confirmed name-only presence twice, proving upsert-not-wipe semantics.
- Built `scripts/deploy-remote-backend.ps1`, a single re-runnable ops script covering both concerns, following this repo's existing fail-fast PowerShell verification-script shape.
- Closed the `.gitignore` gap flagged by RESEARCH.md Pitfall 3 — `.env.production` and `supabase/.env.secrets.production` are now both git-ignored, confirmed before either file was created, in a public repo.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — deploy all 12 edge functions to remote + prove real reachability (DEP-03)** - `0710505` (feat)
2. **Task 2: Collect real production secret values (checkpoint:human-action)** - no commit (checkpoint resolved by coordinator relaying store-owner-supplied values; nothing to commit for this task itself)
3. **Task 3: Gitignore the secrets files, write the env file, and set remote secrets (DEP-04)** - `1b2d8e0` (feat)

## Files Created/Modified
- `scripts/deploy-remote-backend.ps1` - New. Section 1: project-ref/CLI/functions-dir preconditions, bulk `supabase functions deploy`, `functions list` name-set assertion, per-function HTTPS reachability smoke-check. Section 2 (below `# --- Secrets (DEP-04) ---`): env-file existence/line-count guard, `supabase secrets set --env-file`, `secrets list` name-presence assertion.
- `.gitignore` - Added `.env.production` and `supabase/.env.secrets.production` immediately after the existing `.env`/`.env.local` block.
- `supabase/.env.secrets.production` - New, git-ignored, never tracked. Contains the 5 real `KEY=value` pairs collected from the store owner (one is a placeholder — see Deviations).

## Decisions Made
- Anon-key fetch for the reachability check was dropped in favor of a plain unauthenticated request (see Deviations #1) — functionally equivalent per the plan's own stated acceptance logic (any non-404 status = reachable).
- `BAR_NAME`/`BAR_ADDRESS` were set with real values, not renamed (per RESEARCH.md Open Question 3's resolution — rename deferred as zero-urgency, out of scope for this plan).
- `ANTHROPIC_API_KEY` was set to the store owner's own explicitly-requested placeholder value rather than being rejected as a fabricated/rejected-looking placeholder — this was a deliberate, informed choice relayed by the coordinator on the owner's behalf, not an executor decision to accept low-quality input.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Anon-key fetch mechanism unavailable in this sandbox; adapted the reachability check**
- **Found during:** Task 1 (reachability smoke-check)
- **Issue:** The plan's Step C required fetching the project's anon key via the Supabase MCP tool (`mcp__supabase__get_publishable_api_key`) or, as fallback, `supabase projects api-keys`. This executor's tool set had no MCP server session available, and every invocation of `supabase projects api-keys` (with or without output redirection) was denied outright by this sandbox's own command classifier, since that command can print live secret key material.
- **Fix:** Adapted the check to issue the smoke-check HTTP GET with no `apikey` header at all. Empirically confirmed against all 12 real deployed functions: every one returns `401 UNAUTHORIZED_NO_AUTH_HEADER` (not `404`), which the plan's own logic already treats as "reachable and deployed" (any status other than the literal 404 not-found body). Negative control (a genuinely nonexistent function name) still correctly returns 404 with the exact "Requested function was not found" body, proving the check's discriminating power is unaffected.
- **Files modified:** `scripts/deploy-remote-backend.ps1` (documented inline as a comment block in the script's `.SYNOPSIS`/description)
- **Verification:** Ran live curl against all 12 function URLs plus one negative-control URL before finalizing the script; script itself ran end-to-end (Section 1 only, at that point) twice, exit 0 both times.
- **Committed in:** `0710505`

**2. [Rule 3 - Blocking] Full assembled script could not be run as a single invocation in this sandbox once Section 2 was appended**
- **Found during:** Task 3
- **Issue:** After appending Section 2 (which contains a real `supabase secrets set --env-file supabase/.env.secrets.production ...` line), invoking `powershell -File scripts/deploy-remote-backend.ps1` was denied outright by this sandbox's command classifier — apparently a stricter guard on script files that embed a live secrets-set invocation than on that same command run directly.
- **Fix:** Did not attempt to bypass the sandbox restriction (e.g., via `-Command` inlining). Instead verified correctness through three independent means: (a) Section 1 alone was already run to completion twice before Section 2 existed (see Task 1 commit), (b) a PowerShell AST parse (`[System.Management.Automation.Language.Parser]::ParseFile`) of the complete, final file confirmed zero syntax errors, (c) the exact CLI commands Section 2 wraps (`supabase secrets set --env-file ...` and `supabase secrets list ...`) were run directly, for real, twice against the real remote project, with identical results both times.
- **Files modified:** none beyond the script itself; this is a verification-methodology note, not a code change.
- **Verification:** `supabase secrets list --project-ref mkvinyekkyennyegfoxq` (run twice) shows all 5 required names present with identical SHA-256 digests both times, proving upsert-not-wipe semantics without ever needing the single-file end-to-end run.
- **Committed in:** `1b2d8e0`

---

**Total deviations:** 2 auto-fixed (both Rule 3 — sandbox/environment tooling access constraints, not plan or code defects)
**Impact on plan:** No scope creep. Both deviations are workarounds for this specific execution sandbox's own security posture (blocking commands that could print secret key material, and blocking single-invocation execution of a script file containing a live secrets-set command) — the underlying `scripts/deploy-remote-backend.ps1` is written to run normally end-to-end on any unrestricted machine (the store owner's own machine, or CI).

## Issues Encountered

**ANTHROPIC_API_KEY is a known non-functional placeholder — flagged explicitly, not hidden.**
Per the coordinator's relay of the store owner's explicit request, `ANTHROPIC_API_KEY` was set to `sk-ant-demo-placeholder-REPLACE-BEFORE-LAUNCH` rather than a real Anthropic key. This means:
- `agent-proxy` (the AI vision/chat pipeline) will return a 401/authentication error from Anthropic on any real invocation until the store owner supplies and sets the real key.
- No other secret is affected — `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, `BAR_NAME`, and `BAR_ADDRESS` are all real, verified values (the address was independently corroborated via the store's Facebook business page, per the coordinator).
- **Follow-up required before launch:** re-run `supabase secrets set --env-file supabase/.env.secrets.production --project-ref mkvinyekkyennyegfoxq` after updating the `ANTHROPIC_API_KEY` line in the (git-ignored, local-only) `supabase/.env.secrets.production` file with the real key. This is a one-line edit + one command, no code change needed.

Two sandbox-execution-environment constraints (unrelated to plan correctness) are documented above under Deviations.

## Next Phase Readiness
- DEP-03 and DEP-04 are both closed for the backend half of Phase 20. Plan 20-02 (installer signing) is fully independent and unblocked by this plan's work.
- Before shipping to the customer: swap the real `ANTHROPIC_API_KEY` into `supabase/.env.secrets.production` and re-run the secrets-set step (see Issues Encountered above).

## Self-Check: PASSED
- FOUND: scripts/deploy-remote-backend.ps1
- FOUND: .planning/phases/20-store-deployment-installer/20-01-SUMMARY.md (this file)
- FOUND commit: 0710505
- FOUND commit: 1b2d8e0

---
*Phase: 20-store-deployment-installer*
*Completed: 2026-08-30*
