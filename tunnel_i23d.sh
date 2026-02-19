#!/bin/bash
# Reverse SSH Tunnel Maintainer (Ubuntu)

REMOTE_USER="lobin"
REMOTE_HOST="vpn.agaii.org"
REMOTE_PORT=23555
LOCAL_PORT=23555
RECONNECT_DELAY=5

echo "=== LLM Server Reverse SSH Tunnel ==="
echo "Forwarding: $REMOTE_HOST:$REMOTE_PORT -> 127.0.0.1:$LOCAL_PORT"

# Check local server
curl -s --max-time 2 http://127.0.0.1:$LOCAL_PORT/health >/dev/null 2>&1 || \
    echo "[WARN] Local server not responding on port $LOCAL_PORT"

# Main loop
ATTEMPT=0
while true; do
    ((ATTEMPT++))
    echo "[$(date +%H:%M:%S)] Starting tunnel (attempt #$ATTEMPT)..."
    
    ssh -R $REMOTE_PORT:127.0.0.1:$LOCAL_PORT \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -o StrictHostKeyChecking=no \
        -N $REMOTE_USER@$REMOTE_HOST
    
    [[ $? -eq 0 ]] && break
    echo "[WARN] Disconnected. Reconnecting in ${RECONNECT_DELAY}s..."
    sleep $RECONNECT_DELAY
done

