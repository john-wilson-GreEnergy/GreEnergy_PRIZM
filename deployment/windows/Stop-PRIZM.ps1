[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
try { Stop-PRIZMServer; exit 0 } catch { Write-Host "STOP FAILED: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
