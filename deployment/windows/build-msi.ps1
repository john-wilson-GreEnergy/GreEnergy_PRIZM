[CmdletBinding()]
param([switch]$SkipPackage)
$ErrorActionPreference = 'Stop'
$windows = $PSScriptRoot
$installer = Join-Path $windows 'installer'
$versions = Get-Content (Join-Path $installer 'versions.json') -Raw | ConvertFrom-Json
if (-not $SkipPackage) { & (Join-Path $windows 'package-windows.ps1'); if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
if (-not (Get-Command wix.exe -ErrorAction SilentlyContinue)) {
    throw 'WiX v5 is required. Install on the packaging workstation with: dotnet tool install --global wix'
}
& wix.exe extension add WixToolset.Util.wixext/5.0.2 2>$null
& wix.exe extension add WixToolset.UI.wixext/5.0.2 2>$null
$outDir = Join-Path $windows 'artifacts\release'
New-Item $outDir -ItemType Directory -Force | Out-Null
$payload = (Resolve-Path (Join-Path $windows 'artifacts\payload')).Path
$output = Join-Path $outDir 'GreEnergy_PRIZM_Setup.msi'
& wix.exe build (Join-Path $installer 'Product.wxs') -arch x64 -ext WixToolset.Util.wixext -ext WixToolset.UI.wixext -d "PayloadDir=$payload" -d "ProductVersion=$($versions.productVersion)" -d "LicenseRtf=$(Join-Path $installer 'License.rtf')" -o $output
if ($LASTEXITCODE -ne 0) { throw 'WiX MSI build failed.' }
Write-Host "MSI created: $output" -ForegroundColor Green
