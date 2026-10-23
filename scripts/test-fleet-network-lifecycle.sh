#!/usr/bin/env bash
# Root-only disposable veth lab. No physical interface, host route or host firewall mutations.
set -Eeuo pipefail
[[ ${1:-} == --run-disposable-lifecycle-lab && $(uname -s) == Linux && $EUID == 0 ]] || { echo 'Use --run-disposable-lifecycle-lab on Linux as root'; exit 2; }
for tool in ip nft node flock systemd-run systemctl sysctl ping; do command -v "$tool" >/dev/null; done
lab_root=$(cd -- "$(dirname -- "$0")/.." && pwd)
lab_engine="$lab_root/scripts/fleet-network-lifecycle.mjs"
lab_node=$(command -v node)
umask 077
lab_dir=$(mktemp -d /tmp/prizm-lifecycle-XXXXXXXX)
lab_prefix="prizm-life-$$"
lab_parent="$lab_prefix-parent"
lab_unit="$lab_prefix-rollback"
lab_owned=()
lab_host_addresses=$(ip -br addr)
lab_host_routes=$(ip -4 route show table all)
lab_host_v6_routes=$(ip -6 route show table all)
lab_host_firewall=$(nft -s list ruleset)
lab_host_forward=$(sysctl -n net.ipv4.ip_forward net.ipv6.conf.all.forwarding)
engine() { flock -w 10 "$lab_dir/journal.lock" "$lab_node" "$lab_engine" "$@"; }
cleanup() {
  local result=$? ns recovery=0
  trap - EXIT INT TERM
  systemctl stop "$lab_unit.timer" "$lab_unit.service" >/dev/null 2>&1 || true
  if [[ -f "$lab_dir/journal.json" ]]; then engine rollback "$lab_dir/journal.json" || recovery=1; fi
  if (( recovery == 0 )); then
    for ns in "${lab_owned[@]}"; do ip netns delete "$ns" || result=1; done
  else
    echo "Recovery needs inspection; retaining owned fixtures under $lab_prefix" >&2
    result=1
  fi
  [[ $(ip -br addr) == "$lab_host_addresses" ]] || result=1
  [[ $(ip -4 route show table all) == "$lab_host_routes" ]] || result=1
  [[ $(ip -6 route show table all) == "$lab_host_v6_routes" ]] || result=1
  [[ $(nft -s list ruleset) == "$lab_host_firewall" ]] || result=1
  [[ $(sysctl -n net.ipv4.ip_forward net.ipv6.conf.all.forwarding) == "$lab_host_forward" ]] || result=1
  echo "Retained lab evidence: $lab_dir"
  if (( result == 0 )); then echo 'PASS host addresses, routes, forwarding and firewall unchanged; fixtures removed';
  else echo 'FAIL/interrupted: review retained evidence and fixture state' >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for suffix in parent peer3 peer4; do
  ns="$lab_prefix-$suffix"
  ip netns add "$ns"; lab_owned+=("$ns")
  ip netns exec "$ns" sysctl -q -w net.ipv4.ip_forward=0 net.ipv6.conf.all.forwarding=0 net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1
  ip -n "$ns" link set lo up
done
for n in 3 4; do
  ip -n "$lab_parent" link add "port$n" type veth peer name ems0 netns "$lab_prefix-peer$n"
  ip -n "$lab_parent" link set "port$n" address "02:00:00:00:00:0$n"
  if [[ $n == 3 ]]; then original=10.0.0.15/16; else original=192.168.1.16/16; fi
  ip -n "$lab_parent" addr add "$original" dev "port$n"
  ip -n "$lab_parent" link set "port$n" up
  ip -n "$lab_prefix-peer$n" addr add 10.0.0.3/16 dev ems0
  ip -n "$lab_prefix-peer$n" link set ems0 up
done
ip -n "$lab_parent" route add default via 10.0.0.1 dev port3 proto static metric 123
node --input-type=module - "$lab_dir" "$lab_prefix" <<'JS'
import {writeFileSync} from 'node:fs';
const [dir,prefix]=process.argv.slice(2);
const plan={mode:'disposable-veth-lab',prefix,parent:prefix+'-parent',stateFile:dir+'/journal.json',ports:[
  {name:'port3',mac:'02:00:00:00:00:03',originalAddress:'10.0.0.15/16'},
  {name:'port4',mac:'02:00:00:00:00:04',originalAddress:'192.168.1.16/16'}]};
writeFileSync(dir+'/plan.json',JSON.stringify(plan),{mode:0o600});
plan.ports[0].mac='02:00:00:00:00:99';
writeFileSync(dir+'/wrong-mac.json',JSON.stringify(plan),{mode:0o600});
JS
lab_original_addresses=$(ip -n "$lab_parent" -br addr | LC_ALL=C sort)
lab_original_routes=$(ip -n "$lab_parent" -4 route show table all | LC_ALL=C sort)
assert_restored() {
  [[ $(ip -n "$lab_parent" -br addr | LC_ALL=C sort) == "$lab_original_addresses" ]]
  [[ $(ip -n "$lab_parent" -4 route show table all | LC_ALL=C sort) == "$lab_original_routes" ]]
  for suffix in ss3 ss4 fleet; do
    if ip netns exec "$lab_prefix-$suffix" true 2>/dev/null; then echo 'Unexpected retained namespace'; return 1; fi
  done
  node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).phase!=="rolled-back")process.exit(1)' "$lab_dir/journal.json"
}
engine check "$lab_dir/plan.json"
if engine apply "$lab_dir/wrong-mac.json" >"$lab_dir/wrong-mac.log" 2>&1; then echo 'Wrong MAC was accepted'; exit 1; fi
[[ ! -f "$lab_dir/journal.json" ]]
[[ $(ip -n "$lab_parent" -br addr | LC_ALL=C sort) == "$lab_original_addresses" ]]
echo 'PASS wrong identity rejected before mutation'
ip -n "$lab_parent" link set port4 name held4
ip -n "$lab_parent" link add port4 type dummy
ip -n "$lab_parent" link set port4 address 02:00:00:00:00:04
ip -n "$lab_parent" addr add 192.168.1.16/16 dev port4
if engine apply "$lab_dir/plan.json" >"$lab_dir/wrong-type.log" 2>&1; then echo 'Non-veth interface was accepted'; exit 1; fi
[[ ! -f "$lab_dir/journal.json" ]]
ip -n "$lab_parent" link delete port4
ip -n "$lab_parent" link set held4 name port4
[[ $(ip -n "$lab_parent" -br addr | LC_ALL=C sort) == "$lab_original_addresses" ]]
echo 'PASS non-veth interface rejected before mutation'
engine apply "$lab_dir/plan.json"
for n in 3 4; do
  ip netns exec "$lab_prefix-ss$n" ping -q -c 1 -W 1 10.0.0.3 >"$lab_dir/isolated-ems-$n.log"
  [[ $(ip netns exec "$lab_prefix-ss$n" sysctl -n net.ipv4.ip_forward) == 0 ]]
done
echo 'PASS both isolated sites reach their own synthetic EMS at the same IP'
# Deliberately allow test probes to reach Fleet and enable forwarding there;
# the explicit forward-drop rule must still prevent crossing between sites.
ip netns exec "$lab_prefix-fleet" sysctl -q -w net.ipv4.ip_forward=1
for n in 3 4; do
  if [[ $n == 3 ]]; then hub=172.31.250.1; other=172.31.250.6; else hub=172.31.250.5; other=172.31.250.2; fi
  ip -n "$lab_prefix-ss$n" route add "$other/32" via "$hub"
  ip netns exec "$lab_prefix-ss$n" nft insert rule inet prizm_lifecycle output ip daddr "$other" accept
  if ip netns exec "$lab_prefix-ss$n" ping -q -c 1 -W 1 "$other" >"$lab_dir/blocked-cross-$n.log" 2>&1; then echo 'Cross-site forwarding succeeded'; exit 1; fi
done
lab_drops=$(ip netns exec "$lab_prefix-fleet" nft -j list chain inet prizm_lifecycle forward)
node -e 'const rules=JSON.parse(process.argv[1]).nftables;if(!rules.some(r=>r.rule?.expr?.some(e=>e.counter?.packets>=2)))process.exit(1)' "$lab_drops"
echo 'PASS cross-site packets explicitly dropped in both directions with test forwarding enabled'
engine rollback "$lab_dir/journal.json"
assert_restored
engine rollback "$lab_dir/journal.json"
assert_restored
echo 'PASS normal and repeated rollback restore original addresses, link state and default route metric'
set +e
engine apply "$lab_dir/plan.json" --crash-after-move >"$lab_dir/interrupted.log" 2>&1
lab_crash_status=$?
set -e
[[ $lab_crash_status == 137 ]]
engine rollback "$lab_dir/journal.json"
assert_restored
echo 'PASS interrupted process recovered from intent journal'
# The timer is owned by systemd, not by this shell or an SSH connection. No confirmation cancels it.
systemd-run --quiet --unit="$lab_unit" --on-active=15s --timer-property=AccuracySec=1s \
  /usr/bin/flock -w 20 "$lab_dir/journal.lock" "$lab_node" "$lab_engine" rollback "$lab_dir/journal.json"
engine apply "$lab_dir/plan.json"
lab_restored=false
for attempt in {1..30}; do
  if node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).phase!=="rolled-back")process.exit(1)' "$lab_dir/journal.json"; then lab_restored=true; break; fi
  sleep 1
done
[[ $lab_restored == true ]]
systemctl show "$lab_unit.service" -p Result -p ExecMainStatus >"$lab_dir/timer-result.txt"
[[ $(systemctl show "$lab_unit.service" -p Result --value) == success ]]
assert_restored
echo 'PASS unconfirmed changeover automatically reverted by independent systemd timer'
echo 'Lifecycle prototype validated on disposable veths only; physical NIC and boot integration are NOT enabled.'
