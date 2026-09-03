<#
.SYNOPSIS
    Shared customers.json manifest helpers (Phase 26: Multi-Customer Deployment,
    D-03/D-04/D-09/D-12/D-13) - dot-sourced by release.yml's read-manifest job,
    scripts/test-customer-manifest-filter.ps1's self-check, and
    scripts/onboard-customer.ps1's manifest upsert step.

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

function Add-OrUpdateCustomerEntry {
    <#
    .SYNOPSIS
        Idempotent customers.json entry upsert (D-09/D-12/D-13) used by
        onboard-customer.ps1. If an entry with the given name already exists,
        it is left completely unchanged (never clobbers an operator's manual
        edits, e.g. flipping status to "active") and the function returns
        $false. If absent, $Entry is appended and the function returns $true.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ManifestPath,

        [Parameter(Mandatory)]
        [System.Collections.Specialized.OrderedDictionary]$Entry
    )

    $customers = @(Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json)
    $existing = $customers | Where-Object { $_.name -eq $Entry.name }
    if ($existing) {
        return $false
    }

    $updated = $customers + [pscustomobject]$Entry
    ($updated | ConvertTo-Json -Depth 10 -AsArray) | Set-Content -LiteralPath $ManifestPath -Encoding utf8
    return $true
}
