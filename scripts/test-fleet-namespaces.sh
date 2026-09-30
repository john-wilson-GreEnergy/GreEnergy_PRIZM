#!/usr/bin/env bash
# Linux-only disposable isolation test. No production ports, routes or data.
set -Eeuo pipefail
[[ ${1:-} == --run-isolated-lab ]] || { echo 'Usage: sudo bash test-fleet-namespaces.sh --run-isolated-lab'; exit 2; }
[[ $(uname -s) == Linux && $EUID == 0 ]] || { echo 'Requires Linux root for temporary namespaces'; exit 2; }
for tool in ip nft node curl timeout sysctl; do command -v "$tool" >/dev/null; done
lab_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ -f "$lab_dir/fleet-namespace-fixture.mjs" ]] || exit 2
lab_prefix="prizm-lab-$$"
lab_names=()
lab_pids=()
lab_initial_routes=$(ip -4 route show)
lab_initial_v6_routes=$(ip -6 route show)
lab_initial_addresses=$(ip -br addr)
lab_initial_forward=$(sysctl -n net.ipv4.ip_forward)
lab_initial_v6_forward=$(sysctl -n net.ipv6.conf.all.forwarding)
lab_initial_firewall=$(nft -s list ruleset)

cleanup() {
  local result=$? ns pid
  trap - EXIT INT TERM
  for pid in "${lab_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${lab_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  for ns in "${lab_names[@]}"; do
    # Resolve processes only inside namespaces successfully created by this run.
    for pid in $(ip netns pids "$ns"); do kill "$pid" 2>/dev/null || true; done
    ip netns delete "$ns" || result=1
  done
  [[ $(ip -4 route show) == "$lab_initial_routes" ]] || result=1
  [[ $(ip -6 route show) == "$lab_initial_v6_routes" ]] || result=1
  [[ $(ip -br addr) == "$lab_initial_addresses" ]] || result=1
  [[ $(sysctl -n net.ipv4.ip_forward) == "$lab_initial_forward" ]] || result=1
  [[ $(sysctl -n net.ipv6.conf.all.forwarding) == "$lab_initial_v6_forward" ]] || result=1
  [[ $(nft -s list ruleset) == "$lab_initial_firewall" ]] || result=1
  if (( result == 0 )); then echo 'PASS cleanup: host addresses, routes, forwarding and firewall unchanged';
  else echo 'FAIL or interrupted: inspect temporary namespace cleanup and host baseline' >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for suffix in ss3 ss4 ems3 ems4 fleet; do
  ns="$lab_prefix-$suffix"
  ip netns add "$ns"
  lab_names+=("$ns")
  ip -n "$ns" link set lo up
  ip netns exec "$ns" sysctl -q -w net.ipv4.ip_forward=0 net.ipv6.conf.all.forwarding=0
  ip netns exec "$ns" sysctl -q -w net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1
done
for site in 3 4; do
  ns="$lab_prefix-ss$site"; ems="$lab_prefix-ems$site"
  if [[ $site == 3 ]]; then collector=172.31.250.2; hub=172.31.250.1; other=172.31.250.6;
  else collector=172.31.250.6; hub=172.31.250.5; other=172.31.250.2; fi
  # Both ends are created directly inside new namespaces, never the host stack.
  ip -n "$ns" link add site0 type veth peer name device0 netns "$ems"
  ip -n "$ns" addr add 10.0.0.15/16 dev site0
  ip -n "$ems" addr add 10.0.0.3/16 dev device0
  ip -n "$ns" link set site0 up
  ip -n "$ems" link set device0 up
  ip -n "$ns" link add fleet0 type veth peer name "ss$site" netns "$lab_prefix-fleet"
  ip -n "$ns" addr add "$collector/30" dev fleet0
  ip -n "$lab_prefix-fleet" addr add "$hub/30" dev "ss$site"
  ip -n "$ns" link set fleet0 up
  ip -n "$lab_prefix-fleet" link set "ss$site" up
  # Deliberately install a cross-site route INSIDE THE LAB to challenge isolation.
  ip -n "$ns" route add "$other/32" via "$hub"
  ip netns exec "$ns" nft -f - <<RULES
table inet prizm_lab {
  chain input {
    type filter hook input priority 0; policy drop;
    iifname "lo" accept
    ct state established,related accept
    iifname "fleet0" ip saddr $hub tcp dport 3000 accept
    iifname "site0" ip saddr 10.0.0.3 tcp dport 3000 accept
  }
  chain forward { type filter hook forward priority 0; policy drop; }
}
RULES
  ip netns exec "$ems" timeout 45s node "$lab_dir/fleet-namespace-fixture.mjs" ems "LAB-SS$site" &
  lab_pids+=("$!")
  ip netns exec "$ns" timeout 45s node "$lab_dir/fleet-namespace-fixture.mjs" collector "LAB-SS$site" &
  lab_pids+=("$!")
done
ip netns exec "$lab_prefix-fleet" nft -f - <<'RULES'
table inet prizm_lab {
  chain forward { type filter hook forward priority 0; policy drop; counter drop; }
}
RULES

read_from() { ip netns exec "$1" curl --noproxy '*' --fail --silent --show-error --connect-timeout 1 --max-time 2 "$2"; }
expect_site() {
  local ns=$1 url=$2 expected=$3 reply='' attempt
  for attempt in {1..10}; do
    if reply=$(read_from "$ns" "$url" 2>/dev/null); then break; fi
    sleep 0.3
  done
  node -e 'const j=JSON.parse(process.argv[1]); if(j.siteId!==process.argv[2] || j.observedSite!==j.siteId || j.simulated!==true)process.exit(1)' "$reply" "$expected"
}
expect_blocked() {
  if read_from "$1" "$2" >/dev/null 2>&1; then echo "FAIL unexpected reachability from $1 to $2" >&2; exit 1; fi
}
for site in 3 4; do
  if [[ $site == 3 ]]; then collector=172.31.250.2; other=172.31.250.6;
  else collector=172.31.250.6; other=172.31.250.2; fi
  expect_site "$lab_prefix-fleet" "http://$collector:3000/api/fleet/site-summary" "LAB-SS$site"
  expect_site "$lab_prefix-ems$site" 'http://10.0.0.15:3000/api/fleet/site-summary' "LAB-SS$site"
  expect_blocked "$lab_prefix-ss$site" "http://$other:3000/api/fleet/site-summary"
  echo "PASS site $site: own duplicate-address EMS, site listener, Fleet summary and cross-site block"
done
expect_blocked "$lab_prefix-fleet" 'http://10.0.0.3:8080/identity'
# Even if forwarding is accidentally enabled, the Fleet lab firewall must drop it.
ip netns exec "$lab_prefix-fleet" sysctl -q -w net.ipv4.ip_forward=1
expect_blocked "$lab_prefix-ss3" 'http://172.31.250.6:3000/api/fleet/site-summary'
expect_blocked "$lab_prefix-ss4" 'http://172.31.250.2:3000/api/fleet/site-summary'
lab_drop_rules=$(ip netns exec "$lab_prefix-fleet" nft -j list chain inet prizm_lab forward)
node -e 'const r=JSON.parse(process.argv[1]).nftables; if(!r.some(x=>x.rule?.expr?.some(e=>e.counter?.packets>0)))process.exit(1)' "$lab_drop_rules"
ip netns exec "$lab_prefix-fleet" sysctl -q -w net.ipv4.ip_forward=0
echo 'PASS Fleet has no device-network route; explicit cross-site routes remain blocked with forwarding enabled'
echo 'Synthetic namespace test complete. This is not TLS, real PRIZM load, reboot or production validation.'
