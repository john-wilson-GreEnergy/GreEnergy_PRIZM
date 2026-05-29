#!/usr/bin/env bash
set -euo pipefail

# ===================== USER CONFIG: "all" arrays ======================
# Option A: explicit list (space-separated). Uncomment & edit:
# ARRAYS_ALL_LIST="1 2 3 4 5 6 7 8"

# Option B: max value (1..MAX). Uncomment & edit:
ARRAYS_ALL_MAX=${ARRAYS_ALL_MAX:-8}

# ===================== CONFIG ============================
PORT="${PORT:-8080}"
PATH_="${PATH_:-/feather/status/report.json}"
CONNECT_TIMEOUT=1.5
MAX_TIME=3

# Progress (stderr; set PROGRESS=0 to disable)
PROGRESS="${PROGRESS:-1}"
progress_begin() { (( PROGRESS )) && printf "Collecting %s " "${1:-...}" >&2; }
progress_tick()  { (( PROGRESS )) && printf "." >&2; }
progress_end()   { (( PROGRESS )) && printf " done\n" >&2; }

HEADER=$'Array\tIP\tCellT\tSupplyT\tCoolSPT\tHeatSPT\tMIO\tStage\tHVAC1\tFanL\tFanH\tComp\tFreeze\tHVAC2\tFanL\tFanH\tComp\tFreeze\tSenva'
print_header() { printf '%s\n' "$HEADER"; }

# ===================== DEPS ==============================
for cmd in curl jq column awk sed tr wc mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing dependency: $cmd" >&2; exit 1; }
done

# ===================== HELPERS: selection & ranges ====================
get_all_arrays() {
  if [[ -n "${ARRAYS_ALL_LIST:-}" ]]; then
    # shellcheck disable=SC2086
    printf '%s\n' $ARRAYS_ALL_LIST
  elif [[ -n "${ARRAYS_ALL_MAX:-}" && "$ARRAYS_ALL_MAX" =~ ^[0-9]+$ ]]; then
    seq 1 "$ARRAYS_ALL_MAX"
  else
    seq 1 8
  fi
}

expand_range_list() {
  # "1,3-5,8" -> lines: 1 3 4 5 8
  local input="$1"
  local -a out=()
  local part a b n
  IFS=',' read -r -a parts <<<"$input"
  for part in "${parts[@]}"; do
    part="${part//[[:space:]]/}"
    [[ -z "$part" ]] && continue
    if [[ "$part" == "all" || "$part" == "ALL" ]]; then
      mapfile -t allA < <(get_all_arrays)
      out+=("${allA[@]}")
      continue
    fi
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      a="${BASH_REMATCH[1]}"; b="${BASH_REMATCH[2]}"
      if (( a <= b )); then
        for ((n=a;n<=b;n++)); do out+=("$n"); done
      else
        for ((n=a;n>=b;n--)); do out+=("$n"); done
      fi
    elif [[ "$part" =~ ^[0-9]+$ ]]; then
      out+=("$part")
    else
      echo "Invalid token: $part" >&2; return 2
    fi
  done
  printf '%s\n' "${out[@]}"
}

# ===================== COLORIZER (with fallback) =====================
post_align_color() {
  if command -v perl >/dev/null 2>&1; then
    perl -e '
      use strict; use warnings;
      my $RED = "\e[31m"; my $GRN = "\e[32m"; my $YEL = "\e[33m"; my $BLU = "\e[34m"; my $RST = "\e[0m";
      my $nr = 0;

      sub is_num { my ($s)=@_; return defined($s)&&$s =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/; }
      sub is_naish { my ($s)=@_; return !defined($s)||$s eq ""||lc($s) eq "n/a"||lc($s) eq "null"; }
      sub in_range { my ($v,$lo,$hi)=@_; return ($v>=$lo&&$v<=$hi); }

      while (my $line=<STDIN>) {
        $nr++; print $line and next if $nr==1; chomp $line;
        my(@tok,@sep); while($line =~ /(\S+)(\s{2,}|$)/g){push@tok,$1;push@sep,$2 if defined$2&&$2 ne "";}

        # 0 Array | 1 IP | 2 CellT | 3 SupplyT | 4 CoolSPT | 5 HeatSPT | 6 MIO | 7 Stage
        # 8 HVAC1 | 9 FanL1 | 10 FanH1 | 11 Comp1 | 12 Freeze1 | 13 HVAC2 | 14 FanL2 | 15 FanH2 | 16 Comp2 | 17 Freeze2 | 18 Senva

        if(defined $tok[2] && $tok[2] ne "" && $tok[2] !~ /^n\/a$/i && $tok[2] !~ /^null$/i && $tok[2] !~ /^\?$/){
          if($tok[2] =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/){my $v=0+$tok[2];
            if(in_range($v,20,30)){$tok[2]="$GRN$tok[2]$RST";}
            elsif(in_range($v,17,19)||in_range($v,31,35)){$tok[2]="$YEL$tok[2]$RST";}
            else{$tok[2]="$RED$tok[2]$RST";}
          }
        }
        if(defined $tok[3] && $tok[3] =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/){my $v=0+$tok[3];
          if($v<=28){$tok[3]="$BLU$tok[3]$RST";}
          elsif($v<=35){$tok[3]="$YEL$tok[3]$RST";}
          else{$tok[3]="$RED$tok[3]$RST";}
        }
        if(defined $tok[4] && $tok[4] =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/){my $v=0+$tok[4];
          if(in_range($v,25,30)){$tok[4]="$GRN$tok[4]$RST";}else{$tok[4]="$RED$tok[4]$RST";}
        }
        if(defined $tok[5] && $tok[5] =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/){my $v=0+$tok[5];
          if(in_range($v,15,30)){$tok[5]="$GRN$tok[5]$RST";}else{$tok[5]="$RED$tok[5]$RST";}
        }
        if(defined $tok[7]&&$tok[7] ne ""){my $low=lc($tok[7]);
          if($low =~ /cool/){$tok[7]="$BLU$tok[7]$RST";}
          elsif($low =~ /(idle|dsbl)/){$tok[7]="$YEL$tok[7]$RST";}
          else{$tok[7]="$RED$tok[7]$RST";}
        }
        for my $i (8,13){
          next if !defined $tok[$i] || $tok[$i] !~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
          my $v=0+$tok[$i];
          if($v<17){$tok[$i]="$GRN$tok[$i]$RST";}
          elsif($v<=20){$tok[$i]="$YEL$tok[$i]$RST";}
          else{$tok[$i]="$RED$tok[$i]$RST";}
        }
        for my $i (6,9,10,11,14,15,16){
          next unless defined $tok[$i];
          if($tok[$i] eq "true"){$tok[$i]="$GRN$tok[$i]$RST";}
          elsif($tok[$i] eq "false"){$tok[$i]="$RED$tok[$i]$RST";}
        }
        for my $i (12,17){
          next unless defined $tok[$i];
          if($tok[$i] eq "true"){$tok[$i]="$RED$tok[$i]$RST";}
          elsif($tok[$i] eq "false"){$tok[$i]="$GRN$tok[$i]$RST";}
        }
        if(defined $tok[18] && $tok[18] =~ /^-?(?:\d+(?:\.\d+)?|\.\d+)$/){my $v=0+$tok[18];
          if(in_range($v,0,15)){$tok[18]="$GRN$tok[18]$RST";}else{$tok[18]="$RED$tok[18]$RST";}
        }

        my $out=$tok[0]//""; for(my $i=0;$i<@sep;$i++){$out.=($sep[$i]//"   ").($tok[$i+1]//"");}
        print"$out\n";
      }
    '
  else
    # No perl → just pass through
    cat
  fi
}

# helper: cap to 4 visible chars for SupplyT
cap4_num_print() {
  awk '{s=$1;if(length(s)>4){split(s,a,".");if(length(a[1])<=4){s=a[1]}else{s=substr(a[1],1,4)}};printf"%s",s}'
}

# ===================== CORE QUERIES ======================
# query one host (by array third octet + host last octet)
# If a 3rd arg (path) is provided, append IP to that file when row is incomplete
check_host() {
  local third="$1" host="$2" ip cached incfile="${3:-}"
  ip="10.0.${third}.${host}"
  cached="$(curl -sS --connect-timeout "$CONNECT_TIMEOUT" -m "$MAX_TIME" --noproxy "*" "http://${ip}:${PORT}${PATH_}" || echo "{}")"

  # defaults
  local Array IP CellT SupplyT CoolSPT HeatSPT MIO Stage HVAC1 FanL1 FanH1 Comp1 Freeze1 HVAC2 FanL2 FanH2 Comp2 Freeze2 Senva
  Array="$third"; IP="$ip"

  if [[ "$cached" == "{}" ]]; then
    CellT="n/a"; SupplyT="n/a"; CoolSPT="n/a"; HeatSPT="n/a"; MIO="n/a"; Stage="n/a"
    HVAC1="n/a"; FanL1="n/a"; FanH1="n/a"; Comp1="n/a"; Freeze1="n/a"
    HVAC2="n/a"; FanL2="n/a"; FanH2="n/a"; Comp2="n/a"; Freeze2="n/a"; Senva="n/a"
  else
    num1()   { jq -r "$1 // empty" <<<"$cached" | awk "NF{printf(\"%.1f\",\$1)}"; }
    num4cap(){ jq -r "$1 // empty" <<<"$cached" | awk "NF{printf(\"%.1f\",\$1)}" | cap4_num_print; }
    str1()   { jq -r "$1 // \"?\"" <<<"$cached"; }

    if (( host < 4 )); then CellT="n/a"; else CellT="$(num1 '.thermalData.avgCellTemperature')"; fi
    SupplyT="$(num4cap '.thermalData.supplyAirTemp')"
    CoolSPT="$(num1 '.thermalData.coolingSetpoint')"
    HeatSPT="$(num1 '.thermalData.heatingSetpoint')"
    MIO="$(jq -r '(.thermalData.HVAC1Controls.valid // false)|tostring' <<<"$cached")"
    Stage="$(str1 '.thermalData.thermostatStage')"
    HVAC1="$(num1 '.thermalData.HVAC1Data.hvacCurrent')"
    FanL1="$(jq -r '(.thermalData.HVAC1Controls.fanLowOn // false)|tostring' <<<"$cached")"
    FanH1="$(jq -r '(.thermalData.HVAC1Controls.fanHighOn // false)|tostring' <<<"$cached")"
    Comp1="$(jq -r '(.thermalData.HVAC1Controls.YCompressorOn // false)|tostring' <<<"$cached")"
    Freeze1="$(jq -r '(.thermalData.HVAC1Data.FreezeDetected // false)|tostring' <<<"$cached")"
    HVAC2="$(num1 '.thermalData.HVAC2Data.hvacCurrent')"
    FanL2="$(jq -r '(.thermalData.HVAC2Controls.fanLowOn // false)|tostring' <<<"$cached")"
    FanH2="$(jq -r '(.thermalData.HVAC2Controls.fanHighOn // false)|tostring' <<<"$cached")"
    Comp2="$(jq -r '(.thermalData.HVAC2Controls.YCompressorOn // false)|tostring' <<<"$cached")"
    Freeze2="$(jq -r '(.thermalData.HVAC2Data.FreezeDetected // false)|tostring' <<<"$cached")"
    Senva="$(num1 '.thermalData.hydrogen1PPM')"
  fi

  # Incomplete criteria (ignore CellT for .3 hosts)
  local incomplete=0
  local to_check=("$SupplyT" "$CoolSPT" "$HeatSPT" "$MIO" "$Stage" "$HVAC1" "$FanL1" "$FanH1" "$Comp1" "$Freeze1" \
                  "$HVAC2" "$FanL2" "$FanH2" "$Comp2" "$Freeze2" "$Senva")
  if (( host >= 4 )); then
    to_check=("$CellT" "${to_check[@]}")
  fi
  local v
  for v in "${to_check[@]}"; do
    [[ "${v,,}" == "n/a" || -z "$v" || "${v,,}" == "null" || "${v,,}" == "?" ]] && { incomplete=1; break; }
  done
  if (( incomplete )) && [[ -n "$incfile" ]]; then
    printf '%s\n' "$ip" >> "$incfile"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$Array" "$IP" "$CellT" "$SupplyT" "$CoolSPT" "$HeatSPT" "$MIO" "$Stage" "$HVAC1" \
    "$FanL1" "$FanH1" "$Comp1" "$Freeze1" "$HVAC2" "$FanL2" "$FanH2" "$Comp2" "$Freeze2" "$Senva"
}

# single IP path (parses 10.0.A.B and reuses check_host)
check_single_ip() {
  local ip="$1"
  if [[ ! "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]]; then
    echo "Invalid IP: $ip" >&2; return 2
  fi
  local third=${BASH_REMATCH[3]} host=${BASH_REMATCH[4]}

  echo ""; echo "========================"; echo "SINGLE ${ip} (Array ${third})"; echo "========================"
  local tmprows
  tmprows="$(mktemp)"
  _cleanup_single() { rm -f "${tmprows:-}" 2>/dev/null || true; }
  trap _cleanup_single RETURN

  progress_begin "single ${ip}"
  print_header >"$tmprows"
  check_host "$third" "$host" >>"$tmprows"
  progress_end

  if [[ "$(wc -l <"$tmprows")" -gt 1 ]]; then
    LC_ALL=C column -t -s $'\t' -o $'   ' <"$tmprows" | post_align_color
  else
    printf '%s\n' "$HEADER" | column -t -s $'\t'; echo "(no responder)"
  fi
}

print_array_block() {
  local third="$1"
  echo ""; echo "========================"; echo "ARRAY $third"; echo "========================"
  local tmprows incfile
  tmprows="$(mktemp)"; incfile="$(mktemp)"
  _cleanup_array() { rm -f "${tmprows:-}" "${incfile:-}" 2>/dev/null || true; }
  trap _cleanup_array RETURN

  print_header >"$tmprows"

  progress_begin "Array ${third}"
  check_host "$third" 3 "$incfile" >>"$tmprows"; progress_tick
  local i
  for i in {10..105..5}; do
    check_host "$third" "$i" "$incfile" >>"$tmprows"
    progress_tick
  done
  progress_end

  if [[ "$(wc -l <"$tmprows")" -gt 1 ]]; then
    LC_ALL=C column -t -s $'\t' -o $'   ' <"$tmprows" | post_align_color
  else
    printf '%s\n' "$HEADER" | column -t -s $'\t'; echo "(no responders)"
  fi

  if [[ -s "$incfile" ]]; then
    local listed; listed="$(tr '\n' ' ' <"$incfile" | sed 's/[[:space:]]\+$//')"
    echo "IPs with INCOMPLETE data: $listed"
  else
    echo "IPs with INCOMPLETE data: none"
  fi
}

# ===================== RERUN HARNESS (flag-based) =====================
RERUN_ACTION=""
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
      1) continue ;;                         # run again with SAME inputs
      2) RERUN_ACTION="change"; return 0 ;;  # signal to re-prompt inputs
      0|q|quit|exit) RERUN_ACTION="exit"; return 0 ;;
      *) echo "Unknown selection; re-running."; continue ;;
    esac
  done
}

# ===================== NUMERIC MENU & RUNNER =========================
MODE=""          # "single" | "array"
ONE_IP=""        # e.g., 10.0.1.25
ARR_SPEC=""      # e.g., 1,3-5 or all

pick_mode() {
  local sel=""
  MODE=""; ONE_IP=""; ARR_SPEC=""
  while :; do
    echo
    echo "What would you like to check?"
    echo "  1) Single IP"
    echo "  2) Array(s)"
    echo "  0) Exit"
    read -rp "Select 1/2 [1]: " sel
    sel="${sel:-1}"
    case "${sel,,}" in
      1|single) MODE="single"; return 0 ;;
      2|array|arrays) MODE="array"; return 0 ;;
      0|q|quit|exit) exit 0 ;;
      *) echo "Invalid selection." ;;
    esac
  done
}

collect_inputs() {
  case "$MODE" in
    single)
      read -rp "Enter IP address (e.g., 10.0.1.10): " ONE_IP
      ;;
    array)
      read -rp "Enter array(s) (e.g., 1 or 1,3,5 or 2,5,7-14 or all): " ARR_SPEC
      ;;
  esac
}

run_once() {
  case "$MODE" in
    single)
      [[ -n "$ONE_IP" ]] || { echo "No IP provided." >&2; return 2; }
      check_single_ip "$ONE_IP"
      ;;
    array)
      [[ -n "$ARR_SPEC" ]] || { echo "No arrays provided." >&2; return 2; }
      local -a THIRD_OCTETS=()
      if ! mapfile -t THIRD_OCTETS < <(expand_range_list "$ARR_SPEC"); then
        echo "Failed to parse arrays." >&2
        return 2
      fi
      ((${#THIRD_OCTETS[@]})) || { echo "No valid arrays parsed." >&2; return 2; }
      local third
      for third in "${THIRD_OCTETS[@]}"; do
        print_array_block "$third"
      done
      ;;
    *)
      echo "Unknown MODE '$MODE'." >&2
      return 2
      ;;
  esac
}

# ===================== INTERACTIVE FLOW ===============================
main() {
  while :; do
    pick_mode
    collect_inputs
    RERUN_ACTION=""
    run_with_rerun run_once
    case "$RERUN_ACTION" in
      change)  # user chose to change inputs
        continue
        ;;
      exit)    # user chose to exit
        exit 0
        ;;
      *)       # default: re-run loop finished somehow; go back to top
        continue
        ;;
    esac
  done
}

main
