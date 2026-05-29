#!/usr/bin/env bash
# manual_baseline.sh
# Baseline MOXA config:
# - Prompt for target IP, eth0/eth1 (CIDR), and "In network" vs "External"
# - Build /etc/network/interfaces accordingly (eth1 DHCP if External)
# - Push to device (backup + delayed networking restart)
# - Upload a tarball, unpack, and run a script inside it
# - Offer to run manual_hatchery.sh at the end

set -euo pipefail

# ======================= USER CONFIG DEFAULTS =======================
REMOTE_USER="${REMOTE_USER:-moxa}"
REMOTE_PASS="${REMOTE_PASS:-moxa}"           # used for sudo and sshpass
DEFAULT_GW="${DEFAULT_GW:-10.0.0.1}"
RESTART_DELAY="${RESTART_DELAY:-10}"         # seconds
SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ConnectionAttempts=3 -o ServerAliveInterval=2 -o ServerAliveCountMax=3)

# ======================= DEPENDENCY CHECK ===========================
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 2; }; }
need sshpass; need ssh; need scp; need sed; need awk; need date; need mktemp; need tar

# ======================= HELPERS ===================================
ask() { local p="$1" d="${2:-}"; local v; read -rp "$p${d:+ [$d]}: " v || true; echo "${v:-$d}"; }
ask_yn(){ local p="$1" d="${2:-y}"; local v; while :; do read -rp "$p (y/n) [$d]: " v || true; v="${v:-$d}"; v="${v,,}"; [[ "$v" == y || "$v" == n ]] && { echo "$v"; return; }; echo "Please enter y or n."; done; }
is_ipv4(){ [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1; IFS='.' read -r a b c d <<<"$1"; for n in "$a" "$b" "$c" "$d"; do (( n>=0 && n<=255 )) || return 1; done; }
is_cidr(){ [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]]; }
cidr_ip(){ echo "${1%%/*}"; }

run_remote() { local ip="$1"; shift; sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" -t "${REMOTE_USER}@${ip}" "$@"; }
copy_remote() { local ip="$1" src="$2" dst="$3"; sshpass -p "$REMOTE_PASS" scp -r "${SSH_OPTS[@]}" "$src" "${REMOTE_USER}@${ip}:${dst}"; }

# ======================= INPUTS ====================================
echo "=== Baseline MOXA Configuration ==="
while :; do
  TARGET_IP="$(ask "Target Device IP Address?")"
  is_ipv4 "$TARGET_IP" && break
  echo "Invalid IPv4 address."
done

echo "Use CIDR format (e.g., 10.0.1.10/16)"
while :; do
  ETH0_CIDR="$(ask "eth0 New IP")"
  is_cidr "$ETH0_CIDR" && break
  echo "Invalid CIDR for eth0 (example: 10.0.1.10/16)."
done

# “In network or external?”
while :; do
  NET_MODE="$(ask "In network or external?" "in")"
  NET_MODE="${NET_MODE,,}"
  [[ "$NET_MODE" == "in" || "$NET_MODE" == "internal" || "$NET_MODE" == "external" || "$NET_MODE" == "ex" ]] && break
  echo "Please enter 'in' (internal) or 'external'."
done

ETH1_DHCP=false
ETH1_CIDR=""
if [[ "$NET_MODE" == "external" || "$NET_MODE" == "ex" ]]; then
  ETH1_DHCP=true
  echo "External mode selected — eth1 will be configured as DHCP."
else
  while :; do
    ETH1_CIDR="$(ask "eth1 New IP (CIDR)")"
    is_cidr "$ETH1_CIDR" && break
    echo "Invalid CIDR for eth1 (example: 10.0.1.11/16)."
  done
fi

echo
echo "Summary:"
echo "  Target:  ${REMOTE_USER}@${TARGET_IP}"
echo "  eth0:    ${ETH0_CIDR} (gateway ${DEFAULT_GW})"
if $ETH1_DHCP; then
  echo "  eth1:    DHCP"
else
  echo "  eth1:    ${ETH1_CIDR} (gateway ${DEFAULT_GW})"
fi
[[ "$(ask_yn "Proceed with baseline replacement?")" == "y" ]] || { echo "Canceled."; exit 0; }

# ======================= BUILD LOCAL FILE ==========================
TMPF="$(mktemp)"
{
cat <<EOF
# interfaces(5) file used by ifup(8) and ifdown(8)
# Include files from /etc/network/interfaces.d:
source-directory /etc/network/interfaces.d
auto eth0 eth1 lo
iface lo inet loopback
iface eth0 inet static
        address ${ETH0_CIDR}
        gateway ${DEFAULT_GW}
EOF

if $ETH1_DHCP; then
cat <<'EOF'
iface eth1 inet dhcp
EOF
else
cat <<EOF
iface eth1 inet static
        address ${ETH1_CIDR}
        gateway ${DEFAULT_GW}
EOF
fi
} >"$TMPF"

# ======================= PUSH + APPLY =============================
echo
echo "[1/4] Testing SSH connectivity ..."
if ! sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" -o BatchMode=no "${REMOTE_USER}@${TARGET_IP}" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: SSH login failed to ${REMOTE_USER}@${TARGET_IP}."
  rm -f "$TMPF"
  exit 3
fi

echo "[2/4] Backing up & replacing /etc/network/interfaces ..."
run_remote "$TARGET_IP" "bash -s" <<REMOTE
set -euo pipefail
PASS="$REMOTE_PASS"
REMOTE_FILE="/etc/network/interfaces"
TS="\$(date +%Y%m%d_%H%M%S)"
TMPR="\$(mktemp)"

# Receive file from stdin
cat > "\$TMPR" <<'EOF_PAYLOAD'
$(sed 's/\\/\\\\/g' "$TMPF")
EOF_PAYLOAD

# Backup if present
if [[ -f "\$REMOTE_FILE" ]]; then
  echo "\$PASS" | sudo -S cp -a -- "\$REMOTE_FILE" "\${REMOTE_FILE}.bak.\$TS"
fi

# Write new file
echo "\$PASS" | sudo -S tee "\$REMOTE_FILE" >/dev/null < "\$TMPR"
rm -f "\$TMPR"
echo "Backup: \${REMOTE_FILE}.bak.\$TS (if existed)"
echo "Updated: \${REMOTE_FILE}"

# Delayed restart
( sleep ${RESTART_DELAY} && { echo "\$PASS" | sudo -S systemctl restart networking 2>/dev/null || echo "\$PASS" | sudo -S /etc/init.d/networking restart; } ) >/dev/null 2>&1 &
echo "Scheduled networking restart in ${RESTART_DELAY}s ..."
REMOTE

# ======================= TARBALL & SCRIPT =========================
echo
TAR_PATH="$(ask "Path to tarball (.tar/.tgz/.tar.gz) to upload (blank to skip)" "")"
if [[ -n "$TAR_PATH" ]]; then
  if [[ ! -f "$TAR_PATH" ]]; then
    echo "Tarball not found: $TAR_PATH" >&2
  else
    BASENAME="$(basename "$TAR_PATH")"
    REMOTE_TMP="~/baseline_pkg_$(date +%Y%m%d_%H%M%S)"
    echo "[3/4] Uploading tarball to $REMOTE_TMP ..."
    run_remote "$TARGET_IP" "mkdir -p $REMOTE_TMP"
    copy_remote "$TARGET_IP" "$TAR_PATH" "$REMOTE_TMP/"

    echo "[4/4] Unpacking on device ..."
    run_remote "$TARGET_IP" "cd $REMOTE_TMP && (tar xzf '$BASENAME' 2>/dev/null || tar xf '$BASENAME')"

    RUN_INSIDE="$(ask "Name of script inside extracted package to execute (e.g., setup.sh) (blank to skip)" "")"
    if [[ -n "$RUN_INSIDE" ]]; then
      RUN_SUDO="$(ask_yn "Run with sudo?" "y")"
      if [[ "$RUN_SUDO" == "y" ]]; then
        run_remote "$TARGET_IP" "cd $REMOTE_TMP && chmod +x '$RUN_INSIDE' || true && echo $REMOTE_PASS | sudo -S './$RUN_INSIDE'"
      else
        run_remote "$TARGET_IP" "cd $REMOTE_TMP && chmod +x '$RUN_INSIDE' || true && './$RUN_INSIDE'"
      fi
    fi
  fi
else
  echo "Skipping tarball upload."
fi

rm -f "$TMPF"

# ======================= CHAIN TO HATCHERY ========================
echo
if [[ -x "./manual_hatchery.sh" || -f "./manual_hatchery.sh" ]]; then
  if [[ "$(ask_yn "Run manual_hatchery.sh now?")" == "y" ]]; then
    echo
    echo "------------------------------------------------------------"
    echo "=> Running: ./manual_hatchery.sh"
    echo "------------------------------------------------------------"
    if [[ -x "./manual_hatchery.sh" ]]; then ./manual_hatchery.sh; else bash ./manual_hatchery.sh; fi
  fi
else
  echo "(manual_hatchery.sh not found in current directory — skipping)"
fi

echo
echo "✅ Baseline configuration complete."
