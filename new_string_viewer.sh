#!/usr/bin/env bash
set -euo pipefail

# --- Config ---------------------------------------------------------------
BASE_URL="http://10.0.0.3:8080/turtle/tools/monitor/ems/stringviewer"

# ---- Progress (stderr; set PROGRESS=0 to disable) -------------------
PROGRESS="${PROGRESS:-1}"
progress_begin() { (( PROGRESS )) && printf "%s" "${1:-Working}" >&2; }
progress_tick()  { (( PROGRESS )) && printf "." >&2; }
progress_end()   { (( PROGRESS )) && printf " done\n" >&2; }


# Allow arrays "all" → expands using ARRAYS_ALLOWED / ARRAYS_ALL_MAX
ARRAYS_ALL_MAX=8

# Technician-configurable selection caps/lists
# ARRAYS_ALLOWED:
#   - "1-8"  → expands to 1..8
#   - "1,2,5-7,12" → explicit list with gaps allowed
#   - "auto" → fallback to ARRAYS_ALL_MAX when user types "all"
ARRAYS_ALLOWED="8"

# STRINGS_ALLOWED:
#   - "auto" → detect per array (legacy behavior)
#   - "1-42" / "1,2,5-10" → fixed cap/list; filtered to existing per array
STRINGS_ALLOWED="40"

# Auto-refresh interval (seconds) when enabled for a single string
REFRESH_SECS=5

# Color helpers
CLR_RESET="\e[0m"
CLR_GREEN="\e[32m"
CLR_YELLOW="\e[33m"
CLR_RED="\e[31m"
CLR_CYAN="\e[36m"   # teal-ish for temperature deltas in delta-only grid
CLR_HEADER="\e[1m"

# Voltage coloring thresholds relative to row avg (mV)
V_GREEN_MAX=25; V_YELLOW_MAX=250
# Temperature coloring thresholds relative to row avg (°C)
T_GREEN_MAX=2;  T_YELLOW_MAX=5

# Fixed widths (full tables; unchanged)
W_BP=5; W_VCOL=5; W_TCOL=3; V_SUM_PAD=2; T_SUM_PAD=1

# --- Delta per-BPC grid widths (DELTA-ONLY MODE) --------------------------
# Cells print as left-aligned "<V>/<T>" (numbers colored; widths fixed).
GRID_VW=5        # width for V (mV)
GRID_TW=4        # width for T (°C)
W_GRID_CELL=$((GRID_VW + 1 + GRID_TW))  # slash counts as 1
W_GRID_GAP=1
W_GRID_STR=10    # "String" column width
BPC_COLS=14

# Use ASCII in header by default to avoid double-width Δ issues
USE_UNICODE_DELTA=0   # set to 1 if you prefer "VΔ/TΔ" and your terminal handles it

# (Legacy list widths retained but unused in the new grid)
W_DARR=7; W_DSTR=8; W_DVD=10; W_DTD=10

# --- Helpers --------------------------------------------------------------
url_for() { printf "%s/array/%s/%s/data" "$BASE_URL" "$1" "$2"; }
fetch_json() {
  # No cookies required; resilient timeouts
  curl -s --compressed --connect-timeout 3 --max-time 5 \
       "$(url_for "$1" "$2")" || true
}

detect_string_count() {
  local array="$1" max=64 last_good=0
  for s in $(seq 1 $max); do
    if fetch_json "$array" "$s" | jq -e '.stringViewerDataModel.stringIndex? // empty' >/dev/null 2>&1; then
      last_good="$s"
    else
      break
    fi
  done
  printf "%d" "$last_good"
}

jq_rows() {
  local mapname="$1"
  jq -r --arg MAP "$mapname" '
    .stringViewerDataModel as $m
    | ($m.cellGroupCount // 30) as $cg
    | [ $m[$MAP].batteryPacks
        | to_entries | sort_by(.key|tonumber)
        | .[].value.cellGroups ] as $packs
    | foreach range(0; ($packs|length)) as $i (null;
        ( [ range(1; ($cg+1)) as $j
            | ( $packs[$i][($j|tostring)].value // 0 | tonumber ) ] ) as $vals
        | ($vals|length) as $n
        | ($n as $n | if $n==0 then 0 else ($vals|add / $n | round) end) as $avg
        | ($vals|max) as $max
        | ($vals|min) as $min
        | ($max - $min) as $delta
        | ([$i+1] + $vals + [($avg), ($max), ($min), ($delta)]) | @tsv
      )'
}

# Compute per-string "max delta" (kept for completeness; not used in grid)
get_string_deltas() {
  local array="$1" str="$2" json vdel tdel
  json="$(fetch_json "$array" "$str")"
  if [[ -z "$json" ]]; then echo "0 0"; return; fi

  vdel="$(
    printf '%s' "$json" | jq -r '
      .stringViewerDataModel as $m
      | ($m.cellGroupCount // 30) as $cg
      | [ $m.voltageMap.batteryPacks
          | to_entries | sort_by(.key|tonumber)
          | .[].value.cellGroups ] as $packs
      | ( [ range(0; ($packs|length)) as $i
            | ( [ range(1; ($cg+1)) as $j
                  | ( $packs[$i][($j|tostring)].value // 0 | tonumber ) ] ) as $vals
            | (( ($vals|max) - ($vals|min) ) // 0)
          ] | (max // 0) )' 2>/dev/null || echo 0
  )"

  tdel="$(
    printf '%s' "$json" | jq -r '
      .stringViewerDataModel as $m
      | ($m.cellGroupCount // 30) as $cg
      | [ $m.temperatureMap.batteryPacks
          | to_entries | sort_by(.key|tonumber)
          | .[].value.cellGroups ] as $packs
      | ( [ range(0; ($packs|length)) as $i
            | ( [ range(1; ($cg+1)) as $j
                  | ( $packs[$i][($j|tostring)].value // 0 | tonumber ) ] ) as $vals
            | (( ($vals|max) - ($vals|min) ) // 0)
          ] | (max // 0) )' 2>/dev/null || echo 0
  )"

  [[ "$vdel" =~ ^-?[0-9]+$ ]] || vdel=0
  [[ "$tdel" =~ ^-?[0-9]+$ ]] || tdel=0
  printf "%s %s" "$vdel" "$tdel"
}

abs() { awk -v x="$1" 'BEGIN{print (x<0)?-x:x}'; }

paint_volt() {
  local v="$1" avg="$2" d; d=$(abs "$((v-avg))") || d=0
  if (( d <= V_GREEN_MAX )); then printf "%b%-4d%b " "$CLR_GREEN" "$v" "$CLR_RESET"
  elif (( d <= V_YELLOW_MAX )); then printf "%b%-4d%b " "$CLR_YELLOW" "$v" "$CLR_RESET"
  else printf "%b%-4d%b " "$CLR_RED" "$v" "$CLR_RESET"; fi
}

paint_temp() {
  local t="$1" avg="$2" d; d=$(abs "$((t-avg))") || d=0
  if (( d <= T_GREEN_MAX )); then printf "%b%-2d%b " "$CLR_GREEN" "$t" "$CLR_RESET"
  elif (( d <= T_YELLOW_MAX )); then printf "%b%-2d%b " "$CLR_YELLOW" "$t" "$CLR_RESET"
  else printf "%b%-2d%b " "$CLR_RED" "$t" "$CLR_RESET"; fi
}

# ASCII underline (portable)
underline() { local total_width="$1"; printf '%*s\n' "$total_width" '' | tr ' ' '-'; }

# ---- Header printers (full tables; UNCHANGED) ----------------------------
print_header_volt() {
  local total=$((W_BP + 30*W_VCOL + 4*(W_VCOL + V_SUM_PAD)))
  printf "\nCell Voltages (mV)\n"; underline "$total"
  printf "%-*s" "$W_BP" "BP"
  for i in $(seq 1 30); do printf "%-*d" "$W_VCOL" "$i"; done
  printf "%-*s" "$W_VCOL" "Avg"; printf "%*s" "$V_SUM_PAD" ""
  printf "%-*s" "$W_VCOL" "Max"; printf "%*s" "$V_SUM_PAD" ""
  printf "%-*s" "$W_VCOL" "Min"; printf "%*s" "$V_SUM_PAD" ""
  printf "%-*s\n" "$W_VCOL" "Δ"
  underline "$total"
}

print_header_temp() {
  local total=$((W_BP + 30*W_TCOL + 4*(W_TCOL + T_SUM_PAD)))
  printf "\nCell Temperatures (°C)\n"; underline "$total"
  printf "%-*s" "$W_BP" "BP"
  for i in $(seq 1 30); do printf "%-*d" "$W_TCOL" "$i"; done
  printf "%-*s" "$W_TCOL" "Avg"; printf "%*s" "$T_SUM_PAD" ""
  printf "%-*s" "$W_TCOL" "Max"; printf "%*s" "$T_SUM_PAD" ""
  printf "%-*s" "$W_TCOL" "Min"; printf "%*s" "$T_SUM_PAD" ""
  printf "%-*s\n" "$W_TCOL" "Δ"
  underline "$total"
}

render_string() {
  local array="$1" str="$2" json
  json="$(fetch_json "$array" "$str")"
  echo; echo "=== Array $array — String $str ==="

  # Voltages
  print_header_volt
  while IFS=$'\t' read -r bp v1 v2 v3 v4 v5 v6 v7 v8 v9 v10 v11 v12 v13 v14 v15 v16 v17 v18 v19 v20 v21 v22 v23 v24 v25 v26 v27 v28 v29 v30 avg max min delta; do
    printf "%-*s" "$W_BP" "BP${bp}"
    for n in $v1 $v2 $v3 $v4 $v5 $v6 $v7 $v8 $v9 $v10 $v11 $v12 $v13 $v14 $v15 $v16 $v17 $v18 $v19 $v20 $v21 $v22 $v23 $v24 $v25 $v26 $v27 $v28 $v29 $v30; do
      paint_volt "$n" "$avg"
    done
    printf "%b%-4d%b " "$CLR_GREEN" "$avg" "$CLR_RESET"; printf "%*s" "$V_SUM_PAD" ""
    paint_volt "$max" "$avg"; printf "%*s" "$V_SUM_PAD" ""
    paint_volt "$min" "$avg"; printf "%*s" "$V_SUM_PAD" ""
    printf "%-4d " "$delta"; echo
  done < <(printf '%s' "$json" | jq_rows "voltageMap")

  # Temperatures
  print_header_temp
  while IFS=$'\t' read -r bp t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17 t18 t19 t20 t21 t22 t23 t24 t25 t26 t27 t28 t29 t30 avg max min delta; do
    printf "%-*s" "$W_BP" "BP${bp}"
    for n in $t1 $t2 $t3 $t4 $t5 $t6 $t7 $t8 $t9 $t10 $t11 $t12 $t13 $t14 $t15 $t16 $t17 $t18 $t19 $t20 $t21 $t22 $t23 $t24 $t25 $t26 $t27 $t28 $t29 $t30; do
      paint_temp "$n" "$avg"
    done
    printf "%b%-2d%b " "$CLR_GREEN" "$avg" "$CLR_RESET"; printf "%*s" "$T_SUM_PAD" ""
    paint_temp "$max" "$avg"; printf "%*s" "$T_SUM_PAD" ""
    paint_temp "$min" "$avg"; printf "%*s" "$T_SUM_PAD" ""
    printf "%-2d " "$delta"; echo
  done < <(printf '%s' "$json" | jq_rows "temperatureMap")
}

# --- Delta GRID (per-BPC) -------------------------------------------------
# Helper: print a left-aligned "V/T" cell with fixed sub-widths and colors
format_cell() {
  local cell="$1" vd td
  vd="${cell%%/*}"; td="${cell##*/}"
  [[ -z "$vd" || "$vd" == "$cell" ]] && vd=0
  [[ -z "$td" ]] && td=0
  # Left-align numbers; apply color outside field widths to preserve alignment
  printf "%b%-*s%b/%b%-*s%b" \
    "$CLR_GREEN" "$GRID_VW" "$vd" "$CLR_RESET" \
    "$CLR_CYAN"  "$GRID_TW" "$td" "$CLR_RESET"
}

# For a given array+string, return exactly $BPC_COLS TSV fields, each "V/T".
# Missing packs safely become "0/0".
bpc_delta_line() {
  local array="$1" str="$2" json
  json="$(fetch_json "$array" "$str")"
  if [[ -z "$json" ]]; then
    printf '%s\t' $(yes '0/0' | head -n "$BPC_COLS"); echo
    return
  fi

  printf '%s' "$json" | jq -r --argjson COLS "$BPC_COLS" '
    .stringViewerDataModel as $m
    | ($m.cellGroupCount // 30) as $cg
    | [ $m.voltageMap.batteryPacks
        | to_entries | sort_by(.key|tonumber)
        | .[].value.cellGroups ] as $vp
    | [ $m.temperatureMap.batteryPacks
        | to_entries | sort_by(.key|tonumber)
        | .[].value.cellGroups ] as $tp
    | [ range(0; $COLS) as $i
        | ( [ range(1; ($cg+1)) as $j
              | ( ($vp[$i][($j|tostring)].value // 0) | tonumber ) ] ) as $vvals
        | ( [ range(1; ($cg+1)) as $j
              | ( ($tp[$i][($j|tostring)].value // 0) | tonumber ) ] ) as $tvals
        | ( (( ($vvals|max) - ($vvals|min) ) // 0) as $vd
            | (( ($tvals|max) - ($tvals|min) ) // 0) as $td
            | ($vd|tostring) + "/" + ($td|tostring) ) ] | @tsv
  '
}

grid_header() {
  local total=$(( W_GRID_STR + (BPC_COLS * (W_GRID_CELL + W_GRID_GAP)) ))
  printf "\nDelta Summary (per BPC)\n"; underline "$total"

  printf "%-*s" "$W_GRID_STR" "String"
  local label i
  if (( USE_UNICODE_DELTA )); then label="VΔ/TΔ"; else label="V/T"; fi
  for i in $(seq 1 "$BPC_COLS"); do
    printf "%-*s" "$W_GRID_CELL" "BPC${i} ${label}"
    printf "%*s" "$W_GRID_GAP" ""
  done
  echo
  underline "$total"
}

grid_row() {
  local str_index="$1"; shift
  local -a cells=("$@")
  printf "%-*s" "$W_GRID_STR" "String ${str_index}"
  local i
  for i in "${cells[@]}"; do
    format_cell "$i"
    printf "%*s" "$W_GRID_GAP" ""
  done
  echo
}

# Filter a provided string list to only those that exist in the array
filter_existing_strings_for_array() {
  local array="$1"; shift
  local -a in=("$@") out=() s
  local count; count="$(detect_string_count "$array")"
  for s in "${in[@]}"; do
    if (( s>=1 && s<=count )); then out+=("$s"); fi
  done
  printf "%s\n" "${out[@]}"
}

run_delta_grid() {
  local arrays_in="$1" strings_in="$2"
  local arrays=() strings=()

  mapfile -t arrays < <(expand_arrays "$arrays_in")
  ((${#arrays[@]})) || { echo "No valid arrays selected."; exit 1; }

  for a in "${arrays[@]}"; do
    echo -e "${CLR_HEADER}\n=== Array ${a} ===${CLR_RESET}"
    grid_header

    if [[ "$(echo "$strings_in" | tr '[:upper:]' '[:lower:]')" == "all" ]]; then
      if [[ "$STRINGS_ALLOWED" == "auto" ]]; then
        local count; count="$(detect_string_count "$a")"
        if (( count == 0 )); then
          echo "No strings found for array $a"
          continue
        fi
        local s
        for s in $(seq 1 "$count"); do
          IFS=$'\t' read -r -a fields < <(bpc_delta_line "$a" "$s")
          while ((${#fields[@]} < BPC_COLS)); do fields+=("0/0"); done
          grid_row "$s" "${fields[@]}"
        done
      else
        mapfile -t _raw_strings < <(expand_numbers "$STRINGS_ALLOWED")
        mapfile -t strings < <(filter_existing_strings_for_array "$a" "${_raw_strings[@]}")
        ((${#strings[@]})) || { echo "No strings found for array $a using STRINGS_ALLOWED='$STRINGS_ALLOWED'"; continue; }
        local s
        for s in "${strings[@]}"; do
          IFS=$'\t' read -r -a fields < <(bpc_delta_line "$a" "$s")
          while ((${#fields[@]} < BPC_COLS)); do fields+=("0/0"); done
          grid_row "$s" "${fields[@]}"
        done
      fi
    else
      mapfile -t strings < <(expand_numbers "$strings_in")
      ((${#strings[@]})) || { echo "No valid strings provided for array $a"; continue; }
      local s
      for s in "${strings[@]}"; do
        IFS=$'\t' read -r -a fields < <(bpc_delta_line "$a" "$s")
        while ((${#fields[@]} < BPC_COLS)); do fields+=("0/0"); done
        grid_row "$s" "${fields[@]}"
      done
    fi
  done
}

# --- Selection helpers ----------------------------------------------------
expand_numbers() {
  local input="$1" IFS=',' out=() part a b n
  for part in $input; do
    part="${part//[[:space:]]/}"
    if [[ -z "$part" ]]; then continue; fi
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      a="${BASH_REMATCH[1]}"; b="${BASH_REMATCH[2]}"
      if (( a <= b )); then for ((n=a;n<=b;n++)); do out+=("$n"); done
      else for ((n=a;n>=b;n--)); do out+=("$n"); done
      fi
    elif [[ "$part" =~ ^[0-9]+$ ]]; then
      out+=("$part")
    else
      echo "Invalid entry: $part" >&2
      return 1
    fi
  done
  printf "%s\n" "${out[@]}"
}

expand_arrays() {
  local input="$1" trimmed
  trimmed="$(echo "$input" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  if [[ "$trimmed" == "all" ]]; then
    local aa="${ARRAYS_ALLOWED//[[:space:]]/}"
    if [[ "$aa" == "auto" ]]; then
      seq 1 "$ARRAYS_ALL_MAX"
    elif [[ "$aa" =~ ^[0-9]+$ ]]; then
      seq 1 "$aa"
    else
      expand_numbers "$aa"
    fi
  else
    expand_numbers "$input"
  fi
}

is_single_number() {
  local s; s="$(echo "$1" | tr -d '[:space:]')"
  [[ "$s" =~ ^[0-9]+$ ]]
}

# --- Interactive flow -----------------------------------------------------
prompt_interactive() {
  local arrays_in strings_in confirm delta_only
  echo "which array/arrays? (number, comma list, range, or 'all' for 1-$ARRAYS_ALL_MAX)"
  read -r arrays_in

  echo "which string/strings? (number, comma list, range, or 'all')"
  read -r strings_in

  while true; do
    echo -n "deploy script y/n: "
    read -r confirm || confirm=""
    case "$(echo "${confirm:-}" | tr '[:upper:]' '[:lower:]')" in
      y|yes) break ;;
      n|no)  echo "Canceled."; exit 0 ;;
      *)     continue ;;
    esac
  done

  # Delta-only mode prompt → prints the GRID with header "BPCn V/T" (or VΔ/TΔ if enabled)
  while true; do
    echo -n "delta-only table y/n: "
    read -r delta_only || delta_only=""
    case "$(echo "${delta_only:-}" | tr '[:upper:]' '[:lower:]')" in
      y|yes) run_delta_grid "$arrays_in" "$strings_in"; exit 0 ;;
      n|no)  break ;;
      *)     continue ;;
    esac
  done

  run_deploy "$arrays_in" "$strings_in"
}

# --- Normal run (full redraw for live mode) -------------------------------
run_deploy() {
  local arrays_in="$1" strings_in="$2"
  local arrays=() strings=()

  mapfile -t arrays < <(expand_arrays "$arrays_in")
  ((${#arrays[@]})) || { echo "No valid arrays selected."; exit 1; }

  if is_single_number "$strings_in"; then
    local s; s="$(echo "$strings_in" | tr -d '[:space:]')"
    local loop_ans
    while true; do
      echo -n "enable ${REFRESH_SECS}s auto-refresh for string $s? y/n: "
      read -r loop_ans || loop_ans=""
      case "$(echo "${loop_ans:-}" | tr '[:upper:]' '[:lower:]')" in
        y|yes)
          trap 'echo; echo "Stopped."; exit 0' INT
          while true; do
            clear
            printf "%bLive update every %ss — %s%b\n" "$CLR_HEADER" "$REFRESH_SECS" "$(date)" "$CLR_RESET"
            for a in "${arrays[@]}"; do
              render_string "$a" "$s"
            done
            echo "(Press Ctrl-C to stop)"
            sleep "$REFRESH_SECS"
          done
          ;;
        n|no)  break ;;
        *)     continue ;;
      esac
    done

    clear
    printf "%bOne-time snapshot — %s%b\n" "$CLR_HEADER" "$(date)" "$CLR_RESET"
    for a in "${arrays[@]}"; do
      render_string "$a" "$s"
    done
    return
  fi

  if [[ "$(echo "$strings_in" | tr '[:upper:]' '[:lower:]')" == "all" ]]; then
    for a in "${arrays[@]}"; do
      if [[ "$STRINGS_ALLOWED" == "auto" ]]; then
        echo -e "${CLR_HEADER}Detecting available strings for Array $a ...${CLR_RESET}"
        COUNT="$(detect_string_count "$a")"
        (( COUNT == 0 )) && { echo "No strings found for array $a"; continue; }
        echo -e "Found $COUNT strings in Array $a"
        for s in $(seq 1 "$COUNT"); do render_string "$a" "$s"; done
      else
        mapfile -t _raw_strings < <(expand_numbers "$STRINGS_ALLOWED")
        mapfile -t strings < <(filter_existing_strings_for_array "$a" "${_raw_strings[@]}")
        ((${#strings[@]})) || { echo "No strings found for array $a using STRINGS_ALLOWED='$STRINGS_ALLOWED'"; continue; }
        for s in "${strings[@]}"; do render_string "$a" "$s"; done
      fi
    done
  else
    mapfile -t strings < <(expand_numbers "$strings_in")
    ((${#strings[@]})) || { echo "No valid strings provided."; exit 1; }
    for a in "${arrays[@]}"; do
      for s in "${strings[@]}"; do render_string "$a" "$s"; done
    done
  fi
}

# --- Entry ---------------------------------------------------------------
prompt_interactive
