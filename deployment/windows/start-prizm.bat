@echo off
setlocal
title GreEnergy PRIZM - Start
echo ============================================================
echo               GreEnergy PRIZM Platform
echo ============================================================
where node.exe >nul 2>&1 || (echo ERROR: Node.js is not installed or not on PATH. & exit /b 10)
where npm.cmd >nul 2>&1 || (echo ERROR: npm is not installed or not on PATH. & exit /b 11)
where powershell.exe >nul 2>&1 || (echo ERROR: Windows PowerShell is unavailable. & exit /b 12)
set "PRIZM_ROOT=%~dp0..\.."
if not exist "%PRIZM_ROOT%\package.json" (echo ERROR: Invalid repository root; package.json is missing. & exit /b 13)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-PRIZM.ps1" %*
set "PRIZM_EXIT=%ERRORLEVEL%"
if not "%PRIZM_EXIT%"=="0" pause
exit /b %PRIZM_EXIT%
