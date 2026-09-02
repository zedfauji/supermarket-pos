# Phase 26: Multi-Customer Deployment - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 8 (new/modified)
**Analogs found:** 8 / 8

This phase is CI/CD + PowerShell infrastructure, not application TypeScript. All analogs below are git-tracked source files (verified present in the working tree read directly; none are gitignored mirrors).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/workflows/release.yml` (extended) | CI/CD workflow (fan-out job) | event-driven (tag push / dispatch) | `.github/workflows/release.yml` (itself, existing single-customer job) | exact — same file, additive |
| `customers/customers.json` | config/manifest | CRUD (read-mostly, human-edited) | none direct; closest is `supabase/.temp/project-ref`-style single-value config read in `deploy-remote-backend.ps1` | role-match |
| `customers/taj-house-of-spices/tauri.override.json` | config | transform (JSON merge-patch input) | `src-tauri/tauri.conf.json` (the file it partially overrides) | exact — subset-shape of same schema |
| `customers/taj-house-of-spices/icons/*` | static asset | file-I/O | `src-tauri/icons/*` (existing icon set referenced by `bundle.icon`) | exact |
| `scripts/onboard-customer.ps1` | utility/CLI script | event-driven (human-invoked, idempotent) | `scripts/generate-build-cert.ps1` + `scripts/deploy-remote-backend.ps1` | exact — same script role/idiom |
| `scripts/verify-installer-integrity.ps1` (extended) | test/verification script | file-I/O, batch | `scripts/verify-installer-integrity.ps1` (itself) | exact — same file, additive check |
| `docs/onboarding-new-customer.md` | documentation | n/a | none (new doc type in repo) | no analog |
| `src-tauri/tauri.conf.json` (stripped to placeholder) | config | transform | itself (pre-phase version, for diffing) | exact |

## Pattern Assignments

### `.github/workflows/release.yml` (CI/CD workflow, event-driven)

**Analog:** `.github/workflows/release.yml` lines 1-64 (current file, read in full)

**Trigger + permissions pattern** (lines 1-12):
```yaml
name: publish
on:
  workflow_dispatch:
  push:
    tags:
      - 'v*'

jobs:
  publish-tauri:
    permissions:
      contents: write
    runs-on: [self-hosted, windows]
```
Add a `read-manifest` job before `publish-tauri` (or convert `publish-tauri` into a matrix job) that outputs the active-customer list, per RESEARCH.md Pattern 4. Reuse `runs-on: [self-hosted, windows]` — same runner as today, self-hosted-workspace-persistence caveats (RESEARCH.md Anti-Patterns) apply per fan-out iteration.

**Existing single `--config` merge to extend to two** (line 33-63):
```yaml
      - name: generate build cert (Phase 20, DEP-01)
        id: gencert
        shell: pwsh
        run: |
          $output = powershell -File scripts/generate-build-cert.ps1
          $thumbprint = ($output | Select-Object -Last 1).ToString().Trim()
          if ($thumbprint -notmatch '^[0-9A-Fa-f]{40}$') {
            Write-Host "FAILED: unexpected thumbprint output: '$thumbprint'" -ForegroundColor Red
            exit 1
          }
          echo "thumbprint=$thumbprint" >> $env:GITHUB_OUTPUT

      - uses: tauri-apps/tauri-action@v0.6.2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'Supermarket POS v__VERSION__'
          releaseBody: 'See CHANGELOG.md for release notes.'
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          projectPath: .
          args: '--config {"bundle":{"windows":{"certificateThumbprint":"${{ steps.gencert.outputs.thumbprint }}","digestAlgorithm":"sha256"}}}'
```
D-06 extends `args:` to a second `--config customers/<name>/tauri.override.json` (RESEARCH.md Pattern 3 — verify via a `workflow_dispatch` smoke test per Assumption A1 before wiring into the real fan-out). Keep the two override JSON objects on disjoint top-level keys (cert override → `bundle.windows.*`; customer override → `identifier`/`publisher`/`plugins.updater.endpoints`/`bundle.icon`) — RFC 7396 replaces arrays wholesale, not merges them.

**Fail-loud gate before build (D-08)** — no existing analog does a pre-flight file-existence check inline in workflow YAML; follow the same fail-fast idiom `generate-build-cert.ps1`'s `Fail()` helper uses (`Write-Host "FAILED: ..." -ForegroundColor Red; exit 1`) as a `run:` step:
```yaml
- name: Assert customer override exists (D-08)
  shell: pwsh
  run: |
    $overridePath = "customers/${{ matrix.customer.name }}/tauri.override.json"
    if (-not (Test-Path -LiteralPath $overridePath)) {
      Write-Host "FAILED: missing override file '$overridePath' for customer '${{ matrix.customer.name }}' - refusing to build with core defaults (D-08)." -ForegroundColor Red
      exit 1
    }
```

**Mirror-push + matrix/environment (D-01/D-02, new to this repo)** — no existing analog for cross-repo push or matrix-driven `environment:`; use RESEARCH.md Pattern 1 and Pattern 2 verbatim (long-form `environment: { name: ... }`, `fail-fast: false`, PAT via `git remote add`/`push --mirror`/`git remote remove` cleanup — matches this repo's "no leftover materialized secrets on the self-hosted runner" convention already documented in RESEARCH.md's Anti-Patterns and in `deploy-remote-backend.ps1`'s comment block about not leaving secret material around).

---

### `customers/customers.json` (config/manifest, CRUD)

**No direct analog exists** — nearest structural precedent is `deploy-remote-backend.ps1` lines 61-80's single hardcoded `$projectRef = 'mkvinyekkyennyegfoxq'` plus a `Test-Path`/`ConvertFrom-Json`-style read of `supabase/.temp/project-ref`. Use RESEARCH.md's Code Example / Pattern 4 schema directly (fields per D-13: `name`, `repo`, `status`, `supabase_project_ref`, `deployment_mode`, plus `github_environment`):
```json
[
  {
    "name": "taj-house-of-spices",
    "repo": "zedfauji/supermarket-pos-taj",
    "status": "active",
    "supabase_project_ref": "mkvinyekkyennyegfoxq",
    "deployment_mode": "cloud",
    "github_environment": "taj-house-of-spices"
  }
]
```
Read idiom for the pwsh side — reuse `verify-installer-integrity.ps1`'s `Get-Content -LiteralPath ... -Raw | ConvertFrom-Json` (line 136) verbatim, same idiom RESEARCH.md's Pattern 4 already specifies.

---

### `customers/taj-house-of-spices/tauri.override.json` (config, transform)

**Analog:** `src-tauri/tauri.conf.json` (current hardcoded values to extract verbatim, per D-16)

**Fields to preserve exactly** (verified this session, lines 5, 32, 54):
```json
{
  "identifier": "com.tajhouseofspices.supermarketpos",
  "bundle": {
    "publisher": "Taj House of Spice Supermarket POS"
  },
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/zedfauji/supermarket-pos/releases/latest/download/latest.json"]
    }
  }
}
```
D-16 requires byte-identical values — do not regenerate/reformat the identifier or publisher strings. `tauri.conf.json`'s current `pubkey` (line 53) is NOT customer-specific (RESEARCH.md ASVS V6 note: "the signature keypair does not need to differ per customer") — leave it in core's stripped placeholder config, not in the override file.

**Core's stripped placeholder** (what `tauri.conf.json` becomes, D-16):
```json
{
  "identifier": "com.example.supermarketpos",
  "bundle": { "publisher": "Generic Publisher" },
  "plugins": { "updater": { "endpoints": [] } }
}
```
(Exact placeholder wording is Claude's discretion — must be obviously non-production and must fail loudly per D-08 if ever built without an override merged in.)

---

### `scripts/onboard-customer.ps1` (utility/CLI script, event-driven)

**Analog:** `scripts/generate-build-cert.ps1` (fail-fast helper + header-doc contract idiom) and `scripts/deploy-remote-backend.ps1` (idempotent multi-step ops-script structure with numbered checks)

**Header-doc + Fail() helper pattern** (`generate-build-cert.ps1` lines 34-42, identical idiom in every `scripts/*.ps1`):
```powershell
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}
```

**Idempotent "check state, skip or create" pattern** — RESEARCH.md's `onboard-customer.ps1` skeleton (already drafted against this repo's conventions) is the direct template:
```powershell
$existing = gh repo view "zedfauji/$repoName" --json name 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: repo zedfauji/$repoName already exists, skipping creation." -ForegroundColor Green
} else {
    gh repo create "zedfauji/$repoName" --private --confirm
    if ($LASTEXITCODE -ne 0) { Fail "gh repo create failed for $repoName." }
    Write-Host "OK: created zedfauji/$repoName" -ForegroundColor Green
}
```
Apply the same "$LASTEXITCODE-check, OK-or-create" shape to: GitHub Environment creation (`gh api -X PUT repos/.../environments/<name>`), secret setting (`gh secret set --env`), override-file/icon scaffolding (`Test-Path` before `New-Item`/`Copy-Item`), and `customers.json` entry upsert (read-mutate-write, same `Get-Content -Raw | ConvertFrom-Json` / `ConvertTo-Json | Set-Content` idiom `verify-installer-integrity.ps1` line 136 uses for reading `tauri.conf.json`).

**Numbered-checks-with-early-exit structure** — mirror `deploy-remote-backend.ps1`'s header doc listing each check/step in order (lines 18-33) as inline comments (`# --- Check 0: ... ---`) before each script section; this repo's convention is to narrate the script's own contract in comments, not just code.

---

### `scripts/verify-installer-integrity.ps1` (extended, test/verification, file-I/O)

**Analog:** itself, lines 43-144 (full file read)

**Fail-fast-per-check pattern to extend** (lines 78-86, thumbprint-match check — same shape needed for D-16/D-17's identifier/publisher/endpoint byte-for-byte comparison):
```powershell
$sig = Get-AuthenticodeSignature $InstallerPath
if (-not $sig.SignerCertificate) {
    Fail "'$InstallerPath' is not signed (no SignerCertificate)."
}
if ($sig.SignerCertificate.Thumbprint -ne $ExpectedThumbprint) {
    Fail "thumbprint mismatch: installer signed with '$($sig.SignerCertificate.Thumbprint)', expected '$ExpectedThumbprint'."
}
Write-Host "OK: installer signature thumbprint matches expected ($ExpectedThumbprint)." -ForegroundColor Green
```
Add a new "Check 6" following this exact shape: read `customers/taj-house-of-spices/tauri.override.json` via `ConvertFrom-Json` (same idiom as Check 5's `tauriConf.bundle.windows.nsis.installerHooks` read, lines 136-140), compare `identifier`/`publisher`/`updater.endpoints[0]` fields against the hardcoded expected strings, `Fail` with a specific mismatch message on any difference.

---

## Shared Patterns

### Fail-fast idiom (applies to every new/modified script and workflow step)
**Source:** `scripts/generate-build-cert.ps1` lines 37-42, replicated identically in `scripts/verify-installer-integrity.ps1` lines 52-57 and `scripts/deploy-remote-backend.ps1` lines 54-59
```powershell
$ErrorActionPreference = 'Stop'
function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}
```
**Apply to:** `onboard-customer.ps1`, the D-08 pre-build gate step in `release.yml`, the extended `verify-installer-integrity.ps1` check.

### JSON config read/mutate idiom
**Source:** `scripts/verify-installer-integrity.ps1` line 136 (`Get-Content -LiteralPath $tauriConfPath -Raw | ConvertFrom-Json`)
**Apply to:** `customers.json` manifest reads (both in `onboard-customer.ps1` and the workflow's `read-manifest` job), `tauri.override.json` read/scaffold in onboarding.

### `--config` JSON-merge-patch mechanism (no new code, reuse the tool)
**Source:** `.github/workflows/release.yml` line 63 (existing single `--config` usage)
**Apply to:** Second `--config customers/<name>/tauri.override.json` argument, per D-06/RESEARCH.md Pattern 3. Keep override objects on disjoint top-level keys to avoid RFC 7396 array-replacement collisions.

### Self-hosted-runner cleanup discipline
**Source:** documented in `deploy-remote-backend.ps1`'s header comment (lines 34-46, re: no secret material left behind) and RESEARCH.md's Anti-Patterns section citing the `broker.exe`/locked-native-module incident history
**Apply to:** the mirror-push step (`git remote remove customer` after push) and any materialized per-customer secret files in `release.yml`'s fan-out job.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `docs/onboarding-new-customer.md` | documentation | n/a | No prior runbook-style doc exists in this repo's `docs/` (if the directory doesn't yet exist, create it fresh) — write directly from D-09/D-10's decision text, no pattern to copy. |

## Metadata

**Analog search scope:** `.github/workflows/`, `scripts/`, `src-tauri/tauri.conf.json`
**Files scanned:** `release.yml`, `ci.yml` (referenced only via D-18 dependency, not read in full this pass), `generate-build-cert.ps1`, `verify-installer-integrity.ps1`, `deploy-remote-backend.ps1`, `tauri.conf.json`
**Pattern extraction date:** 2026-09-01
**Tracked-source gate:** all analog paths above are ordinary git-tracked files under the repo root — no `.gsd/capabilities/` or other gitignored mirror path was used.
