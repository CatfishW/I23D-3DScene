#!/bin/bash
# Restart the Unified 3D Backend Server (I23D + FlashWorld + UniRig)
# Usage: ./restart_backend.sh [--no-flashworld]
#
# This script:
#   1. Stops any existing unified_server / api_server processes
#   2. Cleans up stale temp files
#   3. Starts the server in a screen session (detached)

set -e

BACKEND_DIR="/data/Yanlai/image-to-3d-web/backend"
CONDA_ENV="unified-3d"
SERVER_PORT=23555
SCREEN_NAME="i23d-backend"
EXTRA_ARGS="$@"

echo "=== Stopping existing backend services ==="

# Kill existing unified_server processes
PIDS=$(ps aux | grep "[u]nified_server.py" | awk '{print $2}')
if [ -n "$PIDS" ]; then
    echo "Killing server PIDs: $PIDS"
    kill $PIDS 2>/dev/null || true
    sleep 2
    # Force kill if still running
    PIDS=$(ps aux | grep "[u]nified_server.py" | awk '{print $2}')
    if [ -n "$PIDS" ]; then
        kill -9 $PIDS 2>/dev/null || true
    fi
else
    echo "No existing server found."
fi

# Kill any stale FlashWorld subprocess
FW_PIDS=$(ps aux | grep "[f]lashworld_server" | awk '{print $2}')
if [ -n "$FW_PIDS" ]; then
    echo "Killing FlashWorld PIDs: $FW_PIDS"
    kill $FW_PIDS 2>/dev/null || true
fi

# Kill stale run_unirig_complete processes
UNIRIG_PIDS=$(ps aux | grep "[r]un_unirig_complete" | awk '{print $2}')
if [ -n "$UNIRIG_PIDS" ]; then
    echo "Killing stale UniRig PIDs: $UNIRIG_PIDS"
    kill $UNIRIG_PIDS 2>/dev/null || true
fi

# Kill any existing UniRig server processes
pkill -f unirig_server.py || true

sleep 1
echo "All services stopped."

# Clean up temp files
echo "=== Cleaning up temp files ==="
rm -f "$BACKEND_DIR/temp.glb" "$BACKEND_DIR/mr_combined.png" 2>/dev/null
rm -rf /tmp/unirig_npz_* 2>/dev/null
echo "Cleanup done."

mkdir -p ~/.screen
chmod 700 ~/.screen
export SCREENDIR=~/.screen

# Kill existing screen session if present
screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true

echo "=== Starting backend server ==="
echo "  Conda env: $CONDA_ENV"
echo "  Port:      $SERVER_PORT"
echo "  Screen:    $SCREEN_NAME"
echo "  Extra:     $EXTRA_ARGS"

# Start in a detached screen session
screen -dmS "$SCREEN_NAME" bash -c "
    source ~/anaconda3/etc/profile.d/conda.sh
    conda activate $CONDA_ENV
    cd $BACKEND_DIR
    echo 'Starting Unified 3D Backend on port $SERVER_PORT...'
    python unified_server.py --port $SERVER_PORT $EXTRA_ARGS 2>&1 | tee /tmp/i23d-backend.log
"

echo ""
echo "=== Backend started in screen session '$SCREEN_NAME' ==="
echo ""
echo "Useful commands:"
echo "  Attach to logs:   screen -r $SCREEN_NAME"
echo "  Detach from logs:  Ctrl+A, then D"
echo "  View log file:     tail -f /tmp/i23d-backend.log"
echo "  Stop server:       screen -S $SCREEN_NAME -X quit"
echo ""

# Wait a moment and check if it started
sleep 3
if screen -list | grep -q "$SCREEN_NAME"; then
    echo "✅ Server is running."
else
    echo "❌ Server failed to start. Check /tmp/i23d-backend.log"
    exit 1
fi
