Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PRIZMDeploymentPath { Split-Path -Parent $PSScriptRoot }
function Get-PRIZMRoot {
    $root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    if (-not (Test-Path (Join-Path $root 'package.json') -PathType Leaf)) {
        throw "PRIZM repository root is invalid: package.json was not found at $root"
    }
    return $root
}
function Get-PRIZMConfig {
    $path = Join-Path $PSScriptRoot 'Config\prizm.config.json'
    if (-not (Test-Path $path -PathType Leaf)) { throw "Configuration file not found: $path" }
    return (Get-Content $path -Raw | ConvertFrom-Json)
}
function Get-PRIZMRuntimePath { Join-Path $PSScriptRoot 'Config\prizm.runtime.json' }

function Assert-PRIZMCommand {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is not installed or is not available on PATH."
    }
}

function Get-PRIZMVersion {
    $root = Get-PRIZMRoot
    $package = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
    $branch = (& git -C $root branch --show-current 2>$null)
    $commit = (& git -C $root rev-parse --short HEAD 2>$null)
    $buildFile = Join-Path $root 'dist\server.cjs'
    [pscustomobject]@{
        Branch = if ($branch) { "$branch".Trim() } else { 'unknown' }
        Commit = if ($commit) { "$commit".Trim() } else { 'unknown' }
        PackageVersion = "$($package.version)"
        BuildTimestamp = if (Test-Path $buildFile) { (Get-Item $buildFile).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss zzz') } else { 'not built' }
        NodeVersion = (& node --version 2>$null)
        NpmVersion = (& npm --version 2>$null)
    }
}

function Show-PRIZMBanner {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkGreen
    Write-Host '              GreEnergy PRIZM Platform' -ForegroundColor Green
    Write-Host '        Windows Field Operations Toolkit' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor DarkGreen
    try {
        $v = Get-PRIZMVersion
        Write-Host "Branch: $($v.Branch)  Commit: $($v.Commit)  Package: $($v.PackageVersion)"
        Write-Host "Build:  $($v.BuildTimestamp)"
        Write-Host "Node:   $($v.NodeVersion)  npm: $($v.NpmVersion)"
    } catch { Write-Host "Version information unavailable: $($_.Exception.Message)" -ForegroundColor Yellow }
    Write-Host ''
}

function Rotate-Logs {
    param([int]$Retention = 0)
    $config = Get-PRIZMConfig
    if ($Retention -le 0) { $Retention = [int]$config.logRetention }
    $logDir = Join-Path $PSScriptRoot 'Logs'
    New-Item $logDir -ItemType Directory -Force | Out-Null
    Get-ChildItem $logDir -File -Filter '*.log' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $Retention |
        Remove-Item -Force
}

function New-PRIZMOperation {
    param([Parameter(Mandatory)][string]$Command)
    Rotate-Logs
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $safe = $Command -replace '[^a-zA-Z0-9_-]', '-'
    $path = Join-Path $PSScriptRoot "Logs\$stamp-$safe.log"
    "timestamp=$((Get-Date).ToString('o'))`ncommand=$Command`nstatus=started`nstdout=`nstderr=" | Set-Content $path
    return [pscustomobject]@{ Command = $Command; Path = $path; Stopwatch = [Diagnostics.Stopwatch]::StartNew() }
}

function Complete-PRIZMOperation {
    param([Parameter(Mandatory)]$Operation, [bool]$Success, [string]$ErrorMessage = '')
    $Operation.Stopwatch.Stop()
    Add-Content $Operation.Path "durationMs=$($Operation.Stopwatch.ElapsedMilliseconds)"
    Add-Content $Operation.Path "success=$($Success.ToString().ToLowerInvariant())"
    if ($ErrorMessage) { Add-Content $Operation.Path "error=$ErrorMessage" }
    Add-Content $Operation.Path "completedAt=$((Get-Date).ToString('o'))"
    Rotate-Logs
}

function Write-PRIZMLog {
    param([Parameter(Mandatory)][string]$Message, [ValidateSet('INFO','WARN','ERROR')][string]$Level = 'INFO', [string]$Path)
    $line = "$((Get-Date).ToString('o')) [$Level] $Message"
    Write-Host $line
    if ($Path) { Add-Content $Path $line }
}

function Invoke-PRIZMLoggedCommand {
    param([Parameter(Mandatory)][string]$FilePath, [string[]]$ArgumentList, [Parameter(Mandatory)][string]$LogPath)
    $stdout = [IO.Path]::GetTempFileName()
    $stderr = [IO.Path]::GetTempFileName()
    try {
        $process = Start-Process $FilePath -ArgumentList $ArgumentList -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $out = Get-Content $stdout -Raw -ErrorAction SilentlyContinue
        $err = Get-Content $stderr -Raw -ErrorAction SilentlyContinue
        Add-Content $LogPath "`nstdout:`n$out`nstderr:`n$err"
        if ($out) { Write-Host $out.TrimEnd() }
        if ($err) { Write-Host $err.TrimEnd() -ForegroundColor Yellow }
        if ($process.ExitCode -ne 0) { throw "$FilePath exited with code $($process.ExitCode)." }
    } finally {
        Remove-Item $stdout,$stderr -Force -ErrorAction SilentlyContinue
    }
}

function Get-PRIZMProcess {
    $runtimePath = Get-PRIZMRuntimePath
    if (-not (Test-Path $runtimePath -PathType Leaf)) { return $null }
    try {
        $runtime = Get-Content $runtimePath -Raw | ConvertFrom-Json
        $process = Get-Process -Id ([int]$runtime.pid) -ErrorAction SilentlyContinue
        if (-not $process) { Remove-Item $runtimePath -Force; return $null }
        if ($runtime.root -ne (Get-PRIZMRoot)) { throw 'The PID metadata belongs to a different repository.' }
        if (-not $runtime.processStartTime) { throw 'The PID metadata does not include process identity information.' }
        $recordedStart = [datetime]::Parse("$($runtime.processStartTime)").ToUniversalTime()
        $actualStart = $process.StartTime.ToUniversalTime()
        if ([math]::Abs(($recordedStart - $actualStart).TotalSeconds) -gt 2) {
            throw 'The stored PID has been reused by another process; refusing to manage it.'
        }
        return [pscustomobject]@{ Process = $process; Runtime = $runtime }
    } catch {
        if ($_.Exception.Message -like '*different repository*' -or $_.Exception.Message -like '*refusing to manage*') { throw }
        Remove-Item $runtimePath -Force -ErrorAction SilentlyContinue
        return $null
    }
}

function Test-PRIZMPortAvailable {
    param([int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -eq $listener
}

function Build-PRIZM {
    param([string]$LogPath)
    Assert-PRIZMCommand node
    Assert-PRIZMCommand npm
    $root = Get-PRIZMRoot
    if (-not $LogPath) { $op = New-PRIZMOperation 'build'; $LogPath = $op.Path }
    try {
        Write-PRIZMLog 'Building production client and server bundle...' 'INFO' $LogPath
        Push-Location $root
        try { Invoke-PRIZMLoggedCommand 'npm.cmd' @('run','build') $LogPath } finally { Pop-Location }
        if (-not (Test-Path (Join-Path $root 'dist\server.cjs'))) { throw 'Build completed without creating dist\server.cjs.' }
        if ($op) { Complete-PRIZMOperation $op $true }
    } catch {
        if ($op) { Complete-PRIZMOperation $op $false $_.Exception.Message }
        throw
    }
}

function Invoke-HealthCheck {
    param([switch]$Quiet, [switch]$RequireHttp)
    $config = Get-PRIZMConfig
    $root = Get-PRIZMRoot
    $base = "http://localhost:$($config.port)"
    $checks = [Collections.Generic.List[object]]::new()
    function Add-Check([string]$Name, [bool]$Ok, [string]$Detail, [bool]$Required = $true) {
        $checks.Add([pscustomobject]@{ Name=$Name; Ok=$Ok; Detail=$Detail; Required=$Required })
    }
    foreach ($command in @('node','npm','git')) { Add-Check $command ([bool](Get-Command $command -ErrorAction SilentlyContinue)) 'available on PATH' }
    Add-Check 'repository' (Test-Path (Join-Path $root '.git')) $root
    Add-Check 'package.json' (Test-Path (Join-Path $root 'package.json')) 'repository manifest'
    Add-Check 'dist' (Test-Path (Join-Path $root 'dist')) 'production build directory'
    Add-Check 'server bundle' (Test-Path (Join-Path $root 'dist\server.cjs')) 'dist\server.cjs'
    $running = Get-PRIZMProcess
    $portAvailable = Test-PRIZMPortAvailable ([int]$config.port)
    $portValid = (($null -ne $running) -and (-not $portAvailable)) -or (($null -eq $running) -and $portAvailable)
    Add-Check 'port' $portValid "port $($config.port); managedRunning=$($null -ne $running); available=$portAvailable" $false
    try {
        $null = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 5
        Add-Check 'HTTP' $true $base
    } catch { Add-Check 'HTTP' $false $_.Exception.Message ([bool]$RequireHttp) }
    try {
        $publication = Invoke-RestMethod "$base/api/local/debug/canonical-publication" -TimeoutSec 5
        $ready = $publication.latest.state -eq 'READY' -and $publication.latest.cycleAligned
        Add-Check 'canonical publication' $ready "state=$($publication.latest.state), cycleAligned=$($publication.latest.cycleAligned)" ([bool]$RequireHttp)
        Add-Check 'coordinator' ($publication.latest.publicationCycleId -ne $null) "cycle=$($publication.latest.publicationCycleId)" ([bool]$RequireHttp)
    } catch {
        Add-Check 'canonical publication' $false $_.Exception.Message ([bool]$RequireHttp)
        Add-Check 'coordinator' $false $_.Exception.Message ([bool]$RequireHttp)
    }
    try {
        $workspace = Invoke-RestMethod "$base/api/local/debug/workspace-projections" -TimeoutSec 5
        Add-Check 'workspace API' ([bool]$workspace.ready) "ready=$($workspace.ready)" ([bool]$RequireHttp)
        $projection = Invoke-WebRequest "$base/api/local/workspaces/operator" -UseBasicParsing -TimeoutSec 5
        Add-Check 'projection API' ($projection.StatusCode -eq 200) "HTTP $($projection.StatusCode)" ([bool]$RequireHttp)
    } catch {
        Add-Check 'workspace API' $false $_.Exception.Message ([bool]$RequireHttp)
        Add-Check 'projection API' $false $_.Exception.Message ([bool]$RequireHttp)
    }
    if (-not $Quiet) {
        foreach ($check in $checks) {
            $color = if ($check.Ok) { 'Green' } elseif ($check.Required) { 'Red' } else { 'Yellow' }
            Write-Host ("[{0}] {1}: {2}" -f $(if ($check.Ok) {'PASS'} else {'FAIL'}), $check.Name, $check.Detail) -ForegroundColor $color
        }
    }
    return -not [bool]($checks | Where-Object { $_.Required -and -not $_.Ok })
}

function Wait-ForPRIZM {
    param([int]$TimeoutSeconds = 0)
    $config = Get-PRIZMConfig
    if ($TimeoutSeconds -le 0) { $TimeoutSeconds = [int]$config.startupTimeoutSeconds }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (-not (Get-PRIZMProcess)) { throw 'PRIZM exited before becoming healthy.' }
        if (Invoke-HealthCheck -Quiet -RequireHttp) { return $watch.Elapsed }
        Start-Sleep -Seconds ([int]$config.healthPollSeconds)
    }
    throw "PRIZM did not become healthy within $TimeoutSeconds seconds."
}

function Start-PRIZMServer {
    param([switch]$NoBrowser, [switch]$SkipBuild)
    $op = New-PRIZMOperation 'start'
    try {
        Assert-PRIZMCommand node; Assert-PRIZMCommand npm
        $root = Get-PRIZMRoot; $config = Get-PRIZMConfig
        if (Get-PRIZMProcess) { throw 'PRIZM is already running according to its PID metadata.' }
        $bundle = Join-Path $root 'dist\server.cjs'
        if (-not (Test-Path $bundle)) {
            if ($SkipBuild -or -not $config.autoBuild) { throw 'Production build is missing. Run build-prizm.bat first.' }
            Build-PRIZM $op.Path
        }
        if (-not (Test-PRIZMPortAvailable ([int]$config.port))) { throw "Port $($config.port) is already occupied by another process." }
        $stdout = Join-Path $PSScriptRoot "Logs\server-$((Get-Date).ToString('yyyyMMdd-HHmmss')).stdout.log"
        $stderr = $stdout -replace '\.stdout\.log$','.stderr.log'
        $env:PORT = "$($config.port)"
        $process = Start-Process 'npm.cmd' -ArgumentList @('run','start:prod') -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        @{ pid=$process.Id; processStartTime=$process.StartTime.ToUniversalTime().ToString('o'); root=$root; port=[int]$config.port; startedAt=(Get-Date).ToString('o'); stdout=$stdout; stderr=$stderr } |
            ConvertTo-Json | Set-Content (Get-PRIZMRuntimePath)
        Write-PRIZMLog "Started managed process PID $($process.Id). Waiting for readiness..." 'INFO' $op.Path
        $duration = Wait-ForPRIZM
        $url = "http://localhost:$($config.port)"
        Write-PRIZMLog "PRIZM is healthy at $url (startup $([math]::Round($duration.TotalSeconds,1)) seconds)." 'INFO' $op.Path
        if (-not $NoBrowser -and [bool]$config.launchBrowser) { Start-Process $url }
        Complete-PRIZMOperation $op $true
        return $process
    } catch {
        Complete-PRIZMOperation $op $false $_.Exception.Message
        try { Stop-PRIZMServer -Quiet } catch {}
        throw
    }
}

function Stop-PRIZMServer {
    param([switch]$Quiet)
    $op = New-PRIZMOperation 'stop'
    try {
        $managed = Get-PRIZMProcess
        if (-not $managed) {
            if (-not $Quiet) { Write-PRIZMLog 'PRIZM is not running (no live managed PID).' 'WARN' $op.Path }
            Complete-PRIZMOperation $op $true
            return
        }
        $pidValue = [int]$managed.Runtime.pid
        Write-PRIZMLog "Stopping PRIZM managed process tree PID $pidValue..." 'INFO' $op.Path
        & taskkill.exe /PID $pidValue /T 2>&1 | Tee-Object -FilePath $op.Path -Append | Out-Host
        if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) { throw "Unable to stop PID $pidValue." }
        Remove-Item (Get-PRIZMRuntimePath) -Force -ErrorAction SilentlyContinue
        Complete-PRIZMOperation $op $true
    } catch {
        Complete-PRIZMOperation $op $false $_.Exception.Message
        throw
    }
}

function Restart-PRIZMServer {
    param([switch]$Build, [switch]$NoBrowser)
    Stop-PRIZMServer
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-PRIZMProcess) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if ($Build) { Build-PRIZM }
    Start-PRIZMServer -NoBrowser:$NoBrowser -SkipBuild:$Build
}

Export-ModuleMember -Function Get-PRIZMRoot,Get-PRIZMConfig,Get-PRIZMProcess,Get-PRIZMVersion,Show-PRIZMBanner,Start-PRIZMServer,Stop-PRIZMServer,Restart-PRIZMServer,Wait-ForPRIZM,Invoke-HealthCheck,Write-PRIZMLog,Rotate-Logs,Build-PRIZM,New-PRIZMOperation,Complete-PRIZMOperation,Invoke-PRIZMLoggedCommand,Assert-PRIZMCommand
