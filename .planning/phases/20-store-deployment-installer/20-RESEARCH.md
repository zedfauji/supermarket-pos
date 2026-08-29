# Phase 20: Store Deployment: Signed Elevated Installer - Research

**Researched:** 2026-08-28
**Domain:** Windows NSIS installer code-signing/elevation (Tauri 2), Supabase CLI edge-function/secrets bulk deployment
**Confidence:** MEDIUM (backend deploy commands HIGH/CITED; SmartScreen/MOTW mechanics MEDIUM/CITED cross-corroborated; cert+NSIS composition MEDIUM — synthesized from CITED primitives, not a single canonical guide)

<user_constraints>
## User Constraints (from prior session, no CONTEXT.md exists for this phase)

**Gap note:** `/gsd-discuss-phase` was never run for Phase 20 — there is no `20-CONTEXT.md`. The closest
equivalent is `.planning/notes/store-deployment-installer-decisions.md`, a prior `/gsd-explore` session's
locked-decisions record (2026-08-27). Treat the items below as already-decided; the planner should still
confirm with the user whether a proper discuss-phase pass is wanted before planning, since none of these
decisions have been through that lens.

### Locked Decisions (from store-deployment-installer-decisions.md)

- **Code signing:** self-signed certificate, generated at build time, imported into the store PC's
  Trusted Root store during the (now-elevated) installer run. Free, no CA verification wait. Only
  works cleanly because this targets one machine the owner controls — do not reuse this approach for
  a multi-customer/public distribution without a real CA cert.
- **Elevation:** the installer must run fully elevated (`requestedExecutionLevel=requireAdministrator`
  via NSIS `installMode: perMachine`), not just the individual post-install steps. The broker Windows
  Service registration, the firewall rule, and the cert Trusted-Root import all require admin — a
  non-elevated installer silently fails those steps. `installMode: perMachine` was set in
  `src-tauri/tauri.conf.json` in the prior session — **verified present this session**, see Architecture
  Patterns.
- **Updater endpoint:** fixed to `github.com/zedfauji/supermarket-pos/releases/latest/download/latest.json`
  — **verified present this session** in `tauri.conf.json`.
- **GitHub repo:** `zedfauji/supermarket-pos` created and pushed as **public**. This is load-bearing for
  the SmartScreen research finding below — see Common Pitfalls, Pitfall 1.

### Remote Supabase bootstrap (done prior session, verify-not-redo)

- Remote project `taj-house-of-spice-supermarket-pos-backend` (`mkvinyekkyennyegfoxq`, us-west-2) has all
  180 local migrations applied via `supabase db push`.
- Remote DB has **zero edge functions deployed** and **zero secrets set** — confirmed still the largest
  gap; this is DEP-03/DEP-04's entire scope.
- `.env.production` was reportedly created git-ignored in the prior session — **this session found it does
  NOT currently exist on disk**, and separately, `.gitignore` does **not** actually cover `.env.production`
  (only literal `.env` and `.env.local`, plus `*.local`). See Common Pitfalls, Pitfall 3 — this is a new
  finding the planner must account for, not a re-litigation of the locked decision to have such a file.
- Real admin profile seeded (`Vinty Owner`, `must_change_pin: true`). DB password was pasted into the
  prior chat session — rotation is an open follow-up, unrelated to this phase's code/config work.

### Claude's Discretion

Not explicitly delegated (no CONTEXT.md), but the phase description leaves these open: exact PowerShell
cert-generation parameters, exact NSIS hook composition order, exact integrity-check script shape, and
which of the two config-delivery paths (Tauri-runtime `.env`-beside-exe vs. Vite-build-time-baked
`import.meta.env`) to rely on for shipping the remote Supabase URL. Research recommends the simpler
existing path — see Architecture Patterns, Pattern 2.

### Deferred Ideas (OUT OF SCOPE)

None recorded for this phase; the decisions notes explicitly scope this to a single-machine, self-signed,
non-CA approach and say so should not generalize to multi-customer distribution.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEP-01 | Single-UAC-prompt elevated NSIS installer, code-signed with build-time self-signed cert, auto-trusted during install, no SmartScreen warning | Architecture Patterns 1-3 (cert generation + NSIS hook composition + `certificateThumbprint` config); Common Pitfalls 1 (SmartScreen/MOTW mechanics — the actual mechanism that determines whether DEP-01 is achievable at all) |
| DEP-02 | Installer integrity-check script verifying broker.exe, cert, baked remote `VITE_SUPABASE_URL`, and NSIS printer-broker hooks are present in the built artifact | Architecture Patterns 4 (7-Zip NSIS payload inspection); Code Examples (Authenticode signer-thumbprint check, dist-bundle URL grep, Zone.Identifier absence check) |
| DEP-03 | All 12 named Supabase Edge Functions deployed to the remote project | Architecture Patterns 5 (bulk `supabase functions deploy`); Standard Stack (Supabase CLI); verified 12/12 function directories exist locally, matching the requirement's list exactly |
| DEP-04 | All edge-function secrets (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, `BAR_NAME`/`BAR_ADDRESS`) set via `supabase secrets set` | Architecture Patterns 5 (`--env-file` bulk secrets); verified exact `Deno.env.get(...)` call sites for every secret name |
</phase_requirements>

## Summary

This phase has two genuinely separate halves that share almost no code: a **Supabase backend
completeness** half (DEP-03/04 — deploy 12 already-written edge functions and set 4-5 secrets on a
project that currently has zero of either) and a **Windows installer packaging** half (DEP-01/02 — compose
a self-signed-cert-and-Trusted-Root-import step into the NSIS hook Phase 19 already built, plus a
build-artifact integrity checker). Neither half requires new application code; both are deploy
scripts/config/PowerShell.

The backend half is low-risk and well-documented: `supabase functions deploy` (no function name) deploys
all functions in one shot since CLI v1.62+, and `supabase secrets set --env-file <path>` bulk-sets secrets
from a `.env`-format file, both CITED from official Supabase docs. `verify_jwt` defaults to `true` for any
function not explicitly listed in `config.toml` (only `process-payment` and `send-receipt-email` have
explicit — and redundant — `verify_jwt = true` entries there), consistent with this app's Bearer-authenticated
call pattern.

The installer half is where the real research risk lives. The single most important finding this session
is **not** about NSIS syntax — it's that **the self-signed-cert-and-Trusted-Root-import approach, by itself,
does not guarantee "no SmartScreen warning."** Windows SmartScreen's app-execution reputation check is
gated on the Mark-of-the-Web (MOTW) marker Windows applies to files that cross an internet-zone boundary
(browser download, and more broadly any WinINet/BITS-based transfer) — a locally-built or LAN/USB-transferred
file never gets tagged and is never evaluated by SmartScreen's app-reputation service at all, regardless of
signing status. Conversely, a self-signed cert can *never* earn Microsoft's cloud reputation, so if the
installer **is** downloaded through a browser (which is exactly what this repo's existing
`.github/workflows/release.yml` produces — a public GitHub Release, browser-downloadable), SmartScreen
**will** fire despite everything else in DEP-01 being done correctly. This is a direct conflict between the
existing CI/release pipeline and DEP-01's literal wording that the planner must resolve explicitly (see
Common Pitfalls, Pitfall 1, and Open Questions).

Separately, this session found the app has **two independent, non-overlapping config-delivery paths** for
the Supabase URL/anon key — a Tauri-runtime path (`get_runtime_config` reads a `.env` file sitting beside
the installed `.exe`, currently never bundled by anything) and a Vite-build-time path
(`import.meta.env.VITE_SUPABASE_URL`, baked into the JS bundle from whichever `.env*` file was active during
`npm run build`). Only the second path is actually wired to ship anything today, and it currently would bake
in `.env.local`'s `127.0.0.1:54321` because `.env.production` does not exist on disk. DEP-02's "baked URL"
integrity check must grep the built JS bundle (or the installed frontend's `dist/assets/*.js`), not a
`.env` file — see Architecture Patterns, Pattern 2 and Common Pitfalls, Pitfall 3.

**Primary recommendation:** Do not build a second config-delivery mechanism. Fix the one that's already
wired (create `.env.production` with the remote URL/anon key before every `npm run tauri build`, and add
`.env.production` to `.gitignore`), extend the existing single `windows/hooks.nsh` macro with one more
`ExecWait 'certutil -f -addstore Root "$INSTDIR\cert\selfsigned.cer"'` line composing with Phase 19's three
existing lines, generate the cert via a pre-build PowerShell script that also writes its thumbprint into
the `tauri build --config` JSON-merge-patch flag, and treat "the installer must not have Mark-of-the-Web"
as a build/delivery-process requirement, not something signing itself can achieve.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Edge function deployment (DEP-03) | API/Backend (Supabase Cloud) | — | `supabase functions deploy` is a control-plane operation against the remote project; no app-tier code involved |
| Secret provisioning (DEP-04) | API/Backend (Supabase Cloud) | — | `supabase secrets set` stores secrets server-side, consumed only by `Deno.env.get()` inside edge functions |
| Installer elevation/signing/cert-import (DEP-01) | Build tooling / OS install-time (NSIS + Windows Cert Store + SCM) | — | Happens entirely outside the app process, during `npm run tauri build` (signing) and the NSIS installer run (elevation, cert import, service registration) |
| Config-delivery of remote Supabase URL (supports DEP-02) | Frontend build (Vite, `import.meta.env`) | Desktop shell (Tauri `get_runtime_config`, currently unused in production) | The Vite-baked path is the one actually wired; the Tauri-runtime `.env`-beside-exe path exists in code but nothing packages a `.env` file for it today |
| Installer integrity verification (DEP-02) | Build tooling (new PowerShell/Node script, CI-adjacent) | — | Runs post-build, pre-ship; inspects build artifacts, not runtime app state |

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|---------------|
| Supabase CLI | 2.91.1 installed [VERIFIED: `npx supabase --version` this session], 2.116.0 latest available (CLI self-reported) | Deploy edge functions, set/list secrets on remote project | Official tool for exactly this task; already a `package.json` devDependency (`"supabase": "^2.91.1"`) [VERIFIED: package.json:81] |
| `@tauri-apps/cli` | `^2` [VERIFIED: package.json:98] | `npm run tauri build` — produces the signed NSIS installer | Already the project's build tool; no alternative needed |
| Windows SDK `signtool.exe` | 10.0.26100.0 confirmed present at `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe` [VERIFIED: `Test-Path` this session] | Tauri's bundler auto-detects and shells out to this for Authenticode signing | Tauri does not vendor signtool — it scans `%ProgramFiles(x86)%\Windows Kits\10\bin\` for it [CITED: DeepWiki tauri-apps/tauri bundler docs] |
| 7-Zip (`7z.exe`) | present via scoop shim on this dev machine [VERIFIED: `Get-Command 7z.exe` this session] | List/extract NSIS installer payload contents for the integrity-check script | NSIS installers are 7z-openable archives — `7z l`/`7z x` work without a dedicated NSIS extractor for uncompressed/lightly-compressed payloads [CITED: NSIS forums, multiple corroborating community threads] |
| PowerShell | 5.1.26100.9168 (Windows PowerShell, not pwsh 7) [VERIFIED: `$PSVersionTable.PSVersion` this session] | Cert generation (`New-SelfSignedCertificate`), Authenticode inspection (`Get-AuthenticodeSignature`), post-install verification (extends Phase 19's `scripts/verify-print-broker-install.ps1` pattern) | Built into Windows; `New-SelfSignedCertificate`/`Get-AuthenticodeSignature`/`Import-Certificate` are all native cmdlets, no extra install |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `certutil.exe` | Import a `.cer` file into `Cert:\LocalMachine\Root` from inside an NSIS `ExecWait` line | Preferred over `Import-Certificate` (PowerShell cmdlet) inside NSIS because it's a plain console EXE — matches the existing `hooks.nsh` pattern of `netsh`/`sc.exe` one-liners, no PowerShell-hosting overhead inside the installer |
| `Get-Item -Stream Zone.Identifier` | Detect whether a file carries Mark-of-the-Web | Add to the integrity-check script as a proxy for "will SmartScreen evaluate this file at all" |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `certutil -addstore Root` inside NSIS | `Import-Certificate` PowerShell cmdlet shelled via `nsExec::Exec 'powershell -Command ...'` | Extra PowerShell process spin-up per install for no functional benefit; `certutil` is simpler and already the documented pattern for this exact task |
| Self-signed cert (locked decision) | Real CA / EV code-signing cert (Sectigo, DigiCert, Azure Trusted Signing) | Would actually build SmartScreen reputation over time and work regardless of delivery mechanism — explicitly rejected by the locked decision as unnecessary cost/wait for a single-store deployment |
| 7z-based NSIS payload inspection | `makensis`-based custom extraction, or a dedicated NSIS unpacker (7zip-nsis plugin, universal-extractor) | 7z's built-in NSIS support is sufficient for listing/extracting an uncompressed-resources payload; a dedicated tool adds a new dependency for no clear benefit here |

**Installation:** No new npm/cargo packages are introduced by this phase — all tools above are either
already project dependencies (Supabase CLI, Tauri CLI) or built into Windows (PowerShell, certutil,
signtool via Windows SDK) or already present as an ambient dev-machine tool (7z). No `npm install` step is
required for this phase's own work.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new npm/cargo packages. All tools used (Supabase CLI, Tauri
CLI, PowerShell built-ins, `certutil.exe`, `signtool.exe`, `7z.exe`) are either existing project
dependencies or OS/toolchain-provided binaries, not registry packages requiring a legitimacy check.

## Architecture Patterns

### System Architecture Diagram

```
DEP-03/04 (backend completeness) — one-time, run from a dev/ops machine with supabase CLI linked:

  scripts/deploy-remote-backend.ps1 (new)
    │
    ├─► supabase secrets set --env-file supabase/.env.secrets.production  ──► remote project secrets store
    │     (ANTHROPIC_API_KEY, RESEND_API_KEY, RECEIPT_FROM_EMAIL, BAR_NAME, BAR_ADDRESS)
    │
    ├─► supabase functions deploy  ──► remote project (all 12 functions from supabase/functions/*)
    │     (config.toml [functions.*] verify_jwt settings applied per-function during this deploy)
    │
    └─► supabase functions list / curl smoke-check  ──► verifies 12/12 deployed + reachable

DEP-01/02 (installer packaging) — every `npm run tauri build` run:

  scripts/generate-build-cert.ps1 (new)
    │  New-SelfSignedCertificate → Cert:\LocalMachine\My (build machine)
    │  Export-Certificate (public .cer only) → src-tauri/cert/selfsigned.cer (bundled resource)
    │  prints $thumbprint
    ▼
  npm run tauri build -- --config "{\"bundle\":{\"windows\":{\"certificateThumbprint\":\"$thumbprint\"}}}"
    │
    ├─► beforeBuildCommand: npm run build
    │     (cargo build broker.exe → tsc → vite build, baking import.meta.env.VITE_SUPABASE_URL
    │      from whatever .env.production exists at this moment)
    │
    ├─► Tauri bundler signs app.exe + NSIS installer via signtool.exe + $thumbprint
    │
    └─► NSIS installer produced, containing (as bundle.resources):
          broker/broker.exe          (Phase 19)
          cert/selfsigned.cer        (this phase — new)
        and windows/hooks.nsh's single NSIS_HOOK_POSTINSTALL macro, extended this phase:
          ExecWait '"$INSTDIR\broker\broker.exe" install'            (Phase 19)
          ExecWait 'netsh advfirewall firewall add rule ...'         (Phase 19)
          ExecWait 'sc.exe start PrintBrokerService'                 (Phase 19)
          ExecWait 'certutil -f -addstore Root "$INSTDIR\cert\selfsigned.cer"'   (this phase — new)

  scripts/verify-installer-integrity.ps1 (new, DEP-02)
    │  runs against src-tauri/target/release/bundle/nsis/*.exe BEFORE it ships to the store machine
    ├─► 7z l <installer.exe>  → asserts broker/broker.exe, cert/selfsigned.cer present in payload listing
    ├─► Get-AuthenticodeSignature <installer.exe> → asserts .SignerCertificate.Thumbprint == $expectedThumbprint
    ├─► Get-Item <installer.exe> -Stream Zone.Identifier -ErrorAction SilentlyContinue → asserts $null (no MOTW)
    └─► grep dist/assets/*.js for the remote project ref substring, assert absence of "127.0.0.1"/"localhost"

  Delivery to store machine: build directly on/near the store PC, or transfer the installer via USB/LAN
  share — NOT a browser download of the public GitHub Release — see Common Pitfalls, Pitfall 1.
```

### Recommended Project Structure
```
scripts/
├── deploy-remote-backend.ps1       # DEP-03/04 — bulk functions deploy + secrets set + smoke check
├── generate-build-cert.ps1         # DEP-01 — self-signed cert generation, thumbprint output
├── verify-installer-integrity.ps1  # DEP-02 — post-build artifact integrity check
src-tauri/
├── cert/selfsigned.cer             # new bundle.resources entry (public cert only, never the .pfx/private key)
windows/
└── hooks.nsh                       # extended, not replaced — one more ExecWait line
```

### Pattern 1: Bulk edge-function deploy (DEP-03)
**What:** `supabase functions deploy` with no function name argument deploys every function under
`supabase/functions/` in one invocation.
**When to use:** Any time all functions need to go out together, as here — no per-function deploy loop
needed.
**Example:**
```bash
# Source: https://supabase.com/docs/guides/functions/deploy (CITED)
supabase link --project-ref mkvinyekkyennyegfoxq   # one-time, if not already linked
supabase functions deploy --project-ref mkvinyekkyennyegfoxq
supabase functions list --project-ref mkvinyekkyennyegfoxq   # confirm 12/12
```
Per-function `verify_jwt`/import-map settings are read from `supabase/config.toml`'s `[functions.<name>]`
blocks and applied consistently by the deploy command [CITED: supabase.com/docs/guides/functions/deploy].
This repo's `config.toml` only has explicit (and redundant, since `true` is the default) entries for
`process-payment` and `send-receipt-email` [VERIFIED: supabase/config.toml:372-376,
quoted: `[functions.process-payment]\nverify_jwt = true` and `[functions.send-receipt-email]\nverify_jwt = true`]
— the other 10 functions get the CLI's default `verify_jwt = true`, consistent with every function in this
app being called through an authenticated `supabase.functions.invoke()` client session.

### Pattern 2: Bulk secrets set (DEP-04)
**What:** `supabase secrets set --env-file <path>` reads a `.env`-format file and sets every key as a
secret in one call.
**When to use:** Setting the 4-5 required secrets in one shot instead of 4-5 individual
`supabase secrets set KEY=value` invocations.
**Example:**
```bash
# Source: https://supabase.com/docs/guides/functions/secrets (CITED)
supabase secrets set --env-file supabase/.env.secrets.production --project-ref mkvinyekkyennyegfoxq
supabase secrets list --project-ref mkvinyekkyennyegfoxq   # names only, confirms without exposing values
```
Exact secret names this app's functions read, verified this session by opening every call site
[VERIFIED: `Deno.env.get(...)` grep across supabase/functions, quoted verbatim]:
- `supabase/functions/agent-proxy/index.ts:96`: `const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');`
- `supabase/functions/send-receipt-email/index.ts:70-71`: `const apiKey = Deno.env.get('RESEND_API_KEY'); const fromEmail = Deno.env.get('RECEIPT_FROM_EMAIL');`
- `supabase/functions/settings-test-email/index.ts:27,75`: `Deno.env.get('RESEND_API_KEY')` / `Deno.env.get('RECEIPT_FROM_EMAIL')`
- `supabase/functions/settings-email-status/index.ts:43`: `Deno.env.get('RESEND_API_KEY')`
- `supabase/functions/process-direct-sale/index.ts:203-204`: `Deno.env.get('BAR_NAME') ?? 'Supermarket POS'` / `Deno.env.get('BAR_ADDRESS') ?? ''`
- `supabase/functions/process-payment/index.ts:179-180` and `process-split-payment/index.ts:206-207`:
  `Deno.env.get('BAR_NAME') ?? 'Bar'` / `Deno.env.get('BAR_ADDRESS') ?? ''`

Note the fallback defaults differ per file (`'Supermarket POS'` vs `'Bar'`) — DEP-04 explicitly flags
`BAR_NAME`/`BAR_ADDRESS` as a bar-pos naming leftover; renaming the env var itself is optional per the
requirement wording ("rename or just set correctly") but every one of these 3 call sites must receive the
same real store name/address once set, or the printed/emailed receipt text will silently differ from what
`process-direct-sale` shows depending on which code path a given sale went through.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available inside
every edge function without a manual `secrets set` [CITED: supabase.com/docs/guides/functions/secrets] —
do not attempt to set these.

### Pattern 3: Self-signed cert generation + build-time signing + install-time Trusted-Root import
**What:** Generate a code-signing cert on the build machine, sign the installer with it via Tauri's
`certificateThumbprint` config (dynamically injected per build via `--config` JSON-merge-patch), then have
the SAME NSIS elevated post-install hook import the cert's public half into the target machine's
Trusted Root store — all inside the one already-elevated installer run, no second UAC prompt.
**When to use:** Exactly this phase's DEP-01.
**Example:**
```powershell
# scripts/generate-build-cert.ps1 — run once per build, before `npm run tauri build`
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
```bash
# build invocation — thumbprint is dynamic per generated cert, injected via JSON Merge Patch
# Source: https://v2.tauri.app/reference/config/ (CITED — --config uses RFC 7396 JSON Merge Patch)
THUMBPRINT=$(powershell -File scripts/generate-build-cert.ps1)
npm run tauri build -- --config "{\"bundle\":{\"windows\":{\"certificateThumbprint\":\"$THUMBPRINT\",\"digestAlgorithm\":\"sha256\"}}}"
```
```
; windows/hooks.nsh — extend the ONE existing macro, do not add a second .nsh file
; (Tauri v2 does not support !include for a second local .nsh file — this constraint
;  was already discovered and documented in Phase 19, verified unchanged this session)
!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\broker\broker.exe" install'
  ExecWait 'netsh advfirewall firewall add rule name="Store Print Broker" dir=in action=allow program="$INSTDIR\broker\broker.exe" protocol=TCP localport=8973 profile=private remoteip=LocalSubnet'
  ExecWait 'sc.exe start PrintBrokerService'
  ExecWait 'certutil -f -addstore Root "$INSTDIR\cert\selfsigned.cer"'
!macroend
```
Also required: add a top-level `"publisher"` field to `tauri.conf.json`'s `bundle` block matching the
cert's CN — a missing `publisher` is a documented cause of silent signing failures
[CITED: github.com/tauri-apps/tauri discussions/5739]. `tauri.conf.json` currently has no `publisher` key
[VERIFIED: full file read this session, no `"publisher"` key present in `bundle`].

### Pattern 4: NSIS installer payload inspection for the integrity-check script (DEP-02)
**What:** List and/or extract an NSIS-built installer's bundled resources without running it.
**When to use:** DEP-02's pre-ship check for `broker/broker.exe`, `cert/selfsigned.cer`, and confirming
`windows/hooks.nsh` was actually compiled in.
**Example:**
```powershell
# Source: NSIS forums (CITED, multiple corroborating threads) — 7z opens NSIS installers directly
7z l "src-tauri\target\release\bundle\nsis\Supermarket POS_*.exe" | Select-String "broker.exe|selfsigned.cer"
```
`hooks.nsh`'s macro body is compiled into the installer's NSIS script, not shipped as a separate readable
resource file — so verifying the hook is present is a **source-side** check (does `tauri.conf.json` point
`bundle.windows.nsis.installerHooks` at the current `windows/hooks.nsh`, and does that file still contain
all four expected `ExecWait` lines) rather than something extractable from the compiled installer.

### Pattern 5: Verifying the baked Supabase URL is NOT localhost (DEP-02)
**What:** Grep the actual JS output, not a `.env` file, since `.env` is not what ships the URL in
production — see the dual-config-path finding in Common Pitfalls, Pitfall 3.
**Example:**
```bash
# after `npm run build`, before packaging
grep -rL "127.0.0.1\|localhost" dist/assets/*.js   # every JS chunk must NOT contain these
grep -rl "mkvinyekkyennyegfoxq" dist/assets/*.js    # at least one chunk MUST contain the remote project ref
```

### Anti-Patterns to Avoid
- **A second `.nsh` file / `!include`:** Tauri v2's `installerHooks` mechanism only accepts one file
  containing the full macro body — already discovered and worked around correctly in Phase 19; do not
  reintroduce a split-file approach when adding the cert-import line.
- **Checking `Get-AuthenticodeSignature`'s `.Status` for `'Valid'`:** on the build/CI machine (which has
  not imported the cert into ITS OWN Trusted Root), a self-signed cert's signature status reports
  `NotTrusted` or `UnknownError` even when signing succeeded correctly — assert on
  `.SignerCertificate.Thumbprint` matching the expected value instead, not on trust status.
- **Assuming signing alone silences SmartScreen:** see Common Pitfalls, Pitfall 1 — this is the single
  most consequential misunderstanding this phase could plan around incorrectly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Per-function deploy loop | A bash/PowerShell loop calling `supabase functions deploy <name>` 12 times | Bare `supabase functions deploy` (no name) | Official bulk-deploy behavior since CLI v1.62+ [CITED]; a loop adds nothing and risks a typo silently skipping one function |
| Per-secret `secrets set` calls | 5 individual `supabase secrets set KEY=value` invocations, or a hand-rolled `.env` parser | `supabase secrets set --env-file <path>` | Official bulk-set mechanism reads a standard `.env`-format file directly [CITED] |
| NSIS installer content inspection | A custom binary parser for the NSIS format | `7z l` / `7z x` | NSIS installers are openable by 7-Zip's built-in archive support; writing a parser for a well-known proprietary format that a widely available tool already reads is pure waste |
| Cert-trust verification on the build machine | Trying to make `Get-AuthenticodeSignature` report `Valid` pre-install | Assert `.SignerCertificate.Thumbprint` equality instead | `Valid` status requires the checking machine to already trust the root — an artificial and unnecessary requirement for a pre-ship CI check |
| "Did SmartScreen fire" detection | Any attempt to hook or screen-scrape the SmartScreen dialog | `Get-Item -Stream Zone.Identifier` absence check as a proxy, plus controlling the delivery mechanism | SmartScreen's actual trigger condition (MOTW) is fully inspectable; the dialog itself is a native OS surface with no supported automation hook, matching this repo's one documented manual-verification carve-out for native OS UI |

**Key insight:** Every piece of this phase is composition of existing, well-documented CLI primitives
(`supabase functions deploy`, `supabase secrets set`, `certutil`, `signtool` via Tauri's own config,
`7z`) — there is no scenario here that calls for new custom tooling beyond small orchestration scripts.

## Common Pitfalls

### Pitfall 1: Self-signed cert + Trusted-Root import does not, by itself, prevent SmartScreen — delivery mechanism is what actually matters
**What goes wrong:** The installer is signed correctly, the cert is imported into Trusted Root during
install, and SmartScreen still shows "Windows protected your PC" when the store owner runs it.
**Why it happens:** Windows SmartScreen's app-execution reputation check is gated on the file carrying
Mark-of-the-Web (MOTW) — an alternate data stream (`Zone.Identifier`) applied by any WinINet/BITS-based
transfer, which includes ordinary browser downloads (and PowerShell `Invoke-WebRequest`/`curl.exe` on
Windows). SmartScreen only evaluates MOTW-tagged files; a locally-built file, or one copied via USB or an
intranet-zone LAN share, never gets tagged and is never evaluated by SmartScreen's app-reputation service
at all — regardless of signing. Conversely, a self-signed cert can never earn Microsoft's cloud reputation,
so an MOTW-tagged file signed with a self-signed cert **will** still trigger SmartScreen
[CITED: multiple corroborating sources — Medium MOTW/SmartScreen explainer, Microsoft Q&A threads on
self-signed-cert SmartScreen warnings]. This repo's own `.github/workflows/release.yml`
[VERIFIED: full file read this session] publishes the built installer to a **public** GitHub Release
(`releaseDraft: true`, `includeUpdaterJson: true`) — downloading that release through a browser is exactly
the scenario that applies MOTW.
**How to avoid:** Deliver the installer to the store machine via a path that never applies MOTW: build
`npm run tauri build` directly on (or very near) the store PC, or copy the built `.exe` via USB drive or a
local/intranet-zone network share — not a browser download of the GitHub Release. The GitHub Actions
release pipeline can still exist for the Tauri **updater** flow (a separate mechanism, see Open Questions)
without being the thing that delivers the *initial* install.
**Warning signs:** Testing DEP-01's "no SmartScreen" success criterion using a browser-downloaded copy of
the installer will always fail this check even with a perfectly correct signing pipeline — if that happens,
the bug is in the delivery mechanism, not the signing/cert-import code.

### Pitfall 2: `Get-AuthenticodeSignature` reporting `NotTrusted`/`UnknownError` is not itself a failure
**What goes wrong:** A CI/build-machine integrity check asserts `.Status -eq 'Valid'` and fails every time,
even on a correctly-signed installer.
**Why it happens:** `Valid` requires the *checking* machine to already trust the signing cert's root. A
self-signed cert is, by definition, not in any machine's Trusted Root except the one machine the installer
itself later adds it to — the build/CI machine legitimately never will be.
**How to avoid:** Assert on `.SignerCertificate.Thumbprint` matching the expected generated thumbprint
instead of trust status.
**Warning signs:** Every single build "fails" the integrity check at the exact same signature-status
assertion, with an otherwise-correct pipeline.

### Pitfall 3: The Supabase URL is not shipped by the mechanism the phase description assumes — and `.env.production` isn't gitignored
**What goes wrong:** Two separate mistakes compound: (a) assuming a `.env` file bundled beside the
installed `.exe` is what carries the remote URL into the shipped app, when nothing currently packages such
a file; (b) creating `.env.production` (containing the remote anon key) without confirming it's covered
by `.gitignore` in this specific repo.
**Why it happens:** `src-tauri/src/lib.rs`'s `read_env_config()`
[VERIFIED: src-tauri/src/lib.rs:15-41, quoted: `let env_path = exe_dir.join(".env");` and the `match
key.trim() { "VITE_SUPABASE_URL" => ... "VITE_SUPABASE_ANON_KEY" => ... }` parsing] reads a file literally
named `.env` next to the installed executable, at **runtime** — but nothing in `tauri.conf.json`'s
`bundle.resources` [VERIFIED: tauri.conf.json:39-41, only `"../broker/target/release/broker.exe":
"broker/broker.exe"`] or `windows/hooks.nsh` [VERIFIED: full file read this session, no `.env`-related
line] ships such a file. On a fresh install, `get_runtime_config()` returns an empty `AppConfig`
(`supabase_url: ""`), `AppConfigProvider.tsx`'s `if (cfg.supabaseUrl && cfg.supabaseAnonKey)` guard
[VERIFIED: src/app/AppConfigProvider.tsx:27] skips `initSupabaseClient`, and the app falls through to
`supabase.ts`'s lazy `getClient()`, which reads `import.meta.env.VITE_SUPABASE_URL`
[VERIFIED: src/shared/lib/supabase.ts:50-53] — a value Vite bakes into the JS bundle **at `npm run build`
time** from whichever `.env*` file was active then. Separately: `.gitignore`
[VERIFIED: full file read this session] contains only literal `.env` (line 16), `.env.local` (line 17),
and the pattern `*.local` (line 13) — `.env.production` matches none of these and would be tracked by git
if `git add`-ed, in a **public** repo.
**How to avoid:** Rely on the already-working Vite-bake path — do not build a new `.env`-shipping
mechanism. Create `.env.production` with the remote URL/anon key immediately before every
`npm run tauri build`, and add `.env.production` (or a broader `.env.*` pattern minus the already-tracked
exceptions) to `.gitignore` in the same change.
**Warning signs:** A built installer that connects to `127.0.0.1:54321` despite `.env.production` existing
means the build ran with a stale Vite cache or `.env.production` was created after `npm run build` started;
a `git status` showing `.env.production` as untracked-and-about-to-be-added is the sign to fix `.gitignore`
before staging anything.

### Pitfall 4: `verify_jwt` config only matters if it's set correctly for the one function that might need public access
**What goes wrong:** A function is assumed public (e.g., a webhook or a pre-auth health check) but
`config.toml` has no explicit `verify_jwt = false` entry, so the CLI's default (`true`) silently rejects
unauthenticated calls after deploy.
**Why it happens:** Only `process-payment` and `send-receipt-email` have explicit entries
[VERIFIED: supabase/config.toml:372-376] — both `verify_jwt = true`, i.e. redundant with the default. None
of the other 10 functions (including `get-server-time`, which might reasonably be assumed to need no auth)
have an explicit entry.
**How to avoid:** Before deploying, confirm every function's expected auth mode matches the CLI default; if
any function is genuinely meant to be called without a Supabase session, add an explicit
`[functions.<name>]\nverify_jwt = false` block before `supabase functions deploy`, since config.toml drives
deploy-time behavior [CITED: supabase.com/docs/guides/functions/deploy].
**Warning signs:** A deployed function that worked locally now 401s from the shipped app — check
`config.toml` first before assuming an application-code bug.

## Code Examples

### Confirm all 12 functions exist locally before deploying (sanity gate)
```bash
# Source: this session's own `ls supabase/functions/` — VERIFIED, matches DEP-03's named list exactly
ls supabase/functions/
# _shared  agent-proxy  create-staff  get-server-time  process-direct-sale  process-payment
# process-split-payment  receive-shipment  send-receipt-email  settings-backup
# settings-email-status  settings-restore  settings-test-email
```

### Post-install verification additions (extends Phase 19's `scripts/verify-print-broker-install.ps1` pattern)
```powershell
# New checks this phase should add to an installer-integrity or post-install script:
$installer = "src-tauri\target\release\bundle\nsis\Supermarket POS_1.1.4_x64-setup.exe"

# 1. Cert thumbprint present regardless of local trust status (see Pitfall 2)
$sig = Get-AuthenticodeSignature $installer
if ($sig.SignerCertificate.Thumbprint -ne $expectedThumbprint) { throw "thumbprint mismatch" }

# 2. No Mark-of-the-Web on the artifact about to ship (see Pitfall 1)
$zone = Get-Item $installer -Stream Zone.Identifier -ErrorAction SilentlyContinue
if ($zone) { throw "installer carries Mark-of-the-Web — SmartScreen will evaluate it" }

# 3. Trusted Root import confirmed on a machine that HAS run the installer (post-deploy, not pre-ship)
$root = Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $expectedThumbprint
if (-not $root) { throw "cert not found in Trusted Root after install" }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `supabase functions deploy <name>` looped per function, or `--no-verify-jwt` CLI flag | Bare `supabase functions deploy` deploys all; `verify_jwt` moved into `config.toml` `[functions.<name>]` | CLI v1.62+ [CITED] | Simplifies DEP-03 to one command instead of a 12-line loop |

**Deprecated/outdated:** The `--no-verify-jwt` command-line flag pattern some older tutorials show is
superseded by the `config.toml`-driven per-function setting this repo already uses for 2 of its 12
functions.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `supabase secrets set` merges/upserts rather than wiping previously-set secrets | Pattern 2 / Architecture | If wrong, re-running the bulk secrets script during troubleshooting could unset a secret not present in that run's `.env` file — low risk since DEP-04's own env file should list all 4-5 secrets every time, but worth a one-time confirmation via `supabase secrets list` before/after |
| A2 | `certificateThumbprint` accepts a fresh, un-trusted self-signed cert without additional Tauri-side validation (no built-in check that the cert chains to a known CA) | Pattern 3 | If Tauri's bundler rejects an untrusted chain at sign time, the `--config` JSON-merge-patch approach still works but may need an additional flag to suppress chain validation — verify with one real `npm run tauri build` dry run before finalizing the plan |
| A3 | 7-Zip's NSIS support extracts/lists Tauri-v2-produced NSIS installers specifically (not just NSIS installers in general) without special flags | Pattern 4 | If Tauri's NSIS output uses a compression mode 7z can't read, DEP-02's integrity check needs a fallback (e.g., source-side checks only — verifying `tauri.conf.json`'s resource map and `windows/hooks.nsh` contents, both already fully readable) |
| A4 | The store machine's actual delivery path (build-on-machine vs. USB vs. LAN share) has not been decided by the user — this research recommends one for DEP-01's sake but it is not a locked decision | Common Pitfalls 1, Open Questions | If the user insists on distributing via the existing public GitHub Release download flow, DEP-01's "no SmartScreen" criterion cannot be met by code-signing alone, and the phase needs either a real CA cert or a revised success criterion |

## Open Questions (RESOLVED)

1. **Which delivery mechanism ships the installer to the store machine?** — RESOLVED (2026-08-28, user
   decision via AskUserQuestion during `/gsd-plan-phase 20`): keep the existing public GitHub Release
   download for the initial install. Since MOTW/SmartScreen mechanics mean this conflicts with DEP-01's
   original "no SmartScreen" wording, DEP-01 was relaxed (see REQUIREMENTS.md and ROADMAP.md) to accept
   a one-time "More info → Run anyway" click-through on first launch instead of requiring a real CA cert
   or a local/USB delivery change. No GitHub Actions delivery-mechanism changes are in scope for this
   phase; 20-02-PLAN.md's Task 3 does still wire the same signing mechanism into the release workflow's
   Windows runner so the artifact customers actually download is the signed one.
   - What we know: the existing `.github/workflows/release.yml` produces a public, browser-downloadable
     GitHub Release; MOTW/SmartScreen mechanics mean this conflicts with DEP-01 as literally worded.

2. **Does the Tauri auto-updater's own install flow re-trigger SmartScreen on future updates?** — RESOLVED
   (out of scope): explicitly deferred to a later phase if update-time SmartScreen becomes a real observed
   problem. DEP-01 only covers behavior after first install.
   - What we know: `tauri.conf.json`'s updater config uses a separate minisign keypair
     (`TAURI_SIGNING_PRIVATE_KEY`) for update-package integrity, unrelated to Authenticode/SmartScreen.
   - What's unclear: whether the updater's own downloaded-and-installed artifact (which DOES cross a
     network boundary, from GitHub) picks up MOTW the same way a manual browser download would, and
     whether that matters for UX (updates are typically silent/passive, `installMode: "passive"` per
     `tauri.conf.json` — a passive UI may not surface a SmartScreen dialog the same way a fresh
     double-click launch would, but this is not confirmed this session).

3. **Should `BAR_NAME`/`BAR_ADDRESS` actually be renamed, or just set with real values?** — RESOLVED: set
   the values correctly now (20-01-PLAN.md Task 3); rename deferred as a zero-urgency follow-up, not
   included in this phase's diff.
   - What we know: DEP-04's wording allows either ("rename or just set correctly"); 3 separate call sites
     read these exact names with different fallback defaults.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Supabase CLI | DEP-03, DEP-04 | ✓ | 2.91.1 (2.116.0 available) [VERIFIED this session] | Update recommended but not required — bulk deploy/secrets commands used here are stable since 1.62+ |
| Windows SDK `signtool.exe` | DEP-01 (Tauri bundler signing) | ✓ | 10.0.26100.0, at the documented Windows Kits path [VERIFIED this session] | None needed — present |
| 7-Zip (`7z.exe`) | DEP-02 (integrity check) | ✓ (via scoop, this dev machine) | unspecified, functional | If absent on the actual build/release machine: fall back to source-side checks only (tauri.conf.json resource map + hooks.nsh contents), skip payload-listing verification |
| PowerShell (Windows PowerShell 5.1) | DEP-01, DEP-02 scripts | ✓ | 5.1.26100.9168 [VERIFIED this session] | All cmdlets used (`New-SelfSignedCertificate`, `Get-AuthenticodeSignature`, `Import-Certificate`/`certutil`) are available in 5.1, no pwsh 7 requirement |
| Network access to remote Supabase project | DEP-03, DEP-04 | Not probed this session (no destructive `supabase link`/deploy commands run) | — | N/A — required, no fallback; this is inherent to the task |

**Missing dependencies with no fallback:** None identified — every tool this phase needs is already present
on this dev machine, and the equivalents are either built into Windows or already project dependencies.

**Missing dependencies with fallback:** 7-Zip on whatever machine actually runs the release build, if
different from this dev machine — falls back to source-side integrity checks (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None applicable in the traditional sense — this phase's "tests" are PowerShell/bash verification scripts run against build artifacts and a live remote backend, not Vitest/Playwright |
| Config file | none — see Wave 0 |
| Quick run command | `powershell -File scripts/verify-installer-integrity.ps1` (new, DEP-02) |
| Full suite command | `powershell -File scripts/verify-installer-integrity.ps1` + `powershell -File scripts/verify-print-broker-install.ps1` (Phase 19, extended) run together against a real installed machine |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| DEP-01 (elevation/signing/cert-import post-conditions) | service registered, firewall rule present, cert in Trusted Root, installer's own signature thumbprint correct | script (PowerShell) | `powershell -File scripts/verify-installer-integrity.ps1` | ❌ Wave 0 (new file this phase) |
| DEP-01 (single-UAC-prompt visual confirmation, absence of a SmartScreen dialog during a live run) | native OS UI event | manual, documented carve-out | N/A — matches this repo's CLAUDE.md exception for native Tauri window shell/OS chrome | N/A |
| DEP-02 (integrity-check script itself) | build-artifact contents match expectations | script (PowerShell + 7z) | `powershell -File scripts/verify-installer-integrity.ps1` | ❌ Wave 0 |
| DEP-03 (12/12 functions deployed) | remote reachability | script (bash/PowerShell + curl) | `supabase functions list --project-ref mkvinyekkyennyegfoxq` | ❌ Wave 0 (new deploy script) |
| DEP-04 (secrets set) | remote secret names present | script | `supabase secrets list --project-ref mkvinyekkyennyegfoxq` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** re-run the specific script for the artifact just changed (integrity check after a
  `tauri.conf.json`/`hooks.nsh` change; `functions list`/`secrets list` after a deploy script change).
- **Per wave merge:** run both halves together — a real `npm run tauri build` plus a real
  `supabase functions deploy`/`secrets set` dry-run-equivalent (or against a scratch/staging project if one
  exists, otherwise carefully against the real remote project since it currently has nothing to lose).
- **Phase gate:** `/gsd-verify-work` should require: (a) `verify-installer-integrity.ps1` green, (b)
  `supabase functions list` shows 12/12, (c) `supabase secrets list` shows all 4-5 names, (d) the one
  documented manual/native-OS-UI check (single UAC prompt, no SmartScreen dialog, observed once on a real
  target-like machine) — logged as the carve-out, not as `human_needed`.

### Wave 0 Gaps
- [ ] `scripts/deploy-remote-backend.ps1` (or `.sh`) — DEP-03/DEP-04 bulk deploy + secrets + smoke check
- [ ] `scripts/generate-build-cert.ps1` — DEP-01 cert generation, thumbprint output
- [ ] `scripts/verify-installer-integrity.ps1` — DEP-02 post-build artifact check
- [ ] `supabase/.env.secrets.production` (git-ignored — must be added to `.gitignore` alongside
      `.env.production`, since neither currently matches an existing `.gitignore` pattern)

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` per `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V6 Cryptography (key/secret management) | yes | Secrets set via `supabase secrets set` (server-side, never in client bundle); self-signed cert's private key stays in the build machine's cert store (`Cert:\LocalMachine\My`), never exported/bundled — only the public `.cer` ships in the installer |
| V14 Configuration | yes | `.env.production`/secrets files must be added to `.gitignore` before creation (Pitfall 3) — this repo's GitHub remote is public, so any config-file gitignore gap is a real (if low-severity, RLS-protected) exposure surface |
| V9 Communications (TLS/signing) | yes | Authenticode signing verifies binary integrity to the OS; this is a code-signing concern, not a network-transport one — no new TLS surface introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Anon key / project URL committed to a public repo via an ungitignored `.env.production` | Information Disclosure | Add `.env.production` (and any secrets `.env` files) to `.gitignore` before first creation; anon key alone is low-severity given RLS, but URL+key together ease reconnaissance |
| Self-signed cert private key accidentally bundled into the installer or committed | Spoofing / Elevation of Privilege | `Export-Certificate` (public-only) into `src-tauri/cert/`, never `Export-PfxCertificate`; `.gitignore` already has a `*.key`/`*.pem` pattern [VERIFIED: .gitignore:31-33] — extend if the `.pfx` uses a different extension |
| Store-machine Trusted-Root cert import broadens what that machine will silently trust | Tampering | Documented locked decision already scopes this to a single owner-controlled machine; do not generalize the pattern to any shared/multi-tenant deployment |

## Sources

### Primary (HIGH confidence)
- https://supabase.com/docs/guides/functions/deploy — bulk deploy command, config.toml verify_jwt behavior
- https://supabase.com/docs/guides/functions/secrets — bulk secrets set/list, reserved secret names
- https://v2.tauri.app/reference/config/ — `--config` JSON Merge Patch (RFC 7396) mechanism
- Direct source reads this session: `src-tauri/src/lib.rs`, `src/app/AppConfigProvider.tsx`,
  `src/shared/lib/supabase.ts`, `src-tauri/tauri.conf.json`, `windows/hooks.nsh`, `package.json`,
  `supabase/config.toml`, `.gitignore`, `.github/workflows/release.yml`, all 12 edge function `index.ts`
  secret-read call sites

### Secondary (MEDIUM confidence)
- https://v2.tauri.app/distribute/sign/windows/ — `certificateThumbprint`/`digestAlgorithm`/`timestampUrl`
  bundle config fields
- https://github.com/tauri-apps/tauri/discussions/5739 — self-signed cert generation walkthrough,
  `publisher` field requirement
- MOTW/SmartScreen mechanics — cross-corroborated across a Medium explainer and multiple Microsoft Q&A
  threads (WebSearch, no single canonical page fetched in full — treat the underlying mechanism as MEDIUM,
  not HIGH, confidence pending a direct Microsoft Learn citation if the planner wants to raise it)
- NSIS/7-Zip payload inspection — corroborated across multiple NSIS forum threads (WebSearch)

### Tertiary (LOW confidence)
- None — no uncorroborated single-source claims were included in this document; anything not independently
  verified against a source file this session or CITED against official docs is explicitly flagged
  `[ASSUMED]` in the Assumptions Log above.

## Metadata

**Confidence breakdown:**
- Standard stack (Supabase CLI commands): HIGH — official docs, directly fetched this session
- Architecture (NSIS/cert composition): MEDIUM — synthesized from several CITED primitives (Tauri config
  docs, NSIS discussion threads, general Windows PKI cmdlets); no single canonical "self-signed cert +
  Tauri NSIS Trusted-Root import" guide exists to verify the full composed pipeline end-to-end
- Pitfalls (SmartScreen/MOTW mechanism): MEDIUM — well-corroborated across multiple independent sources
  this session, but not fetched from a single authoritative Microsoft Learn page in full
- Dual config-delivery-path finding (Pitfall 3): HIGH — entirely derived from direct source reads this
  session (`lib.rs`, `AppConfigProvider.tsx`, `supabase.ts`, `tauri.conf.json`), not external research

**Research date:** 2026-08-28
**Valid until:** ~30 days for the Supabase CLI/backend half (stable API surface); ~14 days for the
Tauri/NSIS half if the user changes the delivery-mechanism decision (Open Question 1), since that decision
materially changes what DEP-01 requires
