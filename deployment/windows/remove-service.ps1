[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
$service = (Get-PRIZMConfig).service
if (-not (Get-Service -Name $service.name -ErrorAction SilentlyContinue)) {
    Write-Host "Service '$($service.name)' is not installed."
    exit 0
}
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Administrator privileges are required to remove the service.' -ForegroundColor Red
    exit 1
}
if ($PSCmdlet.ShouldProcess($service.displayName, 'Stop and remove Windows service')) {
    & sc.exe stop $service.name 2>$null
    & sc.exe delete $service.name
    exit $LASTEXITCODE
}
