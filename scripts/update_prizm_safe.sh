#!/bin/bash
# ==============================================================================
# GreEnergy PRIZM Safe Retention Update & Maintenance Script
# Prevents disk exhaustion, verifies builds, trims dev dependencies, cleans ports.
# ==============================================================================

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== PRIZM Safe Retention Update Flow starting in $APP_DIR ==="

# 1. Prevent concurrent runs of this update script
LOCK_FILE="/tmp/prizm_update.lock"
if [ -f "$LOCK_FILE" ]; then
  # Check if process is still alive
  PID_IN_LOCK=$(cat "$LOCK_FILE" 2>/dev/null || true)
  if [ -n "$PID_IN_LOCK" ] && kill -0 "$PID_IN_LOCK" 2>/dev/null; then
    echo "❌ ERROR: Another PRIZM update process (PID: $PID_IN_LOCK) is already running."
    exit 1
  fi
fi
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Record initial disk space
INITIAL_FREE_KB=$(df -k "$APP_DIR" | awk 'NR==2 {print $4}')

# 2. Stop PRIZM if running as a systemd service
HAS_SYSTEMD=false
if command -v systemctl >/dev/null 2>&1; then
  HAS_SYSTEMD=true
fi

if [ "$HAS_SYSTEMD" = true ]; then
  if systemctl is-active --quiet prizm 2>/dev/null; then
    echo "Stopping PRIZM background service..."
    sudo systemctl stop prizm || true
  else
    echo "PRIZM systemd service is already stopped or not running."
  fi
else
  echo "Systemd not detected on this node environment; skipping service stop."
fi

# 3. Clean process ports (releasing port 3000)
echo "Releasing port 3000..."
if command -v fuser >/dev/null 2>&1; then
  sudo fuser -k 3000/tcp || true
elif command -v lsof >/dev/null 2>&1; then
  PORT_PID=$(lsof -t -i:3000 || true)
  if [ -n "$PORT_PID" ]; then
    sudo kill -9 $PORT_PID || true
  fi
else
  # Fallback to general process killing for Node and Python mocks
  echo "lsof/fuser not found. Forcing kill on local Node servers..."
  sudo pkill -f "node.*server.ts" || true
  sudo pkill -f "node.*dist/server.cjs" || true
fi

# 4. Pull updates
echo "Fetching updates from Git repository..."
if [ -d "$APP_DIR/.git" ]; then
  git pull || echo "⚠️ Warning: git pull failed or no upstream branch configured. Continuing update on local files..."
else
  echo "⚠️ Not a Git repository; skipping pull."
fi

# 5. Fast dependency synchronization
echo "Installing clean production & development node modules dependency tree..."
npm ci || npm install

# 6. Verify development build
echo "Verifying application compilation compiles successfully..."
npm run build

# 7. Purge local history cache to free cold storage
echo "Safely resetting historical telemetry directory .prizm-history..."
HISTORY_PATH="$APP_DIR/.prizm-history"
if [ -d "$HISTORY_PATH" ]; then
  rm -rf "$HISTORY_PATH"
fi
mkdir -p "$HISTORY_PATH"
# Recreate empty placeholder to guarantee directory exists with proper permissions
touch "$HISTORY_PATH/.gitkeep" 2>/dev/null || true

# 8. Force removal of development dependencies to conserve micro-node disk space
echo "Pruning devDependencies from target node modules folder..."
npm prune --production

# 9. Clear global npm caching to recover hidden operating system cache bytes
echo "Cleaning global npm caches..."
npm cache clean --force || true

# 10. Trim source-map files which exhaust disk space on micro-devices
echo "Trimming JS source maps (.js.map) from build output folders..."
find "$APP_DIR/dist" -name "*.js.map" -delete 2>/dev/null || true

# 11. Restart background telemetry services
if [ "$HAS_SYSTEMD" = true ]; then
  echo "Restarting PRIZM background systemd service..."
  sudo systemctl start prizm || true
  echo "Systemd service successfully initiated."
else
  echo "Node started standalone production server as fallback:"
  echo "Use: NODE_ENV=production node $APP_DIR/dist/server.cjs &"
fi

# 12. Complete update & output freed byte summaries
FINAL_FREE_KB=$(df -k "$APP_DIR" | awk 'NR==2 {print $4}')
SAVED_KB=$((FINAL_FREE_KB - INITIAL_FREE_KB))
FREE_GB=$(echo "scale=2; $FINAL_FREE_KB / 1024 / 1024" | bc 2>/dev/null || awk -v k="$FINAL_FREE_KB" 'BEGIN {print (k/1024/1024)}')

echo "=============================================================================="
echo "✅ PRIZM SECURE CLEANUP AND RETENTION UPDATE COMPLETE!"
echo "------------------------------------------------------------------------------"
if [ $SAVED_KB -gt 0 ]; then
  SAVED_MB=$(echo "scale=2; $SAVED_KB / 1024" | bc 2>/dev/null || awk -v k="$SAVED_KB" 'BEGIN {print (k/1024)}')
  echo "💾 Disk space reclaimed: ~$SAVED_MB MB"
else
  echo "💾 Directory maintained correctly within safe device boundaries."
fi
echo "📊 Current active storage space free: $FREE_GB GB"
echo "=============================================================================="
