#!/usr/bin/env bash
# manual_setup.sh
# Combined Baseline + Hatchery automation for MOXA Feathers
# - Robust scp-via-tar transfer
# - Service-level Tomcat verification (systemd + journal + port)
# - Interactive menu (clear list) and spinners for long-running quiet steps

set -euo pipefail

# -------------------- User Config --------------------
REMOTE_USER="${REMOTE_USER:-moxa}"
REMOTE_PASS="${REMOTE_PASS:-moxa}"
DEFAULT_IP="192.168.3.127"

SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=7 -o BatchMode=no)
SCP_OPTS=(-o StrictHostKeyChecking=no)

NAMESERVER="8.8.8.8"
DEPLOY_TAR_SRC="${DEPLOY_TAR_SRC:-/home/powin/greenergy_scripts/configuration_files/deploy-redux.tar}"
REMOTE_HOME="/home/${REMOTE_USER}"
REMOTE_DEPLOY_DIR="${REMOTE_HOME}/deploy"
REMOTE_TAR_DST="${REMOTE_HOME}/deploy-redux.tar"

REBOOT_WAIT_DOWN=8
PING_RETRY=120
SSH_TRY_INTERVAL=3
GATEWAY_DEFAULT="${GATEWAY_DEFAULT:-10.0.0.1}"
MASK_CIDR="/16"

LOCAL_HATCHERY_PATH="${LOCAL_HATCHERY_PATH:-/home/powin/greenergy_scripts/configuration_files/hatchery}"
TOMCAT_SVC="${TOMCAT_SVC:-tomcat8}"

# -------------------- Dependency Checks --------------------
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 2; }; }
need sshpass; need ssh; need scp; need sed; need awk; need jq; need tar; need ping; need date

# -------------------- Helpers --------------------
is_ipv4(){
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r a b c d <<<"$1"
  for n in "$a" "$b" "$c" "$d"; do (( n>=0 && n<=255 )) || return 1; done
  return 0
}

confirm() {
  local p="${1:-Proceed?}" v
  while :; do
    read -rp "$p (y/n): " v
    case "${v,,}" in
      y|yes) return 0 ;;
      n|no)  return 1 ;;
    esac
  done
}

run_remote(){ sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" -t "${REMOTE_USER}@${1}" "${@:2}"; }
copy_to_remote(){ sshpass -p "$REMOTE_PASS" scp "${SCP_OPTS[@]}" -r "$2" "${REMOTE_USER}@${1}:$3"; }

# Simple spinner while a command runs (quiet operations)
with_spinner(){
  local msg="$1"; shift
  echo -n "$msg "
  local sp='|/-\' i=0
  # run command in background subshell capturing exit code
  set +e
  ( "$@" ) &
  local cmd_pid=$!
  set -e
  while kill -0 "$cmd_pid" 2>/dev/null; do
    i=$(( (i+1) % 4 ))
    printf "\r%s %s" "$msg" "${sp:$i:1}"
    sleep 0.25
  done
  wait "$cmd_pid"; local rc=$?
  printf "\r%s %s\n" "$msg" "$( [[ $rc -eq 0 ]] && echo '[OK]' || echo '[FAIL]')"
  return $rc
}

wait_for_reboot_and_ssh(){
  local ip="$1"
  echo "[INFO] Waiting $REBOOT_WAIT_DOWN s for reboot..."
  sleep "$REBOOT_WAIT_DOWN"
  local t=0
  echo "[INFO] Waiting for $ip to come back (~$PING_RETRY s max)..."
  while (( t < PING_RETRY )); do
    if ping -c1 -W1 "$ip" >/dev/null 2>&1 && \
       sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" -o ConnectTimeout=3 "${REMOTE_USER}@${ip}" "echo ok" >/dev/null 2>&1; then
      echo "[OK] $ip reachable via SSH."
      return 0
    fi
    sleep "$SSH_TRY_INTERVAL"
    t=$((t+SSH_TRY_INTERVAL))
  done
  echo "[ERROR] Timeout waiting for $ip after reboot." >&2
  return 1
}

write_resolv_conf(){
  local ip="$1"
  echo "[BASELINE:$ip] Setting resolv.conf -> nameserver ${NAMESERVER}"
  run_remote "$ip" "echo ${REMOTE_PASS} | sudo -S bash -c 'echo nameserver ${NAMESERVER} > /etc/resolv.conf'"
}

backup_interfaces(){
  local ip="$1" ts; ts="$(date +%Y%m%d_%H%M%S)"
  run_remote "$ip" "echo ${REMOTE_PASS} | sudo -S cp -a /etc/network/interfaces /etc/network/interfaces.bak.${ts} || true"
}

push_interfaces_file(){
  local ip="$1" content="$2"
  echo "[BASELINE:$ip] Updating /etc/network/interfaces"
  local _tmp
  _tmp="$(mktemp)"; trap 'rm -f "$_tmp"' RETURN
  printf '%s\n' "$content" > "$_tmp"
  copy_to_remote "$ip" "$_tmp" "/tmp/interfaces.new"
  run_remote "$ip" "echo ${REMOTE_PASS} | sudo -S mv /tmp/interfaces.new /etc/network/interfaces"
}

reboot_remote(){ run_remote "$1" "echo ${REMOTE_PASS}|sudo -S reboot" || true; }

tmpl_default_to_eth1_dhcp_keep_rest(){
  local ip="$1"
  echo "[BASELINE:$ip] Switching eth1 static->dhcp"
  run_remote "$ip" "echo ${REMOTE_PASS} | sudo -S sed -i 's/iface[[:space:]]\\+eth1[[:space:]]\\+inet[[:space:]]\\+static/iface eth1 inet dhcp/' /etc/network/interfaces"
}

tmpl_internal_static_both(){
  local new_ip="$1" gw="$2"
  cat <<EOF
source-directory /etc/network/interfaces.d
auto eth0 eth1 lo
iface lo inet loopback
iface eth0 inet static
 address ${new_ip}${MASK_CIDR}
 gateway ${gw}
iface eth1 inet static
 address ${new_ip}${MASK_CIDR}
 gateway ${gw}
EOF
}

xml_set_param_value_remote(){
  local ip="$1" file="$2" name="$3" val="$4"
  run_remote "$ip" "echo ${REMOTE_PASS} | sudo -S sed -i -E 's|(name=\"${name//./\\.}\"[^>]*value=\")[^\"]*|\\1${val//\//\\/}|' ${file}"
}

inc_last_octet(){
  local ip="$1"; IFS='.' read -r a b c d <<<"$ip"
  (( d < 255 )) || { echo ""; return 1; }
  printf "%d.%d.%d.%d\n" "$a" "$b" "$c" "$((d+1))"
}

# -------------------- Robust tar-based folder push --------------------
push_hatchery_tree_via_tar() {
  local ip="$1" local_dir="$2"
  [[ -d "$local_dir" ]] || { echo "Local dir not found: $local_dir" >&2; return 2; }

  local _tar; _tar="$(mktemp /tmp/hatchery_sync.XXXXXX.tar)"
  with_spinner "[HATCHERY:$ip] Creating local hatchery tar..." tar -C "$local_dir" -cf "$_tar" . || { rm -f "$_tar"; return 2; }

  with_spinner "[HATCHERY:$ip] Uploading hatchery tar..." copy_to_remote "$ip" "$_tar" "/tmp/hatchery_sync.tar" || { rm -f "$_tar"; return 2; }

  # Extract and swap on remote (quiet, show spinner)
  with_spinner "[HATCHERY:$ip] Extracting on device..." \
    run_remote "$ip" "rm -rf ~/hatchery.tmp && mkdir -p ~/hatchery.tmp && tar -xf /tmp/hatchery_sync.tar -C ~/hatchery.tmp && rm -f /tmp/hatchery_sync.tar && rm -rf ~/hatchery && mv ~/hatchery.tmp ~/hatchery"

  rm -f "$_tar"
}

# -------------------- Tomcat service verification --------------------
verify_tomcat_service(){
  local ip="$1" svc="${2:-$TOMCAT_SVC}" port="${3:-8080}"
  local ok=1

  echo "[VERIFY:$ip] Checking systemd activity for ${svc}..."
  if run_remote "$ip" "systemctl is-active --quiet ${svc}"; then
    echo -e "\e[32m[OK]\e[0m ${svc} is active"
  else
    echo -e "\e[31m[FAIL]\e[0m ${svc} is not active"
    ok=0
  fi

  echo "[VERIFY:$ip] Checking recent journal for startup confirmation..."
  if run_remote "$ip" "journalctl -u ${svc} -n 40 --no-pager | grep -Eiq 'Tomcat started|Started Tomcat'"; then
    echo -e "\e[32m[OK]\e[0m Startup message present in journal"
  else
    echo -e "\e[33m[WARN]\e[0m No explicit 'Tomcat started' message found"
  fi

  echo "[VERIFY:$ip] Checking if port ${port} is listening..."
  if run_remote "$ip" "ss -tln 2>/dev/null | grep -q ':${port} ' || netstat -tln 2>/dev/null | grep -q ':${port} '"; then
    echo -e "\e[32m[OK]\e[0m Port ${port} is listening"
  else
    echo -e "\e[31m[FAIL]\e[0m Port ${port} not listening"
    ok=0
  fi

  echo "[VERIFY:$ip] Checking if WAR exploded into webapps..."
  if run_remote "$ip" "[ -d /var/lib/${svc}/webapps/feather ] || [ -d /var/lib/tomcat8/webapps/feather ] || [ -d /var/lib/tomcat/webapps/feather ]"; then
    echo -e "\e[32m[OK]\e[0m feather webapp directory present"
  else
    echo -e "\e[33m[WARN]\e[0m feather webapp directory not found (may still be deploying)"
  fi

  return "$ok"
}

# -------------------- Globals --------------------
POST_BASELINE_IP=""

# -------------------- Baseline --------------------
baseline_run(){
  local target_ip="$1" in_network="$2" new_ip="" gw post_ip

  if [[ "$in_network" == y ]]; then
    read -rp "New IP address after setup (e.g., 10.0.1.10): " new_ip
    is_ipv4 "$new_ip" || { echo "Invalid IPv4: $new_ip" >&2; return 2; }
    read -rp "Gateway [${GATEWAY_DEFAULT}]: " gw; gw="${gw:-$GATEWAY_DEFAULT}"
    is_ipv4 "$gw" || { echo "Invalid gateway IPv4: $gw" >&2; return 2; }
    post_ip="$new_ip"
    push_interfaces_file "$target_ip" "$(tmpl_internal_static_both "$new_ip" "$gw")"
  else
    tmpl_default_to_eth1_dhcp_keep_rest "$target_ip"; post_ip="$target_ip"
  fi

  write_resolv_conf "$target_ip"
  reboot_remote "$target_ip"
  wait_for_reboot_and_ssh "$post_ip" || return 3

  copy_to_remote "$post_ip" "$DEPLOY_TAR_SRC" "$REMOTE_TAR_DST"
  run_remote "$post_ip" "cd ${REMOTE_HOME} && tar -xf ${REMOTE_TAR_DST}"

  if [[ "$in_network" != y ]]; then
    while :; do read -rp "Is internet provided on LAN2? (y to proceed): " a; [[ "${a,,}" == y ]] && break; done
  fi

  set +e
  run_remote "$post_ip" "cd ${REMOTE_DEPLOY_DIR} && chmod +x featherScript.sh && ./featherScript.sh"
  set -e

  wait_for_reboot_and_ssh "$post_ip" || return 4
  POST_BASELINE_IP="$post_ip"

  while :; do
    read -rp "Perform Hatchery now? (y/n): " q
    case "${q,,}" in
      y*) hatchery_run "$POST_BASELINE_IP"; return ;;
      n*) return ;;
    esac
  done
}

# -------------------- Hatchery --------------------
hatchery_run(){
  local ip="$1"
  read -rp "Segment Index (Lineup#*100+segment#+1): " seg
  [[ "$seg" =~ ^[0-9]+$ ]] || { echo "Segment Index must be integer." >&2; return 2; }
  read -rp "Feather type (CS/ES): " ft; ft="${ft^^}"
  [[ "$ft" =~ ^(CS|ES)$ ]] || { echo "Feather type must be CS or ES." >&2; return 2; }

  local new_io; new_io="$(inc_last_octet "$ip")" || { echo "Cannot compute iologik IP from $ip" >&2; return 2; }

  echo "[HATCHERY:$ip] Syncing full hatchery package via tar..."
  push_hatchery_tree_via_tar "$ip" "$LOCAL_HATCHERY_PATH"

  local ts; ts="$(date +%Y%m%d_%H%M%S)"
  run_remote "$ip" "cd ~/hatchery && for f in fourbaidentity.json feather.json feather.xml; do [ -f \$f ] && cp -a \$f \$f.bak.${ts}; done"

  run_remote "$ip" "cd ~/hatchery && jq --argjson idx ${seg} '.featherIndex=\$idx' fourbaidentity.json > tmp && mv tmp fourbaidentity.json"
  run_remote "$ip" "cd ~/hatchery && jq --argjson idx ${seg} '.featherIndex=\$idx' feather.json > tmp && mv tmp feather.json"
  run_remote "$ip" "cd ~/hatchery && sed -i 's/\"202\"/${seg}/g;s/: 202/: ${seg}/g' fourbaidentity.json feather.json"

  run_remote "$ip" "sed -i 's|10\\.0\\.2\\.11|${new_io}|g' ~/hatchery/feather.xml"

  if [[ "$ft" == ES ]]; then
    xml_set_param_value_remote "$ip" "~/hatchery/feather.xml" "feather.modbusv1.poller.serialConnectionType" "rxtx"
    xml_set_param_value_remote "$ip" "~/hatchery/feather.xml" "feather.modbusv1.poller.serialPortName" "/dev/ttyUSB0"
  else
    xml_set_param_value_remote "$ip" "~/hatchery/feather.xml" "feather.modbusv1.poller.serialConnectionType" "pjc"
    xml_set_param_value_remote "$ip" "~/hatchery/feather.xml" "feather.modbusv1.poller.serialPortName" "/dev/ttyM0"
  fi

  run_remote "$ip" "cp -f ~/hatchery/hatchery_configure_feather_powin.sh ~; cp -f ~/hatchery/hatchery_install_war.sh ~; chmod +x ~/hatchery/*.sh ~/hatchery/cronScripts/*.sh ~/hatchery_configure_feather_powin.sh ~/hatchery_install_war.sh"

  echo "[HATCHERY:$ip] Running configure script (this may take a while)..."
  run_remote "$ip" "cd ~ && echo ${REMOTE_PASS}|sudo -S ./hatchery_configure_feather_powin.sh"

  echo "[HATCHERY:$ip] Installing WAR and restarting ${TOMCAT_SVC}..."
  run_remote "$ip" "cd ~ && echo ${REMOTE_PASS}|sudo -S ./hatchery_install_war.sh hatchery/feather.war hatchery/feather.xml"
  run_remote "$ip" "echo ${REMOTE_PASS}|sudo -S service ${TOMCAT_SVC} restart"

  echo "[HATCHERY:$ip] Verifying Tomcat service health..."
  if verify_tomcat_service "$ip" "$TOMCAT_SVC" 8080; then
    echo -e "\e[32m[SUCCESS]\e[0m Tomcat (${TOMCAT_SVC}) is up and serving on :8080"
  else
    echo -e "\e[31m[ERROR]\e[0m Tomcat health verification failed. Showing last 60 log lines:"
    run_remote "$ip" "journalctl -u ${TOMCAT_SVC} -n 60 --no-pager || sudo tail -n 60 /var/log/${TOMCAT_SVC}/catalina.out || true"
  fi
}

# -------------------- Main Menu --------------------
main(){
  echo "=== MOXA Feather Setup ==="
  read -rp "Is device at default IP (${DEFAULT_IP})? (y/n) [y]: " d; d="${d:-y}"; d="${d,,}"
  local ip="${DEFAULT_IP}"; [[ "$d" != y ]] && read -rp "Enter target IP: " ip
  is_ipv4 "$ip" || { echo "Invalid IPv4: $ip" >&2; exit 2; }

  read -rp "Network type (in/external) [in]: " nm; nm="${nm:-in}"; nm="${nm,,}"

  echo
  echo "Select operation:"
  echo "  1) Baseline only"
  echo "  2) Hatchery only"
  echo "  3) Both (Baseline -> Hatchery)"
  read -rp "Enter 1/2/3 [3]: " s; s="${s:-3}"

  echo
  confirm "Proceed with ${ip}?" || exit 0

  if ! sshpass -p "$REMOTE_PASS" ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${ip}" "echo ok" >/dev/null 2>&1; then
    echo "SSH test failed to ${ip}. Check network/creds." >&2
    exit 3
  fi

  case "$s" in
    1) baseline_run "$ip" "$([[ "$nm" == in ]] && echo y || echo n)" ;;
    2) hatchery_run "$ip" ;;
    3) baseline_run "$ip" "$([[ "$nm" == in ]] && echo y || echo n)"; hatchery_run "${POST_BASELINE_IP:-$ip}" ;;
    *) echo "Invalid selection."; exit 2 ;;
  esac
}

main "$@"
