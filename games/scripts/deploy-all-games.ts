import fs from 'fs';
import path from 'path';
import { deployGame } from '../../backend/scripts/deploy-game';

function getGameDirectories(): string[] {
  const gamesRoot = path.resolve(__dirname, '..');
  return fs.readdirSync(gamesRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && fs.existsSync(path.join(gamesRoot, dirent.name, 'manifest.json')))
    .map(dirent => dirent.name)
    .sort();
}

async function deployAll() {
  const force = process.argv.includes('--force');
  const repoDir = path.resolve(__dirname, '../..');
  const publicDir = path.join(repoDir, 'backend', 'public');
  const backendCatalog = path.join(repoDir, 'backend', 'catalog', 'games.json');
  const bundledCatalog = path.join(
    repoDir,
    'frontend',
    'assets',
    'catalog',
    'games.json',
  );

  const GAME_DIRS = getGameDirectories();
  console.log(
    `🚀 Deploying all ${GAME_DIRS.length} mini-games (${force ? 'development force mode' : 'immutable mode'})...\n`,
  );

  // Read deleted games blacklist
  const deletedGamesPath = path.join(path.dirname(backendCatalog), 'deleted_games.json');
  let deletedList: string[] = [];
  if (fs.existsSync(deletedGamesPath)) {
    try { deletedList = JSON.parse(fs.readFileSync(deletedGamesPath, 'utf8')); } catch {}
  }

  for (const dirName of GAME_DIRS) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    const manifestPath = path.join(gameDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (deletedList.includes(m.id)) {
          console.log(`🚫 Skipping blacklisted deleted game: ${m.title || m.id} (${m.id})`);
          continue;
        }
      } catch {}
    }

    deployGame({
      gameDir,
      force,
      publicDir,
      catalogPath: backendCatalog,
    });
  }

  // Scan and preserve any dynamically uploaded games from Admin Dashboard
  const publishedGamesDir = path.join(publicDir, 'games');
  if (fs.existsSync(publishedGamesDir)) {
    let catalogObj: any = { version: 1, updatedAt: new Date().toISOString(), games: [] };
    if (fs.existsSync(backendCatalog)) {
      try { catalogObj = JSON.parse(fs.readFileSync(backendCatalog, 'utf8')); } catch {}
    }

    // Filter out any blacklisted games from the catalog
    catalogObj.games = (catalogObj.games || []).filter((g: any) => !deletedList.includes(g.id));

    const publishedFolders = fs.readdirSync(publishedGamesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const pGameId of publishedFolders) {
      if (deletedList.includes(pGameId)) {
        // Clean up blacklisted game files on disk
        const deadDir = path.join(publishedGamesDir, pGameId);
        if (fs.existsSync(deadDir)) fs.rmSync(deadDir, { recursive: true, force: true });
        continue;
      }

      const pGameDir = path.join(publishedGamesDir, pGameId);
      const versions = fs.readdirSync(pGameDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();

      if (versions.length > 0) {
        const latestVer = versions[versions.length - 1];
        const manifestPath = path.join(pGameDir, latestVer, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const exists = catalogObj.games.some((g: any) => g.id === (m.id || pGameId));
            if (!exists) {
              console.log(`📦 Preserving & Re-registering Admin-Uploaded Game: ${m.title || pGameId} (${pGameId} v${latestVer})`);
              catalogObj.games.push({
                id: m.id || pGameId,
                title: m.title || pGameId,
                version: latestVer,
                entryUrl: `http://localhost:8080/games/${pGameId}/${latestVer}/index.html`,
                thumbnailUrl: `http://localhost:8080/thumbnails/${pGameId}.webp`,
                sizeBytes: 15000,
                orientation: m.orientation || 'portrait',
                engine: m.engine || 'canvas2d',
                manifestUrl: `http://localhost:8080/games/${pGameId}/${latestVer}/manifest.json`,
                feedOrder: catalogObj.games.length + 1,
                category: m.category || 'Arcade',
                description: m.description || '',
                touchZones: m.touchZones || [],
                features: { sound: true, vibration: true }
              });
            }
          } catch {}
        }
      }
    }
    fs.writeFileSync(backendCatalog, JSON.stringify(catalogObj, null, 2));
  }

  fs.mkdirSync(path.dirname(bundledCatalog), { recursive: true });
  fs.copyFileSync(backendCatalog, bundledCatalog);

  console.log('\n🎉 Deployed all games and synchronized the bundled catalog.');
}

deployAll().catch((error) => {
  console.error(`❌ Deployment failed: ${(error as Error).message}`);
  process.exit(1);
});
