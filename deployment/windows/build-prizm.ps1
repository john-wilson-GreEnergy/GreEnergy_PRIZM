[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
try { Build-PRIZM; Write-Host 'Production build completed.' -ForegroundColor Green; exit 0 } catch { Write-Host "BUILD FAILED: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
