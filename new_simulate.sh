#!/usr/bin/env bash
# simulate_deploy_http8080_v5_5_debug.sh
# (…comments unchanged…)

set -euo pipefail

for cmd in jq curl awk; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required"; exit 1; }
done

# ---- Your network arrays ----
# Legacy default order still used if user enters a single array number.
ARRAY_ORDER=(1 2 3 4 5 6 7 8)

# NEW: What "all" means for arrays during prompts
#   - "1-8"  or "1,2,5-7,12"
#   - "auto" → falls back to ARRAY_ORDER
ARRAYS_ALLOWED="8"

ADDR_COUNT=21

# ---- Settings ----
CURL_TIMEOUT=15
USER_AGENT="simulate-deploy/http8080/5.5"
# Raw numeric defaults (no conversion):
COOLING_TEMP_DEFAULT=55
COOLING_FALLBACKS="50,45,42"
HEATING_TEMP_DEFAULT=5
CLEAR_TIMEOUT_MINUTES=30

# Flags
COOL_OVERRIDE=""
HEAT_OVERRIDE=""
DEBUG=false
DEBUG_DIR_BASE="/tmp/feather_debug"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cooling-temp) COOL_OVERRIDE="$2"; shift 2;;
    --heating-temp) HEAT_OVERRIDE="$2"; shift 2;;
    --debug) DEBUG=true; shift;;
    -h|--help) # (help text unchanged)
      cat <<EOF
Usage: run and follow prompts.

Options:
  --cooling-temp N   Initial cooling target (raw units, default 55; fallbacks 50,45,42)
  --heating-temp N   Heating target (raw units, default 5)
  --debug            Write per-host logs to /tmp/feather_debug/<ip>/ and enable curl -v

Actions supported:
  cooling, heating, dehumidification, clear,
  topcap, "louver closed", "louver open", "leak off", "leak on",
  timeout  (set timeout minutes only, 30..240)

Notes:
- NO unit detection/conversion. Values are posted exactly as provided.
- CLEAR runs /feather/simulate/clearall, then sets timeout to 30 and verifies both.
- Boolean-only actions & timeout skip the simulate Timeout prompt.
EOF
      exit 0;;
    *) echo "Unknown flag: $1" >&2; exit 1;;
  esac
done

ts() { date +"%Y%m%d-%H%M%S"; }

# --- helpers for arrays ---

expand_numbers() {
  local input="$1" IFS=',' out=() part a b n
  for part in $input; do
    part="${part//[[:space:]]/}"; [[ -z "$part" ]] && continue
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      a="${BASH_REMATCH[1]}"; b="${BASH_REMATCH[2]}"
      if (( a <= b )); then for ((n=a;n<=b;n++)); do out+=("$n"); done
      else for ((n=a;n>=b;n--)); do out+=("$n"); done
      fi
    elif [[ "$part" =~ ^[0-9]+$ ]]; then
      out+=("$part")
    else
      echo "Invalid token: $part" >&2; return 1
    fi
  done
  printf "%s\n" "${out[@]}"
}

expand_arrays_allowed() {
  local aa="${ARRAYS_ALLOWED//[[:space:]]/}"
  if [[ -z "$aa" || "$aa" == "auto" ]]; then
    printf "%s\n" "${ARRAY_ORDER[@]}"
  elif [[ "$aa" =~ ^[0-9]+$ ]]; then
    seq 1 "$aa"
  else
    expand_numbers "$aa"
  fi
}

# ---------------- interactive flow ----------------
echo "single or array"; read -r TARGET_SCOPE; TARGET_SCOPE="${TARGET_SCOPE,,}"
[[ "$TARGET_SCOPE" == "single" || "$TARGET_SCOPE" == "array" ]] || { echo "enter 'single' or 'array'"; exit 1; }

if [[ "$TARGET_SCOPE" == "single" ]]; then
  echo "enter target IP (e.g. 10.0.5.10)"
  read -r ONE_IP
  DEVICES=("$ONE_IP")
else
  echo "array number(s) (single number, comma list/range, or 'all')"
  read -r ARRSEL
  if [[ "${ARRSEL,,}" == "all" ]]; then
    mapfile -t arrays < <(expand_arrays_allowed)
  else
    mapfile -t arrays < <(expand_numbers "$ARRSEL")
  fi
  ((${#arrays[@]})) || { echo "no arrays parsed"; exit 1; }

  echo "select action: cooling, heating, dehumidification, clear, topcap, 'louver closed', 'louver open', 'leak off', 'leak on', timeout"
  read -r MODE

  # Build device list from arrays & ADDR_COUNT (unchanged logic)
  DEVICES=()
  for ARRAY_NUM in "${arrays[@]}"; do
    # preserves your 10.0.<array>.<host> pattern
    DEVICES+=("10.0.${ARRAY_NUM}.3")
    for h in $(seq 10 5 105); do DEVICES+=("10.0.${ARRAY_NUM}.${h}"); done
  done
fi

# (… everything below stays exactly as your original: selection echo, simulate-timeout prompts,
#  fetch_current_json/post functions, apply_* actions, and the case/esac dispatcher …)
# ---------------- the rest of your original script continues here ----------------
# (No functional changes below this point)
