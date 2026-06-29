#!/bin/bash
set -e

FILE_DIR=${1:-'./'}

echo "=========================================="
echo "[USAGE]: ./hatchery_configure_rs485_service.sh -FILE_DIR(optional)"
echo "[INPUT]: ./hatchery_configure_rs485_service.sh \"$FILE_DIR\""
echo "=========================================="

# Setting up all the paths
SRC_SERVICE="${FILE_DIR}feather.systemd.rs485.service"
DEST_SERVICE="/etc/systemd/system/rs485.service"

# Copy Systemd Unit file, reload and enable
sudo cp "${SRC_SERVICE}" "${DEST_SERVICE}"
sudo systemctl daemon-reload
sudo systemctl enable rs485.service
