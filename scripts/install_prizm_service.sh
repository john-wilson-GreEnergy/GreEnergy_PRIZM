#!/usr/bin/env bash
set -euo pipefail

if [[ $(uname -s) != Linux ]] || ! command -v systemctl >/dev/null; then
  echo "This installer requires Linux with systemd." >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run: sudo bash scripts/install_prizm_service.sh" >&2
  exit 1
fi

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
run_user=${PRIZM_RUN_USER:-${SUDO_USER:-}}
if [[ -z $run_user || $run_user == root ]]; then
  echo "Set PRIZM_RUN_USER to the non-root account that owns this deployment." >&2
  exit 1
fi
run_group=$(id -gn "$run_user")
node_bin=${PRIZM_NODE_BIN:-$(command -v node || true)}
if [[ -z $node_bin || ! -x $node_bin ]]; then
  echo "Node.js must be installed before enabling the service." >&2
  exit 1
fi
node_bin=$(realpath "$node_bin")
if [[ $app_dir == *[[:space:]]* || $node_bin == *[[:space:]]* ]]; then
  echo "The PRIZM service path and Node.js path cannot contain whitespace." >&2
  exit 1
fi
if [[ ! -f $app_dir/dist/server.cjs ]]; then
  echo "Production bundle missing. Build first with: npm run build" >&2
  exit 1
fi
if [[ ! -d $app_dir/node_modules ]]; then
  echo "Runtime dependencies missing. Install them before enabling the service." >&2
  exit 1
fi

service_file=/etc/systemd/system/prizm.service
if [[ -e $service_file ]]; then
  cp -p "$service_file" "${service_file}.backup.$(date +%Y%m%d%H%M%S)"
fi
cat > "$service_file" <<EOF
[Unit]
Description=GreEnergy PRIZM Runtime
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$run_user
Group=$run_group
WorkingDirectory=$app_dir
Environment=NODE_ENV=production
EnvironmentFile=-$app_dir/.env
ExecStart=$node_bin $app_dir/start-production.cjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemd-analyze verify "$service_file"
systemctl daemon-reload
systemctl enable prizm.service
systemctl restart prizm.service
systemctl --no-pager status prizm.service
echo "PRIZM is enabled at boot. Logs: journalctl -u prizm -f"
