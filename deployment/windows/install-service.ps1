[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param([string]$WrapperExecutable)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
$config = Get-PRIZMConfig
$service = $config.service
if (-not $WrapperExecutable) { $WrapperExecutable = "$($service.futureWrapperExecutable)" }
if (-not $WrapperExecutable -or -not (Test-Path $WrapperExecutable -PathType Leaf)) {
    Write-Host 'SERVICE NOT INSTALLED.' -ForegroundColor Yellow
    Write-Host 'Windows services require a service-aware wrapper executable (future MSI packaging).' 
    Write-Host 'Supply -WrapperExecutable with an approved wrapper that launches PRIZM and handles Service Control Manager events.'
    exit 2
}
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Administrator privileges are required to install the service.' -ForegroundColor Red
    exit 1
}
if (Get-Service -Name $service.name -ErrorAction SilentlyContinue) {
    Write-Host "Service '$($service.name)' already exists." -ForegroundColor Red
    exit 1
}
if ($PSCmdlet.ShouldProcess($service.displayName, 'Install Windows service')) {
    & sc.exe create $service.name "binPath= `"$WrapperExecutable`"" "DisplayName= $($service.displayName)" "start= auto"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & sc.exe description $service.name $service.description
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Service '$($service.displayName)' installed but not started." -ForegroundColor Green
}
