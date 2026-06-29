#!/bin/bash
set -e

FILE_DIR="${1:-'./'}"

echo "=========================================="
echo "[USAGE]: ./hatchery_configure_tomcat_service.sh -FILE_DIR(optional)"
echo "[INPUT]: ./hatchery_configure_tomcat_service.sh \"$FILE_DIR\""
echo "=========================================="

# Setting up all the paths
SRC_START="${FILE_DIR}/feather.systemd.tomcat8-start.sh"
SRC_STARTPRE="${FILE_DIR}/feather.systemd.tomcat8-startpre.sh"
SRC_SERVICE="${FILE_DIR}/feather.systemd.tomcat8.service"

DEST_DIR="/etc/powin/systemd"
DEST_START="${DEST_DIR}/tomcat8-start.sh"
DEST_STARTPRE="${DEST_DIR}/tomcat8-startpre.sh"
DEST_SERVICE="/etc/systemd/system/tomcat8.service"

# Disable tomcat8 SysV service 
#  Remove tomcat8 init.d file if it exists 
#  Remove tomcat8 symlinks from /etc/rcX.d/tomcat8 folders
sudo rm -f -- /etc/init.d/tomcat8
sudo update-rc.d tomcat8 remove

# Copy scripts used by the Systemd Unit file
sudo mkdir -p "${DEST_DIR}"
sudo chown root:root "${DEST_DIR}"

sudo cp "${SRC_START}" "${DEST_START}"
sudo chmod +x "${DEST_START}"
sudo chown root:root "${DEST_START}"

sudo cp "${SRC_STARTPRE}" "${DEST_STARTPRE}"
sudo chmod +x "${DEST_STARTPRE}"
sudo chown root:root "${DEST_STARTPRE}"

# Copy Systemd Unit file, reload and enable
sudo cp "${SRC_SERVICE}" "${DEST_SERVICE}"
sudo systemctl daemon-reload
sudo systemctl enable tomcat8.service
