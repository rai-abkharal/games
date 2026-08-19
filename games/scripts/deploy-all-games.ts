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

  for (const dirName of GAME_DIRS) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    deployGame({
      gameDir,
      force,
      publicDir,
      catalogPath: backendCatalog,
    });
  }

  fs.mkdirSync(path.dirname(bundledCatalog), { recursive: true });
  fs.copyFileSync(backendCatalog, bundledCatalog);

  console.log('\n🎉 Deployed all games and synchronized the bundled Flutter catalog.');
}

deployAll().catch((error) => {
  console.error(`❌ Deployment failed: ${(error as Error).message}`);
  process.exit(1);
});
