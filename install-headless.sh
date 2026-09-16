#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: ./install-headless.sh [--offline] [--reinstall-deps]'
  echo 'Run as a non-root sudo user on Ubuntu Server 22.04 or 24.04.'
  echo '--offline requires Node.js, npm, and cached or installed dependencies.'
}

offline=false
reinstall_deps=false
for argument in "$@"; do
  case "$argument" in
    --offline) offline=true ;;
    --reinstall-deps) reinstall_deps=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; echo "Unknown option: $argument" >&2; exit 2 ;;
  esac
done

if [[ $(uname -s) != Linux ]] || ! command -v systemctl >/dev/null || [[ ! -d /run/systemd/system ]]; then
  echo 'This installer requires Linux booted with systemd.' >&2
  exit 1
fi
if [[ $EUID -eq 0 ]]; then
  echo 'Run as a non-root account with sudo access.' >&2
  exit 1
fi
if ! command -v sudo >/dev/null; then
  echo 'sudo is required; add this account to the sudo group first.' >&2
  exit 1
fi

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
run_user=$(id -un)
if [[ ! -f $app_dir/package.json || ! -f $app_dir/package-lock.json ]]; then
  echo "Missing PRIZM package.json or package-lock.json in $app_dir." >&2
  exit 1
fi
if systemctl is-active --quiet prizm.service 2>/dev/null; then
  echo 'PRIZM is already running; refusing to rebuild a live service.' >&2
  exit 1
fi
if [[ ! -w $app_dir ]]; then
  echo "The deployment account cannot write $app_dir." >&2
  exit 1
fi
for data_dir in "$app_dir/data" "$app_dir/.prizm-data"; do
  if [[ -d $data_dir && ! -w $data_dir ]]; then
    echo "The deployment account cannot write $data_dir." >&2
    exit 1
  fi
done

sudo -v
if [[ $offline != true && -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ ${ID:-} == ubuntu && ( ${VERSION_ID:-} == 22.04 || ${VERSION_ID:-} == 24.04 ) ]]; then
    echo 'Installing PRIZM system dependencies (including sshpass and OpenSSH)...'
    sudo apt-get update
    sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y \
      ca-certificates curl gnupg build-essential python3 \
      openssh-client sshpass iputils-ping coreutils util-linux \
      gawk sed grep findutils rsync git
  fi
fi
node_major=0
if command -v node >/dev/null && command -v npm >/dev/null; then
  node_major=$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)
fi
if (( node_major < 20 )); then
  if [[ $offline == true ]]; then
    echo 'Node.js 20+ and npm must already be installed for --offline.' >&2
    exit 1
  fi
  if [[ ! -r /etc/os-release ]]; then
    echo 'Cannot identify this Linux release: /etc/os-release is missing.' >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ ${ID:-} != ubuntu || ( ${VERSION_ID:-} != 22.04 && ${VERSION_ID:-} != 24.04 ) ]]; then
    echo "Detected ${PRETTY_NAME:-${ID:-unknown} ${VERSION_ID:-unknown}}; automatic Node.js installation supports Ubuntu 22.04 and 24.04." >&2
    exit 1
  fi
  architecture=$(dpkg --print-architecture)
  if [[ $architecture != amd64 && $architecture != arm64 ]]; then
    echo "Unsupported architecture: $architecture (expected amd64 or arm64)." >&2
    exit 1
  fi
  echo 'Installing Node.js 24 LTS...'
  key_tmp=$(mktemp)
  trap 'rm -f "$key_tmp"' EXIT
  curl --fail --silent --show-error --location https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --batch --yes --dearmor --output "$key_tmp"
  sudo install -m 0644 "$key_tmp" /usr/share/keyrings/prizm-nodesource.gpg
  printf 'deb [arch=%s signed-by=/usr/share/keyrings/prizm-nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main\n' "$architecture" | sudo tee /etc/apt/sources.list.d/prizm-nodesource.list >/dev/null
  sudo apt-get update
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Node.js or npm is still missing after prerequisite installation.' >&2
  exit 1
fi
for executable in sshpass ssh ping curl timeout setsid; do
  if ! command -v "$executable" >/dev/null; then
    echo "Missing $executable. Install PRIZM system dependencies before continuing (or omit --offline on Ubuntu)." >&2
    exit 1
  fi
done
node_bin=$(realpath "$(command -v node)")
node_major=$("$node_bin" -p 'Number(process.versions.node.split(".")[0])')
if (( node_major < 20 )); then
  echo "Node.js 20+ is required; found $("$node_bin" --version)." >&2
  exit 1
fi

port=3000
if [[ -f $app_dir/.env ]]; then
  port_setting=$(sed -n '/^PORT=/p' "$app_dir/.env" | head -1)
  if [[ -n $port_setting ]]; then port=${port_setting#PORT=}; fi
fi
if [[ ! $port =~ ^[0-9]+$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo 'PORT in .env must be a bare number from 1 to 65535.' >&2
  exit 1
fi

cd "$app_dir"
echo "Installing PRIZM as $run_user with Node $("$node_bin" --version)..."
if [[ $reinstall_deps == true || ! -d node_modules ]] || ! npm ls --depth=0 --silent >/dev/null 2>&1; then
  if [[ $offline == true ]]; then npm ci --offline; else npm ci; fi
fi
npm run build
test -s "$app_dir/dist/server.cjs"
sudo env PRIZM_RUN_USER="$run_user" PRIZM_NODE_BIN="$node_bin" bash "$app_dir/scripts/install_prizm_service.sh"

echo "Waiting for PRIZM on localhost:$port..."
for ((attempt=1; attempt<=30; attempt++)); do
  if "$node_bin" -e 'fetch(`http://127.0.0.1:${process.argv[1]}/`, {signal: AbortSignal.timeout(3000)}).then(async r => {if (!r.ok || !(await r.text()).includes("<title>GreEnergy PRIZM</title>")) process.exitCode=1}).catch(() => {process.exitCode=1})' "$port"; then
    echo "PRIZM is ready at http://127.0.0.1:$port and enabled at boot."
    echo 'Status: sudo systemctl status prizm'
    echo 'Logs: sudo journalctl -u prizm -f'
    exit 0
  fi
  sleep 2
done
echo 'The service was installed but did not become HTTP-ready. Check: sudo journalctl -u prizm -n 100 --no-pager' >&2
exit 1
