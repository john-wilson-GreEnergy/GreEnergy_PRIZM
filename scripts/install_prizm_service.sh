#!/bin/bash
set -e

SERVICE_FILE="/etc/systemd/system/prizm.service"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="$(whoami)"
GROUP_NAME="$(id -gn)"

echo "Installing PRIZM Systemd Service..."
echo "Running as $USER_NAME:$GROUP_NAME in $APP_DIR"

if [ "$EUID" -ne 0 ]; then
  echo "Please run this script with sudo (or switch to root)."
  echo "Example: sudo bash scripts/install_prizm_service.sh"
  exit 1
fi

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=GreEnergy PRIZM Runtime
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=-$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/start-production.cjs
Restart=always
RestartSec=5
User=$USER_NAME
Group=$GROUP_NAME
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd daemon..."
systemctl daemon-reload

echo "Service installed at $SERVICE_FILE"
echo "You can start it with: sudo systemctl start prizm"
echo "Enable on boot with: sudo systemctl enable prizm"
