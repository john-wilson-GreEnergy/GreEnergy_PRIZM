[CmdletBinding()]
param([string]$CertificateThumbprint, [string]$TimestampUrl = 'http://timestamp.digicert.com')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-msi.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$msi = Join-Path $PSScriptRoot 'artifacts\release\GreEnergy_PRIZM_Setup.msi'
if ($CertificateThumbprint) {
    if (-not (Get-Command signtool.exe -ErrorAction SilentlyContinue)) { throw 'signtool.exe was not found.' }
    & signtool.exe sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 /d 'GreEnergy PRIZM' $msi
    if ($LASTEXITCODE -ne 0) { throw 'MSI signing failed.' }
} else {
    Write-Warning 'The MSI is unsigned. Production field releases must be Authenticode signed.'
}
$hash = Get-FileHash $msi -Algorithm SHA256
$hash | Format-List
