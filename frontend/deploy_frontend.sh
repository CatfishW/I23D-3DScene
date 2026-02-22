#!/bin/bash
set -e

REMOTE_USER="lobin"
REMOTE_HOST="vpn.agaii.org"
REMOTE_DIR="/home/luobin/Yanlai/I23D"
LOCAL_FRONTEND="/data/Yanlai/image-to-3d-web/frontend"

echo "=== Setting Production Environment ==="
cd $LOCAL_FRONTEND

# Ensure production API URLs are set
cat > .env.production << 'EOF'
NEXT_PUBLIC_API_URL=/I23D/api
NEXT_PUBLIC_FLASHWORLD_API_URL=/I23D/api/flashworld
EOF

echo "=== Building Frontend (Static Export) ==="
rm -rf .next out
npm run build

echo "=== Verifying build output ==="
if [ ! -d "$LOCAL_FRONTEND/out" ]; then
    echo "ERROR: out/ directory not found. Build may have failed."
    exit 1
fi
ls -la $LOCAL_FRONTEND/out/

echo "=== Creating Remote Directory ==="
ssh $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

echo "=== Deploying static export to Remote Server ==="
# Deploy the entire out/ directory contents
# This includes index.html, _next/, flashworld.html, etc.
rsync -avz --delete --progress \
    --exclude='.git' \
    $LOCAL_FRONTEND/out/ \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

echo "=== Checking Nginx Config ==="
ssh $REMOTE_USER@$REMOTE_HOST "grep -q 'location /I23D/' /www/server/panel/vhost/nginx/mc.agaii.org.conf && echo 'Nginx config OK' || echo 'Warning: I23D not found in nginx config'"

echo "=== Deployment Complete ==="
echo "Frontend deployed to: $REMOTE_DIR"
echo ""
echo "URLs:"
echo "  Main:       https://mc.agaii.org/I23D/"
echo "  FlashWorld: https://mc.agaii.org/I23D/flashworld"
echo ""
echo "APIs:"
echo "  I23D:       https://mc.agaii.org/I23D/api/"
echo "  FlashWorld: https://mc.agaii.org/I23D/api/flashworld/"
