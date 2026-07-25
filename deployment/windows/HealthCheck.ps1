[CmdletBinding()]
param([switch]$RequireRunning)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
$op = New-PRIZMOperation 'health'
try {
    $healthy = Invoke-HealthCheck -RequireHttp:$RequireRunning
    if ($healthy) {
        Write-Host 'PRIZM health check passed.' -ForegroundColor Green
        Complete-PRIZMOperation $op $true
        exit 0
    }
    Write-Host 'PRIZM health check failed.' -ForegroundColor Red
    Complete-PRIZMOperation $op $false 'One or more required checks failed.'
    exit 1
} catch {
    Complete-PRIZMOperation $op $false $_.Exception.Message
    Write-Host "HEALTH CHECK FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
