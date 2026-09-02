<#
.SYNOPSIS
    Shared active-customer manifest filter (Phase 26: Multi-Customer Deployment,
    D-03/D-04) - dot-sourced by both release.yml's read-manifest job and
    scripts/test-customer-manifest-filter.ps1's self-check.

.DESCRIPTION
    A customer marked status: active receives a mirror-push/build on the next
    release; status: suspended is skipped entirely, with no build/release code
    changes needed to flip that gate (D-03).
#>

function Get-ActiveCustomers {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ManifestPath
    )

    $customers = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    return @($customers | Where-Object { $_.status -eq 'active' })
}
