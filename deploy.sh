#!/bin/bash
set -e

# Mini-Games Platform 1-Click Server Update & Deployment Script
PROJECT_DIR="/var/www/games-platform"

echo "======================================================="
echo "🎮 Mini-Games Platform Auto-Deploy & Build Script"
echo "======================================================="

cd "$PROJECT_DIR"

echo ""
echo "🧹 [0/5] Cleaning local build files to prevent Git conflicts..."
git checkout -f main || true
git reset --hard origin/main || git reset --hard HEAD || true

echo ""
echo "🚀 [1/5] Pulling latest code from Git..."
git pull origin main

echo ""
echo "📦 [2/5] Installing Backend dependencies..."
cd "$PROJECT_DIR/backend"
npm install

echo ""
echo "🎮 [3/5] Compiling and Deploying all Mini-Games to CDN..."
cd "$PROJECT_DIR/games"
npm install
npm run build:all
npx tsx scripts/deploy-all-games.ts --force

echo ""
echo "🖥️ [3.5/5] Building Admin Dashboard..."
if [ -d "$PROJECT_DIR/admin" ]; then
  cd "$PROJECT_DIR/admin"
  npm install
  npx vite build || npm run build || true
fi

echo ""
echo "🔨 [4/5] Building Backend TypeScript to Production JS..."
cd "$PROJECT_DIR/backend"
npm run build

echo ""
echo "⚡ [5/5] Reloading PM2 Service (mini-games-backend)..."
pm2 reload mini-games-backend || pm2 restart mini-games-backend || pm2 start dist/src/server.js --name "mini-games-backend"
pm2 save

echo ""
echo "======================================================="
echo "🎉 DEPLOYMENT COMPLETE! Server is running live."
echo "📡 Catalog: http://localhost:3000/api/games"
echo "======================================================="
