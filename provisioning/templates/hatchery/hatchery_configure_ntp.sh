#!/bin/bash

FILE_DIR=${1:-'./'}

 echo "=========================================="
 echo '[USAGE]: ./hatchery_configure_ntp.sh -FILE_DIR'
 echo "[INPUT]: ./hatchery_configure_ntp.sh \"$FILE_DIR\""
 echo "=========================================="


# Setting up all the paths
SRC_SERVICE="${FILE_DIR}ntp.conf"
DEST_SERVICE="/etc/ntp.conf"

sudo systemctl enable ntp.service
sudo cp "${SRC_SERVICE}" "${DEST_SERVICE}"
