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
  console.log('🚀 Deploying all 10 mini-games into Backend CDN static storage...\n');

  for (const dirName of GAME_DIRS) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    deployGame({
      gameDir,
      force: true,
      publicDir: path.resolve(__dirname, '../../backend/public'),
      catalogPath: path.resolve(__dirname, '../../backend/catalog/games.json'),
    });
  }

  console.log('\n🎉 Successfully deployed all 10 mini-games to local CDN and updated catalog!');
}

deployAll();
