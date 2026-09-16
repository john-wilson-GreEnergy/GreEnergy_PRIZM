[CmdletBinding()]
param([switch]$SkipApplicationBuild, [switch]$SkipManagerBuild)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$windows = $PSScriptRoot
$root = (Resolve-Path (Join-Path $windows '..\..')).Path
$installer = Join-Path $windows 'installer'
$artifacts = Join-Path $windows 'artifacts'
$payload = Join-Path $artifacts 'payload'
$downloads = Join-Path $artifacts 'downloads'
$versions = Get-Content (Join-Path $installer 'versions.json') -Raw | ConvertFrom-Json

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name is required on the packaging workstation." }
}
function Get-VerifiedDownload([string]$Uri, [string]$Path, [string]$Sha256) {
    if (-not (Test-Path $Path)) { Invoke-WebRequest $Uri -OutFile $Path -UseBasicParsing }
    $actual = (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Sha256.ToLowerInvariant()) { throw "Checksum mismatch for $Path. Expected $Sha256, received $actual." }
}

Assert-Command node
Assert-Command npm
Assert-Command cargo
New-Item $downloads -ItemType Directory -Force | Out-Null
if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }
New-Item (Join-Path $payload 'app'),(Join-Path $payload 'runtime'),(Join-Path $payload 'service'),(Join-Path $payload 'manager'),(Join-Path $payload 'defaults') -ItemType Directory -Force | Out-Null

if (-not $SkipApplicationBuild) {
    Push-Location $root
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'PRIZM production build failed.' } }
    finally { Pop-Location }
}
if (-not (Test-Path (Join-Path $root 'dist\server.cjs'))) { throw 'dist\server.cjs is missing.' }

$nodeArchive = Join-Path $downloads $versions.node.archive
$nodeUri = "https://nodejs.org/dist/v$($versions.node.version)/$($versions.node.archive)"
Get-VerifiedDownload $nodeUri $nodeArchive $versions.node.sha256
$nodeExtract = Join-Path $artifacts 'node-extract'
if (Test-Path $nodeExtract) { Remove-Item $nodeExtract -Recurse -Force }
Expand-Archive $nodeArchive $nodeExtract
$nodeSource = Get-ChildItem $nodeExtract -Directory | Select-Object -First 1
Copy-Item (Join-Path $nodeSource.FullName 'node.exe') (Join-Path $payload 'runtime\node.exe')

$winswPath = Join-Path $downloads $versions.winsw.asset
$winswUri = "https://github.com/winsw/winsw/releases/download/v$($versions.winsw.version)/$($versions.winsw.asset)"
Get-VerifiedDownload $winswUri $winswPath $versions.winsw.sha256
Copy-Item $winswPath (Join-Path $payload 'service\GreEnergy.PRIZM.Service.exe')
Copy-Item (Join-Path $installer 'GreEnergy.PRIZM.Service.xml') (Join-Path $payload 'service\GreEnergy.PRIZM.Service.xml')
Copy-Item (Join-Path $installer 'default-settings.json') (Join-Path $payload 'defaults\settings.json')

Copy-Item (Join-Path $root 'dist') (Join-Path $payload 'app\dist') -Recurse
Copy-Item (Join-Path $root 'start-production.cjs'),(Join-Path $root 'package.json'),(Join-Path $root 'package-lock.json') (Join-Path $payload 'app')
Copy-Item (Join-Path $installer 'service-launch.cjs') (Join-Path $payload 'app\service-launch.cjs')
$package = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$branch = (& git -C $root branch --show-current 2>$null)
$commit = (& git -C $root rev-parse --short HEAD 2>$null)
@{
    version = "$($package.version)"
    build = (Get-Date).ToUniversalTime().ToString('o')
    branch = if ($branch) { "$branch".Trim() } else { 'release' }
    commit = if ($commit) { "$commit".Trim() } else { 'unknown' }
} | ConvertTo-Json | Set-Content (Join-Path $payload 'app\build-info.json')
Push-Location (Join-Path $payload 'app')
try { & npm.cmd ci --omit=dev --ignore-scripts; if ($LASTEXITCODE -ne 0) { throw 'Production dependency staging failed.' } }
finally { Pop-Location }

if (-not $SkipManagerBuild) {
    Push-Location (Join-Path $windows 'manager')
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Manager dependency installation failed.' }
        & npm.cmd run tauri build -- --no-bundle
        if ($LASTEXITCODE -ne 0) { throw 'Tauri manager build failed.' }
    } finally { Pop-Location }
}
$managerExe = Join-Path $windows 'manager\src-tauri\target\release\greenergy-prizm-manager.exe'
if (-not (Test-Path $managerExe)) { throw "Manager executable is missing: $managerExe" }
Copy-Item $managerExe (Join-Path $payload 'manager\GreEnergy PRIZM Manager.exe')
Write-Host "Windows payload prepared at $payload" -ForegroundColor Green
