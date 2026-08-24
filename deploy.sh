#!/bin/bash
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /var/www/udupi-civic-watch
echo "==> Pulling latest from GitHub..."
git pull origin main
echo "==> Installing dependencies..."
pnpm install
echo "==> Building api-server..."
pnpm --filter @workspace/api-server run build
echo "==> Building cleanspot..."
PORT=18338 BASE_PATH=/ pnpm --filter @workspace/cleanspot run build
echo "==> Restarting api-server..."
pm2 restart udupi-civic-api
echo "==> Done. Deployed commit:"
git log -1 --oneline
