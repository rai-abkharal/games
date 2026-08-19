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

function getGameDirectories(): string[] {
  const gamesRoot = path.resolve(__dirname, '..');
  return fs.readdirSync(gamesRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && fs.existsSync(path.join(gamesRoot, dirent.name, 'manifest.json')))
    .map(dirent => dirent.name)
    .sort();
}

async function buildAll() {
  const GAME_DIRS = getGameDirectories();
  console.log(`🚀 Starting compilation of all ${GAME_DIRS.length} Mini-Games...\n`);
  const sharedDir = path.resolve(__dirname, '../shared');

  for (const dirName of GAME_DIRS) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    const srcMain = path.join(gameDir, 'src', 'main.ts');
    const rootIndex = path.join(gameDir, 'index.html');
    const distDir = path.join(gameDir, 'dist');
    const distIndex = path.join(distDir, 'index.html');

    console.log(`🔨 Building ${dirName}...`);

    try {
      if (!fs.existsSync(srcMain) && fs.existsSync(rootIndex)) {
        // Pure single-file Micro-Engine game
        fs.mkdirSync(distDir, { recursive: true });
        fs.copyFileSync(rootIndex, distIndex);
        const packageBytes = fs.statSync(distIndex).size;
        console.log(`✅ ${dirName}: ${(packageBytes / 1024).toFixed(1)} KB standalone micro-engine package\n`);
        continue;
      }

      await build({
        root: gameDir,
        base: './',
        resolve: {
          alias: [
            { find: 'phaser', replacement: path.resolve(__dirname, '../node_modules/phaser/dist/phaser-arcade-physics.min.js') },
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
          outDir: distDir,
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
