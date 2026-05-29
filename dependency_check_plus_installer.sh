#!/usr/bin/env bash
# dependency_check.sh
# Verifies that all required dependencies for the EMS and Hatchery deployment scripts are installed.

set -euo pipefail

REQ_CMDS=(
  bash curl jq awk sed tr head tail sort seq column mktemp sleep
  sshpass ssh scp date
)

MISSING=()

echo "Checking dependencies for EMS & Hatchery deployment scripts..."
echo "--------------------------------------------------------------"

for cmd in "${REQ_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf "❌ %-10s (missing)\n" "$cmd"
    MISSING+=("$cmd")
  else
    printf "✅ %-10s (found at %s)\n" "$cmd" "$(command -v "$cmd")"
  fi
done

if ((${#MISSING[@]})); then
  echo
  echo "The following commands are missing:"
  printf '  - %s\n' "${MISSING[@]}"
  echo
  echo "Install them on Ubuntu with:"
  echo "  sudo apt update && sudo apt install -y \
    bash curl jq gawk sed coreutils util-linux perl bsdmainutils ncurses-bin \
    sshpass openssh-client"
  exit 1
else
  echo
  echo "✅ All required dependencies are installed."
fi
