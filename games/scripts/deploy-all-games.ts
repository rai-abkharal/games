import fs from 'fs';
import path from 'path';
import { deployGame } from '../../backend/scripts/deploy-game';

const GAME_DIRS = [
  '01-tap-cannon',
  '02-color-match',
  '03-stack-tower',
  '04-lane-dodge',
  '05-memory-flip',
  '06-fruit-catch',
  '07-tiny-archer',
  '08-pipe-connect',
  '09-one-tap-runner',
  '10-merge-dots',
];

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

  console.log(
    `🚀 Deploying all 10 mini-games (${force ? 'development force mode' : 'immutable mode'})...\n`,
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
