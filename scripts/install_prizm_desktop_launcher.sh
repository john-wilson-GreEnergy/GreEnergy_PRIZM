#!/bin/bash
set -e

DESKTOP_DIR="$HOME/Desktop"
DESKTOP_FILE="$DESKTOP_DIR/GreEnergy PRIZM.desktop"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Installing PRIZM Desktop Launcher..."

mkdir -p "$DESKTOP_DIR"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=GreEnergy PRIZM
Comment=Launch PRIZM Local Dashboard
Exec=bash -lc 'sudo systemctl start prizm; xdg-open http://localhost:3000'
Icon=utilities-system-monitor
Terminal=false
Categories=Utility;
EOF

chmod +x "$DESKTOP_FILE"

echo "Launcher created at $DESKTOP_FILE"
