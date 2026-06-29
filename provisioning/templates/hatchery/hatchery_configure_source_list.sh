#!/bin/bash
# PRIZM Provisioning Template
# Reference / preview asset for controlled provisioning planning.
# Do not store credentials in this file.
# Do not run manually unless reviewed and approved for the target site.


FILE_DIR=${1:-'./'}

 echo "=========================================="
 echo '[USAGE]: ./hatchery_configure_sources_list.sh -FILE_DIR'
 echo "[INPUT]: ./hatchery_configure_sources_list.sh \"$FILE_DIR\""
 echo "=========================================="


# Setting up all the paths
SRC_SERVICE="${FILE_DIR}sources.list"
DEST_SERVICE="/etc/apt/sources.list"

sudo cp "${SRC_SERVICE}" "${DEST_SERVICE}"
