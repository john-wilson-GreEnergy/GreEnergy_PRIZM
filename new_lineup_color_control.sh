#!/usr/bin/env bash
# new_lineup_color_control.sh
# Terminal Based Controls UI - Lightbar Command (multi array/string deploy)
#
# Modes:
#  - SINGLE : one color for selected strings
#  - ALT4   : 4 colors by s%4 groups
#  - MIRROR : 2 colors mapped to 4 groups (A->(1mod4,2mod4), B->(3mod4,0mod4))
#  - USA    : R/W/B repeating down both odd and even sides (default 14h):
#             Odd:  1=R,3=W,5=B,7=R,9=W,11=B...
#             Even: 2=R,4=W,6=B,8=R,10=W,12=B...
#  - CLEAR  : Stop/clear simulated light command (Arrays 1-8, Strings 1-40, W-only, duration=1s)
#
# Shortcut:
#   ./new_lineup_color_control.sh clear

set -euo pipefail

# ================== CONFIG ==================
BASE_URL="${BASE_URL:-http://10.0.0.3:8080/turtle}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-3}"
MAX_TIME="${MAX_TIME:-12}"
COOKIE_JAR="${COOKIE_JAR:-$HOME/.ems_turtle_cookies.txt}"

MAX_ARRAY="${MAX_ARRAY:-61}"
MAX_STRING="${MAX_STRING:-42}"
CONCURRENCY_DEFAULT="${CONCURRENCY_DEFAULT:-8}"

DURATION_DEFAULT_SINGLE="${DURATION_DEFAULT_SINGLE:-60}"
DURATION_DEFAULT_USA="$((14*60*60))"   # 14 hours = 50400 seconds

# CLEAR defaults (your request)
CLEAR_ARRAYS_MIN=1
CLEAR_ARRAYS_MAX=8
CLEAR_STRINGS_MIN=1
CLEAR_STRINGS_MAX=40
CLEAR_R=0
CLEAR_G=0
CLEAR_B=0
CLEAR_W=255
CLEAR_D=1

# ================== UI ==================
BOLD=$'\033[1m'
GRN=$'\033[32m'
YEL=$'\033[33m'
RED=$'\033[31m'
CYA=$'\033[36m'
RST=$'\033[0m'

banner() {
  printf "\n%s%sTerminal Based Controls UI%s\n" "$BOLD" "$GRN" "$RST" >&2
  printf "%sLightbar Command%s\n\n" "$CYA" "$RST" >&2
}

die() { printf "%sERROR:%s %s\n" "$RED" "$RST" "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null || die "Missing dependency: $1"; }
need curl; need awk; need sed; need tr; need xargs

is_int() { [[ "${1:-}" =~ ^[0-9]+$ ]]; }

# ================== MENUS ==================
menu_choice() {
  local title="$1"; shift
  local i=1 ans

  printf "%s%s%s\n" "$BOLD" "$title" "$RST" >&2
  for opt in "$@"; do
    printf "  %2d) %s\n" "$i" "$opt" >&2
    ((i++))
  done
  printf "   0) Back/Exit\n" >&2

  while true; do
    read -r -p "> " ans
    [[ "$ans" =~ ^[bB]$ ]] && { echo 0; return 0; }
    is_int "$ans" || { printf "%sEnter a number.%s\n" "$YEL" "$RST" >&2; continue; }
    (( ans >= 0 && ans < i )) && { echo "$ans"; return 0; }
    printf "%sInvalid choice.%s\n" "$YEL" "$RST" >&2
  done
}

confirm_menu() {
  printf "%sProceed to send commands?%s\n" "$BOLD" "$RST" >&2
  printf "   1) Yes - deploy now\n" >&2
  printf "   2) No - exit\n" >&2
  printf "   0) Back/Exit\n" >&2

  local ans
  while true; do
    read -r -p "> " ans
    case "${ans,,}" in
      y|yes) echo 1; return 0 ;;
      n|no)  echo 2; return 0 ;;
      b)     echo 0; return 0 ;;
    esac
    if is_int "$ans" && (( ans==0 || ans==1 || ans==2 )); then
      echo "$ans"; return 0
    fi
    printf "%sEnter 1/2/0 or y/n.%s\n" "$YEL" "$RST" >&2
  done
}

prompt_text() {
  local msg="$1" default="${2:-}"
  local ans
  if [[ -n "$default" ]]; then
    read -r -p "$msg [$default]: " ans
    echo "${ans:-$default}"
  else
    read -r -p "$msg: " ans
    echo "$ans"
  fi
}

# ================== HTTP ==================
curl_common_args() {
  local -a a=(-sS -L --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME")
  [[ -f "$COOKIE_JAR" ]] && a+=(-b "$COOKIE_JAR" -c "$COOKIE_JAR")
  printf "%s\n" "${a[@]}"
}

http_get() {
  local url="$1"
  local -a args; mapfile -t args < <(curl_common_args)
  curl "${args[@]}" "$url"
}

# ================== SELECTION PARSING ==================
parse_selection() {
  local input="$1" min="$2" max="$3"
  input="$(echo "$input" | tr -d '[:space:]')"
  [[ -z "$input" ]] && return 1

  if [[ "$input" == "all" || "$input" == "ALL" ]]; then
    seq "$min" "$max"
    return 0
  fi

  [[ "$input" =~ ^[0-9,-]+$ ]] || return 1

  local expanded
  expanded="$(
    echo "$input" \
      | tr ',' '\n' \
      | awk -v min="$min" -v max="$max" '
        function emit(n){ if(n>=min && n<=max) print n; else bad=1 }
        {
          if ($0 ~ /^[0-9]+$/) emit($0)
          else if ($0 ~ /^[0-9]+-[0-9]+$/) {
            split($0,a,"-"); s=a[1]; e=a[2]
            if (s>e) { t=s; s=e; e=t }
            for (i=s; i<=e; i++) emit(i)
          } else bad=1
        }
        END { if (bad) exit 2 }
      '
  )" || return 1

  echo "$expanded" | awk 'NF{seen[$1]=1} END{for(k in seen) print k}' | sort -n
}

format_oneline() { tr '\n' ' ' | sed 's/[[:space:]]\+$//'; }

# ================== COLOR PRESETS ==================
# Returns "R G B" on stdout
color_menu() {
  local title="${1:-Choose a color preset}"
  local choice
  choice="$(menu_choice "$title" \
    "Red        (255, 0, 0)" \
    "Green      (0, 255, 0)" \
    "Blue       (0, 0, 255)" \
    "Cyan       (0, 255, 255)" \
    "Magenta    (255, 0, 255)" \
    "Yellow     (255, 255, 0)" \
    "Orange     (255, 165, 0)" \
    "Purple     (128, 0, 128)" \
    "Pink       (255, 105, 180)" \
    "Warm White (255, 244, 229)" \
  )"
  (( choice == 0 )) && return 1

  case "$choice" in
    1)  echo "255 0 0" ;;
    2)  echo "0 255 0" ;;
    3)  echo "0 0 255" ;;
    4)  echo "0 255 255" ;;
    5)  echo "255 0 255" ;;
    6)  echo "255 255 0" ;;
    7)  echo "255 165 0" ;;
    8)  echo "128 0 128" ;;
    9)  echo "255 105 180" ;;
    10) echo "255 244 229" ;;
    *) return 1 ;;
  esac
}

read_byte_value() {
  local label="$1" default="$2" v
  while true; do
    v="$(prompt_text "$label (0-255)" "$default")"
    [[ "$v" =~ ^[bB]$ ]] && return 1
    is_int "$v" && (( v>=0 && v<=255 )) && { echo "$v"; return 0; }
    printf "%sInvalid %s.%s\n" "$YEL" "$label" "$RST" >&2
  done
}

duration_menu() {
  local default="$1"
  local choice
  choice="$(menu_choice "Choose duration" \
    "15 seconds" \
    "30 seconds" \
    "60 seconds" \
    "120 seconds" \
    "300 seconds (5 min)" \
    "600 seconds (10 min)" \
    "Custom seconds..." \
  )"
  (( choice == 0 )) && return 1
  case "$choice" in
    1) echo 15 ;;
    2) echo 30 ;;
    3) echo 60 ;;
    4) echo 120 ;;
    5) echo 300 ;;
    6) echo 600 ;;
    7)
      while true; do
        local d
        d="$(prompt_text "Enter duration seconds" "$default")"
        [[ "$d" =~ ^[bB]$ ]] && return 1
        is_int "$d" && (( d>=1 && d<=86400 )) && { echo "$d"; return 0; }
        printf "%sInvalid duration (1..86400).%s\n" "$YEL" "$RST" >&2
      done
      ;;
  esac
}

concurrency_menu() {
  local choice
  choice="$(menu_choice "Choose concurrency" \
    "1 (sequential)" \
    "4" \
    "8" \
    "16" \
    "Custom..." \
  )"
  (( choice == 0 )) && return 1
  case "$choice" in
    1) echo 1 ;;
    2) echo 4 ;;
    3) echo 8 ;;
    4) echo 16 ;;
    5)
      while true; do
        local c
        c="$(prompt_text "Enter concurrency (1..64)" "$CONCURRENCY_DEFAULT")"
        [[ "$c" =~ ^[bB]$ ]] && return 1
        is_int "$c" && (( c>=1 && c<=64 )) && { echo "$c"; return 0; }
        printf "%sInvalid concurrency.%s\n" "$YEL" "$RST" >&2
      done
      ;;
  esac
}

verbosity_menu() {
  local choice
  choice="$(menu_choice "Output mode" \
    "Summary only (recommended)" \
    "Verbose (print OK/FAIL lines)" \
  )"
  (( choice == 0 )) && return 1
  case "$choice" in
    1) echo 0 ;;
    2) echo 1 ;;
  esac
}

# ================== ARRAY SELECTION ==================
select_arrays() {
  local min=1 max="$MAX_ARRAY" default_single="1"
  while true; do
    local choice
    choice="$(menu_choice "Select Arrays" \
      "Single array index" \
      "Array list/range (e.g. 1,3-5,9)" \
      "All arrays (1..$max)" \
    )"
    (( choice == 0 )) && return 1
    case "$choice" in
      1)
        while true; do
          local v
          v="$(prompt_text "Enter array index ($min..$max)" "$default_single")"
          [[ "$v" =~ ^[bB]$ ]] && break
          is_int "$v" && (( v>=min && v<=max )) && { echo "$v"; return 0; }
          printf "%sInvalid array index.%s\n" "$YEL" "$RST" >&2
        done
        ;;
      2)
        while true; do
          local txt out
          txt="$(prompt_text "Enter arrays selection" "$default_single")"
          [[ "$txt" =~ ^[bB]$ ]] && break
          if out="$(parse_selection "$txt" "$min" "$max")"; then
            echo "$out"; return 0
          fi
          printf "%sInvalid selection format.%s\n" "$YEL" "$RST" >&2
        done
        ;;
      3) seq "$min" "$max"; return 0 ;;
    esac
  done
}

# ================== MODE + STRINGS ==================
# Output:
#   first line = MODE: SINGLE | ALT4 | MIRROR | USA | CLEAR
#   remaining lines = strings list
select_strings_mode() {
  local min=1 max="$MAX_STRING" default_single="1"
  while true; do
    local choice
    choice="$(menu_choice "Select Strings / Mode" \
      "Single string index" \
      "Strings list/range (e.g. 1,3-5,9)" \
      "All strings (1..$max) - single color" \
      "All strings (1..$max) - alternating 4-group (s%4)" \
      "All strings (1..$max) - MIRROR mode (2 colors)" \
      "All strings (1..$max) - USA pattern (R/W/B repeating, default 14h)" \
      "CLEAR: stop simulated lights (Arrays 1-8, Strings 1-40, White-only, 1s)" \
    )"
    (( choice == 0 )) && return 1

    case "$choice" in
      1)
        while true; do
          local v
          v="$(prompt_text "Enter string index ($min..$max)" "$default_single")"
          [[ "$v" =~ ^[bB]$ ]] && break
          is_int "$v" && (( v>=min && v<=max )) && { printf "SINGLE\n%s\n" "$v"; return 0; }
          printf "%sInvalid string index.%s\n" "$YEL" "$RST" >&2
        done
        ;;
      2)
        while true; do
          local txt out
          txt="$(prompt_text "Enter strings selection" "$default_single")"
          [[ "$txt" =~ ^[bB]$ ]] && break
          if out="$(parse_selection "$txt" "$min" "$max")"; then
            printf "SINGLE\n%s\n" "$out"
            return 0
          fi
          printf "%sInvalid selection format.%s\n" "$YEL" "$RST" >&2
        done
        ;;
      3) printf "SINGLE\n"; seq "$min" "$max"; return 0 ;;
      4) printf "ALT4\n";   seq "$min" "$max"; return 0 ;;
      5) printf "MIRROR\n"; seq "$min" "$max"; return 0 ;;
      6) printf "USA\n";    seq "$min" "$max"; return 0 ;;
      7) printf "CLEAR\n";  seq "$CLEAR_STRINGS_MIN" "$CLEAR_STRINGS_MAX"; return 0 ;;
    esac
  done
}

# ================== DEPLOY ==================
build_url() {
  local array="$1" string="$2" r="$3" g="$4" b="$5" w="$6" d="$7"
  printf "%s/tools/controls/ems/array/%s/string/%s/lightbarcommand?red=%s&green=%s&blue=%s&white=%s&duration=%s" \
    "$BASE_URL" "$array" "$string" "$r" "$g" "$b" "$w" "$d"
}

send_one() {
  local array="$1" string="$2" r="$3" g="$4" b="$5" w="$6" d="$7"
  local url resp
  url="$(build_url "$array" "$string" "$r" "$g" "$b" "$w" "$d")"

  if resp="$(http_get "$url" 2>/dev/null)"; then
    if echo "$resp" | tr '[:upper:]' '[:lower:]' | grep -qE 'error|exception|forbidden|unauthorized'; then
      printf "FAIL\tA%s\tS%s\t%s\n" "$array" "$string" "$url"
      return 1
    fi
    printf "OK\tA%s\tS%s\t%s\n" "$array" "$string" "$url"
    return 0
  else
    printf "FAIL\tA%s\tS%s\t%s\n" "$array" "$string" "$url"
    return 1
  fi
}

export -f curl_common_args http_get build_url send_one
export BASE_URL CONNECT_TIMEOUT MAX_TIME COOKIE_JAR

# ================== CLEAR SHORTCUT ==================
run_clear_shortcut() {
  banner
  printf "%sCLEAR%s: Arrays %d-%d, Strings %d-%d, RGBW=%d,%d,%d,%d, Duration=%ds\n\n" \
    "$YEL" "$RST" \
    "$CLEAR_ARRAYS_MIN" "$CLEAR_ARRAYS_MAX" \
    "$CLEAR_STRINGS_MIN" "$CLEAR_STRINGS_MAX" \
    "$CLEAR_R" "$CLEAR_G" "$CLEAR_B" "$CLEAR_W" "$CLEAR_D" >&2

  local CONCURRENCY VERBOSE go
  CONCURRENCY="$(concurrency_menu)" || exit 0
  VERBOSE="$(verbosity_menu)" || exit 0

  printf "\nConcurrency: %s  Output: %s\n\n" \
    "$CONCURRENCY" "$([[ "$VERBOSE" == "1" ]] && echo "Verbose" || echo "Summary only")" >&2

  go="$(confirm_menu)"
  (( go == 0 || go == 2 )) && exit 0

  local arrays strings
  arrays="$(seq "$CLEAR_ARRAYS_MIN" "$CLEAR_ARRAYS_MAX")"
  strings="$(seq "$CLEAR_STRINGS_MIN" "$CLEAR_STRINGS_MAX")"

  local jobs
  jobs="$(
    awk -v A="$arrays" -v S="$strings" \
        -v r="$CLEAR_R" -v g="$CLEAR_G" -v b="$CLEAR_B" \
        -v w="$CLEAR_W" -v d="$CLEAR_D" '
      BEGIN{
        nA=split(A,a,"\n");
        nS=split(S,s,"\n");
        for(i=1;i<=nA;i++){
          if(a[i]=="") continue
          for(j=1;j<=nS;j++){
            if(s[j]=="") continue
            print a[i], s[j], r, g, b, w, d
          }
        }
      }'
  )"

  local commanded ok fail
  commanded="$(echo "$jobs" | awk 'NF{c++} END{print c+0}')"

  local results
  results="$(
    echo "$jobs" \
      | xargs -P "$CONCURRENCY" -n 7 bash -lc \
          'send_one "$0" "$1" "$2" "$3" "$4" "$5" "$6"'
  )"

  if (( VERBOSE )); then
    printf "%s\n" "$results"
  fi

  ok="$(echo "$results" | awk -F'\t' '$1=="OK"{c++} END{print c+0}')"
  fail="$(echo "$results" | awk -F'\t' '$1=="FAIL"{c++} END{print c+0}')"

  printf "\n%sSummary%s\n" "$BOLD" "$RST" >&2
  printf "Commanded: %s  Successful: %s  Failed: %s\n" "$commanded" "$ok" "$fail" >&2

  if (( fail > 0 )); then
    printf "\n%sFailures%s\n" "$RED" "$RST" >&2
    echo "$results" | awk -F'\t' '$1=="FAIL"{printf "  %s %s\n", $2, $3}' >&2
  fi
}

# ================== MAIN ==================
main() {
  # One-line shortcut
  if [[ "${1:-}" == "clear" ]]; then
    run_clear_shortcut
    exit 0
  fi

  banner

  local arrays
  if ! arrays="$(select_arrays)"; then exit 0; fi

  local sel_out smode strings
  if ! sel_out="$(select_strings_mode)"; then exit 0; fi
  smode="$(printf "%s\n" "$sel_out" | sed -n '1p')"
  strings="$(printf "%s\n" "$sel_out" | sed '1d')"

  # CLEAR mode (interactive): force arrays to 1..8
  if [[ "$smode" == "CLEAR" ]]; then
    arrays="$(seq "$CLEAR_ARRAYS_MIN" "$CLEAR_ARRAYS_MAX")"
  fi

  # White + Duration
  local w d
  if [[ "$smode" == "CLEAR" ]]; then
    w="$CLEAR_W"
    d="$CLEAR_D"
  else
    local w_choice
    w_choice="$(menu_choice "White channel (W) option" \
      "Use W=0 (recommended)" \
      "Use W=128" \
      "Use W=255" \
      "Custom W (0-255)" \
    )"
    (( w_choice == 0 )) && exit 0
    case "$w_choice" in
      1) w=0 ;;
      2) w=128 ;;
      3) w=255 ;;
      4) if ! w="$(read_byte_value "White" "0")"; then exit 0; fi ;;
    esac

    if [[ "$smode" == "USA" ]]; then
      local keep
      keep="$(menu_choice "USA pattern duration" \
        "Use default 14 hours (50400s)" \
        "Choose a different duration" \
      )"
      (( keep == 0 )) && exit 0
      if (( keep == 1 )); then
        d="$DURATION_DEFAULT_USA"
      else
        if ! d="$(duration_menu "$DURATION_DEFAULT_USA")"; then exit 0; fi
      fi
    else
      if ! d="$(duration_menu "$DURATION_DEFAULT_SINGLE")"; then exit 0; fi
    fi
  fi

  local CONCURRENCY
  if ! CONCURRENCY="$(concurrency_menu)"; then exit 0; fi

  local VERBOSE
  if ! VERBOSE="$(verbosity_menu)"; then exit 0; fi

  # Resolve colors
  local r1 g1 b1 r2 g2 b2 r3 g3 b3 r4 g4 b4
  local rgb

  case "$smode" in
    CLEAR)
      r1=$CLEAR_R; g1=$CLEAR_G; b1=$CLEAR_B
      r2=$r1; g2=$g1; b2=$b1
      r3=$r1; g3=$g1; b3=$b1
      r4=$r1; g4=$g1; b4=$b1
      ;;
    SINGLE)
      if ! rgb="$(color_menu "Choose a color preset (applies to all selected strings)")"; then exit 0; fi
      read -r r1 g1 b1 <<<"$rgb"
      r2=$r1; g2=$g1; b2=$b1
      r3=$r1; g3=$g1; b3=$b1
      r4=$r1; g4=$g1; b4=$b1
      ;;
    ALT4)
      if ! rgb="$(color_menu "O1: strings 1,5,9.. (s%4==1)")"; then exit 0; fi
      read -r r1 g1 b1 <<<"$rgb"
      if ! rgb="$(color_menu "O2: strings 3,7,11.. (s%4==3)")"; then exit 0; fi
      read -r r2 g2 b2 <<<"$rgb"
      if ! rgb="$(color_menu "E1: strings 2,6,10.. (s%4==2)")"; then exit 0; fi
      read -r r3 g3 b3 <<<"$rgb"
      if ! rgb="$(color_menu "E2: strings 4,8,12.. (s%4==0)")"; then exit 0; fi
      read -r r4 g4 b4 <<<"$rgb"
      ;;
    MIRROR)
      if ! rgb="$(color_menu "Mirror Color A (applies to 1,5,9.. AND 2,6,10..)")"; then exit 0; fi
      read -r r1 g1 b1 <<<"$rgb"
      r3=$r1; g3=$g1; b3=$b1
      if ! rgb="$(color_menu "Mirror Color B (applies to 3,7,11.. AND 4,8,12..)")"; then exit 0; fi
      read -r r2 g2 b2 <<<"$rgb"
      r4=$r2; g4=$g2; b4=$b2
      ;;
    USA)
      # Computed per-string in job builder
      r1=0; g1=0; b1=0; r2=0; g2=0; b2=0; r3=0; g3=0; b3=0; r4=0; g4=0; b4=0
      ;;
    *) die "Unknown mode: $smode" ;;
  esac

  # Preview
  printf "Selected arrays:  %s\n" "$(echo "$arrays" | format_oneline)" >&2
  printf "Selected strings: %s\n" "$(echo "$strings" | format_oneline)" >&2
  printf "Mode: %s\n" "$smode" >&2
  printf "White: %s  Duration: %ss  Concurrency: %s  Output: %s\n\n" \
    "$w" "$d" "$CONCURRENCY" "$([[ "$VERBOSE" == "1" ]] && echo "Verbose" || echo "Summary only")" >&2

  if [[ "$smode" == "CLEAR" ]]; then
    printf "%sCLEAR details:%s Arrays 1-8, Strings 1-40, RGBW=0,0,0,255 Duration=1\n\n" "$YEL" "$RST" >&2
  fi

  local go
  go="$(confirm_menu)"
  (( go == 0 || go == 2 )) && exit 0

  # Build jobs: "array string r g b w d"
  local jobs

  if [[ "$smode" == "USA" ]]; then
    # USA repeating down both sides:
    # odd:  idx=int((s-1)/2)%3  => 0=R,1=W,2=B
    # even: idx=int((s-2)/2)%3  => 0=R,1=W,2=B
    jobs="$(
      awk -v A="$arrays" -v S="$strings" -v w="$w" -v d="$d" '
        function set_rgb(idx, rr,gg,bb){
          if(idx==0){ rr=255; gg=0;   bb=0   }       # Red
          else if(idx==1){ rr=255; gg=255; bb=255 }  # White
          else { rr=0;   gg=0;   bb=255 }            # Blue
          return rr " " gg " " bb
        }
        BEGIN{
          nA=split(A,a,"\n");
          nS=split(S,s,"\n");
          for(i=1;i<=nA;i++){
            if(a[i]=="") continue
            for(j=1;j<=nS;j++){
              if(s[j]=="") continue
              str=s[j]+0
              if(str%2==1) idx=int((str-1)/2)%3;
              else idx=int((str-2)/2)%3;

              split(set_rgb(idx), rgb, " ");
              rr=rgb[1]; gg=rgb[2]; bb=rgb[3];
              print a[i], str, rr, gg, bb, w, d
            }
          }
        }'
    )"
  else
    jobs="$(
      awk -v A="$arrays" -v S="$strings" \
          -v smode="$smode" \
          -v r1="$r1" -v g1="$g1" -v b1="$b1" \
          -v r2="$r2" -v g2="$g2" -v b2="$b2" \
          -v r3="$r3" -v g3="$g3" -v b3="$b3" \
          -v r4="$r4" -v g4="$g4" -v b4="$b4" \
          -v w="$w" -v d="$d" '
        BEGIN{
          nA=split(A,a,"\n");
          nS=split(S,s,"\n");
          for(i=1;i<=nA;i++){
            if(a[i]=="") continue
            for(j=1;j<=nS;j++){
              if(s[j]=="") continue
              str=s[j]+0
              rr=r1; gg=g1; bb=b1

              if(smode=="ALT4" || smode=="MIRROR"){
                m=str%4
                if(m==1){ rr=r1; gg=g1; bb=b1 }
                else if(m==3){ rr=r2; gg=g2; bb=b2 }
                else if(m==2){ rr=r3; gg=g3; bb=b3 }
                else { rr=r4; gg=g4; bb=b4 }
              }

              print a[i], str, rr, gg, bb, w, d
            }
          }
        }'
    )"
  fi

  local commanded ok fail
  commanded="$(echo "$jobs" | awk 'NF{c++} END{print c+0}')"

  local results
  results="$(
    echo "$jobs" \
      | xargs -P "$CONCURRENCY" -n 7 bash -lc \
          'send_one "$0" "$1" "$2" "$3" "$4" "$5" "$6"'
  )"

  if (( VERBOSE )); then
    printf "%s\n" "$results"
  fi

  ok="$(echo "$results" | awk -F'\t' '$1=="OK"{c++} END{print c+0}')"
  fail="$(echo "$results" | awk -F'\t' '$1=="FAIL"{c++} END{print c+0}')"

  printf "\n%sSummary%s\n" "$BOLD" "$RST" >&2
  printf "Commanded: %s  Successful: %s  Failed: %s\n" "$commanded" "$ok" "$fail" >&2

  if (( fail > 0 )); then
    printf "\n%sFailures%s\n" "$RED" "$RST" >&2
    echo "$results" | awk -F'\t' '$1=="FAIL"{printf "  %s %s\n", $2, $3}' >&2
  fi
}

main "$@"
