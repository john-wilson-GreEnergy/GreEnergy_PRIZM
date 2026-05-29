#!/bin/bash
set -e

echo "==================================================="
echo "  GreEnergy PRIZM BESS - Live Monitoring System"
echo "==================================================="
echo

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed on this system!"
    echo "Please run \"./install.sh\" first to provision the environment."
    echo
    exit 1
fi

# 2. Auto Build if compiled site bundle is missing
if [ ! -f "dist/server.cjs" ]; then
    echo "[INFO] Production build not found. Compiling application..."
    if [ ! -d "node_modules" ]; then
        echo "[INFO] Restoring Node packages..."
        npm install
    fi
    npm run build
fi

# 3. Launch browser automatically in background
echo "[INFO] Launching client dashboard in 3 seconds..."
if command -v xdg-open &> /dev/null; then
    (sleep 3 && xdg-open http://localhost:3000) &
elif command -v open &> /dev/null; then
    (sleep 3 && open http://localhost:3000) &
fi

# 4. Start Production Server
echo "[SUCCESS] Telemetry server initialized at http://localhost:3000"
echo "[INFO] Press Ctrl+C in this terminal window to stop the server safely."
echo "---------------------------------------------------"
npm run start
