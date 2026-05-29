#!/usr/bin/env bash
set -euo pipefail

# ================== Defaults ==================
USER="moxa"
SSH_PASS="moxa"
SUDO_PASS="moxa"
PORT=22
RESTART="yes"

JAR_PATH_HINT="/var/lib/tomcat8/webapps/feather/WEB-INF/lib/environmentmanager-2.73.18.jar"

# Default Modbus IDs
SENVA_ID=31
SPACE_DATANAB_ID=21
OUTSIDE_DATANAB_ID=22
TEAM_ID=1

SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=5 -p "$PORT")
SSHPFX=(sshpass -p "$SSH_PASS" ssh "${SSH_OPTS[@]}")

banner() { printf "\n==== %s ====\n" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
require_bin() { for b in "$@"; do command -v "$b" >/dev/null || die "'$b' not installed locally"; done; }

expand_arrays() {
  local spec="$1" out=()
  IFS=',' read -r -a parts <<< "$spec"
  for p in "${parts[@]}"; do
    if [[ "$p" =~ ^[0-9]+$ ]]; then
      out+=("$p")
    elif [[ "$p" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      local a="${BASH_REMATCH[1]}" b="${BASH_REMATCH[2]}"
      ((a<=b)) && for ((i=a;i<=b;i++)); do out+=("$i"); done
    fi
  done
  printf "%s\n" "${out[@]}"
}

build_ips_for_array() { local arr="$1"; for ((i=10;i<=105;i+=5)); do echo "10.0.${arr}.${i}"; done; }
is_up() { ping -c 1 -W 1 "$1" >/dev/null 2>&1; }

# ================== Remote updater ==================
update_remote() {
  local ip="$1"

  echo
  echo "Target: $ip  (Senva=$SENVA_ID SpaceDN=$SPACE_DATANAB_ID OutsideDN=$OUTSIDE_DATANAB_ID Team/ADAM=$TEAM_ID)"
  if ! is_up "$ip"; then echo "  - Skipping (no ping)"; return; fi

  "${SSHPFX[@]}" "moxa@$ip" bash -s -- \
    "$SUDO_PASS" "$JAR_PATH_HINT" "$SENVA_ID" "$SPACE_DATANAB_ID" "$OUTSIDE_DATANAB_ID" "$TEAM_ID" "$RESTART" <<'REMOTE_SCRIPT'
set -euo pipefail
SUDO_PASS="$1"; JAR_HINT="$2"; SENVA_ID="$3"; SPACE_ID="$4"; OUTSIDE_ID="$5"; TEAM_ID="$6"; RESTART="$7"

# Quiet root elevation (no tty)
as_root() { echo "$SUDO_PASS" | sudo -S -p '' sh -c "$*"; }

echo "  - Remote preflight"
for b in sed grep mktemp date find jar; do command -v "$b" >/dev/null || { echo "    ! missing '$b'"; exit 1; }; done

# --- Auto-detect environmentmanager jar (root search) ---
JAR="$JAR_HINT"
if [[ ! -f "$JAR" ]]; then
  echo "  - Searching for environmentmanager-*.jar as root..."
  JAR=$(as_root "find /var/lib/tomcat* /opt/tomcat* /usr/share/tomcat* /usr/lib/tomcat* /srv/tomcat* \
    -type f -path '*/WEB-INF/lib/environmentmanager-*.jar' 2>/dev/null | head -n1 || true")
  [[ -z "$JAR" ]] && { echo "    ! Could not locate environmentmanager jar"; exit 1; }
  echo "    > Found: $JAR"
fi

TMPDIR="$(mktemp -d /tmp/envmgr_edit.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT
AP="$TMPDIR/application.properties"

echo "  - Backup JAR"
TS="$(date +%F_%H%M%S)"
as_root "cp '$JAR' '$JAR.bak.$TS'"

echo "  - Extract application.properties"
as_root "cd '$TMPDIR' && jar xf '$JAR' application.properties || true"
[[ -s "$AP" ]] || { echo "    ! application.properties not found in JAR"; exit 1; }

# Modify keys
ensure_set() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$AP"; then sed -i "s|^${key}=.*|${key}=${val}|" "$AP"
  else printf "\n%s=%s\n" "$key" "$val" >> "$AP"; fi
}

echo "  - Apply Modbus IDs"
ensure_set "feather.modbusv1.poller.senvaModbusSlaveId" "$SENVA_ID"
ensure_set "feather.modbusv1.poller.spaceDataNabModbusSlaveId" "$SPACE_ID"
ensure_set "feather.modbusv1.poller.outsideDataNabModbusSlaveId" "$OUTSIDE_ID"
ensure_set "feather.modbusv1.poller.teamModbusSlaveId" "$TEAM_ID"

echo "  - Repack JAR"
as_root "jar uf '$JAR' -C '$TMPDIR' application.properties"

echo "  - Verify"
grep -E 'feather\.modbusv1\.poller\.(senva|.*DataNab|team)ModbusSlaveId' "$AP" | sed 's/^/    /'

if [[ "$RESTART" == "yes" ]]; then
  echo "  - Restart Tomcat"
  as_root "systemctl restart tomcat8 || systemctl restart tomcat || service tomcat8 restart || service tomcat restart || true"
fi

echo "  - Done"
REMOTE_SCRIPT
}

# ================== Main Menu ==================
require_bin sshpass ssh ping
banner "Modbus ID Updater"

echo "Select deployment mode:"
echo "  1) Single target IP"
echo "  2) Array-level (build 10.0.<ARRAY>.10..105 step +5)"
read -rp "Choose [1-2]: " mode

case "$mode" in
  1)
    read -rp "Enter target IP (e.g., 10.0.7.10): " single_ip
    [[ -z "${single_ip:-}" ]] && die "No IP provided"
    echo
    echo "IDs: Senva=$SENVA_ID  SpaceDN=$SPACE_DATANAB_ID  OutsideDN=$OUTSIDE_DATANAB_ID  Team/ADAM=$TEAM_ID"
    read -rp "Proceed with $single_ip ? [y/N]: " go
    [[ "${go,,}" == "y" ]] || die "Cancelled"
    update_remote "$single_ip"
    ;;

  2)
    echo "Array index selector (single, list, or range):"
    read -rp "Enter array index/indices: " arr_spec
    [[ -z "${arr_spec:-}" ]] && die "No array index provided"
    arrays=( $(expand_arrays "$arr_spec") )
    ((${#arrays[@]})) || die "No valid array indices parsed"

    targets=()
    for a in "${arrays[@]}"; do
      while IFS= read -r ip; do targets+=("$ip"); done < <(build_ips_for_array "$a")
    done

    echo
    echo "Planned targets (${#targets[@]}):"
    printf "  %s\n" "${targets[@]}"
    echo
    echo "IDs: Senva=$SENVA_ID  SpaceDN=$SPACE_DATANAB_ID  OutsideDN=$OUTSIDE_DATANAB_ID  Team/ADAM=$TEAM_ID"
    read -rp "Proceed with these targets? [y/N]: " go
    [[ "${go,,}" == "y" ]] || die "Cancelled"

    for ip in "${targets[@]}"; do
      update_remote "$ip"
    done
    ;;
  *)
    die "Invalid selection"
    ;;
esac

echo
banner "All tasks complete"
