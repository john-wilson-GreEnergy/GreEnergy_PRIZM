#!/usr/bin/env bash
set -euo pipefail

# ================== CONFIG ==================
BASE_URL="${BASE_URL:-http://10.0.0.3:8080/turtle}"
COOKIE="${COOKIE:-}"
COOKIE_JAR="${COOKIE_JAR:-$HOME/.ems_turtle_cookies.txt}"

EMS_BT_PREFIX="${EMS_BT_PREFIX:-tools/report/ems/balancertest}"
BMS_BT_PREFIX="${BMS_BT_PREFIX:-tools/report/bms/balancertest}"

CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-5}"
MAX_TIME="${MAX_TIME:-20}"
PAUSE_SECONDS="${PAUSE_SECONDS:-0.15}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ================== DEPENDENCIES ==================
need(){ command -v "$1" >/dev/null || { echo "Missing dependency: $1" >&2; exit 1; }; }
need curl; need jq; need awk; need sed; need tr; need bash

# ================== HTTP ==================
curl_args_common() {
  local -a args=(-sS -L --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME")
  if [[ -n "$COOKIE" ]]; then args+=(-H "Cookie: $COOKIE"); else args+=(-b "$COOKIE_JAR" -c "$COOKIE_JAR"); fi
  printf '%s\0' "${args[@]}"
}
http_get() {
  local path="$1" qs="${2:-}"
  local url
  if [[ "$path" =~ ^https?:// ]]; then url="$path$qs"; else url="${BASE_URL%/}/${path#'/'}$qs"; fi
  mapfile -d '' -t ARGS < <(curl_args_common)
  curl "${ARGS[@]}" "$url"
}
show() {
  local body="$1"
  if jq -e . >/dev/null 2>&1 <<<"$body"; then jq . <<<"$body"; else printf '%s\n' "$body"; fi
}

# ================== INPUT HELPERS ==================
ask() {
  local p="$1" d="${2:-}" v
  read -rp "$p${d:+ [$d]}: " v || true
  printf '%s' "${v:-$d}"
}
choice() {
  local p="$1" opts="$2" d="${3:-}" v ok
  IFS='|' read -r -a __CHOICES <<<"$opts"
  while :; do
    v="$(ask "$p ($opts)" "$d")"
    ok=0
    for o in "${__CHOICES[@]}"; do
      if [[ "$v" == "$o" ]]; then ok=1; break; fi
    done
    (( ok )) && { printf '%s' "$v"; return; }
    printf 'Choose: %s\n' "$opts" >&2
  done
}
num() {
  local p="$1" d="${2:-}" v
  while :; do
    v="$(ask "$p" "$d")"
    if [[ -z "$v" || "$v" =~ ^-?[0-9]+$ ]]; then
      printf '%s' "$v"
      return
    fi
    printf 'Enter integer.\n' >&2
  done
}

expand_range_list() {
  local input="$1"
  local -a out=()
  local part a b i
  IFS=',' read -r -a parts <<<"$input"
  for part in "${parts[@]}"; do
    # strip whitespace (fixed stray ']' in original)
    part="${part//[[:space:]]/}"
    [[ -z "$part" ]] && continue
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      a="${BASH_REMATCH[1]}"; b="${BASH_REMATCH[2]}"
      if (( a <= b )); then
        for ((i=a;i<=b;i++)); do out+=("$i"); done
      else
        for ((i=a;i>=b;i--)); do out+=("$i"); done
      fi
    elif [[ "$part" =~ ^[0-9]+$ ]]; then
      out+=("$part")
    fi
  done
  printf '%s\n' "${out[@]}"
}

prompt_arrays_list() {
  local raw
  read -rp "Array(s) (e.g., 3 or 1,3-5,8): " raw
  mapfile -t _ARRAYS < <(expand_range_list "$raw")
  ((${#_ARRAYS[@]})) || { echo "No arrays provided." >&2; return 1; }
}
prompt_strings_list() {
  local raw
  read -rp "String(s) (e.g., 1 or 1,3-5,8): " raw
  mapfile -t _STRINGS < <(expand_range_list "$raw")
  ((${#_STRINGS[@]})) || { echo "No strings provided." >&2; return 1; }
}

build_ignore_qs() {
  local scope="$1" low="$2" high="$3" qs=""
  if [[ "$scope" == "array" ]]; then
    [[ -n "$low" && -n "$high" ]] && qs="?ignoreLow=$low&ignoreHigh=$high"
  else
    [[ -n "$low" ]] && qs="?ignoreLow=$low"
    [[ -n "$high" ]] && qs="${qs:+$qs&}?ignoreHigh=$high"
    qs="${qs/#?&/?}"
  fi
  printf '%s' "$qs"
}

# ================== LOCAL TOOLS ==================
run_local_tool() {
  local fname="$1"
  local label="${2:-[scope: array & string + ranges]}"
  local full="$SCRIPT_DIR/$fname"
  if [[ ! -f "$full" ]]; then
    echo "Not found: $full" >&2
    return 1
  fi

  while :; do
    echo "$label"
    echo "------------------------------------------------------------"
    echo "=> Running: ./$fname"
    echo "   (Press Ctrl+C to terminate and return to the main menu)"
    echo "------------------------------------------------------------"
    echo

    # Trap Ctrl+C in the parent so we don't exit the whole program.
    local INT_CAUGHT=0
    trap 'INT_CAUGHT=1' INT

    # Hide the literal ^C if possible, then restore TTY after the run.
    local STTY_SAVED=""
    if command -v stty >/dev/null 2>&1 && [ -t 0 ]; then
      STTY_SAVED="$(stty -g)" || true
      stty -echoctl || true
    fi

    # Run the sibling script but *disable* errexit so SIGINT/exit!=0 won't abort the parent.
    set +e
    (
      cd "$SCRIPT_DIR" || exit 1
      if [[ -x "$full" ]]; then
        "./$fname"
      else
        bash "./$fname"
      fi
    )
    local status=$?
    set -e

    # Restore TTY echo of ^C if we changed it.
    if [[ -n "$STTY_SAVED" ]]; then
      stty "$STTY_SAVED" || true
    fi

    # Restore default INT handling for the parent.
    trap - INT

    if (( INT_CAUGHT )); then
      echo
      echo "[terminated via Ctrl+C — returning to main menu]"
      echo "------------------------------------------------------------"
      return 0
    fi

    if (( status != 0 )); then
      echo "[script exited with status $status]" >&2
    fi

    echo
    echo "------------------------------------------------------------"
    echo "1) Exit to menu"
    echo "2) Re-run this function"
    echo "3) Exit program"
    local ans
    read -rp "Select 1/2/3 [1]: " ans
    case "${ans:-1}" in
      1) return 0 ;;     # back to main menu
      2) continue ;;     # re-run same sibling script
      3) exit 0 ;;       # exit entire script
      *) echo "Unknown selection; returning to menu."; return 0 ;;
    esac
  done
}


# ================== MENU ==================
menu() {
  while :; do
    echo
    echo "EMS Tools @ ${BASE_URL}"
    [[ -n "$COOKIE" ]] && echo "[Cookie set via env]" || echo "[Cookie jar: $COOKIE_JAR]"
    cat <<'EOF'

Reports (scope shown):
  1) Turtle Status (.json/.txt)                              [none]
  2) BESS Status Codes (.json/.txt/.hex/.gz)                 [none]
  3) Controller Statistics (.json/.txt/.hex/.gz)             [none]
  4) Last Call (.json/.txt/.hex/.gz)                         [none]
  5) Array Report                                            [array + ranges]
  6) Array Notifications                                     [array + ranges]
  7) String Report                                           [array & string + ranges]
  8) String Notifications                                    [array & string + ranges]

Controls:
  9)  STRING Contactors (open/close)                         [array & string + ranges]
 10)  ARRAY  Contactors (open/close)                         [array + ranges]
 11)  Rotate STRING (in/out)                                 [array & string + ranges]
 12)  Rotate ALL STRINGS in ARRAY (in/out)                   [array + ranges]
 13)  Rotate ARRAY PCS (in/out)                              [array + ranges]

Local Controls (Diagnostics & Reports):
 14)  Manual Baseline+Hatchery                                        [IP + Index #]
 15)  Feather Report                                         [array & string + ranges]
 16)  String Faults                                          [array & string + ranges]
 17)  HVAC Signals                                           [array & string + ranges]
 18)  Simulate HVAC                                          [array & string + ranges]
 19)  String Viewer                                          [array & string + ranges]

Heat Soak:
 20)  EMS Enclosure Heat Soak: START                         [segment index]
 21)  EMS Enclosure Heat Soak: STOP                          [segment index]

Modbus:
 22)  Modbus Poll (tcp → .csv/.txt)                          [host/port/unit]

EMS Balancer Test:
 23)  Trigger All Arrays (charge|discharge)                  [none]
 24)  Stop All Arrays                                        [none]
 25)  Stop Selected Test(s) by testID                        [testID]
 26)  Trigger Selected Arrays/Strings                        [arrays+strings lists]
 27)  Status                                                 [none]
 28)  Report by testID (.csv/.json/.txt)                     [testID]

BMS Balancer Test:
 29)  Trigger All Arrays (charge|discharge)                  [none]
 30)  Stop All Arrays                                        [none]
 31)  Stop Selected Test(s) by testID                        [testID]
 32)  Trigger Selected Arrays/Strings                        [array(+bms)+strings lists]
 33)  Status                                                 [none]
 34)  Report by testID (.csv/.json/.txt)                     [testID]

  0)  Exit
EOF
    read -rp "Select: " n
    case "$n" in
      1) show "$(http_get "tools/report/ems/status.json")" ;;
      2) show "$(http_get "tools/report/ems/bessStatusCodes.json")" ;;
      3) show "$(http_get "tools/report/ems/controllerStatistics.json")" ;;
      4) show "$(http_get "tools/report/ems/lastCall.json")" ;;
      5) if prompt_arrays_list; then for a in "${_ARRAYS[@]}"; do show "$(http_get "tools/report/ems/array/${a}/report.json")"; sleep "$PAUSE_SECONDS"; done; fi ;;
      6) if prompt_arrays_list; then for a in "${_ARRAYS[@]}"; do show "$(http_get "tools/report/ems/array/${a}/notifications.json")"; sleep "$PAUSE_SECONDS"; done; fi ;;
      7) if prompt_arrays_list && prompt_strings_list; then for a in "${_ARRAYS[@]}"; do for s in "${_STRINGS[@]}"; do show "$(http_get "tools/report/ems/array/${a}/string/${s}/report.json")"; sleep "$PAUSE_SECONDS"; done; done; fi ;;
      8) if prompt_arrays_list && prompt_strings_list; then for a in "${_ARRAYS[@]}"; do for s in "${_STRINGS[@]}"; do show "$(http_get "tools/report/ems/array/${a}/string/${s}/notifications.json")"; sleep "$PAUSE_SECONDS"; done; done; fi ;;
      9)  if prompt_arrays_list && prompt_strings_list; then act="$(choice 'Action' 'open|close')"; for a in "${_ARRAYS[@]}"; do for s in "${_STRINGS[@]}"; do show "$(http_get "tools/controls/ems/array/${a}/string/${s}/contactors/${act}")"; sleep "$PAUSE_SECONDS"; done; done; fi ;;
      10) if prompt_arrays_list; then act="$(choice 'Action' 'open|close')"; for a in "${_ARRAYS[@]}"; do show "$(http_get "tools/controls/ems/array/${a}/contactors/${act}")"; sleep "$PAUSE_SECONDS"; done; fi ;;
      11) if prompt_arrays_list && prompt_strings_list; then act="$(choice 'Rotation' 'in|out')"; for a in "${_ARRAYS[@]}"; do for s in "${_STRINGS[@]}"; do show "$(http_get "tools/controls/ems/array/${a}/string/${s}/rotate/strings/${act}")"; sleep "$PAUSE_SECONDS"; done; done; fi ;;
      12) if prompt_arrays_list; then act="$(choice 'Rotation' 'in|out')"; for a in "${_ARRAYS[@]}"; do show "$(http_get "tools/controls/ems/array/${a}/rotate/strings/${act}")"; sleep "$PAUSE_SECONDS"; done; fi ;;
      13) if prompt_arrays_list; then act="$(choice 'Rotation' 'in|out')"; for a in "${_ARRAYS[@]}"; do show "$(http_get "tools/controls/ems/array/${a}/rotate/arrayPcses/${act}")"; sleep "$PAUSE_SECONDS"; done; fi ;;

      # Feather Configuration — with re-run option after it completes
      14) run_local_tool "manual_setup.sh" "[IP + Index #]" ;;
      15) run_local_tool "new_feather_comms.sh" ;;
      16) run_local_tool "new_local_notifications.sh" ;;
      17) run_local_tool "new_mio_test.sh" ;;
      18) run_local_tool "new_simulate.sh" ;;
      19) run_local_tool "new_string_viewer.sh" ;;

      20) seg="$(num 'Segment Index')" ; sp="$(num 'Temperature Setpoint (°C)')" ; show "$(http_get "tools/controls/ems/heatsoak/start/blockEnclosure/${seg}/temperatureSetpoint/${sp}")" ;;
      21) seg="$(num 'Segment Index')" ; show "$(http_get "tools/controls/ems/heatsoak/stop/blockEnclosure/${seg}")" ;;

      22) host="$(ask 'Host')" ; port="$(num 'Port')" ; unit="$(num 'UnitId')" ; type="$(choice 'Type' 'holding|input|coil|discrete' 'holding')" ; start="$(num 'Start')" ; count="$(num 'Count')" ; show "$(http_get "tools/controls/modbusPoll/host/${host}/port/${port}/unitId/${unit}/type/${type}/start/${start}/count/${count}/data.csv")" ;;

      23) mode="$(choice 'Mode' 'charge|discharge' 'charge')" ; show "$(http_get "${EMS_BT_PREFIX}/trigger/${mode}.json")" ;;
      24) show "$(http_get "${EMS_BT_PREFIX}/stop.json")" ;;
      25) testid="$(ask 'testID')" ; show "$(http_get "${EMS_BT_PREFIX}/stop.json" "?testID=${testid}")" ;;
      26) mode="$(choice 'Mode' 'charge|discharge' 'charge')" ; read -rp "arrayIndexes: " arr_raw ; mapfile -t arrs < <(expand_range_list "$arr_raw") ; read -rp "stringIndexes: " str_raw ; mapfile -t strs < <(expand_range_list "$str_raw") ; arr_csv="$(IFS=,; echo "${arrs[*]}")" ; str_csv="$(IFS=,; echo "${strs[*]}")" ; qs="?arrayIndexes=${arr_csv}&stringIndexes=${str_csv}" ; show "$(http_get "${EMS_BT_PREFIX}/trigger/${mode}.json" "$qs")" ;;
      27) show "$(http_get "${EMS_BT_PREFIX}/status.json")" ;;
      28) testid="$(ask 'testID')" ; show "$(http_get "${EMS_BT_PREFIX}/report.csv" "?testID=${testid}")" ;;

      29) mode="$(choice 'Mode' 'charge|discharge' 'charge')" ; show "$(http_get "${BMS_BT_PREFIX}/trigger/${mode}.json")" ;;
      30) show "$(http_get "${BMS_BT_PREFIX}/stop.json")" ;;
      31) testid="$(ask 'testID')" ; show "$(http_get "${BMS_BT_PREFIX}/stop.json" "?testID=${testid}")" ;;
      32) mode="$(choice 'Mode' 'charge|discharge' 'charge')" ; read -rp "arrayIndexes: " arr_raw ; mapfile -t arrs < <(expand_range_list "$arr_raw") ; read -rp "stringIndexes: " str_raw ; mapfile -t strs < <(expand_range_list "$str_raw") ; read -rp "bmsIndexes: " bms_raw ; mapfile -t bmsa < <(expand_range_list "$bms_raw") ; arr_csv="$(IFS=,; echo "${arrs[*]}")" ; str_csv="$(IFS=,; echo "${strs[*]}")" ; bms_csv="$(IFS=,; echo "${bmsa[*]}")" ; qs="?arrayIndexes=${arr_csv}&stringIndexes=${str_csv}&bmsIndexes=${bms_csv}" ; show "$(http_get "${BMS_BT_PREFIX}/trigger/${mode}.json" "$qs")" ;;
      33) show "$(http_get "${BMS_BT_PREFIX}/status.json")" ;;
      34) testid="$(ask 'testID')" ; show "$(http_get "${BMS_BT_PREFIX}/report.csv" "?testID=${testid}")" ;;

      0) exit 0 ;;
      *) echo "Unknown selection." ;;
    esac
  done
}

menu
