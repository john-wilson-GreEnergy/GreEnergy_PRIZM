@echo off
setlocal enabledelayedexpansion

title GreEnergy PRIZM BESS - Installer for Windows

echo ===================================================
echo   GreEnergy PRIZM BESS Telemetry - Windows Installer
echo ===================================================
echo.
echo This installer will provision the local environment,
echo install required Node.js libraries, build the application,
echo and create a Desktop shortcut for one-click access.
echo.

:: Check Administrator status (informational)
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [SYSTEM] Running with elevated/administrator privileges.
) else (
    echo [SYSTEM] Running in normal user space.
)

:: Step 1: Detect Node.js
echo.
echo [STEP 1/4] Checking for Node.js runtime environment...
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo [WARNING] Node.js was not found on this system!
    echo.
    echo PRIZM requires Node.js v18 or higher to operate.
    set /p "install_node=Would you like to automatically install Node.js via Windows Package Manager (winget)? (Y/N): "
    if /i "!install_node!"=="Y" (
        echo [INFO] Attempting to install Node.js LTS via winget...
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        if !errorlevel! neq 0 (
            echo [ERROR] Automatic winget installation failed or is not available.
            echo Please install Node.js v18+ manually from: https://nodejs.org/
            echo Opening download page in your web browser...
            start https://nodejs.org/
            pause
            exit /b 1
        )
        echo.
        echo [SUCCESS] Node.js successfully installed!
        echo Please restart this installer in a brand new command prompt to apply system path updates.
        pause
        exit /b 0
    ) else (
        echo [ERROR] Node.js installation is required to continue. Check aborted.
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [SUCCESS] Node.js detected: !NODE_VER!

:: Step 2: Install Dependencies
echo.
echo [STEP 2/4] Installing Node library dependencies...
call npm install
if !errorlevel! neq 0 (
    echo [ERROR] NPM installations failed! Please check your network connection.
    pause
    exit /b 1
)
echo [SUCCESS] Dependencies installed successfully.

:: Step 3: Build Production Artifacts
echo.
echo [STEP 3/4] Compiling assets and bundling server...
call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] Application compilation failed!
    pause
    exit /b 1
)
echo [SUCCESS] Application built and optimized successfully.

:: Step 4: Create Desktop Shortcut
echo.
echo [STEP 4/4] Generating desktop icon for one-click launcher...

set "LauncherPath=%~dp0run.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'GreEnergy PRIZM.lnk')); $s.TargetPath='%LauncherPath%'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='shell32.dll,238'; $s.Description='GreEnergy PRIZM BESS Operations and Telemetry Monitor'; $s.Save()"

if !errorlevel! neq 0 (
    echo [ERROR] Failed to compile Desktop shortcut!
) else (
    echo [SUCCESS] Created Desktop Shortcut in: "%USERPROFILE%\Desktop\GreEnergy PRIZM.lnk"
)

echo.
echo ===================================================
echo   INSTALLATION COMPLETED SUCCESSFULLY!
echo ===================================================
echo.
echo You can now run GreEnergy PRIZM directly using your new
echo desktop shortcut: "GreEnergy PRIZM"
echo.
set /p "run_now=Would you like to launch PRIZM right now? (Y/N): "
if /i "!run_now!"=="Y" (
    call "%LauncherPath%"
) else (
    echo [INFO] All set! Have a productive session. Exiting...
    timeout /t 5 >nul
)
