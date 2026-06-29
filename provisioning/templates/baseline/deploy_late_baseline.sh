#!/bin/bash
# PRIZM Provisioning Template
# Reference / preview asset for controlled provisioning planning.
# Do not store credentials in this file.
# Do not run manually unless reviewed and approved for the target site.
# Reference template only.
# PRIZM controlled execution is not enabled yet.

TARGET_IP=$1
PRIZM_TARGET_USER="${PRIZM_TARGET_USER:-moxa}"
PRIZM_TARGET_PASSWORD="${PRIZM_TARGET_PASSWORD:-}"
PRIZM_SUDO_PASSWORD="${PRIZM_SUDO_PASSWORD:-}"

if [[ -z "$TARGET_IP" ]]; then
  echo "Usage: ./deploy_late_baseline.sh <TARGET_IP>"
  exit 1
fi

if [[ -z "$PRIZM_TARGET_PASSWORD" ]]; then
  echo "Error: PRIZM_TARGET_PASSWORD must be set."
  exit 1
fi

if [[ -z "$PRIZM_SUDO_PASSWORD" ]]; then
  echo "Error: PRIZM_SUDO_PASSWORD must be set."
  exit 1
fi

sshpass -p "$PRIZM_TARGET_PASSWORD" scp -oStrictHostKeyChecking=no deploy-redux.tar "${PRIZM_TARGET_USER}@${TARGET_IP}:~/"
sshpass -p "$PRIZM_TARGET_PASSWORD" ssh -oStrictHostKeyChecking=no "${PRIZM_TARGET_USER}@${TARGET_IP}" "tar xf deploy-redux.tar; cd deploy; echo \"$PRIZM_SUDO_PASSWORD\" | sudo -S ./featherScript.sh"
