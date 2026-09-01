<#
.SYNOPSIS
    Generates a fresh self-signed code-signing certificate for a `npm run tauri build`
    run (Phase 20: Store Deployment: Signed Elevated Installer, DEP-01).

.DESCRIPTION
    Every invocation creates a brand-new cert with its own thumbprint - this is a
    build-time artifact, not a reusable credential. Exports ONLY the public half
    (`Export-Certificate`, never `Export-PfxCertificate`) to `src-tauri/cert/selfsigned.cer`,
    a `bundle.resources` entry that ships inside the NSIS installer and is imported into
    the target machine's Trusted Root store by `windows/hooks.nsh`'s post-install hook.

    The private key never leaves this build machine's `Cert:\CurrentUser\My` store as a
    file - there is nothing here to accidentally commit or bundle.

    Store is `Cert:\CurrentUser\My` - NOT `Cert:\LocalMachine\My` despite that being the more
    "production-sounding" choice. `signtool.exe sign /sha1 <thumbprint>` (what tauri-action /
    tauri-bundler actually invokes, with no `/sm` flag) only searches the CurrentUser store by
    default; a cert placed in LocalMachine\My is invisible to it and fails with "SignTool Error:
    No certificates were found that met all the given criteria" even when the cert is clearly
    present and `HasPrivateKey: True` via `Get-ChildItem Cert:\LocalMachine\My` (confirmed by
    reproducing signtool's exact invocation directly against a real build output, 2026-09-01 -
    LocalMachine\My failed regardless of elevation; CurrentUser\My succeeded immediately, no
    elevation required). CurrentUser\My also has no elevation dependency at all, so this is
    strictly simpler for a self-hosted runner running as a plain (non-admin) service account.

    Output contract: the ONLY thing written via the success-path pipeline/`Write-Output`
    is `$cert.Thumbprint` (a bare string) - this is what
    `$THUMBPRINT = powershell -File scripts/generate-build-cert.ps1` captures for the
    `npm run tauri build -- --config "..."` invocation. All progress/status messages go to
    `Write-Host` (console only, never captured by command substitution).
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

$certDir = Join-Path $PSScriptRoot '..\src-tauri\cert'
$certPath = Join-Path $certDir 'selfsigned.cer'

$certStoreLocation = 'Cert:\CurrentUser\My'
try {
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject 'CN=Taj House of Spice Supermarket POS' `
        -CertStoreLocation $certStoreLocation `
        -NotAfter (Get-Date).AddYears(5) `
        -KeyUsage DigitalSignature `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
} catch {
    Fail "New-SelfSignedCertificate ($certStoreLocation) failed: $($_.Exception.Message)"
}

if (-not $cert -or [string]::IsNullOrWhiteSpace($cert.Thumbprint)) {
    Fail "New-SelfSignedCertificate returned no usable certificate/thumbprint."
}
Write-Host "OK: generated cert CN=$($cert.Subject), store=$certStoreLocation, thumbprint=$($cert.Thumbprint)" -ForegroundColor Green

if (-not (Test-Path -LiteralPath $certDir)) {
    New-Item -ItemType Directory -Force -Path $certDir | Out-Null
}

try {
    Export-Certificate -Cert $cert -FilePath $certPath | Out-Null
} catch {
    Fail "Export-Certificate to '$certPath' failed: $($_.Exception.Message)"
}
Write-Host "OK: exported public certificate to $certPath (private key stays in $certStoreLocation)" -ForegroundColor Green

# Machine-readable contract: ONLY the thumbprint goes to stdout/pipeline.
Write-Output $cert.Thumbprint
