#!/bin/bash
set -euo pipefail

# Mini-Games Platform 1-Click Server Update & Deployment Script
PROJECT_DIR="/var/www/games-platform"
CONFIG_FILE="${GAMES_ENV_FILE:-/etc/games-admin.env}"
if [ -f "$CONFIG_FILE" ]; then
  set -a
  source "$CONFIG_FILE"
  set +a
fi
export PATH="${GAMES_NODE_BIN:-/opt/games-node/bin}:$PATH"
export NODE_ENV=production

echo "======================================================="
echo "🎮 Mini-Games Platform Auto-Deploy & Build Script"
echo "======================================================="

cd "$PROJECT_DIR"

# Security state must survive Git resets and release replacement. Configure these
# in the service environment, not in a tracked file. Do not deploy an open fallback.
: "${ADMIN_ORIGIN:?Set the Admin origin}"
: "${PREVIEW_ORIGIN:?Set the separate preview origin}"
: "${ADMIN_SECURITY_DB:?Set the persistent Admin SQLite path outside the checkout}"
if [ "${ADMIN_RESET_EMAIL_ENABLED:-true}" != "false" ]; then
  : "${SMTP_URL:?Set the password-reset SMTP transport}"
  : "${ADMIN_MAIL_FROM:?Set the reset email sender}"
fi
case "$ADMIN_SECURITY_DB" in "$PROJECT_DIR"/*) echo "Admin database must be outside the checkout"; exit 1;; esac
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<24 || (major===24 && minor<9))throw Error("Games deployment requires Node 24.9+")'

echo ""
echo "🛡️ [0/5] Backing up live catalog & Admin Uploaded Games..."
mkdir -p /tmp/games_platform_backup
if [ -f "$PROJECT_DIR/backend/catalog/games.json" ]; then
  cp "$PROJECT_DIR/backend/catalog/games.json" /tmp/games_platform_backup/games.json
fi

echo ""
echo "🧹 [0.5/5] Cleaning local build files to prevent Git conflicts..."
git diff --quiet && git diff --cached --quiet || { echo "Commit or preserve tracked changes before deploying"; exit 1; }
git checkout main

echo ""
echo "🚀 [1/5] Pulling latest code from Git..."
git pull --ff-only origin main

echo ""
echo "📦 [2/5] Installing Backend dependencies..."
cd "$PROJECT_DIR/backend"
npm ci --include=dev

echo ""
echo "🎮 [3/5] Compiling and Deploying all Mini-Games to CDN..."
if [ "${1:-}" != "--admin-only" ]; then
cd "$PROJECT_DIR/games"
npm install
mkdir -p "$PROJECT_DIR/backend/public/shared"
cp "$PROJECT_DIR/games/node_modules/phaser/dist/phaser-arcade-physics.min.js" "$PROJECT_DIR/backend/public/shared/phaser.min.js" 2>/dev/null || true
npm run build:all
npx tsx scripts/deploy-all-games.ts --force

if [ -f /tmp/games_platform_backup/games.json ]; then
  node -e "
    const fs = require('fs');
    const curPath = '$PROJECT_DIR/backend/catalog/games.json';
    const bakPath = '/tmp/games_platform_backup/games.json';
    const delPath = '$PROJECT_DIR/backend/catalog/deleted_games.json';
    try {
      const cur = JSON.parse(fs.readFileSync(curPath, 'utf8'));
      const bak = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
      let deletedList = [];
      if (fs.existsSync(delPath)) {
        try { deletedList = JSON.parse(fs.readFileSync(delPath, 'utf8')); } catch {}
      }
      // Unblacklist any games that exist in current build/git
      (cur.games || []).forEach(cg => {
        if (deletedList.includes(cg.id)) {
          console.log('✨ Unblacklisting recreated game from deleted_games.json:', cg.id);
          deletedList = deletedList.filter(id => id !== cg.id);
        }
      });
      if (fs.existsSync(delPath)) {
        fs.writeFileSync(delPath, JSON.stringify(deletedList, null, 2), 'utf8');
      }

      // 1. Find newly published games (present in cur from git/build, but not yet in live backup)
      const newGames = (cur.games || []).filter(cg => !bak.games.some(bg => bg.id === cg.id) && !deletedList.includes(cg.id));

      // 2. Start from existing live backup games (preserves exact custom admin ordering!)
      let finalGames = (bak.games || []).filter(bg => !deletedList.includes(bg.id));

      // 3. Update existing games with fresh assets, version, hashes from build
      finalGames = finalGames.map(bg => {
        const matchingCur = (cur.games || []).find(cg => cg.id === bg.id);
        if (matchingCur) {
          return {
            ...bg,
            version: matchingCur.version || bg.version,
            entryUrl: matchingCur.entryUrl || bg.entryUrl,
            manifestUrl: matchingCur.manifestUrl || bg.manifestUrl,
            sizeBytes: matchingCur.sizeBytes || bg.sizeBytes,
            features: matchingCur.features || bg.features
          };
        }
        return bg;
      });

      // 4. If any brand new game was published, place it at the VERY TOP (position 1)
      if (newGames.length > 0) {
        console.log('✨ Placing newly published game(s) at position #1:', newGames.map(g => g.title).join(', '));
        finalGames = [...newGames, ...finalGames];
      }

      // 5. Normalize sequential feedOrder (1, 2, 3, 4...)
      finalGames.forEach((g, idx) => {
        g.feedOrder = idx + 1;
      });

      cur.games = finalGames;
      cur.updatedAt = new Date().toISOString();
      fs.writeFileSync(curPath, JSON.stringify(cur, null, 2));

      // Also sync to frontend bundled catalog
      const bundledPath = '$PROJECT_DIR/frontend/assets/catalog/games.json';
      if (fs.existsSync(bundledPath)) {
        fs.writeFileSync(bundledPath, JSON.stringify(cur, null, 2));
      }
      console.log('✅ Live Admin order preserved & new games placed at #1 successfully!');
    } catch(e) {
      console.error('Catalog merge error:', e);
    }
  "
fi

fi # optional games deployment

echo ""
echo "🖥️ [3.5/5] Building Admin Dashboard..."
if [ -d "$PROJECT_DIR/admin" ]; then
  cd "$PROJECT_DIR/admin"
  npm ci --include=dev
  npm run build
fi

echo ""
echo "🔨 [4/5] Building Backend TypeScript to Production JS..."
cd "$PROJECT_DIR/backend"
npm run build
NODE_ENV=production npm run security:migrate

echo ""
echo "⚡ [5/5] Reloading PM2 Service (mini-games-backend)..."
if pm2 describe mini-games-backend >/dev/null 2>&1; then
  pm2 restart mini-games-backend --interpreter "$(command -v node)" --update-env
else
  pm2 start dist/src/server.js --name "mini-games-backend" --interpreter "$(command -v node)"
fi
pm2 save

echo ""
echo "======================================================="
echo "🎉 DEPLOYMENT COMPLETE! Server is running live."
echo "📡 Catalog: http://localhost:3000/api/games"
echo "======================================================="
