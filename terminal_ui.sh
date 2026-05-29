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
need() {
  command -v "$1" >/dev/null || { echo "Missing dependency: $1" >&2; exit 1; }
}
need curl; need jq; need awk; need sed; need tr; need bash

# ================== HTTP HELPERS ==================
curl_args_common() {
  local -a args=(-sS -L --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME")
  if [[ -n "$COOKIE" ]]; then
    args+=(-H "Cookie: $COOKIE")
  else
    args+=(-b "$COOKIE_JAR" -c "$COOKIE_JAR")
  fi
  printf '%s\n' "${args[@]}"
}

http_get() {
  local path="$1" qs="${2:-}"
  if [[ -z "${BASE_URL:-}" ]]; then
    echo "[ERROR] BASE_URL is empty. Set it in the script, via env, or Config → Change BASE_URL." >&2
    return 1
  fi
  local url
  if [[ "$path" =~ ^https?:// ]]; then
    url="$path$qs"
  else
    url="${BASE_URL%/}/${path#'/'}$qs"
  fi
  mapfile -t ARGS < <(curl_args_common)
  curl "${ARGS[@]}" "$url"
}

show() {
  local body="$1"
  if jq -e . >/dev/null 2>&1 <<<"$body"; then
    jq . <<<"$body"
  else
    printf '%s\n' "$body"
  fi
}

# ================== INPUT HELPERS ==================
ask() {
  local p="$1" d="${2:-}" v
  read -rp "$p${d:+ [$d]}: " v || true
  printf '%s' "${v:-$d}"
}

num() {
  local p="$1" d="${2:-}" v
  while :; do
    v="$(ask "$p" "$d")"
    # Allow B/b to act as "back" → return empty string
    if [[ "$v" =~ ^[Bb]$ ]]; then
      printf '%s' ""
      return 0
    fi
    if [[ -z "$v" || "$v" =~ ^-?[0-9]+$ ]]; then
      printf '%s' "$v"
      return
    fi
    printf 'Enter integer (or B to go back).\n' >&2
  done
}

expand_range_list() {
  local input="$1"
  local -a out=()
  local part a b i
  IFS=',' read -r -a parts <<<"$input"
  for part in "${parts[@]}"; do
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

# store raw and expanded for re-use
_ARRAYS=()
_STRINGS=()
_ARRAYS_RAW=""
_STRINGS_RAW=""

prompt_arrays_list() {
  local raw
  read -rp "Array(s) (e.g., 3 or 1,3-5,8, or B to go back): " raw
  if [[ "$raw" =~ ^[Bb]$ ]]; then
    echo "Cancelled."
    return 1
  fi
  _ARRAYS_RAW="$raw"
  mapfile -t _ARRAYS < <(expand_range_list "$raw")
  ((${#_ARRAYS[@]})) || { echo "No arrays provided." >&2; return 1; }
}

prompt_strings_list() {
  local raw
  read -rp "String(s) (e.g., 1 or 1,3-5,8, or B to go back): " raw
  if [[ "$raw" =~ ^[Bb]$ ]]; then
    echo "Cancelled."
    return 1
  fi
  _STRINGS_RAW="$raw"
  mapfile -t _STRINGS < <(expand_range_list "$raw")
  ((${#_STRINGS[@]})) || { echo "No strings provided." >&2; return 1; }
}

confirm_action() {
  local prompt="${1:-Proceed? (y/n)}"
  local ans
  read -rp "$prompt [n]: " ans
  case "${ans:-n}" in
    y|Y) return 0 ;;
    *) echo "Cancelled."; return 1 ;;
  esac
}

# -------- BREADCRUMB HELPER --------
show_selection_breadcrumb() {
  if [[ -n "$_ARRAYS_RAW" || -n "$_STRINGS_RAW" ]]; then
    echo "Last selection:"
    [[ -n "$_ARRAYS_RAW" ]]  && echo "  Arrays : ${_ARRAYS_RAW}"
    [[ -n "$_STRINGS_RAW" ]] && echo "  Strings: ${_STRINGS_RAW}"
    echo
  fi
}

# ======== NUMERIC OPTION MENUS (stderr menus, stdout value) ========
select_action_open_close() {
  >&2 echo "Action:"
  >&2 echo "  1) Open"
  >&2 echo "  2) Close"
  local choice
  while :; do
    read -rp "Select [1-2, or B to go back]: " choice
    case "$choice" in
      1) echo "open";   return ;;
      2) echo "close";  return ;;
      B|b) return 1 ;;
      *) >&2 echo "Enter 1 or 2 (or B to go back)." ;;
    esac
  done
}

select_rotation_in_out() {
  >&2 echo "Rotation:"
  >&2 echo "  1) In"
  >&2 echo "  2) Out"
  local choice
  while :; do
    read -rp "Select [1-2, or B to go back]: " choice
    case "$choice" in
      1) echo "in";   return ;;
      2) echo "out";  return ;;
      B|b) return 1 ;;
      *) >&2 echo "Enter 1 or 2 (or B to go back)." ;;
    esac
  done
}

select_balance_mode() {
  >&2 echo "Balance action:"
  >&2 echo "  1) avg"
  >&2 echo "  2) highest"
  >&2 echo "  3) lowest"
  local choice
  while :; do
    read -rp "Select [1-3, or B to go back]: " choice
    case "$choice" in
      1) echo "avg";     return ;;
      2) echo "highest"; return ;;
      3) echo "lowest";  return ;;
      B|b) return 1 ;;
      *) >&2 echo "Enter 1, 2, or 3 (or B to go back)." ;;
    esac
  done
}

select_charge_discharge() {
  >&2 echo "Mode:"
  >&2 echo "  1) charge"
  >&2 echo "  2) discharge"
  local choice
  while :; do
    read -rp "Select [1-2, or B to go back]: " choice
    case "$choice" in
      1) echo "charge";    return ;;
      2) echo "discharge"; return ;;
      B|b) return 1 ;;
      *) >&2 echo "Enter 1 or 2 (or B to go back)." ;;
    esac
  done
}

select_modbus_type() {
  >&2 echo "Modbus register type:"
  >&2 echo "  1) holding"
  >&2 echo "  2) input"
  >&2 echo "  3) coil"
  >&2 echo "  4) discrete"
  local choice
  while :; do
    read -rp "Select [1-4, or B to go back]: " choice
    case "$choice" in
      1) echo "holding";  return ;;
      2) echo "input";    return ;;
      3) echo "coil";     return ;;
      4) echo "discrete"; return ;;
      B|b) return 1 ;;
      *) >&2 echo "Enter 1-4 (or B to go back)." ;;
    esac
  done
}

select_file_format() {
  >&2 echo "File format:"
  >&2 echo "  1) csv"
  >&2 echo "  2) txt"
  local choice
  while :; do
    read -rp "Select [1-2, or B to go back]: " choice
    case "$choice" in
      1) echo "csv"; return ;;
      2) echo "txt"; return ;;
      B|b) return 1 ;;
      *) >&2 echo "Enter 1 or 2 (or B to go back)." ;;
    esac
  done
}

# ================== LOCAL TOOL RUNNER ==================
run_local_tool() {
  local fname="$1"
  local label="${2:-}"
  local full="$SCRIPT_DIR/$fname"
  if [[ ! -f "$full" ]]; then
    echo "Not found: $full" >&2
    return 1
  fi

  while :; do
    [[ -n "$label" ]] && echo "$label"
    echo "------------------------------------------------------------"
    echo "=> Running: ./$fname"
    echo "   (Press Ctrl+C to terminate and return to the main menu)"
    echo "------------------------------------------------------------"
    echo

    local INT_CAUGHT=0
    trap 'INT_CAUGHT=1' INT

    local STTY_SAVED=""
    if command -v stty >/dev/null 2>&1 && [ -t 0 ]; then
      STTY_SAVED="$(stty -g)" || true
      stty -echoctl || true
    fi

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

    if [[ -n "$STTY_SAVED" ]]; then
      stty "$STTY_SAVED" || true
    fi

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
    read -rp "Select 1/3 [1]: " ans
    case "${ans:-1}" in
      1) return 0 ;;
      2) continue ;;
      3) exit 0 ;;
      *) echo "Unknown selection; returning to menu."; return 0 ;;
    esac
  done
}

# ================== CONFIG HELPERS ==================
show_base_url() {
  echo
  echo "Current BASE_URL: ${BASE_URL}"
  echo
}

change_base_url() {
  echo
  echo "Current BASE_URL: ${BASE_URL}"
  local new
  read -rp "Enter new BASE_URL (e.g., http://10.1.0.3:8080/turtle) [blank = cancel]: " new
  if [[ -z "$new" ]]; then
    echo "No change made."
  else
    BASE_URL="$new"
    echo "BASE_URL updated to: ${BASE_URL}"
  fi
}

# ================== CATEGORY FLAGS ==================
CAT_CONTROLS=0
CAT_LOCAL=0
CAT_HEAT=0
CAT_REPORTS=0
CAT_EMSBT=0
CAT_BMSBT=0
CAT_FAN=0
CAT_EXTRA=0
CAT_CONFIG=0

reset_categories() {
  CAT_CONTROLS=0
  CAT_LOCAL=0
  CAT_HEAT=0
  CAT_REPORTS=0
  CAT_EMSBT=0
  CAT_BMSBT=0
  CAT_FAN=0
  CAT_EXTRA=0
  CAT_CONFIG=0
}

select_categories() {
  while :; do
    echo
    echo "=== Category Selection (for this session) ==="
    echo " 1) Controls"
    echo " 2) Local Tools"
    echo " 3) Fan Control"
    echo " 4) EMS Balancer Test"
    echo " 5) BMS Balancer Test"
    echo " 6) Heat Soak"
    echo " 7) Reports"
    echo " 8) Extra Reports / Maps"
    echo " 9) Config"
    echo
    echo "Enter categories to enable (e.g., 1 or 1,3-5 or all)."
    read -rp "Selection (or B to go back): " cat_raw

    if [[ "$cat_raw" =~ ^[Bb]$ ]]; then
      return 0
    fi

    reset_categories

    if [[ "$cat_raw" == "all" || "$cat_raw" == "ALL" ]]; then
      CAT_CONTROLS=1
      CAT_LOCAL=1
      CAT_FAN=1
      CAT_EMSBT=1
      CAT_BMSBT=1
      CAT_HEAT=1
      CAT_REPORTS=1
      CAT_EXTRA=1
      CAT_CONFIG=1
      break
    fi

    mapfile -t cats < <(expand_range_list "$cat_raw")
    if ((${#cats[@]} == 0)); then
      echo "No valid categories parsed. Try again."
      continue
    fi

    local c
    for c in "${cats[@]}"; do
      case "$c" in
        1) CAT_CONTROLS=1 ;;
        2) CAT_LOCAL=1 ;;
        3) CAT_FAN=1 ;;
        4) CAT_EMSBT=1 ;;
        5) CAT_BMSBT=1 ;;
        6) CAT_HEAT=1 ;;
        7) CAT_REPORTS=1 ;;
        8) CAT_EXTRA=1 ;;
        9) CAT_CONFIG=1 ;;
        *) echo "Ignoring unknown category: $c" ;;
      esac
    done

    if (( CAT_CONTROLS || CAT_LOCAL || CAT_FAN || CAT_EMSBT || CAT_BMSBT || CAT_HEAT || CAT_REPORTS || CAT_EXTRA || CAT_CONFIG )); then
      break
    fi

    echo "No categories enabled. Please select at least one."
  done

  echo
  echo "Active categories this session:"
  (( CAT_CONTROLS )) && echo " - Controls"
  (( CAT_LOCAL    )) && echo " - Local Tools"
  (( CAT_FAN      )) && echo " - Fan Control"
  (( CAT_EMSBT    )) && echo " - EMS Balancer Test"
  (( CAT_BMSBT    )) && echo " - BMS Balancer Test"
  (( CAT_HEAT     )) && echo " - Heat Soak"
  (( CAT_REPORTS  )) && echo " - Reports"
  (( CAT_EXTRA    )) && echo " - Extra Reports / Maps"
  (( CAT_CONFIG   )) && echo " - Config"
  echo
}

# ================== COLOR HELPERS FOR STRING REPORT ==================
colorize_string_report_line() {
  sed -E \
    -e 's/\bnearline\b/\x1b[33mnearline\x1b[0m/g' \
    -e 's/\boffline\b/\x1b[31moffline\x1b[0m/g' \
    -e 's/\bonline\b/\x1b[32monline\x1b[0m/g' \
    -e 's/\bIN\b/\x1b[32mIN\x1b[0m/g' \
    -e 's/\bOUT\b/\x1b[34mOUT\x1b[0m/g' \
    -e 's/\bopen\b/\x1b[33mopen\x1b[0m/g' \
    -e 's/\bclosed\b/\x1b[32mclosed\x1b[0m/g' \
    -e 's/\bmis-match\b/\x1b[31mmis-match\x1b[0m/g'
}

string_report_summary_for_selection() {
  # Header & row formats – 19 columns (including SCfw)
  local header_fmt row_fmt
  header_fmt="%-5s %-6s %-7s %-5s %-8s %-7s %-8s %-10s %-5s %-11s %-8s %-7s %-7s %-9s %-10s %-6s %-7s %-10s %-9s"
  row_fmt="$header_fmt"

  echo
  printf "$header_fmt\n" \
    "Array" "String" "DC Comb" "SoC" "Voltage" "DCBus" "G-Fault" "State" "ROT" \
    "Contactors" "Reclose" "Volt ∆" "Temp ∆" "BalMode" "Target(mV)" \
    "FanCmd" "FanSet" "FanRPMs" "SCfw"
  printf '%*s\n' 150 '' | tr ' ' '-'

  local a s body first_array=1

  for a in "${_ARRAYS[@]}"; do
    if (( ${#_ARRAYS[@]} > 1 )); then
      if (( ! first_array )); then
        echo
      fi
      first_array=0
      printf "===== ARRAY %s =====\n" "$a"
      printf '%*s\n' 150 '' | tr ' ' '-'
    fi

    for s in "${_STRINGS[@]}"; do
      body="$(http_get "tools/report/ems/array/${a}/string/${s}/report.json" || true)"
      [[ -z "$body" ]] && continue

      jq -r '
        . as $root

        | ($root.stringData // {})                         as $sd
        | ($sd.soc // $sd.stringSoC // 0)                  as $soc
        | ($sd.measuredStringVoltage // 0)                 as $v_meas
        | ($sd.dcBusVoltage // 0)                          as $dcbus
        | ($sd.groundLeakageCurrent // 0)                  as $gleak
        | ($sd.maxCellGroupTemp // 0)                      as $tmax
        | ($sd.minCellGroupTemp // 0)                      as $tmin
        | ($sd.maxCellGroupVoltage // 0)                   as $vmax
        | ($sd.minCellGroupVoltage // 0)                   as $vmin
        | ($sd.stringConnectionState // "UNKNOWN")         as $state_raw
        | ($sd.outRotation // false)                       as $outRot
        | ($sd.positiveContactorClosed // false)           as $posC
        | ($sd.negativeContactorClosed // false)           as $negC
        | ($sd.recloseCount // 0)                          as $reclose

        | ($sd.stringFanReport // {})                      as $fr
        | ($fr.fanCommand // 0)                            as $fanCmd
        | ($fr.fanSetting // 0)                            as $fanSet
        | ($fr.fanStatusRPM // [0,0,0,0])                  as $rpms

        | ($root.batteryPackReportList[0]
             .batteryPackData
             .batteryPackBalancingConfiguration
             .balancingMode // "NO_BALANCE")              as $mode
        | ($root.batteryPackReportList[0]
             .batteryPackData
             .batteryPackBalancingConfiguration
             .providedVoltageTarget // 65535)             as $target_raw

        | ($root.scFirmwareVersion // {})                 as $fw
        | ($fw.fwVersionMajor // 0)                       as $fwMaj
        | ($fw.fwVersionMinor // 0)                       as $fwMin
        | ($fw.fwVersionRevision // 0)                    as $fwRev

        # Derived values
        | ($gleak | tonumber? // 0)                       as $gleakN
        | ($tmax - $tmin)                                 as $dT_raw
        | ($dT_raw / 10.0 | tostring)                     as $dT_txt
        | ($vmax - $vmin)                                 as $dV

        | (if   $state_raw == "ONLINE"   then "online"
           elif $state_raw == "NEARLINE" then "nearline"
           elif $state_raw == "OFFLINE"  then "offline"
           else ($state_raw|tostring)
           end)                                           as $stateTxt

        | (if $outRot then "OUT" else "IN" end)           as $rotTxt

        | (if ($posC and $negC) then "closed"
           elif ((($posC|not) and ($negC|not))) then "open"
           else "mis-match"
           end)                                           as $contTxt

        | (if   $mode == "NO_BALANCE"            then "none"
           elif $mode == "BALANCE_TO_PROVIDED"   then "btp"
           else ($mode|tostring)
           end)                                           as $modeTxt

        | (if $target_raw == 65535
             then "-"
             else ($target_raw|tostring)
           end)                                           as $targetTxt

        | ($rpms | map(tostring) | join(","))             as $rpmTxt

        | [
            $soc,                 # SoC
            $v_meas,              # Voltage
            $dcbus,               # DCBus
            ($gleakN|tostring),   # G-Fault
            $stateTxt,            # State
            $rotTxt,              # ROT
            $contTxt,             # Contactors
            $reclose,             # Reclose
            $dV,                  # Volt ∆
            $dT_txt,              # Temp ∆
            $modeTxt,             # BalMode
            $targetTxt,           # Target(mV)
            $fanCmd,              # FanCmd
            $fanSet,              # FanSet
            $rpmTxt,              # FanRPMs
            $fwMaj,               # fw major
            $fwMin,               # fw minor
            $fwRev                # fw revision
          ]
        | @tsv
      ' <<<"$body" |
      while IFS=$'\t' read -r \
        soc v_meas dcbus g_fault state rot \
        cont reclose dv dt balmode target fan_cmd fan_set fan_rpms fwMaj fwMin fwRev; do

        [[ -z "$state" ]] && continue

        local dcComb
        if   (( s >= 1 && s <= 14 )); then
          dcComb=1
        elif (( s >= 15 && s <= 28 )); then
          dcComb=2
        elif (( s >= 29 && s <= 42 )); then
          dcComb=3
        else
          dcComb=0
        fi

        local scfw="${fwMaj}.${fwMin}.${fwRev}"

        printf "$row_fmt\n" \
          "$a" "$s" "$dcComb" "$soc" "$v_meas" "$dcbus" "$g_fault" "$state" "$rot" \
          "$cont" "$reclose" "$dv" "$dt" "$balmode" "$target" \
          "$fan_cmd" "$fan_set" "$fan_rpms" "$scfw" \
        | colorize_string_report_line
      done

    done
  done
}

# ================== ADDITIONAL FUNCTIONS MENU (after String Report) ==================
run_additional_functions_menu() {
  local choice

  while :; do
    echo
    echo "Run additional functions?"
    echo "  1) Feather report      (new_feather_comms.sh)"
    echo "  2) String faults       (new_local_notifications.sh)"
    echo "  3) HVAC Signals        (new_mio_test.sh)"
    echo "  4) Simulate HVAC       (new_simulate.sh)"
    echo "  5) String Viewer       (new_string_viewer.sh)"
    echo "  0) Done"
    read -rp "Select [0-5]: " choice

    case "$choice" in
      0|"")
        break
        ;;
      1)
        run_local_tool "new_feather_comms.sh"
        ;;
      2)
        run_local_tool "new_local_notifications.sh"
        ;;
      3)
        run_local_tool "new_mio_test.sh"
        ;;
      4)
        run_local_tool "new_simulate.sh"
        ;;
      5)
        run_local_tool "new_string_viewer.sh"
        ;;
      *)
        echo "Unknown selection."
        ;;
    esac
  done
}

# ================== MAIN MENU ==================
menu() {
  select_categories
  while :; do
    echo
    echo -e "\e[1;32mTerminal Based Controls UI\e[0m"
    echo

    show_selection_breadcrumb

    # ----- Controls -----
    if (( CAT_CONTROLS )); then
      cat <<'EOF'
Controls:
  1)  STRING Contactors (open/close)                         [array & string + ranges]
  2)  ARRAY  Contactors (open/close)                         [array + ranges]
  3)  Rotate STRING (in/out)                                 [array & string + ranges]
  4)  Rotate ALL STRINGS in ARRAY (in/out)                   [array + ranges]
  5)  Rotate ARRAY PCS (all PCS in array, in/out)            [array + ranges]
  6)  Balance String (avg/highest/lowest)                    [array & string + ranges]
  7)  Balance String To Provided (mV)                        [array & string + ranges]
  8)  Balance String Two (pattern + TTL)                     [array & string + ranges]
  9)  Balance ARRAY (avg)                                    [array + ranges]
 10)  Balance ARRAY To Provided (mV)                         [array + ranges]
 11)  Stop String Balance                                    [array & string + ranges]
 12)  Stop ARRAY Balance                                     [array + ranges]
 13)  String Report                                          [array & string + ranges → +additional functions]
EOF
      echo
    fi

    # ----- Local Tools -----
    if (( CAT_LOCAL )); then
      cat <<'EOF'
Local Tools:
 14)  Manual Baseline+Hatchery                               [IP + Index #]
 15)  Feather Report                                         [array & string + ranges]
 16)  String Faults                                          [array & string + ranges]
 17)  HVAC Signals                                           [array & string + ranges]
 18)  Simulate HVAC                                          [array & string + ranges]
 19)  String Viewer                                          [array & string + ranges]
EOF
      echo
    fi

    # ----- Fan Control -----
    if (( CAT_FAN )); then
      cat <<'EOF'
Fan Control:
 20)  EMS String Fan Control Speed                           [array & string + ranges]
EOF
      echo
    fi

    # ----- EMS Balancer Test -----
    if (( CAT_EMSBT )); then
      cat <<'EOF'
EMS Balancer Test:
 21)  Trigger All Arrays (charge|discharge)                  [none]
 22)  Stop All Arrays                                        [none]
 23)  Stop Selected Test(s) by testID                        [testID]
 24)  Trigger Selected Arrays/Strings                        [arrays+strings lists]
 25)  Status UI / Selection (new_balancer_test_status.sh)    [none]
 26)  Analyze Report by testID (.json) (new_balancer_test_analysis.sh)
EOF
      echo
    fi

    # ----- BMS Balancer Test -----
    if (( CAT_BMSBT )); then
      cat <<'EOF'
BMS Balancer Test:
 27)  Trigger All Arrays (charge|discharge)                  [none]
 28)  Stop All Arrays                                        [none]
 29)  Stop Selected Test(s) by testID                        [testID]
 30)  Trigger Selected Arrays/Strings+BMS                    [arrays+strings+bms lists]
 31)  Status                                                 [none]
 32)  Report by testID (.csv)                                [testID]
EOF
      echo
    fi

    # ----- Heat Soak -----
    if (( CAT_HEAT )); then
      cat <<'EOF'
Heat Soak:
 33)  EMS Enclosure Heat Soak: START                         [segment index]
 34)  EMS Enclosure Heat Soak: STOP                          [segment index]
EOF
      echo
    fi

    # ----- Reports -----
    if (( CAT_REPORTS )); then
      cat <<'EOF'
Reports:
 35)  Turtle Status (.json)                                  [none]
 36)  BESS Status Codes (.json)                              [none]
 37)  Controller Statistics (.json)                          [none]
 38)  Last Call (.json)                                      [none]
 39)  Array Report                                           [array + ranges]
 40)  Array Notifications                                    [array + ranges]
 41)  String Report (raw JSON)                               [array & string + ranges]
 42)  String Notifications (raw JSON)                        [array & string + ranges]
 43)  Modbus Poll (tcp → .csv/.txt)                          [host/port/unit]
EOF
      echo
    fi

    # ----- Extra Reports / Maps -----
    if (( CAT_EXTRA )); then
      cat <<'EOF'
Extra Reports / Maps:
 44)  Array PCS Report                                       [array + pcs index + ranges]
 45)  AC Battery Availability                                [acBattery index + ranges]
 46)  EMS String IP Map (.csv)                               [none]
 47)  EMS IP Map (.csv)                                      [none]
 48)  Modbus Map (.csv)                                      [none]
 49)  Strings Extract (.csv)                                 [none]
EOF
      echo
    fi

    # ----- Config -----
    if (( CAT_CONFIG )); then
      cat <<'EOF'
Config:
 50)  Show current BASE_URL
 51)  Change BASE_URL
EOF
      echo
    fi

    echo " C)  Change active categories"
    echo " 0)  Exit"
    echo
    read -rp "Select function number (or C to change categories, 0 to exit): " n

    case "$n" in
      C|c)
        select_categories
        continue
        ;;
      0)
        exit 0
        ;;

      # ---------- CONTROLS ----------
      1)
        if prompt_arrays_list && prompt_strings_list; then
          act="$(select_action_open_close)" || continue
          if confirm_action "Proceed with STRING contactors ${act}?"; then
            local cmd_total=0 cmd_success=0 resp
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                ((cmd_total++))
                resp="$(http_get "tools/controls/ems/array/${a}/string/${s}/contactors/${act}" || true)"
                if [[ "$resp" =~ [Oo][Kk] ]]; then ((cmd_success++)); fi
                sleep "$PAUSE_SECONDS"
              done
            done
            echo "Commanded: ${cmd_total}  Successful: ${cmd_success}"
          fi
        fi
        ;;
      2)
        if prompt_arrays_list; then
          act="$(select_action_open_close)" || continue
          if confirm_action "Proceed with ARRAY contactors ${act}?"; then
            local cmd_total=0 cmd_success=0 resp
            for a in "${_ARRAYS[@]}"; do
              ((cmd_total++))
              resp="$(http_get "tools/controls/ems/array/${a}/contactors/${act}" || true)"
              if [[ "$resp" =~ [Oo][Kk] ]]; then ((cmd_success++)); fi
              sleep "$PAUSE_SECONDS"
            done
            echo "Commanded: ${cmd_total}  Successful: ${cmd_success}"
          fi
        fi
        ;;
      3)
        if prompt_arrays_list && prompt_strings_list; then
          act="$(select_rotation_in_out)" || continue
          if confirm_action "Rotate STRING(s) ${act}?"; then
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                show "$(http_get "tools/controls/ems/array/${a}/string/${s}/rotate/strings/${act}")"
                sleep "$PAUSE_SECONDS"
              done
            done
          fi
        fi
        ;;
      4)
        if prompt_arrays_list; then
          act="$(select_rotation_in_out)" || continue
          if confirm_action "Rotate ALL STRINGS in each ARRAY ${act}?"; then
            for a in "${_ARRAYS[@]}"; do
              show "$(http_get "tools/controls/ems/array/${a}/rotate/strings/${act}")"
              sleep "$PAUSE_SECONDS"
            done
          fi
        fi
        ;;
      5)
        if prompt_arrays_list; then
          act="$(select_rotation_in_out)" || continue
          if confirm_action "Rotate ARRAY PCS (all PCS per array) ${act}?"; then
            for a in "${_ARRAYS[@]}"; do
              show "$(http_get "tools/controls/ems/array/${a}/rotate/arrayPcses/${act}")"
              sleep "$PAUSE_SECONDS"
            done
          fi
        fi
        ;;
      6)
        if prompt_arrays_list && prompt_strings_list; then
          act="$(select_balance_mode)" || continue
          if confirm_action "Balance String (${act}) on selected EMS strings?"; then
            local cmd_total=0 cmd_success=0 resp
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                ((cmd_total++))
                resp="$(http_get "tools/controls/ems/array/${a}/string/${s}/balance/${act}" || true)"
                if [[ "$resp" =~ [Oo][Kk] ]]; then ((cmd_success++)); fi
                sleep "$PAUSE_SECONDS"
              done
            done
            echo "Commanded: ${cmd_total}  Successful: ${cmd_success}"
          fi
        fi
        ;;
      7)
        if prompt_arrays_list && prompt_strings_list; then
          target_mv="$(num 'Target cell voltage (mV) (or B to go back)')"
          if [[ -n "$target_mv" ]] && confirm_action "Balance String To Provided (${target_mv} mV) on selected EMS strings?"; then
            local cmd_total=0 cmd_success=0 resp qs
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                ((cmd_total++))
                qs=""
                resp="$(http_get "tools/controls/ems/array/${a}/string/${s}/balance/provided/${target_mv}" "$qs" || true)"
                if [[ "$resp" =~ [Oo][Kk] ]]; then ((cmd_success++)); fi
                sleep "$PAUSE_SECONDS"
              done
            done
            echo "Commanded: ${cmd_total}  Successful: ${cmd_success}"
          else
            echo "Cancelled."
          fi
        fi
        ;;
      8)
        if prompt_arrays_list && prompt_strings_list; then
          pattern="$(ask 'balanceString pattern (e.g., c12,d4,n0,n0,d5,,d6, or B to go back)')"
          if [[ "$pattern" =~ ^[Bb]$ ]]; then
            echo "Cancelled."
            continue
          fi
          ttl="$(num 'balanceTTL (ms, or B to go back)' '60000')"
          if [[ -n "$pattern" && -n "$ttl" ]] && confirm_action "Balance String Two (pattern + TTL) on selected EMS strings?"; then
            local cmd_total=0 cmd_success=0 resp qs
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                ((cmd_total++))
                qs="?balanceString=${pattern}&balanceTTL=${ttl}"
                resp="$(http_get "tools/controls/ems/array/${a}/string/${s}/balance" "$qs" || true)"
                if [[ "$resp" =~ [Oo][Kk] ]]; then ((cmd_success++)); fi
                sleep "$PAUSE_SECONDS"
              done
            done
            echo "Commanded: ${cmd_total}  Successful: ${cmd_success}"
          else
            echo "Cancelled."
          fi
        fi
        ;;
      9)
        if prompt_arrays_list; then
          if confirm_action "Balance ARRAY (avg) for selected arrays?"; then
            for a in "${_ARRAYS[@]}"; do
              show "$(http_get "tools/controls/ems/array/${a}/balance/avg")"
              sleep "$PAUSE_SECONDS"
            done
          fi
        fi
        ;;
      10)
        if prompt_arrays_list; then
          target_mv="$(num 'Target array cell voltage (mV, or B to go back)')"
          if [[ -n "$target_mv" ]] && confirm_action "Balance ARRAY To Provided (${target_mv} mV) for selected arrays?"; then
            for a in "${_ARRAYS[@]}"; do
              show "$(http_get "tools/controls/ems/array/${a}/balance/provided/${target_mv}")"
              sleep "$PAUSE_SECONDS"
            done
          else
            echo "Cancelled."
          fi
        fi
        ;;
      11)
        if prompt_arrays_list && prompt_strings_list; then
          if confirm_action "Stop String Balance for selected EMS strings?"; then
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                show "$(http_get "tools/controls/ems/array/${a}/string/${s}/balance/stop")"
                sleep "$PAUSE_SECONDS"
              done
            done
          fi
        fi
        ;;
      12)
        if prompt_arrays_list; then
          if confirm_action "Stop ARRAY Balance for selected arrays?"; then
            for a in "${_ARRAYS[@]}"; do
              show "$(http_get "tools/controls/ems/array/${a}/balance/stop")"
              sleep "$PAUSE_SECONDS"
            done
          fi
        fi
        ;;
      13)
        if ! prompt_arrays_list; then
          continue
        fi
        if ! prompt_strings_list; then
          continue
        fi
        string_report_summary_for_selection
        run_additional_functions_menu
        ;;

      # ---------- LOCAL TOOLS ----------
      14) run_local_tool "manual_setup.sh" "[Manual baseline+hatchery]" ;;
      15) run_local_tool "new_feather_comms.sh" ;;
      16) run_local_tool "new_local_notifications.sh" ;;
      17) run_local_tool "new_mio_test.sh" ;;
      18) run_local_tool "new_simulate.sh" ;;
      19) run_local_tool "new_string_viewer.sh" ;;

      # ---------- FAN CONTROL ----------
      20)
        if prompt_arrays_list && prompt_strings_list; then
          fs="$(num 'Fan speed index/value (or B to go back)')"
          if [[ -n "$fs" ]] && confirm_action "Set EMS fan speed=${fs} for selected strings?"; then
            for a in "${_ARRAYS[@]}"; do
              for s in "${_STRINGS[@]}"; do
                show "$(http_get "tools/controls/ems/array/${a}/string/${s}/fanCtlAll/${fs}")"
                sleep "$PAUSE_SECONDS"
              done
            done
          else
            echo "Cancelled."
          fi
        fi
        ;;

      # ---------- EMS BALANCER TEST ----------
      21)
        mode="$(select_charge_discharge)" || continue
        if confirm_action "Trigger EMS balancer test for ALL arrays in ${mode} mode?"; then
          show "$(http_get "${EMS_BT_PREFIX}/trigger/${mode}.json")"
        else
          echo "Cancelled."
        fi
        ;;
      22)
        if confirm_action "Stop ALL EMS balancer tests?"; then
          show "$(http_get "${EMS_BT_PREFIX}/stop.json")"
        else
          echo "Cancelled."
        fi
        ;;
      23)
        testid="$(ask 'testID (or B to go back)')"
        if [[ "$testid" =~ ^[Bb]$ || -z "$testid" ]]; then
          echo "Cancelled."
          continue
        fi
        if confirm_action "Stop EMS balancer testID=${testid}?"; then
          show "$(http_get "${EMS_BT_PREFIX}/stop.json" "?testID=${testid}")"
        else
          echo "Cancelled."
        fi
        ;;
      24)
        mode="$(select_charge_discharge)" || continue
        read -rp "arrayIndexes (e.g., 1 or 1,3-5, or B to go back): " arr_raw
        if [[ "$arr_raw" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        mapfile -t arrs < <(expand_range_list "$arr_raw")
        read -rp "stringIndexes (e.g., 1 or 1,5-10, or B to go back): " str_raw
        if [[ "$str_raw" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        mapfile -t strs < <(expand_range_list "$str_raw")
        if ((${#arrs[@]} && ${#strs[@]})) && confirm_action "Trigger EMS balancer for selected arrays/strings in ${mode} mode?"; then
          arr_csv="$(IFS=,; echo "${arrs[*]}")"
          str_csv="$(IFS=,; echo "${strs[*]}")"
          qs="?arrayIndexes=${arr_csv}&stringIndexes=${str_csv}"
          show "$(http_get "${EMS_BT_PREFIX}/trigger/${mode}.json" "$qs")"
        else
          echo "Cancelled or no indexes."
        fi
        ;;
      25)
        run_local_tool "new_balancer_test_status.sh" "[EMS Balancer Test Status UI]"
        ;;
      26)
        run_local_tool "new_balancer_test_analysis.sh" "[EMS Balancer Test Analyzer]"
        ;;

      # ---------- BMS BALANCER TEST ----------
      27)
        mode="$(select_charge_discharge)" || continue
        if confirm_action "Trigger BMS balancer test for ALL arrays in ${mode} mode?"; then
          show "$(http_get "${BMS_BT_PREFIX}/trigger/${mode}.json")"
        else
          echo "Cancelled."
        fi
        ;;
      28)
        if confirm_action "Stop ALL BMS balancer tests?"; then
          show "$(http_get "${BMS_BT_PREFIX}/stop.json")"
        else
          echo "Cancelled."
        fi
        ;;
      29)
        testid="$(ask 'testID (or B to go back)')"
        if [[ "$testid" =~ ^[Bb]$ || -z "$testid" ]]; then
          echo "Cancelled."
          continue
        fi
        if confirm_action "Stop BMS balancer testID=${testid}?"; then
          show "$(http_get "${BMS_BT_PREFIX}/stop.json" "?testID=${testid}")"
        else
          echo "Cancelled."
        fi
        ;;
      30)
        mode="$(select_charge_discharge)" || continue
        read -rp "arrayIndexes (e.g., 1 or 1,3-5, or B to go back): " arr_raw
        if [[ "$arr_raw" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        mapfile -t arrs < <(expand_range_list "$arr_raw")
        read -rp "stringIndexes (e.g., 1 or 1,5-10, or B to go back): " str_raw
        if [[ "$str_raw" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        mapfile -t strs < <(expand_range_list "$str_raw")
        read -rp "bmsIndexes (e.g., 1 or 1,3-5, or B to go back): " bms_raw
        if [[ "$bms_raw" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        mapfile -t bmsa < <(expand_range_list "$bms_raw")
        if ((${#arrs[@]} && ${#strs[@]} && ${#bmsa[@]})) && confirm_action "Trigger BMS balancer for selected arrays/strings/BMS in ${mode} mode?"; then
          arr_csv="$(IFS=,; echo "${arrs[*]}")"
          str_csv="$(IFS=,; echo "${strs[*]}")"
          bms_csv="$(IFS=,; echo "${bmsa[*]}")"
          qs="?arrayIndexes=${arr_csv}&stringIndexes=${str_csv}&bmsIndexes=${bms_csv}"
          show "$(http_get "${BMS_BT_PREFIX}/trigger/${mode}.json" "$qs")"
        else
          echo "Cancelled or no indexes."
        fi
        ;;
      31) show "$(http_get "${BMS_BT_PREFIX}/status.json")" ;;
      32)
        testid="$(ask 'testID (or B to go back)')"
        if [[ "$testid" =~ ^[Bb]$ || -z "$testid" ]]; then
          echo "Cancelled."
          continue
        fi
        show "$(http_get "${BMS_BT_PREFIX}/report.csv" "?testID=${testid}")"
        ;;

      # ---------- HEAT SOAK ----------
      33)
        seg="$(num 'Segment Index (or B to go back)')"
        sp="$(num 'Temperature Setpoint (°C, or B to go back)')"
        if [[ -n "$seg" && -n "$sp" ]] && confirm_action "Start EMS enclosure heat soak at ${sp}°C for segment ${seg}?"; then
          show "$(http_get "tools/controls/ems/heatsoak/start/blockEnclosure/${seg}/temperatureSetpoint/${sp}")"
        else
          echo "Cancelled."
        fi
        ;;
      34)
        seg="$(num 'Segment Index (or B to go back)')"
        if [[ -n "$seg" ]] && confirm_action "Stop EMS enclosure heat soak for segment ${seg}?"; then
          show "$(http_get "tools/controls/ems/heatsoak/stop/blockEnclosure/${seg}")"
        else
          echo "Cancelled."
        fi
        ;;

      # ---------- REPORTS ----------
      35) show "$(http_get "tools/report/ems/status.json")" ;;
      36) show "$(http_get "tools/report/ems/bessStatusCodes.json")" ;;
      37) show "$(http_get "tools/report/ems/controllerStatistics.json")" ;;
      38) show "$(http_get "tools/report/ems/lastCall.json")" ;;
      39)
        if prompt_arrays_list; then
          for a in "${_ARRAYS[@]}"; do
            show "$(http_get "tools/report/ems/array/${a}/report.json")"
            sleep "$PAUSE_SECONDS"
          done
        fi
        ;;
      40)
        if prompt_arrays_list; then
          for a in "${_ARRAYS[@]}"; do
            show "$(http_get "tools/report/ems/array/${a}/notifications.json")"
            sleep "$PAUSE_SECONDS"
          done
        fi
        ;;
      41)
        if prompt_arrays_list && prompt_strings_list; then
          for a in "${_ARRAYS[@]}"; do
            for s in "${_STRINGS[@]}"; do
              show "$(http_get "tools/report/ems/array/${a}/string/${s}/report.json")"
              sleep "$PAUSE_SECONDS"
            done
          done
        fi
        ;;
      42)
        if prompt_arrays_list && prompt_strings_list; then
          for a in "${_ARRAYS[@]}"; do
            for s in "${_STRINGS[@]}"; do
              show "$(http_get "tools/report/ems/array/${a}/string/${s}/notifications.json")"
              sleep "$PAUSE_SECONDS"
            done
          done
        fi
        ;;
      43)
        host="$(ask 'Host (or B to go back)')"
        if [[ "$host" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        port="$(num 'Port (or B to go back)')"
        unit="$(num 'UnitId (or B to go back)')"
        type="$(select_modbus_type)" || continue
        start="$(num 'Start (or B to go back)')"
        count="$(num 'Count (or B to go back)')"
        filefmt="$(select_file_format)" || continue
        timeout="$(num 'Timeout (ms, or B to go back)' '1000')"
        repeat="$(num 'Repeat count (or B to go back)' '1')"
        delay="$(num 'Repeat delay (ms, or B to go back)' '1000')"
        if [[ -z "$host" || -z "$port" || -z "$unit" || -z "$start" || -z "$count" ]]; then
          echo "Cancelled."
          continue
        fi
        if confirm_action "Run Modbus poll on ${host}:${port} unitId=${unit}?"; then
          qs="?timeout=${timeout}&repeatCount=${repeat}&repeatDelayMilliseconds=${delay}"
          path="tools/report/modbus/poll/tcp/host/${host}/port/${port}/unitId/${unit}/type/${type}/start/${start}/count/${count}/data.${filefmt}"
          show "$(http_get "$path" "$qs")"
        else
          echo "Cancelled."
        fi
        ;;

      # ---------- EXTRA REPORTS / MAPS ----------
      44)
        if prompt_arrays_list; then
          read -rp "PCS index(es) (e.g., 1 or 1,3-5, or B to go back): " pcs_raw
          if [[ "$pcs_raw" =~ ^[Bb]$ ]]; then
            echo "Cancelled."
            continue
          fi
          mapfile -t pcs < <(expand_range_list "$pcs_raw")
          if ((${#pcs[@]})); then
            for a in "${_ARRAYS[@]}"; do
              for p in "${pcs[@]}"; do
                show "$(http_get "tools/report/ems/array/${a}/pcs/${p}/report.json")"
                sleep "$PAUSE_SECONDS"
              done
            done
          else
            echo "No PCS indexes provided."
          fi
        fi
        ;;
      45)
        read -rp "AC Battery index(es) (e.g., 1 or 1,3-5, or B to go back): " ac_raw
        if [[ "$ac_raw" =~ ^[Bb]$ ]]; then
          echo "Cancelled."
          continue
        fi
        mapfile -t acs < <(expand_range_list "$ac_raw")
        if ((${#acs[@]})); then
          for ac in "${acs[@]}"; do
            show "$(http_get "tools/report/ems/acbattery/${ac}/availability.json")"
            sleep "$PAUSE_SECONDS"
          done
        else
          echo "No AC battery indexes provided."
        fi
        ;;
      46) show "$(http_get "tools/report/ems/stringIPMap.csv")" ;;
      47) show "$(http_get "tools/report/ems/ipMap.csv")" ;;
      48) show "$(http_get "tools/report/ems/modbus_map.csv")" ;;
      49) show "$(http_get "tools/report/ems/strings.csv")" ;;

      # ---------- CONFIG ----------
      50) show_base_url ;;
      51) change_base_url ;;

      *)
        echo "Unknown selection."
        ;;
    esac
  done
}

menu
