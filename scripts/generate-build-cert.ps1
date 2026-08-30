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

    The private key never leaves this build machine's `Cert:\LocalMachine\My` store as a
    file - there is nothing here to accidentally commit or bundle.

    Primary store is `Cert:\LocalMachine\My` (matches this repo's RESEARCH.md/PATTERNS.md
    and the target production build machine, which runs elevated). If `New-SelfSignedCertificate`
    against `Cert:\LocalMachine\My` fails specifically on an access-denied/elevation error (a
    non-admin PowerShell session), this script falls back to `Cert:\CurrentUser\My` and prints a
    loud warning - `signtool.exe` can sign from either store, but a production build machine
    should run elevated so the primary (`LocalMachine`) path is used, since that is what
    `store-deployment-installer-decisions.md` and this phase's RESEARCH.md assume.

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

$certStoreLocation = 'Cert:\LocalMachine\My'
try {
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject 'CN=Taj House of Spice Supermarket POS' `
        -CertStoreLocation $certStoreLocation `
        -NotAfter (Get-Date).AddYears(5) `
        -KeyUsage DigitalSignature `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
} catch {
    if ($_.Exception.Message -match 'Access denied|0x80090010|NTE_PERM') {
        Write-Host "WARNING: Cert:\LocalMachine\My denied access (not running elevated) - falling back to Cert:\CurrentUser\My. Production builds should run elevated so the primary LocalMachine store is used." -ForegroundColor Yellow
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
    } else {
        Fail "New-SelfSignedCertificate ($certStoreLocation) failed: $($_.Exception.Message)"
    }
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
