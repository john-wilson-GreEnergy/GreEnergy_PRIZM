#!/usr/bin/env bash
# deploy_hatchery_interactive.sh
# Interactive deployment using a local hatchery folder as source of truth.
# - Prompts for Target IP, Segment Index, and CS/ES feather type
# - Edits LOCAL JSON (featherIndex) with jq
# - Edits LOCAL feather.xml (IP + CS/ES-specific serial settings) with sed
# - Pushes files to remote ~/hatchery/
# - Backs up remote JSON/XML, runs scripts, restarts Tomcat

set -euo pipefail

# ========================= USER CONFIG =========================
# Local source-of-truth path for hatchery files:
LOCAL_HATCHERY_PATH="${LOCAL_HATCHERY_PATH:-/home/powin/tools/greenergy_scripts/configuration_files/hatchery}"

# Remote settings (override via env if needed)
REMOTE_USER="${REMOTE_USER:-moxa}"
REMOTE_PASS="${REMOTE_PASS:-moxa}"   # used by sshpass and sudo -S
REMOTE_DIR="hatchery"
TOMCAT_SVC="${TOMCAT_SVC:-tomcat8}"

# SSH/SCP options
SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=7)
SCP_OPTS=(-o StrictHostKeyChecking=no)

# File names expected in LOCAL_HATCHERY_PATH
JSON_A="fourbaidentity.json"
JSON_B="feather.json"
XML_F="feather.xml"
CFG_SCRIPT="hatchery_configure_feather_powin.sh"
WAR_SCRIPT="hatchery_install_war.sh"
WAR_F="feather.war"

REQUIRED_LOCAL_FILES=("$JSON_A" "$JSON_B" "$XML_F" "$CFG_SCRIPT" "$WAR_SCRIPT" "$WAR_F")

# ========================= DEPENDENCIES ========================
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 2; }; }
need sshpass; need ssh; need scp; need awk; need sed; need date; need jq

# ========================= HELPER FUNCS ========================
is_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r a b c d <<<"$1"
  for n in "$a" "$b" "$c" "$d"; do (( n >= 0 && n <= 255 )) || return 1; done
  return 0
}

inc_last_octet() {
  local ip="$1"; IFS='.' read -r a b c d <<<"$ip"
  (( d < 255 )) || { echo "ERROR: cannot increment last octet of ${ip} (would overflow 255)" >&2; return 1; }
  printf "%d.%d.%d.%d\n" "$a" "$b" "$c" "$((d+1))"
}

confirm() {
  local prompt="${1:-Proceed?}" v
  while :; do
    read -rp "$prompt (y/n): " v
    case "${v,,}" in y|yes) return 0 ;; n|no) return 1 ;; *) echo "Please enter y or n." ;; esac
  done
}

run_remote() { local ip="$1"; shift; sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" -t "${REMOTE_USER}@${ip}" "$@"; }
copy_to_remote() { local ip="$1" src="$2" dst="$3"; sshpass -p "$REMOTE_PASS" scp "${SCP_OPTS[@]}" -r "$src" "${REMOTE_USER}@${ip}:${dst}"; }

backup_local() {
  local path="$1"
  local ts="$2"
  cp -a -- "$path" "${path}.bak.${ts}"
}

# ========================= INPUTS ==============================
echo "Target IP address?"
read -r TARGET_IP
if ! is_ipv4 "$TARGET_IP"; then echo "Invalid IPv4 address: $TARGET_IP" >&2; exit 2; fi

echo "Segment Index Number (Lineup # x 100 + segment # + 1)"
read -r SEGMENT_INDEX
if [[ ! "$SEGMENT_INDEX" =~ ^[0-9]+$ ]]; then
  echo "Segment Index must be a non-negative integer." >&2
  exit 2
fi

# CS vs ES selection
FEATHER_TYPE=""
while :; do
  echo "CS Feather or ES Feather (CS/ES)?"
  read -r FEATHER_TYPE
  FEATHER_TYPE="${FEATHER_TYPE^^}"   # uppercase
  case "$FEATHER_TYPE" in
    CS|ES) break ;;
    *) echo "Please enter 'CS' or 'ES'." ;;
  esac
done

NEW_IOLOGIK_IP="$(inc_last_octet "$TARGET_IP")" || exit 2
TS="$(date +%Y%m%d_%H%M%S)"

# ========================= VALIDATION ==========================
if [[ ! -d "$LOCAL_HATCHERY_PATH" ]]; then
  echo "Local path not found: $LOCAL_HATCHERY_PATH" >&2
  exit 2
fi

missing=()
for f in "${REQUIRED_LOCAL_FILES[@]}"; do
  [[ -f "${LOCAL_HATCHERY_PATH}/${f}" ]] || missing+=("$f")
done
if ((${#missing[@]})); then
  echo "The following required files are missing in ${LOCAL_HATCHERY_PATH}:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 2
fi

# ========================= LOCAL EDITS =========================
echo "[Local] Backing up JSON and XML before edits ..."
backup_local "${LOCAL_HATCHERY_PATH}/${JSON_A}" "$TS"
backup_local "${LOCAL_HATCHERY_PATH}/${JSON_B}" "$TS"
backup_local "${LOCAL_HATCHERY_PATH}/${XML_F}" "$TS"

echo "[Local] Updating JSON featherIndex -> ${SEGMENT_INDEX} ..."
for jf in "$JSON_A" "$JSON_B"; do
  src="${LOCAL_HATCHERY_PATH}/${jf}"
  tmp="${src}.tmp.${TS}"
  jq --argjson idx "$SEGMENT_INDEX" '.featherIndex = $idx' "$src" > "$tmp"
  [[ -s "$tmp" ]] || { echo "ERROR: jq produced empty output for ${jf}" >&2; rm -f "$tmp"; exit 2; }
  mv -f -- "$tmp" "$src"
done

# XML edits (local) -----------------------------------------------------------
# Always update the IP literal 10.0.2.11 -> NEW_IOLOGIK_IP
echo "[Local] Updating ${XML_F}: 10.0.2.11 -> ${NEW_IOLOGIK_IP} ..."
sed -i "s|10\.0\.2\.11|${NEW_IOLOGIK_IP}|g" "${LOCAL_HATCHERY_PATH}/${XML_F}"

# CS/ES-specific parameter updates:
#   - feather.modbusv1.poller.serialConnectionType: ES=rxtx, CS=pjc
#   - feather.modbusv1.poller.serialPortName:       ES=/dev/ttyUSB0, CS=/dev/ttyM0
XML_PATH="${LOCAL_HATCHERY_PATH}/${XML_F}"

if [[ "$FEATHER_TYPE" == "ES" ]]; then
  echo "[Local] Setting ES serial settings in ${XML_F} ..."
  # Replace ONLY the value attribute for the matching Parameter name
  sed -i -E \
    's|(name="feather\.modbusv1\.poller\.serialConnectionType"[^>]*value=")[^"]*|\1rxtx|;' \
    "$XML_PATH"
  sed -i -E \
    's|(name="feather\.modbusv1\.poller\.serialPortName"[^>]*value=")[^"]*|\1\/dev\/ttyUSB0|;' \
    "$XML_PATH"
else
  echo "[Local] Setting CS serial settings in ${XML_F} ..."
  sed -i -E \
    's|(name="feather\.modbusv1\.poller\.serialConnectionType"[^>]*value=")[^"]*|\1pjc|;' \
    "$XML_PATH"
  sed -i -E \
    's|(name="feather\.modbusv1\.poller\.serialPortName"[^>]*value=")[^"]*|\1\/dev\/ttyM0|;' \
    "$XML_PATH"
fi
# ---------------------------------------------------------------------------

cat <<SUMMARY

Summary
-------
Local source:      ${LOCAL_HATCHERY_PATH}
Remote host:       ${REMOTE_USER}@${TARGET_IP}
Remote directory:  ~/${REMOTE_DIR}
Local edits applied:
  - ${JSON_A}: "featherIndex" = ${SEGMENT_INDEX}
  - ${JSON_B}: "featherIndex" = ${SEGMENT_INDEX}
  - ${XML_F}:  '10.0.2.11' -> '${NEW_IOLOGIK_IP}'
  - ${XML_F}:  serialConnectionType & serialPortName set for ${FEATHER_TYPE}
Scripts to run (sudo on remote):
  - ${CFG_SCRIPT}
  - ${WAR_SCRIPT} ${WAR_F} ${XML_F}
Service to restart:
  - ${TOMCAT_SVC}
SUMMARY

# Quick SSH test
echo "Testing SSH connectivity to ${REMOTE_USER}@${TARGET_IP}..."
if ! sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" -o BatchMode=no "${REMOTE_USER}@${TARGET_IP}" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: Unable to SSH into ${REMOTE_USER}@${TARGET_IP}. Check network or credentials." >&2
  exit 3
fi
echo "SSH connectivity OK."

echo
echo "Planned actions:"
cat <<EOF
1) Create remote directory ~/${REMOTE_DIR} if missing
2) Copy LOCAL files (already edited) to remote ~/${REMOTE_DIR}/
3) Backup remote JSON/XML with timestamp suffix
4) Ensure remote scripts are executable
5) Run configuration & WAR install (sudo)
6) Restart ${TOMCAT_SVC}
EOF
echo

confirm "Proceed with deployment on ${TARGET_IP}?" || { echo "Canceled."; exit 0; }

# ========================= EXECUTION ===========================
echo "[1/6] Ensuring remote directory exists ..."
run_remote "$TARGET_IP" "mkdir -p ~/${REMOTE_DIR}"

echo "[2/6] Copying local files to remote ~/${REMOTE_DIR}/ ..."
for f in "${REQUIRED_LOCAL_FILES[@]}"; do
  copy_to_remote "$TARGET_IP" "${LOCAL_HATCHERY_PATH}/${f}" "~/${REMOTE_DIR}/"
done
echo "OK."

echo "[3/6] Backing up remote JSON/XML to .bak.${TS} ..."
run_remote "$TARGET_IP" "cd ${REMOTE_DIR} && echo ${REMOTE_PASS} | sudo -S bash -c 'for f in ${JSON_A} ${JSON_B} ${XML_F}; do [ -f \"\$f\" ] && cp -a \"\$f\" \"\$f.bak.${TS}\" || true; done'"
echo "OK."

echo "[4/6] Ensuring remote scripts are executable ..."
run_remote "$TARGET_IP" "cd ${REMOTE_DIR} && chmod +x '${CFG_SCRIPT}' '${WAR_SCRIPT}' || true"
echo "OK."

echo "[5/6] Running configuration and WAR install (sudo) ..."
run_remote "$TARGET_IP" "cd ${REMOTE_DIR} && echo ${REMOTE_PASS} | sudo -S './${CFG_SCRIPT}'"
run_remote "$TARGET_IP" "cd ${REMOTE_DIR} && echo ${REMOTE_PASS} | sudo -S './${WAR_SCRIPT}' '${WAR_F}' '${XML_F}'"
echo "OK."

echo "[6/6] Restarting service ${TOMCAT_SVC} ..."
run_remote "$TARGET_IP" "echo ${REMOTE_PASS} | sudo -S service ${TOMCAT_SVC} restart"
echo "Done."

echo
echo "Deployment completed successfully on ${TARGET_IP}."
echo "Local backups:  ${LOCAL_HATCHERY_PATH}/{${JSON_A},${JSON_B},${XML_F}}.bak.${TS}"
echo "Remote backups: ~/${REMOTE_DIR}/{${JSON_A},${JSON_B},${XML_F}}.bak.${TS}"
