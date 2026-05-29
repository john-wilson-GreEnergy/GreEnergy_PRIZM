#!/usr/bin/env bash
set -euo pipefail

# =================== CONFIG ===================
STATUS_URL="${STATUS_URL:-http://10.0.0.3:8080/turtle/tools/report/ems/balancertest/status.json}"
ANALYZER_SCRIPT="${ANALYZER_SCRIPT:-./new_balancer_test_analysis.sh}"

BAR_WIDTH=30
TOTAL_CELLGROUPS="${TOTAL_CELLGROUPS:-30}"   # override via env if needed
REFRESH_SECONDS=2                            # default refresh interval

# Colors (real ESC sequences)
CLR_RESET=$'\e[0m'
CLR_GREEN=$'\e[32m'
CLR_YELLOW=$'\e[33m'
CLR_RED=$'\e[31m'
CLR_CYAN=$'\e[36m'

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

need curl
need jq
need sed
need wc

while true; do
  clear

  TMP_RAW="$(mktemp)"
  TMP_JSON_LINES="$(mktemp)"
  TMP_OBJS="$(mktemp)"

  echo "Fetching test status from:"
  echo "  $STATUS_URL"
  echo

  curl -s --connect-timeout 5 --max-time 20 "$STATUS_URL" > "$TMP_RAW"

  if [[ ! -s "$TMP_RAW" ]]; then
    echo "ERROR: No data returned from status URL." >&2
    rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"
    echo
    echo "Press Enter to retry, or type q to quit."
    read -r ans
    [[ "$ans" == "q" || "$ans" == "Q" ]] && exit 1
    continue
  fi

  # Turn HTML-ish into clean JSON-per-line:
  sed -e 's/<br\s*\/>/\n/gI' \
      -e 's/<br>/\n/gI' \
      -e 's/<[^>]*>//g' \
      -e 's/\r//g' \
      "$TMP_RAW" \
    | sed '/^[[:space:]]*$/d' \
    > "$TMP_JSON_LINES"

  if [[ ! -s "$TMP_JSON_LINES" ]]; then
    echo "ERROR: Could not extract JSON from status payload." >&2
    rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"
    echo
    echo "Press Enter to retry, or type q to quit."
    read -r ans
    [[ "$ans" == "q" || "$ans" == "Q" ]] && exit 1
    continue
  fi

  # jq: each input line → one normalized JSON object:
  # { id, block, arrays, direction, state, progress, msg }
  jq -c --argjson total "$TOTAL_CELLGROUPS" '
    . as $t
    | ($t.testId              // -1)        as $id
    | ($t.direction           // "Unknown") as $dir
    | ($t.statusMessage       // "")        as $msg
    | ($t.balancerTestTargets // "")        as $targets
    | ($t.started             // false)     as $started
    | ($t.finished            // false)     as $finished

    # --- state ---
    | ( if $finished or $msg == "Finished." then "FINISHED"
        elif (try ($msg | test("CellGroups[[:space:]:]*[0-9]+")) catch false) then "RUNNING"
        elif $started then "RUNNING"
        else "PENDING"
      end
      ) as $state

    # --- cellgroup index / progress ---
    | (
        if (try ($msg | test("CellGroups[[:space:]:]*[0-9]+")) catch false) then
          ($msg | capture("CellGroups[[:space:]:]*(?<n>[0-9]+)") | .n | tonumber)
        elif $finished or $msg == "Finished." then
          $total
        else
          0
        end
      ) as $cg
    | ( if $total > 0
        then ( ($cg | tonumber) * 100 / $total | floor )
        else 0 end
      ) as $progress

    # --- location: block + arrays ---
    | ( if ($targets | startswith("Array "))
        then
          ($targets | sub("^Array "; "") | split(",")) as $parts
          | ($parts[0] // "" | gsub("^\\s+|\\s+$";"") | split(":")[1] // "") as $block
          | ([$parts[] | gsub("^\\s+|\\s+$";"") | split(":")[2]]
              | map(select(. != null and . != "")) | join(",")) as $arrays
          | {block:$block, arrays:$arrays}
        elif ($targets | startswith("Block "))
        then
          ($targets | sub("^Block "; "") | split(":")[1] // "") as $block
          | {block:$block, arrays:""}
        else
          {block:"", arrays:""}
        end
      ) as $loc

    | {
        id:        $id,
        block:     ($loc.block   // ""),
        arrays:    ($loc.arrays  // ""),
        direction: $dir,
        state:     $state,
        progress:  ($progress | floor),
        msg:       $msg
      }
  ' "$TMP_JSON_LINES" > "$TMP_OBJS"

  TOTAL=$(wc -l < "$TMP_OBJS" | awk '{print $1}')
  if [[ "$TOTAL" -eq 0 ]]; then
    echo "No recognizable test lines in status payload." >&2
    rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"
    echo
    echo "Press Enter to retry, or type q to quit."
    read -r ans
    [[ "$ans" == "q" || "$ans" == "Q" ]] && exit 1
    continue
  fi

  echo "Balance Test Status (refresh every ${REFRESH_SECONDS}s)"
  echo "============================================================"
  printf " %-3s %-6s %-6s %-10s %-*s %-26s\n" "#" "ID" "Block" "State" "$((BAR_WIDTH+6))" "Progress" "Arrays / Direction"
  echo "------------------------------------------------------------"

  mapfile -t ROWS < "$TMP_OBJS"
  idx=0
  any_non_finished=0

  for row_json in "${ROWS[@]}"; do
    idx=$((idx+1))

    testId=$(echo "$row_json" | jq -r '.id')
    block=$(echo "$row_json" | jq -r '.block // ""')
    arrays=$(echo "$row_json" | jq -r '.arrays // ""')
    direction=$(echo "$row_json" | jq -r '.direction // ""')
    state=$(echo "$row_json" | jq -r '.state // ""')
    progress=$(echo "$row_json" | jq -r '.progress // 0')
    statusMsg=$(echo "$row_json" | jq -r '.msg // ""')

    [[ "$state" != "FINISHED" ]] && any_non_finished=1

    # Safeguard: ensure progress is numeric
    if [[ ! "$progress" =~ ^[0-9]+$ ]]; then
      progress=0
    fi

    # Build ASCII bar
    filled=$(( progress * BAR_WIDTH / 100 ))
    (( filled < 0 )) && filled=0
    (( filled > BAR_WIDTH )) && filled=$BAR_WIDTH

    bar=""
    i=0
    while [[ $i -lt $filled ]]; do bar+="#"; i=$((i+1)); done
    while [[ $i -lt $BAR_WIDTH ]]; do bar+="."; i=$((i+1)); done

    # Color by state
    case "$state" in
      FINISHED) color="$CLR_GREEN" ;;
      RUNNING)  color="$CLR_YELLOW" ;;
      FAILED)   color="$CLR_RED" ;;
      *)        color="$CLR_CYAN" ;;
    esac

    colored_state="${color}${state}${CLR_RESET}"
    colored_bar="${color}${bar}${CLR_RESET}"

    # Label column
    if [[ -n "$block" && -n "$arrays" ]]; then
      label="B${block} A${arrays} / ${direction}"
    elif [[ -n "$block" ]]; then
      label="B${block} (block) / ${direction}"
    elif [[ -n "$arrays" ]]; then
      label="A${arrays} / ${direction}"
    else
      label="${direction} / ${statusMsg}"
    fi
    label_short=$(printf "%.40s" "$label")

    printf " %-3d %-6s %-6s %-10s [%s] %3d%%  %.40s\n" \
      "$idx" "$testId" "$block" "$colored_state" "$colored_bar" "$progress" "$label_short"
  done

  echo

  if [[ "$any_non_finished" -eq 1 ]]; then
    echo "Press Enter (or wait ${REFRESH_SECONDS}s) to refresh."
  else
    echo "All tests are FINISHED. Auto-refresh paused."
    echo "Press Enter to refresh."
  fi
  echo "Or type a row number, test ID, or comma-separated list (e.g. 1,3 or 2,5,7) for combined analysis, 0/q to quit."
  printf "> "

  # ----- input / auto-refresh -----
  choice=""
  if [[ "$any_non_finished" -eq 1 ]]; then
    if ! read -t "$REFRESH_SECONDS" -r choice; then
      rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"
      continue
    fi
  else
    read -r choice
  fi

  if [[ -z "$choice" ]]; then
    rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"
    continue
  fi

  if [[ "$choice" == "0" || "$choice" == "q" || "$choice" == "Q" ]]; then
    rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"
    echo "Exiting."
    exit 0
  fi

  # =================== RESOLVE SELECTION(S) ===================
  selected_ids=()

  add_id() {
    local new_id="$1"
    local exists=0
    for x in "${selected_ids[@]}"; do
      if [[ "$x" == "$new_id" ]]; then
        exists=1
        break
      fi
    done
    if [[ $exists -eq 0 ]]; then
      selected_ids+=("$new_id")
    fi
  }

  # token can be row index or testId
  resolve_token() {
    local tok="$1"

    # row index
    if [[ "$tok" =~ ^[0-9]+$ && "$tok" -ge 1 && "$tok" -le "$TOTAL" ]]; then
      local row_json="${ROWS[$((tok-1))]}"
      local tid
      tid=$(echo "$row_json" | jq -r '.id')
      add_id "$tid"
      return
    fi

    # testId match
    local found=""
    for row_json in "${ROWS[@]}"; do
      local tid
      tid=$(echo "$row_json" | jq -r '.id')
      if [[ "$tid" == "$tok" ]]; then
        found="$tid"
        break
      fi
    done
    if [[ -n "$found" ]]; then
      add_id "$found"
    else
      echo "WARNING: Could not match '$tok' to any row or testId; skipping." >&2
    fi
  }

  if [[ "$choice" == *","* ]]; then
    IFS=',' read -r -a CHOICE_ARR <<<"$choice"
    for token in "${CHOICE_ARR[@]}"; do
      tok="${token//[[:space:]]/}"
      [[ -z "$tok" ]] && continue
      resolve_token "$tok"
    done
  else
    tok="${choice//[[:space:]]/}"
    resolve_token "$tok"
  fi

  rm -f "$TMP_RAW" "$TMP_JSON_LINES" "$TMP_OBJS"

  if [[ "${#selected_ids[@]}" -eq 0 ]]; then
    echo "ERROR: No valid tests selected." >&2
    echo "Press Enter to continue."
    read -r _
    continue
  fi

  selected_ids_str=$(IFS=','; echo "${selected_ids[*]}")

  echo
  echo "Running analysis for Test ID(s): $selected_ids_str"
  echo "--------------------------------------------"
  echo

  if [[ ! -x "$ANALYZER_SCRIPT" ]]; then
    echo "ERROR: Analyzer script not found or not executable: $ANALYZER_SCRIPT" >&2
    exit 1
  fi

  "$ANALYZER_SCRIPT" "$selected_ids_str"
  echo
  echo "Analysis complete. Press Enter to return to status view, or q to quit."
  read -r resp
  [[ "$resp" == "q" || "$resp" == "Q" ]] && exit 0
done
