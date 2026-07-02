#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${PRIZM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BRANCH="${1:-${PRIZM_BRANCH:-$(git -C "$APP_DIR" branch --show-current 2>/dev/null || true)}}"
REMOTE="${PRIZM_REMOTE:-origin}"
PORT="${PRIZM_PORT:-3000}"
PID_FILE="$APP_DIR/prizm_mac_runtime.pid"
LOG_FILE="$APP_DIR/prizm_mac_runtime.log"

if [[ -z "$BRANCH" ]]; then
  echo "Unable to determine branch. Usage: ./refresh_prizm_branch.sh <branch-name>" >&2
  exit 1
fi

echo "============================================"
echo " PRIZM branch refresh"
echo " Repo:   $APP_DIR"
echo " Branch: $BRANCH"
echo " Remote: $REMOTE"
echo " Port:   $PORT"
echo "============================================"

cd "$APP_DIR"

echo "[1/7] Stopping existing PRIZM process..."
if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]]; then
    kill "$old_pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
fi

echo "[2/7] Fetching remote refs..."
git fetch "$REMOTE"

echo "[3/7] Checking out branch without forcing main..."
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "$REMOTE/$BRANCH"
fi

echo "[4/7] Updating branch from $REMOTE/$BRANCH..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Local changes detected. Stashing before branch update."
  git stash push -u -m "prizm-branch-refresh-auto-stash-$(date +%Y%m%d_%H%M%S)" >/dev/null
fi
git reset --hard "$REMOTE/$BRANCH"

echo "[5/7] Installing dependencies if needed..."
if [[ ! -d node_modules ]]; then
  npm install
fi

echo "[6/7] Building production bundle..."
npm run build

echo "[7/7] Starting PRIZM..."
node start-production.cjs > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 2
if command -v lsof >/dev/null 2>&1; then
  lsof -i tcp:"$PORT" || true
fi

echo ""
echo "Started PRIZM on branch $BRANCH"
echo "PID: $(cat "$PID_FILE")"
echo "Log: $LOG_FILE"
echo "URL: http://localhost:$PORT"
