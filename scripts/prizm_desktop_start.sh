#!/usr/bin/env bash
set -euo pipefail

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
url=http://127.0.0.1:3000
ems_host=${PRIZM_EMS_HOST:-10.0.0.3}
state_dir=${XDG_STATE_HOME:-$HOME/.local/state}/greenergy-prizm
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p "$state_dir"

ready() {
  local response
  response=$(curl --silent --fail --max-time "${1:-8}" "$url") || return 1
  [[ $response == *'<title>GreEnergy PRIZM</title>'* ]]
}

listening_pid() {
  command -v lsof >/dev/null || return 1
  lsof -nP -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null | head -1
}

prizm_owns_port() {
  local pid=$1
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep -Fxq "n$app_dir"
}

ems_reachable() {
  local attempt
  for attempt in 1 2 3; do
    if [[ $(uname -s) == Darwin ]]; then
      ping -n -c 1 -W 1000 "$ems_host" >/dev/null 2>&1 && return 0
    else
      ping -n -c 1 -W 1 "$ems_host" >/dev/null 2>&1 && return 0
    fi
  done
  return 1
}

show_status() {
  local message=$1
  echo "$message"
  if [[ $(uname -s) == Darwin ]] && command -v osascript >/dev/null; then
    osascript -e 'on run argv' -e 'display dialog (item 1 of argv) with title "PRIZM Launcher" buttons {"Open Dashboard"} default button 1 giving up after 12' -e 'end run' "$message" >/dev/null 2>&1 || true
  elif command -v notify-send >/dev/null; then
    notify-send 'PRIZM Launcher' "$message" >/dev/null 2>&1 || true
  fi
}

die() {
  local message=$1
  echo "$message" >&2
  if [[ $(uname -s) == Darwin ]] && command -v osascript >/dev/null; then
    osascript -e 'on run argv' -e 'display alert "PRIZM Launcher" message (item 1 of argv)' -e 'end run' "$message" >/dev/null 2>&1 || true
  fi
  exit 1
}

launch_result='PRIZM was already running'
if ! ready; then
  pid=$(listening_pid || true)
  if [[ -n $pid ]]; then
    if prizm_owns_port "$pid"; then
      launch_result='PRIZM is already running (HTTP response is slow)'
    else
      die "Port 3000 is occupied by another process. No PRIZM server was started."
    fi
  else
    launch_result='PRIZM started'
    if [[ ! -f $app_dir/dist/server.cjs || ! -d $app_dir/node_modules ]]; then
      die "PRIZM is not built. Install dependencies and run npm run build first."
    fi
    if [[ $(uname -s) == Linux ]] && command -v systemctl >/dev/null && systemctl is-enabled --quiet prizm.service 2>/dev/null; then
      systemctl start prizm.service || {
        die "PRIZM service could not start. Check: journalctl -u prizm -n 50"
      }
    else
      if ! command -v node >/dev/null; then
        die "Node.js is not on PATH."
      fi
      cd "$app_dir"
      nohup "$(command -v node)" "$app_dir/start-production.cjs" >> "$state_dir/server.log" 2>&1 < /dev/null &
      echo $! > "$state_dir/server.pid"
    fi
    for ((attempt=0; attempt<20; attempt++)); do
      ready 3 && break
      sleep 1
    done
  fi
fi

if [[ $launch_result == 'PRIZM started' ]] && ! ready 5; then
  if prizm_owns_port "$(listening_pid || true)"; then
    launch_result='PRIZM started (HTTP response is slow)'
  else
    die "PRIZM did not become ready at $url. Check $state_dir/server.log or service logs."
  fi
fi

if ems_reachable; then
  show_status "$launch_result; EMS $ems_host is reachable."
else
  show_status "$launch_result; EMS $ems_host did not answer three pings (or ping is unavailable). PRIZM remains available."
fi

if [[ $(uname -s) == Darwin ]]; then
  open "$url"
else
  xdg-open "$url" >/dev/null 2>&1
fi
