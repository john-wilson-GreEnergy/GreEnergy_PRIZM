#!/bin/bash
set -e

echo "==================================================="
echo "  GreEnergy PRIZM BESS Telemetry - Linux Installer"
echo "==================================================="
echo
echo "This installer will provision the local environment,"
echo "install required Node.js packages, build the application,"
echo "and create a Desktop launcher for one-click access."
echo

# 1. CHECK FOR NODE.JS
echo "[STEP 1/4] Checking for Node.js runtime environment..."
if ! command -v node &> /dev/null; then
    echo "[WARNING] Node.js was not detected on this system!"
    echo "PRIZM requires Node.js v18 or higher to operate."
    echo
    echo "Would you like to attempt installation via your package manager? (Y/n)"
    read -r install_node
    if [[ "$install_node" =~ ^[Yy]?$ ]] || [[ -z "$install_node" ]]; then
        echo "[INFO] Updating package list and installing Node.js..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y nodejs npm
        elif command -v pacman &> /dev/null; then
            sudo pacman -Sy --noconfirm nodejs npm
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs npm
        elif command -v snap &> /dev/null; then
            sudo snap install node --classic
        else
            echo "[ERROR] Could not identify your package manager."
            echo "Please manually install Node.js (v18+) and NPM, then re-run this script."
            exit 1
        fi
    else
        echo "[ERROR] Node.js installation is required to continue. Installer aborted."
        exit 1
    fi
fi

NODE_VER=$(node -v)
echo "[SUCCESS] Node.js detected: $NODE_VER"

# 2. INSTALL DEPENDENCIES
echo
echo "[STEP 2/4] Installing project dependencies..."
npm install
echo "[SUCCESS] Dependencies installed successfully."

# 3. BUILD THE APPLICATION
echo
echo "[STEP 3/4] Compiling assets and bundling server..."
npm run build
echo "[SUCCESS] Application compiled successfully."

# 4. SET LAUNCHER TO EXECUTABLE
chmod +x run.sh

# 5. CREATE DESKTOP SHORTCUT
echo
echo "[STEP 4/4] Creating Desktop Shortcut..."

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_PATH="$APP_DIR/run.sh"
ICON_PATH="$APP_DIR/src/components/logo-transparent.svg"
SHORTCUT_PATH="$HOME/Desktop/GreEnergy-Prizm.desktop"

# Create Desktop Shortcut content
cat <<EOF > "$SHORTCUT_PATH"
[Desktop Entry]
Version=1.0
Type=Application
Name=GreEnergy PRIZM
Comment=GreEnergy PRIZM BESS Operations & Telemetry Monitor
Exec="$LAUNCHER_PATH"
Icon=$ICON_PATH
Terminal=true
Categories=Utility;Development;
EOF

chmod +x "$SHORTCUT_PATH"

# Also place a copy in local applications menu for quick system lookup
mkdir -p "$HOME/.local/share/applications"
cp "$SHORTCUT_PATH" "$HOME/.local/share/applications/GreEnergy-Prizm.desktop"

echo "[SUCCESS] Desktop entry created at:"
echo "          - On your Desktop: $SHORTCUT_PATH"
echo "          - In your App Menu: ~/.local/share/applications/GreEnergy-Prizm.desktop"
echo
echo "NOTE (GNOME users): On modern GUI environments, you must right-click"
echo "the desktop icon and choose 'Allow Launching' (or 'Trust Launcher')"
echo "to permit starting it directly from the Desktop graphical interface."
echo

echo "==================================================="
echo "  INSTALLATION COMPLETED SUCCESSFULLY!"
echo "==================================================="
echo
echo "You can now launch PRIZM by double-clicking the 'GreEnergy PRIZM' desktop icon"
echo "or by running the boot launcher directly: ./run.sh"
echo
echo "Would you like to start PRIZM right now? (Y/n)"
read -r run_now
if [[ "$run_now" =~ ^[Yy]?$ ]] || [[ -z "$run_now" ]]; then
    ./run.sh
else
    echo "You're all set! Enjoy GreEnergy PRIZM!"
fi
