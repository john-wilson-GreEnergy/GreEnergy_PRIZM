#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Terminal Based Controls UI — HVAC Simulation + Validation
# GreEnergy Resources LLC
# ============================================================

# -------------------- USER CONFIG --------------------
SUBNET_PREFIX="${SUBNET_PREFIX:-10.0}"
PORT="${PORT:-8080}"

ES_COUNT="${ES_COUNT:-18}"
ES_START_HOST="${ES_START_HOST:-10}"
ES_STEP="${ES_STEP:-5}"

TIMEOUT_DEFAULT="${TIMEOUT_DEFAULT:-30}"     # 30..240
CONCURRENCY="${CONCURRENCY:-8}"
DEBUG="${DEBUG:-0}"                          # DEBUG=1 prints requests
ALLOW_ES_BEYOND="${ALLOW_ES_BEYOND:-0}"

# 1 = clearall before applying
NORMALIZE_BEFORE_APPLY="${NORMALIZE_BEFORE_APPLY:-1}"

# Validation fetch
REPORT_PATH="${REPORT_PATH:-/feather/status/report.json}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-3.0}"
MAX_TIME="${MAX_TIME:-6}"
VERIFY_DELAY_SECONDS="${VERIFY_DELAY_SECONDS:-2}"

# Live validation refresh
REFRESH_SECONDS="${REFRESH_SECONDS:-3}"      # default refresh interval for live mode

# Branding
BRAND="${BRAND:-1}"                          # 1=show logo/text, 0=off
LOGO_PATH="${LOGO_PATH:-GreEnergy_logo.png}" # file next to script

# -------------------- ANSI --------------------
BOLD=$'\033[1m'
DIM=$'\033[2m'
GREEN=$'\033[32m'
WHITE=$'\033[37m'
RESET=$'\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -------------------- Navigation return codes --------------------
MAIN_MENU_RC=88   # signal: return to main menu
EXIT_RC=77        # signal: exit program (safe inside $(...) subshells)

# -------------------- Dependency status symbols (auto-detect) --------------------
DEP_OK="[OK]"
DEP_MISS="[MISS]"
DEP_REQ="REQ"
DEP_OPT="OPT"

# Prefer Unicode symbols when the terminal locale supports UTF-8.
# (No emoji/font dependencies; falls back safely on minimal consoles.)
if [[ "$(locale charmap 2>/dev/null || true)" == "UTF-8" ]]; then
  DEP_OK="✔"
  DEP_MISS="✖"
  DEP_REQ="●"
  DEP_OPT="○"
fi


die() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }

# Soft dependency model:
#  - Script can start even if deps are missing so you can use the menu to install them.
have_cmd() { command -v "$1" >/dev/null 2>&1; }

# Required for core functionality (simulate/validate)
REQUIRED_CMDS=(curl jq awk sed tr mktemp wc sort head uniq)

# Optional (nice-to-have)
OPTIONAL_CMDS=(column chafa)

list_missing_cmds() {
  local missing=()
  local c
  for c in "${REQUIRED_CMDS[@]}"; do
    have_cmd "$c" || missing+=("$c")
  done
  printf "%s
" "${missing[@]}"
}

deps_ok() {
  [[ -z "$(list_missing_cmds)" ]]
}

deps_report() {
  echo >&2
  echo "==================== Dependency Check ====================" >&2

  local c
  echo "${DEP_REQ} Required:" >&2
  for c in "${REQUIRED_CMDS[@]}"; do
    if have_cmd "$c"; then
      printf "  %s  %s\n" "$DEP_OK" "$c" >&2
    else
      printf "  %s  %s\n" "$DEP_MISS" "$c" >&2
    fi
  done

  echo >&2
  echo "${DEP_OPT} Optional:" >&2
  for c in "${OPTIONAL_CMDS[@]}"; do
    if have_cmd "$c"; then
      printf "  %s  %s\n" "$DEP_OK" "$c" >&2
    else
      printf "  %s  %s\n" "$DEP_MISS" "$c" >&2
    fi
  done

  echo >&2
  local missing
  missing="$(list_missing_cmds | tr '\n' ' ' | sed 's/[[:space:]]\+$//')"
  if [[ -n "$missing" ]]; then
    echo "Status: MISSING required deps -> $missing" >&2
  else
    echo "Status: All required dependencies are installed." >&2
  fi
  echo "==========================================================" >&2
  echo >&2
}


install_missing_deps() {
  # Installs missing deps on Ubuntu/Debian using apt.
  local missing_cmds
  mapfile -t missing_cmds < <(list_missing_cmds)

  if (( ${#missing_cmds[@]} == 0 )); then
    echo "All required dependencies are already installed." >&2
    return 0
  fi

  if ! have_cmd apt-get; then
    echo "apt-get not found; cannot auto-install on this system." >&2
    echo "Missing commands: ${missing_cmds[*]}" >&2
    return 1
  fi

  # Map commands -> packages (Ubuntu 22.04)
  local pkgs=()
  local c
  for c in "${missing_cmds[@]}"; do
    case "$c" in
      curl) pkgs+=("curl") ;;
      jq) pkgs+=("jq") ;;
      awk) pkgs+=("gawk") ;;          # mawk is usually present; gawk is safe
      sed) pkgs+=("sed") ;;
      tr|sort|head|uniq|wc|mktemp) pkgs+=("coreutils") ;;
      *) pkgs+=("$c") ;;
    esac
  done

  # de-dup pkgs
  mapfile -t pkgs < <(printf "%s
" "${pkgs[@]}" | awk '!seen[$0]++')

  echo >&2
  echo "Will install packages: ${pkgs[*]}" >&2
  echo "You may be prompted for your sudo password." >&2
  echo >&2

  local SUDO=()
  if (( EUID != 0 )); then
    if have_cmd sudo; then
      SUDO=(sudo)
    else
      echo "sudo not found and you are not root; cannot auto-install." >&2
      return 1
    fi
  fi

  "${SUDO[@]}" apt-get update -y
  "${SUDO[@]}" apt-get install -y "${pkgs[@]}"

  echo >&2
  echo "Install complete. Re-running dependency check..." >&2
  deps_report
  return 0
}

require_deps_or_menu() {
  # If missing deps, show report and bounce to main menu.
  if ! deps_ok; then
    deps_report
    echo "Please install missing dependencies (Main Menu option) and try again." >&2
    return $MAIN_MENU_RC
  fi
  return 0
}


# -------------------- column compatibility --------------------
# Some distros ship a limited "column" (e.g., busybox) that doesn't support -o.
COLUMN_BIN="${COLUMN_BIN:-column}"
if command -v /usr/bin/column >/dev/null 2>&1; then
  COLUMN_BIN="/usr/bin/column"
fi

COLUMN_SUPPORTS_O=0
if "$COLUMN_BIN" --help 2>&1 | grep -q -- ' -o '; then
  COLUMN_SUPPORTS_O=1
fi

columnize_tsv() {
  # Reads TSV from stdin and prints aligned table.
  # Uses util-linux column when available; otherwise falls back to a simple awk aligner.
  if have_cmd "$COLUMN_BIN"; then
    if (( COLUMN_SUPPORTS_O )); then
      LC_ALL=C "$COLUMN_BIN" -t -s $'	' -o $'   '
    else
      LC_ALL=C "$COLUMN_BIN" -t -s $'	'
    fi
  else
    awk -F'	' '
      { for(i=1;i<=NF;i++){ if(length($i)>w[i]) w[i]=length($i) } rows[NR]=$0; nf=(NF>nf?NF:nf) }
      END{
        for(r=1;r<=NR;r++){
          split(rows[r],a,"	")
          out=""
          for(i=1;i<=nf;i++){
            pad=w[i]-length(a[i])
            out=out a[i] sprintf("%" (pad+3) "s","")
          }
          print out
        }
      }'
  fi
}

# -------------------- Last Targets cache (in-memory) --------------------
LAST_TARGETS=""   # newline-separated IPs
LAST_LABEL=""     # human label for last target selection

# ============================================================
# Branding / Splash
# ============================================================

brand_text_block() {
  cat >&2 <<EOF
${BOLD}${GREEN}GreEnergy Resources LLC V1.2${RESET}
${DIM}${WHITE}Control logic for HVAC simulation and verification${RESET}

${DIM}${WHITE}Unauthorized use of this script and its various functions could result in equipment damage${RESET}
EOF
}

render_logo_chafa() {
  # $1 = file, $2 = width
  local f="$1" w="${2:-60}"
  chafa --symbols=block --colors=16 --dither=none --size "${w}x0" "$f" 2>/dev/null || true
}

show_splash() {
  (( BRAND )) || return 0

  echo >&2
  local logo_file=""
  if [[ -f "$LOGO_PATH" ]]; then
    logo_file="$LOGO_PATH"
  elif [[ -f "${SCRIPT_DIR}/${LOGO_PATH}" ]]; then
    logo_file="${SCRIPT_DIR}/${LOGO_PATH}"
  fi

  if [[ -n "$logo_file" ]] && command -v chafa >/dev/null 2>&1; then
    render_logo_chafa "$logo_file" 72 >&2
  else
    # Clean ASCII fallback
    cat >&2 <<'EOF'
.·:'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''':·.
: :   _______ .______       _______  _______ .__   __.  _______ .______        ___________    ____ : :
: :  /  _____||   _  \     |   ____||   ____||  \ |  | |   ____||   _  \      /  _____\   \  /   / : :
: : |  |  __  |  |_)  |    |  |__   |  |__   |   \|  | |  |__   |  |_)  |    |  |  __  \   \/   /  : :
: : |  | |_ | |      /     |   __|  |   __|  |  . `  | |   __|  |      /     |  | |_ |  \_    _/   : :
: : |  |__| | |  |\  \----.|  |____ |  |____ |  |\   | |  |____ |  |\  \----.|  |__| |    |  |     : :
: :  \______| | _| `._____||_______||_______||__| \__| |_______|| _| `._____| \______|    |__|     : :
'·:................................................................................................:·'
EOF
    echo >&2 "${BOLD}${GREEN}GreEnergy${RESET}"
  fi

  brand_text_block
  echo >&2
  echo "${DIM}${WHITE}Press Enter to continue...${RESET}" >&2
  read -r _
}

brand_small_line() {
  (( BRAND )) || return 0
  echo >&2 "${DIM}${GREEN}GreEnergy Resources LLC V1.0${RESET}  ${DIM}${WHITE}| HVAC Simulation + Validation${RESET}"
}

banner() {
  echo >&2
  echo "${BOLD}${GREEN}Terminal Based Controls UI${RESET}" >&2
  echo "HVAC Simulation + Validation" >&2
  echo "Subnet: ${SUBNET_PREFIX}.X.Y   ES_COUNT=${ES_COUNT}   Port=${PORT}   Concurrency=${CONCURRENCY}" >&2
  echo >&2
}

# ============================================================
# Parsing helpers (comma-separated + ranges)
# ============================================================

expand_num_list() {
  local s="${1// /}"
  [[ -n "$s" ]] || return 0
  local IFS=',' part
  for part in $s; do
    if [[ "$part" =~ ^[0-9]+-[0-9]+$ ]]; then
      local a="${part%-*}" b="${part#*-}"
      (( a <= b )) || { local tmp="$a"; a="$b"; b="$tmp"; }
      local i
      for ((i=a; i<=b; i++)); do echo "$i"; done
    elif [[ "$part" =~ ^[0-9]+$ ]]; then
      echo "$part"
    else
      return 1
    fi
  done
}

expand_es_pairs() {
  local s="${1// /}"
  [[ -n "$s" ]] || return 0
  local IFS=',' part
  for part in $s; do
    [[ "$part" =~ ^[0-9]+-[0-9]+$ ]] || return 1
    local arr="${part%-*}" es="${part#*-}"
    echo "$arr $es"
  done
}

# ============================================================
# IP builders
# ============================================================

cs_ip() { local array="$1"; echo "${SUBNET_PREFIX}.${array}.3"; }

es_ip() {
  local array="$1" es="$2"
  [[ "$es" =~ ^[0-9]+$ ]] || return 1
  (( es >= 1 )) || return 1
  if (( ! ALLOW_ES_BEYOND )) && (( es > ES_COUNT )); then
    return 2
  fi
  local host=$(( ES_START_HOST + (es - 1) * ES_STEP ))
  echo "${SUBNET_PREFIX}.${array}.${host}"
}

array_spread_ips() {
  local array="$1"
  cs_ip "$array"
  local es
  for ((es=1; es<=ES_COUNT; es++)); do
    es_ip "$array" "$es"
  done
}

# ============================================================
# Target selection UI (menus to stderr, IPs to stdout)
# ============================================================

select_targets_menu() {
  echo >&2
  echo "Select target type (or 'b' to go back, '0' to exit):" >&2
  echo "  1) Array        (CS + ES1..ES${ES_COUNT} : ${SUBNET_PREFIX}.X.3, .10..)" >&2
  echo "  2) Single ES    (pairs: array-es, e.g. 3-10,4-5,2-15)" >&2
  echo "  3) Single CS    (array number -> ${SUBNET_PREFIX}.A.3)" >&2
  echo "  4) Multiple CS  (arrays list/ranges -> CS only, e.g. 1-8,10,12-14)" >&2
  echo "  0) Exit" >&2
  printf "Choice: " >&2
}

get_targets() {
  while true; do
    select_targets_menu
    read -r choice
    case "$choice" in
      0) return $EXIT_RC ;;
      b|B) return 1 ;;
      m|M) return $MAIN_MENU_RC ;;
      m|M) return $MAIN_MENU_RC ;;
      1)
        printf "Enter array number(s) (e.g. 4 or 1-3,6) ('b' back, 'm' menu): " >&2
        read -r arrays
        [[ "${arrays}" =~ ^[mM]$ ]] && return $MAIN_MENU_RC
        [[ "${arrays}" =~ ^[bB]$ ]] && continue
        local nums
        nums="$(expand_num_list "$arrays")" || { echo "Invalid array list." >&2; continue; }
        while read -r a; do array_spread_ips "$a"; done <<< "$nums"
        return 0
        ;;
      2)
        printf "Enter ES pair(s) array-es (e.g. 3-10,4-5,2-15) ('b' back, 'm' menu): " >&2
        read -r pairs
        [[ "${pairs}" =~ ^[mM]$ ]] && return $MAIN_MENU_RC
        [[ "${pairs}" =~ ^[bB]$ ]] && continue
        local lines
        lines="$(expand_es_pairs "$pairs")" || { echo "Invalid format. Use array-es like 3-10." >&2; continue; }
        while read -r a es; do
          local ip
          if ip="$(es_ip "$a" "$es")"; then
            echo "$ip"
          else
            if (( $? == 2 )); then
              echo "ES${es} exceeds ES_COUNT=${ES_COUNT}. Set ALLOW_ES_BEYOND=1 to allow." >&2
            else
              echo "Invalid ES pair: ${a}-${es}" >&2
            fi
            return 1
          fi
        done <<< "$lines"
        return 0
        ;;
      3)
        printf "Enter array number (e.g. 4) ('b' back, 'm' menu): " >&2
        read -r a
        [[ "${a}" =~ ^[mM]$ ]] && return $MAIN_MENU_RC
        [[ "${a}" =~ ^[bB]$ ]] && continue
        [[ "$a" =~ ^[0-9]+$ ]] || { echo "Invalid array." >&2; continue; }
        cs_ip "$a"
        return 0
        ;;
      4)
        printf "Enter arrays list/ranges (e.g. 1-8,10,12-14) ('b' back, 'm' menu): " >&2
        read -r arrays
        [[ "${arrays}" =~ ^[mM]$ ]] && return $MAIN_MENU_RC
        [[ "${arrays}" =~ ^[bB]$ ]] && continue
        local nums
        nums="$(expand_num_list "$arrays")" || { echo "Invalid array list." >&2; continue; }
        while read -r a; do cs_ip "$a"; done <<< "$nums"
        return 0
        ;;
      *) echo "Invalid choice." >&2 ;;
    esac
  done
}

# ============================================================
# Simulator HTTP helpers
# ============================================================

sim_base_url() { local ip="$1"; echo "http://${ip}:${PORT}/feather/simulate"; }
set_timeout_for_ip() { curl -sS -X POST "$(sim_base_url "$1")/timeoutminutes/$2" >/dev/null; }
clear_all_for_ip() { curl -sS "$(sim_base_url "$1")/clearall" -H "X-Requested-With: XMLHttpRequest" >/dev/null; }
post_commands_for_ip() {
  local ip="$1" json="$2"
  curl -sS -X POST "$(sim_base_url "$ip")/commands" \
    -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" \
    --data-raw "$json" >/dev/null
}

# ============================================================
# JSON builders for simulator
# ============================================================

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

value_obj() {
  local name="$1" type="$2" value="$3" unit="${4:-}"
  printf '{"name":"%s","usingDefault":false,"type":"%s","value":"%s","unit":"%s"}' \
    "$(json_escape "$name")" "$(json_escape "$type")" "$(json_escape "$value")" "$(json_escape "$unit")"
}
payload_values() { printf '{"values":[%s]}' "$1"; }

# ============================================================
# Menus: main + timeout + action
# ============================================================


set_es_count_menu() {
  while true; do
    clear
    echo "Energy Segment Scaling"
    echo "==============================="
    echo "Current ES_COUNT = ${ES_COUNT}"
    echo
    echo "Enter new ES_COUNT (positive integer),"
    echo "or 'b' to go back, 'm' for main menu, '0' to exit."
    echo
    read -r -p "ES_COUNT: " v </dev/tty || return 0
    case "$v" in
      0) return $EXIT_RC ;;
      b|B) return 0 ;;
      m|M) return 0 ;;
      *)
        if [[ "$v" =~ ^[0-9]+$ && "$v" -gt 0 ]]; then
          ES_COUNT="$v"
          echo
          echo "ES_COUNT set to ${ES_COUNT}"
          read -r -p "Press Enter to continue..." _ </dev/tty || true
          return 0
        else
          echo "Invalid value. Must be a positive integer."
          sleep 1
        fi
        ;;
    esac
  done
}


main_menu() {
  echo >&2
  echo "Main Menu (or '0' to exit):" >&2
  echo "  1) Simulate (deploy)" >&2
  echo "  2) Validate (pick targets)" >&2
  echo "  3) Validate LAST targets" >&2
  echo "  4) Scale Energy Segments (ES_COUNT=${ES_COUNT})" >&2
  echo "  5) Dependency Check" >&2
  echo "  6) Install Missing Dependencies" >&2
  echo "  0) Exit" >&2
  printf "Choice: " >&2
}



ask_timeout_minutes() {
  local minutes
  while true; do
    printf "Timeout minutes (30-240) [default %s] (or 'b' back, 'm' menu, '0' exit): " "$TIMEOUT_DEFAULT" >&2
    read -r minutes </dev/tty || return 1
    case "${minutes}" in
      0) return $EXIT_RC ;;
      b|B) return 1 ;;
      m|M) return $MAIN_MENU_RC ;;
    esac
    minutes="${minutes:-$TIMEOUT_DEFAULT}"
    if [[ "$minutes" =~ ^[0-9]+$ ]] && (( minutes >= 30 && minutes <= 240 )); then
      echo "$minutes"
      return 0
    fi
    echo "Invalid timeout. Must be an integer 30..240." >&2
  done
}


ask_bool() {
  local prompt="$1" ans
  while true; do
    printf "%s (true/false): " "$prompt" >&2
    read -r ans
    ans="${ans,,}"
    case "$ans" in
      true|t|yes|y|1) echo "true"; return 0 ;;
      false|f|no|n|0) echo "false"; return 0 ;;
      *) echo "Please enter true or false." >&2 ;;
    esac
  done
}

select_action_menu() {
  echo >&2
  echo "Select simulate action by number (or 'b' to go back, '0' to exit):" >&2
  echo "  1) Cooling            (SpaceTemp=55, UseCellSetpoint=false)" >&2
  echo "  2) Heating            (SpaceTemp=5,  UseCellSetpoint=false)" >&2
  echo "  3) Dehumidification   (OutsideHumidity=99, SpaceHumidity=99)" >&2
  echo "  4) Lower Top Cap      (LowerTopcapClosed=true/false)" >&2
  echo "  5) Leak Alarm         (LeakAlarm=true/false)" >&2
  echo "  6) AC Door            (AcDoorClosed=true/false)" >&2
  echo "  7) EV signal          (EmergencyVentilation=true/false)" >&2
  echo "  8) Clear All          (clear all simulated overrides)" >&2
  echo "  0) Exit" >&2
  printf "Choice: " >&2
}

choose_action() {
  while true; do
    select_action_menu
    read -r choice
    case "$choice" in
      0) return $EXIT_RC ;;
      b|B) return 1 ;;
      m|M) return $MAIN_MENU_RC ;;
      1)
        ACTION_KIND="commands"
        EXPECT_LABEL="Cooling: SpaceTemp=55, UseCellSetpoint=false"
        COMMAND_PAYLOAD="$(payload_values \
          "$(value_obj "SpaceTemp" "NUMBER" "55" "' Celsius"),$(value_obj "UseCellSetpoint" "BOOLEAN" "false" "true = cell, false = air")")"
        return 0 ;;
      2)
        ACTION_KIND="commands"
        EXPECT_LABEL="Heating: SpaceTemp=5, UseCellSetpoint=false"
        COMMAND_PAYLOAD="$(payload_values \
          "$(value_obj "SpaceTemp" "NUMBER" "5" "' Celsius"),$(value_obj "UseCellSetpoint" "BOOLEAN" "false" "true = cell, false = air")")"
        return 0 ;;
      3)
        ACTION_KIND="commands"
        EXPECT_LABEL="Dehumidification: OutsideHumidity=99, SpaceHumidity=99"
        COMMAND_PAYLOAD="$(payload_values \
          "$(value_obj "OutsideHumidity" "NUMBER" "99" "0-100 (RH%)"),$(value_obj "SpaceHumidity" "NUMBER" "99" "0-100 (RH%)")")"
        return 0 ;;
      4)
        ACTION_KIND="commands"
        local v; v="$(ask_bool "Simulate Lower Top Cap CLOSED?")"
        EXPECT_LABEL="LowerTopcapClosed=${v}"
        COMMAND_PAYLOAD="$(payload_values "$(value_obj "LowerTopcapClosed" "BOOLEAN" "$v" "true = door closed")")"
        return 0 ;;
      5)
        ACTION_KIND="commands"
        local v; v="$(ask_bool "Simulate Leak Alarm ACTIVE?")"
        EXPECT_LABEL="LeakAlarm=${v}"
        COMMAND_PAYLOAD="$(payload_values "$(value_obj "LeakAlarm" "BOOLEAN" "$v" "true = alarm active")")"
        return 0 ;;
      6)
        ACTION_KIND="commands"
        local v; v="$(ask_bool "Simulate AC Door CLOSED?")"
        EXPECT_LABEL="AcDoorClosed=${v}"
        COMMAND_PAYLOAD="$(payload_values "$(value_obj "AcDoorClosed" "BOOLEAN" "$v" "true = door closed")")"
        return 0 ;;
      7)
        ACTION_KIND="commands"
        local v; v="$(ask_bool "Simulate Emergency Ventilation ACTIVE?")"
        EXPECT_LABEL="EmergencyVentilation=${v}"
        COMMAND_PAYLOAD="$(payload_values "$(value_obj "EmergencyVentilation" "BOOLEAN" "$v" "true = ventilating")")"
        return 0 ;;
      8)
        ACTION_KIND="clear"
        EXPECT_LABEL="Clear All"
        COMMAND_PAYLOAD=""
        return 0 ;;
      *) echo "Invalid choice." >&2 ;;
    esac
  done
}

# ============================================================
# Deploy runner
# ============================================================

run_deploy_on_target() {
  local ip="$1" minutes="$2" kind="$3" payload="${4:-}"

  if (( DEBUG )); then
    echo "== $ip ==" >&2
    echo "POST $(sim_base_url "$ip")/timeoutminutes/${minutes}" >&2
  fi
  set_timeout_for_ip "$ip" "$minutes"

  if (( NORMALIZE_BEFORE_APPLY )); then
    (( DEBUG )) && echo "GET  $(sim_base_url "$ip")/clearall" >&2
    clear_all_for_ip "$ip"
  fi

  if [[ "$kind" == "clear" ]]; then
    (( ! NORMALIZE_BEFORE_APPLY )) && clear_all_for_ip "$ip"
  else
    (( DEBUG )) && echo "POST $(sim_base_url "$ip")/commands  payload=${#payload}B" >&2
    post_commands_for_ip "$ip" "$payload"
  fi
}

export -f run_deploy_on_target sim_base_url set_timeout_for_ip clear_all_for_ip post_commands_for_ip
export PORT DEBUG NORMALIZE_BEFORE_APPLY

# ============================================================
# Validation table layout + ARRAY banners
# ============================================================

HEADER=$'Array\tIP\tStage\tHVAC1\tFanL\tFanH\tComp\tHpump\tFreeze\tHVAC2\tFanL\tFanH\tComp\tHpump\tFreeze\tElectHeat\tSimulated\tSimTime\tFSS\tMIO'
print_header() { printf '%s\n' "$HEADER"; }

print_array_banner() {
  local a="$1"
  echo >&2
  echo "========================" >&2
  echo "ARRAY $a" >&2
  echo "========================" >&2
}

# ============================================================
# Sorting (TSV-safe)
# ============================================================

sort_table_by_ip() {
  local f="$1"
  [[ -f "$f" ]] || return 0

  local hdr
  hdr="$(head -n 1 "$f" || true)"

  awk -F'\t' -v OFS=$'\t' '
    NR==1 { next }
    {
      n = split($2, ip, /\./)
      o1=o2=o3=o4=999999
      if (n==4 && ip[1] ~ /^[0-9]+$/ && ip[2] ~ /^[0-9]+$/ && ip[3] ~ /^[0-9]+$/ && ip[4] ~ /^[0-9]+$/) {
        o1=ip[1]; o2=ip[2]; o3=ip[3]; o4=ip[4]
      }
      print $1, o1, o2, o3, o4, $0
    }
  ' "$f" \
  | sort -t $'\t' -k1,1n -k2,2n -k3,3n -k4,4n -k5,5n \
  | awk -F'\t' -v OFS=$'\t' '
      {
        $1=$2=$3=$4=$5=""
        sub(/^\t+/, "", $0)
        print
      }
    ' > "${f}.sorted"

  {
    printf '%s\n' "$hdr"
    cat "${f}.sorted"
  } > "${f}.sorted2"

  mv "${f}.sorted2" "$f"
  rm -f "${f}.sorted"
}

# ===================== COLORIZER (with fallback) =====================
post_align_color() {
  if command -v perl >/dev/null 2>&1; then
    perl -e '
      use strict; use warnings;

      my $RED = "\e[31m";
      my $GRN = "\e[32m";
      my $YEL = "\e[33m";
      my $BLU = "\e[34m";
      my $MAG = "\e[35m";
      my $CYN = "\e[36m";
      my $DIM = "\e[2m";
      my $RST = "\e[0m";

      my $nr = 0;

      sub is_num { my ($s)=@_; return defined($s) && $s =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/; }
      sub in_range { my ($v,$lo,$hi)=@_; return ($v >= $lo && $v <= $hi); }

      while (my $line=<STDIN>) {
        $nr++;
        print $line and next if $nr==1;
        chomp $line;

        my (@tok, @sep);
        while ($line =~ /(\S+)(\s{2,}|$)/g) {
          push @tok, $1;
          push @sep, $2 if defined($2) && $2 ne "";
        }

        # Stage coloring
        if (defined $tok[2] && $tok[2] ne "") {
          my $s = lc($tok[2]);
          if    ($s =~ /idle/)   { $tok[2] = "$YEL$tok[2]$RST"; }
          elsif ($s =~ /ldcool/) { $tok[2] = "$CYN$tok[2]$RST"; }
          elsif ($s =~ /bcool/)  { $tok[2] = "$BLU$tok[2]$RST"; }
          elsif ($s =~ /heat/)   { $tok[2] = "$MAG$tok[2]$RST"; }
          elsif ($s =~ /dhm/)    { $tok[2] = "$CYN$tok[2]$RST"; }
          elsif ($s =~ /exchk/)  { $tok[2] = "$DIM$YEL$tok[2]$RST"; }
          else                   { $tok[2] = "$DIM$tok[2]$RST"; }
        }

        # HVAC current coloring (tok[3], tok[9])
        for my $i (3, 9) {
          next unless defined $tok[$i] && is_num($tok[$i]);
          my $v = 0 + $tok[$i];
          if ($v >= 20.1) {
            $tok[$i] = "$RED$tok[$i]$RST";
          }
          elsif (in_range($v,15.1,20.0) || in_range($v,3.1,9.8)) {
            $tok[$i] = "$YEL$tok[$i]$RST";
          }
          elsif (in_range($v,9.9,15.0) || in_range($v,1.9,3.0)) {
            $tok[$i] = "$GRN$tok[$i]$RST";
          }
          else {
            $tok[$i] = "$DIM$BLU$tok[$i]$RST";
          }
        }

        # Boolean columns: true->green, false->red
        for my $i (4,5,6,7,10,11,12,13,15,16,18,19) {
          next unless defined $tok[$i];
          if ($tok[$i] eq "true")  { $tok[$i] = "$GRN$tok[$i]$RST"; }
          elsif ($tok[$i] eq "false"){ $tok[$i] = "$RED$tok[$i]$RST"; }
        }

        # Freeze columns: true->red, false->green
        for my $i (8,14) {
          next unless defined $tok[$i];
          if ($tok[$i] eq "true")  { $tok[$i] = "$RED$tok[$i]$RST"; }
          elsif ($tok[$i] eq "false"){ $tok[$i] = "$GRN$tok[$i]$RST"; }
        }

        # SimTime: red 1-45, yellow 46-60, green 61-240
        if (defined $tok[17] && is_num($tok[17])) {
          my $m = int(0 + $tok[17]);
          if ($m >= 1 && $m <= 45) {
            $tok[17] = "$RED$tok[17]$RST";
          }
          elsif (in_range($m,46,60)) {
            $tok[17] = "$YEL$tok[17]$RST";
          }
          elsif (in_range($m,61,240)) {
            $tok[17] = "$GRN$tok[17]$RST";
          }
        }

        my $out = $tok[0] // "";
        for (my $i=0; $i<@sep; $i++) {
          $out .= ($sep[$i] // "   ") . ($tok[$i+1] // "");
        }
        print "$out\n";
      }
    '
  else
    cat
  fi
}

# ============================================================
# Validation fetch + row builder
# ============================================================

check_ip() {
  local ip="$1" incfile="${2:-}"
  local cached
  cached="$(curl -sS --connect-timeout "$CONNECT_TIMEOUT" -m "$MAX_TIME" --noproxy "*" "http://${ip}:${PORT}${REPORT_PATH}" || echo "{}")"

  local Array Stage
  local HVAC1 FanL1 FanH1 Comp1 Hpump1 Freeze1
  local HVAC2 FanL2 FanH2 Comp2 Hpump2 Freeze2
  local ElectHeat Simulated SimTime
  local FSS MIO

  Array="$(awk -F. '{print $3}' <<<"$ip")"

  if [[ "$cached" == "{}" ]]; then
    Stage="n/a"
    HVAC1="n/a"; FanL1="n/a"; FanH1="n/a"; Comp1="n/a"; Hpump1="n/a"; Freeze1="n/a"
    HVAC2="n/a"; FanL2="n/a"; FanH2="n/a"; Comp2="n/a"; Hpump2="n/a"; Freeze2="n/a"
    ElectHeat="n/a"
    Simulated="n/a"; SimTime="n/a"
    FSS="n/a"
    MIO="n/a"
  else
    num1()  { jq -r "$1 // empty" <<<"$cached" | awk "NF{printf(\"%.1f\",\$1)}"; }
    bool()  { jq -r "($1 // false)|tostring" <<<"$cached"; }
    str1()  { jq -r "$1 // \"?\"" <<<"$cached"; }

    Stage="$(str1 '.thermalData.thermostatStage')"

    FSS="$(bool '.thermalData.fssSignals.valid')"
    MIO="$(bool '.thermalData.HVAC1Controls.valid')"

    HVAC1="$(num1 '.thermalData.HVAC1Data.hvacCurrent')"
    FanL1="$(bool '.thermalData.HVAC1Controls.fanLowOn')"
    FanH1="$(bool '.thermalData.HVAC1Controls.fanHighOn')"
    Comp1="$(bool '.thermalData.HVAC1Controls.YCompressorOn')"
    Hpump1="$(bool '.thermalData.HVAC1Controls.ReversingValveOn')"
    Freeze1="$(bool '.thermalData.HVAC1Data.FreezeDetected')"

    HVAC2="$(num1 '.thermalData.HVAC2Data.hvacCurrent')"
    FanL2="$(bool '.thermalData.HVAC2Controls.fanLowOn')"
    FanH2="$(bool '.thermalData.HVAC2Controls.fanHighOn')"
    Comp2="$(bool '.thermalData.HVAC2Controls.YCompressorOn')"
    Hpump2="$(bool '.thermalData.HVAC2Controls.ReversingValveOn')"
    Freeze2="$(bool '.thermalData.HVAC2Data.FreezeDetected')"

    local eh1 eh2
    eh1="$(bool '.thermalData.HVAC1Controls.ElectricHeatOn')"
    eh2="$(bool '.thermalData.HVAC2Controls.ElectricHeatOn')"
    if [[ "$eh1" == "true" || "$eh2" == "true" ]]; then ElectHeat="true"; else ElectHeat="false"; fi

    local sim_ts rep_ts rem
    sim_ts="$(jq -r '.simulatedValueTimeoutTimestamp // empty' <<<"$cached")"
    rep_ts="$(jq -r '.fromFeatherControllerStatistcsReport.timeStamp // empty' <<<"$cached")"
    if [[ -n "$sim_ts" && -n "$rep_ts" && "$sim_ts" =~ ^[0-9]+$ && "$rep_ts" =~ ^[0-9]+$ ]]; then
      rem=$(( (sim_ts - rep_ts) / 60000 ))
      (( rem < 0 )) && rem=0
      if (( rem > 0 )); then Simulated="true"; else Simulated="false"; fi
      if (( rem < 10 )); then SimTime="$(printf "%02d" "$rem")"; else SimTime="$rem"; fi
    else
      Simulated="false"; SimTime="00"
    fi
  fi

  local incomplete=0 v
  for v in "$Stage" "$HVAC1" "$FanL1" "$FanH1" "$Comp1" "$Hpump1" "$Freeze1" \
           "$HVAC2" "$FanL2" "$FanH2" "$Comp2" "$Hpump2" "$Freeze2" \
           "$ElectHeat" "$Simulated" "$SimTime" "$FSS" "$MIO"; do
    [[ -z "$v" || "${v,,}" == "n/a" || "${v,,}" == "null" || "${v,,}" == "?" ]] && { incomplete=1; break; }
  done
  if (( incomplete )) && [[ -n "$incfile" ]]; then printf '%s\n' "$ip" >> "$incfile"; fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$Array" "$ip" "$Stage" \
    "${HVAC1:-n/a}" "$FanL1" "$FanH1" "$Comp1" "$Hpump1" "$Freeze1" \
    "${HVAC2:-n/a}" "$FanL2" "$FanH2" "$Comp2" "$Hpump2" "$Freeze2" \
    "$ElectHeat" "$Simulated" "$SimTime" "$FSS" "$MIO"
}

export SUBNET_PREFIX PORT REPORT_PATH CONNECT_TIMEOUT MAX_TIME CONCURRENCY
export -f check_ip

validate_targets_grouped() {
  local label="$1" targets="$2"

  echo >&2
  echo "========================" >&2
  echo "VALIDATION: ${label}" >&2
  echo "========================" >&2

  # Save any existing RETURN trap so we can restore it (prevents trap leak)
  local prev_return_trap
  prev_return_trap="$(trap -p RETURN || true)"

  local tmpall incall
  tmpall="$(mktemp)"
  incall="$(mktemp)"

  cleanup_grouped() {
    rm -f "${tmpall:-}" "${incall:-}" 2>/dev/null || true
    if [[ -n "${prev_return_trap:-}" ]]; then
      eval "$prev_return_trap" 2>/dev/null || true
    else
      trap - RETURN
    fi
  }
  trap cleanup_grouped RETURN

  print_header >"$tmpall"

  while IFS= read -r ip; do echo "$ip"; done <<<"$targets" | \
    xargs -I{} -P "$CONCURRENCY" bash -c '
      set -euo pipefail
      ip="$1"; inc="$2"
      check_ip "$ip" "$inc"
    ' _ {} "$incall" >>"$tmpall" || true

  local arrays
  arrays="$(awk -F$'\t' 'NR>1{print $1}' "$tmpall" | sort -n | uniq)"

  local a
  for a in $arrays; do
    print_array_banner "$a"

    local tmparr incarr
    tmparr="$(mktemp)"
    incarr="$(mktemp)"

    print_header >"$tmparr"
    awk -F$'\t' -v A="$a" 'NR==1{next} $1==A{print}' "$tmpall" >>"$tmparr"

    sort_table_by_ip "$tmparr"
    columnize_tsv <"$tmparr" | post_align_color

    if [[ -s "$incall" ]]; then
      awk -v A="$a" -F. '$3==A{print $0}' "$incall" >"$incarr" || true
    fi

    echo >&2
    if [[ -s "$incarr" ]]; then
      local listed
      listed="$(tr '\n' ' ' <"$incarr" | sed 's/[[:space:]]\+$//')"
      echo "IPs with INCOMPLETE data: $listed" >&2
    else
      echo "IPs with INCOMPLETE data: none" >&2
    fi

    rm -f "$tmparr" "$incarr" 2>/dev/null || true
  done
}

export -f validate_targets_grouped post_align_color print_header print_array_banner sort_table_by_ip columnize_tsv

# ============================================================
# Live validation refresh UI (manual + auto 3s)
# ============================================================

validate_targets_live() {
  local label="$1" targets="$2"
  local auto=0
  local key=""

  while true; do
    clear 2>/dev/null || true

    brand_small_line
    echo >&2

    echo "========================" >&2
    echo "VALIDATION: ${label}" >&2
    echo "========================" >&2
    echo "Refresh: ${REFRESH_SECONDS}s   Mode: $([[ $auto -eq 1 ]] && echo AUTO || echo MANUAL)" >&2
    echo >&2

    validate_targets_grouped "$label" "$targets"

    echo >&2
    echo "Controls: [Enter]=refresh now   a=auto toggle   m=main menu   0=exit" >&2

    if (( auto )); then
      key=""
      if IFS= read -r -t "$REFRESH_SECONDS" -n 1 key; then
        case "$key" in
          a|A) auto=0 ;;
          m|M) return 0 ;;
          0) exit 0 ;;
          *) : ;;
        esac
      fi
    else
      IFS= read -r key
      case "${key:-}" in
        a|A) auto=1 ;;
        m|M) return 0 ;;
        0) exit 0 ;;
        *) : ;;
      esac
    fi
  done
}

export -f validate_targets_live

# ============================================================
# Post-deploy prompt: manual validation
# ============================================================

post_deploy_menu() {
  echo >&2
  echo "Next:" >&2
  echo "  1) Validate now" >&2
  echo "  2) Back to main menu" >&2
  echo "  0) Exit" >&2
  printf "Choice: " >&2
}

ask_verify_delay() {
  local d
  printf "Delay before validation in seconds [default %s] ('b' back, 'm' menu): " "$VERIFY_DELAY_SECONDS" >&2
  read -r d
  case "${d:-}" in
    m|M) return $MAIN_MENU_RC ;;
    b|B) return 1 ;;
  esac
  d="${d:-$VERIFY_DELAY_SECONDS}"
  [[ "$d" =~ ^[0-9]+$ ]] || die "delay must be an integer (seconds)"
  echo "$d"
}

# ============================================================
# ES_COUNT Scaling (persist into script)
# ============================================================

persist_es_count() {
  local new_count="$1"
  local self="$0"

  # Try to resolve symlink to real path (best effort)
  if command -v readlink >/dev/null 2>&1; then
    local resolved
    resolved="$(readlink -f "$self" 2>/dev/null || true)"
    [[ -n "${resolved:-}" ]] && self="$resolved"
  fi

  [[ -w "$self" ]] || { echo "WARN: Cannot write to script for persistence: $self" >&2; return 1; }

  # Update the default inside: ES_COUNT="${ES_COUNT:-20}"
  # Keep the user's environment override behavior intact; only change the default number.
  local tmp
  tmp="$(mktemp)"
  if ! sed -E "s|^(ES_COUNT=\"\\$\\{ES_COUNT:-)[0-9]+(\\}\")|\\1${new_count}\\2|" "$self" >"$tmp"; then
    rm -f "$tmp" 2>/dev/null || true
    echo "WARN: Failed to patch ES_COUNT in $self" >&2
    return 1
  fi
  mv "$tmp" "$self"
  chmod +x "$self" 2>/dev/null || true
  return 0
}

config_es_count_menu() {
  local new
  while true; do
    echo >&2
    echo "Scale Energy Segments (ES_COUNT) — current: ${ES_COUNT}" >&2
    printf "Enter new ES_COUNT (1-60) ('b' back, 'm' menu, '0' exit): " >&2
    read -r new </dev/tty || return 1

    case "${new:-}" in
      0) return $EXIT_RC ;;
      b|B) return 0 ;;
      m|M) return $MAIN_MENU_RC ;;
    esac

    [[ "$new" =~ ^[0-9]+$ ]] || { echo "Invalid: must be an integer." >&2; continue; }
    (( new >= 1 && new <= 60 )) || { echo "Invalid: must be 1..60." >&2; continue; }

    ES_COUNT="$new"

    if persist_es_count "$new"; then
      echo "ES_COUNT updated and persisted to ${new}." >&2
    else
      echo "ES_COUNT updated for this session to ${new}, but persistence failed." >&2
    fi
    return 0
  done
}

# ============================================================
# Modes
# ============================================================

cache_last_targets() {
  local targets="$1" label="$2"
  LAST_TARGETS="$targets"
  LAST_LABEL="$label"
}

mode_validate_only() {
  if ! require_deps_or_menu; then
    rc=$?
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi

  local targets
  if ! targets="$(get_targets)"; then
    rc=$?
    (( rc == EXIT_RC )) && exit 0
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi
  targets="$(printf "%s\n" "$targets" | awk 'NF{print}' | sort -u)"
  local total; total="$(printf "%s\n" "$targets" | awk 'NF{c++} END{print c+0}')"
  (( total > 0 )) || { echo "No targets selected." >&2; return 0; }

  cache_last_targets "$targets" "Manual Validation"
  validate_targets_live "Manual Validation" "$targets"
}

mode_validate_last() {
  if ! require_deps_or_menu; then
    rc=$?
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi

  if [[ -z "${LAST_TARGETS:-}" ]]; then
    echo "No LAST targets cached yet. Run Validate or Simulate once first." >&2
    return 0
  fi
  validate_targets_live "${LAST_LABEL:-Last Targets}" "$LAST_TARGETS"
}

mode_simulate() {
  if ! require_deps_or_menu; then
    rc=$?
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi

  local targets
  if ! targets="$(get_targets)"; then
    rc=$?
    (( rc == EXIT_RC )) && exit 0
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi

  local minutes
  if ! minutes="$(ask_timeout_minutes)"; then
    rc=$?
    (( rc == EXIT_RC )) && exit 0
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi

  local ACTION_KIND COMMAND_PAYLOAD EXPECT_LABEL
  if ! choose_action; then
    rc=$?
    (( rc == EXIT_RC )) && exit 0
    (( rc == MAIN_MENU_RC )) && return 0
    return 0
  fi

  targets="$(printf "%s\n" "$targets" | awk 'NF{print}' | sort -u)"
  local total; total="$(printf "%s\n" "$targets" | awk 'NF{c++} END{print c+0}')"
  (( total > 0 )) || { echo "No targets selected." >&2; return 0; }

  cache_last_targets "$targets" "$EXPECT_LABEL"

  echo >&2
  echo "Deploying to ${total} target(s) with timeout=${minutes}..." >&2
  echo "Action: ${EXPECT_LABEL} (normalized: ${NORMALIZE_BEFORE_APPLY})" >&2
  echo >&2

  local xargs_rc=0
  while IFS= read -r ip; do echo "$ip"; done <<<"$targets" | \
    xargs -I{} -P "$CONCURRENCY" bash -c '
      set -euo pipefail
      run_deploy_on_target "$1" "$2" "$3" "$4"
    ' _ {} "$minutes" "$ACTION_KIND" "${COMMAND_PAYLOAD:-}" \
    || xargs_rc=$?

  local ok=0 fail=0
  if (( xargs_rc == 0 )); then
    ok="$total"; fail=0
  else
    ok=0; fail=0
    while IFS= read -r ip; do
      if run_deploy_on_target "$ip" "$minutes" "$ACTION_KIND" "${COMMAND_PAYLOAD:-}"; then
        ((ok++))
      else
        ((fail++))
      fi
    done <<<"$targets"
  fi

  echo >&2
  echo "Commanded: ${total}  Successful: ${ok}  Failed: ${fail}" >&2

  while true; do
    post_deploy_menu
    read -r c
    case "$c" in
      m|M) return 0 ;;
      1)
        local d
        if ! d="$(ask_verify_delay)"; then
          rc=$?
          (( rc == MAIN_MENU_RC )) && return 0
          continue
        fi
        (( d > 0 )) && { echo "Waiting ${d}s..." >&2; sleep "$d"; }
        validate_targets_live "$EXPECT_LABEL" "$targets"
        ;;
      2|b|B) return 0 ;;
      0) exit 0 ;;
      *) echo "Invalid choice." >&2 ;;
    esac
  done
}

# ============================================================
# Main loop
# ============================================================

main() {
  show_splash
  banner
  while true; do
    main_menu
    read -r choice
    case "$choice" in
      1) mode_simulate ;;
      2) mode_validate_only ;;
      3) mode_validate_last ;;
      4)
        if ! config_es_count_menu; then
          rc=$?
          (( rc == EXIT_RC )) && exit 0
          # MAIN_MENU_RC just means stay on main
        fi
        ;;
      5)
        deps_report
        read -r -p "Press Enter to continue..." _ </dev/tty || true
        ;;
      6)
        install_missing_deps
        read -r -p "Press Enter to continue..." _ </dev/tty || true
        ;;
      0) return $EXIT_RC ;;
      *) echo "Invalid choice." >&2 ;;
    esac
  done
}

main "$@"

