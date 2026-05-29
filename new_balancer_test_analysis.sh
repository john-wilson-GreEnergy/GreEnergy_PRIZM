#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Balance Test Analyzer (curl or local file, supports multi-ID)
#
# Usage examples:
#   ./new_balancer_test_analysis.sh
#   ./new_balancer_test_analysis.sh 1
#   ./new_balancer_test_analysis.sh 1,2
#   ./new_balancer_test_analysis.sh report.html
#
# EMS URL:
#   http://10.0.0.3:8080/turtle/tools/report/ems/balancertest/report.json?testID=#
# ============================================================

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

need curl
need jq
need sed
need awk
need sort
need mktemp
need head

BASE_URL="${BASE_URL:-http://10.0.0.3:8080/turtle/tools/report/ems/balancertest/report.json?testID=}"

ARG1="${1:-""}"

TSV_FILE="$(mktemp)"
SORTED_FILE=""
TEMP_JSON="$(mktemp)"

INPUT_MODE=""   # "remote" | "file" | "stdin"
INPUT_FILE=""
TEST_ID_STR=""
TEST_ID_LABEL=""

# ============================================================
# 1. Determine input mode
# ============================================================

if [[ -z "$ARG1" ]]; then
  echo
  echo "Enter Balance Test ID (single or comma-separated) to analyze:"
  read -r TEST_ID_STR
  if [[ -z "$TEST_ID_STR" ]]; then
    echo "ERROR: Test ID cannot be empty." >&2
    exit 1
  fi
  INPUT_MODE="remote"
  TEST_ID_LABEL="$TEST_ID_STR"

elif [[ "$ARG1" == "-" ]]; then
  INPUT_MODE="stdin"
  TEST_ID_LABEL="(stdin)"

elif [[ -f "$ARG1" ]]; then
  INPUT_MODE="file"
  INPUT_FILE="$ARG1"
  TEST_ID_LABEL="$INPUT_FILE"

else
  # Treat as test ID string (may be "1" or "1,2")
  INPUT_MODE="remote"
  TEST_ID_STR="$ARG1"
  TEST_ID_LABEL="$TEST_ID_STR"
fi

# ============================================================
# 2. Build TSV (duration + location) from input
#    TSV columns:
#      1 duration_sec
#      2 site
#      3 block
#      4 array
#      5 string
#      6 bpc
#      7 cell
#      8 confirmed
#      9 warning
#     10 cellGroupKey
# ============================================================

append_json_to_tsv() {
  local json_src="$1"
  cat "$json_src" \
    | sed -e 's/.*<body>//' -e 's#</body></html>##' \
    | jq -r '
        .results[]
        | (
            (.balanceEnd[0:19]   | strptime("%Y-%m-%dT%H:%M:%S") | mktime)
            -
            (.balanceStart[0:19] | strptime("%Y-%m-%dT%H:%M:%S") | mktime)
          ) as $dur
        | (.cellGroupKey // "UNKNOWN") as $key
        | ($key | split(" ") | .[1]? // "" | split(":")) as $p
        | ($p[0]? // "") as $site
        | ($p[1]? // "") as $block
        | ($p[2]? // "") as $array
        | ($p[3]? // "") as $string
        | ($p[4]? // "") as $bpc
        | ($p[5]? // "") as $cell
        | (
            ((.warningTriggerMessage != null) and (.warningTriggerMessage != "") and (.warningTriggerMessage != "null"))
            or (.warningTriggeredAfterBalance == true)
            or ((.warningTriggeredTime != null) and (.warningTriggeredTime != "") and (.warningTriggeredTime != "null"))
          ) as $warning
        | [
            $dur,
            $site,
            $block,
            $array,
            $string,
            $bpc,
            $cell,
            (.balanceConfirmedOn // false),
            $warning,
            $key
          ]
        | @tsv
      ' >> "$TSV_FILE"
}

case "$INPUT_MODE" in
  "file")
    : > "$TSV_FILE"
    cat "$INPUT_FILE" \
      | sed -e 's/.*<body>//' -e 's#</body></html>##' \
      | jq -r '
          .results[]
          | (
              (.balanceEnd[0:19]   | strptime("%Y-%m-%dT%H:%M:%S") | mktime)
              -
              (.balanceStart[0:19] | strptime("%Y-%m-%dT%H:%M:%S") | mktime)
            ) as $dur
          | (.cellGroupKey // "UNKNOWN") as $key
          | ($key | split(" ") | .[1]? // "" | split(":")) as $p
          | ($p[0]? // "") as $site
          | ($p[1]? // "") as $block
          | ($p[2]? // "") as $array
          | ($p[3]? // "") as $string
          | ($p[4]? // "") as $bpc
          | ($p[5]? // "") as $cell
          | (
              ((.warningTriggerMessage != null) and (.warningTriggerMessage != "") and (.warningTriggerMessage != "null"))
              or (.warningTriggeredAfterBalance == true)
              or ((.warningTriggeredTime != null) and (.warningTriggeredTime != "") and (.warningTriggeredTime != "null"))
            ) as $warning
          | [
              $dur,
              $site,
              $block,
              $array,
              $string,
              $bpc,
              $cell,
              (.balanceConfirmedOn // false),
              $warning,
              $key
            ]
          | @tsv
        ' > "$TSV_FILE"
    ;;

  "stdin")
    : > "$TSV_FILE"
    cat \
      | sed -e 's/.*<body>//' -e 's#</body></html>##' \
      | jq -r '
          .results[]
          | (
              (.balanceEnd[0:19]   | strptime("%Y-%m-%dT%H:%M:%S") | mktime)
              -
              (.balanceStart[0:19] | strptime("%Y-%m-%dT%H:%M:%S") | mktime)
            ) as $dur
          | (.cellGroupKey // "UNKNOWN") as $key
          | ($key | split(" ") | .[1]? // "" | split(":")) as $p
          | ($p[0]? // "") as $site
          | ($p[1]? // "") as $block
          | ($p[2]? // "") as $array
          | ($p[3]? // "") as $string
          | ($p[4]? // "") as $bpc
          | ($p[5]? // "") as $cell
          | (
              ((.warningTriggerMessage != null) and (.warningTriggerMessage != "") and (.warningTriggerMessage != "null"))
              or (.warningTriggeredAfterBalance == true)
              or ((.warningTriggeredTime != null) and (.warningTriggeredTime != "") and (.warningTriggeredTime != "null"))
            ) as $warning
          | [
              $dur,
              $site,
              $block,
              $array,
              $string,
              $bpc,
              $cell,
              (.balanceConfirmedOn // false),
              $warning,
              $key
            ]
          | @tsv
        ' > "$TSV_FILE"
    ;;

  "remote")
    : > "$TSV_FILE"

    if [[ -z "$TEST_ID_STR" ]]; then
      echo "ERROR: No test ID string set." >&2
      exit 1
    fi

    IFS=',' read -r -a ID_ARR <<<"$TEST_ID_STR"
    for tid in "${ID_ARR[@]}"; do
      tid_trimmed="${tid//[[:space:]]/}"
      [[ -z "$tid_trimmed" ]] && continue
      if ! [[ "$tid_trimmed" =~ ^[0-9]+$ ]]; then
        echo "WARNING: Skipping non-numeric test ID: $tid_trimmed" >&2
        continue
      fi

      URL="${BASE_URL}${tid_trimmed}"
      echo "Fetching: $URL"
      curl -s --connect-timeout 5 --max-time 20 "$URL" > "$TEMP_JSON"

      if [[ ! -s "$TEMP_JSON" ]]; then
        echo "WARNING: No data returned for test ID $tid_trimmed." >&2
        continue
      fi

      append_json_to_tsv "$TEMP_JSON"
    done
    ;;
esac

# ============================================================
# 3. Stats on TSV
# ============================================================

TOTAL=$(wc -l < "$TSV_FILE" | awk '{print $1}')
if [[ "$TOTAL" -eq 0 ]]; then
  echo "No rows found in parsed data." >&2
  rm -f "$TEMP_JSON" "$TSV_FILE"
  exit 1
fi

SORTED_FILE="$(mktemp)"
sort -n -k1,1 "$TSV_FILE" > "$SORTED_FILE"

MIN_DUR=$(awk 'NR==1 {printf "%.2f", $1}' "$SORTED_FILE")
MAX_DUR=$(awk 'END   {printf "%.2f", $1}' "$SORTED_FILE")

AVG_DUR=$(awk '
  {sum += $1}
  END {if (NR>0) printf "%.2f", sum/NR; else print "0.00";}
' "$TSV_FILE")

P95_DUR=$(awk -v total="$TOTAL" '
  BEGIN { target = int(0.95*(total-1) + 0.5) + 1 }
  NR == target { printf "%.2f", $1; exit }
' "$SORTED_FILE")

CONFIRMED=$(awk -F'\t' '$8=="true" {c++} END{print c+0}' "$TSV_FILE")
WARN_COUNT=$(awk -F'\t' '$9=="true" {c++} END{print c+0}' "$TSV_FILE")

# ============================================================
# 4. Print Summary
# ============================================================

echo "===================================================="
echo " Balance Report Summary"
echo "===================================================="
printf "Source / Test ID(s)      : %s\n" "${TEST_ID_LABEL:-unknown}"
printf "Total cell groups        : %d\n" "$TOTAL"
printf "Confirmed balances       : %d / %d\n" "$CONFIRMED" "$TOTAL"
printf "Entries with warnings    : %d\n" "$WARN_COUNT"
echo
echo "Duration (seconds):"
printf "  Min                    : %7s\n" "$MIN_DUR"
printf "  Avg                    : %7s\n" "$AVG_DUR"
printf "  95th percentile        : %7s\n" "$P95_DUR"
printf "  Max                    : %7s\n" "$MAX_DUR"
echo

# ============================================================
# 5. Array Average Duration Chart
# ============================================================

ARRAY_STATS="$(awk -F'\t' '
{
  a=$4
  if (a != "" && a != "-") {
    sum[a] += $1
    cnt[a]++
  }
}
END {
  for (a in sum) {
    if (cnt[a]>0) {
      avg = sum[a]/cnt[a]
      printf "%s\t%.6f\n", a, avg
    }
}
}' "$TSV_FILE")"

if [[ -n "$ARRAY_STATS" ]]; then
  BAR_WIDTH=40
  echo "Array Average Duration Chart (seconds)"
  echo "----------------------------------------"
  echo "$ARRAY_STATS" \
    | sort -n -k1,1 \
    | awk -v W="$BAR_WIDTH" '
      NR==1{max=$2}
      {if($2>max) max=$2; lines[NR]=$0}
      END{
        if (NR==0 || max==0) exit
        for(i=1;i<=NR;i++){
          split(lines[i],f,"\t")
          a=f[1]; val=f[2]
          len=int((val/max)*W+0.5)
          bar=""
          for(j=0;j<len;j++) bar=bar"#"
          printf "Array %2s | %-*s | %6.2f s\n", a, W, bar, val
        }
        print ""
      }'
fi

# ============================================================
# 6. Cell-Level Warning Count Chart
# ============================================================

if [[ "$WARN_COUNT" -gt 0 ]]; then
  CELL_STATS="$(awk -F'\t' '
    $9=="true"{
      if ($4!="" && $5!="" && $6!="" && $7!="") {
        key=$4":"$5":"$6":"$7
        warn[key]++
      }
    }
    END{
      for(k in warn){
        split(k,p,":")
        a=p[1]; s=p[2]; b=p[3]; c=p[4]
        printf "%s\t%s\t%s\t%s\t%d\n", a,s,b,c,warn[k]
      }
    }
  ' "$TSV_FILE")"

  if [[ -n "$CELL_STATS" ]]; then
    BAR_WIDTH=40
    echo "Cell Warning Count Chart"
    echo "----------------------------------------"
    echo "$CELL_STATS" \
      | sort -n -k1,1 -k2,2 -k3,3 -k4,4 \
      | awk -v W="$BAR_WIDTH" '
        NR==1{max=$5}
        { if($5>max) max=$5; lines[NR]=$0 }
        END{
          if (NR==0 || max==0) exit
          for(i=1;i<=NR;i++){
            split(lines[i],f,"\t")
            a=f[1]; s=f[2]; b=f[3]; c=f[4]; count=f[5]
            len=int((count/max)*W+0.5)
            bar=""
            for(j=0;j<len;j++) bar=bar"#"
            printf "A%2s S%2s B%2s C%3s | %-*s | %3d\n", a,s,b,c, W, bar, count
          }
          print ""
        }'
  fi
fi

# ============================================================
# 7. BPC-Level Warning Summary (unique BPCs)
# ============================================================

if [[ "$WARN_COUNT" -gt 0 ]]; then
  BPC_STATS="$(awk -F'\t' '
    $9=="true"{
      key=$2":"$3":"$4":"$5":"$6
      bpcwarn[key]++
    }
    END{
      for (k in bpcwarn){
        split(k,p,":")
        site=p[1]; block=p[2]; array=p[3]; string=p[4]; bpc=p[5]
        count=bpcwarn[k]
        printf "%s\t%s\t%s\t%s\t%s\t%d\n", site,block,array,string,bpc,count
      }
    }
  ' "$TSV_FILE")"

  if [[ -n "$BPC_STATS" ]]; then
    echo "BPC Warning Summary (unique BPCs with ≥1 warning)"
    echo "----------------------------------------"
    printf "%8s %5s %5s %6s %5s %7s\n" \
           "Site" "Block" "Array" "String" "BPC" "Count"

    echo "$BPC_STATS" \
      | sort -n -k3,3 -k4,4 -k5,5 \
      | awk '
        {
          printf "%8s %5s %5s %6s %5s %7d\n", $1,$2,$3,$4,$5,$6
        }'
    echo
  fi
fi

# ============================================================
# 8. Full Warning Table
# ============================================================

if [[ "$WARN_COUNT" -gt 0 ]]; then
  echo "Warnings (Full Location Breakdown)"
  echo "----------------------------------------"
  printf "%8s %5s %5s %6s %5s %5s %10s  %s\n" \
         "Site" "Block" "Array" "String" "BPC" "Cell" "Duration" "Key"

  awk -F'\t' '$9=="true"{
    printf "%8s %5s %5s %6s %5s %5s %10.2f  %s\n", \
           $2,$3,$4,$5,$6,$7,$1,$10
  }' "$TSV_FILE"
fi

# Cleanup
rm -f "$TEMP_JSON" "$TSV_FILE" "$SORTED_FILE"
