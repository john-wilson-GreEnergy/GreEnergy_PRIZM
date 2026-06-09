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

# Node.js version alignment check for Tailwind v4 / Vite 6.
NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo
    echo "=========================================================================="
    echo " ⚠️  [WARNING] Outdated Node.js Version Detected: $NODE_VER"
    echo "=========================================================================="
    echo " GreEnergy PRIZM utilizes modern systems (such as Tailwind CSS v4 and"
    echo " Vite 6) which strictly require Node.js v20.0.0 or higher."
    echo " "
    echo " Your current Node.js version ($NODE_VER) is known to crash on build"
    echo " with the native binding error: 'Cannot find native binding' for '@tailwindcss/oxide'."
    echo " "
    echo " We STRONGLY recommend upgrading Node.js to an LTS version (v20 or v22)."
    echo " "
    echo " How to easily upgrade using Node Version Manager (NVM):"
    echo "   1. Install NVM (if not already installed):"
    echo "      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "   2. Restart your terminal session or run:"
    echo "      source ~/.bashrc"
    echo "   3. Install and set Node.js v20:"
    echo "      nvm install 20 && nvm use 20"
    echo "=========================================================================="
    echo
    echo "Would you like to try to proceed with installation on your current version anyway? (y/N)"
    read -r proceed_old
    if [[ ! "$proceed_old" =~ ^[Yy]$ ]]; then
        echo "[INFO] Installer aborted. Please upgrade Node.js and try running the script again!"
        exit 1
    fi
fi

# 2. INSTALL DEPENDENCIES
echo
echo "[STEP 2/4] Installing project dependencies..."
echo "[INFO] Cleaning cross-platform artifact locks to ensure correct native binaries..."
rm -rf node_modules package-lock.json
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
