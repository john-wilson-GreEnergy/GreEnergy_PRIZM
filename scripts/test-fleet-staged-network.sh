#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${1:-} == --disposable-staged-lab && $EUID == 0 && $(uname -s) == Linux ]] || exit 2
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
umask 077
dir=$(mktemp -d /tmp/prizm-staged-lab-XXXXXXXX)
prefix="prizm-stage-$$"
parent="$prefix-parent"
engine="$root/scripts/fleet-pilot-network.mjs"
owned=()
addresses=$(ip -br addr); routes=$(ip -4 route show table all); fw=$(nft -s list ruleset)
cleanup(){
  result=$?
  trap - EXIT INT TERM
  systemctl stop "$prefix-rollback.timer" "$prefix-rollback.service" >/dev/null 2>&1 || true
  if [[ -f "$dir/network.json" ]] && ! flock "$dir/lock" node "$engine" stop "$dir/plan.json"; then
    echo "Recovery failed; lab fixtures retained: $prefix"; exit 1
  fi
  for ns in "${owned[@]}"; do ip netns delete "$ns" || result=1; done
  [[ $(ip -br addr) == "$addresses" && $(ip -4 route show table all) == "$routes" && $(nft -s list ruleset) == "$fw" ]] || result=1
  echo "Evidence: $dir; cleanup result $result"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for suffix in parent peer4; do
  ns="$prefix-$suffix"; ip netns add "$ns"; owned+=("$ns")
  ip netns exec "$ns" sysctl -q -w net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1
  ip -n "$ns" link set lo up
done
ip -n "$parent" link add port4 type veth peer name ems0 netns "$prefix-peer4"
ip -n "$parent" link set port4 address 02:00:00:00:00:04
ip -n "$parent" addr add 192.168.1.16/16 dev port4
ip -n "$parent" link set port4 up
ip -n "$prefix-peer4" addr add 10.0.0.3/16 dev ems0
ip -n "$prefix-peer4" link set ems0 up
node --input-type=module - "$dir" "$prefix" <<'JS'
import {writeFileSync} from 'node:fs';const [dir,prefix]=process.argv.slice(2);
writeFileSync(dir+'/plan.json',JSON.stringify({mode:'veth-lab',prefix,parent:prefix+'-parent',port:'port4',mac:'02:00:00:00:00:04',hostLink:'fleet-host',journal:dir+'/network.json',originalAddress:'192.168.1.16/16'}),{mode:0o600});
JS
original=$(ip -n "$parent" -br addr | sort)
restore_check(){ [[ $(ip -n "$parent" -br addr | sort) == "$original" ]]; }
for scenario in normal crash timed; do
  if [[ $scenario == timed ]]; then
    systemd-run --quiet --unit="$prefix-rollback" --on-active=10s --timer-property=AccuracySec=1s /usr/bin/flock "$dir/lock" /usr/bin/node "$engine" stop "$dir/plan.json"
  fi
  if [[ $scenario == crash ]]; then
    set +e
    flock "$dir/lock" node "$engine" start "$dir/plan.json" --crash
    code=$?
    set -e
    [[ $code == 137 ]]
  else
    flock "$dir/lock" node "$engine" start "$dir/plan.json"
    ip netns exec "$prefix-ss4" ping -q -c 1 -W 1 10.0.0.3
    if ip netns exec "$prefix-fleet" ping -q -c 1 -W 1 10.0.0.3; then echo 'Fleet reached equipment'; exit 1; fi
  fi
  if [[ $scenario == timed ]]; then
    for attempt in {1..20}; do
      phase=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).phase' "$dir/network.json")
      [[ $phase == stopped ]] && break
      sleep 1
    done
    [[ $phase == stopped ]]
  else flock "$dir/lock" node "$engine" stop "$dir/plan.json"; fi
  restore_check
  echo "PASS $scenario startup and recovery"
done
