#!/usr/bin/env bash
# new_feather_comms.sh — fixed-width table with progress + summaries (buffered, proxy-proof)
set -euo pipefail

# -------- Config -------------------------------------------------------------
PORT=8080
PATH_JSON="/feather/status/report.json"
CONNECT_TIMEOUT=4
MAX_TIME=6
USER_AGENT="curl/feather-check"

# ARRAYS_ALLOWED for 'all' expansion (compatible with batch_configure_site_layout.sh):
#   "auto" | "1-8" | "1,2,5-7,12"
ARRAYS_ALLOWED="${ARRAYS_ALLOWED:-auto}"

# Incomplete detection threshold (effective n/a count after ignore rules)
INCOMPLETE_NA_THRESHOLD="${INCOMPLETE_NA_THRESHOLD:-6}"

# Fixed column widths (left aligned)
W_ARRAY=5; W_IP=15; W_FW=10; W_ST=8; W_CT=8; W_FSSV=10; W_LEAK=9; W_LOUV=11
W_DVALID=10; W_BATT=9; W_TC=7; W_DC=7; W_AC=7; W_OP=10; W_LOST=22
SEP=" "

# ANSI colors
CLR_RESET=$'\e[0m'
CLR_RED=$'\e[31m'
CLR_GREEN=$'\e[32m'
CLR_YELLOW=$'\e[33m'
CLR_BLUE=$'\e[34m'
CLR_CYAN=$'\e[36m'
CLR_MAGENTA=$'\e[35m'

# Progress (stderr so table stays clean)
PROGRESS="${PROGRESS:-1}"
progress_begin() { (( PROGRESS )) && printf "Collecting %s " "${1:-...}" >&2; }
progress_tick()  { (( PROGRESS )) && printf "." >&2; }
progress_end()   { (( PROGRESS )) && printf " done\n" >&2; }

# -------- Helpers ------------------------------------------------------------
minify_json() { tr -d '\r\n' | sed -E 's/[[:space:]]+//g'; }

jget_obj_field() {
  echo "$1" \
  | sed -nE "s/.*\"$2\":\{([^}]*)\}.*/\1/p" \
  | sed -nE "s/.*\"$3\":([^,}]*).*/\1/p" \
  | head -n1
}

jget_obj_valid() {
  echo "$1" \
  | sed -nE "s/.*\"$2\":\{([^}]*)\}.*/\1/p" \
  | sed -nE 's/.*\"valid\":([^,}]*).*/\1/p' \
  | head -n1
}

strip_quotes() { sed -E 's/^"?(.*)"?$/\1/'; }

jget_lost_comms() {
  local arr
  arr=$(echo "$1" | sed -nE 's/.*"devicesWithLostComms":\[(.*)\].*/\1/p' | head -n1)
  [[ -z "$arr" ]] && arr=$(echo "$1" | sed -nE 's/.*"deviceWithLostComms":\[(.*)\].*/\1/p' | head -n1)
  if [[ -z "$arr" ]]; then echo "none"; return; fi
  arr=$(echo "$arr" | sed -E 's/"//g;s/[[:space:]]+//g')
  [[ -z "$arr" ]] && echo "none" || echo "$arr"
}

expand_numbers() {
  local IFS=',' part a b n out=()
  for part in $1; do
    part="${part//[[:space:]]/}"; [[ -z "$part" ]] && continue
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      a="${BASH_REMATCH[1]}"; b="${BASH_REMATCH[2]}"
      if (( a <= b )); then for ((n=a;n<=b;n++)); do out+=("$n"); done
      else for ((n=a;n>=b;n--)); do out+=("$n"); done
      fi
    elif [[ "$part" =~ ^[0-9]+$ ]]; then out+=("$part")
    else echo "Invalid token: $part" >&2; return 1
    fi
  done
  printf "%s\n" "${out[@]}"
}

expand_arrays_allowed() {
  local aa="${ARRAYS_ALLOWED//[[:space:]]/}"
  if [[ -z "$aa" || "$aa" == "auto" ]]; then return 1; fi
  if [[ "$aa" =~ ^[0-9]+$ ]]; then seq 1 "$aa"; else expand_numbers "$aa"; fi
}

hosts_for_array() { printf "3 "; local h; for ((h=10; h<=105; h+=5)); do printf "%s " "$h"; done; echo; }

# ---- Formatting & Coloring --------------------------------------------------
fmt4() {
  local v="$1" lc; lc=$(echo "$v" | tr '[:upper:]' '[:lower:]')
  if [[ "$lc" == "n/a" || -z "$v" || "$v" == "null" ]]; then echo "n/a"; return; fi
  if [[ ! "$v" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then echo "$v"; return; fi
  local out; out=$(awk -v x="$v" 'BEGIN{ if (x>=100 || x<=-100) printf "%.0f", x; else printf "%.1f", x; }')
  echo "${out:0:4}"
}

color_header() { printf "%s" "$1"; }

color_general() {
  local v="$1" lc; lc=$(echo "$v" | tr '[:upper:]' '[:lower:]')
  if [[ "$lc" == "n/a" ]]; then printf "%s%s%s" "$CLR_CYAN" "$v" "$CLR_RESET"; return; fi
  if [[ "$lc" == *"alarm"* || "$lc" == *"fault"* || "$lc" == *"trouble"* || "$lc" == *"warn"* ]]; then
    printf "%s%s%s" "$CLR_MAGENTA" "$v" "$CLR_RESET"; return
  fi
  if [[ "$lc" == *"true"* || "$lc" == *"normal"* ]]; then
    printf "%s%s%s" "$CLR_GREEN" "$v" "$CLR_RESET"
  elif [[ "$lc" == *"false"* || "$lc" == *"disabled"* ]]; then
    printf "%s%s%s" "$CLR_RED" "$v" "$CLR_RESET"
  else
    printf "%s" "$v"
  fi
}

color_leak() {
  local v="$1" lc; lc=$(echo "$v" | tr '[:upper:]' '[:lower:]')
  if [[ -z "$v" || "$lc" == "n/a" ]]; then printf "%s%s%s" "$CLR_CYAN" "${v:-n/a}" "$CLR_RESET"; return; fi
  if [[ "$lc" == "true" ]]; then printf "%s%s%s" "$CLR_RED"   "$v" "$CLR_RESET"; return; fi
  if [[ "$lc" == "false" ]]; then printf "%s%s%s" "$CLR_GREEN" "$v" "$CLR_RESET"; return; fi
  color_general "$v"
}

color_louver() {
  local v="$1" lc; lc=$(echo "$v" | tr '[:upper:]' '[:lower:]')
  if [[ -z "$v" || "$lc" == "n/a" ]]; then printf "%s%s%s" "$CLR_CYAN" "${v:-n/a}" "$CLR_RESET"; return; fi
  if [[ "$lc" == "open" ]];   then printf "%sopen%s"   "$CLR_RED"   "$CLR_RESET"; return; fi
  if [[ "$lc" == "closed" ]]; then printf "%sclosed%s" "$CLR_GREEN" "$CLR_RESET"; return; fi
  color_general "$v"
}

color_temp() {
  local v="$1" lc; lc=$(echo "$v" | tr '[:upper:]' '[:lower:]')
  if [[ "$lc" == "n/a" ]]; then printf "%s%s%s" "$CLR_CYAN" "$v" "$CLR_RESET"; return; fi
  if [[ ! "$v" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then printf "%s" "$v"; return; fi
  local band; band=$(awk -v x="$v" 'BEGIN{ if (x<=28) print "blue"; else if (x<=35) print "yellow"; else print "red"; }')
  case "$band" in
    blue)   printf "%s%s%s" "$CLR_BLUE" "$v" "$CLR_RESET" ;;
    yellow) printf "%s%s%s" "$CLR_YELLOW" "$v" "$CLR_RESET" ;;
    red)    printf "%s%s%s" "$CLR_RED" "$v" "$CLR_RESET" ;;
  esac
}

color_fw_cell() {
  local v="$1"
  if [[ "$v" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    local min="${BASH_REMATCH[2]}"; local rev="${BASH_REMATCH[3]}"
    if   (( min == 73 && rev == 18 )); then printf "%s%s%s" "$CLR_GREEN"  "$v" "$CLR_RESET"; return
    elif (( min == 71 ));             then printf "%s%s%s" "$CLR_YELLOW" "$v" "$CLR_RESET"; return
    elif (( min < 71 ));              then printf "%s%s%s" "$CLR_RED"    "$v" "$CLR_RESET"; return
    fi
  fi
  printf "%s" "$v"
}

color_lost() {
  local v="$1" lc; lc=$(echo "$v" | tr '[:upper:]' '[:lower:]')
  if [[ "$lc" == "none" ]]; then
    printf "%s%s%s" "$CLR_CYAN" "$v" "$CLR_RESET"
  else
    printf "%s%s%s" "$CLR_MAGENTA" "$v" "$CLR_RESET"
  fi
}

make_field() {
  local width="$1" content="$2" fn="$3"
  local show="$content"
  (( ${#show} > width )) && show="${show:0:width}"
  local pad=$(( width - ${#show} ))
  local colored; colored="$($fn "$show")"
  printf "%s%*s" "$colored" "$pad" ""
}

print_header_row() {
  local F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13 F14 F15
  F1="$(make_field  $W_ARRAY  "Array"     color_header)"
  F2="$(make_field  $W_IP     "IP"        color_header)"
  F3="$(make_field  $W_FW     "Fw"        color_header)"
  F4="$(make_field  $W_ST     "SpaceT"    color_header)"
  F5="$(make_field  $W_CT     "CellT"     color_header)"
  F6="$(make_field  $W_FSSV   "FSS.Valid" color_header)"
  F7="$(make_field  $W_LEAK   "leakAlarm" color_header)"
  F8="$(make_field  $W_LOUV   "louverOpen" color_header)"
  F9="$(make_field  $W_DVALID "doorsValid" color_header)"
  F10="$(make_field $W_BATT   "battDoor"  color_header)"
  F11="$(make_field $W_TC     "tcDoor"    color_header)"
  F12="$(make_field $W_DC     "dcDoor"    color_header)"
  F13="$(make_field $W_AC     "acDoor"    color_header)"
  F14="$(make_field $W_OP     "opState"   color_header)"
  F15="$(make_field $W_LOST   "lostComms" color_header)"
  printf "%s\n" "$F1$SEP$F2$SEP$F3$SEP$F4$SEP$F5$SEP$F6$SEP$F7$SEP$F8$SEP$F9$SEP$F10$SEP$F11$SEP$F12$SEP$F13$SEP$F14$SEP$F15"
}

print_sep() {
  local total=$(( W_ARRAY+1 + W_IP+1 + W_FW+1 + W_ST+1 + W_CT+1 + W_FSSV+1 + W_LEAK+1 + W_LOUV+1 + W_DVALID+1 + W_BATT+1 + W_TC+1 + W_DC+1 + W_AC+1 + W_OP+1 + W_LOST ))
  printf '%*s\n' "$total" '' | tr ' ' '-'
}

fetch_json() {
  curl -sS --fail --compressed --noproxy "*" \
    --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
    -H "Accept: application/json" -A "$USER_AGENT" \
    "http://$1:${PORT}${PATH_JSON}" || true
}

# -------- Row printer (stdout only) ------------------------------------------
print_row() {
  local a="$1" ip="$2" fw="$3" st="$4" ct="$5" fssv="$6" leak="$7" louv="$8" dval="$9" batt="${10}" tc="${11}" dc="${12}" ac="${13}" op="${14}" lost="${15}"

  st="$(fmt4 "$st")"
  ct="$(fmt4 "$ct")"

  local louv_show
  case "$(echo "$louv" | tr '[:upper:]' '[:lower:]')" in
    true)  louv_show="open" ;;
    false) louv_show="closed" ;;
    *)     louv_show="${louv:-n/a}" ;;
  esac

  local F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13 F14 F15
  F1="$(make_field  $W_ARRAY  "$a"         color_general)"
  F2="$(make_field  $W_IP     "$ip"        color_general)"
  F3="$(make_field  $W_FW     "$fw"        color_fw_cell)"
  F4="$(make_field  $W_ST     "$st"        color_temp)"
  F5="$(make_field  $W_CT     "$ct"        color_temp)"
  F6="$(make_field  $W_FSSV   "$fssv"      color_general)"
  F7="$(make_field  $W_LEAK   "$leak"      color_leak)"
  F8="$(make_field  $W_LOUV   "$louv_show" color_louver)"
  F9="$(make_field  $W_DVALID "$dval"      color_general)"
  F10="$(make_field $W_BATT   "$batt"      color_general)"
  F11="$(make_field $W_TC     "$tc"        color_general)"
  F12="$(make_field $W_DC     "$dc"        color_general)"
  F13="$(make_field $W_AC     "$ac"        color_general)"
  F14="$(make_field $W_OP     "$op"        color_general)"
  F15="$(make_field $W_LOST   "$lost"      color_lost)"

  printf "%s\n" "$F1$SEP$F2$SEP$F3$SEP$F4$SEP$F5$SEP$F6$SEP$F7$SEP$F8$SEP$F9$SEP$F10$SEP$F11$SEP$F12$SEP$F13$SEP$F14$SEP$F15"
}

# -------- Core per-IP processing + summary flags -----------------------------
process_ip() {
  local arr="$1" ip="$2" na_file="${3:-}" inc_file="${4:-}"
  local raw j
  raw="$(fetch_json "$ip")"
  if [[ -z "$raw" ]]; then
    [[ -n "$na_file"  ]] && printf '%s\n' "$ip" >>"$na_file"
    [[ -n "$inc_file" ]] && printf '%s\n' "$ip" >>"$inc_file"
    print_row "$arr" "$ip" "n/a" "n/a" "n/a" "false" "false" "false" "false" "false" "false" "false" "false" "unreachable" "none"
    return
  fi

  j="$(echo "$raw" | minify_json)"

  local fwMaj fwMin fwRev fw
  fwMaj=$(jget_obj_field "$j" "turtleVersion" "fwVersionMajor" | strip_quotes)
  fwMin=$(jget_obj_field "$j" "turtleVersion" "fwVersionMinor" | strip_quotes)
  fwRev=$(jget_obj_field "$j" "turtleVersion" "fwVersionRevision" | strip_quotes)
  if [[ -z "$fwMaj$fwMin$fwRev" ]]; then
    local inner
    inner=$(echo "$j" | sed -nE 's/.*"fromFeatherControllerStatistcsReport":\{([^}]*)\}.*/\1/p' | head -n1)
    if [[ -n "$inner" ]]; then
      fwMaj=$(echo "$inner" | sed -nE 's/.*"fwVersionMajor":([0-9]+).*/\1/p' | head -n1)
      fwMin=$(echo "$inner" | sed -nE 's/.*"fwVersionMinor":([0-9]+).*/\1/p' | head -n1)
      fwRev=$(echo "$inner" | sed -nE 's/.*"fwVersionRevision":([0-9]+).*/\1/p' | head -n1)
    fi
  fi
  if [[ -z "$fwMaj$fwMin$fwRev" ]]; then fw="n/a"; else fw="${fwMaj:-n/a}.${fwMin:-n/a}.${fwRev:-n/a}"; fi

  local spaceT cellT fssValid leakAlarm louverOpen doorsValid battDoor tcDoor dcDoor acDoor
  spaceT=$(jget_obj_field "$j" "thermalData" "spaceTemperature" | strip_quotes)
  cellT=$(jget_obj_field "$j" "thermalData" "avgCellTemperature" | strip_quotes)
  fssValid=$(jget_obj_valid "$j" "fssSignals")
  leakAlarm=$(jget_obj_field "$j" "fssSignals" "leakAlarm")
  louverOpen=$(jget_obj_field "$j" "fssSignals" "louverOpen")
  doorsValid=$(jget_obj_valid "$j" "doors")
  battDoor=$(jget_obj_field "$j" "doors" "batteryDoorsClosed")
  tcDoor=$(jget_obj_field "$j" "doors" "lowerTopcapClosed")
  [[ -z "$tcDoor" ]] && tcDoor=$(jget_obj_field "$j" "doors" "lowerTopCapClosed")
  dcDoor=$(jget_obj_field "$j" "doors" "dcDoorsClosed")
  acDoor=$(jget_obj_field "$j" "doors" "acDoorsClosed")

  local host_octet="${ip##*.}"
  if [[ "$ip" =~ \.3$ ]]; then
    cellT="n/a"; louverOpen="n/a"; battDoor="n/a"
  fi
  if (( host_octet >= 10 && host_octet <= 105 && host_octet % 5 == 0 )); then
    dcDoor="n/a"; acDoor="n/a"
  fi

  local opState lost
  opState=$(echo "$j" | sed -nE 's/.*"operationalState":"?([^",}]*)"?[},].*/\1/p' | head -n1)
  [[ -z "$opState" ]] && opState="n/a"
  lost=$(jget_lost_comms "$j")

  for v in spaceT cellT fssValid leakAlarm louverOpen doorsValid battDoor tcDoor dcDoor acDoor opState; do
    [[ -z "${!v:-}" ]] && printf -v "$v" "n/a"
  done

  # -------- summary counters (apply ignore rules) --------
  local eff_na=0
  count_na() { [[ "${1:-}" == "n/a" ]] && eff_na=$((eff_na+1)); }

  # Ignore these for .3 hosts:
  if [[ ! "$ip" =~ \.3$ ]]; then
    count_na "$cellT"
    count_na "$battDoor"
    count_na "$louverOpen"   # <— added: don't penalize .3 if this is n/a
  fi

  # Ignore these for every x.10, x.15, ... x.105:
  if ! (( host_octet >= 10 && host_octet <= 105 && host_octet % 5 == 0 )); then
    count_na "$dcDoor"
    count_na "$acDoor"
  fi

  # Everything else always counts toward n/a:
  for fld in "$fw" "$spaceT" "$fssValid" "$leakAlarm" "$doorsValid" "$tcDoor" "$opState"; do
    count_na "$fld"
  done
  # ------------------------------------------------------

  [[ -n "$na_file"  && $eff_na -gt 0 ]] && printf '%s\n' "$ip" >>"$na_file"
  if [[ -n "$inc_file" ]]; then
    if [[ "${opState,,}" == *"unreach"* || $eff_na -ge $INCOMPLETE_NA_THRESHOLD ]]; then
      printf '%s\n' "$ip" >>"$inc_file"
    fi
  fi

  print_row "$arr" "$ip" "$fw" "$spaceT" "$cellT" "$fssValid" "$leakAlarm" "$louverOpen" "$doorsValid" "$battDoor" "$tcDoor" "$dcDoor" "$acDoor" "$opState" "$lost"
}

# -------- UI / Flow (buffered per-array) ------------------------------------
print_section_header() {
  local arr="$1"
  printf "\n===== ARRAY %s =====\n" "$arr"
  print_header_row
  print_sep
}

run_for_arrays() {
  local arrays=("$@") a host ip
  for a in "${arrays[@]}"; do
    print_section_header "$a"

    # temp files for rows and summaries
    local tmprows nafile incfile
    tmprows="$(mktemp)"; nafile="$(mktemp)"; incfile="$(mktemp)"

    progress_begin "Array ${a}"
    set +e
    while read -r host; do
      [[ -z "$host" ]] && continue
      ip="10.0.${a}.${host}"
      process_ip "$a" "$ip" "$nafile" "$incfile" >>"$tmprows"
      progress_tick
    done < <(hosts_for_array | tr ' ' '\n')
    set -e
    progress_end

    [[ -s "$tmprows" ]] && cat "$tmprows"

    if [[ -s "$nafile" ]]; then
      echo "IPs with missing data (n/a): $(tr '\n' ' ' < "$nafile" | sed 's/[[:space:]]*$//')"
    else
      echo "IPs with missing data (n/a): none"
    fi
    if [[ -s "$incfile" ]]; then
      echo "Devices with INCOMPLETE report: $(tr '\n' ' ' < "$incfile" | sed 's/[[:space:]]*$//')"
    else
      echo "Devices with INCOMPLETE report: none"
    fi

    # explicit cleanup (no traps → no unset-var surprises)
    rm -f "$tmprows" "$nafile" "$incfile"
  done
}

run_for_single_ips() {
  local input="$1" first arr item start end i host ip
  first="${input%%,*}"; first="${first%% *}"
  if [[ "$first" =~ ^10\.0\.([0-9]+)\.([0-9]+)(-[0-9]+)?$ ]]; then
    arr="${BASH_REMATCH[1]}"
  else
    echo "Invalid IP format. Use e.g. 10.0.3.10 or comma/range within same array." >&2
    return 1
  fi

  local tmprows nafile incfile
  tmprows="$(mktemp)"; nafile="$(mktemp)"; incfile="$(mktemp)"

  printf "\n===== SINGLE %s (Array %s) =====\n" "$input" "$arr"
  print_header_row
  print_sep

  IFS=',' read -r -a items <<< "$input"
  progress_begin "(single)"
  set +e
  for item in "${items[@]}"; do
    if [[ "$item" =~ ^10\.0\.([0-9]+)\.([0-9]+)-([0-9]+)$ ]]; then
      start="${BASH_REMATCH[2]}"; end="${BASH_REMATCH[3]}"
      if (( start <= end )); then
        for ((i=start;i<=end;i++)); do ip="10.0.${arr}.${i}"; process_ip "$arr" "$ip" "$nafile" "$incfile" >>"$tmprows"; progress_tick; done
      else
        for ((i=start;i>=end;i--)); do ip="10.0.${arr}.${i}"; process_ip "$arr" "$ip" "$nafile" "$incfile" >>"$tmprows"; progress_tick; done
      fi
    elif [[ "$item" =~ ^10\.0\.([0-9]+)\.([0-9]+)$ ]]; then
      host="${BASH_REMATCH[2]}"; ip="10.0.${arr}.${host}"; process_ip "$arr" "$ip" "$nafile" "$incfile" >>"$tmprows"; progress_tick
    fi
  done
  set -e
  progress_end

  [[ -s "$tmprows" ]] && cat "$tmprows"

  if [[ -s "$nafile" ]]; then
    echo "IPs with missing data (n/a): $(tr '\n' ' ' < "$nafile" | sed 's/[[:space:]]*$//')"
  else
    echo "IPs with missing data (n/a): none"
  fi
  if [[ -s "$incfile" ]]; then
    echo "Devices with INCOMPLETE report: $(tr '\n' ' ' < "$incfile" | sed 's/[[:space:]]*$//')"
  else
    echo "Devices with INCOMPLETE report: none"
  fi

  rm -f "$tmprows" "$nafile" "$incfile"
}

# Resolve an array selection string ("all", "1,3-5", etc.) into a list of array numbers.
resolve_arrays() {
  local sel="$1"
  local -a out=()
  if [[ "${sel,,}" == "all" ]]; then
    if mapfile -t out < <(expand_arrays_allowed); then :; fi
  fi
  if [[ "${sel,,}" != "all" || ${#out[@]} -eq 0 ]]; then
    mapfile -t out < <(expand_numbers "$sel")
  fi
  ((${#out[@]})) || return 1
  printf '%s\n' "${out[@]}"
}

main() {
  local MODE="" ARRSEL="" IPS=""

  while :; do
    echo
    echo "Select mode:"
    echo "  1) Array mode   (arrays 1-8, comma list, or range like 1-3, or 'all')"
    echo "  2) Single IP    (e.g., 10.0.3.10, comma list, or range like 10.0.3.10-25)"
    echo "  0) Exit"
    read -rp "Select 1/2 [1]: " SEL
    SEL="${SEL:-1}"

    case "${SEL,,}" in
      1|array|arrays)
        MODE="array"
        echo "array number(s) (single, comma list, range like 1-3, or 'all')"
        read -r ARRSEL
        ;;
      2|single)
        MODE="single"
        echo "enter IP address (single, comma list, or simple range like 10.0.3.10-25)"
        read -r IPS
        ;;
      0|q|quit|exit)
        exit 0
        ;;
      *)
        echo "Invalid selection. Choose 1 (Array), 2 (Single), or 0 to Exit." >&2
        continue
        ;;
    esac

    # ---- Run + post-run re-run menu loop (only inside this sibling script) ----
    while :; do
      case "$MODE" in
        array)
          local ARRLIST=()
          if ! mapfile -t ARRLIST < <(resolve_arrays "$ARRSEL"); then
            echo "No arrays selected." >&2
            break
          fi
          run_for_arrays "${ARRLIST[@]}"
          ;;
        single)
          if [[ -z "$IPS" ]]; then
            echo "No IPs provided." >&2
            break
          fi
          run_for_single_ips "$IPS"
          ;;
      esac

      echo
      echo "----------------------------------------"
      echo "1) Re-run with same inputs"
      echo "2) Change selection/inputs"
      echo "0) Exit"
      read -rp "Select 1/2/0 [1]: " AGAIN
      AGAIN="${AGAIN:-1}"
      case "${AGAIN,,}" in
        1)  # run again with the SAME MODE and SAME inputs
            continue
            ;;
        2)  # change selection/inputs (break to outer mode menu)
            break
            ;;
        0|q|quit|exit)
            exit 0
            ;;
        *)
            echo "Unknown selection; re-running with same inputs."
            continue
            ;;
      esac
    done
    # --------------------------------------------------------------------------
  done
}

main
