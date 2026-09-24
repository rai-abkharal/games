const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND_GAMES = path.join(ROOT, 'backend/public/games');
const BACKEND_THUMBS = path.join(ROOT, 'backend/public/thumbnails');
const ASSETS_DEST = path.join(ROOT, 'react-apk/android/app/src/main/assets/bundled-games');
const CONFIG_DEST = path.join(ROOT, 'react-apk/src/config/bundledGames.ts');

const BUNDLED_GAMES_METADATA = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scratch/twenty_bundled_games.json'), 'utf8')
);

// Target display order:
// 1. Arrow Flow (game-mudsy3a8)
// 2. Car Circle (game-mucbfekb)
// 3. Knife Hit (knife-hit)
// 4. Color Maze (maze-paint)
// 6. Food Hunt (game-mtvj5sds)
// 7. Number Drop (number-drop)
// 8. Cute Snake (snake-classic)
// 9. Gun Simulator (gun-simulator)
// 10. Ludo (ludo-race)
// 11. Fruit Merge (fruit-merge)
// 12. Bubble Shooter (bubble-shooter)
// 13. Passenger Parking (game-mu51zff4)
// 14. Deadzone 40 (deadzone-40)
// 15. Dots and Boxes (dots-and-boxes)
// 16. Take Off Bolt (takeoff-bolts)
// 17. 4 in a Row (four-in-a-row)
// 18. Ball Breaker (ball-breaker)
// 19. Sudoku (sudoku-pro)
// 20. Color Match (color-match)

const TARGET_ORDER = [
  { id: 'game-mudsy3a8', title: 'Arrow Flow' },
  { id: 'game-mucbfekb', title: 'Car Circle' },
  { id: 'knife-hit', title: 'Knife Hit' },
  { id: 'maze-paint', title: 'Color Maze' },
  { id: 'game-mtvj5sds', title: 'Food Hunt' },
  { id: 'number-drop', title: 'Number Drop' },
  { id: 'snake-classic', title: 'Cute Snake' },
  { id: 'gun-simulator', title: 'Gun Simulator' },
  { id: 'ludo-race', title: 'Ludo' },
  { id: 'fruit-merge', title: 'Fruit Merge' },
  { id: 'bubble-shooter', title: 'Bubble Shooter' },
  { id: 'game-mu51zff4', title: 'Passenger Parking' },
  { id: 'deadzone-40', title: 'Deadzone 40' },
  { id: 'dots-and-boxes', title: 'Dots and Boxes' },
  { id: 'takeoff-bolts', title: 'Take Off Bolt' },
  { id: 'four-in-a-row', title: '4 in a Row' },
  { id: 'ball-breaker', title: 'Ball Breaker' },
  { id: 'sudoku-pro', title: 'Sudoku' },
  { id: 'color-match', title: 'Color Match' },
];

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  for (const element of fs.readdirSync(from)) {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

function listRelativeFiles(dir, prefix = '') {
  let results = [];
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    const rel = prefix ? `${prefix}/${file}` : file;
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(listRelativeFiles(full, rel));
    } else {
      results.push(rel.replace(/\\/g, '/'));
    }
  }
  return results;
}

function computeDirSize(dir) {
  let size = 0;
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      size += computeDirSize(full);
    } else {
      size += stat.size;
    }
  }
  return size;
}

console.log('--- Starting Native Games Bundling ---');
// Validate all inputs before replacing generated APK assets.
if (path.resolve(ASSETS_DEST) !== path.join(ROOT, 'react-apk/android/app/src/main/assets/bundled-games')) {
  throw new Error('Unexpected generated assets directory');
}
for (const target of TARGET_ORDER) {
  const meta = BUNDLED_GAMES_METADATA.find(g => g.id === target.id);
  if (!meta || !fs.existsSync(path.join(BACKEND_GAMES, meta.id, meta.version, 'index.html'))) {
    throw new Error(`Missing source for ${target.id}; generated assets left untouched`);
  }
}
if (fs.existsSync(ASSETS_DEST)) {
  fs.rmSync(ASSETS_DEST, { recursive: true, force: true });
}
fs.mkdirSync(ASSETS_DEST, { recursive: true });

const manifestItems = [];
const bundledGameItems = [];

for (let i = 0; i < TARGET_ORDER.length; i++) {
  const target = TARGET_ORDER[i];
  const meta = BUNDLED_GAMES_METADATA.find(g => g.id === target.id);
  if (!meta) {
    throw new Error(`Metadata not found for ${target.id} (${target.title})`);
  }

  const srcDir = path.join(BACKEND_GAMES, meta.id, meta.version);
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Game source folder not found at ${srcDir}`);
  }

  const gameDest = path.join(ASSETS_DEST, meta.id);
  console.log(`[${i + 1}/${TARGET_ORDER.length}] Bundling ${target.title} (${meta.id} v${meta.version})...`);
  copyFolderSync(srcDir, gameDest);

  const files = listRelativeFiles(gameDest);
  const totalBytes = computeDirSize(gameDest);

  manifestItems.push({
    gameId: meta.id,
    version: meta.version,
    buildId: meta.buildId,
    entry: 'index.html',
    bytes: totalBytes,
    feedOrder: i,
    files,
  });

  // Construct client GameItem
  const clientGame = {
    id: meta.id,
    title: target.title,
    sourceTitle: meta.sourceTitle || target.title,
    version: meta.version,
    entryUrl: `http://127.0.0.1:42731/${meta.id}/${meta.buildId}/index.html`,
    thumbnailUrl: meta.thumbnailUrl,
    sizeBytes: totalBytes,
    orientation: meta.orientation || 'portrait',
    engine: meta.engine || 'canvas',
    manifestUrl: `http://127.0.0.1:42731/${meta.id}/${meta.buildId}/manifest.json`,
    feedOrder: i,
    category: meta.category || 'Arcade',
    description: meta.description || '',
    buildId: meta.buildId,
    bundleBytes: totalBytes,
    sha256: meta.sha256 || '',
    controls: meta.controls || ['TAP'],
    tags: meta.tags || ['arcade', 'offline', 'native'],
    ageRating: meta.ageRating || 'everyone',
    status: 'published',
    features: meta.features || { sound: true, vibration: true, hint: false },
    touchZones: meta.touchZones || [],
  };

  bundledGameItems.push(clientGame);
}

// Write Android asset manifest.json
const manifestPath = path.join(ASSETS_DEST, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifestItems, null, 2), 'utf8');
console.log(`Wrote Android bundled manifest to ${manifestPath}`);

// Write React Native config
const configCode = `// Generated automatically by bundle-native-games.cjs - DO NOT EDIT MANUALLY
import type { GameItem } from '../types/game';

export const BUNDLED_GAMES: GameItem[] = ${JSON.stringify(bundledGameItems, null, 2)};

export const BUNDLED_GAME_IDS: Set<string> = new Set(
  BUNDLED_GAMES.map(g => g.id),
);

export function isBundledGame(gameId: string): boolean {
  return BUNDLED_GAME_IDS.has(gameId);
}
`;

fs.writeFileSync(CONFIG_DEST, configCode, 'utf8');
console.log(`Wrote React Native bundled games config to ${CONFIG_DEST}`);
console.log('--- Native Games Bundling Completed Successfully! ---');
