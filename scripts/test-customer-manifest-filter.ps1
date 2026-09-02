<#
.SYNOPSIS
    Self-check for scripts/lib/customer-manifest.ps1's Get-ActiveCustomers filter
    (Phase 26 Plan 02: Multi-Customer Deployment tracer, D-03/D-04).

.DESCRIPTION
    Builds a temp fixture customers.json with one active entry and one suspended
    entry, dot-sources scripts/lib/customer-manifest.ps1, and asserts
    Get-ActiveCustomers returns exactly the active entry.

    Fails fast (non-zero exit) with a specific message on any mismatch, including
    the case where customer-manifest.ps1 doesn't exist yet (RED phase of this
    task's TDD cycle) - dot-sourcing a missing file throws, which this script lets
    propagate rather than swallowing, since "function not found" IS the expected
    RED-phase failure mode.

    Exits 0 with an "OK:" line (this repo's Fail()/OK() convention, matching
    generate-build-cert.ps1/verify-installer-integrity.ps1) only when the filter
    behaves correctly.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

$libPath = Join-Path $PSScriptRoot 'lib/customer-manifest.ps1'
if (-not (Test-Path -LiteralPath $libPath)) {
    Fail "scripts/lib/customer-manifest.ps1 does not exist (expected RED-phase failure if customer-manifest.ps1 hasn't been created yet)."
}

. $libPath

if (-not (Get-Command Get-ActiveCustomers -ErrorAction SilentlyContinue)) {
    Fail "Get-ActiveCustomers function not found after dot-sourcing '$libPath'."
}

$fixture = @(
    @{ name = 'active-fixture'; status = 'active' },
    @{ name = 'suspended-fixture'; status = 'suspended' }
)
$fixturePath = Join-Path ([System.IO.Path]::GetTempPath()) "customer-manifest-fixture-$([guid]::NewGuid()).json"

try {
    $fixture | ConvertTo-Json -AsArray | Set-Content -Path $fixturePath -Encoding utf8

    $result = @(Get-ActiveCustomers -ManifestPath $fixturePath)

    if ($result.Count -ne 1) {
        Fail "expected exactly 1 active customer, got $($result.Count)."
    }
    if ($result[0].name -ne 'active-fixture') {
        Fail "expected the single active customer's name to be 'active-fixture', got '$($result[0].name)'."
    }

    Write-Host "OK: Get-ActiveCustomers returned exactly 1 active customer ('active-fixture'), suspended-fixture correctly excluded." -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $fixturePath -Force -ErrorAction SilentlyContinue
}
