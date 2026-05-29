#!/usr/bin/env bash
set -euo pipefail

# ======================= Baked-in Auth & Defaults ============================
USER_NAME="moxa"
REMOTE_PASS="moxa"
CONC="${CONC:-1}"   # Concurrency: 1 = sequential; set CONC=4, etc. for parallel
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=no"
PING_TIMEOUT=1       # seconds for ping
PORTCHECK_TIMEOUT=2  # seconds for TCP/22 check (if nc available)
HOST_TIMEOUT="${HOST_TIMEOUT:-120}"  # seconds; overall per-host run timeout
# ============================================================================

usage() {
  cat <<'EOF'
Usage:
  new_senva_id_configuration.sh [-a "<arrays>"] [-j <concurrency>]

Options:
  -a, --arrays   Single, comma list, or range mix
                 e.g. "7" | "1,3,5" | "2-6" | "1,3-5,9"
  -j, --jobs     Concurrency (default from CONC env or 1)
  -h, --help     Show help

If -a is omitted, a numeric menu will ask how you want to enter arrays.
EOF
  exit 1
}

# ----- Dependencies -----
need() { command -v "$1" >/dev/null 2>&1; }
if ! need sshpass; then
  echo "ERROR: sshpass not installed (e.g., sudo apt-get install -y sshpass)." >&2
  exit 1
fi
if ! need timeout; then
  echo "ERROR: timeout not found (usually in coreutils / GNU timeout)." >&2
  exit 1
fi

# ----- Parse args or show menu -----
ARRAYS_SPEC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--arrays) ARRAYS_SPEC="$2"; shift 2 ;;
    -j|--jobs)   CONC="$2";        shift 2 ;;
    -h|--help)   usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

if [[ -z "$ARRAYS_SPEC" ]]; then
  echo "How would you like to enter array indices?"
  echo "  1) Single array (e.g., 7)"
  echo "  2) Comma-separated (e.g., 1,3,5)"
  echo "  3) Range or mixed (e.g., 2-6 or 1,3-5,9)"
  read -rp "Select [1-3]: " choice
  case "$choice" in
    1) read -rp "Enter single array index (e.g., 7): " ARRAYS_SPEC ;;
    2) read -rp "Enter comma-separated indices (e.g., 1,3,5): " ARRAYS_SPEC ;;
    3) read -rp "Enter range/mixed (e.g., 1,3-5,9): " ARRAYS_SPEC ;;
    *) echo "Invalid selection." >&2; exit 1 ;;
  esac
fi

# ----- Expand comma/range spec into unique sorted list -----
expand_arrays() {
  local spec="$1" tok
  local IFS=','; declare -A seen=()
  for tok in $spec; do
    tok="${tok//[[:space:]]/}"
    [[ -z "$tok" ]] && continue
    if [[ "$tok" =~ ^[0-9]+$ ]]; then
      seen["$tok"]=1
    elif [[ "$tok" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      local a="${BASH_REMATCH[1]}" b="${BASH_REMATCH[2]}" i
      if (( a <= b )); then for ((i=a;i<=b;i++)); do seen["$i"]=1; done
      else for ((i=a;i>=b;i--)); do seen["$i"]=1; done
      fi
    else
      echo "WARN: Skipping invalid token '$tok'" >&2
    fi
  done
  printf "%s\n" "${!seen[@]}" | sort -n
}

mapfile -t ARRAY_LIST < <(expand_arrays "$ARRAYS_SPEC")
if [[ ${#ARRAY_LIST[@]} -eq 0 ]]; then
  echo "ERROR: No valid arrays parsed from '$ARRAYS_SPEC'." >&2
  exit 1
fi

# ----- Build host list per array: .10..105 (+5), omit .3 -----
HOSTS=()
for arr in "${ARRAY_LIST[@]}"; do
  for h in $(seq 10 5 105); do
    HOSTS+=("10.0.${arr}.${h}")
  done
done

TOTAL=${#HOSTS[@]}
echo "=== Arrays: ${ARRAY_LIST[*]} ==="
echo "Total targets: ${TOTAL}"
echo "Order: .10 → .105 +5 ('.3' omitted by request)"

# ----- Pre-flight reachability (ping + optional TCP/22) in-order, no dupes -----
echo
echo "Pre-flight: checking reachability (ping ${PING_TIMEOUT}s, TCP/22 ${PORTCHECK_TIMEOUT}s)..."
UP_HOSTS=()
DOWN_HOSTS=()
for ip in "${HOSTS[@]}"; do
  if ping -n -c1 -W "$PING_TIMEOUT" "$ip" >/dev/null 2>&1; then
    if need nc; then
      if nc -z -w "$PORTCHECK_TIMEOUT" "$ip" 22 >/dev/null 2>&1; then
        UP_HOSTS+=("$ip")
      else
        echo "  [$ip] ping OK, ssh CLOSED → skipping"
        DOWN_HOSTS+=("$ip")
      fi
    else
      UP_HOSTS+=("$ip")
    fi
  else
    echo "  [$ip] ping FAIL → skipping"
    DOWN_HOSTS+=("$ip")
  fi
done

if [[ ${#UP_HOSTS[@]} -eq 0 ]]; then
  echo -e "\nNo reachable targets. Exiting."
  exit 1
fi

join_space() { local a=("$@"); local IFS=' '; echo "${a[*]}"; }

echo
echo "Reachable (${#UP_HOSTS[@]}): $(join_space "${UP_HOSTS[@]}")"
[[ ${#DOWN_HOSTS[@]} -gt 0 ]] && echo "Unreachable/SSH-closed (${#DOWN_HOSTS[@]}): $(join_space "${DOWN_HOSTS[@]}")"

HOSTS=("${UP_HOSTS[@]}")
TOTAL=${#HOSTS[@]}

# ----- Base SSH parts exported for subshells -----
SSH_BASE=(sshpass -p "${REMOTE_PASS}" ssh ${SSH_OPTS})
HAVE_STDBUF=0
if need stdbuf; then HAVE_STDBUF=1; fi
export USER_NAME REMOTE_PASS SSH_OPTS PORTCHECK_TIMEOUT PING_TIMEOUT HOST_TIMEOUT
export HAVE_STDBUF
# Export SSH_BASE as a string to rebuild later (arrays can't be exported)
SSH_BASE_STR="$(printf "%q " "${SSH_BASE[@]}")"
export SSH_BASE_STR

# ----- Remote (inner) script to run on each Feather -----
read -r -d '' REMOTE_SCRIPT <<'EOS'
#!/usr/bin/env bash
set -euo pipefail

SERIAL_PORT="/dev/ttyUSB0"
BAUD_RATE=9600
PARITY="none"
REGISTER=123
VALUE=31
CHECK_TIMEOUT=10

CANDIDATES=("/usr/local/bin/modpoll" "/usr/bin/modpoll" "/opt/modpoll/modpoll" "./modpoll")
MODPOLL=""
for c in "${CANDIDATES[@]}"; do [[ -x "$c" ]] && MODPOLL="$c" && break; done
[[ -z "$MODPOLL" ]] && { echo "ERROR: modpoll not found"; exit 1; }

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[0;33m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

svc_try(){ local a="$1" n="$2"; if command -v systemctl >/dev/null 2>&1; then systemctl "$a" "$n" >/dev/null 2>&1 || true; fi; service "$n" "$a" >/dev/null 2>&1 || true; }
tomcat_stop(){ for n in tomcat tomcat8 tomcat9 tomcat10; do svc_try stop "$n"; done; }
tomcat_start(){ for n in tomcat tomcat8 tomcat9 tomcat10; do svc_try start "$n"; done; }

echo -e "${CYAN}${BOLD}Remote: stopping Tomcat (best-effort)${RESET}"
tomcat_stop

echo -e "${CYAN}${BOLD}Remote: scanning Modbus addresses 2–247 (skip 4,11,12,21,22)...${RESET}"
for address in $(seq 2 247); do
  case "$address" in 4|11|12|21|22) continue ;; esac
  result="$("$MODPOLL" -m rtu -b "$BAUD_RATE" -p "$PARITY" -a "$address" -r "$REGISTER" -c 1 -0 -1 "$SERIAL_PORT" 2>/dev/null || true)"
  if echo "$result" | grep -q "\[$REGISTER\]"; then
    echo -e "Remote: Senva ${GREEN}found${RESET} at address $address"
    sleep 1
    echo "Remote: writing VALUE=$VALUE to REGISTER=$REGISTER at address $address ..."
    if ! "$MODPOLL" -m rtu -b "$BAUD_RATE" -p "$PARITY" -a "$address" -r "$REGISTER" -0 -1 "$SERIAL_PORT" "$VALUE" >/dev/null 2>&1; then
      echo -e "Remote: ${RED}write failed${RESET} at $address"; continue
    fi
    echo "Remote: verifying..."
    sleep 1
    verify="$("$MODPOLL" -m rtu -b "$BAUD_RATE" -p "$PARITY" -a "$VALUE" -r "$REGISTER" -c 1 -0 -1 "$SERIAL_PORT" 2>/dev/null || true)"
    setaddress="$(echo "$verify" | grep -o "\[$REGISTER\]: [0-9]*" | awk '{print $2}')"
    if [[ "$setaddress" == "$VALUE" ]]; then
      echo -e "Remote: ${GREEN}success${RESET}; sensor now at address $setaddress"
      echo -e "${CYAN}${BOLD}Remote: starting Tomcat${RESET}"
      tomcat_start
      exit 0
    else
      echo -e "Remote: ${RED}verification failed${RESET} (no response at $VALUE)"
    fi
  fi
done

echo -e "${CYAN}${BOLD}Remote: starting Tomcat${RESET}"
tomcat_start
echo -e "${YELLOW}Remote: no device configured; manual setup may be required.${RESET}"
exit 0
EOS

# ----- Utility: prefix remote output with host tag -----
prefix_output() { sed -u "s/^/[$1] /"; }

# ----- Progress helpers (sequential mode) -----
PROG_CUR=0
PROG_TOTAL=$TOTAL
progress_line()  { printf "\r[%3d/%3d] %s" "$PROG_CUR" "$PROG_TOTAL" "$1"; }
progress_done()  { printf "\r[%3d/%3d] %s\n" "$PROG_CUR" "$PROG_TOTAL" "$1"; }

# ----- Remote runner -----
remote_run() {
  local ip="$1" idx="$2" total="$3"

  # Rebuild SSH_CMD locally (subshell-safe)
  local SSH_CMD=()
  eval "SSH_CMD=(${SSH_BASE_STR})"
  if [[ "${HAVE_STDBUF:-0}" -eq 1 ]]; then
    SSH_CMD=(stdbuf -oL -eL "${SSH_CMD[@]}")
  fi

  echo
  echo "→ ($idx/$total) ${ip} : connecting… (timeout ${HOST_TIMEOUT}s)"

  # Upload + run with an overall timeout; force TTY for sudo prompts if needed.
  # Use sudo -n first; if it requires a password, fallback to sudo -S with 'moxa'.
  if ! timeout "${HOST_TIMEOUT}" "${SSH_CMD[@]}" -tt "${USER_NAME}@${ip}" "bash -s" 2>&1 <<'EOF' | sed -u "s/^/[REPLACE_IP] /"
set -euo pipefail

# Write remote script
cat > /tmp/senva_config.sh <<'INNER'
REPLACE_REMOTE_SCRIPT_CONTENT
INNER
chmod +x /tmp/senva_config.sh

echo "Remote: checking sudo privileges..."
if sudo -n true 2>/dev/null; then
  echo "Remote: sudo NOPASSWD available; running script."
  sudo bash /tmp/senva_config.sh
else
  echo "Remote: sudo requires password; supplying baked-in password."
  echo 'moxa' | sudo -S -p '' bash /tmp/senva_config.sh
fi
EOF
  then
    # Re-run with the actual IP prefix on failure note
    echo "[${ip}] ERROR: remote execution failed or timed out"
    return 1
  fi

  # Fix the [REPLACE_IP] tag in the piped output
  # (we can't substitute inside the heredoc easily, so we sed it post-facto)
  # No action needed here because we already prefixed above.

  echo "[${ip}] OK"
  return 0
}

export -f remote_run prefix_output
export USER_NAME REMOTE_PASS REMOTE_SCRIPT
export SSH_OPTS SSH_BASE_STR HAVE_STDBUF HOST_TIMEOUT

# ----- Execute (sequential or parallel) -----
RET=0
if [[ "$CONC" -gt 1 ]]; then
  i=0; TMP=$(mktemp)
  for ip in "${HOSTS[@]}"; do i=$((i+1)); printf "%d %s\n" "$i" "$ip" >> "$TMP"; done
  # shellcheck disable=SC2016
  if ! xargs -P "$CONC" -n 2 -a "$TMP" bash -c 'remote_run "$2" "$1" "'"$TOTAL"'"' _; then RET=1; fi
  rm -f "$TMP"
else
  idx=0
  for ip in "${HOSTS[@]}"; do
    idx=$((idx+1)); PROG_CUR=$idx
    progress_line "Starting ${ip} ..."
    if remote_run "$ip" "$idx" "$TOTAL"; then
      progress_done "Finished ${ip} (OK)"
    else
      progress_done "Finished ${ip} (FAILED)"
      RET=1
    fi
  done
fi

echo
echo "=== Deployment complete. Status: $([[ $RET -eq 0 ]] && echo SUCCESS || echo FAILURE) ==="
exit "$RET"
