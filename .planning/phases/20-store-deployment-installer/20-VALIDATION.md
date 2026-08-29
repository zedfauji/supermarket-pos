---
phase: 20
slug: store-deployment-installer
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-28
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None applicable in the traditional sense — this phase's "tests" are PowerShell/bash verification scripts run against build artifacts and a live remote backend, not Vitest/Playwright |
| **Config file** | none — see Wave 0 |
| **Quick run command** | `powershell -File scripts/verify-installer-integrity.ps1` (new, DEP-02) |
| **Full suite command** | `powershell -File scripts/verify-installer-integrity.ps1` + `powershell -File scripts/verify-print-broker-install.ps1` (Phase 19, extended) run together against a real installed machine |
| **Estimated runtime** | ~60 seconds (scripts) + one real `npm run tauri build` (~2-5 min) + one real install |

---

## Sampling Rate

- **After every task commit:** re-run the specific script for the artifact just changed (integrity check after a `tauri.conf.json`/`hooks.nsh` change; `functions list`/`secrets list` after a deploy-script change).
- **After every plan wave:** run both halves together — a real `npm run tauri build` plus a real `supabase functions deploy`/`secrets set` against the remote project (it currently has nothing to lose).
- **Before `/gsd-verify-work`:** `verify-installer-integrity.ps1` green, `supabase functions list` shows 12/12, `supabase secrets list` shows all 4-5 names.
- **Max feedback latency:** ~300 seconds (bounded by one `npm run tauri build`).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | DEP-03 | T-20-01 / — | 12/12 edge functions deployed and reachable | script | `supabase functions list --project-ref mkvinyekkyennyegfoxq` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | DEP-04 | T-20-01 / — | all required secrets set, none exposed client-side | script | `supabase secrets list --project-ref mkvinyekkyennyegfoxq` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 2 | DEP-01 | T-20-02 / V6,V14 | installer signed with expected thumbprint; cert private key never bundled | script | `powershell -File scripts/verify-installer-integrity.ps1` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 2 | DEP-02 | T-20-02 / — | built artifact contains broker.exe, cert, correct baked remote URL, printer hooks | script | `powershell -File scripts/verify-installer-integrity.ps1` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/deploy-remote-backend.ps1` — DEP-03/DEP-04 bulk deploy + secrets + smoke check
- [ ] `scripts/generate-build-cert.ps1` — DEP-01 cert generation, thumbprint output
- [ ] `scripts/verify-installer-integrity.ps1` — DEP-02 post-build artifact check
- [ ] `supabase/.env.secrets.production` (git-ignored — must be added to `.gitignore` alongside `.env.production`, since neither currently matches an existing `.gitignore` pattern)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Single UAC prompt during install; one-time SmartScreen "More info → Run anyway" click-through on first launch, no SmartScreen on subsequent runs/updates | DEP-01 | Native OS UI event (UAC dialog, SmartScreen dialog) — no supported automation hook exists for either; matches this repo's CLAUDE.md carve-out for native Tauri window shell / OS chrome | Run the built installer once on a real (or real-like) Windows target machine; observe exactly one UAC prompt and, on first launch only, one SmartScreen prompt requiring "Run anyway"; confirm no further prompts on a second launch or after an auto-update |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
