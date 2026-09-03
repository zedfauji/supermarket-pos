<#
.SYNOPSIS
    Idempotent onboarding plumbing for a new customer (Phase 26: Multi-Customer
    Deployment, D-09).

.DESCRIPTION
    Handles every D-09 step that CAN be automated: customer repo creation, GitHub
    Environment + PAT-secret setup (both on the CORE repo, since release.yml's
    mirror-push runs there per D-01/D-02), tauri.override.json + icon template
    scaffolding, and a customers.json manifest entry upsert. Stops there per D-11 -
    this script never triggers a release and never marks a customer "active"; the
    first sync happens naturally on the next tagged release once an operator
    completes the manual D-10 steps (see docs/onboarding-new-customer.md) and
    flips the manifest entry themselves.

    Idempotent per D-12: every step checks current state first and skips/updates
    rather than failing or duplicating, so a partially-failed run is always safe
    to re-run. Steps 1-2 (repo, Environment) are skip-if-exists. Step 3 (PAT
    secret) always overwrites, since a rotated PAT should always win.

    -CustomerMirrorPat is a SecureString, never a plain string: an already-minted
    PAT value must never land in shell history or a process listing. It is
    decoded to plaintext only in-memory, piped to `gh secret set` via stdin
    (never a -b/--body command-line token), and the local plaintext variable is
    nulled out immediately after use.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$CustomerName,

    [Parameter(Mandatory)]
    [string]$SupabaseProjectRef,

    [Parameter(Mandatory)]
    [System.Security.SecureString]$CustomerMirrorPat
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

# --- Validate $CustomerName up front - it is interpolated into gh/git commands -
# Same allow-list this phase's Plan 26-02 Task 3 applies inside release.yml
# (T-26-03) - applied here too, since this script constructs gh/git commands
# from the same untrusted-until-validated string.
if ($CustomerName -notmatch '^[a-z0-9-]+$') {
    Fail "CustomerName '$CustomerName' does not match required pattern ^[a-z0-9-]+`$ (lowercase letters, digits, hyphens only)."
}

$repoName = "supermarket-pos-$CustomerName"
$fullRepo = "zedfauji/$repoName"

# --- Step 1: idempotent repo creation -------------------------------------------
gh repo view $fullRepo --json name 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: repo $fullRepo already exists, skipping creation." -ForegroundColor Green
} else {
    gh repo create $fullRepo --private
    if ($LASTEXITCODE -ne 0) { Fail "gh repo create failed for $fullRepo." }
    Write-Host "OK: created $fullRepo" -ForegroundColor Green
}

# --- Step 2: idempotent GitHub Environment creation (on the CORE repo) ---------
# release.yml's sync-customers fan-out (Plan 26-02) resolves this Environment's
# secrets from CORE's own workflow run, not from the customer repo.
gh api "repos/zedfauji/supermarket-pos/environments/$CustomerName" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: GitHub Environment '$CustomerName' already exists." -ForegroundColor Green
} else {
    gh api -X PUT "repos/zedfauji/supermarket-pos/environments/$CustomerName" | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create GitHub Environment '$CustomerName'." }
    Write-Host "OK: created GitHub Environment '$CustomerName'." -ForegroundColor Green
}

# --- Step 3: PAT secret set - NOT skip-if-exists, a rotation should always win -
$plainPat = [System.Net.NetworkCredential]::new('', $CustomerMirrorPat).Password
try {
    $plainPat | gh secret set --env $CustomerName CUSTOMER_MIRROR_PAT
    if ($LASTEXITCODE -ne 0) { Fail "gh secret set CUSTOMER_MIRROR_PAT failed for Environment '$CustomerName'." }
} finally {
    $plainPat = $null
}
Write-Host "OK: set CUSTOMER_MIRROR_PAT secret on Environment '$CustomerName'." -ForegroundColor Green
