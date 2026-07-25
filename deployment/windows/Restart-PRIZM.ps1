[CmdletBinding()]
param([switch]$Build, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
$op = New-PRIZMOperation 'restart'
try {
    Restart-PRIZMServer -Build:$Build -NoBrowser:$NoBrowser | Out-Null
    Complete-PRIZMOperation $op $true
    exit 0
} catch {
    Complete-PRIZMOperation $op $false $_.Exception.Message
    Write-Host "RESTART FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
