# Phase 20: Store Deployment: Signed Elevated Installer - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 7 (3 new PowerShell scripts, 1 new cert resource, 1 extended NSIS hook, 1 modified config, 1 gitignore/env addition)
**Analogs found:** 4 / 7 (no prior cert-generation or Supabase-CLI-deploy script exists in this repo — flagged below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/verify-installer-integrity.ps1` | test/utility (build-artifact verification script) | request-response (shell out to `7z`/`Get-AuthenticodeSignature`, assert, exit code) | `scripts/verify-print-broker-install.ps1` | exact (same fail-fast PowerShell verification-script shape, same repo, same phase family) |
| `scripts/generate-build-cert.ps1` | utility (build-time codegen: cert + thumbprint) | transform (native cmdlet in → file + stdout value out) | `scripts/verify-print-broker-install.ps1` (structure only — no cert-gen analog exists) | role-match only — no prior cert-generation script in repo |
| `scripts/deploy-remote-backend.ps1` | utility (deploy/ops script) | batch (sequential CLI invocations against remote Supabase project) | `scripts/backup-db.sh` (closest DB-ops shell script) + `scripts/write-env-local-from-cloud-secret.mjs` (closest "wraps external CLI/secret handling" script) | partial — no prior Supabase-CLI-deploy script exists; nearest are these two ops/secret-handling scripts |
| `windows/hooks.nsh` (extended, not replaced) | config (NSIS install hook) | event-driven (fires once, at elevated post-install) | itself (Phase 19's existing 3-line macro) | exact — this is literally extending the existing file in place |
| `src-tauri/tauri.conf.json` (add `publisher` + `certificateThumbprint`) | config | request-response (build-time JSON merge patch) | itself (existing `bundle.windows.nsis` block) | exact |
| `src-tauri/cert/selfsigned.cer` | config/resource (bundled binary resource) | file-I/O | `src-tauri/tauri.conf.json`'s existing `bundle.resources` entry for `broker/broker.exe` | role-match (same "external file → bundle.resources → shipped inside installer" pattern) |
| `.gitignore` (add `.env.production` / secrets env pattern) | config | n/a | itself (existing `.env`/`.env.local`/`*.key` entries) | exact |

## Pattern Assignments

### `scripts/verify-installer-integrity.ps1` (utility/test, request-response)

**Analog:** `scripts/verify-print-broker-install.ps1` (full file read, 125 lines)

**Header/doc-comment pattern** (lines 1-19):
```powershell
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Verifies a real, elevated Windows deployment of the store print broker
    (Phase 19: Store-Local Durable Printing Service).

.DESCRIPTION
    This is a scripted artifact, not a checkpoint: this repo's CLAUDE.md
    testing policy requires automating verification rather than asking a
    human to click through the app, ...
    Fails fast: exits non-zero with a specific message on the FIRST failing
    check, rather than continuing past a failure and producing a partial
    pass. Exits 0 with "All checks passed" only when all checks hold.
#>
```
Note: `verify-installer-integrity.ps1` does NOT need `#Requires -RunAsAdministrator` — per RESEARCH.md Pattern 4/Pitfall 2, it runs pre-ship on the build machine against the built artifact, not on the elevated target machine. Drop that line; keep the fail-fast doc-comment convention.

**Fail-fast helper + `$ErrorActionPreference` pattern** (lines 37-45):
```powershell
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}
```

**Per-check try/catch + colored OK/Fail pattern** (lines 47-60, repeat this shape per check):
```powershell
try {
    $service = Get-Service -Name 'PrintBrokerService' -ErrorAction Stop
} catch {
    Fail "Get-Service PrintBrokerService failed: $($_.Exception.Message)"
}

if ($service.Status -ne 'Running') {
    Fail "PrintBrokerService Status is '$($service.Status)', expected 'Running'."
}
Write-Host "OK: PrintBrokerService is Running with StartType=Automatic." -ForegroundColor Green
```
Apply this exact per-check shape to each of DEP-02's four checks (7z payload listing, `Get-AuthenticodeSignature` thumbprint match, Zone.Identifier absence, dist bundle grep) — one `try/catch` + `Fail` call + `Write-Host ... -ForegroundColor Green` per check, in the order given in RESEARCH.md's Architecture Diagram.

**Terminal success pattern** (lines 123-124):
```powershell
Write-Host "All checks passed" -ForegroundColor Green
exit 0
```

**Concrete check bodies to adapt** (from RESEARCH.md's own Code Examples section — already PowerShell-shaped, not invented here):
```powershell
$sig = Get-AuthenticodeSignature $installer
if ($sig.SignerCertificate.Thumbprint -ne $expectedThumbprint) { throw "thumbprint mismatch" }

$zone = Get-Item $installer -Stream Zone.Identifier -ErrorAction SilentlyContinue
if ($zone) { throw "installer carries Mark-of-the-Web — SmartScreen will evaluate it" }
```
Convert `throw` to `Fail "..."` to match the analog's convention exactly (the analog never uses bare `throw`).

---

### `scripts/generate-build-cert.ps1` (utility, transform)

**No direct analog exists in this repo** — this is the first cert-generation script. Structural conventions to still borrow from `verify-print-broker-install.ps1`: `[CmdletBinding()]`/`param()` header, `$ErrorActionPreference = 'Stop'`, a `Fail` helper for any cmdlet failure, `Write-Host ... -ForegroundColor Green` on success. Content itself comes straight from RESEARCH.md Pattern 3 (already a complete, ready-to-use snippet, not something to re-derive):
```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Taj House of Spice Supermarket POS" `
  -CertStoreLocation Cert:\LocalMachine\My `
  -NotAfter (Get-Date).AddYears(5) `
  -KeyUsage DigitalSignature `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")  # Code Signing EKU OID
Export-Certificate -Cert $cert -FilePath "src-tauri\cert\selfsigned.cer" | Out-Null
Write-Output $cert.Thumbprint
```
Output-contract note: unlike the analog (which only prints and exits), this script's stdout `Write-Output $cert.Thumbprint` IS the machine-readable contract consumed by the build invocation (`$THUMBPRINT=$(powershell -File scripts/generate-build-cert.ps1)`) — do not intermix `Write-Host` status noise into stdout the way the analog does; route status/progress messages to `Write-Host` (goes to console, not captured) and reserve bare `Write-Output`/pipeline output for the thumbprint only.

---

### `scripts/deploy-remote-backend.ps1` (utility, batch)

**No direct analog** — no prior Supabase-CLI-deploy script exists. Nearest structural cousins:

**Analog 1 — `scripts/backup-db.sh`** (full file, 20 lines) — bash "wrap one external CLI, fail loud on missing precondition" shape:
```bash
#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the target Postgres connection string}"

command -v pg_dump >/dev/null 2>&1 || { echo "scripts/backup-db.sh: pg_dump not found. Install postgresql-client (apt) or the Supabase CLI." >&2; exit 1; }

cd "$(dirname "$0")/.."
```
Same shape applies to `deploy-remote-backend.ps1` if written as bash/PowerShell: precondition-check (`supabase` CLI on PATH, project linked) before the real command runs, explicit required-input guard (project ref / env-file path) rather than silently defaulting.

**Analog 2 — `scripts/write-env-local-from-cloud-secret.mjs`** (full file, 30 lines) — precedent for "read secret material from an env var / file, write it out, print exactly what happened, exit 0 on the empty/no-op case rather than erroring":
```javascript
if (b64 !== undefined && b64 !== '') {
  writeFileSync(target, Buffer.from(b64, 'base64').toString('utf8'));
  process.stdout.write(`write-env-local-from-cloud-secret: wrote ${target} (from BAR_POS_ENV_LOCAL_B64)\n`);
} else ...
```
Apply the same "state exactly what ran, to stdout, prefixed with the script's own name" convention to the deploy script's `functions deploy` / `secrets set` / `functions list` sequence (RESEARCH.md Architecture Diagram lines 169-177), rather than inventing new logging.

**Concrete command sequence** (from RESEARCH.md Pattern 1/2, already CLI-verified, use verbatim):
```bash
supabase secrets set --env-file supabase/.env.secrets.production --project-ref mkvinyekkyennyegfoxq
supabase functions deploy --project-ref mkvinyekkyennyegfoxq
supabase functions list --project-ref mkvinyekkyennyegfoxq   # confirm 12/12
supabase secrets list --project-ref mkvinyekkyennyegfoxq     # confirm 4-5 names, no values
```

---

### `windows/hooks.nsh` (extended in place)

**Analog:** itself — the existing Phase 19 file (full file, 21 lines). Do not create a second `.nsh` file (Tauri v2 `installerHooks` only accepts one file — already discovered in Phase 19, reconfirmed in RESEARCH.md Anti-Patterns).

**Existing macro to extend** (lines 17-21):
```nsis
!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\broker\broker.exe" install'
  ExecWait 'netsh advfirewall firewall add rule name="Store Print Broker" dir=in action=allow program="$INSTDIR\broker\broker.exe" protocol=TCP localport=8973 profile=private remoteip=LocalSubnet'
  ExecWait 'sc.exe start PrintBrokerService'
!macroend
```
**Add exactly one more `ExecWait` line** (per RESEARCH.md Pattern 3), keeping the same `ExecWait '...'` single-quoted style and idempotency comment convention (the file's header comment block, lines 1-16, documents WHY each line is safe to re-run on upgrade — add a matching justification line for the new one: `certutil -f -addstore` with `-f` (force) is inherently idempotent, re-adding an already-present cert is a no-op):
```nsis
  ExecWait 'certutil -f -addstore Root "$INSTDIR\cert\selfsigned.cer"'
```

---

### `src-tauri/tauri.conf.json` (extended)

**Analog:** itself — existing `bundle` block (lines 28-48, full section read).

**Existing resources/nsis pattern to follow for the new cert resource entry** (lines 39-47):
```json
"resources": {
  "../broker/target/release/broker.exe": "broker/broker.exe"
},
"windows": {
  "nsis": {
    "installerHooks": "../windows/hooks.nsh",
    "installMode": "perMachine"
  }
}
```
Add `"../cert/selfsigned.cer": "cert/selfsigned.cer"` as a second key in the same `resources` map (matches `windows/hooks.nsh`'s `$INSTDIR\cert\selfsigned.cer` reference). Add top-level `"publisher"` field inside `bundle` (sibling to `"active"`/`"targets"`) matching the cert's CN string used in `generate-build-cert.ps1` (`"Taj House of Spice Supermarket POS"`) — RESEARCH.md flags a missing `publisher` as a documented silent-signing-failure cause. `certificateThumbprint`/`digestAlgorithm` are NOT static file edits — they're injected per-build via the `--config` JSON-merge-patch CLI flag (RESEARCH.md Pattern 3), so do not hardcode a thumbprint into this file.

---

### `.gitignore` (extended)

**Analog:** itself — existing entries (lines 1-95, full file read).

**Existing pattern for secret-bearing files to follow**:
```
.env
.env.local
...
*.key
*.key.pub
*.pem
```
Add `.env.production` and `supabase/.env.secrets.production` as new literal lines near the existing `.env`/`.env.local` block (RESEARCH.md Pitfall 3 — currently neither matches any existing pattern, both are secret-bearing, and the repo is public). Do not use a broad `.env.*` glob without checking it doesn't also blind-ignore a tracked example file — none is tracked here, but the explicit-literal style matches the rest of this section.

## Shared Patterns

### Fail-fast PowerShell verification-script shape
**Source:** `scripts/verify-print-broker-install.ps1` (whole file)
**Apply to:** `scripts/verify-installer-integrity.ps1`, `scripts/generate-build-cert.ps1`
- `[CmdletBinding()]` + `param()` + `$ErrorActionPreference = 'Stop'` at top
- One `Fail([string]$Message)` helper: `Write-Host "FAILED: $Message" -ForegroundColor Red; exit 1`
- Each check: `try { ... } catch { Fail "..." }`, then an explicit condition check calling `Fail`, then `Write-Host "OK: ..." -ForegroundColor Green`
- Terminal `Write-Host "All checks passed" -ForegroundColor Green; exit 0`

### External-file → `bundle.resources` → shipped-in-installer
**Source:** `src-tauri/tauri.conf.json:39-41` (existing `broker.exe` resource entry)
**Apply to:** `src-tauri/cert/selfsigned.cer`
Same key-value shape: `"<relative-source-path>": "<relative-install-path>"`, then referenced from `windows/hooks.nsh` via `$INSTDIR\<relative-install-path>`.

### Named-CLI-wrapper script conventions (precondition guard + stated-output logging)
**Source:** `scripts/backup-db.sh` (precondition guard: `: "${VAR:?message}"`, `command -v tool || exit 1`) + `scripts/write-env-local-from-cloud-secret.mjs` (stdout line stating exactly what the script did, prefixed with its own filename)
**Apply to:** `scripts/deploy-remote-backend.ps1`

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/generate-build-cert.ps1` (content, not structure) | utility | transform | No prior cert-generation script in this repo; content sourced directly from RESEARCH.md Pattern 3 (CITED Tauri/Windows PKI docs), not an internal analog |
| `scripts/deploy-remote-backend.ps1` (content, not structure) | utility | batch | No prior Supabase-CLI bulk-deploy/secrets script in this repo; command sequence sourced directly from RESEARCH.md Patterns 1-2 (CITED Supabase docs) |

## Metadata

**Analog search scope:** `scripts/`, `windows/`, `src-tauri/tauri.conf.json`, `.gitignore` (repo root)
**Files scanned:** `windows/hooks.nsh`, `scripts/verify-print-broker-install.ps1`, `scripts/verify-lan-broker-reachability.ps1` (listed, not read — same family, lower priority than the two used), `scripts/backup-db.sh`, `scripts/write-env-local-from-cloud-secret.mjs`, `src-tauri/tauri.conf.json`, `.gitignore`
**Pattern extraction date:** 2026-08-28
