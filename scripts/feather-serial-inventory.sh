#!/usr/bin/env bash
set -uo pipefail

# Standalone Feather serialConnectionType inventory and change utility.
# Read-only unless --set rxtx|pjc|rodbus is supplied.

XML_PATH='/var/lib/tomcat8/conf/Catalina/localhost/feather.xml'
PARAMETER='feather.modbusv1.poller.serialConnectionType'
SSH_USER='moxa'
ARRAYS='1-8'
ES_COUNT=20
ES_START=10
ES_STEP=5
MODE='scan'
DESIRED=''
TARGET_FILE=''
ONLY_ARRAY=''
WAIT_SECONDS=90
SSH_PASSWORD="${SSH_PASSWORD:-}"
SUDO_PASSWORD="${SUDO_PASSWORD:-}"
INTERACTIVE=0
INTERACTIVE_TARGETS=''
OUTPUT_FORMAT='table'

usage() {
  echo "Usage: $0 [--scan] [--set rxtx|pjc|rodbus] [--arrays 1-8] [--array 3] [--es-count 20] [--targets-file ips.txt] [--user moxa] [--csv]"
  echo "Run with no options in a terminal for the guided technician workflow."
  echo "Defaults: scan Array 1-8 Collection Segment (.3) and 20 Energy Segments (.10, .15 ... .105)."
  echo "The SSH login password may be supplied through SSH_PASSWORD or entered securely when prompted."
}

prompt_value() {
  local message=$1 answer
  printf '%s' "$message" >&2
  IFS= read -r answer </dev/tty || exit 130
  printf '%s' "$answer"
}

show_intro() {
  local bold=$'\033[1m' dim=$'\033[2m' green=$'\033[32m' yellow=$'\033[33m' red=$'\033[31m' white=$'\033[37m' reset=$'\033[0m'
  command -v clear >/dev/null 2>&1 && clear || true
  cat >&2 <<EOF
${green}
.·:'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''':·.
: :   GREENERGY PRIZM · FEATHER SERIAL CONNECTION SERVICE TOOL                              : :
'·:........................................................................................:·'
${reset}
${bold}${green}GreEnergy Resources LLC${reset}
${dim}${white}Feather Inventory, serialConnectionType Update, and Tomcat 8 Verification${reset}

${bold}${yellow}SERVICE NOTICE${reset}
${white}This utility can inspect or modify the serial connection mode in feather.xml on
selected live Feather controllers. A change creates a timestamped backup and
restarts Tomcat 8 on each changed device. Telemetry from that Feather can be
temporarily unavailable while the service recovers.${reset}

${bold}${red}Before changing devices:${reset}
${white}• Verify the site, array, and Feather targets.
• Confirm the requested mode is appropriate: rxtx, pjc, or rodbus.
• Do not interrupt the utility during file replacement or Tomcat restart.
• Review every failed or unreachable result before leaving the workflow.${reset}

${dim}${white}Already-correct devices are not modified. Changed devices are allowed up to
${WAIT_SECONDS} seconds to recover and are verified after restart.${reset}
EOF
  prompt_value $'\nPress Enter to acknowledge and continue...' >/dev/null
}

interactive_setup() {
  local choice scope value
  if [[ "${PRIZM_FEATHER_NOTICE_ACKNOWLEDGED:-0}" != 1 ]]; then
    show_intro
    export PRIZM_FEATHER_NOTICE_ACKNOWLEDGED=1
  else
    command -v clear >/dev/null 2>&1 && clear || true
    printf '\nGREENERGY PRIZM · FEATHER SERIAL CONNECTION SERVICE TOOL\n' >&2
  fi
  printf '\n%s\n' 'Choose an operation:' >&2
  printf '%s\n' '  1) Scan inventory only' '  2) Change serial connection type' '  3) Exit' >&2
  choice=$(prompt_value 'Selection [1]: ')
  case "${choice:-1}" in
    1) MODE='scan' ;;
    2)
      MODE='set'
      printf '\n%s\n' 'Choose the new serial connection type:' '  1) rxtx' '  2) pjc' '  3) rodbus' >&2
      value=$(prompt_value 'Selection: ')
      case "$value" in 1) DESIRED='rxtx' ;; 2) DESIRED='pjc' ;; 3) DESIRED='rodbus' ;; *) echo 'Invalid mode selection.' >&2; exit 2 ;; esac
      ;;
    3) echo 'Cancelled.' >&2; exit 0 ;;
    *) echo 'Invalid operation selection.' >&2; exit 2 ;;
  esac

  printf '\n%s\n' 'Choose target scope:' >&2
  printf '%s\n' '  1) Entire site' '  2) One array' '  3) Array range' '  4) Specific Feather IP address(es)' >&2
  scope=$(prompt_value 'Selection [1]: ')
  case "${scope:-1}" in
    1) ;;
    2) ONLY_ARRAY=$(prompt_value 'Array number: ') ;;
    3) ARRAYS=$(prompt_value 'Array range (example 2-5): ') ;;
    4) INTERACTIVE_TARGETS=$(prompt_value 'Feather IPs, separated by commas: ') ;;
    *) echo 'Invalid target selection.' >&2; exit 2 ;;
  esac

  value=$(prompt_value "Energy segments per array [$ES_COUNT]: ")
  [[ -z "$value" ]] || ES_COUNT=$value
  printf '\nOperation: %s\n' "$MODE${DESIRED:+ → $DESIRED}" >&2
  if [[ -n "$INTERACTIVE_TARGETS" ]]; then
    printf 'Scope: specific Feather targets (%s)\n\n' "$INTERACTIVE_TARGETS" >&2
  elif [[ -n "$ONLY_ARRAY" ]]; then
    printf 'Scope: Array %s\n\n' "$ONLY_ARRAY" >&2
  else
    printf 'Scope: Arrays %s\n\n' "$ARRAYS" >&2
  fi
}

return_to_menu() {
  local choice
  [[ "$INTERACTIVE" -eq 1 ]] || return 1
  printf '\n' >&2
  choice=$(prompt_value 'Press Enter to return to the main menu, or type Q to exit: ')
  case "$choice" in
    q|Q) unset SSHPASS; echo 'Session complete.' >&2; exit 0 ;;
    *)
      # Begin a clean operation without repeating the acknowledged notice.
      # Credentials are intentionally not carried into the next operation.
      unset SSHPASS SSH_PASSWORD SUDO_PASSWORD
      exec "$0"
      ;;
  esac
}

[[ $# -eq 0 && -t 0 && -t 1 ]] && INTERACTIVE=1

while (($#)); do
  case "$1" in
    --scan) MODE='scan'; shift ;;
    --set) MODE='set'; DESIRED="${2:-}"; shift 2 ;;
    --arrays) ARRAYS="${2:-}"; shift 2 ;;
    --array) ONLY_ARRAY="${2:-}"; shift 2 ;;
    --es-count) ES_COUNT="${2:-}"; shift 2 ;;
    --targets-file) TARGET_FILE="${2:-}"; shift 2 ;;
    --user) SSH_USER="${2:-}"; shift 2 ;;
    --wait) WAIT_SECONDS="${2:-}"; shift 2 ;;
    --csv) OUTPUT_FORMAT='csv'; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

[[ "$INTERACTIVE" -eq 1 ]] && interactive_setup

if [[ "$MODE" == set && ! "$DESIRED" =~ ^(rxtx|pjc|rodbus)$ ]]; then
  echo "--set must be rxtx, pjc, or rodbus" >&2
  exit 2
fi
if ! [[ "$ES_COUNT" =~ ^[0-9]+$ && "$ES_START" =~ ^[0-9]+$ && "$ES_STEP" =~ ^[0-9]+$ ]]; then
  echo "Invalid site dimensions." >&2
  exit 2
fi
if ! [[ "$SSH_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$ && "$WAIT_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "Invalid SSH user or wait period." >&2
  exit 2
fi

valid_ip() {
  local ip=$1 a b array host
  IFS=. read -r a b array host <<< "$ip"
  [[ "$a" == 10 && "$b" == 0 && "$array" =~ ^[0-9]+$ && "$array" -ge 1 && "$array" -le 254 && "$host" =~ ^[0-9]+$ ]] || return 1
  [[ "$host" -eq 3 || ( "$host" -ge 10 && "$host" -le 110 && $(((host - 10) % 5)) -eq 0 ) ]]
}

targets=()
if [[ -n "$INTERACTIVE_TARGETS" ]]; then
  IFS=',' read -r -a targets <<< "$INTERACTIVE_TARGETS"
  for index in "${!targets[@]}"; do targets[$index]="${targets[$index]//[[:space:]]/}"; done
elif [[ -n "$TARGET_FILE" ]]; then
  [[ -r "$TARGET_FILE" ]] || { echo "Cannot read $TARGET_FILE" >&2; exit 2; }
  while IFS= read -r ip; do
    ip="${ip%%#*}"; ip="${ip//[[:space:]]/}"
    [[ -z "$ip" ]] || targets+=("$ip")
  done < "$TARGET_FILE"
else
  start=${ARRAYS%-*}; end=${ARRAYS#*-}
  [[ -n "$ONLY_ARRAY" ]] && start=$ONLY_ARRAY && end=$ONLY_ARRAY
  if ! [[ "$start" =~ ^[0-9]+$ && "$end" =~ ^[0-9]+$ && "$start" -ge 1 && "$end" -ge "$start" && "$end" -le 254 ]]; then
    echo "Invalid array range." >&2
    exit 2
  fi
  for ((array=start; array<=end; array++)); do
    targets+=("10.0.${array}.3")
    for ((segment=1; segment<=ES_COUNT; segment++)); do
      host=$((ES_START + (segment - 1) * ES_STEP))
      targets+=("10.0.${array}.${host}")
    done
  done
fi

[[ ${#targets[@]} -gt 0 ]] || { echo "No Feather targets were selected." >&2; exit 2; }

for ip in "${targets[@]}"; do
  valid_ip "$ip" || { echo "Refusing unsupported Feather target: $ip" >&2; exit 2; }
done

ssh_base=(-o ConnectTimeout=5 -o ConnectionAttempts=1 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
if [[ -z "$SSH_PASSWORD" ]]; then
  read -r -s -p "SSH login password for $SSH_USER: " SSH_PASSWORD
  echo
fi
[[ -n "$SSH_PASSWORD" ]] || { echo "An SSH login password is required." >&2; exit 2; }
command -v sshpass >/dev/null 2>&1 || { echo "Password-based SSH requires sshpass." >&2; exit 2; }
ssh_run=(sshpass -e ssh "${ssh_base[@]}" -o BatchMode=no -o PreferredAuthentications=keyboard-interactive,password -o PubkeyAuthentication=no -o PasswordAuthentication=yes -o KbdInteractiveAuthentication=yes -o NumberOfPasswordPrompts=1)
export SSHPASS="$SSH_PASSWORD"

scan_one() {
  local ip=$1 output
  output=$("${ssh_run[@]}" "$SSH_USER@$ip" "xml='$XML_PATH'; param='$PARAMETER'; if [ -r \"\$xml\" ]; then value=\$(sed -n 's/.*name=\"'\"\$param\"'\"[^>]*value=\"\\([^\"]*\\)\".*/\\1/p' \"\$xml\" | head -n 1); else value=UNREADABLE; fi; status=\$(systemctl is-active tomcat8 2>/dev/null || true); [ -n \"\$status\" ] || { service tomcat8 status >/dev/null 2>&1 && status=active || status=inactive; }; printf '%s,%s,%s\n' '$ip' \"\$value\" \"\$status\"" 2>/dev/null) || output="$ip,UNREACHABLE,unknown"
  printf '%s\n' "$output"
}

print_inventory_header() {
  printf '%-7s %-9s %-15s %-24s %-12s %s\n' 'ARRAY' 'SEGMENT' 'IP ADDRESS' 'SERIAL CONNECTION TYPE' 'TOMCAT 8' 'RESULT'
  printf '%-7s %-9s %-15s %-24s %-12s %s\n' '-------' '---------' '---------------' '------------------------' '------------' '------'
}

print_inventory_row() {
  local record=$1 ip value tomcat _a _b array host segment result
  IFS=',' read -r ip value tomcat <<< "$record"
  IFS=. read -r _a _b array host <<< "$ip"
  if [[ "$host" == 3 ]]; then segment='CS'; else segment="ES$(((host - ES_START) / ES_STEP + 1))"; fi
  result='OK'
  [[ "$value" == UNREACHABLE ]] && result='SSH unreachable'
  [[ "$value" == UNREADABLE ]] && result='feather.xml unreadable'
  [[ "$tomcat" == active ]] || result="${result/OK/Check service}"
  printf '%-7s %-9s %-15s %-24s %-12s %s\n' "$array" "$segment" "$ip" "$value" "$tomcat" "$result"
}

if [[ "$OUTPUT_FORMAT" == csv ]]; then
  echo 'IP,SERIAL_CONNECTION_TYPE,TOMCAT8'
else
  printf '\nFEATHER INVENTORY\n'
  print_inventory_header
fi
for ip in "${targets[@]}"; do
  inventory_record=$(scan_one "$ip")
  if [[ "$OUTPUT_FORMAT" == csv ]]; then printf '%s\n' "$inventory_record"; else print_inventory_row "$inventory_record"; fi
done

if [[ "$MODE" == scan ]]; then
  return_to_menu || true
  exit 0
fi

echo
echo "Applying $DESIRED to ${#targets[@]} target(s). Already-correct targets will be skipped; changed targets will be backed up and Tomcat 8 restarted."
if [[ -z "$SUDO_PASSWORD" ]]; then
  read -r -s -p "Remote sudo password (leave blank for passwordless sudo): " SUDO_PASSWORD
  echo
fi

changed=0; skipped=0; failed=0
if [[ "$OUTPUT_FORMAT" == table ]]; then
  printf '\nCHANGE AND VERIFICATION RESULTS\n'
  printf '%-15s %-10s %-10s %-10s %-12s %s\n' 'IP ADDRESS' 'ACTION' 'BEFORE' 'AFTER' 'TOMCAT 8' 'DETAIL'
  printf '%-15s %-10s %-10s %-10s %-12s %s\n' '---------------' '----------' '----------' '----------' '------------' '------'
fi
for ip in "${targets[@]}"; do
  current=$(scan_one "$ip")
  value=$(printf '%s' "$current" | cut -d, -f2)
  tomcat=$(printf '%s' "$current" | cut -d, -f3)
  if [[ "$value" == "$DESIRED" ]]; then
    if [[ "$tomcat" == active ]]; then
      if [[ "$OUTPUT_FORMAT" == table ]]; then printf '%-15s %-10s %-10s %-10s %-12s %s\n' "$ip" 'SKIPPED' "$value" "$value" 'active' 'Already configured'; else echo "$ip,SKIPPED,$value,$value,active,Already configured"; fi
      ((skipped+=1))
    else
      if [[ "$OUTPUT_FORMAT" == table ]]; then printf '%-15s %-10s %-10s %-10s %-12s %s\n' "$ip" 'FAILED' "$value" "$value" "$tomcat" 'Already configured; Tomcat inactive'; else echo "$ip,FAILED,$value,$value,$tomcat,Tomcat inactive"; fi
      ((failed+=1))
    fi
    continue
  fi
  if [[ "$value" == UNREACHABLE || "$value" == UNREADABLE || -z "$value" ]]; then
    if [[ "$OUTPUT_FORMAT" == table ]]; then printf '%-15s %-10s %-10s %-10s %-12s %s\n' "$ip" 'FAILED' "$value" '-' "$tomcat" 'Preflight failed'; else echo "$ip,FAILED,$value,,$tomcat,Preflight failed"; fi
    ((failed+=1))
    continue
  fi
  remote="xml='$XML_PATH'; matches=\$(grep -c 'name=\"$PARAMETER\"' \"\$xml\" || true); test \"\$matches\" -eq 1 || exit 21; stamp=\$(date -u +%Y%m%dT%H%M%SZ); cp -p \"\$xml\" \"\$xml.prizm-backup-\$stamp\"; tmp=\$(mktemp /tmp/prizm-feather-xml.XXXXXX); sed 's/\\(name=\"${PARAMETER//./\\.}\"[^>]*value=\"\\)[^\"]*/\\1$DESIRED/' \"\$xml\" > \"\$tmp\"; install -o \$(stat -c %u \"\$xml\") -g \$(stat -c %g \"\$xml\") -m \$(stat -c %a \"\$xml\") \"\$tmp\" \"\$xml\"; rm -f \"\$tmp\"; systemctl restart tomcat8 2>/dev/null || service tomcat8 restart; elapsed=0; status=unknown; while [ \"\$elapsed\" -lt '$WAIT_SECONDS' ]; do status=\$(systemctl is-active tomcat8 2>/dev/null || true); if [ -z \"\$status\" ]; then service tomcat8 status >/dev/null 2>&1 && status=active || status=inactive; fi; [ \"\$status\" = active ] && break; sleep 5; elapsed=\$((elapsed + 5)); done; test \"\$status\" = active"
  encoded=$(printf '%s' "$remote" | base64 | tr -d '\n')
  if printf '%s\n' "$SUDO_PASSWORD" | "${ssh_run[@]}" "$SSH_USER@$ip" "sudo -S -p '' sh -c \"\$(printf '%s' '$encoded' | base64 -d)\"" >/dev/null 2>&1; then
    verify=$(scan_one "$ip")
    if [[ "$(printf '%s' "$verify" | cut -d, -f2)" == "$DESIRED" && "$(printf '%s' "$verify" | cut -d, -f3)" == active ]]; then
      if [[ "$OUTPUT_FORMAT" == table ]]; then printf '%-15s %-10s %-10s %-10s %-12s %s\n' "$ip" 'CHANGED' "$value" "$DESIRED" 'active' 'Configuration and restart verified'; else echo "$ip,CHANGED,$value,$DESIRED,active,Verified"; fi
      ((changed+=1))
    else
      if [[ "$OUTPUT_FORMAT" == table ]]; then printf '%-15s %-10s %-10s %-10s %-12s %s\n' "$ip" 'FAILED' "$value" "$DESIRED" 'unknown' "Verification: $verify"; else echo "$ip,FAILED,$value,$DESIRED,unknown,$verify"; fi
      ((failed+=1))
    fi
  else
    if [[ "$OUTPUT_FORMAT" == table ]]; then printf '%-15s %-10s %-10s %-10s %-12s %s\n' "$ip" 'FAILED' "$value" "$DESIRED" 'unknown' 'Update or restart failed'; else echo "$ip,FAILED,$value,$DESIRED,unknown,Update or restart failed"; fi
    ((failed+=1))
  fi
done

if [[ "$OUTPUT_FORMAT" == table ]]; then
  printf '\nSUMMARY  Changed: %-4s Skipped: %-4s Failed: %-4s\n' "$changed" "$skipped" "$failed"
else
  echo "SUMMARY,changed=$changed,skipped=$skipped,failed=$failed"
fi
operation_status=0
((failed == 0)) || operation_status=1
return_to_menu || true
exit "$operation_status"
