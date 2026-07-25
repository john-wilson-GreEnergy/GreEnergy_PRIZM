[CmdletBinding()]
param([switch]$NoBrowser, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
try {
    Start-PRIZMServer -NoBrowser:$NoBrowser -SkipBuild:$SkipBuild | Out-Null
    exit 0
} catch {
    Write-Host "START FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
