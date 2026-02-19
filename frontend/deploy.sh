#!/bin/bash
set -e

REMOTE_USER="lobin"
REMOTE_HOST="vpn.agaii.org"
REMOTE_DIR="/home/luobin/Yanlai/I23D"
LOCAL_FRONTEND="/data/Yanlai/image-to-3d-web/frontend"

echo "=== Building Frontend ==="
cd $LOCAL_FRONTEND
npm run build

echo "=== Creating Remote Directory ==="
ssh $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

echo "=== Cleaning and Building ==="
cd $LOCAL_FRONTEND
rm -rf .next .next_output

# Ensure production API URL is set
echo "NEXT_PUBLIC_API_URL=/I23D/api" > .env.production

npm run build

echo "=== Deploying to Remote Server (with cache clear) ==="
ssh $REMOTE_USER@$REMOTE_HOST "rm -rf $REMOTE_DIR/_next"
rsync -avz --progress \
    --exclude='.next/cache' \
    --exclude='node_modules' \
    --exclude='.git' \
    $LOCAL_FRONTEND/.next/ \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/_next/

echo "=== Deploying Static Files ==="
rsync -avz --progress \
    --exclude='.next/cache' \
    --exclude='node_modules' \
    --exclude='.git' \
    $LOCAL_FRONTEND/public/ \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/public/ 2>/dev/null || true

echo "=== Deploying HTML Files ==="
rsync -avz --progress \
    $LOCAL_FRONTEND/.next/server/app/*.html \
    $LOCAL_FRONTEND/.next/server/app/*.meta \
    $LOCAL_FRONTEND/.next/server/app/*.rsc \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

echo "=== Deploying 404 Page ==="
rsync -avz --progress \
    $LOCAL_FRONTEND/.next/server/pages/404.html \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/ 2>/dev/null || true

echo "=== Checking Nginx Config ==="
ssh $REMOTE_USER@$REMOTE_HOST "grep -q 'location /I23D/' /www/server/panel/vhost/nginx/mc.agaii.org.conf && echo 'Nginx config OK' || echo 'Warning: I23D not found in nginx config'"

echo "=== Deployment Complete ==="
echo "Frontend deployed to: $REMOTE_DIR"
echo "Next.js static files deployed to: $REMOTE_DIR/_next/"
