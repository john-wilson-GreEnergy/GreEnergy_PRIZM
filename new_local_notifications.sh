#!/usr/bin/env bash
set -euo pipefail

# ========= CONFIG =========
ROOT_URL="http://10.0.0.3:8080/turtle/tools/report/ems"

# ---- Progress (stderr; set PROGRESS=0 to disable) -------------------
PROGRESS="${PROGRESS:-1}"
progress_begin() { (( PROGRESS )) && printf "%s" "${1:-Working}" >&2; }
progress_tick()  { (( PROGRESS )) && printf "." >&2; }
progress_end()   { (( PROGRESS )) && printf " done\n" >&2; }

# Site-configurable "all" behavior:
#   ARRAYS_ALLOWED: "auto" | "1-61" | "1,2,5-7,12"
#   STRINGS_ALLOWED: "auto" | "1-42" | "1,2,5-10"
ARRAYS_ALLOWED="${ARRAYS_ALLOWED:-auto}"
STRINGS_ALLOWED="${STRINGS_ALLOWED:-auto}"

# Backward compatibility caps / defaults
MAX_ARRAY="${MAX_ARRAY:-61}"
MAX_STRING="${MAX_STRING:-42}"

# Cookie optional (set COOKIE env var to override)
DEFAULT_COOKIE=""
COOKIE_HEADER="${COOKIE:-$DEFAULT_COOKIE}"

# Timeouts
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-3}"
MAX_TIME="${MAX_TIME:-8}"

# Options (defaults)
USE_COLOR=1
PAD=2
SORT_MODE="natural"    # natural | count | fault
IGNORE_BPC_CELLS=0     # when =1, group at (Array,String,Category,Fault) and set BPC/Cells to "-"
INCLUDE_TIME=0
CATEGORY_RE=""
FAULT_RE=""
RANGE_MIN=3            # min run length to collapse as start-end
DEBUG=0

UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"

usage() {
  cat <<'H'
Usage: new_local_notifications.sh [options]

Options:
  --ignore-bpc-cells        Group by (Array,String,Category,Fault) only (ignore BPC/Cells)
  --category=REGEX          Filter categories by case-insensitive regex (e.g., WARNING|CRITICAL)
  --fault=REGEX_OR_LIST     Filter fault IDs by regex or comma list (e.g., 2534,2561 or ^2)
  --sort=count              Sort by Count desc (then by Array,String)
  --sort=fault              Sort by Fault asc, then Count desc
  --include-time            Add LatestMs and LatestTime columns per group
  --no-color                Disable ANSI colors
  --pad=N                   Padding spaces between columns (default 2)
  --range-min=N             Collapse only runs with length >= N (default 3). Example: N=3 -> "1-3,5,7-9"
  --debug                   Print a few head/tail lines of intermediates
  -h, --help                Show this help
H
}

# ========= ARGS =========
while (( $# )); do
  case "${1:-}" in
    --ignore-bpc-cells) IGNORE_BPC_CELLS=1; shift ;;
    --category=*) CATEGORY_RE="${1#*=}"; shift ;;
    --fault=*) FAULT_RE="${1#*=}"; FAULT_RE="${FAULT_RE//,/|}"; shift ;;
    --sort=count) SORT_MODE="count"; shift ;;
    --sort=fault) SORT_MODE="fault"; shift ;;
    --include-time) INCLUDE_TIME=1; shift ;;
    --no-color) USE_COLOR=0; shift ;;
    --pad=*) PAD="${1#*=}"; shift ;;
    --range-min=*) RANGE_MIN="${1#*=}"; shift ;;
    --debug) DEBUG=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

# ========= DEPS =========
for cmd in curl jq awk sort head tail paste tr sed; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing dependency: $cmd"; exit 1; }
done
if ! awk 'BEGIN{exit (PROCINFO["version"] ~ /GNU/)?0:1}'; then
  echo " LatestTime will be raw seconds if --include-time is used." >&2
fi

# ========= HELPERS =========
expand_spec_list() {
  local spec="$1" min="$2" max="$3"
  local out=() IFS=',' part
  for part in $spec; do
    part="${part//[[:space:]]/}"; [[ -z "$part" ]] && continue
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      local a="${BASH_REMATCH[1]}" b="${BASH_REMATCH[2]}"
      (( a<=b )) || { echo "Invalid range: $part" >&2; exit 1; }
      local i; for ((i=a;i<=b;i++)); do (( i>=min && i<=max )) && out+=("$i"); done
    elif [[ "$part" =~ ^[0-9]+$ ]]; then
      (( part>=min && part<=max )) && out+=("$part")
    else
      echo "Invalid token: $part" >&2; exit 1
    fi
  done
  ((${#out[@]})) && printf '%s\n' "${out[@]}" | sort -n | uniq | paste -sd' ' - || true
}

expand_arrays_allowed() {
  local aa="${ARRAYS_ALLOWED//[[:space:]]/}"
  if [[ -z "$aa" || "$aa" == "auto" ]]; then
    seq 1 "$MAX_ARRAY"
  elif [[ "$aa" =~ ^[0-9]+$ ]]; then
    seq 1 "$aa"
  else
    expand_spec_list "${aa//,/ }" 1 999999
  fi
}

expand_strings_allowed() {
  local sa="${STRINGS_ALLOWED//[[:space:]]/}"
  if [[ -z "$sa" || "$sa" == "auto" ]]; then
    seq 1 "$MAX_STRING"
  elif [[ "$sa" =~ ^[0-9]+$ ]]; then
    seq 1 "$sa"
  else
    expand_spec_list "${sa//,/ }" 1 999999
  fi
}

# ===== Rerun harness (self-contained for this script) =====
# Usage: run_with_rerun run_once
run_with_rerun() {
  local _runner="$1"
  while :; do
    local INT_CAUGHT=0
    trap 'INT_CAUGHT=1' INT

    local STTY_SAVED=""
    if command -v stty >/dev/null 2>&1 && [ -t 0 ]; then
      STTY_SAVED="$(stty -g)" || true
      stty -echoctl || true
    fi

    set +e
    "$_runner"
    local status=$?
    set -e

    [[ -n "$STTY_SAVED" ]] && stty "$STTY_SAVED" || true
    trap - INT

    if (( INT_CAUGHT )); then
      echo
      echo "[terminated via Ctrl+C]"
    elif (( status != 0 )); then
      echo "[run exited with status $status]" >&2
    fi

    echo
    echo "----------------------------------------"
    echo "1) Re-run with same inputs"
    echo "2) Change selection/inputs"
    echo "0) Exit"
    read -rp "Select 1/2/0 [1]: " _again
    _again="${_again:-1}"
    case "${_again,,}" in
      1) continue ;;
      2) return 2 ;;
      0|q|quit|exit) return 0 ;;
      *) echo "Unknown selection; re-running."; continue ;;
    esac
  done
}

# ===== Numeric input menu for this tool =====
pick_inputs() {
  local sel=""
  while :; do
    echo
    echo "Select input method for notifications:"
    echo "  1) Enter arrays AND strings manually"
    echo "  2) 'all' arrays, enter strings manually"
    echo "  3) Enter arrays manually, 'all' strings"
    echo "  4) 'all' arrays AND 'all' strings"
    echo "  0) Exit"
    read -rp "Select 1/2/3/4 [1]: " sel
    sel="${sel:-1}"
    case "$sel" in
      1)
        echo "Which array/arrays? (e.g. 1 or 1,3-5)"
        read -r array_input
        echo "Which string/strings? (e.g. 1 or 1,5-10)"
        read -r string_input
        break
        ;;
      2)
        array_input="all"
        echo "Which string/strings? (e.g. 1 or 1,5-10)"
        read -r string_input
        break
        ;;
      3)
        echo "Which array/arrays? (e.g. 1 or 1,3-5)"
        read -r array_input
        string_input="all"
        break
        ;;
      4)
        array_input="all"
        string_input="all"
        break
        ;;
      0|q|Q|quit|exit) exit 0 ;;
      *) echo "Invalid selection." ;;
    esac
  done

  # Resolve lists from chosen inputs
  if [[ "${array_input,,}" == "all" ]]; then
    ARR_LIST="$(expand_arrays_allowed | paste -sd' ' -)"
  else
    ARR_LIST="$(expand_spec_list "$array_input" 1 "$MAX_ARRAY")"
  fi
  if [[ -z "${ARR_LIST:-}" ]]; then
    echo "No arrays matched your input." >&2
    return 1
  fi

  if [[ "${string_input,,}" == "all" ]]; then
    STR_LIST="$(expand_strings_allowed | paste -sd' ' -)"
  else
    STR_LIST="$(expand_spec_list "$string_input" 1 "$MAX_STRING")"
  fi
  if [[ -z "${STR_LIST:-}" ]]; then
    echo "No strings matched your input." >&2
    return 1
  fi

  return 0
}

# ========= One full run using ARR_LIST & STR_LIST =========
run_once() {
  # ========= FAULT MAP (embedded) =========
  local tmp_map tmp_rows tmp_grouped
  # Safe cleanup that won’t trip set -u
  cleanup() {
    rm -f "${tmp_rows:-}" "${tmp_grouped:-}" "${tmp_map:-}" 2>/dev/null || true
  }
  # Ensure cleanup runs when this function returns (success, error, or Ctrl+C)
  trap cleanup RETURN

  tmp_map="$(mktemp)"
  cat > "$tmp_map" <<'MAP'
2534	Contactors Open Warning
2561	String OOR Warning
1004	CellGroup Low Voltage Alarm
1006	String Low Voltage Alarm
1020	String High Discharge Rate Alarm
1022	Measured vs Calculated Mismatch Alarm
1023	CGC Disconnect Alarm
1024	BPC Disconnect Alarm
1032	DC Bus Calculated Mismatch Alarm
1071	String High Discharge Rate Alarm
2004	CellGroup Low Voltage Warning
2006	String Low Voltage Warning
2007	CellGroup Voltage Delta Warning
2008	BatteryPack Voltage Delta Warning
2014	CellGroup Low Temp Warning
2018	CellGroup Temp Delta Warning
2020	String High Discharge Rate Warning
2022	Measured vs Calculated Mismatch Warning
2023	CGC Disconnect Warning
2024	BPC Disconnect Warning
2032	DC Bus Calculated Voltage Mismatch Warning
2071	String High Discharge Rate Warning
2073	CellGroup Discharge Balancer Warning
2074	CellGroup Charge Balancer Warning
2921	Cell Temp Loss Warning
MAP

  # ========= TEMP FILES =========
  tmp_rows="$(mktemp)"        # raw rows: Array String BPC Category Fault Cells TimestampMs
  tmp_grouped="$(mktemp)"     # grouped rows (tab-separated)
  : > "$tmp_rows"

  # ========= FETCH (no-cookie first; cookie fallback) =========
  local a s url body hdr fetch_ok
  for a in $ARR_LIST; do
    for s in $STR_LIST; do
      url="${ROOT_URL}/array/${a}/string/${s}/notifications.json"
      body="$(mktemp)"; hdr="$(mktemp)"; fetch_ok=0
      if curl -sS --fail --show-error --http1.1 \
           --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
           -H "Connection: close" -H "Accept: application/json" -H "User-Agent: ${UA}" \
           -D "$hdr" -o "$body" "$url"; then
        fetch_ok=1
      elif [[ -n "$COOKIE_HEADER" ]]; then
        if curl -sS --fail --show-error --http1.1 \
             --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
             -H "Cookie: ${COOKIE_HEADER}" -H "Connection: close" \
             -H "Accept: application/json" -H "User-Agent: ${UA}" \
             -D "$hdr" -o "$body" "$url"; then
          fetch_ok=1
        fi
      fi

      if (( fetch_ok )); then
        jq -r '
          (.notification // [])[] |
          [
            .notificationSource.arrayIndex,
            .notificationSource.stringIndex,
            .notificationSource.batteryPackIndex,
            .notificationType.notificationCategory,
            .notificationType.notificationId,
            .notificationSource.cellGroupIndex,
            (.timestamp // "0")
          ] | @tsv
        ' < "$body" 2>/dev/null >> "$tmp_rows" || true
      fi

      rm -f "$body" "$hdr"
    done
  done

  [[ "$DEBUG" -eq 1 ]] && { echo "[debug] tmp_rows (head):"; head -n 3 "$tmp_rows"; echo; }

  # ========= GROUP, FILTER, SORT =========
  awk -v FS=$'\t' -v OFS=$'\t' \
    -v IGNORE="$IGNORE_BPC_CELLS" \
    -v CAT_RE="$CATEGORY_RE" \
    -v FAULT_RE="$FAULT_RE" \
    -v INCLUDE_TIME="$INCLUDE_TIME" \
    -v RANGE_MIN="$RANGE_MIN" '
    FNR==NR {
      pos = index($0, "\t")
      if (pos>0) {
        id = substr($0,1,pos-1)
        nm = substr($0,pos+1)
        fault_name[id]=nm
      }
      next
    }
    {
      if (NF < 6) next
      arr=$1; str=$2; bpc=$3; cat=$4; fault=$5; cells=$6; tms=$7
      if (CAT_RE  != "" && tolower(cat) !~ tolower(CAT_RE)) next
      if (FAULT_RE!= "" && fault !~ FAULT_RE) next
      if (IGNORE) { key = arr OFS str OFS cat OFS fault; bpc_for[key]="-" }
      else {
        key = arr OFS str OFS bpc OFS cat OFS fault; bpc_for[key]=bpc
        if (cells != "" && cells != "-" && cells ~ /^[0-9]+$/) {
          cell = cells + 0
          cells_present[key, cell] = 1
          if (!(key in min_cell) || cell < min_cell[key]) min_cell[key]=cell
          if (!(key in max_cell) || cell > max_cell[key]) max_cell[key]=cell
        }
      }
      if (tms ~ /^[0-9]+$/) if (!(key in latest) || tms+0 > latest[key]+0) latest[key]=tms
    }
    function unique_count(k,   idx,p,parts) { n=0; for (idx in cells_present){ split(idx,parts,SUBSEP); if (parts[1]==k) n++ } return n }
    function cells_as_ranges(k,   lo,hi,i,start,end,out,len,j) {
      if (!(k in min_cell)) return "-"
      lo=min_cell[k]; hi=max_cell[k]; out=""
      for (i=lo; i<=hi; i++) if ((k,i) in cells_present){
        start=i; while ((k,i+1) in cells_present) i++; end=i; len=end-start+1
        out = out ((out=="")?"":",") (len>=RANGE_MIN ? start "-" end : start)
        if (len<RANGE_MIN) for (j=start+1;j<=end;j++) out = out "," j
      }
      return (out==""?"-":out)
    }
    END {
      for (k in bpc_for) {
        split(k,f,OFS)
        if (IGNORE) { arr=f[1]; str=f[2]; bpc="-"; cat=f[3]; fault=f[4] }
        else        { arr=f[1]; str=f[2]; bpc=f[3]; cat=f[4]; fault=f[5] }
        nm = ((fault in fault_name) ? fault_name[fault] : "UNKNOWN")
        cl = (IGNORE ? "-" : cells_as_ranges(k))
        c_unique = (IGNORE ? 0 : unique_count(k))
        if (INCLUDE_TIME) {
          ms = (k in latest ? latest[k] : 0)
          sec = int(ms/1000); times = strftime("%Y-%m-%d %H:%M:%S", sec); if (times=="") times = sec
          print arr, str, bpc, cat, fault, nm, cl, c_unique, ms, times
        } else {
          print arr, str, bpc, cat, fault, nm, cl, c_unique
        }
      }
    }
  ' "$tmp_map" "$tmp_rows" > "$tmp_grouped"

  [[ "$DEBUG" -eq 1 ]] && { echo "[debug] tmp_grouped (head pre-sort):"; head -n 3 "$tmp_grouped"; echo; }

  # Sorting (tab as delimiter)
  if [[ "$SORT_MODE" == "count" ]]; then
    sort -t $'\t' -k8,8nr -k1,1n -k2,2n "$tmp_grouped" -o "$tmp_grouped"
  elif [[ "$SORT_MODE" == "fault" ]]; then
    sort -t $'\t' -k5,5n -k8,8nr "$tmp_grouped" -o "$tmp_grouped"
  else
    if [[ "$INCLUDE_TIME" -eq 1 ]]; then
      sort -t $'\t' -k1,1n -k2,2n -k4,4 -k5,5 -k3,3n -k7,7V "$tmp_grouped" -o "$tmp_grouped"
    else
      sort -t $'\t' -k1,1n -k2,2n -k4,4 -k5,5 -k3,3n -k7,7V "$tmp_grouped" -o "$tmp_grouped"
    fi
  fi

  [[ "$DEBUG" -eq 1 ]] && { echo "[debug] tmp_grouped (head post-sort):"; head -n 3 "$tmp_grouped"; echo; }

  # ========= PRETTY PRINT =========
  awk -v FS=$'\t' -v OFS="\t" -v PAD="$PAD" -v USE_COLOR="$USE_COLOR" -v INCLUDE_TIME="$INCLUDE_TIME" '
    function red(s){return USE_COLOR ? "\033[31m" s "\033[0m" : s}
    function yellow(s){return USE_COLOR ? "\033[33m" s "\033[0m" : s}
    function bold(s){return USE_COLOR ? "\033[1m" s "\033[0m" : s}
    function strip_ansi(s){gsub(/\033\[[0-9;]*m/,"",s);return s}
    function vislen(s){return length(strip_ansi(s))}
    function iconize_category(c){ lc=tolower(c); if(lc~/critical/)return "!! " c; else if(lc~/warning/)return "! " c; else if(lc~/info/)return "i " c; return "- " c }
    BEGIN{ H[1]="Array";H[2]="String";H[3]="BPC";H[4]="Category";H[5]="Fault";H[6]="Name";H[7]="Cells";H[8]="Count"; ncol=8; if (INCLUDE_TIME+0==1){H[9]="LatestMs";H[10]="LatestTime";ncol=10} for(i=1;i<=ncol;i++){ width[i]=length(H[i]) } }
    { n=split($0,f,FS); for(i=1;i<=ncol;i++){ v=(i<=n)?f[i]:""; if(i==4) v=iconize_category(v); raw[NR,i]=v; if(length(v)>width[i]) width[i]=length(v) } }
    END{
      pad=(PAD ~ /^[0-9]+$/ ? PAD : 2)
      line=""; for(i=1;i<=ncol;i++){ spaces=width[i]-length(H[i])+pad; if(spaces<1)spaces=1; line=line bold(H[i]); while(spaces--) line=line " " } sub(/[ \t]+$/,"",line); print line
      total=0; for(i=1;i<=ncol;i++) total+=width[i]+pad; sep=""; for(i=1;i<=total;i++) sep=sep "─"
      prev_arr=""; prev_str=""
      for(r=1;r<=NR;r++){
        arr=raw[r,1]; str=raw[r,2]
        if(prev_arr!="" && (arr!=prev_arr || str!=prev_str)) print sep
        out=""
        for(i=1;i<=ncol;i++){
          val=raw[r,i]
          if (tolower(val)~/warning/) val=yellow(val)
          if (tolower(val)~/alarm/)   val=red(val)
          if (i==5){ if (raw[r,i]~/^1/) val=red(val); else if (raw[r,i]~/^2/) val=yellow(val) }
          out=out val
          spaces=width[i]-vislen(val)+pad; if(spaces<1)spaces=1
          while(spaces--) out=out " "
        }
        sub(/[ \t]+$/, "", out); print out
        prev_arr=arr; prev_str=str
      }
    }
  ' "$tmp_grouped"

  # If nothing printed (no rows), show an empty shell with header and a dash row.
  if ! [ -s "$tmp_grouped" ]; then
    printf "Array\tString\tBPC\tCategory\tFault\tName\tCells\tCount\n"
    printf "-\t-\t-\t-\t-\tUNKNOWN\t-\t0\n"
  fi
}

# ========= Main with numeric menu + re-run =========
main() {
  while :; do
    if ! pick_inputs; then
      echo "Input selection failed; try again."
      continue
    fi
    run_with_rerun run_once
    rc=$?
    # 2 => change inputs, loop back; 0 => exit; others already handled
    [[ $rc -eq 2 ]] && continue || exit 0
  done
}

main
