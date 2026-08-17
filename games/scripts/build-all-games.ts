import path from 'path';
import fs from 'fs';
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const MAX_GAME_PACKAGE_BYTES = 5 * 1024 * 1024;

function listFilesRecursive(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

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
        plugins: [viteSingleFile()],
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
          assetsInlineLimit: Number.POSITIVE_INFINITY,
          cssCodeSplit: false,
          reportCompressedSize: true,
        },
        logLevel: 'warn',
      });

      // Enforce the MVP package contract: one deterministic HTML artifact.
      const distDir = path.join(gameDir, 'dist');
      const distIndex = path.join(distDir, 'index.html');
      const outputFiles = listFilesRecursive(distDir);
      if (!fs.existsSync(distIndex)) {
        throw new Error(`Build finished but dist/index.html is missing for ${dirName}`);
      }
      if (outputFiles.length !== 1 || outputFiles[0] !== distIndex) {
        throw new Error(
          `${dirName} emitted external files. Import or inline every runtime asset, ` +
          `or migrate the delivery contract to a signed archive manifest.`,
        );
      }

      const packageBytes = fs.statSync(distIndex).size;
      if (packageBytes > MAX_GAME_PACKAGE_BYTES) {
        throw new Error(
          `${dirName} package is ${(packageBytes / 1024 / 1024).toFixed(2)} MB; ` +
          `the MVP budget is ${MAX_GAME_PACKAGE_BYTES / 1024 / 1024} MB.`,
        );
      }

      console.log(
        `✅ ${dirName}: ${(packageBytes / 1024 / 1024).toFixed(2)} MB single-file package\n`,
      );
    } catch (err) {
      console.error(`❌ Failed building ${dirName}:`, err);
      process.exit(1);
    }
  }

  console.log('🎉 All 10 Mini-Games successfully built!');
}

buildAll();
