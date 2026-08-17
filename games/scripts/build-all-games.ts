import path from 'path';
import fs from 'fs';
import { build } from 'vite';

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

async function buildAll() {
  console.log('🚀 Starting compilation of all 10 Mini-Games...\n');
  const sharedDir = path.resolve(__dirname, '../shared');

  for (const dirName of GAME_DIRS) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    console.log(`🔨 Building ${dirName}...`);

    try {
      await build({
        root: gameDir,
        base: './',
        resolve: {
          alias: [
            { find: '../../shared', replacement: sharedDir },
            { find: '../shared', replacement: sharedDir },
            { find: '@shared', replacement: sharedDir },
          ],
        },
        server: {
          fs: {
            allow: [path.resolve(__dirname, '..')],
          },
        },
        build: {
          outDir: path.join(gameDir, 'dist'),
          emptyOutDir: true,
          minify: 'esbuild',
          target: 'es2020',
        },
        logLevel: 'warn',
      });

      // Verify dist exists
      const distIndex = path.join(gameDir, 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        console.log(`✅ Successfully built ${dirName} -> ${path.join(gameDir, 'dist')}\n`);
      } else {
        throw new Error(`Build finished but dist/index.html is missing for ${dirName}`);
      }
    } catch (err) {
      console.error(`❌ Failed building ${dirName}:`, err);
      process.exit(1);
    }
  }

  console.log('🎉 All 10 Mini-Games successfully built!');
}

buildAll();
