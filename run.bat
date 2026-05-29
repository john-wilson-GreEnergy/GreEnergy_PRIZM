@echo off
setlocal enabledelayedexpansion

title GreEnergy PRIZM BESS - Telemetry Control Center

echo ===================================================
echo   GreEnergy PRIZM BESS - Live Monitoring System
echo ===================================================
echo.

:: 1. Check for Node.js
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Node.js is not installed on this system!
    echo Please run "install.bat" first to provision the environment.
    echo.
    pause
    exit /b 1
)

:: 2. Auto Build if compiled site bundle is missing
if not exist "dist\server.cjs" (
    echo [INFO] Production build not found. Compiling application...
    if not exist node_modules (
        echo [INFO] Restoring Node packages...
        call npm install
    )
    call npm run build
)

:: 3. Launch browser automatically in background
echo [INFO] Launching client dashboard in 3 seconds...
start /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"

:: 4. Start Production Server
echo [SUCCESS] Telemetry server initialized at http://localhost:3000
echo [INFO] Press Ctrl+C in this terminal window to stop the server safely.
echo ---------------------------------------------------
call npm run start
pause
