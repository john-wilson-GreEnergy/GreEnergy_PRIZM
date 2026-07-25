[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ServiceUtilities.psm1') -Force
Show-PRIZMBanner
$op = New-PRIZMOperation 'update'
$wasRunning = $false
$backupPath = ''
try {
    Assert-PRIZMCommand git; Assert-PRIZMCommand node; Assert-PRIZMCommand npm
    $root = Get-PRIZMRoot
    $wasRunning = [bool](Get-PRIZMProcess)
    if ($wasRunning) { Stop-PRIZMServer }
    $distPath = Join-Path $root 'dist'
    if (Test-Path $distPath) {
        $backupPath = Join-Path $PSScriptRoot "Backups\dist-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
        Copy-Item $distPath $backupPath -Recurse -Force
        Write-PRIZMLog "Saved the previous production build to $backupPath" 'INFO' $op.Path
    }
    Push-Location $root
    try {
        $beforeLock = if (Test-Path 'package-lock.json') { (Get-FileHash 'package-lock.json').Hash } else { '' }
        Invoke-PRIZMLoggedCommand 'git.exe' @('pull','--ff-only') $op.Path
        $afterLock = if (Test-Path 'package-lock.json') { (Get-FileHash 'package-lock.json').Hash } else { '' }
        if (-not (Test-Path 'node_modules') -or $beforeLock -ne $afterLock) {
            Write-PRIZMLog 'Dependencies changed or are missing; running npm install.' 'INFO' $op.Path
            Invoke-PRIZMLoggedCommand 'npm.cmd' @('install') $op.Path
        } else {
            Write-PRIZMLog 'package-lock.json is unchanged; npm install is not required.' 'INFO' $op.Path
        }
    } finally { Pop-Location }
    Build-PRIZM $op.Path
    Start-PRIZMServer -NoBrowser:$NoBrowser -SkipBuild | Out-Null
    $v = Get-PRIZMVersion
    Write-PRIZMLog "Update complete: $($v.Branch) $($v.Commit), package $($v.PackageVersion), build $($v.BuildTimestamp)" 'INFO' $op.Path
    Complete-PRIZMOperation $op $true
    exit 0
} catch {
    Complete-PRIZMOperation $op $false $_.Exception.Message
    Write-Host "UPDATE FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($backupPath -and (Test-Path $backupPath)) {
        try {
            $distPath = Join-Path (Get-PRIZMRoot) 'dist'
            if (Test-Path $distPath) { Remove-Item $distPath -Recurse -Force }
            Copy-Item $backupPath $distPath -Recurse -Force
            Write-Host 'The previous production build was restored.' -ForegroundColor Yellow
            if ($wasRunning) {
                Start-PRIZMServer -NoBrowser -SkipBuild | Out-Null
                Write-Host 'PRIZM recovered using the previous production build.' -ForegroundColor Yellow
            }
        } catch { Write-Host "Automatic recovery failed: $($_.Exception.Message)" -ForegroundColor Red }
    }
    Write-Host 'Review deployment\windows\Logs before retrying.' -ForegroundColor Yellow
    exit 1
}
