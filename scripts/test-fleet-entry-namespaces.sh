#!/usr/bin/env bash
# Disposable synthetic HTTPS lab. Never touches physical ports or host firewall.
set -Eeuo pipefail
[[ ${1:-} == --run-isolated-entry-lab && $(uname -s) == Linux && $EUID == 0 ]] || { echo 'Usage: sudo bash scripts/test-fleet-entry-namespaces.sh --run-isolated-entry-lab'; exit 2; }
for tool in ip nft node curl openssl timeout sysctl; do command -v "$tool" >/dev/null; done
lab_root=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$lab_root"
[[ -f dist/fleet-server.cjs && -f dist/fleet-entry.cjs ]] || { echo 'Build Fleet first'; exit 2; }
umask 077
lab_dir=$(mktemp -d /tmp/prizm-entry-lab-XXXXXXXX)
lab_prefix="prizm-entry-$$"
lab_names=() lab_pids=()
lab_addresses=$(ip -br addr)
lab_routes=$(ip -4 route show table all)
lab_v6_routes=$(ip -6 route show table all)
lab_firewall=$(nft -s list ruleset)
lab_forward=$(sysctl -n net.ipv4.ip_forward net.ipv6.conf.all.forwarding)
cleanup() {
  local result=$? pid ns
  trap - EXIT INT TERM
  for pid in "${lab_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for ns in "${lab_names[@]}"; do
    for pid in $(ip netns pids "$ns"); do kill "$pid" 2>/dev/null || true; done
  done
  for pid in "${lab_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  for ns in "${lab_names[@]}"; do ip netns delete "$ns" || result=1; done
  [[ $(ip -br addr) == "$lab_addresses" ]] || result=1
  [[ $(ip -4 route show table all) == "$lab_routes" ]] || result=1
  [[ $(ip -6 route show table all) == "$lab_v6_routes" ]] || result=1
  [[ $(nft -s list ruleset) == "$lab_firewall" ]] || result=1
  [[ $(sysctl -n net.ipv4.ip_forward net.ipv6.conf.all.forwarding) == "$lab_forward" ]] || result=1
  echo "Private synthetic lab output: $lab_dir"
  if (( result == 0 )); then echo 'PASS cleanup: host interfaces, routes, forwarding and firewall unchanged';
  else echo 'FAIL/interrupted: inspect lab logs and cleanup' >&2; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=prizm-entry-lab \
  -addext 'subjectAltName=IP:10.0.0.15,IP:172.31.250.2,IP:172.31.250.6' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -keyout "$lab_dir/key.pem" -out "$lab_dir/cert.pem" >"$lab_dir/openssl.log" 2>&1
node --import tsx scripts/fleet-entry-lab-fixture.ts prepare "$lab_dir"
for suffix in ss3 ss4 client3 client4 fleet; do
  ns="$lab_prefix-$suffix"
  ip netns add "$ns"; lab_names+=("$ns")
  ip -n "$ns" link set lo up
  ip netns exec "$ns" sysctl -q -w net.ipv4.ip_forward=0 net.ipv6.conf.all.forwarding=0 net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1
done
for n in 3 4; do
  ns="$lab_prefix-ss$n"; client="$lab_prefix-client$n"
  if [[ $n == 3 ]]; then hub=172.31.250.1; collector=172.31.250.2; other=172.31.250.6;
  else hub=172.31.250.5; collector=172.31.250.6; other=172.31.250.2; fi
  ip -n "$ns" link add site0 type veth peer name client0 netns "$client"
  ip -n "$ns" addr add 10.0.0.15/16 dev site0
  ip -n "$client" addr add 10.0.0.62/16 dev client0
  ip -n "$ns" link set site0 up; ip -n "$client" link set client0 up
  ip -n "$ns" link add fleet0 type veth peer name "ss$n" netns "$lab_prefix-fleet"
  ip -n "$ns" addr add "$collector/30" dev fleet0
  ip -n "$lab_prefix-fleet" addr add "$hub/30" dev "ss$n"
  ip -n "$ns" link set fleet0 up; ip -n "$lab_prefix-fleet" link set "ss$n" up
  ip -n "$ns" route add "$other/32" via "$hub"
  ip netns exec "$ns" nft -f - <<RULES
table inet prizm_entry_lab {
 chain input { type filter hook input priority 0; policy drop;
   iifname "lo" accept
   ct state established,related accept
   iifname "site0" ip saddr 10.0.0.0/16 tcp dport 3443 accept
   iifname "fleet0" ip saddr $hub tcp dport 9443 accept
 }
 chain forward { type filter hook forward priority 0; policy drop; counter drop; }
}
RULES
  ip netns exec "$ns" timeout 55s node --import tsx scripts/fleet-entry-lab-fixture.ts collector "$lab_dir" "$n" >"$lab_dir/collector-$n.log" 2>&1 & lab_pids+=("$!")
  ip netns exec "$ns" env PRIZM_FLEET_ENTRY_CONFIG="$lab_dir/entry-$n.json" timeout 55s node dist/fleet-entry.cjs >"$lab_dir/entry-$n.log" 2>&1 & lab_pids+=("$!")
done
ip netns exec "$lab_prefix-fleet" nft -f - <<'RULES'
table inet prizm_entry_lab {
 chain input { type filter hook input priority 0; policy drop;
   iifname "lo" accept
   ct state established,related accept
   iifname "ss3" ip saddr 172.31.250.2 tcp dport 3443 accept
   iifname "ss4" ip saddr 172.31.250.6 tcp dport 3443 accept
 }
 chain forward { type filter hook forward priority 0; policy drop; counter drop; }
}
RULES
ip netns exec "$lab_prefix-fleet" env PRIZM_FLEET_CONFIG="$lab_dir/fleet.json" NODE_EXTRA_CA_CERTS="$lab_dir/cert.pem" timeout 55s node dist/fleet-server.cjs >"$lab_dir/fleet.log" 2>&1 & lab_pids+=("$!")
request() { ip netns exec "$1" curl --noproxy '*' --cacert "$lab_dir/cert.pem" --connect-timeout 1 --max-time 3 -sS "${@:2}"; }
for n in 3 4; do
  client="$lab_prefix-client$n"
  ready=false
  for attempt in {1..20}; do
    if [[ $(request "$client" -o /dev/null -w '%{http_code}' https://10.0.0.15:3443/api/fleet/summary 2>/dev/null) == 401 ]]; then ready=true; break; fi
    sleep 0.2
  done
  [[ $ready == true ]] || { echo "Entry $n failed to start"; exit 1; }
  [[ $(request "$client" -o /dev/null -w '%{http_code}' -c "$lab_dir/cookie-$n" -H 'Origin: https://10.0.0.15:3443' -H 'Content-Type: application/json' --data-binary "@$lab_dir/login.json" https://10.0.0.15:3443/api/fleet/login) == 200 ]]
  ready=false
  for attempt in {1..20}; do
    request "$client" -b "$lab_dir/cookie-$n" https://10.0.0.15:3443/api/fleet/summary >"$lab_dir/summary-$n.json"
    if node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));if(j.sites?.length!==2||j.totals?.powerKw?.value!==1970||j.sites.some(s=>s.status!=="current"))process.exit(1)' "$lab_dir/summary-$n.json"; then ready=true; break; fi
    sleep 0.3
  done
  [[ $ready == true ]] || { echo "Entry $n did not receive both site summaries"; exit 1; }
  [[ $(request "$client" -o /dev/null -w '%{http_code}' -b "$lab_dir/cookie-$n" -X POST https://10.0.0.15:3443/api/ems/control) == 403 ]]
  [[ $(request "$client" -o /dev/null -w '%{http_code}' -H 'Host: wrong.example' https://10.0.0.15:3443/api/fleet/summary) == 403 ]]
  echo "PASS isolated LAN $n: same Fleet IP, verified TLS, login, both summaries, denied controls and wrong host"
done
[[ $(request "$lab_prefix-client4" -o /dev/null -w '%{http_code}' -b "$lab_dir/cookie-3" https://10.0.0.15:3443/api/fleet/session) == 200 ]]
expect_blocked() { if request "$1" "$2" >/dev/null 2>&1; then echo 'FAIL cross-site connectivity' >&2; exit 1; fi; }
ip netns exec "$lab_prefix-fleet" sysctl -q -w net.ipv4.ip_forward=1
expect_blocked "$lab_prefix-ss3" https://172.31.250.6:9443/api/fleet/site-summary
expect_blocked "$lab_prefix-ss4" https://172.31.250.2:9443/api/fleet/site-summary
lab_drops=$(ip netns exec "$lab_prefix-fleet" nft -j list chain inet prizm_entry_lab forward)
node -e 'const r=JSON.parse(process.argv[1]).nftables;if(!r.some(x=>x.rule?.expr?.some(e=>e.counter?.packets>0)))process.exit(1)' "$lab_drops"
echo 'PASS shared Fleet session and cross-site forward drops with forwarding enabled in lab'
echo 'Synthetic HTTPS entry validation complete; not real-collector load or physical-port cutover validation.'
